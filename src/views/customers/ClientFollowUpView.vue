<script setup>
import { computed, ref } from "vue"
import { addDoc, collection, query, serverTimestamp, where } from "firebase/firestore"
import { useCollection, useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import { Plus, Search, Send, Trash2, UserPlus, Users } from "lucide-vue-next"
import { firebaseApp } from "../../components/firebaseConfig"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"
import { useAuthStore } from "../../stores/useAuthStore"

const authStore = useAuthStore()
const db = useFirestore()
const passage = ref("todo")
const sending = ref(false)
const savingPhone = ref("")
const activeTab = ref("customers")
const customerSearch = ref("")
const historySearch = ref("")
const recipients = ref([emptyRecipient()])
const endpoint = "https://us-central1-" + firebaseApp.options.projectId + ".cloudfunctions.net/sendClientRequestInvites"

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)
const customersQuery = computed(() => entrepriseId.value
  ? query(collection(db, "customers"), where("entrepriseId", "==", entrepriseId.value))
  : null
)
const invitesQuery = computed(() => entrepriseId.value
  ? query(collection(db, "clientRequestInvites"), where("entrepriseId", "==", entrepriseId.value))
  : null
)
const customers = useCollection(customersQuery)
const invites = useCollection(invitesQuery)

function emptyRecipient() {
  return { name: "", phone: "", address: "", customerId: "" }
}

function customerName(customer) {
  return [customer.prenom, customer.nom].filter(Boolean).join(" ").trim() || customer.name || "Client"
}

function customerPhone(customer) {
  return customer.telephone || customer.phone || ""
}

function customerAddress(customer) {
  return [customer.adresse || customer.address, customer.codePostal].filter(Boolean).join(" ").trim()
}

function searchable(...values) {
  return values.join(" ").toLocaleLowerCase("fr")
}

const validRecipients = computed(() => recipients.value.filter(item => item.name.trim() && item.phone.trim()))
const filteredCustomers = computed(() => {
  const term = customerSearch.value.trim().toLocaleLowerCase("fr")
  return [...(customers.value || [])]
    .filter(customer => !term || searchable(customerName(customer), customerPhone(customer), customerAddress(customer)).includes(term))
    .sort((a, b) => customerName(a).localeCompare(customerName(b), "fr"))
})
const filteredInvites = computed(() => {
  const term = historySearch.value.trim().toLocaleLowerCase("fr")
  const sorted = [...(invites.value || [])]
    .filter(item => !term || searchable(item.name, item.phone, item.address).includes(term))
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
  const seenPhones = new Set()

  return sorted.filter(item => {
    const phone = String(item.phone || "").replace(/\D/g, "")
    const key = phone || searchable(item.name, item.address)
    if (seenPhones.has(key)) return false
    seenPhones.add(key)
    return true
  })
})
const uniqueInviteCount = computed(() => {
  const phones = new Set()
  ;(invites.value || []).forEach(item => {
    const phone = String(item.phone || "").replace(/\D/g, "")
    phones.add(phone || searchable(item.name, item.address))
  })
  return phones.size
})

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis()
  if (value?.seconds) return value.seconds * 1000
  return 0
}

function formatDate(value) {
  const timestamp = timestampValue(value)
  return timestamp
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(timestamp)
    : "À l’instant"
}

function addRow() {
  recipients.value.push(emptyRecipient())
}

function removeRow(index) {
  if (recipients.value.length === 1) recipients.value[0] = emptyRecipient()
  else recipients.value.splice(index, 1)
}

function recipientAlreadyAdded(phone) {
  const normalized = String(phone || "").replace(/\s/g, "")
  return recipients.value.some(item => String(item.phone || "").replace(/\s/g, "") === normalized)
}

