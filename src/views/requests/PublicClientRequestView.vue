<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Plus, Send, Trash2 } from "lucide-vue-next"
import { firebaseApp } from "../../components/firebaseConfig"

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const sending = ref(false)
const error = ref("")
const company = ref({ name: "Paris Fret Transport", logoUrl: "/images/logo.png" })
const catalogue = ref([])
const endpoint = "https://us-central1-" + firebaseApp.options.projectId + ".cloudfunctions.net/clientRequestForm"
const emptyPackage = () => ({
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
  telephoneExpediteur: "",
  adresseEnlevement: "",
  destinataire: "",
  telephoneDestinataire: "",
  destination: "Cameroun",
  typeDeFret: "Maritime",
  personneEnCharge: "",
  telephoneAgent: "",
  poidsTotal: "",
  statut: "Non Payé",
  prix: 0,
  resteAPayer: 0,
  modeDePaiement: "Espèces",
  colis: [emptyPackage()],
  notes: ""
})

function addPackage() {
  form.value.colis.push(emptyPackage())
}

function removePackage(index) {
  if (form.value.colis.length === 1) form.value.colis[0] = emptyPackage()
  else form.value.colis.splice(index, 1)
}

function volumeM3(item) {
  if (item.typeTarif !== "volume") return 0
  return Math.max(1, Number(item.quantite || 1))
    * Number(item.longueur || 0)
    * Number(item.largeur || 0)
    * Number(item.hauteur || 0)
    / 1_000_000
}

function lineTotal(item) {
  return item.typeTarif === "volume"
    ? volumeM3(item) * Number(item.prixParM3 || 0)
    : item.typeTarif === "fixe"
      ? Math.max(1, Number(item.quantite || 1)) * Number(item.prixUnitaire || 0)
      : 0
}

const calculatedTotal = computed(() =>
  form.value.colis.reduce((total, item) => total + lineTotal(item), 0)
)
const hasCataloguePrice = computed(() =>
  form.value.colis.some(item => ["fixe", "volume"].includes(item.typeTarif))
)
const formatPrice = value => Number(value || 0).toLocaleString("fr-FR", {
  style: "currency",
  currency: "EUR"
})

function applyCatalogue(item) {
  const article = catalogue.value.find(entry =>
    String(entry.nom).trim().toLowerCase() === String(item.nom).trim().toLowerCase()
  )
  if (!article) {
    Object.assign(item, emptyPackage(), { nom: item.nom, quantite: item.quantite || 1 })
    return
  }
  Object.assign(item, {
    catalogueId: article.id || "",
    typeTarif: article.typeTarif || "fixe",
    prixUnitaire: Number(article.prixUnitaire || 0),
    prixParM3: Number(article.prixParM3 || 0)
  })
}

watch(calculatedTotal, total => {
  if (!hasCataloguePrice.value) return
  form.value.prix = Number(total.toFixed(2))
  form.value.resteAPayer = form.value.statut === "Payé" ? 0 : Number(total.toFixed(2))
})

watch(() => form.value.statut, statut => {
  if (statut === "Payé") form.value.resteAPayer = 0
  if (statut === "Non Payé" && hasCataloguePrice.value) {
    form.value.resteAPayer = Number(calculatedTotal.value.toFixed(2))
  }
})

onMounted(async () => {
  try {
    const response = await fetch(endpoint + "?token=" + encodeURIComponent(route.params.token))
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    if (data.invite.submitted) return router.replace({ name: "request-thank-you" })
    company.value = {
      name: data.entreprise?.name || "Paris Fret Transport",
      logoUrl: data.entreprise?.logoUrl || "/images/logo.png"
    }
    catalogue.value = Array.isArray(data.catalogue) ? data.catalogue : []
    form.value.expediteur = data.invite.name || ""
    form.value.telephoneExpediteur = data.invite.phone || ""
    form.value.adresseEnlevement = data.invite.address || ""
  } catch (err) {
    error.value = err.message || "Lien invalide"
  } finally {
    loading.value = false
  }
})

