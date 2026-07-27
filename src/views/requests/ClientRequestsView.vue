<script setup>
import { computed, onMounted, ref } from "vue"
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { useRouter } from "vue-router"
import { toast } from "vue3-toastify"
import { Check, Search } from "lucide-vue-next"
import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"
import { syncPublicTracking } from "../../utils/publicTracking"

const db = useFirestore()
const router = useRouter()
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

function openRequest(item) {
  selected.value = JSON.parse(JSON.stringify(item))
  selected.value.statut ||= "Non Payé"
  selected.value.modeDePaiement ||= "Espèces"
  selected.value.prix = Number(selected.value.prix || 0)
  selected.value.resteAPayer = Number(selected.value.resteAPayer || 0)
  selected.value.colis = (selected.value.colis || []).map(entry => ({
    ...entry,
    typeTarif: entry.typeTarif || "libre",
    prixUnitaire: Number(entry.prixUnitaire || 0),
    prixParM3: Number(entry.prixParM3 || 0),
    volumeM3: Number(entry.volumeM3 || 0),
    totalLigne: Number(entry.totalLigne || 0),
    dimensions: entry.dimensions || { longueur: 0, largeur: 0, hauteur: 0 }
  }))
}

function addRequestPackage() {
  selected.value.colis ||= []
  selected.value.colis.push({
    nom: "",
    quantite: 1,
    typeTarif: "libre",
    prixUnitaire: 0,
    prixParM3: 0,
    dimensions: { longueur: 0, largeur: 0, hauteur: 0 },
    volumeM3: 0,
    totalLigne: 0
  })
}

function removeRequestPackage(index) {
  if ((selected.value.colis || []).length <= 1) return
  selected.value.colis.splice(index, 1)
}

function calculateRequestPackage(entry) {
  const quantity = Math.max(1, Number(entry.quantite || 1))
  if (entry.typeTarif === "fixe") {
    entry.volumeM3 = 0
    entry.totalLigne = Number((quantity * Number(entry.prixUnitaire || 0)).toFixed(2))
  }
  if (entry.typeTarif === "volume") {
    const dimensions = entry.dimensions || { longueur: 0, largeur: 0, hauteur: 0 }
    entry.dimensions = dimensions
    entry.volumeM3 = Number((
      quantity
      * Number(dimensions.longueur || 0)
      * Number(dimensions.largeur || 0)
      * Number(dimensions.hauteur || 0)
      / 1_000_000
    ).toFixed(4))
    entry.totalLigne = Number((entry.volumeM3 * Number(entry.prixParM3 || 0)).toFixed(2))
  }
}

async function saveRequest() {
  if (!selected.value?.id) return
  loading.value = true
  try {
    const packages = (selected.value.colis || []).map(entry => {
      calculateRequestPackage(entry)
      return {
        ...entry,
        quantite: Math.max(1, Number(entry.quantite || 1)),
        prixUnitaire: Math.max(0, Number(entry.prixUnitaire || 0)),
        prixParM3: Math.max(0, Number(entry.prixParM3 || 0)),
        volumeM3: Math.max(0, Number(entry.volumeM3 || 0)),
        totalLigne: Math.max(0, Number(entry.totalLigne || 0))
      }
    })
    const calculatedPrice = packages.reduce((sum, entry) => sum + entry.totalLigne, 0)
    if (
      packages.some(entry => ["fixe", "volume"].includes(entry.typeTarif))
      && Number(selected.value.prix || 0) <= 0
    ) {
      selected.value.prix = Number(calculatedPrice.toFixed(2))
      if (selected.value.statut === "Non Payé") selected.value.resteAPayer = selected.value.prix
      if (selected.value.statut === "Payé") selected.value.resteAPayer = 0
    }
    const payload = {
      clientNom: selected.value.clientNom || "",
      clientTelephone: selected.value.clientTelephone || "",
      adresseEnlevement: selected.value.adresseEnlevement || "",
      destinataire: selected.value.destinataire || "",
      telephoneDestinataire: selected.value.telephoneDestinataire || "",
      destination: selected.value.destination || "Cameroun",
      typeDeFret: selected.value.typeDeFret || "Maritime",
      personneEnCharge: selected.value.personneEnCharge || "",
      telephoneAgent: selected.value.telephoneAgent || "",
      poidsTotal: Math.max(0, Number(selected.value.poidsTotal || 0)),
      statut: selected.value.statut || "Non Payé",
      prix: Math.max(0, Number(selected.value.prix || 0)),
      resteAPayer: Math.max(0, Number(selected.value.resteAPayer || 0)),
      modeDePaiement: selected.value.modeDePaiement || "Espèces",
      colis: packages,
      nombreDeColis: packages.reduce((sum, entry) => sum + entry.quantite, 0),
      descriptionColis: packages.map(entry => `${entry.quantite} × ${entry.nom}`).join(", "),
      notes: selected.value.notes || "",
      updatedAt: serverTimestamp()
    }
    await updateDoc(doc(db, "clientRequests", selected.value.id), payload)
    Object.assign(selected.value, payload)
    await fetchRequests()
    toast("Modifications enregistrées", { type: "success" })
  } catch (error) {
    console.error(error)
    toast("Enregistrement impossible", { type: "error" })
  } finally {
    loading.value = false
  }
}

