<script setup>
import { ref, computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { StreamBarcodeReader } from "vue-barcode-reader"

import {
  collection,
  doc,
  getDoc,
  runTransaction
} from "firebase/firestore"

import {
  useCollection,
  useFirestore
} from "vuefire"

import {
  Camera,
  CheckCircle2,
  Package,
  Plane
} from "lucide-vue-next"

import { toast } from "vue3-toastify"
import { useAuthStore } from "../../stores/useAuthStore"
import { PARIS_FRET_ENTREPRISE_ID } from "../../appConfig"

const route = useRoute()
const router = useRouter()

const db = useFirestore()

const voyageId = route.params.id

const loading = ref(false)
const scanned = ref([])
const isRedirecting = ref(false)

const authStore = useAuthStore()
const entrepriseId = computed(() => authStore.entreprise?.id || authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID)
const manualCode = ref("")

function onLoaded() {
  console.log("scanner loaded")
}

function parseQrCode(text) {

  const value = String(text || "").trim()

  if (!value) return null

  // 🔥 Nouveau format TS|docId|colisIndex|detailIndex
  if (value.startsWith("TS|")) {

    const parts = value.split("|")

    // QR principal
    if (parts.length === 2) {

      return {
        enlevementId: parts[1],
        colisIndex: null,
        detailIndex: null,
        packageId: ""
      }

    }

    // QR colis individuel
    if (parts.length >= 4) {

      return {

        enlevementId: parts[1],

        colisIndex: Number(parts[2]),

        detailIndex: Number(parts[3]),

        packageId: ""

      }

    }

  }

  // 🔥 Ancien format JSON
  try {

    const data = JSON.parse(value)

    if (
      data?.enlevementId &&
      data?.colisIndex !== undefined &&
      data?.detailIndex !== undefined
    ) {

      return {

        enlevementId: data.enlevementId,

        colisIndex: Number(data.colisIndex),

        detailIndex: Number(data.detailIndex),

        packageId: data.packageId || ""

      }

    }

  } catch {

    // ignore

  }

  // 🔥 Ancien format virgules
  if (value.includes(",")) {

    const parts =
      value.split(",").map(item => item.trim())

    if (parts.length >= 6) {

      return {

        enlevementId: parts[3],

        colisIndex: Number(parts[4]),

        detailIndex: Number(parts[5]),

        packageId: ""

      }

    }

  }

  return null

}

async function attachPackageToVoyage(parsed) {
  try {
    await runTransaction(db, async transaction => {
      const container = await transaction.get(doc(db, "chargements", voyageId))
      const reference = doc(db, "enlevements", parsed.enlevementId)
      const snapshot = await transaction.get(reference)
      const data = snapshot.data()
      if (!container.exists() || container.data().entrepriseId !== entrepriseId.value || !data || data.entrepriseId !== entrepriseId.value) {
        throw new Error("Conteneur ou colis inaccessible")
      }
      const colis = data.colis || []
      const details = parsed.colisIndex === null
        ? colis.flatMap(group => group.details || [])
        : [colis[parsed.colisIndex]?.details?.[parsed.detailIndex]].filter(Boolean)
      if (!details.length) throw new Error("Colis introuvable")
      if (details.some(detail => detail.voyageId && detail.voyageId !== voyageId)) {
        throw new Error("Un colis est déjà affecté à un autre conteneur")
      }
      if (details.every(detail => detail.voyageId === voyageId)) throw new Error("Colis déjà ajouté")
      for (const detail of details) {
        detail.voyageId = voyageId
        detail.statutColis = "Chargé dans le conteneur"
      }
      transaction.update(reference, { colis, updatedAt: new Date() })
    })
    scanned.value.unshift({
      id: parsed.enlevementId + "-" + Date.now(),
      enlevementId: parsed.enlevementId,
      date: new Date().toLocaleTimeString(),
      status: "Ajouté au conteneur"
    })
    manualCode.value = ""
    toast("Colis ajouté au conteneur", { type: "success" })
  } catch (error) {
    console.error(error)
    toast(error.message || "Erreur scan", { type: "error" })
  }
}

async function onDecode(text) {

  if (loading.value) return

  loading.value = true

  try {

    const parsed =
      parseQrCode(text)

    if (!parsed) {

      toast("QR code invalide", {
        type: "error"
      })

      return

    }

    await attachPackageToVoyage(parsed)

  } finally {

    setTimeout(() => {
      loading.value = false
    }, 1200)

  }

}
</script>

<template>
  <section class="scanner-page">

    <!-- TOP -->

    <div class="scanner-top">

      <button
        class="back-btn"
        @click="router.back()"
      >
        Retour
      </button>

      <div>

        <p class="scanner-label">
          Conteneur
        </p>

        <h1 class="scanner-title">
          Scanner colis
        </h1>

      </div>

    </div>

    <!-- CAMERA -->

    <div class="scanner-wrapper">

      <StreamBarcodeReader
        @decode="onDecode"
        @loaded="onLoaded"
      />

      <div class="scanner-overlay">

        <div class="scan-box"></div>

      </div>

    </div>

    <!-- BOTTOM -->

    <div class="scanner-bottom">
      <form class="mb-4 flex gap-2" @submit.prevent="onDecode(manualCode)">
        <input v-model="manualCode" class="input input-bordered min-w-0 flex-1" aria-label="Code du colis" placeholder="Code du colis" required />
        <button class="btn btn-primary" :disabled="loading">Ajouter</button>
      </form>

      <div class="scanner-bottom-header">

        <div>

          <h2>
            Colis scannés
          </h2>

          <p>
            {{
              scanned.length
            }}
            colis ajoutés
          </p>

        </div>

        <div class="scan-icon">
          <Plane class="h-5 w-5" />
        </div>

      </div>

      <div
        v-if="scanned.length === 0"
        class="empty-state"
      >

        <Camera class="mb-2 h-8 w-8" />

        <p>
          Aucun colis scanné
        </p>

      </div>

      <ul
        v-else
        class="scan-list"
      >

        <li
          v-for="item in scanned"
          :key="item.id"
        >

          <div class="scan-item-left">

            <div class="scan-check">
              <CheckCircle2
                class="h-5 w-5"
              />
            </div>

            <div>

              <h3>
                {{ item.enlevementId }}
              </h3>

              <p>
                {{ item.date }}
              </p>

            </div>

          </div>

          <span class="scan-status">
            {{ item.status }}
          </span>

        </li>

      </ul>

    </div>

  </section>
</template>

<style scoped>
.scanner-page {
  position: fixed;
  inset: 0;
  background: black;
  overflow: hidden;
}

.scanner-wrapper {
  position: absolute;
  inset: 0;
}

.scanner-wrapper :deep(video) {
  width: 100vw !important;
  height: 100vh !important;
  object-fit: cover !important;
}

.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.scan-box {
  width: 250px;
  height: 250px;
  border: 4px solid white;
  border-radius: 28px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.45);
}

