<script setup>
import { computed, ref, watch, nextTick } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDocument, useFirestore } from "vuefire"
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"

import QrcodeVue from "qrcode.vue"
import {
  ArrowLeft,
  FileText,
  QrCode,
  Trash2,
  Save,
  Send,
  Pencil
} from "lucide-vue-next"

import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"
import { firebaseApp } from "../../components/firebaseConfig"
import { generateBordereauPdf } from "../../utils/pdf/bordereauPdf"
import { generateQrColisPdf } from "../../utils/pdf/qrColisPdf"
import { parseMoney } from "../../utils/money"
import {
  deletePublicTracking,
  publicTrackingUrl,
  syncPublicTracking,
  trackingSlug
} from "../../utils/publicTracking"
import EditEnlevementModal from "../../components/enlevements/EditEnlevementModal.vue"

const route = useRoute()
const router = useRouter()
const db = useFirestore()
const authStore = useAuthStore()

const id = computed(() => route.params.id)
const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const loading = ref(true)
const accessDenied = ref(false)
const sending = ref(false)
const smsMessage = ref("Bonjour {{expediteur}}, votre colis pour {{destination}} est actuellement : {{statut}}. Paris Fret Transport.")
const editOpen = ref(false)
const entreprise = ref(null)

const enlevementRef = computed(() => {
  // Les règles Firestore utilisent le profil /users/{uid}. On attend que le
  // store ait fini de créer ou charger ce profil avant d'ouvrir l'écoute.
  if (!id.value || !authStore.isInitialized || !authStore.userProfile?.entrepriseId) {
    return null
  }
  return doc(db, "enlevements", id.value)
})

const trackingLink = computed(() => {
  const slug = trackingSlug(
    entreprise.value?.trackingSlug ||
      entreprise.value?.slug ||
      entreprise.value?.nom ||
      entreprise.value?.companyName,
    entrepriseId.value || "entreprise"
  )

  return publicTrackingUrl(slug, colis.value.numero)
})

const source = useDocument(enlevementRef)

const colis = ref({
  id: "",
  numero: "",
  expediteur: "",
  telephoneExpediteur: "",
  destinataire: "",
  telephoneDestinataire: "",
  typeDeFret: "",
  destination: "",
  nombreDeColis: 0,
  poidsTotal: 0,
  colis: [],
  statut: "",
  prix: "",
  resteAPayer: "",
  modeDePaiement: "",
  personneEnCharge: "",
  telephoneAgent: "",
  deliveryStatus: "",
  date: "",
  entrepriseId: ""
})