async function fetchRequests() {
  loading.value = true
  try {
    const snap = await getDocs(query(collection(db, "clientRequests"), where("entrepriseId", "==", entrepriseId.value)))
    requests.value = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
  } finally { loading.value = false }
}

async function validateRequest(item) {
  if (!window.confirm("Valider cette demande et créer le colis ?")) return
  loading.value = true
  try {
    const requestRef = doc(db, "clientRequests", item.id)
    const enlevementRef = doc(collection(db, "enlevements"))
    const packages = Array.isArray(item.colis) && item.colis.length
      ? item.colis
      : [{ nom: item.descriptionColis || "Colis", quantite: item.nombreDeColis || 1 }]
    packages.forEach(calculateRequestPackage)
    if (
      packages.some(entry => ["fixe", "volume"].includes(entry.typeTarif))
      && Number(item.prix || 0) <= 0
    ) {
      item.prix = Number(packages.reduce((sum, entry) => sum + Number(entry.totalLigne || 0), 0).toFixed(2))
      if (item.statut === "Non Payé") item.resteAPayer = item.prix
      if (item.statut === "Payé") item.resteAPayer = 0
    }
    const totalQuantity = packages.reduce((sum, entry) => sum + Math.max(1, Number(entry.quantite || 1)), 0)
    const unitWeight = item.typeDeFret === "Aérien" && totalQuantity
      ? Number((Number(item.poidsTotal || 0) / totalQuantity).toFixed(2))
      : 0
    const colis = packages.map(entry => {
      const quantity = Math.max(1, Number(entry.quantite || 1))
      return {
        nom: entry.nom,
        quantite: quantity,
        catalogueId: entry.catalogueId || "",
        typeTarif: entry.typeTarif || "libre",
        prixUnitaire: Number(entry.prixUnitaire || 0),
        prixParM3: Number(entry.prixParM3 || 0),
        dimensions: entry.dimensions || null,
        volumeM3: Number(entry.volumeM3 || 0),
        totalLigne: Number(entry.totalLigne || 0),
        poids: unitWeight,
        poidsTotal: Number((unitWeight * quantity).toFixed(2)),
        details: Array.from({ length: quantity }, (_, index) => ({
          packageId: "PKG-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
          coli: entry.nom + " " + (index + 1) + "/" + quantity,
          statutColis: "En attente",
          poids: unitWeight,
          voyageId: ""
        }))
      }
    })
    const data = {
      numero: "COL-" + Date.now(),
      expediteur: item.clientNom,
      telephoneExpediteur: item.clientTelephone,
      adresseEnlevement: item.adresseEnlevement || "",
      indicatifExpediteur: "",
      destinataire: item.destinataire,
      telephoneDestinataire: item.telephoneDestinataire,
      indicatifDestinataire: "",
      destination: "Cameroun",
      typeDeFret: item.typeDeFret || "Maritime",
      personneEnCharge: item.typeDeFret === "Aérien" ? item.personneEnCharge || "" : "",
      telephoneAgent: item.typeDeFret === "Aérien" ? item.telephoneAgent || "" : "",
      indicatifAgent: "",
      statut: item.statut || "Non Payé",
      prix: Number(item.prix || 0),
      resteAPayer: Number(item.resteAPayer || 0),
      modeDePaiement: item.modeDePaiement || "Espèces",
      colis,
      nombreDeColis: totalQuantity,
      poidsTotal: item.typeDeFret === "Aérien" ? Number(item.poidsTotal || 0) : 0,
      notes: item.notes || "",
      deliveryStatus: "En attente",
      entrepriseId: entrepriseId.value,
      customerId: "",
      requestId: item.id,
      date: new Date().toISOString(),
      createdAt: serverTimestamp()
    }

    await runTransaction(db, async transaction => {
      const freshRequest = await transaction.get(requestRef)
      if (!freshRequest.exists() || freshRequest.data().status !== "pending") {
        throw new Error("Cette demande a déjà été traitée")
      }
      transaction.set(enlevementRef, data)
      transaction.update(requestRef, {
        clientNom: item.clientNom || "",
        clientTelephone: item.clientTelephone || "",
        adresseEnlevement: item.adresseEnlevement || "",
        destinataire: item.destinataire || "",
        telephoneDestinataire: item.telephoneDestinataire || "",
        typeDeFret: item.typeDeFret || "Maritime",
        personneEnCharge: item.personneEnCharge || "",
        telephoneAgent: item.telephoneAgent || "",
        poidsTotal: Number(item.poidsTotal || 0),
        statut: item.statut || "Non Payé",
        prix: Number(item.prix || 0),
        resteAPayer: Number(item.resteAPayer || 0),
        modeDePaiement: item.modeDePaiement || "Espèces",
        colis: packages,
        nombreDeColis: totalQuantity,
        notes: item.notes || "",
        status: "validated",
        enlevementId: enlevementRef.id,
        validatedAt: serverTimestamp(),
        validatedBy: store.getCurrentUser()?.uid || ""
      })
    })

    await syncPublicTracking(db, { ...data, id: enlevementRef.id }, store.entreprise, enlevementRef.id)
    selected.value = null
    await fetchRequests()
    toast("Demande validée et colis créé", { type: "success" })
  } catch (error) {
    console.error(error)
    toast(error.message || "Validation impossible", { type: "error" })
  } finally {
    loading.value = false
  }
}

