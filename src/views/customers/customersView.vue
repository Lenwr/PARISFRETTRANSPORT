<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCustomersStore } from '../../stores/modules/customers'
import { useAuthStore } from '../../stores/useAuthStore'
import { storeToRefs } from 'pinia'
import CustomersFormView from './customersFormView.vue'
import { toast } from 'vue3-toastify'
import { MessageCircle } from 'lucide-vue-next'
import { PARIS_FRET_ENTREPRISE_ID } from '../../appConfig.js'

const query = ref('')
const sortAsc = ref(true)

const authStore = useAuthStore()
const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const customersStore = useCustomersStore()
const { customers, loading, error } = storeToRefs(customersStore)

const customer = ref({
  nom: '',
  prenom: '',
  adresse: '',
  codePostal: '',
  telephone: '',
  envois: [{ expediteur: '', colis: '' }],
})

// fetch à l'ouverture
onMounted(async () => {
  if (entrepriseId.value) {
    await customersStore.fetchCustomers(entrepriseId.value)
  } else {
    console.warn("ID entreprise manquant ❗")
  }
})

// filtre + tri
const filteredList = computed(() => {
  let list = customers.value.slice().sort((a, b) => {
    const res = a.nom.localeCompare(b.nom)
    return sortAsc.value ? res : -res
  })
  if (!query.value) return list
  return list.filter(c =>
    c.nom.toLowerCase().includes(query.value.toLowerCase())
  )
})

// ➕ Créer un client
const createCustomers = async () => {
  try {
    if (!entrepriseId.value) {
      toast("Erreur : entreprise non trouvée ❌", { type: 'error' })
      return
    }

    await customersStore.createCustomers({
      ...customer.value,
      entrepriseId: entrepriseId.value,
    })

    customer.value = {
      nom: '',
      prenom: '',
      adresse: '',
      codePostal: '',
      telephone: '',
      envois: [{ expediteur: '', colis: '' }],
    }

    toast("Nouveau client créé", {
      theme: 'auto',
      type: 'success',
      autoClose: 1000,
    })
  } catch (e) {
    console.error('Erreur création :', e)
  }
}

// ❌ Supprimer un client
const deleteCustomers = async (id) => {
  if (confirm('⚠️ Supprimer ce client ?')) {
    try {
      await customersStore.deleteCustomer(id)
      toast("Client supprimé", {
        theme: 'auto',
        type: 'error',
        autoClose: 1000,
      })
    } catch (e) {
      console.error('Erreur suppression :', e)
    }
  }
}
</script>


<template>
  <div>
    <!-- Barre recherche + boutons -->
    <div class="flex flex-row items-center justify-center px-2 py-4">

       <!-- Bouton tri -->
       <span class="mx-2 cursor-pointer" @click="sortAsc = !sortAsc" title="Trier par nom">
        <svg v-if="sortAsc" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-black" fill="none"
          viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M3 4h18M3 12h12m-6 8h6" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-black" fill="none"
          viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M3 20h18M3 12h12m-6-8h6" />
        </svg>
      </span>
      <input v-model="query" type="text" placeholder="nom du client"
        class="input input-bordered input-primary w-full max-w-xs bg-white" />
      <router-link
        to="/customers/broadcast"
        class="btn mx-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800"
      >
        <MessageCircle class="h-4 w-4" />
        Diffusion
      </router-link>
      <!-- Bouton ouvrir modal -->
      <span class="w-6 mx-2 text-black cursor-pointer hover:w-8 duration-500" onclick="formModal.showModal()">
        <svg xmlns="http://www.w3.org/2000/svg" class="size-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      </span>

      <!-- Modal formulaire -->
      <dialog id="formModal" class="modal">
        <div class="modal-box">
          <form method="dialog">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
          </form>
          <CustomersFormView />
        </div>
      </dialog>
    </div>

    <!-- Table -->
    <div v-if="loading">Chargement...</div>
    <div v-else class="flex flex-col w-auto">
      <div class="overflow-x-auto sm:mx-0.5 lg:mx-0.5 pb-20">
        <div class="py-2 inline-block min-w-full sm:px-6 lg:px-8">
          <div class="overflow-hidden">
            <table class="min-w-full">
              <thead class="bg-primary border-b">
                <tr>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Nom</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Prénom</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Adresse</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Code Postal</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Téléphone</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left">Voir</th>
                  <th class="text-xs font-medium text-white px-6 py-4 text-left"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in filteredList" :key="i" class="bg-gray-100 border-b">
                  <td class="text-xs text-gray-900 font-light px-6 py-4">{{ item.nom }}</td>
                  <td class="text-xs text-gray-900 font-light px-6 py-4">{{ item.prenom }}</td>
                  <td class="text-xs text-gray-900 font-light px-6 py-4">{{ item.adresse }}</td>
                  <td class="text-xs text-gray-900 font-light px-6 py-4">{{ item.codePostal }}</td>
                  <td class="text-xs text-gray-900 font-light px-6 py-4">{{ item.telephone }}</td>
                  <td class="text-xs text-gray-900 font-light px-6 py-4">
                    <router-link :to="'/customersDetails/' + item.id">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24"
                        stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round"
                          d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </router-link>
                  </td>
                  <td class="text-black">
                    <svg @click="deleteCustomers(item.id)" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4"
                      fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21a48.108 48.108 0 0 0-3.478-.397M4.772 5.79a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916a2.25 2.25 0 0 0-2.09-2.201 51.964 51.964 0 0 0-3.32 0 2.25 2.25 0 0 0-2.09 2.201v.916" />
                    </svg>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-primary {
  color: #021d49;
}
</style>
