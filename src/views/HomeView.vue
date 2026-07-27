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
  Clock,
  Banknote,
  WalletCards,
  TrendingUp,
  CircleDollarSign,
  Plane,
  CircleCheck,
  AlertCircle
} from "lucide-vue-next"

import { useAuthStore } from "../stores/useAuthStore"
import { useEnlevementStore } from "../stores/modules/colis"
import { PARIS_FRET_ENTREPRISE_ID, PARIS_FRET_ENTREPRISE_NAME } from "../appConfig"
import { formatMoney, parseMoney } from "../utils/money"

const authStore = useAuthStore()
const enlevementStore = useEnlevementStore()

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)
const entrepriseNom = computed(() => authStore.entreprise?.nom || PARIS_FRET_ENTREPRISE_NAME)

const totalEnlevements = computed(() => enlevementStore.totalEnlevements)
const enlevementsDuJour = computed(() => enlevementStore.enlevementsDuJour)
const loading = computed(() => enlevementStore.loading)
const enlevements = computed(() => enlevementStore.enlevements || [])

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === "function") return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sameMonth(date, reference) {
  return date
    && date.getMonth() === reference.getMonth()
    && date.getFullYear() === reference.getFullYear()
}

const financials = computed(() => {
  const now = new Date()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  let revenue = 0
  let collected = 0
  let remaining = 0
  let monthRevenue = 0
  let previousMonthRevenue = 0

  enlevements.value.forEach(item => {
    const price = parseMoney(item.prix)
    const recordedDue = Math.max(0, parseMoney(item.resteAPayer))
    const due = item.statut === "Payé"
      ? 0
      : item.statut === "Non Payé" && recordedDue <= 0
        ? price
        : Math.min(price, recordedDue)
    const date = toDate(item.date) || toDate(item.createdAt)
    revenue += price
    remaining += due
    collected += Math.max(0, price - due)
    if (sameMonth(date, now)) monthRevenue += price
    if (sameMonth(date, previousMonth)) previousMonthRevenue += price
  })

  const growth = previousMonthRevenue > 0
    ? ((monthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
    : monthRevenue > 0 ? 100 : 0

  return { revenue, collected, remaining, monthRevenue, previousMonthRevenue, growth }
})

const paidCount = computed(() => enlevements.value.filter(item =>
  item.statut === "Payé" || parseMoney(item.resteAPayer) <= 0 && parseMoney(item.prix) > 0
).length)
const unpaidCount = computed(() => enlevements.value.filter(item =>
  parseMoney(item.resteAPayer) > 0 || item.statut === "Non Payé" || item.statut === "Reste à payer"
).length)
const averageBasket = computed(() =>
  enlevements.value.length ? financials.value.revenue / enlevements.value.length : 0
)
const maritimeCount = computed(() => enlevements.value.filter(item => item.typeDeFret === "Maritime").length)
const airCount = computed(() => enlevements.value.filter(item => item.typeDeFret === "Aérien").length)
const deliveredCount = computed(() => enlevements.value.filter(item =>
  ["Livré", "Réceptionné"].includes(item.deliveryStatus)
).length)
const pendingCount = computed(() => Math.max(0, enlevements.value.length - deliveredCount.value))
const uniqueClients = computed(() => new Set(enlevements.value.map(item =>
  String(item.telephoneExpediteur || item.expediteur || "").trim().toLowerCase()
).filter(Boolean)).size)

const lastSevenDays = computed(() => {
  const formatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    return { date, label: formatter.format(date).replace(".", ""), revenue: 0, count: 0 }
  })

  enlevements.value.forEach(item => {
    const date = toDate(item.date) || toDate(item.createdAt)
    if (!date) return
    const day = days.find(entry => entry.date.toDateString() === date.toDateString())
    if (!day) return
    day.revenue += parseMoney(item.prix)
    day.count++
  })

  const maximum = Math.max(...days.map(day => day.revenue), 1)
  return days.map(day => ({ ...day, height: Math.max(day.revenue ? 12 : 3, day.revenue / maximum * 100) }))
})

const recentShipments = computed(() => [...enlevements.value]
  .sort((a, b) => (toDate(b.date) || toDate(b.createdAt) || 0) - (toDate(a.date) || toDate(a.createdAt) || 0))
  .slice(0, 5)
)

