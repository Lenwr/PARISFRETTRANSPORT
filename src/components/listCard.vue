<script setup>
import { computed } from "vue"
import { ArrowRight, MapPin, Package } from "lucide-vue-next"

const props = defineProps({
  image: {
    type: [String, Array],
    default: ""
  },
  date: String,
  nbreColis: {
    type: [String, Number],
    default: 0
  },
  statut: String,
  deliveryStatus: String,
  expediteur: String,
  destinateur: String,
  destination: String
})

const paymentTone = computed(() => {
  if (props.statut === "Payé") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (props.statut === "Reste à payer") return "bg-amber-50 text-amber-700 border-amber-200"
  if (props.statut === "Non Payé") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-50 text-slate-600 border-slate-200"
})
</script>

<template>
  <article class="h-full rounded-[26px] border border-slate-950/[0.07] bg-white/82 p-6 shadow-[0_18px_56px_rgba(15,23,42,0.06)] backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_26px_80px_rgba(15,23,42,0.10)]">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Package class="h-5 w-5" />
        </div>
        <div>
          <p class="text-base font-black tracking-[-0.03em] text-slate-950">{{ nbreColis }} colis</p>
          <p class="mt-1 text-xs font-semibold text-slate-500">{{ date || "Date non disponible" }}</p>
        </div>
      </div>

      <span class="rounded-full border px-3 py-1.5 text-xs font-black" :class="paymentTone">
        {{ statut || "Non dispo" }}
      </span>
    </div>

    <div class="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div class="min-w-0">
        <p class="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Expéditeur</p>
        <p class="mt-1 truncate text-sm font-black text-slate-900">
          {{ expediteur || "Non dispo" }}
        </p>
      </div>

      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <ArrowRight class="h-4 w-4" />
      </div>

      <div class="min-w-0 text-right">
        <p class="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Destinataire</p>
        <p class="mt-1 truncate text-sm font-black text-slate-900">
          {{ destinateur || "Non dispo" }}
        </p>
      </div>
    </div>

    <div class="mt-7 flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-4 py-3.5">
      <div class="flex min-w-0 items-center gap-2">
        <MapPin class="h-4 w-4 shrink-0 text-primary" />
        <span class="truncate text-sm font-bold text-slate-700">
          {{ destination || "Destination non définie" }}
        </span>
      </div>

      <span class="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm">
        {{ deliveryStatus || "En attente" }}
      </span>
    </div>
  </article>
</template>