function generatePackageId() {
  return `PKG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
}

async function ensurePackageIds(data) {
  let changed = false

  const updatedColis = (data.colis || []).map(item => ({
    ...item,
    details: (item.details || []).map(detail => {
      if (detail.packageId) return detail

      changed = true

      return {
        ...detail,
        packageId: generatePackageId()
      }
    })
  }))

  if (changed) {
    await updateDoc(doc(db, "enlevements", id.value), {
      colis: updatedColis,
      updatedAt: new Date()
    })
  }

  return {
    ...data,
    colis: updatedColis
  }
}

watch(
  source,
  async (data) => {
    if (!data) {
      loading.value = false
      return
    }

    if (entrepriseId.value && data.entrepriseId !== entrepriseId.value) {
      accessDenied.value = true
      toast("Accès refusé", { type: "error", autoClose: 1500 })
      router.push("/liste")
      return
    }

    const safeData = await ensurePackageIds(data)

    colis.value = {
      ...colis.value,
      ...safeData,
      id: id.value
    }

    await fetchEntreprise()
    loading.value = false
  },
  { immediate: true }
)

async function fetchEntreprise() {
  if (!entrepriseId.value) return

  try {
    const snap = await getDoc(doc(db, "entreprises", entrepriseId.value))
    entreprise.value = snap.exists() ? snap.data() : null
  } catch (error) {
    console.error(error)
  }
}

async function syncCurrentPublicTracking(overrides = {}) {
  if (!entreprise.value) {
    await fetchEntreprise()
  }

  await syncPublicTracking(
    db,
    {
      ...colis.value,
      ...overrides,
      id: id.value
    },
    {
      id: entrepriseId.value,
      ...entreprise.value
    },
    id.value
  )
}

function formatDateTime(value) {
  if (!value) return "-"

  return format(new Date(value), "EEEE d MMMM yyyy à HH'h'mm", {
    locale: frLocale
  })
}

async function updateDeliveryStatus() {
  try {
    await updateDoc(doc(db, "enlevements", id.value), {
      deliveryStatus: colis.value.deliveryStatus,
      updatedAt: new Date()
    })

    await syncCurrentPublicTracking({
      deliveryStatus: colis.value.deliveryStatus
    })

    toast("Statut mis à jour", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur mise à jour", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function updateColis(payload) {
  try {
    await updateDoc(doc(db, "enlevements", id.value), {
      ...payload,
      updatedAt: new Date()
    })

    colis.value = {
      ...colis.value,
      ...payload
    }

    await syncCurrentPublicTracking(payload)

    editOpen.value = false

    toast("Colis modifié", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur modification", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function quickSavePaiement() {
  try {
    const prix = parseMoney(colis.value.prix)
    const resteAPayer = parseMoney(colis.value.resteAPayer)

    await updateDoc(doc(db, "enlevements", id.value), {
      statut: colis.value.statut,
      prix,
      resteAPayer,
      modeDePaiement: colis.value.modeDePaiement,
      updatedAt: new Date()
    })

    colis.value.prix = prix
    colis.value.resteAPayer = resteAPayer

    await syncCurrentPublicTracking({
      statut: colis.value.statut,
      prix,
      resteAPayer,
      modeDePaiement: colis.value.modeDePaiement
    })

    toast("Paiement mis à jour", {
      type: "success",
      autoClose: 1200
    })
  } catch (error) {
    console.error(error)

    toast("Erreur sauvegarde", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function deleteColis() {
  try {
    await deletePublicTracking(db, colis.value, {
      id: entrepriseId.value,
      ...entreprise.value
    })

    await deleteDoc(doc(db, "enlevements", id.value))

    toast("Colis supprimé", {
      type: "success",
      autoClose: 1200
    })

    router.push("/liste")
  } catch (error) {
    console.error(error)

    toast("Erreur suppression", {
      type: "error",
      autoClose: 1500
    })
  }
}

async function generatePDF() {

  try {
    await syncCurrentPublicTracking()
    await nextTick()

    await generateBordereauPdf({
      colis: colis.value,
      entreprise: entreprise.value
    })

  } catch (error) {

    console.error(error)

    toast("Erreur génération PDF", {
      type: "error",
      autoClose: 1500
    })

  }

}

async function generateQrPDF() {
  await nextTick()
  await generateQrColisPdf(colis.value, {
    entreprise: entreprise.value
  })
}

async function sendSms() {
  if (!colis.value.telephoneExpediteur) {
    toast("Téléphone expéditeur manquant", { type: "warning" })
    return
  }

  if (!window.confirm(`Envoyer ce SMS à ${colis.value.expediteur || "l’expéditeur"} ?`)) return
  sending.value = true

  try {
    const token = await authStore.getCurrentUser()?.getIdToken()
    const response = await fetch(
      `https://us-central1-${firebaseApp.options.projectId}.cloudfunctions.net/sendShipmentSMS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipients: [{
            enlevementId: colis.value.id || id.value,
            numero: colis.value.numero,
            statut: colis.value.deliveryStatus || "En attente"
          }],
          customMessage: smsMessage.value,
          entreprise: entreprise.value?.nom || "Paris Fret Transport"
        })
      }
    )
    const data = await response.json()
    if (!response.ok || !data.sent) throw new Error(data.error || data.results?.[0]?.error || "SMS non envoyé")
    toast("SMS envoyé à l’expéditeur", {
      type: "success",
      autoClose: 1800
    })
  } catch (error) {
    console.error(error)
    toast(error.message || "Erreur d’envoi SMS", { type: "error" })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
    <div v-if="loading" class="flex min-h-[60vh] items-center justify-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else-if="accessDenied" class="flex min-h-[60vh] items-center justify-center text-red-500">
      Accès refusé
    </div>

    <div v-else class="mx-auto max-w-6xl">
      <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-sm font-medium text-primary">
            Détail colis
          </p>

          <h1 class="text-2xl font-bold text-slate-900 md:text-3xl">
            {{ colis.numero || "Colis" }}
          </h1>

          <p class="text-sm text-slate-500">
            {{ formatDateTime(colis.date) }}
          </p>
        </div>

        <button class="btn btn-outline rounded-2xl" @click="router.back()">
          <ArrowLeft class="h-4 w-4" />
          Retour
        </button>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main class="min-w-0 space-y-6">
          <div class="rounded-3xl bg-white p-6 shadow-sm">
            <div class="mb-5 flex items-center justify-between">
              <h2 class="text-lg font-bold text-slate-900">
                Informations
              </h2>

              <span class="rounded-full px-4 py-2 text-xs font-bold text-white" :class="{
                'bg-red-500': colis.statut === 'Non Payé',
                'bg-yellow-500': colis.statut === 'Reste à payer',
                'bg-green-500': colis.statut === 'Payé',
                'bg-slate-400': !colis.statut
              }">
                {{ colis.statut || 'Non défini' }}
              </span>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Expéditeur</p>
                <p class="font-bold text-slate-900">{{ colis.expediteur || "-" }}</p>
                <p class="text-sm text-slate-500">{{ colis.telephoneExpediteur || "-" }}</p>
              </div>

              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Destinataire</p>
                <p class="font-bold text-slate-900">{{ colis.destinataire || "-" }}</p>
                <p class="text-sm text-slate-500">{{ colis.telephoneDestinataire || "-" }}</p>
              </div>

              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Destination</p>
                <p class="font-bold text-slate-900">{{ colis.destination || "-" }}</p>
              </div>

              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Type de fret</p>
                <p class="font-bold text-slate-900">{{ colis.typeDeFret || "-" }}</p>
              </div>

              <div v-if="colis.typeDeFret === 'Aérien'" class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Poids total</p>
                <p class="font-bold text-slate-900">{{ colis.poidsTotal || 0 }} kg</p>
              </div>

              <div v-if="colis.typeDeFret === 'Aérien'" class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Agent</p>
                <p class="font-bold text-slate-900">{{ colis.personneEnCharge || "-" }}</p>
                <p class="text-sm text-slate-500">{{ colis.telephoneAgent || "-" }}</p>
              </div>

              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Prix</p>
                <p class="font-bold text-slate-900">{{ colis.prix || "-" }}</p>
              </div>

              <div class="rounded-2xl bg-slate-50 p-4">
                <p class="text-xs uppercase text-slate-400">Reste à payer</p>
                <p class="font-bold text-slate-900">{{ colis.resteAPayer || "-" }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-3xl bg-white p-6 shadow-sm">
            <h2 class="mb-5 text-lg font-bold text-slate-900">
              Colis
            </h2>

            <div class="space-y-3">
              <div v-for="(item, index) in colis.colis" :key="index" class="rounded-2xl border border-slate-100 p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-bold text-slate-900">
                      {{ item.nom }} x{{ item.quantite }}
                    </p>

                    <p v-if="colis.typeDeFret === 'Aérien'" class="text-sm text-slate-500">
                      {{ item.poidsTotal || 0 }} kg
                    </p>
                  </div>
                </div>

                <ul class="mt-3 space-y-2">
                  <li v-for="(detail, dIndex) in item.details" :key="dIndex"
                    class="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {{ detail.coli }}

                    <span v-if="colis.typeDeFret === 'Aérien'">
                      — {{ detail.poids || 0 }} kg
                    </span>

                    <span class="ml-2 text-xs text-slate-400">
                      {{ detail.packageId }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="hidden">
            <div id="mainQr">
              <QrcodeVue :value="trackingLink" :size="300" level="H" />
            </div>
            <template v-for="(item, colisIndex) in colis.colis" :key="colisIndex">
              <div v-for="(detail, detailIndex) in item.details" :key="detailIndex"
                :id="`qr-${colisIndex}-${detailIndex}`">
                <QrcodeVue :value="`TS|${colis.id}|${colisIndex}|${detailIndex}`" :size="300" level="H" />
              </div>
            </template>
          </div>
        </main>

        <aside class="h-fit min-w-0 rounded-3xl bg-white p-5 shadow-sm xl:sticky xl:top-24">
          <h2 class="mb-5 text-lg font-bold text-slate-900">
            Actions
          </h2>

          <div class="space-y-3">
            <textarea v-model="smsMessage" class="textarea textarea-bordered min-h-28 w-full rounded-2xl" placeholder="Message SMS"></textarea>
            <button class="btn btn-primary w-full rounded-2xl" @click="generatePDF">
              <FileText class="h-4 w-4" />
              Bordereau PDF
            </button>

            <button class="btn btn-outline w-full rounded-2xl" @click="generateQrPDF">
              <QrCode class="h-4 w-4" />
              QR colis
            </button>

            <button class="btn btn-outline w-full rounded-2xl" :disabled="sending" @click="sendSms">
              <Send class="h-4 w-4" />
              Envoyer SMS
            </button>

            <button class="btn btn-info w-full rounded-2xl text-white" @click="editOpen = true">
              <Pencil class="h-4 w-4" />
              Modifier
            </button>

            <div class="divider"></div>

            <select v-model="colis.deliveryStatus" class="select select-bordered w-full rounded-2xl"
              @change="updateDeliveryStatus">
              <option>En attente</option>
              <option>Envoyé</option>
              <option>Réceptionné</option>
              <option>Livré</option>
              <option>contenaire</option>
              <option>Attribué au vol</option>
            </select>

            <select v-model="colis.statut" class="select select-bordered w-full rounded-2xl">
              <option>Non Payé</option>
              <option>Reste à payer</option>
              <option>Payé</option>
            </select>

            <select v-model="colis.modeDePaiement" class="select select-bordered w-full rounded-2xl">
              <option>Espèces</option>
              <option>Chèque</option>
              <option>CB</option>
              <option>Virement</option>
            </select>

            <input v-model="colis.prix" class="input input-bordered w-full rounded-2xl" placeholder="Prix" />

            <input v-model="colis.resteAPayer" class="input input-bordered w-full rounded-2xl"
              placeholder="Reste à payer" />

            <button class="btn btn-success h-auto min-h-12 w-full whitespace-normal rounded-2xl py-3 text-center leading-tight text-white" @click="quickSavePaiement">
              <Save class="h-4 w-4" />
              <span>Sauvegarder le paiement</span>
            </button>

            <button class="btn btn-error h-auto min-h-12 w-full whitespace-normal rounded-2xl py-3 text-white" @click="deleteColis">
              <Trash2 class="h-4 w-4" />
              Supprimer
            </button>
          </div>
        </aside>
      </div>
    </div>

    <EditEnlevementModal v-model="editOpen" :enlevement="colis" @save="updateColis" />
  </section>
</template>
