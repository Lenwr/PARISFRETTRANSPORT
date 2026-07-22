<script setup>
import { ref } from 'vue'
import { StreamBarcodeReader } from 'vue-barcode-reader'
import { useFirestore } from 'vuefire'
import { doc, getDoc } from 'firebase/firestore'
import router from '../router/index.js'

const db = useFirestore()

const decodedText = ref('')
const Client = ref(null)

const onLoaded = () => {
  console.log('Scanner chargé')
}

const onDecode = async (text) => {
  decodedText.value = text

  // Vérifie si c’est le nouveau format avec des virgules (QR code complet)
  if (text.includes(',')) {
    const parts = text.split(',')

    // Ancien format de QR à 7 éléments → nouvel avec detailIndex
    if (parts.length === 6 || parts.length === 7) {
      const [expediteur, destinataire, nombreDeColis, docId, colisIndex, detailIndex] = parts.map(p => p.trim())

      const snap = await getDoc(doc(db, 'enlevements', docId))
      const client = snap.exists()
        ? {
            id: snap.id,
            ...snap.data()
          }
        : null

      if (client) {
        Client.value = client

        router.push({
          path: `/sign/${docId}`,
          query: {
            colisIndex,
            detailIndex
          }
        })
      } else {
        console.warn("❌ Client non trouvé avec l’ID :", docId)
      }
    } else {
      console.warn("❌ Format QR non reconnu :", text)
    }

  } else {
    // Ancien QR code simple : uniquement ID Firebase
    const id = text.trim()
    router.push({ path: `/sign/${id}` })
  }
}

</script>

<template>
  <div class="full-screen">
    <StreamBarcodeReader
      @decode="onDecode"
      @loaded="onLoaded"
    />
  </div>
</template>

<style scoped>
.full-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: black;
}
</style>
