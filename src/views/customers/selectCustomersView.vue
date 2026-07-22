<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useFirestore, useCollection } from 'vuefire'
import { collection, query as firestoreQuery, where } from 'firebase/firestore'
import router from '../../router/index'
import { useEntrepriseId } from '../../components/userEntrepriseId'

const db = useFirestore()

// ID de l'entreprise connectée
const { entrepriseId, isLoading } = useEntrepriseId()

const customersQuery = computed(() => {
  if (!entrepriseId.value) return null

  return firestoreQuery(
    collection(db, 'customers'),
    where('entrepriseId', '==', entrepriseId.value)
  )
})

const rawCustomers = useCollection(customersQuery)

const query = ref('')
const filteredList = ref([])
const dropdownRef = ref(null)
const display = ref(false)

// Liste des clients filtrés par entreprise
const Liste = ref([])

// Dès que l'entreprise est chargée, on filtre les clients associés
watch(
  () => [rawCustomers.value, entrepriseId.value],
  () => {
    if (!isLoading.value && entrepriseId.value) {
      Liste.value = rawCustomers.value
    }
  },
  { immediate: true }
)

const filterItems = () => {
  if (query.value.trim() === '') {
    filteredList.value = []
    return
  }

  const lowerCaseQuery = query.value.toLowerCase().trim()
  filteredList.value = Liste.value.filter(
    (item) => item.nom && item.nom.toLowerCase().includes(lowerCaseQuery)
  )
}

const selectItem = (item) => {
  query.value = item.nom
  filteredList.value = []
  display.value = !display.value
  router.push(`/customersDetails/${item.id}`) // ✅ corriger les quotes
}

const closeDropdown = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    filteredList.value = []
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
})
</script>
