<script setup>
import { computed, onMounted, ref } from "vue"
import { collection, getDocs, query, where } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import {
  CheckSquare,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Square
} from "lucide-vue-next"

import { firebaseApp } from "../../components/firebaseConfig"
import { useAuthStore } from "../../stores/useAuthStore"
import {
  PARIS_FRET_ENTREPRISE_ID,
  PARIS_FRET_ENTREPRISE_NAME
} from "../../appConfig"
import { confirmToast } from "../../utils/notifications"

const db = useFirestore()
const authStore = useAuthStore()

const customers = ref([])
const selectedIds = ref([])
const search = ref("")
const message = ref(
  "Bonjour {{prenom}}, nous avons une information importante de {{entreprise}}."
)
const loading = ref(false)
const sending = ref(false)

const entrepriseId = computed(() =>
  authStore.entreprise?.id ||
  authStore.userProfile?.entrepriseId ||
  PARIS_FRET_ENTREPRISE_ID
)
const entrepriseNom = computed(() => authStore.entreprise?.nom || PARIS_FRET_ENTREPRISE_NAME)
const projectId = firebaseApp.options.projectId

const SMS_URL = `https://us-central1-${projectId}.cloudfunctions.net/sendBroadcastSMS`

const filteredCustomers = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) return customers.value

  return customers.value.filter(customer => {
    const fullName = `${customer.nom || ""} ${customer.prenom || ""}`.toLowerCase()
    const phone = String(customer.telephone || "")
    const city = String(customer.ville || customer.adresse || "").toLowerCase()

    return fullName.includes(term) || phone.includes(term) || city.includes(term)
  })
})

const selectableCustomers = computed(() =>
  filteredCustomers.value.filter(customer =>
    normalizePhone(customer.telephone) &&
    customer.smsOptOut !== true &&
    customer.smsConsent !== false
  )
)

const selectedCustomers = computed(() => {
  const ids = new Set(selectedIds.value)
  return customers.value.filter(customer => ids.has(customer.id))
})

const selectedWithPhone = computed(() =>
  selectedCustomers.value.filter(customer =>
    normalizePhone(customer.telephone) &&
    customer.smsOptOut !== true &&
    customer.smsConsent !== false
  )
)

const allVisibleSelected = computed(() => {
  if (!selectableCustomers.value.length) return false
  return selectableCustomers.value.every(customer => selectedIds.value.includes(customer.id))
})

function normalizePhone(phone) {
  let value = String(phone || "").trim().replace(/[^\d+]/g, "")
  if (!value) return ""
  if (value.startsWith("00")) value = `+${value.slice(2)}`
  if (value.startsWith("0") && value.length === 10) value = `+33${value.slice(1)}`
  if (!value.startsWith("+")) value = `+${value}`
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : ""
}

function customerName(customer) {
  return `${customer.prenom || ""} ${customer.nom || ""}`.trim() || "Client"
}

function renderPreview(customer = selectedWithPhone.value[0]) {
  if (!customer) return message.value

  return message.value
    .replace(/\{\{\s*prenom\s*\}\}/gi, customer.prenom || "")
    .replace(/\{\{\s*nom\s*\}\}/gi, customer.nom || "")
    .replace(/\{\{\s*client\s*\}\}/gi, customerName(customer))
    .replace(/\{\{\s*telephone\s*\}\}/gi, customer.telephone || "")
    .replace(/\{\{\s*entreprise\s*\}\}/gi, entrepriseNom.value)
}

function toggleCustomer(customerId) {
  if (selectedIds.value.includes(customerId)) {
    selectedIds.value = selectedIds.value.filter(id => id !== customerId)
    return
  }

  selectedIds.value = [...selectedIds.value, customerId]
}

function toggleVisibleCustomers() {
  const visibleIds = selectableCustomers.value.map(customer => customer.id)
  const visibleSet = new Set(visibleIds)

  if (allVisibleSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !visibleSet.has(id))
    return
  }

  selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])]
}

async function fetchCustomers() {
  if (!entrepriseId.value) {
    const user = authStore.getCurrentUser()

    if (user) {
      await authStore.fetchUserProfile(user.uid)
      await authStore.fetchEntreprise(user.uid)
    }
  }

  if (!entrepriseId.value) return

  loading.value = true

  try {
    const customerQuery = query(
      collection(db, "customers"),
      where("entrepriseId", "==", entrepriseId.value)
    )
    const snap = await getDocs(customerQuery)

    customers.value = snap.docs
      .map(document => ({
        id: document.id,
        ...document.data()
      }))
      .sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || "")))
  } catch (error) {
    console.error(error)
    toast("Erreur chargement clients", { type: "error", autoClose: 1500 })
  } finally {
    loading.value = false
  }
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

function buildRecipients() {
  return selectedWithPhone.value.map(customer => ({
    customerId: customer.id,
    phone: normalizePhone(customer.telephone),
    expediteur: customerName(customer),
    destinataire: customerName(customer),
    prenom: customer.prenom || "",
    nom: customer.nom || "",
    message: renderPreview(customer)
  }))
}

