<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue'
import SignaturePad from 'signature_pad'
import { doc, getDoc, serverTimestamp, updateDoc, getFirestore } from 'firebase/firestore'
import router from '../router/index'
import { notify } from '../utils/notifications'

const signatureCanvas = ref(null)
const signerName = ref("")
let signaturePad
let resizeObserver



const props = defineProps({
  detailId: String,
  colisIndex: Number,
  detailIndex: {
    type: Number,
    default: null
  },
  defaultName: { type: String, default: "" },
  deliveryMode: { type: String, default: "delivery" }
})

const db = getFirestore()

onMounted(() => {
  signerName.value = props.defaultName
  const resizeCanvas = () => {
    const canvas = signatureCanvas.value
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext("2d").scale(ratio, ratio)
    signaturePad?.clear()
  }
  resizeCanvas()
  signaturePad = new SignaturePad(signatureCanvas.value, { backgroundColor: "#ffffff" })
  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(signatureCanvas.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

const clearSignature = () => {
  signaturePad.clear()
}

const saveSignature = async () => {
  if (!signerName.value.trim()) {
    notify("Merci d’indiquer le nom de la personne qui reçoit le colis.", "warning")
    return
  }
  if (signaturePad.isEmpty()) {
    notify("Merci de signer avant de valider.", "warning")
    return
  }

  const signatureDataUrl = signaturePad.toDataURL()
  const docRef = doc(db, "enlevements", props.detailId)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    notify("Document introuvable.", "error")
    return
  }

  const docData = docSnap.data()
  const colis = docData.colis || []

  // ✅ Nouveau format (avec sous-colis)
  if (
    Number.isInteger(props.colisIndex) &&
    props.detailIndex !== null &&
    colis[props.colisIndex]?.details &&
    colis[props.colisIndex].details[props.detailIndex]
  ) {
    colis[props.colisIndex].details[props.detailIndex].statutColis = true
  }
  // 🟡 Ancien format (pas de sous-colis)
  else if (Number.isInteger(props.colisIndex) && colis[props.colisIndex] && !colis[props.colisIndex].details) {
    colis[props.colisIndex].statutColis = true
  }

  const proof = {
    nom: signerName.value.trim(),
    mode: props.deliveryMode,
    signature: signatureDataUrl,
    date: new Date().toISOString()
  }
  const payload = {
    colis,
    deliveryStatus: props.deliveryMode === "pickup" ? "Récupéré" : "Livré",
    preuveLivraison: proof,
    deliveredAt: serverTimestamp()
  }

  await updateDoc(docRef, payload)
  notify(props.deliveryMode === "pickup" ? "Récupération signée." : "Livraison signée.", "success")
   router.push({
          path: `/liste/${props.detailId}`
   })
}
</script>

<template>
  <div class="w-full space-y-5">
    <label class="block text-left">
      <span class="mb-2 block text-sm font-black text-slate-700">Nom de la personne qui reçoit</span>
      <input v-model="signerName" class="input input-bordered w-full rounded-xl bg-white" autocomplete="name" placeholder="Écrire le nom" />
    </label>

    <div>
      <p class="mb-2 text-left text-sm font-black text-slate-700">Signature</p>
      <canvas ref="signatureCanvas" class="h-52 w-full touch-none rounded-xl border border-slate-300 bg-white"></canvas>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <button @click="clearSignature" class="btn flex-1 rounded-xl bg-slate-100">Effacer</button>
      <button @click="saveSignature" class="btn flex-1 rounded-xl bg-emerald-600 text-white">Valider la signature</button>
    </div>
  </div>
</template>
