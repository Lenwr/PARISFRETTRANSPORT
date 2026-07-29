<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import {
  Home,
  Package,
  Users,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  CalendarDays,
  Calculator,
  FileText,
  MessageCircle,
  Ship,
  BookOpen,
  Bell,
  ScanLine
} from "lucide-vue-next"
import { useAuthStore } from "../stores/useAuthStore"
import PageLoader from "../components/PageLoader.vue"
import { db } from "../components/firebaseConfig"

const store = useAuthStore()
const router = useRouter()
const route = useRoute()
const isNavigating = ref(false)
const mobileMenuOpen = ref(false)
const pendingRequests = ref(0)
let navigationTimer
let unsubscribeRequests

const entreprise = computed(() => store.entreprise)

const logoUrl = computed(() => {
  return entreprise.value?.logoUrl || "/images/logo.png"
})

const entrepriseNom = computed(() => {
  return entreprise.value?.nom || "Paris Fret Transport"
})

const navLinks = [
  { to: "/", icon: Home, label: "Vue générale" },
  { to: "/customers", icon: Users, label: "Clients" },
  { to: "/liste", icon: Package, label: "Colis" },
  { to: "/catalogue", icon: BookOpen, label: "Catalogue" },
  { to: "/suivi-clients", icon: MessageCircle, label: "Suivi clients" },
  { to: "/demandes", icon: Bell, label: "Demandes" },
  { to: "/livraisons/scan", icon: ScanLine, label: "Scan livraison" },
  { to: "/recording", icon: Truck, label: "Départs" },
  { to: "/planing", icon: CalendarDays, label: "Planning", superAdminOnly: true },
  { to: "/factures", icon: FileText, label: "Factures" },
  { to: "/tools", icon: Calculator, label: "Outils" },
  { to: "/settings", icon: Settings, label: "Paramètres" }
]

const visibleNavLinks = computed(() => {
  return navLinks.filter(link => !link.superAdminOnly || store.superAdmin)
})

const quickActions = [
  { to: "/form", label: "Nouveau colis", icon: Plus },
  { to: "/customersForm", label: "Nouveau client", icon: Users },
  { to: "/customers/broadcast", label: "Diffusion clients", icon: MessageCircle }
]

const routePreloaders = {
  "/": () => import("../views/HomeView.vue"),
  "/customers": () => import("../views/customers/customersView.vue"),
  "/customers/broadcast": () => import("../views/customers/CustomersBroadcastView.vue"),
  "/customersForm": () => import("../views/customers/customersFormView.vue"),
  "/liste": () => import("../views/liste/listeView.vue"),
  "/catalogue": () => import("../views/catalogue/CatalogueView.vue"),
  "/suivi-clients": () => import("../views/customers/ClientFollowUpView.vue"),
  "/demandes": () => import("../views/requests/ClientRequestsView.vue"),
  "/livraisons/scan": () => import("../views/deliveries/DeliveryScanView.vue"),
  "/recording": () => import("../views/chargements/loadingPackagesRecording.vue"),
  "/planing": () => import("../views/planingCalendarView.vue"),
  "/factures": () => import("../views/factures/InvoicesQuotesView.vue"),
  "/calculator": () => import("../views/volumeCalculator.vue"),
  "/tools": () => import("../views/calculator.vue"),
  "/tools/volume": () => import("../views/volumeCalculator.vue"),
  "/settings": () => import("../views/parametres.vue"),
  "/form": () => import("../views/liste/form.vue")
}

const activeGroups = {
  "/": ["/"],
  "/customers": ["/customers", "/customersDetails", "/selectForm"],
  "/liste": ["/liste"],
  "/catalogue": ["/catalogue"],
  "/suivi-clients": ["/suivi-clients"],
  "/demandes": ["/demandes"],
  "/livraisons/scan": ["/livraisons/scan", "/sign"],
  "/recording": ["/recording", "/chargementsDetails"],
  "/planing": ["/planing"],
  "/factures": ["/factures"],
  "/tools": ["/tools", "/calculator", "/tools/volume"],
  "/settings": ["/settings"]
}

function isNavActive(link) {
  const paths = activeGroups[link.to] || [link.to]

  return paths.some(path => {
    if (path === "/") return route.path === "/"
    return route.path === path || route.path.startsWith(`${path}/`)
  })
}

function preloadRoute(to) {
  routePreloaders[to]?.()
}

function startNavigation(to) {
  preloadRoute(to)
  mobileMenuOpen.value = false

  if (route.path !== to) {
    clearTimeout(navigationTimer)
    isNavigating.value = true
  }
}

function finishNavigation() {
  clearTimeout(navigationTimer)
  navigationTimer = setTimeout(() => {
    isNavigating.value = false
  }, 250)
}

