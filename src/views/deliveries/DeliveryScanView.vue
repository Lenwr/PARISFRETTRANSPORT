<script setup>
import { computed, ref } from "vue"
import { StreamBarcodeReader } from "vue-barcode-reader"
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { useRouter } from "vue-router"
import { Camera, CheckCircle2, Keyboard, PackageCheck, Store } from "lucide-vue-next"
import { toast } from "vue3-toastify"
import { useAuthStore } from "../../stores/useAuthStore"

const db = useFirestore()
const router = useRouter()
const authStore = useAuthStore()
const scanning = ref(false)
const loading = ref(false)
const manualCode = ref("")
const result = ref(null)
const deliveryMode = ref("delivery")
let lastScan = ""
let lastScanAt = 0

const scannedPackage = computed(() => {
  if (!result.value || !Number.isInteger(result.value.colisIndex)) return null
  return result.value.colis?.[result.value.colisIndex] || null
})

const scannedDetail = computed(() => {
  if (!scannedPackage.value || !Number.isInteger(result.value?.detailIndex)) return null
  return scannedPackage.value.details?.[result.value.detailIndex] || null
})

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "Non renseigné" : value
}

function parseQr(value) {
  const raw = String(value || "").trim()
  if (!raw) return null

  if (raw.startsWith("TS|")) {
    const [, id, colisIndex, detailIndex] = raw.split("|")
    return {
      id: id?.trim(),
      colisIndex: Number(colisIndex),
      detailIndex: Number(detailIndex)
    }
  }

  try {
    const url = new URL(raw)
    const numero = url.searchParams.get("code")
    if (numero) return { numero: numero.trim(), colisIndex: null, detailIndex: null }
  } catch {
    // Le contenu n'est pas une URL : on essaie les anciens formats ci-dessous.
  }

  const parts = raw.split(",").map(part => part.trim())

  if (parts.length >= 6) {
    return {
      id: parts[3],
      colisIndex: Number(parts[4]),
      detailIndex: Number(parts[5])
    }
  }

  return { id: raw, colisIndex: null, detailIndex: null }
}

async function findPackage(value) {
  if (loading.value) return
  const raw = String(value || "").trim()
  const now = Date.now()
  if (raw === lastScan && now - lastScanAt < 3000) return
  lastScan = raw
  lastScanAt = now

  const parsed = parseQr(value)
  if (!parsed?.id && !parsed?.numero) return

  loading.value = true
  // Le lecteur émet plusieurs fois le même QR : on coupe la caméra dès la
  // première lecture valide, avant même la requête Firestore.
  scanning.value = false
  try {
    let snapshot

    if (parsed.id) {
      snapshot = await getDoc(doc(db, "enlevements", parsed.id))
    } else {
      const entrepriseId = authStore.entreprise?.id || authStore.userProfile?.entrepriseId
      if (!entrepriseId) throw new Error("Votre entreprise n’est pas identifiée")
      const matches = await getDocs(query(
        collection(db, "enlevements"),
        where("entrepriseId", "==", entrepriseId),
        where("numero", "==", parsed.numero),
        limit(1)
      ))
      snapshot = matches.docs[0]
    }

    if (!snapshot?.exists()) throw new Error("Colis introuvable")
    result.value = { id: snapshot.id, ...snapshot.data(), ...parsed }
  } catch (error) {
    const message = error.code === "permission-denied"
      ? "Vous n’avez pas accès à ce colis. Vérifiez qu’il appartient à votre entreprise."
      : error.message || "QR code non reconnu"
    toast(message, { type: "error", autoClose: 3000 })
  } finally {
    loading.value = false
  }
}

function openSignature() {
  if (!result.value) return
  const query = { mode: deliveryMode.value }
  if (Number.isInteger(result.value.colisIndex)) query.colisIndex = result.value.colisIndex
  if (Number.isInteger(result.value.detailIndex)) query.detailIndex = result.value.detailIndex
  router.push({ path: `/sign/${result.value.id}`, query })
}
</script>

