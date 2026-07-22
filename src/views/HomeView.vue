<script setup>
import { computed, onMounted, watch } from "vue"
import {
  Package,
  Users,
  Truck,
  Plus,
  ArrowRight,
  Boxes,
  RefreshCw,
  ClipboardList,
  Ship,
  Clock
} from "lucide-vue-next"

import { useAuthStore } from "../stores/useAuthStore"
import { useEnlevementStore } from "../stores/modules/colis"
import { PARIS_FRET_ENTREPRISE_ID, PARIS_FRET_ENTREPRISE_NAME } from "../appConfig"

const authStore = useAuthStore()
const enlevementStore = useEnlevementStore()

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)
const entrepriseNom = computed(() => authStore.entreprise?.nom || PARIS_FRET_ENTREPRISE_NAME)

const totalEnlevements = computed(() => enlevementStore.totalEnlevements)
const enlevementsDuJour = computed(() => enlevementStore.enlevementsDuJour)
const loading = computed(() => enlevementStore.loading)

const stats = computed(() => [
  {
    label: "Colis enregistrés",
    value: totalEnlevements.value,
    helper: "Tous les dossiers",
    icon: Package,
    tone: "primary"
  },
  {
    label: "Aujourd'hui",
    value: enlevementsDuJour.value,
    helper: "Nouveaux enlèvements",
    icon: Clock,
    tone: "emerald"
  },
  {
    label: "Clients",
    value: "—",
    helper: "À connecter",
    icon: Users,
    tone: "sky"
  },
  {
    label: "Chargements",
    value: "—",
    helper: "En préparation",
    icon: Boxes,
    tone: "amber"
  }
])

const actions = [
  {
    title: "Enregistrer un colis",
    description: "Créer une fiche colis, générer le numéro et accéder au suivi.",
    to: "/form",
    icon: Plus
  },
  {
    title: "Ajouter un client",
    description: "Créer ou retrouver rapidement un expéditeur existant.",
    to: "/customersForm",
    icon: Users
  },
  {
    title: "Préparer un chargement",
    description: "Assembler les colis attribués à un voyage ou conteneur.",
    to: "/recording",
    icon: Truck
  }
]

const toneClasses = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-50 text-emerald-700",
  sky: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-700"
}

async function loadDashboardData() {
  if (!entrepriseId.value) return
  await enlevementStore.fetchEnlevements(entrepriseId.value)
}

onMounted(loadDashboardData)

watch(entrepriseId, async newEntrepriseId => {
  if (newEntrepriseId) {
    await loadDashboardData()
  }
})
</script>

<template>
  <section class="space-y-8">
    <div class="rounded-[30px] border border-slate-950/[0.07] bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10">
      <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-2xl">
          <p class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-primary">
            <Ship class="h-4 w-4" />
            Tableau de bord
          </p>
          <h1 class="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.055em] text-slate-950 sm:text-6xl">
            Bonjour, {{ entrepriseNom }}
          </h1>
          <p class="mt-6 max-w-xl text-base leading-7 text-slate-500">
            Suivez les opérations importantes, créez vos colis et gardez une vision claire de votre activité.
          </p>
        </div>

        <button
          class="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-950/[0.08] bg-white px-5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60"
          :disabled="loading"
          @click="loadDashboardData"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          Actualiser
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="rounded-[24px] border border-slate-950/[0.07] bg-white/82 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_26px_80px_rgba(15,23,42,0.09)]"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-bold text-slate-500">{{ stat.label }}</p>
            <p class="mt-4 text-4xl font-black tracking-[-0.05em] text-slate-950">
              {{ loading ? "..." : stat.value }}
            </p>
          </div>
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl" :class="toneClasses[stat.tone]">
            <component :is="stat.icon" class="h-5 w-5" />
          </div>
        </div>
        <p class="mt-4 text-xs font-bold uppercase text-slate-400">
          {{ stat.helper }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_0.75fr]">
      <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/82 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:p-8">
        <div class="mb-7 flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-[0.18em] text-primary">Actions rapides</p>
            <h2 class="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Démarrer une opération</h2>
          </div>
          <ClipboardList class="h-6 w-6 text-slate-300" />
        </div>

        <div class="grid gap-3">
          <router-link
            v-for="action in actions"
            :key="action.to"
            :to="action.to"
            class="group flex items-center gap-5 rounded-2xl border border-slate-950/[0.07] bg-white/70 p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.035]"
          >
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
              <component :is="action.icon" class="h-5 w-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-black text-slate-950">{{ action.title }}</p>
              <p class="mt-1 text-sm leading-5 text-slate-500">{{ action.description }}</p>
            </div>
            <ArrowRight class="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary" />
          </router-link>
        </div>
      </div>

      <div class="rounded-[28px] border border-white/10 bg-[#101816] p-7 text-white shadow-[0_28px_80px_rgba(15,23,42,0.16)] sm:p-8">
        <p class="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Résumé opérationnel</p>
        <h2 class="mt-3 text-2xl font-black tracking-[-0.04em]">À surveiller</h2>
        <div class="mt-7 space-y-3">
          <div class="rounded-2xl border border-white/8 bg-white/[0.06] p-5">
            <p class="text-sm font-bold text-white/72">Colis du jour</p>
            <p class="mt-2 text-2xl font-black">{{ loading ? "..." : enlevementsDuJour }}</p>
          </div>
          <div class="rounded-2xl border border-white/8 bg-white/[0.06] p-5">
            <p class="text-sm font-bold text-white/72">Total actuel</p>
            <p class="mt-2 text-2xl font-black">{{ loading ? "..." : totalEnlevements }}</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="enlevementStore.error"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
    >
      {{ enlevementStore.error }}
    </div>
  </section>
</template>
