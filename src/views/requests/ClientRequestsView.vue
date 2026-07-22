<script setup>
import { computed, onMounted, ref } from "vue"
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import { Check, Search } from "lucide-vue-next"
import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"

const db = useFirestore()
const store = useAuthStore()
const requests = ref([])
const loading = ref(false)
const filter = ref("pending")
const search = ref("")
const selected = ref(null)
const entrepriseId = computed(() => store.entreprise?.id || store.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID)
const pendingCount = computed(() => requests.value.filter(item => item.status === "pending").length)
const validatedCount = computed(() => requests.value.filter(item => item.status === "validated").length)
const visibleRequests = computed(() => requests.value.filter(item => {
  const matchesStatus = filter.value === "all" || item.status === filter.value
  const term = search.value.trim().toLowerCase()
  const matchesSearch = !term || `${item.clientNom} ${item.clientTelephone} ${item.adresseEnlevement} ${item.destinataire}`.toLowerCase().includes(term)
  return matchesStatus && matchesSearch
}))

async function fetchRequests() {
  loading.value = true
  try {
    const snap = await getDocs(query(collection(db, "clientRequests"), where("entrepriseId", "==", entrepriseId.value)))
    requests.value = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
  } finally { loading.value = false }
}

async function validateRequest(item) {
  await updateDoc(doc(db, "clientRequests", item.id), { status: "validated", validatedAt: serverTimestamp(), validatedBy: store.getCurrentUser()?.uid || "" })
  await fetchRequests()
  toast("Demande validée", { type: "success" })
}

function formatDate(value) {
  if (!value?.toDate) return "-"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(value.toDate())
}

onMounted(fetchRequests)
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Suivi client</p><h1 class="mt-3 text-4xl font-black tracking-[-0.04em]">Demandes d’enlèvement</h1><p class="mt-2 text-slate-500">Demandes envoyées par les clients depuis leur formulaire SMS.</p></div>
      <div class="flex gap-3"><span class="rounded-full bg-amber-50 px-4 py-2 font-bold text-amber-700">En attente : {{ pendingCount }}</span><span class="rounded-full bg-emerald-50 px-4 py-2 font-bold text-emerald-700">Validées : {{ validatedCount }}</span></div>
    </header>
    <div class="flex flex-wrap gap-2"><button v-for="item in [{v:'all',l:'Toutes'},{v:'pending',l:'En attente'},{v:'validated',l:'Validées'}]" :key="item.v" class="btn rounded-full" :class="filter === item.v ? 'bg-primary text-white' : 'bg-white'" @click="filter = item.v">{{ item.l }}</button></div>
    <label class="input input-bordered flex h-12 max-w-xl items-center gap-2 rounded-lg bg-white"><Search class="h-4 w-4 text-slate-400" /><input v-model="search" class="grow" placeholder="Client, téléphone, adresse…" /></label>
    <p v-if="loading" class="p-8 text-center text-slate-500">Chargement…</p>
    <p v-else-if="!visibleRequests.length" class="rounded-2xl bg-white p-8 text-center text-slate-500">Aucune demande.</p>
    <div v-for="item in visibleRequests" v-else :key="item.id" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-black">{{ item.clientNom }}</h2><span class="text-slate-400">•</span><span>{{ item.destination }} • {{ item.typeDeFret }}</span><span class="rounded-full px-3 py-1 text-xs font-black" :class="item.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'">{{ item.status === 'pending' ? 'En attente' : 'Validée' }}</span></div><p class="mt-2 text-sm text-slate-500">{{ item.clientTelephone }} · {{ item.adresseEnlevement }} · {{ item.nombreDeColis }} colis · {{ formatDate(item.createdAt) }}</p><p class="mt-2 font-semibold text-slate-700">{{ item.descriptionColis }}</p></div>
        <div class="flex gap-2"><button class="btn rounded-lg bg-white" @click="selected = item">Détails</button><button v-if="item.status === 'pending'" class="btn rounded-lg bg-emerald-600 text-white" @click="validateRequest(item)"><Check class="h-4 w-4" /> Valider</button></div>
      </div>
    </div>
    <dialog class="modal" :open="Boolean(selected)"><div v-if="selected" class="modal-box max-w-2xl rounded-3xl bg-white text-slate-900"><h2 class="text-2xl font-black">Demande de {{ selected.clientNom }}</h2><dl class="mt-6 grid gap-4 sm:grid-cols-2"><div><dt class="text-xs font-bold uppercase text-slate-400">Téléphone</dt><dd>{{ selected.clientTelephone }}</dd></div><div><dt class="text-xs font-bold uppercase text-slate-400">Adresse</dt><dd>{{ selected.adresseEnlevement }}</dd></div><div><dt class="text-xs font-bold uppercase text-slate-400">Destinataire</dt><dd>{{ selected.destinataire || '-' }}</dd></div><div><dt class="text-xs font-bold uppercase text-slate-400">Téléphone destinataire</dt><dd>{{ selected.telephoneDestinataire || '-' }}</dd></div><div class="sm:col-span-2"><dt class="text-xs font-bold uppercase text-slate-400">Colis</dt><dd>{{ selected.descriptionColis }}</dd></div><div class="sm:col-span-2"><dt class="text-xs font-bold uppercase text-slate-400">Notes</dt><dd>{{ selected.notes || '-' }}</dd></div></dl><button class="btn mt-6 w-full" @click="selected = null">Fermer</button></div><button class="modal-backdrop" @click="selected = null">Fermer</button></dialog>
  </section>
</template>
