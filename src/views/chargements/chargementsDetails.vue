<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { doc, getDoc, getDocs, collection, updateDoc } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import { useAuthStore } from "../../stores/useAuthStore"
import { firebaseApp } from "../../components/firebaseConfig"

const db = useFirestore()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const chargementId = route.params.id

const chargement = ref(null)
const enlevements = ref([])
const loading = ref(true)
const sendingSMS = ref(false)
const sendingWhatsApp = ref(false)

const selectedStatus = ref("En transit")

const customMessage = ref(
  "Bonjour {{expediteur}}, votre colis {{numero}} pour {{destination}} est maintenant : {{statut}}."
)

const statusOptions = [
  "Attribué au vol",
  "En transit",
  "Arrivé destination",
  "Disponible retrait",
  "Livré"
]

const projectId = firebaseApp.options.projectId
const SMS_URL =
  `https://us-central1-${projectId}.cloudfunctions.net/sendShipmentSMS`

const WHATSAPP_URL =
  `https://us-central1-${projectId}.cloudfunctions.net/sendWhatsAppTemplateBroadcast`

const colisDuVoyage = computed(() => {
  const result = []

  enlevements.value.forEach(enlevement => {
    ;(enlevement.colis || []).forEach((colis, colisIndex) => {
      ;(colis.details || []).forEach((detail, detailIndex) => {
        if (detail.voyageId === chargementId) {
          result.push({
            enlevementId: enlevement.id,
            colisIndex,
            detailIndex,
            expediteur: enlevement.expediteur || "Expéditeur",
            destinataire: enlevement.destinataire || "Client",
            phone:
              detail.telephoneDestinataire ||
              enlevement.telephoneDestinataire ||
              enlevement.telephoneExpediteur ||
              enlevement.telephone ||
              "",
            destination: detail.destination || enlevement.destination || "-",
            numero: detail.packageId || detail.numero || "-",
            nom: detail.coli || colis.nom || "Colis",
            poids: detail.poids || 0,
            statutColis: detail.statutColis || "En attente"
          })
        }
      })
    })
  })

  return result
})

const totalPoids = computed(() =>
  colisDuVoyage.value.reduce((total, item) => total + Number(item.poids || 0), 0)
)

function renderMessage(item = null) {
  const data = item || colisDuVoyage.value[0]
  if (!data) return customMessage.value

  return customMessage.value
    .replace(/\{\{\s*expediteur\s*\}\}/g, data.expediteur || "")
    .replace(/\{\{\s*numero\s*\}\}/g, data.numero || "")
    .replace(/\{\{\s*destination\s*\}\}/g, data.destination || "")
    .replace(/\{\{\s*statut\s*\}\}/g, selectedStatus.value || "")
}

async function getAuthHeaders() {
  const token = await authStore.getCurrentUser()?.getIdToken()

  if (!token) {
    throw new Error("Utilisateur non connecté")
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }
}

const notificationMessage = computed(() => renderMessage())

async function fetchData() {
  loading.value = true

  try {
    const chargementSnap = await getDoc(doc(db, "chargements", chargementId))

    if (chargementSnap.exists()) {
      chargement.value = {
        id: chargementSnap.id,
        ...chargementSnap.data()
      }
    }

    const snap = await getDocs(collection(db, "enlevements"))

    enlevements.value = snap.docs.map(item => ({
      id: item.id,
      ...item.data()
    }))
  } catch (error) {
    console.error(error)
    toast("Erreur chargement", { type: "error" })
  } finally {
    loading.value = false
  }
}

async function updateAllColisStatus() {
  try {
    const updatesByEnlevement = {}

    colisDuVoyage.value.forEach(item => {
      if (!updatesByEnlevement[item.enlevementId]) {
        const enlevement = enlevements.value.find(e => e.id === item.enlevementId)
        updatesByEnlevement[item.enlevementId] = JSON.parse(
          JSON.stringify(enlevement.colis || [])
        )
      }

      updatesByEnlevement[item.enlevementId][item.colisIndex]
        .details[item.detailIndex]
        .statutColis = selectedStatus.value
    })

    await Promise.all(
      Object.entries(updatesByEnlevement).map(([enlevementId, colis]) =>
        updateDoc(doc(db, "enlevements", enlevementId), {
          colis,
          updatedAt: new Date()
        })
      )
    )

    toast("Statut mis à jour", { type: "success" })
    await fetchData()
  } catch (error) {
    console.error(error)
    toast("Erreur mise à jour", { type: "error" })
  }
}

