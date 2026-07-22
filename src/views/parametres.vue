<script setup>
import { ref, onMounted, computed } from "vue"
import { useRouter } from "vue-router"
import { toast } from "vue3-toastify"
import { useAuthStore } from "../stores/useAuthStore"

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore"

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage"
import { firebaseApp } from "../components/firebaseConfig"
import { PARIS_FRET_ENTREPRISE_ID } from "../appConfig"

const store = useAuthStore()
const router = useRouter()
const db = getFirestore()
const storage = getStorage()

const entrepriseId = computed(() =>
  store.entreprise?.id || store.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const entrepriseForm = ref({
  nom: "",
  raisonSociale: "",
  siret: "",
  email: "",
  tel: "",
  prenom: "",
  nomResponsable: "",
  typeCompte: "professionnel",

  adresse: "",
  numeroRue: "",
  rue: "",
  codePostal: "",
  ville: "",
  pays: "France",

  codeParrainage: "",
  subscriptionStatus: "active",
  plan: "free",

  logoUrl: ""
})

const logoPreview = ref(null)
const selectedLogoFile = ref(null)
const uploading = ref(false)
const loading = ref(false)
const deletingEntreprise = ref(false)
const confirmDeleteText = ref("")

const employes = ref([])
const invitations = ref([])
const emailInvitation = ref("")

const collectionsToDelete = [
  "customers",
  "enlevements",
  "chargements",
  "destinations",
  "invitations",
  "messages"
]

const DELETE_ENTREPRISE_URL =
  `https://us-central1-${firebaseApp.options.projectId}.cloudfunctions.net/deleteEntreprise`

async function getAuthHeaders() {
  const token = await store.getCurrentUser()?.getIdToken()

  if (!token) {
    throw new Error("Utilisateur non connecté")
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }
}

async function fetchEntrepriseData() {
  if (!entrepriseId.value) return

  const snap = await getDoc(doc(db, "entreprises", entrepriseId.value))

  if (snap.exists()) {
    const data = snap.data()

    entrepriseForm.value = {
      ...entrepriseForm.value,
      ...data,
      nomResponsable: data.nomResponsable || data.lastName || "",
      prenom: data.prenom || data.firstName || "",
      raisonSociale: data.raisonSociale || data.nom || "",
      typeCompte: data.typeCompte || "professionnel",
      pays: data.pays || "France"
    }

    logoPreview.value = entrepriseForm.value.logoUrl || null
  }
}

function handleLogoChange(e) {
  const file = e.target.files[0]
  if (!file) return

  if (!file.type.startsWith("image/")) {
    toast("Veuillez choisir une image valide", { type: "warning", autoClose: 1500 })
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    toast("Logo trop lourd. Maximum 2 Mo", { type: "warning", autoClose: 1500 })
    return
  }

  selectedLogoFile.value = file
  logoPreview.value = URL.createObjectURL(file)
}

function buildFullAddress() {
  const parts = [
    entrepriseForm.value.numeroRue,
    entrepriseForm.value.rue,
    entrepriseForm.value.codePostal,
    entrepriseForm.value.ville,
    entrepriseForm.value.pays
  ].filter(Boolean)

  return parts.join(", ")
}

async function updateEntreprise() {
  if (!entrepriseId.value) {
    toast("Entreprise introuvable", { type: "error", autoClose: 1500 })
    return
  }

  uploading.value = true

  try {
    let logoURL = entrepriseForm.value.logoUrl

    if (selectedLogoFile.value) {
      const fileExtension = selectedLogoFile.value.name.split(".").pop()
      const logoRef = storageRef(
        storage,
        `entreprises/${entrepriseId.value}/logo.${fileExtension}`
      )

      await uploadBytes(logoRef, selectedLogoFile.value)
      logoURL = await getDownloadURL(logoRef)
    }

    const updatedData = {
      nom: entrepriseForm.value.nom,
      raisonSociale: entrepriseForm.value.raisonSociale,
      siret: entrepriseForm.value.siret,
      email: entrepriseForm.value.email,
      tel: entrepriseForm.value.tel,

      prenom: entrepriseForm.value.prenom,
      nomResponsable: entrepriseForm.value.nomResponsable,
      typeCompte: "professionnel",

      numeroRue: entrepriseForm.value.numeroRue,
      rue: entrepriseForm.value.rue,
      codePostal: entrepriseForm.value.codePostal,
      ville: entrepriseForm.value.ville,
      pays: entrepriseForm.value.pays,
      adresse: buildFullAddress(),

      codeParrainage: entrepriseForm.value.codeParrainage,

      logoUrl: logoURL,
      updatedAt: serverTimestamp()
    }

    await store.updateEntreprise(updatedData)

    entrepriseForm.value.logoUrl = logoURL
    entrepriseForm.value.adresse = updatedData.adresse
    logoPreview.value = logoURL
    selectedLogoFile.value = null

    toast("Entreprise mise à jour ✅", { type: "success", autoClose: 1200 })
  } catch (err) {
    console.error(err)
    const message = err?.code === "storage/unauthorized"
      ? "Accès au stockage refusé. Déployez les règles Firebase Storage."
      : "Erreur lors de la mise à jour"
    toast(message, { type: "error", autoClose: 2500 })
  } finally {
    uploading.value = false
  }
}

async function fetchEmployes() {
  if (!entrepriseId.value) return

  const q = query(
    collection(db, "users"),
    where("entrepriseId", "==", entrepriseId.value)
  )

  const querySnap = await getDocs(q)

  employes.value = querySnap.docs.map(document => ({
    id: document.id,
    ...document.data()
  }))
}

async function fetchInvitations() {
  if (!entrepriseId.value) return

  const q = query(
    collection(db, "invitations"),
    where("entrepriseId", "==", entrepriseId.value),
    where("status", "==", "pending")
  )

  const querySnap = await getDocs(q)

  invitations.value = querySnap.docs.map(document => ({
    id: document.id,
    ...document.data()
  }))
}

async function inviterEmploye() {
  const email = emailInvitation.value.trim().toLowerCase()

  if (!email) {
    toast("Email requis", { type: "warning", autoClose: 1500 })
    return
  }

  if (!entrepriseId.value) {
    toast("Entreprise introuvable", { type: "error", autoClose: 1500 })
    return
  }

  loading.value = true

  try {
    await addDoc(collection(db, "invitations"), {
      email,
      entrepriseId: entrepriseId.value,
      role: "user",
      status: "pending",
      invitedBy: store.getCurrentUser()?.uid || null,
      createdAt: serverTimestamp()
    })

    toast("Invitation créée 🚀", { type: "success", autoClose: 1200 })

    emailInvitation.value = ""
    await fetchInvitations()
  } catch (err) {
    console.error(err)
    toast("Erreur lors de l'invitation", { type: "error", autoClose: 1500 })
  } finally {
    loading.value = false
  }
}

async function deleteDocsByEntreprise(collectionName) {
  const q = query(
    collection(db, collectionName),
    where("entrepriseId", "==", entrepriseId.value)
  )

  const snap = await getDocs(q)

  if (snap.empty) return 0

  let deleted = 0
  let batch = writeBatch(db)
  let count = 0

  for (const document of snap.docs) {
    batch.delete(document.ref)
    deleted++
    count++

    if (count === 450) {
      await batch.commit()
      batch = writeBatch(db)
      count = 0
    }
  }

  if (count > 0) {
    await batch.commit()
  }

  return deleted
}

async function deleteEntrepriseLogo() {
  if (!entrepriseForm.value.logoUrl) return

  try {
    const logoRef = storageRef(storage, entrepriseForm.value.logoUrl)
    await deleteObject(logoRef)
  } catch (error) {
    console.warn("Logo non supprimé ou introuvable:", error.message)
  }
}

async function deleteEntrepriseCompletement() {
  if (!entrepriseId.value) {
    toast("Entreprise introuvable", { type: "error", autoClose: 1500 })
    return
  }

  if (confirmDeleteText.value !== "SUPPRIMER") {
    toast("Tape SUPPRIMER pour confirmer", { type: "warning", autoClose: 1800 })
    return
  }

  deletingEntreprise.value = true

  try {
    const response = await fetch(DELETE_ENTREPRISE_URL, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        entrepriseId: entrepriseId.value
      })
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Erreur suppression entreprise")
    }

    toast("Entreprise supprimée définitivement", {
      type: "success",
      autoClose: 1500
    })

    await store.logout()
    router.push("/login")
  } catch (error) {
    console.error(error)
    toast("Erreur lors de la suppression de l'entreprise", {
      type: "error",
      autoClose: 2000
    })
  } finally {
    deletingEntreprise.value = false
  }
}