<template>
  <section class="mx-auto max-w-4xl space-y-6">
    <header>
      <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Livraison et récupération</p>
      <h1 class="mt-3 text-4xl font-black tracking-[-0.04em]">Scan livraison</h1>
      <p class="mt-2 text-slate-500">Scannez le QR code du colis avant de recueillir la signature du client.</p>
    </header>

    <div v-if="scanning" class="overflow-hidden rounded-3xl bg-slate-950 shadow-xl">
      <div class="relative min-h-[420px]">
        <StreamBarcodeReader @decode="findPackage" />
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="h-56 w-56 rounded-3xl border-4 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.42)]"></div>
        </div>
      </div>
      <button class="w-full bg-white/10 p-4 font-bold text-white" @click="scanning = false">Fermer la caméra</button>
    </div>

    <div v-else-if="!result" class="grid gap-4 sm:grid-cols-2">
      <button class="rounded-3xl bg-primary p-8 text-left text-white shadow-lg transition hover:-translate-y-1" @click="scanning = true">
        <Camera class="h-9 w-9" />
        <span class="mt-8 block text-xl font-black">Ouvrir la caméra</span>
        <span class="mt-2 block text-sm text-white/70">Scanner le QR code collé sur le colis</span>
      </button>
      <form class="rounded-3xl border border-slate-200 bg-white p-8" @submit.prevent="findPackage(manualCode)">
        <Keyboard class="h-9 w-9 text-primary" />
        <label class="mt-8 block text-sm font-black">Identifiant du colis</label>
        <div class="mt-3 flex gap-2">
          <input v-model="manualCode" class="input input-bordered min-w-0 flex-1 rounded-xl" placeholder="COL-…" />
          <button class="btn rounded-xl bg-slate-950 text-white" :disabled="loading">Rechercher</button>
        </div>
      </form>
    </div>

    <div v-else class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div class="flex items-start gap-4">
        <div class="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><CheckCircle2 class="h-7 w-7" /></div>
        <div>
          <p class="text-sm font-bold text-emerald-700">Colis identifié</p>
          <h2 class="mt-1 text-2xl font-black">{{ result.numero || result.id }}</h2>
          <p class="mt-2 text-slate-500">{{ result.expediteur }} → {{ result.destinataire }}</p>
        </div>
      </div>

      <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Expéditeur</p>
          <p class="mt-2 break-words font-black text-slate-900">{{ displayValue(result.expediteur) }}</p>
          <p class="mt-1 break-words text-sm text-slate-500">{{ displayValue(result.telephoneExpediteur) }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Destinataire</p>
          <p class="mt-2 break-words font-black text-slate-900">{{ displayValue(result.destinataire) }}</p>
          <p class="mt-1 break-words text-sm text-slate-500">{{ displayValue(result.telephoneDestinataire) }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Destination</p>
          <p class="mt-2 break-words font-black text-slate-900">{{ displayValue(result.destination) }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ displayValue(result.typeDeFret) }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Nombre de colis</p>
          <p class="mt-2 font-black text-slate-900">{{ displayValue(result.nombreDeColis) }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Paiement</p>
          <p class="mt-2 font-black text-slate-900">{{ displayValue(result.statut) }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ displayValue(result.modeDePaiement) }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase text-slate-400">Statut livraison</p>
          <p class="mt-2 font-black text-slate-900">{{ displayValue(result.deliveryStatus || "En attente") }}</p>
        </div>
      </div>

      <div v-if="scannedPackage" class="mt-4 rounded-2xl border border-primary/20 bg-teal-50 p-5">
        <p class="text-xs font-black uppercase tracking-wider text-primary">Colis scanné</p>
        <p class="mt-2 text-lg font-black text-slate-900">
          {{ scannedDetail?.coli || scannedPackage.nom }}
        </p>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
          <span v-if="scannedDetail?.packageId">Référence : {{ scannedDetail.packageId }}</span>
          <span v-if="scannedPackage.quantite">Quantité : {{ scannedPackage.quantite }}</span>
          <span v-if="scannedDetail?.poids || scannedPackage.poidsTotal">
            Poids : {{ scannedDetail?.poids || scannedPackage.poidsTotal }} kg
          </span>
          <span>Statut : {{ displayValue(scannedDetail?.statutColis || scannedPackage.statutColis || "En attente") }}</span>
        </div>
      </div>

      <div v-else-if="result.colis?.length" class="mt-4 rounded-2xl border border-slate-200 p-5">
        <p class="text-xs font-black uppercase tracking-wider text-slate-400">Contenu du colis</p>
        <ul class="mt-3 space-y-2">
          <li v-for="(item, index) in result.colis" :key="index" class="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
            <span class="break-words font-bold text-slate-800">{{ displayValue(item.nom) }}</span>
            <span class="shrink-0 text-sm font-bold text-slate-500">× {{ item.quantite || 1 }}</span>
          </li>
        </ul>
      </div>

      <p class="mb-3 mt-8 text-sm font-black">Comment le colis est-il remis ?</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <button class="rounded-2xl border p-5 text-left" :class="deliveryMode === 'delivery' ? 'border-primary bg-teal-50 ring-2 ring-primary/20' : 'border-slate-200'" @click="deliveryMode = 'delivery'">
          <PackageCheck class="h-6 w-6 text-primary" />
          <span class="mt-3 block font-black">Livré au client</span>
          <span class="mt-1 block text-sm text-slate-500">Remise à l’adresse de livraison</span>
        </button>
        <button class="rounded-2xl border p-5 text-left" :class="deliveryMode === 'pickup' ? 'border-primary bg-teal-50 ring-2 ring-primary/20' : 'border-slate-200'" @click="deliveryMode = 'pickup'">
          <Store class="h-6 w-6 text-primary" />
          <span class="mt-3 block font-black">Récupéré par le client</span>
          <span class="mt-1 block text-sm text-slate-500">Retrait et déchargement sur place</span>
        </button>
      </div>

      <div class="mt-8 flex flex-col gap-3 sm:flex-row">
        <button class="btn flex-1 rounded-xl bg-white" @click="result = null">Scanner un autre colis</button>
        <button class="btn flex-1 rounded-xl bg-emerald-600 text-white" @click="openSignature">Signer</button>
      </div>
    </div>
  </section>
</template>
