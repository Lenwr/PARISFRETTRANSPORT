<script setup>
import { CheckCircle2 } from "lucide-vue-next"
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-950">
    <section class="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-12">
      <img src="/images/logo.png" alt="Paris Fret Transport" class="mx-auto h-20 w-20 rounded-2xl object-contain" />
      <div class="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 class="h-9 w-9" />
      </div>
      <p class="mt-7 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Demande transmise</p>
      <h1 class="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Merci !</h1>
      <p class="mt-4 text-lg leading-8 text-slate-600">
        Votre demande d’enlèvement a bien été envoyée à Paris Fret Transport.
      </p>
      <p class="mt-3 text-sm leading-6 text-slate-500">
        Notre équipe va la vérifier et vous contactera pour confirmer la suite.
      </p>
      <div class="mt-8 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
        Ce formulaire a été fermé et ne peut plus être envoyé une deuxième fois.
      </div>
    </section>
  </main>
</template>
