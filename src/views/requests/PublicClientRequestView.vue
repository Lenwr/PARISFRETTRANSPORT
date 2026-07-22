<script setup>
import { onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { firebaseApp } from "../../components/firebaseConfig"

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const sending = ref(false)
const error = ref("")
const endpoint = `https://us-central1-${firebaseApp.options.projectId}.cloudfunctions.net/clientRequestForm`
const form = ref({ clientNom: "", clientTelephone: "", adresseEnlevement: "", destinataire: "", telephoneDestinataire: "", typeDeFret: "Maritime", descriptionColis: "", nombreDeColis: 1, notes: "" })

onMounted(async () => {
  try {
    const response = await fetch(`${endpoint}?token=${encodeURIComponent(route.params.token)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    form.value.clientNom = data.invite.name || ""
    form.value.clientTelephone = data.invite.phone || ""
    form.value.adresseEnlevement = data.invite.address || ""
    if (data.invite.submitted) {
      await router.replace({ name: "request-thank-you" })
    }
  } catch (err) { error.value = err.message || "Lien invalide" } finally { loading.value = false }
})

async function submit() {
  sending.value = true
  error.value = ""
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: route.params.token, request: form.value }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    await router.replace({ name: "request-thank-you" })
  } catch (err) { error.value = err.message || "Envoi impossible" } finally { sending.value = false }
}
</script>

<template>
  <main class="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
    <div class="mx-auto max-w-2xl">
      <div class="mb-8 flex items-center gap-4"><img src="/images/logo.png" class="h-14 w-14 rounded-xl object-contain" /><div><p class="text-xl font-black">Paris Fret Transport</p><p class="text-sm text-slate-500">Demande d’enlèvement vers le Cameroun</p></div></div>
      <div v-if="loading" class="rounded-3xl bg-white p-10 text-center">Chargement…</div>
      <form v-else class="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9" @submit.prevent="submit">
        <div><p class="text-xs font-black uppercase tracking-[0.2em] text-primary">Formulaire client</p><h1 class="mt-3 text-3xl font-black">Votre demande d’enlèvement</h1></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <input v-model="form.clientNom" required class="input input-bordered rounded-lg" placeholder="Votre nom" />
          <input v-model="form.clientTelephone" required type="tel" class="input input-bordered rounded-lg" placeholder="Votre téléphone" />
          <input v-model="form.adresseEnlevement" required class="input input-bordered rounded-lg sm:col-span-2" placeholder="Adresse d’enlèvement" />
          <input v-model="form.destinataire" class="input input-bordered rounded-lg" placeholder="Nom du destinataire" />
          <input v-model="form.telephoneDestinataire" type="tel" class="input input-bordered rounded-lg" placeholder="Téléphone destinataire (+237)" />
          <select v-model="form.typeDeFret" class="select select-bordered rounded-lg"><option>Maritime</option><option>Aérien</option></select>
          <input v-model.number="form.nombreDeColis" type="number" min="1" required class="input input-bordered rounded-lg" placeholder="Nombre de colis" />
          <textarea v-model="form.descriptionColis" required class="textarea textarea-bordered min-h-28 rounded-lg sm:col-span-2" placeholder="Décrivez les colis ou articles"></textarea>
          <textarea v-model="form.notes" class="textarea textarea-bordered rounded-lg sm:col-span-2" placeholder="Informations complémentaires (optionnel)"></textarea>
        </div>
        <p v-if="error" class="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{{ error }}</p>
        <button class="btn btn-primary h-12 w-full rounded-lg" :disabled="sending">{{ sending ? "Envoi…" : "Envoyer ma demande" }}</button>
      </form>
    </div>
  </main>
</template>
