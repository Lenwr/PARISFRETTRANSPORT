<script setup>
import Signature from '../components/signature.vue'
import { useFirestore } from "vuefire"
import { onMounted, ref, computed } from "vue"
import { useRoute } from "vue-router"
import { doc, getDoc } from "firebase/firestore"

const route = useRoute()
const detailId = ref(route.params.id)
const colisIndex = ref(
  route.query.colisIndex !== undefined ? parseInt(route.query.colisIndex) : null
)
const detailIndex = ref(
  route.query.detailIndex !== undefined ? parseInt(route.query.detailIndex) : null
)

const db = useFirestore()
const client = ref(null)
const loading = ref(true)
const deliveryMode = computed(() => route.query.mode === "pickup" ? "pickup" : "delivery")
const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())

onMounted(async () => {
  const snapshot = await getDoc(doc(db, "enlevements", detailId.value))
  client.value = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
  loading.value = false
})

// Si c'est un sous-colis (nouveau format avec details)
const selectedDetail = computed(() => {
  const colis = client.value?.colis || []
  if (Number.isInteger(colisIndex.value) && detailIndex.value !== null && colis[colisIndex.value]?.details) {
    return colis[colisIndex.value].details[detailIndex.value] || null
  }
  return null
})

// Sinon ancien format, on prend le colis directement
const selectedColis = computed(() => {
  const colis = client.value?.colis || []
  if (!Number.isInteger(colisIndex.value)) return null
  return colis[colisIndex.value] || null
})
</script>

<template>
  <section class="mx-auto max-w-2xl">
    <p v-if="loading" class="p-10 text-center text-slate-500">Chargement…</p>
    <div v-else-if="client" class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
      <p class="text-xs font-black uppercase tracking-[0.2em] text-primary">
        {{ deliveryMode === "pickup" ? "Récupération du colis" : "Réception du colis" }}
      </p>
      <h1 class="mt-3 text-3xl font-black">Signature du client</h1>
      <p class="mt-2 text-slate-500">{{ client.numero || client.id }} · {{ client.destinataire }}</p>

      <div class="my-8 rounded-2xl bg-slate-50 p-5 text-lg font-bold text-slate-800">
        Reçu le {{ today }}
      </div>

      <div class="pt-2">
        <Signature
          :detail-id="detailId"
          :colis-index="colisIndex"
          :detail-index="detailIndex"
          :default-name="client.destinataire"
          :delivery-mode="deliveryMode"
        />
      </div>
    </div>
    <p v-else class="rounded-2xl bg-white p-10 text-center text-red-600">Colis introuvable.</p>
  </section>
</template>
