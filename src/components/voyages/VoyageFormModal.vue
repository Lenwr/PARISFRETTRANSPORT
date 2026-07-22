<script setup>
import { ref, computed, watch } from "vue"
import { X, Save, Plus, Trash2, MapPin } from "lucide-vue-next"

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  destinations: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  "update:modelValue",
  "save",
  "add-destination"
])

const form = ref({
  typeVoyage: "Aérien",
  numeroVol: "",
  destination: "",
  dateDepart: "",
  status: "Préparation",
  agents: [
    {
      nom: "",
      telephone: ""
    }
  ]
})

const newDestination = ref("")
const showNewDestination = ref(false)

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
})

watch(isOpen, value => {
  if (value) resetForm()
})

function resetForm() {
  form.value = {
    typeVoyage: "Aérien",
    numeroVol: "",
    destination: "",
    dateDepart: "",
    status: "Préparation",
    agents: [
      {
        nom: "",
        telephone: ""
      }
    ]
  }

  newDestination.value = ""
  showNewDestination.value = false
}

function close() {
  isOpen.value = false
}

function addAgent() {
  form.value.agents.push({
    nom: "",
    telephone: ""
  })
}

function removeAgent(index) {
  if (form.value.agents.length <= 1) return
  form.value.agents.splice(index, 1)
}

function addDestination() {
  const value = newDestination.value.trim()

  if (!value) return

  emit("add-destination", value)

  form.value.destination = value
  newDestination.value = ""
  showNewDestination.value = false
}

function submit() {
  const agents = form.value.agents
    .filter(agent => agent.nom || agent.telephone)
    .map(agent => ({
      nom: agent.nom.trim(),
      telephone: agent.telephone.trim()
    }))

  emit("save", {
    typeVoyage: form.value.typeVoyage,
    numeroVol: form.value.numeroVol.trim(),
    destination: form.value.destination,
    dateDepart: form.value.dateDepart,
    status: form.value.status,
    agents,
    packagesTable: []
  })

  close()
}
</script>

<template>
  <dialog class="modal" :open="isOpen">
    <div class="modal-box w-[95vw] max-w-3xl rounded-3xl bg-white p-5 text-slate-900 md:p-8">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-primary">Nouveau voyage</p>
          <h3 class="text-2xl font-bold">Créer un vol / voyage</h3>
        </div>

        <button type="button" class="btn btn-ghost btn-circle" @click="close">
          <X class="h-5 w-5" />
        </button>
      </div>

      <form class="space-y-6" @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="mb-2 block text-sm font-semibold text-slate-700">
              Type voyage
            </label>

            <select
              v-model="form.typeVoyage"
              class="select select-bordered w-full rounded-2xl"
            >
              <option>Aérien</option>
              <option>Maritime</option>
            </select>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-slate-700">
              Numéro vol / voyage
            </label>

            <input
              v-model="form.numeroVol"
              required
              class="input input-bordered w-full rounded-2xl"
              placeholder="Ex: AF123 / CONT-2026"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-slate-700">
              Destination
            </label>

            <select
              v-model="form.destination"
              required
              class="select select-bordered w-full rounded-2xl"
            >
              <option value="" disabled>Choisir une destination</option>

              <option
                v-for="destination in destinations"
                :key="destination.id || destination.nom"
                :value="destination.nom"
              >
                {{ destination.nom }}
              </option>
            </select>

            <button
              type="button"
              class="mt-3 flex items-center gap-2 text-sm font-semibold text-primary"
              @click="showNewDestination = !showNewDestination"
            >
              <Plus class="h-4 w-4" />
              Ajouter une destination
            </button>

            <div
              v-if="showNewDestination"
              class="mt-3 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 sm:flex-row"
            >
              <input
                v-model="newDestination"
                class="input input-bordered w-full rounded-2xl"
                placeholder="Ex: Abidjan"
              />

              <button
                type="button"
                class="btn btn-primary rounded-2xl"
                @click="addDestination"
              >
                <MapPin class="h-4 w-4" />
                Ajouter
              </button>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-semibold text-slate-700">
              Date départ
            </label>

            <input
              v-model="form.dateDepart"
              required
              type="datetime-local"
              class="input input-bordered w-full rounded-2xl"
            />
          </div>
        </div>

        <div class="rounded-3xl bg-slate-50 p-4">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 class="font-bold text-slate-900">Agents du voyage</h4>
              <p class="text-sm text-slate-500">
                Les agents qui récupèrent les colis à destination.
              </p>
            </div>

            <button
              type="button"
              class="btn btn-outline btn-sm rounded-2xl"
              @click="addAgent"
            >
              <Plus class="h-4 w-4" />
              Ajouter
            </button>
          </div>

          <div class="space-y-3">
            <div
              v-for="(agent, index) in form.agents"
              :key="index"
              class="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_1fr_44px]"
            >
              <input
                v-model="agent.nom"
                class="input input-bordered rounded-2xl"
                placeholder="Nom agent"
              />

              <input
                v-model="agent.telephone"
                class="input input-bordered rounded-2xl"
                placeholder="Téléphone agent"
              />

              <button
                type="button"
                class="btn btn-ghost btn-circle text-red-500"
                @click="removeAgent(index)"
              >
                <Trash2 class="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <button type="submit" class="btn btn-primary w-full rounded-2xl">
          <Save class="h-5 w-5" />
          Créer le voyage
        </button>
      </form>
    </div>

    <form method="dialog" class="modal-backdrop">
      <button @click="close">close</button>
    </form>
  </dialog>
</template>