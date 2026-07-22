<script setup>
import { computed, reactive, ref } from "vue"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import jsPDF from "jspdf"
import { ArrowLeft, Download, Mail, Plus, Save, Trash2 } from "lucide-vue-next"
import { toast } from "vue3-toastify"
import { db } from "../components/firebaseConfig"
import { PARIS_FRET_ENTREPRISE_ID } from "../appConfig"
import { useAuthStore } from "../stores/useAuthStore"

const authStore = useAuthStore()
const saving = ref(false)

const volumeLines = reactive([{ qte: 1, length: 0, width: 0, height: 0 }])

const form = reactive({
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  clientAddress: "",
  reference: generateReference(),
  date: new Date().toISOString().slice(0, 10),
  pricePerM3: 0,
  vatRate: 20,
  discountType: "amount",
  discount: 0,
  notes: ""
})

const company = computed(() => {
  const data = authStore.entreprise || {}
  const address = data.address || {}
  const structuredAddress = [
    address.number || data.numeroRue,
    address.street || data.rue,
    address.postalCode || data.codePostal,
    address.city || data.ville,
    address.country || data.pays
  ].filter(Boolean).join(" ")

  return {
    name: data.nom || data.companyName || "Paris Fret Transport",
    email: data.email || "",
    phone: data.tel || "",
    logoUrl: data.logoUrl || data.logoURL || data.logo || data.imageUrl || "/images/logo.png",
    address: data.adresse || structuredAddress
  }
})

function generateReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = String(Math.floor(Math.random() * 9999)).padStart(4, "0")
  return `DEV-VOL-${date}-${suffix}`
}

function addVolumeLine() {
  volumeLines.push({ qte: 1, length: 0, width: 0, height: 0 })
}

function removeVolumeLine(index) {
  if (volumeLines.length === 1) return
  volumeLines.splice(index, 1)
}

function calcLineVolume(line) {
  return Number(line.qte || 0)
    * (Number(line.length || 0) / 100)
    * (Number(line.width || 0) / 100)
    * (Number(line.height || 0) / 100)
}

const totalVolume = computed(() => volumeLines.reduce((sum, line) => sum + calcLineVolume(line), 0))
const subtotal = computed(() => totalVolume.value * Number(form.pricePerM3 || 0))
const discountAmount = computed(() => {
  const discount = Math.max(0, Number(form.discount || 0))
  return form.discountType === "percent"
    ? Math.min(subtotal.value, subtotal.value * discount / 100)
    : Math.min(subtotal.value, discount)
})
const totalPrice = computed(() => Math.max(0, subtotal.value - discountAmount.value))
const vatAmount = computed(() => {
  const rate = Math.max(0, Number(form.vatRate || 0))
  return rate ? totalPrice.value * rate / (100 + rate) : 0
})

function currency(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0))
}

function drawText(pdf, value, x, y, options = {}) {
  pdf.text(String(value || "-"), x, y, options)
}

function fileNamePart(value) {
  return String(value || "document").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document"
}

