<script setup>
import Signature from '../components/signature.vue'
import { useCollection, useFirestore } from "vuefire"
import { ref, computed } from "vue"
import { useRoute } from "vue-router"
import { collection } from "firebase/firestore"

const route = useRoute()
const detailId = ref(route.params.id)
const colisIndex = ref(parseInt(route.query.colisIndex))
const detailIndex = ref(
  route.query.detailIndex !== undefined ? parseInt(route.query.detailIndex) : null
)

const db = useFirestore()
const datas = useCollection(collection(db, "enlevements"))

const client = computed(() => {
  return datas.value.find((detail) => detail.id === detailId.value)
})

// Si c'est un sous-colis (nouveau format avec details)
const selectedDetail = computed(() => {
  const colis = client.value?.colis || []
  if (detailIndex.value !== null && colis[colisIndex.value]?.details) {
    return colis[colisIndex.value].details[detailIndex.value] || null
  }
  return null
})

// Sinon ancien format, on prend le colis directement
const selectedColis = computed(() => {
  const colis = client.value?.colis || []
  return colis[colisIndex.value] || null
})
</script>

<template>
  <div class="px-6 pb-[4em] max-w-4xl text-black mx-auto">
    <h2 class="text-3xl mt-10 font-bold text-gray-800 mb-6">Détail du Colis</h2>

    <div class="bg-white p-6 my-10 rounded-2xl shadow-xl space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p><span class="font-semibold">Expéditeur :</span> {{ client?.expediteur }}</p>
          <p><span class="font-semibold">Destinataire :</span> {{ client?.destinataire }}</p>
          <p><span class="font-semibold">Destination :</span> {{ client?.destination }}</p>
          <p><span class="font-semibold">Type de Fret :</span> {{ client?.typeDeFret }}</p>
        </div>

        <div>
          <p><span class="font-semibold">Téléphone Expéditeur :</span> {{ client?.telephoneExpediteur }}</p>
          <p><span class="font-semibold">Paiement :</span> {{ client?.modeDePaiement }}</p>
          <p><span class="font-semibold">Statut Paiement :</span> {{ client?.statut }}</p>
        </div>
      </div>

      <hr class="my-4" />

      <div v-if="selectedColis" class="bg-gray-50 p-4 rounded-xl border border-gray-200">
        <h3 class="text-xl font-semibold mb-2">Colis sélectionné</h3>
        <p><span class="font-semibold">Nom :</span> {{ selectedColis.nom }}</p>

        <p v-if="selectedDetail">
          <span class="font-semibold">Colis :</span> {{ selectedDetail.coli }}<br />
          <span class="font-semibold">Statut :</span>
          <span :class="selectedDetail.statutColis ? 'text-green-700' : 'text-yellow-700'" class="font-medium">
            {{ selectedDetail.statutColis ? 'Livré' : 'En attente' }}
          </span>
        </p>

        <p v-else>
          <span class="font-semibold">Statut :</span>
          <span :class="selectedColis.statutColis ? 'text-green-700' : 'text-yellow-700'" class="font-medium">
            {{ selectedColis.statutColis ? 'Livré' : 'En attente' }}
          </span>
        </p>
      </div>

      <div v-else class="text-red-500">Colis introuvable.</div>

      <div class="flex justify-center pt-8">
        <Signature
          :detail-id="detailId"
          :colis-index="colisIndex"
          :detail-index="detailIndex"
        />
      </div>
    </div>
  </div>
</template>