watch(
  () => entreprise.value?.id,
  entrepriseId => {
    unsubscribeRequests?.()
    pendingRequests.value = 0
    if (!entrepriseId) return

    unsubscribeRequests = onSnapshot(
      query(
        collection(db, "clientRequests"),
        where("entrepriseId", "==", entrepriseId),
        where("status", "==", "pending")
      ),
      snapshot => { pendingRequests.value = snapshot.size },
      error => console.error("Erreur notifications demandes :", error)
    )
  },
  { immediate: true }
)

async function handleLogout() {
  mobileMenuOpen.value = false
  await store.logout()
  router.push("/login")
}

let removeAfterEach
let removeOnError

onMounted(async () => {
  const user = store.getCurrentUser()

  if (user) {
    await store.fetchUserProfile(user.uid)
  }

  removeAfterEach = router.afterEach(() => {
    finishNavigation()
  })

  removeOnError = router.onError(() => {
    finishNavigation()
  })
})

onBeforeUnmount(() => {
  clearTimeout(navigationTimer)
  unsubscribeRequests?.()
  removeAfterEach?.()
  removeOnError?.()
})
</script>

<template>
  <div class="min-h-screen text-slate-950">
    <div
      v-if="isNavigating"
      class="fixed left-0 right-0 top-0 z-[90] h-1 overflow-hidden bg-emerald-900/5 lg:left-80"
    >
      <div class="h-full w-1/2 animate-[nav-progress_900ms_ease-in-out_infinite] bg-primary"></div>
    </div>

    <div
      v-if="isNavigating"
      class="pf-glass fixed right-5 top-5 z-[95] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold text-slate-900 lg:right-8"
    >
      <span class="loading loading-spinner loading-sm text-primary"></span>
      Chargement
    </div>

    <aside class="fixed left-0 top-0 z-40 hidden h-screen w-80 flex-col border-r border-white/10 bg-[var(--pf-sidebar)] text-white lg:flex">
      <div class="flex h-24 items-center gap-4 px-7">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-white/15">
          <img :src="logoUrl" class="h-full w-full object-cover" alt="" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-[15px] font-black tracking-[-0.02em]">{{ entrepriseNom }}</p>
          <p class="mt-1 text-xs font-semibold text-emerald-100/50">Opérations privées</p>
        </div>
      </div>

      <div class="px-5 pb-5">
        <router-link
          v-for="action in quickActions"
          :key="action.to"
          :to="action.to"
          class="mb-2 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.06] px-4 py-3.5 text-sm font-extrabold text-white transition last:mb-0 hover:-translate-y-0.5 hover:border-emerald-300/20 hover:bg-emerald-300/10"
          @click="startNavigation(action.to)"
          @mouseenter="preloadRoute(action.to)"
          @touchstart.passive="preloadRoute(action.to)"
        >
          <component :is="action.icon" class="h-4 w-4 text-emerald-300" />
          {{ action.label }}
        </router-link>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-5 py-4">
        <router-link
          v-for="link in visibleNavLinks"
          :key="link.to"
          :to="link.to"
          class="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold text-white/54 transition hover:bg-white/[0.07] hover:text-white"
          :class="isNavActive(link) ? 'bg-white text-[#10201d] shadow-[0_18px_45px_rgba(0,0,0,0.18)]' : ''"
          @click="startNavigation(link.to)"
          @mouseenter="preloadRoute(link.to)"
          @touchstart.passive="preloadRoute(link.to)"
        >
          <component :is="link.icon" class="h-5 w-5" />
          <span>{{ link.label }}</span>
        </router-link>
      </nav>

      <div class="p-5">
        <button
          class="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white/55 transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100"
          @click="handleLogout"
        >
          <LogOut class="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>

    <div v-if="mobileMenuOpen" class="fixed inset-0 z-[85] lg:hidden">
      <button
        type="button"
        class="absolute inset-0 bg-slate-950/55"
        aria-label="Fermer le menu"
        @click="mobileMenuOpen = false"
      ></button>

      <aside class="absolute right-0 top-0 flex h-full w-[min(88vw,380px)] flex-col bg-[var(--pf-sidebar)] text-white shadow-2xl">
        <div class="flex h-24 items-center justify-between gap-3 px-6">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
              <img :src="logoUrl" class="h-full w-full object-cover" alt="" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-base font-black">{{ entrepriseNom }}</p>
              <p class="text-xs font-medium text-white/45">Opérations privées</p>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-square rounded-lg text-white"
            @click="mobileMenuOpen = false"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <div class="border-b border-white/10 p-4">
          <router-link
            v-for="action in quickActions"
            :key="action.to"
            :to="action.to"
            class="mb-2 flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3.5 text-sm font-bold text-white transition last:mb-0 hover:bg-white/14"
            @click="startNavigation(action.to)"
            @touchstart.passive="preloadRoute(action.to)"
          >
            <component :is="action.icon" class="h-4 w-4 text-emerald-300" />
            {{ action.label }}
          </router-link>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <router-link
            v-for="link in visibleNavLinks"
            :key="link.to"
            :to="link.to"
            class="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold text-white/68 transition hover:bg-white/10 hover:text-white"
            :class="isNavActive(link) ? 'bg-white text-slate-950' : ''"
            @click="startNavigation(link.to)"
            @touchstart.passive="preloadRoute(link.to)"
          >
            <component :is="link.icon" class="h-5 w-5" />
            <span>{{ link.label }}</span>
          </router-link>
        </nav>

        <div class="border-t border-white/10 p-4">
          <button
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-white/12 px-4 py-3 text-sm font-bold text-white/75 transition hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-100"
            @click="handleLogout"
          >
            <LogOut class="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>
    </div>

    <header class="fixed left-0 right-0 top-0 z-30 h-20 border-b border-slate-950/[0.06] bg-white/70 backdrop-blur-2xl lg:left-80">
      <div class="flex h-full items-center justify-between gap-4 px-5 lg:px-10">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 lg:hidden">
            <Ship class="h-5 w-5 text-white" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-black text-slate-950 lg:text-[15px]">
              {{ entrepriseNom }}
            </p>
            <p class="hidden text-xs font-semibold text-slate-500 sm:block">
              Clients, colis et départs
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <router-link
            to="/demandes"
            class="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="Demandes en attente"
            @click="startNavigation('/demandes')"
          >
            <Bell class="h-5 w-5" />
            <span v-if="pendingRequests" class="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
              {{ pendingRequests > 99 ? "99+" : pendingRequests }}
            </span>
          </router-link>

          <router-link
            to="/form"
            class="hidden items-center gap-2 rounded-2xl bg-[var(--pf-accent)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(15,118,110,0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--pf-accent-strong)] sm:flex"
            @click="startNavigation('/form')"
            @mouseenter="preloadRoute('/form')"
            @touchstart.passive="preloadRoute('/form')"
          >
            <Plus class="h-4 w-4" />
            Colis
          </router-link>

          <div class="dropdown dropdown-end hidden lg:block">
            <button tabindex="0" class="btn btn-ghost btn-square rounded-lg text-slate-700">
              <Menu class="h-5 w-5" />
            </button>

            <ul
              tabindex="0"
              class="menu dropdown-content z-[80] mt-3 w-60 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-xl"
            >
              <li><router-link to="/customersForm" @click="startNavigation('/customersForm')">Enregistrer un client</router-link></li>
              <li><router-link to="/form" @click="startNavigation('/form')">Enregistrer un colis</router-link></li>
              <li><router-link to="/customers" @click="startNavigation('/customers')">Mes clients</router-link></li>
              <li><router-link to="/customers/broadcast" @click="startNavigation('/customers/broadcast')">Diffusion clients</router-link></li>
              <li><router-link to="/liste" @click="startNavigation('/liste')">Mes colis</router-link></li>
              <li>
                <button class="font-bold text-error" @click="handleLogout">
                  Déconnexion
                </button>
              </li>
            </ul>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-square rounded-lg text-slate-700 lg:hidden"
            @click="mobileMenuOpen = true"
          >
            <Menu class="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>

    <nav class="fixed bottom-0 left-0 right-0 z-40 flex h-16 gap-1 overflow-x-auto border-t border-slate-950/[0.06] bg-white/85 px-2 backdrop-blur-2xl lg:hidden">
      <router-link
        v-for="link in visibleNavLinks"
        :key="link.to"
        :to="link.to"
        class="flex min-w-[76px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold text-slate-500"
        :class="isNavActive(link) ? 'text-primary' : ''"
        @click="startNavigation(link.to)"
        @touchstart.passive="preloadRoute(link.to)"
      >
        <component :is="link.icon" class="h-5 w-5" />
        <span>{{ link.label }}</span>
      </router-link>
    </nav>

    <main class="min-h-screen px-4 pb-24 pt-24 sm:px-6 lg:ml-80 lg:px-10 lg:pb-12 lg:pt-28">
      <div class="mx-auto w-full max-w-[1440px]">
        <router-view v-slot="{ Component, route }">
          <Transition name="page" mode="out-in">
            <Suspense>
              <component :is="Component" :key="route.fullPath" />

              <template #fallback>
                <PageLoader />
              </template>
            </Suspense>
          </Transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@keyframes nav-progress {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(220%);
  }
}
</style>
