<script setup>
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import {computed, reactive, ref, onMounted} from "vue"
import FullCalendar from "@fullcalendar/vue3"
import {useCollection, useFirestore} from "vuefire"
import {collection, addDoc, doc, deleteDoc, updateDoc, query, where} from 'firebase/firestore'
import {toast} from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import {useAuthStore} from '../stores/useAuthStore'
import { PARIS_FRET_ENTREPRISE_ID } from '../appConfig'

const authStore = useAuthStore()
const db = useFirestore()
const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const title = ref('')
const start = ref('')
const idItem = ref(null)

const showModal = ref(false)

// 📦 Charger les événements liés à l'entreprise
const eventsQuery = computed(() => {
  if (!entrepriseId.value) return null
  return query(collection(db, 'events'), where('entrepriseId', '==', entrepriseId.value))
})

const datas = useCollection(eventsQuery)

const newDatas = computed(() => {
  return datas.value.map((doc) => ({
    id: doc.id,
    title: doc.title,
    start: doc.start,
    allDay: true
  }))
})

const futureEvents = computed(() =>
  newDatas.value.filter(event => new Date(event.start) >= new Date())
)

// ➕ Ajouter un événement
const addLoading = async () => {
  if (!entrepriseId.value) return

  const eventCollection = collection(db, 'events')
  const data = {
    title: title.value,
    start: start.value,
    allDay: true,
    entrepriseId: entrepriseId.value
  }
  await addDoc(eventCollection, data)
  title.value = ''
  start.value = ''
  toast("Chargement enregistré", { theme: "auto", type: "success", autoClose: 1000 })
}

// ❌ Supprimer un événement
const sup = async () => {
  if (!idItem.value) return
  const DocRef = doc(db, 'events', idItem.value)
  await deleteDoc(DocRef)
  toast("Chargement supprimé", { theme: "auto", type: "danger", autoClose: 1000 })
}

// 🖱️ Clic sur un événement
const handleClick = (eventId) => {
  idItem.value = eventId
  my_modal_1.showModal()
}

// 🧲 Drag & Drop
const updateEventDate = async (info) => {
  const eventRef = doc(db, "events", info.event.id)
  try {
    await updateDoc(eventRef, {
      start: info.event.start.toLocaleDateString('fr-CA')  // 👈 corrige le décalage
    })
    toast("Événement déplacé", {
      theme: "auto",
      type: "info",
      autoClose: 1500
    })
  } catch (error) {
    console.error("Erreur lors du déplacement :", error)
    toast("Erreur lors de la mise à jour", {
      theme: "colored",
      type: "error"
    })
  }
}


// 📅 Clic sur une date pour ajouter
const handleDateClick = (arg) => {
  start.value = arg.dateStr
  my_modal_3.showModal()
}

// ⚙️ FullCalendar config
const options = reactive({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,dayGridWeek,listDay'
  },
  editable: true,
  selectable: true,
  events: newDatas,
  eventClick: (arg) => handleClick(arg.event.id),
  eventDrop: updateEventDate,
  dateClick: handleDateClick
})
</script>

<template>
  <div class="pt-8 pb-[5%] bg px-1 h-screen flex flex-col">
    <div class=" hidden mobile:mx-[20%] mobile:my-[5%]">
      <button class="btn btn-accent" onclick="my_modal_3.showModal()">Ajouter un chargement</button>
    </div>

    <div class="flex flex-row">
      <div class="displayChargements mobile:hidden demo-app-sidebar w-[20%] flex flex-col items-center mt-[5%]">
        <div class="demo-app-sidebar-section text-black">
          <h2>Tous les chargements ({{ newDatas.length }})</h2>
          <ul>
            <li v-for="event in futureEvents" :key="event.id">
              <i>{{ event.title }}</i>
            </li>
          </ul>
        </div>
      </div>

      <FullCalendar
        class="text-black mobile:text-[0.5em] mobile:w-[100%] w-[80%]"
        :options="options"
      />
    </div>

    <!-- 🗑️ Modal suppression -->
    <dialog id="my_modal_1" class="modal">
      <div class="modal-box justify-center">
        <h3 class="font-bold text-lg">Attention!</h3>
        <p class="py-4">Voulez-vous supprimer ce chargement ?</p>
        <div class="modal-action flex justify-center">
          <form method="dialog" class="flex justify-around w-full">
            <button class="btn hover:btn-error w-[45%]" @click="sup">Oui</button>
            <button class="btn hover:btn-success w-[45%]">Non</button>
          </form>
        </div>
      </div>
    </dialog>

    <!-- 🆕 Modal ajout -->
    <dialog id="my_modal_3" class="modal">
      <div class="modal-box">
        <form method="dialog">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">X</button>
        </form>
        <h3 class="font-bold text-lg">Nouvel événement</h3>
        <form method="dialog">
          <label for="start" class="block text-sm font-medium leading-6 text-white">Date</label>
          <input type="date" name="start" v-model="start"
            class="mb-4 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm" />

          <label for="title" class="block text-sm font-medium leading-6 text-white">Nom de l'événement</label>
          <input type="text" v-model="title" placeholder=""
            class="input input-bordered w-[50%] max-w-xs mt-2 bg-white text-black" />

          <button class="btn btn-accent mx-3 w-[40%]" @click="addLoading">Enregistrer</button>
        </form>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.displayChargements {
  max-height: 60%;
  overflow-y: auto;
}
</style>