.scanner-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background:
    linear-gradient(
      to bottom,
      rgba(0,0,0,.7),
      transparent
    );
  color: white;
}

.back-btn {
  border: 0;
  background: rgba(255,255,255,.15);
  color: white;
  padding: 10px 16px;
  border-radius: 16px;
  font-weight: 700;
}

.scanner-label {
  font-size: 12px;
  opacity: .7;
}

.scanner-title {
  font-size: 22px;
  font-weight: 900;
}

.scanner-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: white;
  border-top-left-radius: 32px;
  border-top-right-radius: 32px;
  padding: 20px;
  max-height: 38vh;
  overflow-y: auto;
}

.scanner-bottom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.scanner-bottom-header h2 {
  font-size: 20px;
  font-weight: 900;
  color: #0f172a;
}

.scanner-bottom-header p {
  font-size: 13px;
  color: #64748b;
}

.scan-icon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: #0f172a;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  height: 130px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #94a3b8;
}

.scan-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scan-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 22px;
  background: #f8fafc;
}

.scan-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-check {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #dcfce7;
  color: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-item-left h3 {
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}

.scan-item-left p {
  font-size: 12px;
  color: #64748b;
}

.scan-status {
  font-size: 11px;
  font-weight: 800;
  padding: 8px 12px;
  border-radius: 999px;
  background: #dbeafe;
  color: #2563eb;
}
</style>
