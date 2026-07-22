<script setup>
import { useCollection, useFirestore } from 'vuefire'
import { collection, addDoc, query, where, serverTimestamp } from 'firebase/firestore'
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { format } from 'date-fns'
import frLocale from 'date-fns/locale/fr'
import router from '../../router/index.js'
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage'
import { toast } from "vue3-toastify"
import Form from '../liste/form.vue'
import { useAuthStore } from '../../stores/useAuthStore'
import { PARIS_FRET_ENTREPRISE_ID } from '../../appConfig'
import { parseMoney } from '../../utils/money'
import { syncPublicTracking } from '../../utils/publicTracking'

const route = useRoute()
const db = useFirestore()
const authStore = useAuthStore()
const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)
const detailId = ref(route.params.id)
const myId = detailId.value

const customersQuery = computed(() => {
  if (!entrepriseId.value) return null

  return query(
    collection(db, 'customers'),
    where('entrepriseId', '==', entrepriseId.value)
  )
})

const enlevementsQuery = computed(() => {
  if (!entrepriseId.value) return null

  return query(
    collection(db, 'enlevements'),
    where('entrepriseId', '==', entrepriseId.value),
    where('customerId', '==', myId)
  )
})

const Liste = useCollection(customersQuery)
const ListeColis = useCollection(enlevementsQuery)

const liste = computed(() => {
  return Liste.value.find((detail) => detail.id === detailId.value)
})

const listeColis = computed(() => {
  return ListeColis.value
})

const formatDateTime = (dateTimeString) => {
  const date = new Date(dateTimeString)
  return format(date, "EEEE d MMMM yyyy à HH'h' mm", { locale: frLocale })
}

const storage = getStorage()

// reactive state for form data
const customer = ref({
  statut: '',
  destinataire: '',
  telephoneDestinataire: '',
  typeDeFret: '',
  destination: '',
  personneEnCharge: '',
  prix: '',
  modeDePaiement: '',
  resteAPayer: '',
  date: '',
  image: [],
  deliveryStatus: 'En attente',
  customerId: myId,
})

// écoute la sélection de fichiers images
function handleFileChange(event) {
  customer.value.image = Array.from(event.target.files)
}

// liste des colis dans le formulaire
const colisList = ref([
  { nom: '', quantite: 1, statutColis: false }
])

const ajouterColis = () => {
  colisList.value.push({ nom: '', quantite: 1, statutColis: false })
}

const supprimerColis = (index) => {
  colisList.value.splice(index, 1)
}

function generateNumero() {
  return `COL-${Date.now()}`
}

function generatePackageId() {
  return `PKG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
}

// fonction principale d'envoi du formulaire
async function send() {
  try {
    const imageUrl = []

    for (const file of customer.value.image) {
      const imageRef = storageRef(
        storage,
        `enlevements_images/${Date.now()}_${file.name}`
      )
      await uploadBytes(imageRef, file)
      const url = await getDownloadURL(imageRef)
      imageUrl.push(url)
    }

    // construction des détails colis avec décomposition
    const colisData = colisList.value.map(colis => {
      const details = Array.from({ length: colis.quantite }, (_, i) => ({
        packageId: generatePackageId(),
        coli: `${colis.nom} ${i + 1}/${colis.quantite}`,
        statutColis: colis.statutColis || 'En attente',
        poids: 0,
        voyageId: '',
      }))

      return {
        nom: colis.nom,
        quantite: colis.quantite,
        poids: 0,
        poidsTotal: 0,
        details,
      }
    })

    const Data = {
      numero: generateNumero(),
      expediteur: `${liste.value.nom} ${liste.value.prenom}`,
      statut: customer.value.statut,
      imageUrl,
      telephoneExpediteur: liste.value.telephone,
      destinataire: customer.value.destinataire,
      telephoneDestinataire: customer.value.telephoneDestinataire,
      typeDeFret: customer.value.typeDeFret,
      destination: customer.value.destination,
      nombreDeColis: colisData.reduce((acc, c) => acc + c.quantite, 0),
      colis: colisData,
      personneEnCharge: customer.value.personneEnCharge,
      prix: parseMoney(customer.value.prix),
      modeDePaiement: customer.value.modeDePaiement,
      resteAPayer: parseMoney(customer.value.resteAPayer),
      poidsTotal: 0,
      date: customer.value.date || new Date().toISOString(),
      deliveryStatus: 'En attente',
      customerId: customer.value.customerId,
      entrepriseId: entrepriseId.value,
      createdAt: serverTimestamp(),
    }

    const enlevementsCollection = collection(db, 'enlevements')
    const newDocumentRef = await addDoc(enlevementsCollection, Data)

    await syncPublicTracking(
      db,
      {
        ...Data,
        id: newDocumentRef.id
      },
      authStore.entreprise,
      newDocumentRef.id
    )

    toast("Formulaire envoyé", {
      theme: "auto",
      type: "success",
      autoClose: 1000,
    })

    // Reset formulaire
    customer.value = {
      statut: '',
      destinataire: '',
      telephoneDestinataire: '',
      typeDeFret: '',
      destination: '',
      personneEnCharge: '',
      prix: '',
      modeDePaiement: '',
      resteAPayer: '',
      date: '',
      image: [],
      deliveryStatus: 'En attente',
      customerId: myId,
    }
    colisList.value = []
  } catch (error) {
    console.error("Erreur lors de l'envoi du formulaire :", error)
    toast.error("Erreur lors de l'envoi du formulaire")
  }
}
</script>

<template>
  <div class="flex flex-col items-center p-6 bg-gray-100 min-h-screen">
    <span class="bg-primary text-white rounded-lg shadow-lg text-2xl font-semibold">
      <!-- Titre à ajouter si besoin -->
    </span>

    <!-- Bouton pour ouvrir modal formulaire -->
    <span
      class="flex items-center bg-primary text-white px-3 py-2 my-2 rounded-lg shadow-lg text-lg font-medium cursor-pointer"
      @click="$refs.formModal.showModal()"
    >
      Nouvel Envoi
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
        class="w-6 h-6 ml-2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </span>

    <!-- Liste des enlèvements -->
    <div class="flex flex-col w-full space-y-4 pb-20">
      <div v-for="(item, i) in listeColis" :key="i"
        class="bg-white border border-gray-200 px-6 py-4 rounded-lg shadow-sm flex justify-between items-center hover:shadow-md transition duration-300">
        <span class="text-gray-700 font-medium">
          Colis du {{ formatDateTime(item.date) }}
        </span>
        <router-link :to="'/liste/' + item.id">
          <button
            class="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition duration-300"
          >
            Voir
          </button>
        </router-link>
      </div>
    </div>

    <!-- Modal Formulaire -->
    <dialog id="formModal" class="modal modal-bottom sm:modal-middle" ref="formModal">
      <div class="modal-box h-[96dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-slate-50 p-4 text-black sm:h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-6xl sm:rounded-3xl sm:p-7 lg:w-[min(1180px,calc(100vw-5rem))]">
        <form method="dialog" class="sticky top-0 z-20 flex justify-end">
          <button
            type="submit"
            class="btn btn-circle btn-sm border border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </form>

        <div class="-mt-8">
          <Form :myId="myId" :expediteurData="liste" />
        </div>
      </div>

      <form method="dialog" class="modal-backdrop"><button>Fermer</button></form>
    </dialog>
  </div>
</template>