async function imageUrlToBase64(url) {
  if (!url) return null
  try {
    const response = await fetch(new URL(url, window.location.origin).href)
    const blob = await response.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function validateQuote() {
  if (!form.clientName.trim()) {
    toast("Nom du client requis", { type: "warning", autoClose: 1500 })
    return false
  }
  if (totalVolume.value <= 0) {
    toast("Ajoutez au moins une dimension valide", { type: "warning", autoClose: 1500 })
    return false
  }
  return true
}

async function createVolumePdf() {
  if (!validateQuote()) return
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true })
  const logoImage = await imageUrlToBase64(company.value.logoUrl)
  let y = 18

  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, 210, 42, "F")
  if (logoImage) {
    pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(14, 9, 24, 24, 4, 4, "F")
    pdf.addImage(logoImage, "PNG", 17, 12, 18, 18)
  }
  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(18)
  drawText(pdf, company.value.name, logoImage ? 45 : 14, y)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8.5)
  drawText(pdf, company.value.email, logoImage ? 45 : 14, y + 8)
  drawText(pdf, company.value.phone, logoImage ? 45 : 14, y + 14)
  pdf.setFillColor(37, 99, 235)
  pdf.roundedRect(140, 10, 56, 18, 4, 4, "F")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(13)
  drawText(pdf, "DEVIS VOLUME", 168, 20, { align: "center" })
  pdf.setFontSize(8)
  drawText(pdf, form.reference, 168, 31, { align: "center" })

  y = 56
  pdf.setTextColor(37, 99, 235)
  pdf.setFontSize(11)
  drawText(pdf, "Entreprise", 14, y)
  drawText(pdf, "Destinataire", 116, y)
  pdf.setTextColor(15, 23, 42)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  y += 8
  drawText(pdf, company.value.name, 14, y)
  drawText(pdf, form.clientName, 116, y)
  y += 6
  drawText(pdf, company.value.address, 14, y)
  drawText(pdf, form.clientAddress, 116, y)
  y += 6
  drawText(pdf, company.value.phone, 14, y)
  drawText(pdf, form.clientPhone, 116, y)
  y += 6
  drawText(pdf, company.value.email, 14, y)
  drawText(pdf, form.clientEmail, 116, y)

  y += 15
  pdf.setFillColor(248, 250, 252)
  pdf.roundedRect(14, y - 7, 182, 18, 4, 4, "F")
  pdf.setFont("helvetica", "bold")
  drawText(pdf, `Date : ${form.date}`, 18, y)
  drawText(pdf, `Prix/m3 TTC : ${currency(form.pricePerM3)}`, 74, y)
  drawText(pdf, `TVA : ${form.vatRate || 0}%`, 158, y)

  y += 22
  pdf.setFillColor(15, 23, 42)
  pdf.roundedRect(14, y, 182, 10, 2, 2, "F")
  pdf.setTextColor(255, 255, 255)
  drawText(pdf, "Qté", 18, y + 7)
  drawText(pdf, "Longueur", 48, y + 7)
  drawText(pdf, "Largeur", 88, y + 7)
  drawText(pdf, "Hauteur", 128, y + 7)
  drawText(pdf, "Volume", 174, y + 7)
  y += 14
  pdf.setTextColor(15, 23, 42)
  pdf.setFont("helvetica", "normal")
  volumeLines.forEach((line, index) => {
    if (index % 2 === 0) {
      pdf.setFillColor(248, 250, 252)
      pdf.rect(14, y - 5, 182, 11, "F")
    }
    drawText(pdf, line.qte || 0, 18, y + 2)
    drawText(pdf, `${line.length || 0} cm`, 48, y + 2)
    drawText(pdf, `${line.width || 0} cm`, 88, y + 2)
    drawText(pdf, `${line.height || 0} cm`, 128, y + 2)
    drawText(pdf, `${calcLineVolume(line).toFixed(3)} m3`, 192, y + 2, { align: "right" })
    y += 11
  })

  y += 9
  pdf.setFontSize(9)
  drawText(pdf, "Volume total", 128, y)
  drawText(pdf, `${totalVolume.value.toFixed(3)} m3`, 192, y, { align: "right" })
  y += 7
  drawText(pdf, "Sous-total TTC", 128, y)
  drawText(pdf, currency(subtotal.value), 192, y, { align: "right" })
  y += 7
  drawText(pdf, "Remise", 128, y)
  drawText(pdf, `-${currency(discountAmount.value)}`, 192, y, { align: "right" })
  y += 9
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12)
  drawText(pdf, "Total TTC", 128, y)
  drawText(pdf, currency(totalPrice.value), 192, y, { align: "right" })

  if (form.notes.trim()) {
    y += 16
    pdf.setFontSize(10)
    pdf.setTextColor(37, 99, 235)
    drawText(pdf, "Message", 14, y)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(15, 23, 42)
    pdf.text(pdf.splitTextToSize(form.notes, 180), 14, y + 7)
  }
  pdf.setFontSize(8)
  pdf.setTextColor(100, 116, 139)
  drawText(pdf, `Document généré par ${company.value.name}.`, 14, 286)
  pdf.save(`devis-volume-${fileNamePart(form.clientName)}-${fileNamePart(form.reference)}.pdf`)
  toast("Devis PDF généré", { type: "success", autoClose: 1200 })
}

