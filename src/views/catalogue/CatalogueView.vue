<script setup>
import { computed, onMounted, ref } from "vue"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore"
import { useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import { Pencil, Plus, Search, Trash2, X } from "lucide-vue-next"
import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"

const db = useFirestore()
const authStore = useAuthStore()
const articles = ref([])
const search = ref("")
const loading = ref(false)
const saving = ref(false)
const editorOpen = ref(false)
const editingId = ref(null)

const entrepriseId = computed(() =>
  authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID
)

const emptyArticle = () => ({
  nom: "",
  categorie: "Général",
  unite: "Pièce",
  typeTarif: "fixe",
  prixUnitaire: 0,
  prixParM3: 0,
  ordre: 100,
  actif: true
})

const form = ref(emptyArticle())

const filteredArticles = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return articles.value

  return articles.value.filter(article =>
    `${article.nom} ${article.categorie} ${article.unite} ${article.typeTarif}`.toLowerCase().includes(term)
  )
})

async function fetchArticles() {
  loading.value = true
  try {
    const snap = await getDocs(query(
      collection(db, "catalogueArticles"),
      where("entrepriseId", "==", entrepriseId.value)
    ))

    articles.value = snap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => Number(a.ordre || 100) - Number(b.ordre || 100) || a.nom.localeCompare(b.nom))
  } catch (error) {
    console.error(error)
    toast("Impossible de charger le catalogue", { type: "error" })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = emptyArticle()
  editorOpen.value = true
}

function openEdit(article) {
  editingId.value = article.id
  form.value = {
    nom: article.nom || "",
    categorie: article.categorie || "Général",
    unite: article.unite || "Pièce",
    typeTarif: article.typeTarif || "fixe",
    prixUnitaire: Number(article.prixUnitaire || 0),
    prixParM3: Number(article.prixParM3 || 0),
    ordre: Number(article.ordre || 100),
    actif: article.actif !== false
  }
  editorOpen.value = true
}

async function saveArticle() {
  const nom = form.value.nom.trim()
  if (!nom) return toast("Le nom de l’article est requis", { type: "warning" })

  const duplicate = articles.value.find(article =>
    article.id !== editingId.value && article.nom.trim().toLowerCase() === nom.toLowerCase()
  )
  if (duplicate) return toast("Cet article existe déjà", { type: "warning" })

  saving.value = true
  const payload = {
    ...form.value,
    nom,
    prixUnitaire: Math.max(Number(form.value.prixUnitaire || 0), 0),
    prixParM3: Math.max(Number(form.value.prixParM3 || 0), 0),
    ordre: Number(form.value.ordre || 100),
    entrepriseId: entrepriseId.value,
    updatedAt: serverTimestamp()
  }

  try {
    if (editingId.value) {
      await updateDoc(doc(db, "catalogueArticles", editingId.value), payload)
    } else {
      await addDoc(collection(db, "catalogueArticles"), {
        ...payload,
        createdAt: serverTimestamp()
      })
    }

    editorOpen.value = false
    await fetchArticles()
    toast(editingId.value ? "Article modifié" : "Article ajouté", { type: "success" })
  } catch (error) {
    console.error(error)
    toast("Impossible d’enregistrer l’article", { type: "error" })
  } finally {
    saving.value = false
  }
}

async function toggleArticle(article) {
  await updateDoc(doc(db, "catalogueArticles", article.id), {
    actif: article.actif === false,
    updatedAt: serverTimestamp()
  })
  await fetchArticles()
}

async function removeArticle(article) {
  if (!window.confirm(`Supprimer « ${article.nom} » du catalogue ?`)) return
  await deleteDoc(doc(db, "catalogueArticles", article.id))
  await fetchArticles()
  toast("Article supprimé", { type: "success" })
}