function openShipment(item) {
  if (item.enlevementId) router.push("/liste/" + item.enlevementId)
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
        <div class="flex gap-2"><button class="btn rounded-lg bg-white" @click="openRequest(item)">Vérifier / modifier</button><button v-if="item.status === 'pending'" class="btn rounded-lg bg-emerald-600 text-white" @click="validateRequest(item)"><Check class="h-4 w-4" /> Valider et créer</button><button v-else-if="item.enlevementId" class="btn rounded-lg bg-primary text-white" @click="openShipment(item)">Voir le colis</button></div>
      </div>
    </div>
    <dialog class="modal" :open="Boolean(selected)">
      <div v-if="selected" class="modal-box max-w-5xl rounded-3xl bg-white text-slate-900">
        <h2 class="text-2xl font-black">Vérifier et modifier la demande</h2>
        <p class="mt-2 text-sm text-slate-500">Les informations enregistrées ici seront reprises telles quelles dans le colis.</p>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Expéditeur</span><input v-model="selected.clientNom" class="input input-bordered w-full rounded-xl" /></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Téléphone expéditeur</span><input v-model="selected.clientTelephone" class="input input-bordered w-full rounded-xl" /></label>
          <label class="sm:col-span-2"><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Adresse d’enlèvement</span><input v-model="selected.adresseEnlevement" class="input input-bordered w-full rounded-xl" /></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Destinataire</span><input v-model="selected.destinataire" class="input input-bordered w-full rounded-xl" /></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Téléphone destinataire</span><input v-model="selected.telephoneDestinataire" class="input input-bordered w-full rounded-xl" /></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Transport</span><select v-model="selected.typeDeFret" class="select select-bordered w-full rounded-xl"><option>Maritime</option><option>Aérien</option></select></label>
          <label v-if="selected.typeDeFret === 'Aérien'"><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Poids total (kg)</span><input v-model.number="selected.poidsTotal" type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl" /></label>
          <template v-if="selected.typeDeFret === 'Aérien'">
            <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Agent</span><input v-model="selected.personneEnCharge" class="input input-bordered w-full rounded-xl" /></label>
            <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Téléphone agent</span><input v-model="selected.telephoneAgent" class="input input-bordered w-full rounded-xl" /></label>
          </template>
        </div>

        <div class="mt-6">
          <div class="flex items-center justify-between"><h3 class="font-black">Colis et tarification</h3><button type="button" class="btn btn-sm rounded-xl" @click="addRequestPackage">Ajouter</button></div>
          <div class="mt-3 space-y-3">
            <div v-for="(entry, index) in selected.colis || []" :key="index" class="rounded-2xl bg-slate-50 p-4">
              <div class="grid gap-3 sm:grid-cols-[1fr_100px_140px_48px]">
                <input v-model="entry.nom" class="input input-bordered w-full rounded-xl bg-white" placeholder="Article" />
                <input v-model.number="entry.quantite" type="number" min="1" class="input input-bordered w-full rounded-xl bg-white" />
                <select v-model="entry.typeTarif" class="select select-bordered w-full rounded-xl bg-white"><option value="libre">Libre</option><option value="fixe">Prix fixe</option><option value="volume">Au m³</option></select>
                <button type="button" class="btn btn-square rounded-xl text-red-600" @click="removeRequestPackage(index)">×</button>
              </div>
              <div v-if="entry.typeTarif === 'fixe'" class="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span class="mb-1 block text-xs text-slate-500">Prix unitaire</span><input v-model.number="entry.prixUnitaire" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs text-slate-500">Total ligne</span><input v-model.number="entry.totalLigne" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl bg-white" /></label>
              </div>
              <div v-if="entry.typeTarif === 'volume'" class="mt-3 grid gap-3 sm:grid-cols-5">
                <label><span class="mb-1 block text-xs text-slate-500">L (cm)</span><input v-model.number="entry.dimensions.longueur" type="number" min="0" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs text-slate-500">l (cm)</span><input v-model.number="entry.dimensions.largeur" type="number" min="0" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs text-slate-500">H (cm)</span><input v-model.number="entry.dimensions.hauteur" type="number" min="0" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs text-slate-500">Prix/m³</span><input v-model.number="entry.prixParM3" type="number" min="0" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs text-slate-500">Total ligne</span><input v-model.number="entry.totalLigne" type="number" min="0" class="input input-bordered w-full rounded-xl bg-white" /></label>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Statut paiement</span><select v-model="selected.statut" class="select select-bordered w-full rounded-xl"><option>Non Payé</option><option>Reste à payer</option><option>Payé</option></select></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Mode de paiement</span><select v-model="selected.modeDePaiement" class="select select-bordered w-full rounded-xl"><option>Espèces</option><option>Chèque</option><option>CB</option><option>Virement</option></select></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Prix</span><input v-model.number="selected.prix" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl" /></label>
          <label><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Reste à payer</span><input v-model.number="selected.resteAPayer" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl" /></label>
          <label class="sm:col-span-2"><span class="mb-2 block text-xs font-bold uppercase text-slate-400">Notes</span><textarea v-model="selected.notes" class="textarea textarea-bordered w-full rounded-xl"></textarea></label>
        </div>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row">
          <button class="btn flex-1 bg-white" @click="selected = null">Fermer</button>
          <button v-if="selected.status === 'pending'" class="btn flex-1 bg-slate-950 text-white" @click="saveRequest">Enregistrer les modifications</button>
          <button v-if="selected.status === 'pending'" class="btn flex-1 bg-emerald-600 text-white" @click="validateRequest(selected)"><Check class="h-4 w-4" /> Valider et créer</button>
        </div>
      </div>
      <button class="modal-backdrop" @click="selected = null">Fermer</button>
    </dialog>
  </section>
</template>