function prepareEmail() {
  if (!form.clientEmail.trim()) {
    toast("Renseignez l’email du client", { type: "warning", autoClose: 1500 })
    return
  }
  const subject = encodeURIComponent(`Votre devis volume ${form.reference} - ${company.value.name}`)
  const body = encodeURIComponent(
    `Bonjour ${form.clientName || ""},\n\nVoici votre devis pour un volume de ${totalVolume.value.toFixed(3)} m3, pour un total TTC de ${currency(totalPrice.value)}.\n\n${form.notes}\n\nCordialement,\n${company.value.name}`
  )
  window.location.href = `mailto:${encodeURIComponent(form.clientEmail)}?subject=${subject}&body=${body}`
}

async function saveQuote() {
  if (!validateQuote() || saving.value) return
  saving.value = true
  try {
    await addDoc(collection(db, "volumeQuotes"), {
      entrepriseId: authStore.userProfile?.entrepriseId || PARIS_FRET_ENTREPRISE_ID,
      type: "devis-volume",
      status: "brouillon",
      reference: form.reference,
      date: form.date,
      client: {
        name: form.clientName.trim(),
        email: form.clientEmail.trim(),
        phone: form.clientPhone.trim(),
        address: form.clientAddress.trim()
      },
      pricePerM3: Number(form.pricePerM3 || 0),
      vatRate: Number(form.vatRate || 0),
      discountType: form.discountType,
      discount: Number(form.discount || 0),
      notes: form.notes.trim(),
      lines: volumeLines.map(line => ({
        qte: Number(line.qte || 0),
        length: Number(line.length || 0),
        width: Number(line.width || 0),
        height: Number(line.height || 0),
        volume: calcLineVolume(line)
      })),
      totalVolume: totalVolume.value,
      subtotal: subtotal.value,
      discountAmount: discountAmount.value,
      vatAmount: vatAmount.value,
      totalTtc: totalPrice.value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast("Devis enregistré", { type: "success", autoClose: 1500 })
    form.reference = generateReference()
  } catch (error) {
    console.error("Erreur enregistrement devis :", error)
    toast("Impossible d’enregistrer le devis", { type: "error", autoClose: 2200 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-7xl space-y-6">
    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <router-link to="/tools" class="mb-4 inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-primary">
        <ArrowLeft class="h-4 w-4" /> Outils
      </router-link>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm font-black uppercase tracking-wider text-primary">Calculateur</p>
          <h1 class="mt-2 text-3xl font-black text-slate-950">Devis volume</h1>
          <p class="mt-2 text-base text-slate-500">Calcule le volume, ajoute les informations du destinataire puis génère un devis PDF.</p>
        </div>
        <div class="grid min-w-[290px] grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div class="rounded-lg bg-white p-3">
            <p class="text-sm font-bold text-slate-500">Volume</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ totalVolume.toFixed(3) }} m3</p>
          </div>
          <div class="rounded-lg bg-white p-3">
            <p class="text-sm font-bold text-slate-500">Total TTC</p>
            <p class="mt-1 text-2xl font-black text-primary">{{ currency(totalPrice) }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
      <div class="space-y-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-black text-slate-950">Destinataire du devis</h2>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Nom ou société</span><input v-model="form.clientName" class="input input-bordered h-12 w-full rounded-xl border-slate-200" placeholder="Nom complet" /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Email</span><input v-model="form.clientEmail" type="email" class="input input-bordered h-12 w-full rounded-xl border-slate-200" placeholder="client@email.com" /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Téléphone</span><input v-model="form.clientPhone" class="input input-bordered h-12 w-full rounded-xl border-slate-200" placeholder="06..." /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Adresse</span><input v-model="form.clientAddress" class="input input-bordered h-12 w-full rounded-xl border-slate-200" placeholder="Adresse de facturation" /></label>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-black text-slate-950">Paramètres</h2>
          <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Date</span><input v-model="form.date" type="date" class="input input-bordered h-12 w-full rounded-xl border-slate-200" /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Prix par m3 TTC</span><input v-model.number="form.pricePerM3" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200" /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">TVA %</span><input v-model.number="form.vatRate" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200" /></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Type remise</span><select v-model="form.discountType" class="select select-bordered h-12 w-full rounded-xl border-slate-200"><option value="amount">€</option><option value="percent">%</option></select></label>
            <label><span class="mb-2 block text-sm font-bold text-slate-700">Remise</span><input v-model.number="form.discount" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200" /></label>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center justify-between gap-4">
            <h2 class="text-xl font-black text-slate-950">Volumes</h2>
            <button class="btn rounded-xl bg-primary text-white hover:bg-primary/90" type="button" @click="addVolumeLine"><Plus class="h-4 w-4" /> Ajouter une ligne</button>
          </div>
          <div class="mt-5 space-y-4">
            <div v-for="(line, index) in volumeLines" :key="index" class="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[110px_1fr_1fr_1fr_170px_48px]">
              <label><span class="mb-2 block text-xs font-black text-slate-500">QTE</span><input v-model.number="line.qte" type="number" min="1" class="input input-bordered h-12 w-full rounded-xl border-slate-200 bg-white" /></label>
              <label><span class="mb-2 block text-xs font-black text-slate-500">L CM</span><input v-model.number="line.length" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200 bg-white" /></label>
              <label><span class="mb-2 block text-xs font-black text-slate-500">L CM</span><input v-model.number="line.width" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200 bg-white" /></label>
              <label><span class="mb-2 block text-xs font-black text-slate-500">H CM</span><input v-model.number="line.height" type="number" min="0" class="input input-bordered h-12 w-full rounded-xl border-slate-200 bg-white" /></label>
              <div class="rounded-xl bg-white p-3"><p class="text-xs font-black text-slate-500">VOLUME</p><p class="mt-1 text-lg font-black text-slate-950">{{ calcLineVolume(line).toFixed(3) }} m3</p></div>
              <button class="btn btn-square mt-auto rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100" type="button" aria-label="Supprimer la ligne" @click="removeVolumeLine(index)"><Trash2 class="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-black text-slate-950">Message sur le devis</h2>
          <textarea v-model="form.notes" class="textarea textarea-bordered mt-5 min-h-32 w-full rounded-xl border-slate-200" placeholder="Conditions, délai, informations complémentaires..."></textarea>
        </div>
      </div>

      <aside class="space-y-6 xl:sticky xl:top-24">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-black text-slate-950">Résumé</h2>
          <div class="mt-6 grid grid-cols-2 gap-y-4 text-sm">
            <span class="font-bold text-slate-500">Client</span><span class="text-right font-black text-slate-950">{{ form.clientName || '-' }}</span>
            <span class="font-bold text-slate-500">Volume total</span><span class="text-right font-black text-slate-950">{{ totalVolume.toFixed(3) }} m3</span>
            <span class="font-bold text-slate-500">Prix/m3</span><span class="text-right font-black text-slate-950">{{ currency(form.pricePerM3) }}</span>
            <span class="font-bold text-slate-500">Sous-total</span><span class="text-right font-black text-slate-950">{{ currency(subtotal) }}</span>
            <span class="font-bold text-slate-500">Remise</span><span class="text-right font-black text-red-600">-{{ currency(discountAmount) }}</span>
            <span class="text-lg font-black text-slate-950">Total TTC</span><span class="text-right text-lg font-black text-primary">{{ currency(totalPrice) }}</span>
          </div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-black text-slate-950">Après génération</h2>
          <p class="mt-4 leading-7 text-slate-600">Le PDF contient les coordonnées du client. L’enregistrement conserve aussi le devis dans Firebase pour le retrouver ensuite.</p>
        </div>
      </aside>
    </div>

    <div class="flex flex-col justify-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row">
      <button class="btn rounded-xl border-slate-200 bg-white text-slate-800" type="button" @click="createVolumePdf"><Download class="h-4 w-4" /> Générer PDF</button>
      <button class="btn rounded-xl border-blue-200 bg-blue-50 text-blue-700" type="button" @click="prepareEmail"><Mail class="h-4 w-4" /> Préparer email</button>
      <button class="btn rounded-xl bg-primary text-white hover:bg-primary/90" type="button" :disabled="saving" @click="saveQuote"><Save class="h-4 w-4" /> {{ saving ? 'Enregistrement...' : 'Enregistrer le devis' }}</button>
    </div>
  </section>
</template>
