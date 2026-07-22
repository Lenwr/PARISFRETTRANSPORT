<script setup>
import { ref, computed, watch } from "vue"
import { useCollection, useFirestore } from "vuefire"
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp
} from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { Plane, Trash2, Eye, Plus } from "lucide-vue-next"

import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"
import VoyageFormModal from "../../components/voyages/VoyageFormModal.vue"

const db = useFirestore()
const authStore = useAuthStore()

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const modalOpen = ref(false)
const destinations = ref([])

const voyagesQuery = computed(() => {
  if (!entrepriseId.value) return null

  return query(
    collection(db, "chargements"),
    where("entrepriseId", "==", entrepriseId.value)
  )
})

const voyages = useCollection(voyagesQuery)

const sortedVoyages = computed(() => {
  return [...(voyages.value || [])].sort((a, b) => {
    const dateA = a.dateDepart || a.createdAt?.toDate?.() || 0
    const dateB = b.dateDepart || b.createdAt?.toDate?.() || 0
    return new Date(dateB) - new Date(dateA)
  })
})

watch(
  entrepriseId,
  async id => {
    if (id) await fetchDestinations()
  },
  { immediate: true }
)

async function fetchDestinations() {
  if (!entrepriseId.value) return

  const q = query(
    collection(db, "destinations"),
    where("entrepriseId", "==", entrepriseId.value)
  )

  const snapshot = await getDocs(q)

  destinations.value = snapshot.docs
    .map(document => ({
      id: document.id,
      ...document.data()
    }))
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
}

async function createDestination(nom) {
  try {
    const value = String(nom || "").trim()

    if (!value) {
      toast("Nom de destination manquant", {
        type: "warning",
        autoClose: 1200
      })
      return
    }

    if (!entrepriseId.value) {
      toast("Entreprise introuvable", {
        type: "error",
        autoClose: 1500
      })
      return
    }

    const exists = destinations.value.some(destination => {
      return String(destination.nom || "")
        .toLowerCase()
        .trim() === value.toLowerCase()
    })

    if (exists) {
      toast("Destination déjà existante", {
        type: "warning",
        autoClose: 1200
      })
      return
    }

    const docRef = await addDoc(collection(db, "destinations"), {
      nom: value,
      entrepriseId: entrepriseId.value,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    destinations.value.push({
      id: docRef.id,
      nom: value,
      entrepriseId: entrepriseId.value,
      active: true
    })

    destinations.value.sort((a, b) => String(a.nom).localeCompare(String(b.nom)))

    toast("Destination ajoutée", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur ajout destination", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function createVoyage(payload) {
  try {
    if (!entrepriseId.value) {
      toast("Entreprise introuvable", {
        type: "error",
        autoClose: 1500
      })
      return
    }

    await addDoc(collection(db, "chargements"), {
      ...payload,
      entrepriseId: entrepriseId.value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    modalOpen.value = false

    toast("Voyage créé", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur création voyage", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function deleteVoyage(id) {
  const confirmed = confirm("Supprimer ce voyage ?")

  if (!confirmed) return

  try {
    await deleteDoc(doc(db, "chargements", id))

    toast("Voyage supprimé", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur suppression voyage", {
      type: "error",
      autoClose: 1500
    })
  }
}

function formatDate(value) {
  if (!value) return "-"

  const date = value?.toDate ? value.toDate() : new Date(value)

  return date.toLocaleString("fr-FR")
}
</script>

<template>
  <section class="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
    <div class="mx-auto max-w-6xl">
      <div class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-sm font-medium text-primary">Voyages</p>

          <h1 class="text-2xl font-bold text-slate-900 md:text-3xl">
            Gestion des vols / voyages
          </h1>

          <p class="mt-1 text-sm text-slate-500">
            Crée un voyage, scanne les colis, puis informe les clients.
          </p>
        </div>

        <button class="btn btn-primary rounded-2xl" @click="modalOpen = true">
          <Plus class="h-5 w-5" />
          Nouveau voyage
        </button>
      </div>

      <div
        v-if="sortedVoyages.length === 0"
        class="rounded-3xl bg-white p-10 text-center shadow-sm"
      >
        <Plane class="mx-auto mb-4 h-12 w-12 text-slate-300" />

        <h2 class="text-lg font-bold text-slate-900">
          Aucun voyage créé
        </h2>

        <p class="mt-1 text-sm text-slate-500">
          Commence par créer un vol ou un voyage.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="voyage in sortedVoyages"
          :key="voyage.id"
          class="rounded-3xl bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase text-primary">
                {{ voyage.typeVoyage || "Voyage" }}
              </p>

              <h2 class="mt-1 text-xl font-bold text-slate-900">
                {{ voyage.numeroVol || voyage.contenaire || "Sans numéro" }}
              </h2>

              <p class="text-sm text-slate-500">
                {{ voyage.destination || "-" }}
              </p>
            </div>

            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {{ voyage.status || "Préparation" }}
            </span>
          </div>

          <div class="space-y-2 text-sm text-slate-600">
            <p>
              <span class="font-semibold text-slate-800">Départ :</span>
              {{ formatDate(voyage.dateDepart || voyage.date) }}
            </p>

            <p>
              <span class="font-semibold text-slate-800">Agents :</span>
              {{ voyage.agents?.length || 0 }}
            </p>

            <p>
              <span class="font-semibold text-slate-800">Colis :</span>
              {{ voyage.packagesTable?.length || 0 }}
            </p>
          </div>

          <div class="mt-5 flex gap-2">
            <router-link
              :to="`/chargementsDetails/${voyage.id}`"
              class="btn btn-primary flex-1 rounded-2xl"
            >
              <Eye class="h-4 w-4" />
              Ouvrir
            </router-link>

            <button
              class="btn btn-error rounded-2xl text-white"
              @click="deleteVoyage(voyage.id)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <VoyageFormModal
      v-model="modalOpen"
      :destinations="destinations"
      @save="createVoyage"
      @addDestination="createDestination"
    />
  </section>
</template>
