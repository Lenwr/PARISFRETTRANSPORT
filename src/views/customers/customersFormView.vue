<script setup>
import {
  collection,
  addDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  where,
  runTransaction
} from 'firebase/firestore'
import { computed, ref } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import router from '../../router'
import { toast } from 'vue3-toastify'
import { useAuthStore } from '../../stores/useAuthStore.js'
import { PARIS_FRET_ENTREPRISE_ID } from '../../appConfig.js'

const db = useFirestore()
const loading = ref(false)

const store = useAuthStore()
const entrepriseId = computed(() =>
  store.entreprise?.id || store.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)
const customersQuery = computed(() => {
  if (!entrepriseId.value) return null

  return query(
    collection(db, 'customers'),
    where('entrepriseId', '==', entrepriseId.value)
  )
})
const Liste = useCollection(customersQuery)

const customer = ref({
  nom: '',
  prenom: '',
  telephone: '',
  adresse: '',
  destination: '',
  smsConsent: true,
  envois: [{ expediteur: '', colis: '' }],
})

const suggestions = ref([])

const resetForm = () => {
  Object.assign(customer.value, {
    nom: '',
    prenom: '',
    telephone: '',
    adresse: '',
    destination: '',
    smsConsent: true,
    envois: [{ expediteur: '', colis: '' }],
  })
}

const ensureEntrepriseContext = async () => {
  const user = store.getCurrentUser()

  if (user) {
    await store.fetchUserProfile(user.uid)
    await store.fetchEntreprise(user.uid)

    if (!store.userProfile?.entrepriseId) {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          email: user.email || '',
          entrepriseId: PARIS_FRET_ENTREPRISE_ID,
          role: 'user',
          isActive: true,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )

      await store.fetchUserProfile(user.uid)
      await store.fetchEntreprise(user.uid)
    }
  }
}

const addCustomer = async () => {
  loading.value = true

  await ensureEntrepriseContext()

  const currentEntrepriseId = entrepriseId.value

  if (!currentEntrepriseId) {
    toast("Erreur : entreprise introuvable ❌", { type: 'error' })
    loading.value = false
    return
  }

  const { nom, prenom, telephone, adresse, destination } = customer.value
  if (!nom || !prenom || !telephone || !adresse || !destination) {
    toast("Veuillez remplir les champs requis ⚠️", { type: 'warning' })
    loading.value = false
    return
  }

  const duplicate = Liste.value.find(
    (item) =>
      item.nom.toLowerCase() === nom.toLowerCase() &&
      item.telephone === telephone &&
      item.entrepriseId === currentEntrepriseId
  )
  if (duplicate) {
    toast("Client déjà existant 👤", { type: 'info' })
    loading.value = false
    return
  }

  try {
    const normalizedCity = String(destination).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
    const cityCodes = { YAOUNDE: 'YDE', YAOUNDÉ: 'YDE', DOUALA: 'DLA' }
    const cityCode = cityCodes[normalizedCity] || normalizedCity.replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X')
    const counterRef = doc(db, 'entreprises', currentEntrepriseId)
    const customerRef = doc(collection(db, 'customers'))
    let referenceClient = ''
    await runTransaction(db, async transaction => {
      const counterSnap = await transaction.get(counterRef)
      const counters = counterSnap.data()?.customerCounters || {}
      const nextNumber = Number(counters[cityCode] || 0) + 1
      referenceClient = `${String(nextNumber).padStart(4, '0')}${cityCode}`
      transaction.update(counterRef, { [`customerCounters.${cityCode}`]: nextNumber, updatedAt: serverTimestamp() })
      transaction.set(customerRef, { ...customer.value, referenceClient, entrepriseId: currentEntrepriseId, createdAt: new Date() })
    })
    toast(`Client enregistré ✅ Référence : ${referenceClient}`, { type: 'success', autoClose: 3500 })
    resetForm()
  } catch (e) {
    console.error("Erreur enregistrement client:", e)
    toast(e.code === "permission-denied" ? "Autorisation Firestore manquante : déployer les règles." : `Erreur lors de l'enregistrement : ${e.message || "réessayez"}`, { type: 'error', autoClose: 3000 })
  } finally {
    loading.value = false
  }
}