onMounted(async () => {
  await fetchEntrepriseData()
  await fetchEmployes()
  await fetchInvitations()
})
</script>

<template>
  <section class="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
    <div class="mx-auto max-w-5xl">
      <div class="mb-8">
        <p class="text-sm font-medium text-primary">Paramètres</p>
        <h2 class="text-2xl font-bold text-slate-900 md:text-3xl">
          Paramètres de l'entreprise
        </h2>
        <p class="mt-1 text-sm text-slate-500">
          Gérez les informations et le logo de Paris Fret Transport.
        </p>
      </div>

      <form
        @submit.prevent="updateEntreprise"
        class="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:p-6"
      >
        <div class="mb-6">
          <h3 class="text-lg font-bold text-slate-900">
            Informations professionnelles
          </h3>
          <p class="text-sm text-slate-500">
            Ces informations sont utilisées sur vos documents.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <select
            v-model="entrepriseForm.typeCompte"
            disabled
            class="select select-bordered w-full rounded-2xl"
          >
            <option value="professionnel">Professionnel</option>
          </select>

          <input
            v-model="entrepriseForm.nom"
            placeholder="Nom commercial"
            class="input input-bordered w-full rounded-2xl"
          />

          <input
            v-model="entrepriseForm.raisonSociale"
            placeholder="Raison sociale"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />

          <input
            v-model="entrepriseForm.siret"
            placeholder="SIRET"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />

          <input
            v-model="entrepriseForm.prenom"
            placeholder="Prénom responsable"
            class="input input-bordered w-full rounded-2xl"
          />

          <input
            v-model="entrepriseForm.nomResponsable"
            placeholder="Nom responsable"
            class="input input-bordered w-full rounded-2xl"
          />

          <input
            v-model="entrepriseForm.email"
            type="email"
            placeholder="Email"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />

          <input
            v-model="entrepriseForm.tel"
            placeholder="Téléphone"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />
        </div>

        <div class="mt-8">
          <h3 class="text-lg font-bold text-slate-900">
            Adresse de l'expéditeur
          </h3>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-6">
          <input
            v-model="entrepriseForm.numeroRue"
            placeholder="N°"
            class="input input-bordered w-full rounded-2xl md:col-span-1"
          />

          <input
            v-model="entrepriseForm.rue"
            placeholder="Adresse Rue, Av, Bld..."
            class="input input-bordered w-full rounded-2xl md:col-span-5"
          />

          <input
            v-model="entrepriseForm.codePostal"
            placeholder="Code postal"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />

          <input
            v-model="entrepriseForm.ville"
            placeholder="Ville"
            class="input input-bordered w-full rounded-2xl md:col-span-2"
          />

          <select
            v-model="entrepriseForm.pays"
            class="select select-bordered w-full rounded-2xl md:col-span-2"
          >
            <option>France</option>
            <option>Cameroun</option>
            <option>Togo</option>
            <option>Côte d'Ivoire</option>
            <option>Bénin</option>
            <option>Sénégal</option>
            <option>Mali</option>
            <option>Belgique</option>
          </select>
        </div>

        <div class="mt-8">
          <h3 class="text-lg font-bold text-slate-900">
            Références internes
          </h3>
        </div>

        <div class="mt-4">
          <input
            v-model="entrepriseForm.codeParrainage"
            placeholder="Code interne"
            class="input input-bordered w-full rounded-2xl"
          />
        </div>

        <div class="mt-8 md:col-span-2">
          <label class="mb-2 block text-sm font-semibold text-slate-700">
            Logo
          </label>

          <div class="flex flex-col gap-4 md:flex-row md:items-center">
            <div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              <img
                v-if="logoPreview"
                :src="logoPreview"
                class="h-full w-full object-contain"
                alt="Logo preview"
              />
              <span v-else class="text-xs text-slate-400">Logo</span>
            </div>

            <div class="flex-1">
              <input
                type="file"
                @change="handleLogoChange"
                accept="image/*"
                class="file-input file-input-bordered w-full rounded-2xl"
              />
              <p class="mt-2 text-xs text-slate-400">
                Format image, maximum 2 Mo.
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          class="btn btn-primary mt-6 w-full rounded-2xl md:w-auto"
          :disabled="uploading"
        >
          {{ uploading ? "Mise à jour..." : "Mettre à jour" }}
        </button>
      </form>

      <div v-if="false" class="mt-8 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:p-6">
        <div class="mb-5">
          <h3 class="text-lg font-bold text-slate-900">
            Gérer les employés
          </h3>
          <p class="text-sm text-slate-500">
            Créez une invitation pour rattacher un employé.
          </p>
        </div>

        <div class="flex flex-col gap-3 md:flex-row">
          <input
            v-model="emailInvitation"
            type="email"
            placeholder="Email employé"
            class="input input-bordered w-full rounded-2xl"
          />

          <button
            @click="inviterEmploye"
            class="btn btn-secondary rounded-2xl"
            :disabled="loading"
          >
            {{ loading ? "Invitation..." : "Inviter" }}
          </button>
        </div>

        <div class="mt-6">
          <h4 class="mb-3 font-semibold text-slate-800">
            Employés actifs
          </h4>

          <ul v-if="employes.length" class="divide-y rounded-2xl border border-slate-100">
            <li
              v-for="emp in employes"
              :key="emp.id"
              class="flex items-center justify-between px-4 py-3"
            >
              <span class="text-sm text-slate-700">{{ emp.email }}</span>
              <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {{ emp.role }}
              </span>
            </li>
          </ul>

          <p v-else class="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Aucun employé actif.
          </p>
        </div>

        <div class="mt-6">
          <h4 class="mb-3 font-semibold text-slate-800">
            Invitations en attente
          </h4>

          <ul v-if="invitations.length" class="divide-y rounded-2xl border border-slate-100">
            <li
              v-for="invitation in invitations"
              :key="invitation.id"
              class="flex items-center justify-between px-4 py-3"
            >
              <span class="text-sm text-slate-700">{{ invitation.email }}</span>
              <span class="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                En attente
              </span>
            </li>
          </ul>

          <p v-else class="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Aucune invitation en attente.
          </p>
        </div>
      </div>

      <div v-if="false" class="mt-8 rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm md:p-6">
        <h3 class="text-lg font-bold text-red-700">
          Zone danger
        </h3>

        <p class="mt-2 text-sm text-red-600">
          Cette action supprime définitivement l’entreprise, ses colis, voyages,
          clients, destinations, invitations, messages et employés liés.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <input
            v-model="confirmDeleteText"
            class="input input-bordered border-red-300 bg-white rounded-2xl"
            placeholder="Tape SUPPRIMER pour confirmer"
          />

          <button
            class="btn btn-error rounded-2xl"
            :disabled="deletingEntreprise"
            @click="deleteEntrepriseCompletement"
          >
            {{ deletingEntreprise ? "Suppression..." : "Supprimer l'entreprise" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