const stats = computed(() => [
  {
    label: "Chiffre d’affaires",
    value: formatMoney(financials.value.revenue),
    helper: `${totalEnlevements.value} dossiers au total`,
    icon: Banknote,
    tone: "primary"
  },
  {
    label: "CA du mois",
    value: formatMoney(financials.value.monthRevenue),
    helper: `${financials.value.growth >= 0 ? "+" : ""}${financials.value.growth.toFixed(1)} % vs mois précédent`,
    icon: TrendingUp,
    tone: "emerald"
  },
  {
    label: "Montant encaissé",
    value: formatMoney(financials.value.collected),
    helper: `${paidCount.value} dossiers soldés`,
    icon: WalletCards,
    tone: "sky"
  },
  {
    label: "Reste à encaisser",
    value: formatMoney(financials.value.remaining),
    helper: `${unpaidCount.value} paiements à surveiller`,
    icon: CircleDollarSign,
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

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/90 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] sm:p-8">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-xs font-black uppercase tracking-[0.18em] text-primary">Activité financière</p>
            <h2 class="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Chiffre d’affaires sur 7 jours</h2>
          </div>
          <p class="text-sm font-bold text-slate-500">Panier moyen : <span class="text-slate-950">{{ formatMoney(averageBasket) }}</span></p>
        </div>

        <div class="mt-8 grid h-64 grid-cols-7 items-end gap-2 sm:gap-4">
          <div v-for="day in lastSevenDays" :key="day.date.toISOString()" class="flex h-full min-w-0 flex-col justify-end">
            <p class="mb-2 truncate text-center text-[10px] font-black text-slate-500 sm:text-xs">{{ day.revenue ? formatMoney(day.revenue) : "0 €" }}</p>
            <div class="relative flex h-44 items-end overflow-hidden rounded-xl bg-slate-100">
              <div class="w-full rounded-xl bg-gradient-to-t from-primary to-emerald-400 transition-all duration-500" :style="{ height: `${day.height}%` }"></div>
            </div>
            <p class="mt-2 text-center text-xs font-black uppercase text-slate-500">{{ day.label }}</p>
            <p class="text-center text-[10px] text-slate-400">{{ day.count }} colis</p>
          </div>
        </div>
      </div>

      <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/90 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] sm:p-8">
        <p class="text-xs font-black uppercase tracking-[0.18em] text-primary">Indicateurs clés</p>
        <h2 class="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Résumé activité</h2>
        <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
            <div class="flex items-center gap-3"><Users class="h-5 w-5 text-sky-600" /><span class="font-bold text-slate-600">Clients uniques</span></div><strong class="text-xl text-slate-950">{{ uniqueClients }}</strong>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
            <div class="flex items-center gap-3"><Ship class="h-5 w-5 text-primary" /><span class="font-bold text-slate-600">Maritime</span></div><strong class="text-xl text-slate-950">{{ maritimeCount }}</strong>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
            <div class="flex items-center gap-3"><Plane class="h-5 w-5 text-violet-600" /><span class="font-bold text-slate-600">Aérien</span></div><strong class="text-xl text-slate-950">{{ airCount }}</strong>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
            <div class="flex items-center gap-3"><CircleCheck class="h-5 w-5 text-emerald-600" /><span class="font-bold text-emerald-800">Livrés</span></div><strong class="text-xl text-emerald-900">{{ deliveredCount }}</strong>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-amber-50 p-4">
            <div class="flex items-center gap-3"><AlertCircle class="h-5 w-5 text-amber-600" /><span class="font-bold text-amber-800">En cours</span></div><strong class="text-xl text-amber-900">{{ pendingCount }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-[28px] border border-slate-950/[0.07] bg-white/90 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.07)] sm:p-8">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-xs font-black uppercase tracking-[0.18em] text-primary">Monitoring</p>
          <h2 class="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Derniers colis enregistrés</h2>
        </div>
        <router-link to="/liste" class="btn btn-sm rounded-xl bg-slate-950 text-white">Voir tous</router-link>
      </div>
      <div class="mt-6 overflow-x-auto">
        <table class="table">
          <thead><tr class="text-xs uppercase text-slate-400"><th>Numéro</th><th>Expéditeur</th><th>Transport</th><th>Paiement</th><th class="text-right">Montant</th></tr></thead>
          <tbody>
            <tr v-for="item in recentShipments" :key="item.id" class="border-slate-100">
              <td><router-link :to="`/liste/${item.id}`" class="font-black text-primary">{{ item.numero || "Colis" }}</router-link></td>
              <td><p class="font-bold text-slate-900">{{ item.expediteur || "-" }}</p><p class="text-xs text-slate-400">{{ item.destination || "-" }}</p></td>
              <td><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{{ item.typeDeFret || "-" }}</span></td>
              <td><span class="text-sm font-bold" :class="item.statut === 'Payé' ? 'text-emerald-600' : 'text-amber-600'">{{ item.statut || "Non Payé" }}</span></td>
              <td class="text-right font-black">{{ formatMoney(parseMoney(item.prix)) }}</td>
            </tr>
            <tr v-if="!recentShipments.length"><td colspan="5" class="py-8 text-center text-slate-400">Aucun colis enregistré.</td></tr>
          </tbody>
        </table>
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
            <p class="text-sm font-bold text-white/72">Colis enregistrés aujourd’hui</p>
            <p class="mt-2 text-2xl font-black">{{ loading ? "..." : enlevementsDuJour }}</p>
          </div>
          <div class="rounded-2xl border border-white/8 bg-white/[0.06] p-5">
            <p class="text-sm font-bold text-white/72">Taux d’encaissement</p>
            <p class="mt-2 text-2xl font-black">{{ loading ? "..." : `${financials.revenue ? (financials.collected / financials.revenue * 100).toFixed(1) : 0} %` }}</p>
          </div>
          <div class="rounded-2xl border border-amber-300/15 bg-amber-300/[0.08] p-5">
            <p class="text-sm font-bold text-amber-100/80">À encaisser</p>
            <p class="mt-2 text-2xl font-black text-amber-200">{{ loading ? "..." : formatMoney(financials.remaining) }}</p>
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
