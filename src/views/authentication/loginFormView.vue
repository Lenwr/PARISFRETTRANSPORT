<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Ship } from "lucide-vue-next"
import { useAuthStore } from "../../stores/useAuthStore"

const router = useRouter()
const store = useAuthStore()
const showPassword = ref(false)
const loading = ref(false)

async function submit() {
  loading.value = true
  store.error = null

  try {
    await store.login()
    if (!store.error) router.push("/")
  } catch (error) {
    if (!store.error) store.error = "Connexion impossible. Veuillez réessayer."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="min-h-screen bg-[radial-gradient(circle_at_18%_12%,rgba(15,118,110,0.12),transparent_30rem),linear-gradient(135deg,#fbfcfb_0%,#f4f7f4_48%,#eef3ef_100%)] text-slate-950 lg:grid lg:grid-cols-[minmax(520px,1fr)_minmax(500px,0.8fr)]">
    <aside class="relative hidden min-h-screen overflow-hidden lg:block">
      <img src="/images/chargements.jpg" alt="Chargement de colis" class="absolute inset-0 h-full w-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-br from-[#07110f]/92 via-[#10201d]/78 to-[#0f766e]/58" />
      <div class="relative z-10 flex h-full flex-col justify-between px-12 py-12 xl:px-16">
        <div class="flex items-center gap-3 text-white">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-xl">
            <Ship class="h-6 w-6" />
          </div>
          <div>
            <p class="text-xl font-black">Paris Fret Transport</p>
            <p class="text-xs text-white/65">Application de gestion interne</p>
          </div>
        </div>

        <div class="max-w-2xl text-white">
          <p class="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Espace privé</p>
          <h1 class="mt-5 text-5xl font-black leading-[0.98] tracking-[-0.055em] xl:text-7xl">
            Clients, colis et départs au même endroit.
          </h1>
          <p class="mt-7 max-w-lg text-lg leading-8 text-white/70">
            Votre outil quotidien pour enregistrer, scanner, suivre et informer vos clients.
          </p>
        </div>

        <p class="text-sm text-white/45">© {{ new Date().getFullYear() }} Paris Fret Transport</p>
      </div>
    </aside>

    <main class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-14">
      <div class="w-full max-w-md">
        <div class="mb-10 flex items-center gap-3 lg:hidden">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <Ship class="h-6 w-6" />
          </div>
          <div>
            <p class="text-xl font-black">Paris Fret Transport</p>
            <p class="text-xs text-slate-500">Application de gestion interne</p>
          </div>
        </div>

        <div class="mb-8">
          <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Connexion sécurisée</p>
          <h2 class="mt-4 text-4xl font-black tracking-[-0.055em] sm:text-5xl">Bienvenue</h2>
          <p class="mt-4 text-base leading-7 text-slate-500">Connectez-vous avec votre compte administrateur.</p>
        </div>

        <form class="rounded-[28px] border border-slate-950/[0.07] bg-white/85 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.10)] sm:p-8" @submit.prevent="submit">
          <div class="space-y-5">
            <label class="block">
              <span class="text-sm font-black text-slate-800">Adresse e-mail</span>
              <span class="relative mt-2 block">
                <Mail class="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input v-model="store.email" type="email" required autocomplete="email" class="input input-bordered h-12 w-full rounded-lg border-slate-200 bg-slate-50 pl-11" placeholder="votre@email.fr" />
              </span>
            </label>

            <label class="block">
              <span class="text-sm font-black text-slate-800">Mot de passe</span>
              <span class="relative mt-2 block">
                <Lock class="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input v-model="store.password" :type="showPassword ? 'text' : 'password'" required autocomplete="current-password" class="input input-bordered h-12 w-full rounded-lg border-slate-200 bg-slate-50 px-11" />
                <button type="button" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Afficher le mot de passe" @click="showPassword = !showPassword">
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </span>
            </label>
          </div>

          <p v-if="store.error" class="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ store.error }}</p>

          <button type="submit" :disabled="loading" class="btn mt-7 h-12 w-full rounded-lg bg-slate-950 text-white hover:bg-slate-800">
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            <ArrowRight v-else class="h-4 w-4" />
            {{ loading ? "Connexion…" : "Se connecter" }}
          </button>
        </form>
      </div>
    </main>
  </section>
</template>
