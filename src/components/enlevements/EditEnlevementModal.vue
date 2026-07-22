<script setup>
import { computed, ref, watch } from "vue"
import { X, Save, Plus, Trash2 } from "lucide-vue-next"
import { parseMoney } from "../../utils/money"

const props = defineProps({
  modelValue: Boolean,
  enlevement: {
    type: Object,
    required: true
  }
})

const emit = defineEmits([
  "update:modelValue",
  "save"
])

const indicatifs = [
  { pays: "France", code: "+33" },
  { pays: "Cameroun", code: "+237" },
  { pays: "Togo", code: "+228" },
  { pays: "Benin", code: "+229" },
  { pays: "Côte d'Ivoire", code: "+225" },
  { pays: "Mali", code: "+223" },
  { pays: "Sénégal", code: "+221" },
  { pays: "Congo", code: "+242" },
  { pays: "RDC", code: "+243" },
  { pays: "Guinée", code: "+224" },
  { pays: "Gabon", code: "+241" },
  { pays: "États-Unis", code: "+1" }
]

const form = ref({})

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit("update:modelValue", value)
})

watch(
  () => props.enlevement,
  value => {
    form.value = {
      expediteur: value?.expediteur || "",
      telephoneExpediteur: value?.telephoneExpediteur || "",
      indicatifExpediteur: value?.indicatifExpediteur || "+33",

      destinataire: value?.destinataire || "",
      telephoneDestinataire: value?.telephoneDestinataire || "",
      indicatifDestinataire: value?.indicatifDestinataire || "+237",

      destination: value?.destination || "",

      typeDeFret: value?.typeDeFret || "Maritime",

      personneEnCharge: value?.personneEnCharge || "",
      telephoneAgent: value?.telephoneAgent || "",
      indicatifAgent: value?.indicatifAgent || "+33",

      statut: value?.statut || "Non Payé",

      prix: value?.prix || "",

      resteAPayer: value?.resteAPayer || "",

      modeDePaiement: value?.modeDePaiement || "Espèces",

      colis: JSON.parse(
        JSON.stringify(value?.colis || [])
      )
    }
  },
  {
    immediate: true,
    deep: true
  }
)

function close() {
  isOpen.value = false
}