function getRecipientsPayload() {
  return colisDuVoyage.value
    .filter(item => item.phone)
    .map(item => ({
      enlevementId: item.enlevementId,
      phone: item.phone,
      message: renderMessage(item),
      expediteur: item.expediteur,
      destinataire: item.destinataire,
      numero: item.numero,
      destination: item.destination,
      statut: selectedStatus.value
    }))
}

function countSuccess(data) {
  if (typeof data.sent === "number") return data.sent

  if (Array.isArray(data.results)) {
    return data.results.filter(item => item.success || item.ok).length
  }

  return data.success ? 1 : 0
}

async function sendBroadcast(url, type) {
  const recipients = getRecipientsPayload()

  if (!recipients.length) {
    toast("Aucun numéro disponible", { type: "warning" })
    return
  }

  const firstMessage = recipients[0].message

  const response = await fetch(url, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
  recipients,
  statut: selectedStatus.value,
  customMessage: customMessage.value,
  entreprise: authStore.entreprise?.nom || "Paris Fret Transport"
})
  })

  const data = await response.json()

  console.log(`RESULT ${type}`, data)

  const sent = countSuccess(data)

  toast(`${type} envoyés ${sent}/${recipients.length}`, {
    type: sent > 0 ? "success" : "warning"
  })

  if (sent === 0 && data.results?.length) {
    console.warn("Erreurs détails :", data.results)
  }
}

async function sendSMSBroadcast() {
  sendingSMS.value = true

  try {
    await sendBroadcast(SMS_URL, "SMS")
  } catch (error) {
    console.error(error)
    toast("Erreur SMS", { type: "error" })
  } finally {
    sendingSMS.value = false
  }
}

async function sendWhatsAppBroadcast() {
  sendingWhatsApp.value = true

  try {

    const recipients = getRecipientsPayload()

    if (!recipients.length) {

      toast("Aucun numéro disponible", {
        type: "warning"
      })

      return
    }

    const response = await fetch(

      WHATSAPP_URL,

      {
        method: "POST",

        headers: await getAuthHeaders(),

        body: JSON.stringify({

          recipients,

          statut: selectedStatus.value,

          customMessage: customMessage.value,

          entreprise:
            authStore?.entreprise?.nom ||
            "Paris Fret Transport"

        })

      }

    )

    const data = await response.json()

    console.log("RESULT WHATSAPP", data)

    if (!response.ok || !data.success) {

      throw new Error(
        data.error || "Erreur WhatsApp"
      )

    }

    const successCount =
      data.results?.filter(
        item => item.success
      ).length || 0

    toast(

      `WhatsApp envoyés ${successCount}/${recipients.length}`,

      {
        type:
          successCount > 0
            ? "success"
            : "warning"
      }

    )

  } catch (error) {

    console.error(error)

    toast(
      error.message || "Erreur WhatsApp",
      {
        type: "error"
      }
    )

  } finally {

    sendingWhatsApp.value = false

  }
}
onMounted(fetchData)
</script>

