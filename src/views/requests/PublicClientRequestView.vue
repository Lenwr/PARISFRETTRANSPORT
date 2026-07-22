<script setup>
import { onMounted, ref } from "vue"
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
  colis: [{ nom: "", quantite: 1 }],
  notes: ""
})

function addPackage() {
  form.value.colis.push({ nom: "", quantite: 1 })
}

function removePackage(index) {
  if (form.value.colis.length === 1) form.value.colis[0] = { nom: "", quantite: 1 }
  else form.value.colis.splice(index, 1)
}

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
      body: JSON.stringify({ token: route.params.token, request: form.value })
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
            <div v-for="(item, index) in form.colis" :key="index" class="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_130px_48px]">
              <label><span class="mb-2 block text-xs font-black uppercase text-slate-500">Article</span><input v-model="item.nom" required list="public-catalogue-articles" class="input input-bordered w-full rounded-xl bg-white" placeholder="Choisir ou écrire un article" /></label>
              <label><span class="mb-2 block text-xs font-black uppercase text-slate-500">Quantité</span><input v-model.number="item.quantite" required type="number" min="1" class="input input-bordered w-full rounded-xl bg-white" /></label>
              <button type="button" class="btn btn-square mt-auto rounded-xl bg-red-50 text-red-700" aria-label="Supprimer" @click="removePackage(index)"><Trash2 class="h-4 w-4" /></button>
            </div>
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
