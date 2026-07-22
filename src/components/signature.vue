<script setup>
import { ref, onMounted } from 'vue'
import SignaturePad from 'signature_pad'
import { doc, getDoc, updateDoc, getFirestore } from 'firebase/firestore'
import router from '../router/index'

const signatureCanvas = ref(null)
let signaturePad



const props = defineProps({
  detailId: String,
  colisIndex: Number,
  detailIndex: {
    type: Number,
    default: null
  }
})

const db = getFirestore()

onMounted(() => {
  signaturePad = new SignaturePad(signatureCanvas.value)
})

const clearSignature = () => {
  signaturePad.clear()
}

const saveSignature = async () => {
  if (signaturePad.isEmpty()) {
    alert("Merci de signer avant de valider.")
    return
  }

  const signatureDataUrl = signaturePad.toDataURL()
  const docRef = doc(db, "enlevements", props.detailId)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    alert("Document introuvable.")
    return
  }

  const docData = docSnap.data()
  const colis = docData.colis || []

  // ✅ Nouveau format (avec sous-colis)
  if (
    props.detailIndex !== null &&
    colis[props.colisIndex]?.details &&
    colis[props.colisIndex].details[props.detailIndex]
  ) {
    colis[props.colisIndex].details[props.detailIndex].statutColis = true
  }
  // 🟡 Ancien format (pas de sous-colis)
  else if (colis[props.colisIndex] && !colis[props.colisIndex].details) {
    colis[props.colisIndex].statutColis = true
  } else {
    alert("Colis introuvable pour mise à jour.")
    return
  }

  await updateDoc(docRef, { colis })
  alert("Signature enregistrée et statut mis à jour.")
   router.push({
          path: `/liste/${props.detailId}`
   })
}
</script>

<template>
  <div class="space-y-4 text-center">
    <canvas ref="signatureCanvas" class="border border-gray-300 rounded-md w-full h-48"></canvas>

    <div class="flex justify-center gap-4">
      <button @click="clearSignature" class="bg-gray-500 text-white px-4 py-2 rounded-lg">Effacer</button>
      <button @click="saveSignature" class="bg-green-600 text-white px-4 py-2 rounded-lg">Valider</button>
    </div>
  </div>
</template>