async function sendBroadcast() {
  const recipients = buildRecipients()

  if (!recipients.length) {
    toast("Sélectionnez au moins un client avec téléphone", {
      type: "warning",
      autoClose: 1600
    })
    return
  }

  if (!message.value.trim()) {
    toast("Message requis", { type: "warning", autoClose: 1500 })
    return
  }

  const confirmed = await confirmToast({
    title: "Confirmer la diffusion",
    message: `Ce SMS sera envoyé à ${recipients.length} client(s).`,
    confirmText: "Envoyer"
  })
  if (!confirmed) return

  sending.value = true

  try {
    const response = await fetch(SMS_URL, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        source: "customers",
        entrepriseId: entrepriseId.value,
        recipients: recipients.map(recipient => ({ customerId: recipient.customerId })),
        customMessage: message.value,
        entreprise: entrepriseNom.value
      })
    })

    const data = await response.json()

    if (!response.ok || data.success === false) {
      throw new Error(data.error || "Erreur envoi")
    }

    const sent = typeof data.sent === "number"
      ? data.sent
      : data.results?.filter(item => item.success).length || 0

    toast(`Diffusion envoyée ${sent}/${recipients.length}`, {
      type: sent > 0 ? "success" : "warning",
      autoClose: 1800
    })
  } catch (error) {
    console.error(error)
    toast(error.message || "Erreur diffusion", { type: "error", autoClose: 1800 })
  } finally {
    sending.value = false
  }
}

onMounted(fetchCustomers)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">
          Clients
        </p>
        <h1 class="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">
          Diffusion clients
        </h1>
      </div>

      <button
        type="button"
        class="btn rounded-lg border-slate-200 bg-white text-slate-800"
        :disabled="loading"
        @click="fetchCustomers"
      >
        <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        Actualiser
      </button>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div class="space-y-4">
        <div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
          <label class="input input-bordered flex h-12 flex-1 items-center gap-2 rounded-lg bg-slate-50">
            <Search class="h-4 w-4 text-slate-400" />
            <input v-model="search" type="text" class="grow" placeholder="Rechercher un client" />
          </label>

          <button
            type="button"
            class="btn h-12 rounded-lg bg-slate-950 text-white hover:bg-slate-800"
            :disabled="!selectableCustomers.length"
            @click="toggleVisibleCustomers"
          >
            <component :is="allVisibleSelected ? CheckSquare : Square" class="h-4 w-4" />
            {{ allVisibleSelected ? "Désélectionner" : "Tout sélectionner" }}
          </button>
        </div>

        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div class="grid grid-cols-[44px_minmax(180px,1fr)_150px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500 sm:grid-cols-[44px_minmax(200px,1fr)_180px_180px]">
            <span></span>
            <span>Client</span>
            <span>Téléphone</span>
            <span class="hidden sm:block">Adresse</span>
          </div>

          <div v-if="loading" class="p-8 text-center text-sm font-semibold text-slate-500">
            Chargement des clients
          </div>

          <div v-else-if="!filteredCustomers.length" class="p-8 text-center text-sm font-semibold text-slate-500">
            Aucun client trouvé
          </div>

          <button
            v-for="customer in filteredCustomers"
            v-else
            :key="customer.id"
            type="button"
            class="grid w-full grid-cols-[44px_minmax(180px,1fr)_150px] gap-3 border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 hover:bg-emerald-50/50 sm:grid-cols-[44px_minmax(200px,1fr)_180px_180px]"
            :class="selectedIds.includes(customer.id) ? 'bg-emerald-50' : 'bg-white'"
            :disabled="!normalizePhone(customer.telephone)"
            @click="toggleCustomer(customer.id)"
          >
            <span class="flex h-5 w-5 items-center justify-center text-primary">
              <component :is="selectedIds.includes(customer.id) ? CheckSquare : Square" class="h-5 w-5" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-black text-slate-950">
                {{ customerName(customer) }}
              </span>
              <span v-if="!normalizePhone(customer.telephone)" class="mt-1 block text-xs font-semibold text-red-500">
                Téléphone manquant ou invalide
              </span>
              <span v-else-if="customer.smsOptOut === true || customer.smsConsent === false" class="mt-1 block text-xs font-semibold text-amber-600">
                SMS désactivés
              </span>
            </span>
            <span class="truncate text-sm font-semibold text-slate-600">
              {{ customer.telephone || "-" }}
            </span>
            <span class="hidden truncate text-sm font-semibold text-slate-500 sm:block">
              {{ customer.adresse || customer.ville || "-" }}
            </span>
          </button>
        </div>
      </div>

      <aside class="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="flex items-center gap-2 text-sm font-black text-slate-950">
            <Smartphone class="h-4 w-4" />
            Diffusion par SMS
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-slate-50 p-4">
            <p class="text-xs font-bold text-slate-500">Sélectionnés</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ selectedIds.length }}</p>
          </div>
          <div class="rounded-lg bg-slate-50 p-4">
            <p class="text-xs font-bold text-slate-500">Avec téléphone</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ selectedWithPhone.length }}</p>
          </div>
        </div>

        <div>
          <label class="text-sm font-black text-slate-900">Message</label>
          <textarea
            v-model="message"
            class="textarea textarea-bordered mt-2 min-h-44 w-full rounded-lg bg-slate-50"
            maxlength="700"
          ></textarea>
          <p v-pre class="mt-2 text-xs font-semibold text-slate-500">
            Variables: {{prenom}}, {{nom}}, {{client}}, {{entreprise}}
          </p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Aperçu</p>
          <p class="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
            {{ renderPreview() }}
          </p>
        </div>

        <button
          type="button"
          class="btn h-12 w-full rounded-lg bg-[var(--pf-accent)] text-white hover:bg-[var(--pf-accent-strong)]"
          :disabled="sending || !selectedWithPhone.length"
          @click="sendBroadcast"
        >
          <span v-if="sending" class="loading loading-spinner loading-sm"></span>
          <Send v-else class="h-4 w-4" />
          Envoyer
        </button>
      </aside>
    </div>
  </section>
</template>