<template>
  <section class="min-h-screen bg-slate-50 px-3 py-5 md:px-8">
    <div class="mx-auto max-w-6xl space-y-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-xs font-bold uppercase text-primary">Voyage</p>

          <h1 class="text-2xl font-black text-slate-900 md:text-3xl">
            {{ chargement?.contenaire || "Détail chargement" }}
          </h1>

          <p class="text-sm text-slate-500">
            {{ chargement?.date || "" }}
          </p>
        </div>

        <button
          class="btn btn-primary w-full rounded-2xl md:w-auto"
          @click="router.push(`/voyage/${chargementId}/scan`)"
        >
          Scanner colis du vol
        </button>
      </div>

      <div v-if="loading" class="rounded-3xl bg-white p-10 text-center shadow-sm">
        Chargement...
      </div>

      <template v-else>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div class="rounded-3xl bg-white p-5 shadow-sm">
            <p class="text-sm text-slate-500">Colis scannés</p>
            <h2 class="text-4xl font-black text-slate-900">
              {{ colisDuVoyage.length }}
            </h2>
          </div>

          <div class="rounded-3xl bg-white p-5 shadow-sm">
            <p class="text-sm text-slate-500">Poids total</p>
            <h2 class="text-4xl font-black text-slate-900">
              {{ totalPoids }} kg
            </h2>
          </div>

          <div class="rounded-3xl bg-white p-5 shadow-sm sm:col-span-2 md:col-span-1">
            <p class="text-sm text-slate-500">Statut sélectionné</p>
            <h2 class="text-2xl font-black text-slate-900">
              {{ selectedStatus }}
            </h2>
          </div>
        </div>

        <div class="rounded-3xl bg-white p-4 shadow-sm md:p-6">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <select
              v-model="selectedStatus"
              class="select select-bordered w-full rounded-2xl"
            >
              <option
                v-for="status in statusOptions"
                :key="status"
                :value="status"
              >
                {{ status }}
              </option>
            </select>

            <button
              class="btn btn-primary w-full rounded-2xl md:w-auto"
              @click="updateAllColisStatus"
            >
              Valider le statut
            </button>
          </div>

          <div class="mt-5">
            <label class="mb-2 block text-sm font-bold text-slate-700">
              Message personnalisé
            </label>

            <textarea
              v-model="customMessage"
              rows="5"
              class="textarea textarea-bordered w-full rounded-2xl text-sm"
            />

            <p class="mt-2 flex flex-wrap gap-1 text-xs text-slate-500">
              <span>Variables :</span>
              <code v-pre>{{expediteur}}</code>
              <code v-pre>{{numero}}</code>
              <code v-pre>{{destination}}</code>
              <code v-pre>{{statut}}</code>
            </p>
          </div>

          <div class="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p class="mb-1 font-bold">Aperçu :</p>
            <p class="break-words">{{ notificationMessage }}</p>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              class="btn w-full rounded-2xl bg-green-600 text-white hover:bg-green-700"
              :disabled="sendingSMS || sendingWhatsApp"
              @click="sendSMSBroadcast"
            >
              {{ sendingSMS ? "Envoi SMS..." : "Diffuser par SMS" }}
            </button>

            <button
              class="btn w-full rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600"
              :disabled="sendingSMS || sendingWhatsApp"
              @click="sendWhatsAppBroadcast"
            >
              {{ sendingWhatsApp ? "Envoi WhatsApp..." : "Diffuser par WhatsApp" }}
            </button>
          </div>
        </div>

        <div class="rounded-3xl bg-white p-4 shadow-sm md:p-6">
          <div class="mb-5 flex items-center justify-between gap-3">
            <h2 class="text-xl font-black text-slate-900 md:text-2xl">
              Colis attribués au voyage
            </h2>

            <span class="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
              {{ colisDuVoyage.length }}
            </span>
          </div>

          <div
            v-if="colisDuVoyage.length === 0"
            class="py-10 text-center text-slate-500"
          >
            Aucun colis ajouté à ce voyage.
          </div>

          <div v-else class="hidden overflow-x-auto md:block">
            <table class="table">
              <thead>
                <tr>
                  <th>Colis</th>
                  <th>Expéditeur</th>
                  <th>Téléphone</th>
                  <th>Destination</th>
                  <th>Poids</th>
                  <th>Numéro</th>
                  <th>Statut</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="item in colisDuVoyage"
                  :key="`${item.enlevementId}-${item.colisIndex}-${item.detailIndex}`"
                >
                  <td class="font-bold">{{ item.nom }}</td>
                  <td>{{ item.expediteur }}</td>
                  <td>{{ item.phone || "-" }}</td>
                  <td>{{ item.destination }}</td>
                  <td>{{ item.poids }} kg</td>
                  <td>{{ item.numero }}</td>
                  <td>
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
                      {{ item.statutColis }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="space-y-3 md:hidden">
            <div
              v-for="item in colisDuVoyage"
              :key="`${item.enlevementId}-${item.colisIndex}-${item.detailIndex}`"
              class="rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <div class="mb-2 flex items-start justify-between gap-3">
                <h3 class="font-black text-slate-900">
                  {{ item.nom }}
                </h3>

                <span class="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                  {{ item.statutColis }}
                </span>
              </div>

              <div class="space-y-1 text-sm text-slate-600">
                <p><strong>Expéditeur :</strong> {{ item.expediteur }}</p>
                <p><strong>Téléphone :</strong> {{ item.phone || "-" }}</p>
                <p><strong>Destination :</strong> {{ item.destination }}</p>
                <p><strong>Poids :</strong> {{ item.poids }} kg</p>
                <p class="break-all"><strong>Numéro :</strong> {{ item.numero }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