const filterItems = () => {
  if (customer.value.nom.trim() === '') {
    suggestions.value = []
    return
  }
  const query = customer.value.nom.toLowerCase().trim()
  suggestions.value = Liste.value.filter(
    (item) =>
      item.nom &&
      item.nom.toLowerCase().includes(query) &&
      item.entrepriseId === entrepriseId.value
  )
}

const selectItem = (item) => {
  customer.value.nom = item.nom
  suggestions.value = []
  router.push(`/customersDetails/${item.id}`)
}
</script>

<template>
  <div class="bg-white flex flex-col justify-between pb-[5em] px-6 pt-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <h2 class="text-center text-2xl font-bold tracking-tight py-4 text-gray-900">
        Enregistrer un client
      </h2>
    </div>
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" @submit.prevent="addCustomer">
        <!-- NOM -->
        <div>
          <label for="nom" class="block text-sm font-medium text-gray-900">Nom</label>
          <input id="nom" v-model="customer.nom" @input="filterItems" class="input-style" placeholder="Nom" />
          <div v-if="suggestions.length > 0"
            class="autocomplete mt-1 rounded-md border text-gray-900 bg-white shadow-sm ring-1 ring-gray-300 overflow-y-auto max-h-40">
            <div v-for="suggestion in suggestions" :key="suggestion.id" @click="selectItem(suggestion)"
              class="suggestion">
              {{ suggestion.nom }} - {{ suggestion.prenom }}
            </div>
          </div>
        </div>

        <!-- PRENOM -->
        <div>
          <label for="prenom" class="block text-sm font-medium text-gray-900">Prénoms</label>
          <input id="prenom" v-model="customer.prenom" class="input-style" placeholder="Prénoms" />
        </div>

        <!-- TELEPHONE -->
        <div>
          <label for="telephone" class="block text-sm font-medium text-gray-900">Téléphone</label>
          <input id="telephone" v-model="customer.telephone" type="tel" class="input-style" placeholder="+33 6 12 34 56 78" />
        </div>

        <div>
          <label for="adresse" class="block text-sm font-medium text-gray-900">Adresse</label>
          <input id="adresse" v-model="customer.adresse" class="input-style" placeholder="Adresse du client" />
        </div>

        <div>
          <label for="destination" class="block text-sm font-medium text-gray-900">Destination</label>
          <select id="destination" v-model="customer.destination" class="input-style bg-white">
            <option value="" disabled>Choisir une destination</option>
            <option value="YAOUNDE">YAOUNDE</option>
            <option value="DOUALA">DOUALA</option>
          </select>
        </div>

        <label class="flex items-start gap-3 text-sm text-gray-700">
          <input v-model="customer.smsConsent" type="checkbox" class="checkbox checkbox-primary checkbox-sm mt-0.5" />
          <span>Le client accepte de recevoir des SMS d'information.</span>
        </label>

        <!-- BOUTON -->
        <div>
          <button type="submit" :disabled="loading"
            class="flex h-[3em] w-full justify-center rounded-md bg-primary text-white font-semibold shadow-sm hover:bg-indigo-500 disabled:opacity-50">
            <span v-if="!loading">Enregistrer</span>
            <span v-else>En cours...</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.input-style {
  @apply block h-[3em] w-full rounded-md border-0 py-1.5 pl-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm;
}
.autocomplete {
  z-index: 10;
}
.suggestion {
  padding: 8px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background 0.2s ease;
}
.suggestion:hover {
  background-color: #f3f4f6;
  font-weight: 500;
}
</style>