function generatePackageId() {
  return `PKG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
}

function normalizePhone(indicatif, phone) {
  const cleaned = String(phone || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")

  if (!cleaned) return ""

  if (cleaned.startsWith("+")) {
    return cleaned
  }

  return `${indicatif}${cleaned.replace(/^0+/, "")}`
}

function addColis() {
  form.value.colis.push({
    nom: "",
    quantite: 1,
    poids: "",
    poidsTotal: 0,
    details: []
  })
}

function removeColis(index) {
  if (form.value.colis.length <= 1) return

  form.value.colis.splice(index, 1)
}

function buildColis() {
  return form.value.colis.map(item => {

    const quantite = Math.max(
      Number(item.quantite || 1),
      1
    )

    const poids = form.value.typeDeFret === "Aérien"
      ? Number(item.poids || 0)
      : 0

    const oldDetails = item.details || []

    const details = Array.from(
      { length: quantite },
      (_, i) => {

        const oldDetail = oldDetails[i]

        return {
          packageId:
            oldDetail?.packageId ||
            generatePackageId(),

          coli: `${item.nom} ${i + 1}/${quantite}`,

          statutColis:
            oldDetail?.statutColis ||
            "En attente",

          poids,

          voyageId:
            oldDetail?.voyageId || ""
        }
      }
    )

    return {
      nom: item.nom,
      quantite,
      poids,
      poidsTotal: poids * quantite,
      details
    }

  })
}

function submit() {

  const colis = buildColis()

  const nombreDeColis = colis.reduce(
    (total, item) =>
      total + Number(item.quantite || 0),
    0
  )

  const poidsTotal = colis.reduce(
    (total, item) =>
      total + Number(item.poidsTotal || 0),
    0
  )

  emit("save", {

    ...form.value,

    telephoneExpediteur: normalizePhone(
      form.value.indicatifExpediteur,
      form.value.telephoneExpediteur
    ),

    telephoneDestinataire: normalizePhone(
      form.value.indicatifDestinataire,
      form.value.telephoneDestinataire
    ),

    telephoneAgent:
      form.value.typeDeFret === "Aérien"
        ? normalizePhone(
            form.value.indicatifAgent,
            form.value.telephoneAgent
          )
        : "",

    prix: parseMoney(form.value.prix),

    resteAPayer: parseMoney(form.value.resteAPayer),

    colis,

    nombreDeColis,

    poidsTotal:
      form.value.typeDeFret === "Aérien"
        ? poidsTotal
        : 0,

    personneEnCharge:
      form.value.typeDeFret === "Aérien"
        ? form.value.personneEnCharge
        : "",

    indicatifExpediteur:
      form.value.indicatifExpediteur,

    indicatifDestinataire:
      form.value.indicatifDestinataire,

    indicatifAgent:
      form.value.indicatifAgent

  })
}
</script>

<template>
  <dialog
    class="modal"
    :open="isOpen"
  >
    <div class="modal-box max-w-4xl rounded-3xl bg-white text-slate-900">

      <div class="mb-6 flex items-center justify-between">

        <h3 class="text-xl font-bold">
          Modifier le colis
        </h3>

        <button
          type="button"
          class="btn btn-ghost btn-circle"
          @click="close"
        >
          <X class="h-5 w-5" />
        </button>

      </div>

      <form
        class="space-y-6"
        @submit.prevent="submit"
      >

        <!-- INFOS -->
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">

          <input
            v-model="form.expediteur"
            class="input input-bordered rounded-2xl"
            placeholder="Expéditeur"
          />

          <div class="flex gap-2">

            <select
              v-model="form.indicatifExpediteur"
              class="select select-bordered w-32 rounded-2xl"
            >
              <option
                v-for="item in indicatifs"
                :key="item.code"
                :value="item.code"
              >
                {{ item.code }}
              </option>
            </select>

            <input
              v-model="form.telephoneExpediteur"
              class="input input-bordered w-full rounded-2xl"
              placeholder="Téléphone expéditeur"
            />

          </div>

          <input
            v-model="form.destinataire"
            class="input input-bordered rounded-2xl"
            placeholder="Destinataire"
          />

          <div class="flex gap-2">

            <select
              v-model="form.indicatifDestinataire"
              class="select select-bordered w-32 rounded-2xl"
            >
              <option
                v-for="item in indicatifs"
                :key="item.code"
                :value="item.code"
              >
                {{ item.code }}
              </option>
            </select>

            <input
              v-model="form.telephoneDestinataire"
              class="input input-bordered w-full rounded-2xl"
              placeholder="Téléphone destinataire"
            />

          </div>

          <select
            v-model="form.typeDeFret"
            class="select select-bordered rounded-2xl"
          >
            <option>Maritime</option>
            <option>Aérien</option>
          </select>

          <input
            v-model="form.destination"
            class="input input-bordered rounded-2xl"
            placeholder="Destination"
          />

          <!-- AGENT -->
          <template v-if="form.typeDeFret === 'Aérien'">

            <input
              v-model="form.personneEnCharge"
              class="input input-bordered rounded-2xl"
              placeholder="Agent"
            />

            <div class="flex gap-2">

              <select
                v-model="form.indicatifAgent"
                class="select select-bordered w-32 rounded-2xl"
              >
                <option
                  v-for="item in indicatifs"
                  :key="item.code"
                  :value="item.code"
                >
                  {{ item.code }}
                </option>
              </select>

              <input
                v-model="form.telephoneAgent"
                class="input input-bordered w-full rounded-2xl"
                placeholder="Téléphone agent"
              />

            </div>

          </template>

        </div>

        <!-- COLIS -->
        <div class="rounded-3xl bg-slate-50 p-4">

          <div class="mb-4 flex items-center justify-between">

            <h4 class="font-bold text-slate-900">
              Colis
            </h4>

            <button
              type="button"
              class="btn btn-outline btn-sm rounded-2xl"
              @click="addColis"
            >
              <Plus class="h-4 w-4" />
              Ajouter
            </button>

          </div>

          <div class="space-y-3">

            <div
              v-for="(item, index) in form.colis"
              :key="index"
              class="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_90px_120px_44px]"
            >

              <input
                v-model="item.nom"
                class="input input-bordered rounded-2xl"
                placeholder="Nom du colis"
              />

              <input
                v-model.number="item.quantite"
                type="number"
                min="1"
                class="input input-bordered rounded-2xl text-center"
                placeholder="Qté"
              />

              <input
                v-if="form.typeDeFret === 'Aérien'"
                v-model.number="item.poids"
                type="number"
                min="0"
                step="0.1"
                class="input input-bordered rounded-2xl"
                placeholder="Poids kg"
              />

              <button
                type="button"
                class="btn btn-ghost btn-circle text-red-500"
                @click="removeColis(index)"
              >
                <Trash2 class="h-5 w-5" />
              </button>

            </div>

          </div>

        </div>

        <!-- PAIEMENT -->
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">

          <select
            v-model="form.statut"
            class="select select-bordered rounded-2xl"
          >
            <option>Non Payé</option>
            <option>Reste à payer</option>
            <option>Payé</option>
          </select>

          <select
            v-model="form.modeDePaiement"
            class="select select-bordered rounded-2xl"
          >
            <option>Espèces</option>
            <option>Chèque</option>
            <option>CB</option>
            <option>Virement</option>
          </select>

          <input
            v-model="form.prix"
            class="input input-bordered rounded-2xl"
            placeholder="Prix"
          />

          <input
            v-model="form.resteAPayer"
            class="input input-bordered rounded-2xl"
            placeholder="Reste à payer"
          />

        </div>

        <!-- SUBMIT -->
        <button
          type="submit"
          class="btn btn-primary w-full rounded-2xl"
        >
          <Save class="h-5 w-5" />
          Enregistrer les modifications
        </button>

      </form>

    </div>

    <form
      method="dialog"
      class="modal-backdrop"
    >
      <button @click="close">
        close
      </button>
    </form>
  </dialog>
</template>
