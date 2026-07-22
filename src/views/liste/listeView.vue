<script setup>
import { ref, computed } from 'vue'
import { format } from 'date-fns'
import frLocale from 'date-fns/locale/fr'
import { collection, query, where } from 'firebase/firestore'
import { useCollection, useFirestore } from 'vuefire'

import ListCard from '../../components/listCard.vue'

import { useEntrepriseId } from '../../components/userEntrepriseId'

const statuts = [
  '',
  'Non Payé',
  'Reste à payer',
  'Payé'
]

const DELIVERY_TABS = [
  'Tous',
  'En attente',
  'Attribué au vol',
  'En transit',
  'Arrivé destination',
  'Disponible retrait',
  'Livré'
]

const selectedTab = ref('Tous')
const selectedStatut = ref('')
const search = ref('')

const { entrepriseId, isLoading } = useEntrepriseId()
const db = useFirestore()

const enlevementsQuery = computed(() => {
  if (!entrepriseId.value) return null

  return query(
    collection(db, 'enlevements'),
    where('entrepriseId', '==', entrepriseId.value)
  )
})

const listeEnlevements = useCollection(enlevementsQuery)

function formatDateTime(dateTimeString) {
  const date = new Date(dateTimeString)

  return format(
    date,
    "EEEE d MMMM yyyy à HH'h'mm",
    { locale: frLocale }
  )
}

const filteredList = computed(() => {
  if (isLoading.value) return []

  return listeEnlevements.value

    // STATUS LIVRAISON
    .filter(item => {
      if (selectedTab.value === 'Tous') return true

      return item.deliveryStatus === selectedTab.value
    })

    // STATUS PAIEMENT
    .filter(item => {
      if (!selectedStatut.value) return true

      return item.statut === selectedStatut.value
    })

    // SEARCH
    .filter(item => {
      if (!search.value) return true

      const q = search.value.toLowerCase()

      return (
        item.destinataire?.toLowerCase().includes(q) ||
        item.expediteur?.toLowerCase().includes(q) ||
        item.numero?.toLowerCase().includes(q) ||
        item.destination?.toLowerCase().includes(q)
      )
    })

    // DATE DESC
    .sort((a, b) =>
      new Date(b.date || 0) - new Date(a.date || 0)
    )
})

function getTabClass(tab) {
  return selectedTab.value === tab
    ? 'bg-primary text-white'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
}
</script>

<template>
  <section class="min-h-screen px-1 py-2">

    <div class="mx-auto max-w-[1440px]">

      <!-- HEADER -->
      <div class="mb-10">
        <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">
          Colis
        </p>

        <h1 class="mt-4 text-5xl font-black leading-[0.98] tracking-[-0.055em] text-slate-950">
          Gestion des colis
        </h1>

        <p class="mt-5 max-w-2xl text-base leading-7 text-slate-500">
          Suivi des colis et statuts logistiques
        </p>
      </div>

    <!-- FILTERS -->
<div class="mb-8 rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur">

<div class="grid grid-cols-1 gap-5 md:grid-cols-2">

  <!-- STATUS LIVRAISON -->
  <div>
    <label class="mb-2 block text-sm font-semibold text-slate-700">
      Statut logistique
    </label>

    <select
      v-model="selectedTab"
      class="select select-bordered w-full rounded-2xl"
    >
      <option
        v-for="tab in DELIVERY_TABS"
        :key="tab"
        :value="tab"
      >
        {{ tab }}
      </option>
    </select>
  </div>

  <!-- STATUS PAIEMENT -->
  <div>
    <label class="mb-2 block text-sm font-semibold text-slate-700">
      Statut paiement
    </label>

    <select
      v-model="selectedStatut"
      class="select select-bordered w-full rounded-2xl"
    >
      <option
        v-for="statut in statuts"
        :key="statut"
        :value="statut"
      >
        {{ statut || 'Tous les paiements' }}
      </option>
    </select>
  </div>

  <!-- SEARCH -->
  <div class="md:col-span-2">
    <label class="mb-2 block text-sm font-semibold text-slate-700">
      Recherche
    </label>

    <input
      v-model="search"
      type="search"
      placeholder="Numéro, destinataire, expéditeur..."
      class="input input-bordered w-full rounded-2xl"
    />
  </div>

</div>

</div>

      <!-- LOADING -->
      <div
        v-if="isLoading"
        class="flex justify-center py-24"
      >
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>

      <!-- EMPTY -->
      <div
        v-else-if="filteredList.length === 0"
        class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 py-28 text-center shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur"
      >
        <h2 class="text-xl font-bold text-slate-900">
          Aucun colis trouvé
        </h2>

        <p class="mt-2 text-sm text-slate-500">
          Aucun colis ne correspond aux filtres.
        </p>
      </div>

      <!-- LIST -->
      <div
        v-else
        class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
      >

        <router-link
          v-for="liste in filteredList"
          :key="liste.id"
          :to="`/liste/${liste.id}`"
          class="transition duration-200"
        >
          <ListCard
            :image="liste.imageUrl"
            :date="liste.date ? formatDateTime(liste.date) : 'Non dispo'"
            :nbre-colis="String(liste.nombreDeColis)"
            :statut="liste.statut"
            :delivery-status="liste.deliveryStatus"
            :expediteur="liste.expediteur"
            :destinateur="liste.destinataire"
            :destination="liste.destination"
          />
        </router-link>

      </div>

    </div>

  </section>
</template>
