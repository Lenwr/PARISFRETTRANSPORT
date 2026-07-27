<script setup>
import { ref, computed, onMounted, watch } from "vue"
import { useRouter } from "vue-router"
import { collection, addDoc, getDocs, query, serverTimestamp, where } from "firebase/firestore"
import { useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { Plus, Trash2, Save } from "lucide-vue-next"

import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"
import { parseMoney } from "../../utils/money"
import { syncPublicTracking } from "../../utils/publicTracking"

const db = useFirestore()
const router = useRouter()
const authStore = useAuthStore()

const props = defineProps({
  myId: {
    type: String,
    default: ""
  },
  expediteurData: {
    type: Object,
    default: null
  }
})

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const indicatifs = [
  { pays: "France", code: "+33" },
  { pays: "Cameroun", code: "+237" },
  { pays: "Togo", code: "+228" },
  { pays: "Benin", code: "+229" },
  { pays: "Côte d'Ivoire", code: "+225" },
  { pays: "Mali", code: "+223" },
  { pays: "Sénégal", code: "+221" },
  { pays: "Congo", code: "+242" },
  { pays: "RDC", code: "+243" },
  { pays: "Guinée", code: "+224" },
  { pays: "Gabon", code: "+241" },
  { pays: "États-Unis", code: "+1" }
]

const destinations = ref([
  "Cameroun",
  "Togo",
  "Côte d'Ivoire",
  "Mali",
  "Sénégal",
  "Congo",
  "RDC",
  "Guinée",
  "Gabon",
  "France",
  "États-Unis"
])

const customDestination = ref("")
const loading = ref(false)
const catalogueArticles = ref([])

const emptyColis = () => ({
  nom: "",
  quantite: 1,
  catalogueId: "",
  typeTarif: "libre",
  prixUnitaire: 0,
  prixParM3: 0,
  longueur: 0,
  largeur: 0,
  hauteur: 0
})

const form = ref({
  expediteur: "",
  indicatifExpediteur: "+33",
  telephoneExpediteur: "",

  destinataire: "",
  indicatifDestinataire: "+237",
  telephoneDestinataire: "",

  destination: "Cameroun",
  typeDeFret: "Maritime",

  personneEnCharge: "",
  indicatifAgent: "+33",
  telephoneAgent: "",

  statut: "Non Payé",
  prix: "",
  resteAPayer: "",
  modeDePaiement: "Espèces",
  poidsTotal: "",

  colis: [emptyColis()]
})

watch(
  () => props.expediteurData,
  value => {
    if (!value) return

    const fullName = `${value.nom || ""} ${value.prenom || ""}`.trim()

    if (fullName && !form.value.expediteur) {
      form.value.expediteur = fullName
    }

    if (value.telephone && !form.value.telephoneExpediteur) {
      form.value.telephoneExpediteur = value.telephone
    }
  },
  { immediate: true }
)

const totalQuantite = computed(() =>
  form.value.colis.reduce(
    (total, item) => total + Math.max(Number(item.quantite || 1), 1),
    0
  )
)

const poidsParColis = computed(() => {
  if (form.value.typeDeFret !== "Aérien") return 0

  const poidsTotal = Number(form.value.poidsTotal || 0)
  const quantite = totalQuantite.value || 1

  return poidsTotal / quantite
})

function volumeLigne(item) {
  if (item.typeTarif !== "volume") return 0
  const quantite = Math.max(Number(item.quantite || 1), 1)
  return quantite * Number(item.longueur || 0) * Number(item.largeur || 0) * Number(item.hauteur || 0) / 1_000_000
}

function totalLigne(item) {
  const quantite = Math.max(Number(item.quantite || 1), 1)
  return item.typeTarif === "volume"
    ? volumeLigne(item) * Number(item.prixParM3 || 0)
    : item.typeTarif === "fixe"
      ? quantite * Number(item.prixUnitaire || 0)
      : 0
}

const totalCatalogue = computed(() =>
  form.value.colis.reduce((total, item) => total + totalLigne(item), 0)
)

const tarifCatalogueActif = computed(() =>
  form.value.colis.some(item => item.typeTarif === "fixe" || item.typeTarif === "volume")
)

function formatPrix(value) {
  return Number(value || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
}

watch(totalCatalogue, value => {
  if (!tarifCatalogueActif.value) return
  form.value.prix = Number(value || 0).toFixed(2)
  if (form.value.statut === "Non Payé") form.value.resteAPayer = Number(value || 0).toFixed(2)
  if (form.value.statut === "Payé") form.value.resteAPayer = "0.00"
})

watch(() => form.value.statut, statut => {
  if (statut === "Payé") form.value.resteAPayer = "0.00"
  if (statut === "Non Payé" && tarifCatalogueActif.value) {
    form.value.resteAPayer = totalCatalogue.value.toFixed(2)
  }
})

function generatePackageId() {
  return `PKG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
}

function generateNumero() {
  return `COL-${Date.now()}`
}

function normalizePhone(indicatif, phone) {
  const cleaned = String(phone || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")

  if (!cleaned) return ""

  if (cleaned.startsWith("+")) return cleaned

  return `${indicatif}${cleaned.replace(/^0+/, "")}`
}

function addDestination() {
  const value = customDestination.value.trim()

  if (!value) return

  if (!destinations.value.includes(value)) {
    destinations.value.push(value)
  }

  form.value.destination = value
  customDestination.value = ""
}

function addColis() {
  form.value.colis.push(emptyColis())
}

async function fetchCatalogue() {
  if (!entrepriseId.value) return

  try {
    const snap = await getDocs(query(
      collection(db, "catalogueArticles"),
      where("entrepriseId", "==", entrepriseId.value)
    ))

    catalogueArticles.value = snap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.actif !== false && item.nom)
      .sort((a, b) => Number(a.ordre || 100) - Number(b.ordre || 100) || a.nom.localeCompare(b.nom))
  } catch (error) {
    console.error("Erreur chargement catalogue :", error)
  }
}

function applyCatalogue(item) {
  const article = catalogueArticles.value.find(article =>
    article.nom.trim().toLowerCase() === String(item.nom || "").trim().toLowerCase()
  )

  if (!article) {
    Object.assign(item, {
      catalogueId: "",
      typeTarif: "libre",
      prixUnitaire: 0,
      prixParM3: 0,
      longueur: 0,
      largeur: 0,
      hauteur: 0
    })
    return
  }

  Object.assign(item, {
    catalogueId: article.id,
    typeTarif: article.typeTarif || "fixe",
    prixUnitaire: Number(article.prixUnitaire || 0),
    prixParM3: Number(article.prixParM3 || 0)
  })
}

function removeColis(index) {
  if (form.value.colis.length <= 1) return
  form.value.colis.splice(index, 1)
}

function buildColis() {
  return form.value.colis.map(item => {
    const quantite = Math.max(Number(item.quantite || 1), 1)

    const poidsUnitaire = form.value.typeDeFret === "Aérien"
      ? Number(poidsParColis.value.toFixed(2))
      : 0
    const poidsTotal = form.value.typeDeFret === "Aérien"
      ? Number((poidsUnitaire * quantite).toFixed(2))
      : 0

    const details = Array.from({ length: quantite }, (_, i) => ({
      packageId: generatePackageId(),
      coli: `${item.nom} ${i + 1}/${quantite}`,
      statutColis: "En attente",
      poids: poidsUnitaire,
      voyageId: ""
    }))

    return {
      nom: item.nom,
      quantite,
      catalogueId: item.catalogueId || "",
      typeTarif: item.typeTarif || "libre",
      prixUnitaire: Number(item.prixUnitaire || 0),
      prixParM3: Number(item.prixParM3 || 0),
      dimensions: item.typeTarif === "volume" ? {
        longueur: Number(item.longueur || 0),
        largeur: Number(item.largeur || 0),
        hauteur: Number(item.hauteur || 0)
      } : null,
      volumeM3: Number(volumeLigne(item).toFixed(4)),
      totalLigne: Number(totalLigne(item).toFixed(2)),
      poids: poidsUnitaire,
      poidsTotal,
      details
    }
  })
}

async function submit() {
  if (!entrepriseId.value) {
    toast("Entreprise introuvable", { type: "error", autoClose: 1500 })
    return
  }

  if (!form.value.destination) {
    toast("Destination requise", { type: "warning", autoClose: 1500 })
    return
  }

  loading.value = true

  try {
    const colis = buildColis()

    const nombreDeColis = colis.reduce(
      (total, item) => total + Number(item.quantite || 0),
      0
    )

    const poidsTotal = form.value.typeDeFret === "Aérien"
      ? Number(form.value.poidsTotal || 0)
      : 0

    const data = {
      numero: generateNumero(),

      expediteur: form.value.expediteur,
      telephoneExpediteur: normalizePhone(
        form.value.indicatifExpediteur,
        form.value.telephoneExpediteur
      ),
      indicatifExpediteur: form.value.indicatifExpediteur,

      destinataire: form.value.destinataire,
      telephoneDestinataire: normalizePhone(
        form.value.indicatifDestinataire,
        form.value.telephoneDestinataire
      ),
      indicatifDestinataire: form.value.indicatifDestinataire,

      destination: form.value.destination,
      typeDeFret: form.value.typeDeFret,

      personneEnCharge:
        form.value.typeDeFret === "Aérien"
          ? form.value.personneEnCharge
          : "",

      telephoneAgent:
        form.value.typeDeFret === "Aérien"
          ? normalizePhone(form.value.indicatifAgent, form.value.telephoneAgent)
          : "",

      indicatifAgent:
        form.value.typeDeFret === "Aérien"
          ? form.value.indicatifAgent
          : "",

      statut: form.value.statut,
      prix: parseMoney(form.value.prix),
      resteAPayer: parseMoney(form.value.resteAPayer),
      modeDePaiement: form.value.modeDePaiement,

      colis,
      nombreDeColis,
      poidsTotal,

      deliveryStatus: "En attente",
      entrepriseId: entrepriseId.value,
      customerId: props.myId || "",
      date: new Date().toISOString(),
      createdAt: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, "enlevements"), data)

    await syncPublicTracking(
      db,
      {
        ...data,
        id: docRef.id
      },
      authStore.entreprise,
      docRef.id
    )

    toast("Colis enregistré", { type: "success", autoClose: 1200 })

    router.push(`/liste/${docRef.id}`)
  } catch (error) {
    console.error(error)
    toast("Erreur lors de l’enregistrement", {
      type: "error",
      autoClose: 1500
    })
  } finally {
    loading.value = false
  }
}

onMounted(fetchCatalogue)
</script>

<template>
  <section class="min-h-screen px-1 py-2">
    <div class="mx-auto max-w-6xl">
      <div class="mb-10">
        <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Nouveau colis</p>
        <h1 class="mt-4 text-5xl font-black leading-[0.98] tracking-[-0.055em] text-slate-950">
          Enregistrer un colis
        </h1>
        <p class="mt-5 max-w-2xl text-base leading-7 text-slate-500">
          Créez un dossier clair avec expéditeur, destinataire, transport, colis et paiement.
        </p>
      </div>

      <form class="space-y-6" @submit.prevent="submit">
        <datalist id="catalogue-articles">
          <option v-for="article in catalogueArticles" :key="article.nom" :value="article.nom">
            {{ article.categorie }} · {{ article.unite }}
          </option>
        </datalist>
        <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:p-8">
          <h2 class="mb-6 text-2xl font-black tracking-[-0.04em]">Informations client</h2>

          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <input v-model="form.expediteur" required class="input input-bordered rounded-2xl"
              placeholder="Expéditeur" />

            <div class="flex gap-2">
              <select v-model="form.indicatifExpediteur" class="select select-bordered w-32 rounded-2xl">
                <option v-for="item in indicatifs" :key="item.code" :value="item.code">
                  {{ item.code }}
                </option>
              </select>

              <input v-model="form.telephoneExpediteur" required type="tel"
                class="input input-bordered w-full rounded-2xl" placeholder="Téléphone expéditeur" />
            </div>

            <input v-model="form.destinataire" required class="input input-bordered rounded-2xl"
              placeholder="Destinataire" />

            <div class="flex gap-2">
              <select v-model="form.indicatifDestinataire" class="select select-bordered w-32 rounded-2xl">
                <option v-for="item in indicatifs" :key="item.code" :value="item.code">
                  {{ item.code }}
                </option>
              </select>

              <input v-model="form.telephoneDestinataire" required type="tel"
                class="input input-bordered w-full rounded-2xl" placeholder="Téléphone destinataire" />
            </div>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:p-8">
          <h2 class="mb-6 text-2xl font-black tracking-[-0.04em]">Transport</h2>

          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <select v-model="form.typeDeFret" class="select select-bordered rounded-2xl">
              <option>Maritime</option>
              <option>Aérien</option>
            </select>

            <select v-model="form.destination" required class="select select-bordered rounded-2xl">
              <option value="" disabled>Choisir une destination</option>
              <option v-for="destination in destinations" :key="destination" :value="destination">
                {{ destination }}
              </option>
            </select>

            <div class="flex gap-2 md:col-span-2">
              <input v-model="customDestination" class="input input-bordered w-full rounded-2xl"
                placeholder="Ajouter une destination si absente" />
              <button type="button" class="btn btn-outline rounded-2xl" @click="addDestination">
                Ajouter
              </button>
            </div>

            <template v-if="form.typeDeFret === 'Aérien'">
              <input v-model="form.personneEnCharge" class="input input-bordered rounded-2xl"
                placeholder="Nom de l’agent" />

              <div class="flex gap-2">
                <select v-model="form.indicatifAgent" class="select select-bordered w-32 rounded-2xl">
                  <option v-for="item in indicatifs" :key="item.code" :value="item.code">
                    {{ item.code }}
                  </option>
                </select>

                <input v-model="form.telephoneAgent" type="tel" class="input input-bordered w-full rounded-2xl"
                  placeholder="Téléphone agent" />
              </div>
            </template>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:p-8">
          <div class="mb-6 flex items-center justify-between">
            <h2 class="text-2xl font-black tracking-[-0.04em]">Colis</h2>

            <button type="button" class="btn btn-outline btn-sm rounded-2xl border-slate-950/[0.08]" @click="addColis">
              <Plus class="h-4 w-4" />
              Ajouter
            </button>
          </div>

          <div class="space-y-3">
            <div v-for="(item, index) in form.colis" :key="index"
              class="rounded-2xl border border-slate-950/[0.06] bg-slate-50/70 p-4">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_110px_48px]">
              <div>
                <input v-model="item.nom" list="catalogue-articles" required class="input input-bordered w-full rounded-2xl" placeholder="Écrire ou choisir un article" @change="applyCatalogue(item)" @blur="applyCatalogue(item)" />
                <p class="mt-1 px-1 text-xs text-slate-400">Saisie libre ou sélection dans le catalogue</p>
              </div>

              <input v-model.number="item.quantite" required type="number" min="1"
                class="input input-bordered rounded-2xl text-center" placeholder="Qté" />

              <button type="button" class="btn btn-ghost btn-circle text-red-500" @click="removeColis(index)">
                <Trash2 class="h-5 w-5" />
              </button>
              </div>

              <div v-if="item.typeTarif === 'volume'" class="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end">
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Longueur (cm)</span><input v-model.number="item.longueur" type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl" /></label>
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Largeur (cm)</span><input v-model.number="item.largeur" type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl" /></label>
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Hauteur (cm)</span><input v-model.number="item.hauteur" type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl" /></label>
                <div class="rounded-xl bg-white px-4 py-3 text-sm"><span class="block text-xs text-slate-400">Volume</span><strong>{{ volumeLigne(item).toFixed(3) }} m³</strong></div>
                <div class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"><span class="block text-xs">À {{ formatPrix(item.prixParM3) }}/m³</span><strong>{{ formatPrix(totalLigne(item)) }}</strong></div>
              </div>
              <div v-else-if="item.typeTarif === 'fixe'" class="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm">
                <span class="text-slate-500">Prix fixe : {{ formatPrix(item.prixUnitaire) }} × {{ item.quantite || 1 }}</span>
                <strong class="text-primary">{{ formatPrix(totalLigne(item)) }}</strong>
              </div>
            </div>
          </div>

          <div v-if="form.typeDeFret === 'Aérien'" class="mt-5 rounded-2xl border border-slate-950/[0.07] bg-white/70 p-5">
            <label class="text-sm font-bold text-slate-700" for="poids-total">
              Poids total des colis
            </label>

            <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <input id="poids-total" v-model.number="form.poidsTotal" required type="number" min="0" step="0.1"
                class="input input-bordered rounded-2xl" placeholder="Poids total kg" />

              <p class="text-sm font-semibold text-slate-500">
                {{ totalQuantite }} colis · {{ poidsParColis.toFixed(2) }} kg / colis
              </p>
            </div>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:p-8">
          <h2 class="mb-6 text-2xl font-black tracking-[-0.04em]">Paiement</h2>

          <div v-if="tarifCatalogueActif" class="mb-5 flex items-center justify-between rounded-2xl bg-primary/10 px-5 py-4">
            <span class="font-bold text-slate-700">Total calculé depuis le catalogue</span>
            <strong class="text-xl text-primary">{{ formatPrix(totalCatalogue) }}</strong>
          </div>

          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <select v-model="form.statut" class="select select-bordered rounded-2xl">
              <option>Non Payé</option>
              <option>Reste à payer</option>
              <option>Payé</option>
            </select>

            <select v-model="form.modeDePaiement" class="select select-bordered rounded-2xl">
              <option>Espèces</option>
              <option>Chèque</option>
              <option>CB</option>
              <option>Virement</option>
            </select>

            <label>
              <span class="mb-1 block text-xs font-bold text-slate-500">Prix final modifiable</span>
              <input v-model="form.prix" inputmode="decimal" class="input input-bordered w-full rounded-2xl"
                placeholder="Prix" />
            </label>

            <input v-model="form.resteAPayer" inputmode="decimal"
              class="input input-bordered rounded-2xl" placeholder="Reste à payer" />
          </div>
        </div>

        <button type="submit" class="btn btn-primary h-14 w-full rounded-2xl text-base" :disabled="loading">
          <Save class="h-5 w-5" />
          {{ loading ? "Enregistrement..." : "Enregistrer le colis" }}
        </button>
      </form>
    </div>
  </section>
</template>