async function submit() {
  sending.value = true
  error.value = ""
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: route.params.token,
        request: {
          ...form.value,
          colis: form.value.colis.map(item => ({
            ...item,
            volumeM3: Number(volumeM3(item).toFixed(4)),
            totalLigne: Number(lineTotal(item).toFixed(2))
          }))
        }
      })
    })
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 409) return router.replace({ name: "request-thank-you" })
      throw new Error(data.error)
    }
    await router.replace({ name: "request-thank-you" })
  } catch (err) {
    error.value = err.message || "Envoi impossible"
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:py-12">
    <div class="mx-auto max-w-4xl">
      <div class="mb-8 flex items-center gap-4">
        <img :src="company.logoUrl" class="h-16 w-16 rounded-2xl object-contain" :alt="company.name" />
        <div><p class="text-xl font-black">{{ company.name }}</p><p class="text-sm text-slate-500">Envoi de colis vers le Cameroun</p></div>
      </div>

      <div v-if="loading" class="rounded-3xl bg-white p-10 text-center">Chargement…</div>
      <div v-else-if="error && !form.expediteur" class="rounded-3xl border border-red-200 bg-red-50 p-10 text-center">
        <h1 class="text-2xl font-black text-red-800">Formulaire indisponible</h1>
        <p class="mt-3 text-red-700">{{ error }}</p>
      </div>

      <form v-else class="space-y-6" @submit.prevent="submit">
        <datalist id="public-catalogue-articles">
          <option v-for="article in catalogue" :key="article.nom" :value="article.nom">
            {{ article.categorie }}<template v-if="article.unite"> · {{ article.unite }}</template>
          </option>
        </datalist>
        <header class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p class="text-xs font-black uppercase tracking-[0.2em] text-primary">Nouveau colis</p>
          <h1 class="mt-3 text-3xl font-black sm:text-4xl">Préparer votre envoi</h1>
          <p class="mt-3 leading-7 text-slate-500">Complétez les informations. Paris Fret vérifiera et validera votre demande.</p>
        </header>

        <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="text-xl font-black">Expéditeur</h2>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span class="mb-2 block text-sm font-bold">Nom complet</span><input v-model="form.expediteur" required class="input input-bordered w-full rounded-xl" /></label>
            <label><span class="mb-2 block text-sm font-bold">Téléphone</span><input v-model="form.telephoneExpediteur" required type="tel" class="input input-bordered w-full rounded-xl" placeholder="+33..." /></label>
            <label class="sm:col-span-2"><span class="mb-2 block text-sm font-bold">Adresse d’enlèvement</span><input v-model="form.adresseEnlevement" required class="input input-bordered w-full rounded-xl" placeholder="Adresse complète" /></label>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="text-xl font-black">Destinataire au Cameroun</h2>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span class="mb-2 block text-sm font-bold">Nom complet</span><input v-model="form.destinataire" required class="input input-bordered w-full rounded-xl" /></label>
            <label><span class="mb-2 block text-sm font-bold">Téléphone</span><input v-model="form.telephoneDestinataire" required type="tel" class="input input-bordered w-full rounded-xl" placeholder="+237..." /></label>
            <label><span class="mb-2 block text-sm font-bold">Destination</span><input v-model="form.destination" disabled class="input input-bordered w-full rounded-xl bg-slate-50" /></label>
            <label><span class="mb-2 block text-sm font-bold">Transport</span><select v-model="form.typeDeFret" class="select select-bordered w-full rounded-xl"><option>Maritime</option><option>Aérien</option></select></label>
          </div>
          <div v-if="form.typeDeFret === 'Aérien'" class="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-3">
            <label><span class="mb-2 block text-sm font-bold">Agent en charge</span><input v-model="form.personneEnCharge" class="input input-bordered w-full rounded-xl bg-white" /></label>
            <label><span class="mb-2 block text-sm font-bold">Téléphone agent</span><input v-model="form.telephoneAgent" type="tel" class="input input-bordered w-full rounded-xl bg-white" /></label>
            <label><span class="mb-2 block text-sm font-bold">Poids total (kg)</span><input v-model.number="form.poidsTotal" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl bg-white" /></label>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div class="flex items-center justify-between gap-4"><h2 class="text-xl font-black">Colis et articles</h2><button type="button" class="btn btn-sm rounded-xl bg-slate-950 text-white" @click="addPackage"><Plus class="h-4 w-4" /> Ajouter</button></div>
          <div class="mt-5 space-y-3">
            <div v-for="(item, index) in form.colis" :key="index" class="rounded-2xl bg-slate-50 p-4">
              <div class="grid gap-3 sm:grid-cols-[1fr_130px_48px]">
                <label><span class="mb-2 block text-xs font-black uppercase text-slate-500">Article</span><input v-model="item.nom" required list="public-catalogue-articles" class="input input-bordered w-full rounded-xl bg-white" placeholder="Choisir ou écrire un article" @change="applyCatalogue(item)" @blur="applyCatalogue(item)" /></label>
                <label><span class="mb-2 block text-xs font-black uppercase text-slate-500">Quantité</span><input v-model.number="item.quantite" required type="number" min="1" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <button type="button" class="btn btn-square mt-auto rounded-xl bg-red-50 text-red-700" aria-label="Supprimer" @click="removePackage(index)"><Trash2 class="h-4 w-4" /></button>
              </div>
              <div v-if="item.typeTarif === 'volume'" class="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end">
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Longueur (cm)</span><input v-model.number="item.longueur" required type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Largeur (cm)</span><input v-model.number="item.largeur" required type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <label><span class="mb-1 block text-xs font-bold text-slate-500">Hauteur (cm)</span><input v-model.number="item.hauteur" required type="number" min="0" step="0.1" class="input input-bordered w-full rounded-xl bg-white" /></label>
                <div class="rounded-xl bg-white px-4 py-3 text-sm"><span class="block text-xs text-slate-400">Volume</span><strong>{{ volumeM3(item).toFixed(3) }} m³</strong></div>
                <div class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"><span class="block text-xs">{{ formatPrice(item.prixParM3) }}/m³</span><strong>{{ formatPrice(lineTotal(item)) }}</strong></div>
              </div>
              <div v-else-if="item.typeTarif === 'fixe'" class="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
                <span class="text-slate-500">{{ formatPrice(item.prixUnitaire) }} × {{ item.quantite }}</span>
                <strong class="text-primary">{{ formatPrice(lineTotal(item)) }}</strong>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="text-xl font-black">Paiement</h2>
          <div v-if="hasCataloguePrice" class="mt-5 flex items-center justify-between rounded-2xl bg-primary/10 px-5 py-4">
            <span class="font-bold">Total calculé</span><strong class="text-xl text-primary">{{ formatPrice(calculatedTotal) }}</strong>
          </div>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span class="mb-2 block text-sm font-bold">Statut</span><select v-model="form.statut" class="select select-bordered w-full rounded-xl"><option>Non Payé</option><option>Reste à payer</option><option>Payé</option></select></label>
            <label><span class="mb-2 block text-sm font-bold">Mode de paiement</span><select v-model="form.modeDePaiement" class="select select-bordered w-full rounded-xl"><option>Espèces</option><option>Chèque</option><option>CB</option><option>Virement</option></select></label>
            <label><span class="mb-2 block text-sm font-bold">Prix</span><input v-model.number="form.prix" type="number" min="0" step="0.01" :readonly="hasCataloguePrice" class="input input-bordered w-full rounded-xl" /></label>
            <label><span class="mb-2 block text-sm font-bold">Reste à payer</span><input v-model.number="form.resteAPayer" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-xl" /></label>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="text-xl font-black">Informations complémentaires</h2>
          <textarea v-model="form.notes" class="textarea textarea-bordered mt-5 min-h-28 w-full rounded-xl" placeholder="Précisions utiles, disponibilité, étage..."></textarea>
        </section>

        <p v-if="error" class="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{{ error }}</p>
        <button class="btn btn-primary h-14 w-full rounded-xl text-base" :disabled="sending">
          <span v-if="sending" class="loading loading-spinner loading-sm"></span><Send v-else class="h-5 w-5" />
          {{ sending ? "Envoi…" : "Envoyer ma demande" }}
        </button>
      </form>
    </div>
  </main>
</template>
