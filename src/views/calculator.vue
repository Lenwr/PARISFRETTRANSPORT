<script setup>
import { Calculator, FileText, PackageCheck } from "lucide-vue-next"

const tools = [
  {
    to: "/tools/volume",
    icon: Calculator,
    title: "Calculateur de volume",
    description: "Calculez les m3, renseignez le client, appliquez une remise et exportez les documents PDF.",
    actions: ["Facture", "Bordereau", "PDF"]
  },
  {
    to: "/factures",
    icon: FileText,
    title: "Factures et devis",
    description: "Créez une facture ou un devis libre avec lignes, TVA, paiement et remise.",
    actions: ["Facture", "Devis"]
  }
]
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p class="text-sm font-bold text-primary">Outils</p>
      <div class="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-2xl font-black text-slate-950 sm:text-3xl">
            Centre d'outils
          </h1>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Retrouvez les outils opérationnels et ajoutez-en de nouveaux depuis cette liste.
          </p>
        </div>

        <div class="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">
          <PackageCheck class="h-4 w-4 text-primary" />
          {{ tools.length }} outils
        </div>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <router-link
        v-for="tool in tools"
        :key="tool.to"
        :to="tool.to"
        class="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <component :is="tool.icon" class="h-5 w-5" />
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 transition group-hover:bg-primary/10 group-hover:text-primary">
            Ouvrir
          </span>
        </div>

        <h2 class="mt-5 text-lg font-black text-slate-950">{{ tool.title }}</h2>
        <p class="mt-2 min-h-[48px] text-sm leading-6 text-slate-500">{{ tool.description }}</p>

        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="action in tool.actions"
            :key="action"
            class="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600"
          >
            {{ action }}
          </span>
        </div>
      </router-link>
    </div>
  </section>
</template>