function useCustomer(customer) {
  const phone = customerPhone(customer)
  if (recipientAlreadyAdded(phone)) {
    toast("Ce client est déjà dans la liste", { type: "info", autoClose: 1300 })
    return
  }
  const recipient = {
    name: customerName(customer),
    phone,
    address: customerAddress(customer),
    customerId: customer.id
  }
  const emptyIndex = recipients.value.findIndex(item => !item.name && !item.phone)
  if (emptyIndex >= 0) recipients.value[emptyIndex] = recipient
  else recipients.value.push(recipient)
  toast(recipient.name + " ajouté", { type: "success", autoClose: 1000 })
}

function customerExists(phone) {
  const normalized = String(phone || "").replace(/\s/g, "")
  return (customers.value || []).some(customer => customerPhone(customer).replace(/\s/g, "") === normalized)
}

async function saveContact(contact) {
  const phone = String(contact.phone || "").trim()
  const name = String(contact.name || "").trim()
  if (!name || !phone) return toast("Nom et téléphone requis", { type: "warning" })
  if (customerExists(phone)) return toast("Ce client est déjà enregistré", { type: "info" })

  savingPhone.value = phone
  try {
    await addDoc(collection(db, "customers"), {
      entrepriseId: entrepriseId.value,
      nom: name,
      prenom: "",
      telephone: phone,
      adresse: String(contact.address || "").trim(),
      codePostal: "",
      smsConsent: true,
      envois: [],
      source: "suivi-client",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast("Client enregistré dans le carnet", { type: "success", autoClose: 1500 })
  } catch (error) {
    console.error(error)
    toast("Impossible d’enregistrer le client", { type: "error" })
  } finally {
    savingPhone.value = ""
  }
}

async function sendForms() {
  if (!validRecipients.value.length) return toast("Ajoutez au moins un client", { type: "warning" })
  if (!window.confirm("Envoyer le formulaire à " + validRecipients.value.length + " client(s) ?")) return

  sending.value = true
  try {
    const token = await authStore.getCurrentUser()?.getIdToken()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        recipients: validRecipients.value.map(({ name, phone, address }) => ({ name, phone, address })),
        passage: passage.value,
        appUrl: window.location.origin
      })
    })
    const data = await response.json()
    if (!response.ok || data.success === false) throw new Error(data.error || "Erreur d’envoi")
    toast(data.sent + "/" + data.total + " formulaire(s) envoyé(s)", { type: data.sent ? "success" : "warning" })
    if (data.sent) {
      recipients.value = [emptyRecipient()]
      activeTab.value = "history"
    }
  } catch (error) {
    console.error(error)
    toast(error.message, { type: "error" })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-6xl space-y-6">
    <header>
      <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Suivi client</p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Formulaire d’enlèvement client</h1>
      <p class="mt-2 text-slate-500">Choisissez un client enregistré ou saisissez librement un nouveau destinataire.</p>
    </header>

    <div class="rounded-2xl border border-slate-200 bg-white p-6">
      <p class="text-sm font-black uppercase text-slate-500">Passage chauffeur</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <button class="btn rounded-lg" :class="passage === 'todo' ? 'bg-primary text-white' : 'bg-slate-50'" @click="passage = 'todo'">À faire</button>
        <button class="btn rounded-lg" :class="passage === 'done' ? 'bg-primary text-white' : 'bg-slate-50'" @click="passage = 'done'">Déjà passé</button>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="(recipient, index) in recipients" :key="index" class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_48px]">
          <input v-model="recipient.name" class="input input-bordered w-full rounded-lg" placeholder="Nom client" />
          <input v-model="recipient.phone" type="tel" class="input input-bordered w-full rounded-lg" placeholder="Téléphone (+33… ou +237…)" />
          <input v-model="recipient.address" class="input input-bordered w-full rounded-lg" placeholder="Adresse optionnelle" />
          <button class="btn btn-square rounded-lg text-red-600" aria-label="Supprimer" @click="removeRow(index)"><Trash2 class="h-4 w-4" /></button>
        </div>
        <div class="mt-3 flex items-center justify-between gap-3 text-xs">
          <span v-if="recipient.customerId" class="rounded-full bg-emerald-50 px-3 py-1 font-black text-emerald-700">Client enregistré</span>
          <button v-else-if="recipient.name && recipient.phone && !customerExists(recipient.phone)" class="inline-flex items-center gap-1 font-black text-primary hover:underline" @click="saveContact(recipient)"><UserPlus class="h-3.5 w-3.5" /> Enregistrer maintenant</button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      <button class="btn rounded-lg border-slate-200 bg-white" @click="addRow"><Plus class="h-4 w-4" /> Ajouter une ligne</button>
      <button class="btn rounded-lg bg-primary text-white" :disabled="sending || !validRecipients.length" @click="sendForms">
        <span v-if="sending" class="loading loading-spinner loading-sm"></span><Send v-else class="h-4 w-4" />
        Envoyer à {{ validRecipients.length }} client(s)
      </button>
    </div>

    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div class="flex border-b border-slate-200 bg-slate-50 p-2">
        <button class="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black" :class="activeTab === 'customers' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'" @click="activeTab = 'customers'"><Users class="h-4 w-4" /> Clients enregistrés ({{ customers.length }})</button>
        <button class="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black" :class="activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'" @click="activeTab = 'history'"><Send class="h-4 w-4" /> Derniers clients ({{ uniqueInviteCount }})</button>
      </div>

      <div v-if="activeTab === 'customers'" class="p-5">
        <label class="input input-bordered flex h-12 items-center gap-2 rounded-xl border-slate-200"><Search class="h-4 w-4 text-slate-400" /><input v-model="customerSearch" class="grow" placeholder="Rechercher par nom, téléphone ou adresse..." /></label>
        <div class="mt-4 max-h-[430px] divide-y divide-slate-100 overflow-y-auto">
          <div v-for="customer in filteredCustomers" :key="customer.id" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p class="font-black text-slate-950">{{ customerName(customer) }}</p><p class="mt-1 text-sm text-slate-500">{{ customerPhone(customer) }}<span v-if="customerAddress(customer)"> · {{ customerAddress(customer) }}</span></p></div>
            <button class="btn btn-sm rounded-lg border-primary bg-white text-primary" @click="useCustomer(customer)"><Plus class="h-4 w-4" /> Utiliser</button>
          </div>
          <p v-if="!filteredCustomers.length" class="py-10 text-center text-sm text-slate-500">Aucun client trouvé.</p>
        </div>
      </div>

      <div v-else class="p-5">
        <label class="input input-bordered flex h-12 items-center gap-2 rounded-xl border-slate-200"><Search class="h-4 w-4 text-slate-400" /><input v-model="historySearch" class="grow" placeholder="Rechercher dans les derniers envois..." /></label>
        <div class="mt-4 max-h-[430px] divide-y divide-slate-100 overflow-y-auto">
          <div v-for="invite in filteredInvites" :key="invite.id" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p class="font-black text-slate-950">{{ invite.name }}</p><p class="mt-1 text-sm text-slate-500">{{ invite.phone }}<span v-if="invite.address"> · {{ invite.address }}</span></p><p class="mt-1 text-xs font-bold text-slate-400">{{ formatDate(invite.createdAt) }} · {{ invite.passage === 'done' ? 'Déjà passé' : 'À faire' }}</p></div>
            <div class="flex gap-2">
              <button class="btn btn-sm rounded-lg border-slate-200 bg-white" @click="useCustomer({ id: '', nom: invite.name, telephone: invite.phone, adresse: invite.address })">Réutiliser</button>
              <button v-if="!customerExists(invite.phone)" class="btn btn-sm rounded-lg bg-primary text-white" :disabled="savingPhone === invite.phone" @click="saveContact(invite)"><UserPlus class="h-4 w-4" /> Enregistrer</button>
              <span v-else class="self-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Dans le carnet</span>
            </div>
          </div>
          <p v-if="!filteredInvites.length" class="py-10 text-center text-sm text-slate-500">Aucun envoi trouvé.</p>
        </div>
      </div>
    </div>
  </section>
</template>