onMounted(fetchArticles)
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-[0.22em] text-primary">Articles</p>
        <h1 class="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">Catalogue colis</h1>
        <p class="mt-2 text-slate-500">Gérez les articles proposés lors de la création d’un colis.</p>
      </div>
      <button class="btn h-12 rounded-lg bg-slate-950 text-white" @click="openCreate">
        <Plus class="h-4 w-4" /> Ajouter un article
      </button>
    </header>

    <label class="input input-bordered flex h-12 max-w-xl items-center gap-3 rounded-lg bg-white">
      <Search class="h-4 w-4 text-slate-400" />
      <input v-model="search" class="grow" placeholder="Rechercher un article…" />
    </label>

    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="hidden grid-cols-[minmax(190px,1fr)_140px_125px_150px_80px_170px] gap-4 border-b bg-slate-50 px-6 py-4 text-xs font-black uppercase text-slate-500 md:grid">
        <span>Article</span><span>Catégorie</span><span>Unité</span><span>Tarification</span><span>Actif</span><span>Actions</span>
      </div>

      <p v-if="loading" class="p-8 text-center text-slate-500">Chargement…</p>
      <p v-else-if="!filteredArticles.length" class="p-8 text-center text-slate-500">Aucun article dans le catalogue.</p>

      <div
        v-for="article in filteredArticles"
        v-else
        :key="article.id"
        class="grid gap-3 border-b border-slate-100 px-6 py-5 last:border-0 md:grid-cols-[minmax(190px,1fr)_140px_125px_150px_80px_170px] md:items-center"
      >
        <div>
          <p class="font-black text-slate-950">{{ article.nom }}</p>
          <p class="text-xs text-slate-400">Ordre {{ article.ordre || 100 }}</p>
        </div>
        <span class="text-sm text-slate-600">{{ article.categorie }}</span>
        <span class="text-sm text-slate-600">{{ article.unite }}</span>
        <div class="text-sm">
          <p class="font-black text-slate-900">{{ article.typeTarif === "volume" ? "Au volume" : "Prix fixe" }}</p>
          <p class="text-slate-500">{{ Number(article.typeTarif === "volume" ? article.prixParM3 : article.prixUnitaire || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) }}{{ article.typeTarif === "volume" ? " / m³" : "" }}</p>
        </div>
        <button class="w-fit rounded-full px-3 py-1 text-xs font-black" :class="article.actif !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'" @click="toggleArticle(article)">
          {{ article.actif !== false ? "OUI" : "NON" }}
        </button>
        <div class="flex gap-2">
          <button class="btn btn-sm rounded-lg" @click="openEdit(article)"><Pencil class="h-4 w-4" /> Modifier</button>
          <button class="btn btn-sm rounded-lg text-red-600" @click="removeArticle(article)"><Trash2 class="h-4 w-4" /></button>
        </div>
      </div>
    </div>

    <dialog class="modal" :open="editorOpen">
      <div class="modal-box max-w-xl rounded-3xl bg-white p-7 text-slate-950">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-black">{{ editingId ? "Modifier l’article" : "Nouvel article" }}</h2>
          <button class="btn btn-circle btn-ghost btn-sm" @click="editorOpen = false"><X class="h-5 w-5" /></button>
        </div>

        <form class="mt-6 grid gap-4 sm:grid-cols-2" @submit.prevent="saveArticle">
          <label class="sm:col-span-2"><span class="mb-2 block text-sm font-bold">Nom</span><input v-model="form.nom" required class="input input-bordered w-full rounded-lg" placeholder="Ex. Télévision" /></label>
          <label><span class="mb-2 block text-sm font-bold">Catégorie</span><input v-model="form.categorie" class="input input-bordered w-full rounded-lg" placeholder="Général" /></label>
          <label><span class="mb-2 block text-sm font-bold">Unité</span><select v-model="form.unite" class="select select-bordered w-full rounded-lg"><option>Pièce</option><option>Carton</option><option>Kg</option><option>Lot</option><option>Pouce</option></select></label>
          <label><span class="mb-2 block text-sm font-bold">Type de tarif</span><select v-model="form.typeTarif" class="select select-bordered w-full rounded-lg"><option value="fixe">Prix fixe par unité</option><option value="volume">Prix au m³</option></select></label>
          <label v-if="form.typeTarif === 'fixe'"><span class="mb-2 block text-sm font-bold">Prix unitaire (€)</span><input v-model.number="form.prixUnitaire" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-lg" /></label>
          <label v-else><span class="mb-2 block text-sm font-bold">Prix par m³ (€)</span><input v-model.number="form.prixParM3" type="number" min="0" step="0.01" class="input input-bordered w-full rounded-lg" /></label>
          <label><span class="mb-2 block text-sm font-bold">Ordre</span><input v-model.number="form.ordre" type="number" class="input input-bordered w-full rounded-lg" /></label>
          <label class="flex items-center gap-3 pt-8"><input v-model="form.actif" type="checkbox" class="toggle toggle-primary" /><span class="font-bold">Article actif</span></label>
          <button type="submit" :disabled="saving" class="btn btn-primary mt-2 rounded-lg sm:col-span-2">{{ saving ? "Enregistrement…" : "Enregistrer" }}</button>
        </form>
      </div>
      <button class="modal-backdrop" type="button" aria-label="Fermer" @click="editorOpen = false"></button>
    </dialog>
  </section>
</template>
