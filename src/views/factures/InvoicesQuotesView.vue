<script setup>
import { computed, reactive } from "vue"
import jsPDF from "jspdf"
import { Download, FileText, Plus, Receipt, Trash2 } from "lucide-vue-next"
import { toast } from "vue3-toastify"
import { useAuthStore } from "../../stores/useAuthStore"

const authStore = useAuthStore()

const documentForm = reactive({
  type: "facture",
  number: generateDocumentNumber("facture"),
  date: new Date().toISOString().slice(0, 10),
  dueDate: "",
  clientName: "",
  clientAddress: "",
  clientEmail: "",
  clientPhone: "",
  paymentStatus: "À payer",
  paymentMethod: "Virement",
  notes: "Merci pour votre confiance.",
  discountType: "amount",
  discount: 0,
  vatRate: 20,
  lines: [
    {
      designation: "Transport / prestation logistique",
      quantity: 1,
      unit: "service",
      unitPrice: 0
    }
  ]
})

const company = computed(() => {
  const data = authStore.entreprise || {}
  const address = data.address || {}

  return {
    name: data.nom || data.companyName || "Votre entreprise",
    legalName: data.companyLegalName || data.raisonSociale || "",
    email: data.email || "",
    phone: data.tel || "",
    registration: data.companyRegistrationNumber || data.siret || "",
    logoUrl: data.logoUrl || data.logoURL || data.logo || data.imageUrl || "/images/logo.png",
    address: [
      address.number || data.numeroRue,
      address.street || data.rue,
      address.postalCode || data.codePostal,
      address.city || data.ville,
      address.country || data.pays
    ].filter(Boolean).join(" ")
  }
})

function generateDocumentNumber(type) {
  const prefix = type === "devis" ? "DEV" : "FAC"
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = String(Math.floor(Math.random() * 9999)).padStart(4, "0")
  return `${prefix}-${date}-${suffix}`
}

function switchDocumentType(type) {
  documentForm.type = type
  documentForm.number = generateDocumentNumber(type)
}

function addDocumentLine() {
  documentForm.lines.push({
    designation: "",
    quantity: 1,
    unit: "service",
    unitPrice: 0
  })
}

function removeDocumentLine(index) {
  if (documentForm.lines.length === 1) return
  documentForm.lines.splice(index, 1)
}

function lineTotal(line) {
  return Number(line.quantity || 0) * Number(line.unitPrice || 0)
}

const subtotal = computed(() =>
  documentForm.lines.reduce((sum, line) => sum + lineTotal(line), 0)
)

const discountAmount = computed(() =>
  documentForm.discountType === "percent"
    ? Math.min(subtotal.value, subtotal.value * (Math.max(0, Number(documentForm.discount || 0)) / 100))
    : Math.min(subtotal.value, Math.max(0, Number(documentForm.discount || 0)))
)

const taxableAmount = computed(() =>
  Math.max(0, subtotal.value - discountAmount.value)
)

const vatAmount = computed(() =>
  taxableAmount.value * (Number(documentForm.vatRate || 0) / 100)
)

const totalTtc = computed(() =>
  taxableAmount.value + vatAmount.value
)

function currency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0))
}

// Le PDF utilise une police standard : on évite les espaces insécables
// d'Intl qui peuvent être affichées comme des caractères séparés.
function pdfCurrency(value) {
  const number = Number(value || 0)
  const [integer, decimals] = number.toFixed(2).split(".")
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${grouped},${decimals} EUR`
}

function drawText(doc, text, x, y, options = {}) {
  doc.text(String(text || "-"), x, y, options)
}

async function imageUrlToBase64(url) {
  if (!url) return null

  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        canvas.getContext("2d").drawImage(img, 0, 0)
        resolve(canvas.toDataURL("image/png"))
      } catch (error) {
        console.error("Erreur conversion logo :", error)
        resolve(null)
      }
    }

    img.onerror = () => resolve(null)
    img.src = url
  })
}

function drawSectionTitle(doc, title, x, y) {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(37, 99, 235)
  doc.text(title, x, y)
}

async function generateDocumentPdf() {
  if (!documentForm.clientName.trim()) {
    toast("Nom du client requis", { type: "warning", autoClose: 1500 })
    return
  }

  const doc = new jsPDF()
  const title = documentForm.type === "devis" ? "DEVIS" : "FACTURE"
  const fileName = `${documentForm.number}.pdf`
  const logoImage = await imageUrlToBase64(company.value.logoUrl)
  let y = 18

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 42, "F")

  if (logoImage) {
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(14, 9, 24, 24, 4, 4, "F")
    doc.addImage(logoImage, "PNG", 17, 12, 18, 18)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  drawText(doc, company.value.name, logoImage ? 45 : 14, 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  drawText(doc, company.value.email, logoImage ? 45 : 14, 26)
  drawText(doc, company.value.phone, logoImage ? 45 : 14, 32)

  doc.setFillColor(37, 99, 235)
  doc.roundedRect(142, 10, 46, 16, 4, 4, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  drawText(doc, title, 165, 20, { align: "center" })
  doc.setFontSize(8)
  drawText(doc, documentForm.number, 165, 31, { align: "center" })

  doc.setTextColor(15, 23, 42)
  y = 56
  drawSectionTitle(doc, "Émetteur", 14, y)
  drawSectionTitle(doc, "Client", 116, y)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  y += 8
  drawText(doc, company.value.name, 14, y)
  drawText(doc, documentForm.clientName, 116, y)
  y += 6
  drawText(doc, company.value.legalName || company.value.address, 14, y)
  drawText(doc, documentForm.clientAddress, 116, y)
  y += 6
  drawText(doc, company.value.email, 14, y)
  drawText(doc, documentForm.clientEmail, 116, y)
  y += 6
  drawText(doc, company.value.phone, 14, y)
  drawText(doc, documentForm.clientPhone, 116, y)

  y += 16
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, y - 7, 182, 17, 4, 4, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  drawText(doc, `Date: ${documentForm.date || "-"}`, 18, y)
  drawText(doc, `Échéance: ${documentForm.dueDate || "-"}`, 78, y)
  drawText(doc, `Statut: ${documentForm.paymentStatus}`, 142, y)

  y += 22
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(14, y, 182, 10, 2, 2, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  drawText(doc, "Désignation", 18, y + 7)
  drawText(doc, "Qté", 116, y + 7, { align: "right" })
  drawText(doc, "Unité", 126, y + 7)
  drawText(doc, "PU HT", 166, y + 7, { align: "right" })
  drawText(doc, "Total HT", 192, y + 7, { align: "right" })

  y += 14
  doc.setTextColor(15, 23, 42)
  doc.setFont("helvetica", "normal")

  documentForm.lines.forEach((line, index) => {
    if (y > 250) {
      doc.addPage()
      y = 20
    }

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(14, y - 5, 182, 10, "F")
    }

    const designation = String(line.designation || "-").slice(0, 52)
    drawText(doc, designation, 18, y + 2)
    drawText(doc, line.quantity || 0, 116, y + 2, { align: "right" })
    drawText(doc, line.unit || "-", 126, y + 2)
    doc.setFontSize(8)
    drawText(doc, pdfCurrency(line.unitPrice), 166, y + 2, { align: "right" })
    drawText(doc, pdfCurrency(lineTotal(line)), 192, y + 2, { align: "right" })
    doc.setFontSize(9)
    y += 10
  })

  y += 8
  const totalsX = 132
  doc.setFont("helvetica", "normal")
  drawText(doc, "Total HT", totalsX, y)
  drawText(doc, pdfCurrency(subtotal.value), 192, y, { align: "right" })
  y += 7
  drawText(doc, documentForm.discountType === "percent" ? `Remise (${documentForm.discount || 0}%)` : "Remise", totalsX, y)
  drawText(doc, pdfCurrency(discountAmount.value), 192, y, { align: "right" })
  y += 7
  drawText(doc, `TVA (${documentForm.vatRate || 0}%)`, totalsX, y)
  drawText(doc, pdfCurrency(vatAmount.value), 192, y, { align: "right" })
  y += 9
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  drawText(doc, "Total TTC", totalsX, y)
  drawText(doc, pdfCurrency(totalTtc.value), 192, y, { align: "right" })

  y += 18
  drawSectionTitle(doc, "Conditions et notes", 14, y)
  y += 7
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  const notes = doc.splitTextToSize(
    `${documentForm.notes || ""}\nMode de paiement: ${documentForm.paymentMethod}`,
    180
  )
  doc.text(notes, 14, y)

  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  drawText(doc, `Document généré par ${company.value.name}.`, 14, 286)

  doc.save(fileName)
  toast(`${title.toLowerCase()} généré`, { type: "success", autoClose: 1200 })
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p class="text-sm font-bold text-primary">Factures</p>
      <div class="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-2xl font-black text-slate-950 sm:text-3xl">
            Factures et devis
          </h1>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Préparez vos documents commerciaux et exportez-les en PDF avec le logo de votre entreprise.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-black transition"
            :class="documentForm.type === 'facture' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'"
            @click="switchDocumentType('facture')"
          >
            <Receipt class="h-4 w-4" />
            Facture
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-black transition"
            :class="documentForm.type === 'devis' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'"
            @click="switchDocumentType('devis')"
          >
            <FileText class="h-4 w-4" />
            Devis
          </button>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="grid gap-4 md:grid-cols-3">
        <label>
          <span class="mb-2 block text-sm font-bold text-slate-700">N° document</span>
          <input v-model="documentForm.number" class="input input-bordered h-11 w-full rounded-lg border-slate-200 bg-slate-50" />
        </label>
        <label>
          <span class="mb-2 block text-sm font-bold text-slate-700">Date</span>
          <input v-model="documentForm.date" type="date" class="input input-bordered h-11 w-full rounded-lg border-slate-200 bg-slate-50" />
        </label>
        <label>
          <span class="mb-2 block text-sm font-bold text-slate-700">Échéance</span>
          <input v-model="documentForm.dueDate" type="date" class="input input-bordered h-11 w-full rounded-lg border-slate-200 bg-slate-50" />
        </label>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-black text-slate-950">Client</h2>
        <div class="mt-4 grid gap-3">
          <input v-model="documentForm.clientName" class="input input-bordered h-11 rounded-lg border-slate-200 bg-slate-50" placeholder="Nom du client" />
          <textarea v-model="documentForm.clientAddress" class="textarea textarea-bordered rounded-lg border-slate-200 bg-slate-50" rows="3" placeholder="Adresse client"></textarea>
          <input v-model="documentForm.clientEmail" class="input input-bordered h-11 rounded-lg border-slate-200 bg-slate-50" placeholder="Email client" />
          <input v-model="documentForm.clientPhone" class="input input-bordered h-11 rounded-lg border-slate-200 bg-slate-50" placeholder="Téléphone client" />
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-black text-slate-950">Paiement</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <select v-model="documentForm.paymentStatus" class="select select-bordered h-11 rounded-lg border-slate-200 bg-slate-50">
            <option>À payer</option>
            <option>Payé</option>
            <option>Partiel</option>
          </select>
          <select v-model="documentForm.paymentMethod" class="select select-bordered h-11 rounded-lg border-slate-200 bg-slate-50">
            <option>Virement</option>
            <option>Espèces</option>
            <option>Carte bancaire</option>
            <option>Mobile money</option>
            <option>Chèque</option>
          </select>
          <select v-model="documentForm.discountType" class="select select-bordered h-11 rounded-lg border-slate-200 bg-slate-50">
            <option value="amount">Remise en €</option>
            <option value="percent">Remise en %</option>
          </select>
          <input v-model.number="documentForm.discount" type="number" min="0" class="input input-bordered h-11 rounded-lg border-slate-200 bg-slate-50" placeholder="Remise" />
          <input v-model.number="documentForm.vatRate" type="number" min="0" class="input input-bordered h-11 rounded-lg border-slate-200 bg-slate-50" placeholder="TVA %" />
          <textarea v-model="documentForm.notes" class="textarea textarea-bordered rounded-lg border-slate-200 bg-slate-50 sm:col-span-2" rows="3" placeholder="Notes"></textarea>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 class="text-lg font-black text-slate-950">Lignes</h2>
        <button class="btn btn-sm rounded-lg bg-slate-950 text-white hover:bg-slate-800" type="button" @click="addDocumentLine">
          <Plus class="h-4 w-4" />
          Ligne
        </button>
      </div>

      <div class="space-y-3 p-4">
        <div
          v-for="(line, index) in documentForm.lines"
          :key="index"
          class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1.5fr_90px_120px_130px_130px_auto]"
        >
          <input v-model="line.designation" class="input input-bordered h-10 rounded-lg border-slate-200 bg-white" placeholder="Désignation" />
          <input v-model.number="line.quantity" type="number" min="0" class="input input-bordered h-10 rounded-lg border-slate-200 bg-white" placeholder="Qté" />
          <input v-model="line.unit" class="input input-bordered h-10 rounded-lg border-slate-200 bg-white" placeholder="Unité" />
          <input v-model.number="line.unitPrice" type="number" min="0" class="input input-bordered h-10 rounded-lg border-slate-200 bg-white" placeholder="PU HT" />
          <p class="rounded-lg bg-white px-3 py-2 text-sm font-black text-slate-950">
            {{ currency(lineTotal(line)) }}
          </p>
          <button class="btn btn-square btn-sm rounded-lg bg-red-50 text-red-700 hover:bg-red-100" type="button" @click="removeDocumentLine(index)">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <p class="font-bold text-slate-500">Total HT</p>
        <p class="text-right font-black text-slate-950">{{ currency(subtotal) }}</p>
        <p class="font-bold text-slate-500">{{ documentForm.discountType === "percent" ? `Remise (${documentForm.discount || 0}%)` : "Remise" }}</p>
        <p class="text-right font-black text-slate-950">{{ currency(discountAmount) }}</p>
        <p class="font-bold text-slate-500">TVA</p>
        <p class="text-right font-black text-slate-950">{{ currency(vatAmount) }}</p>
        <p class="text-lg font-black text-slate-950">Total TTC</p>
        <p class="text-right text-lg font-black text-primary">{{ currency(totalTtc) }}</p>
      </div>

      <button class="btn rounded-lg bg-primary text-white hover:bg-primary/90" type="button" @click="generateDocumentPdf">
        <Download class="h-4 w-4" />
        Exporter PDF
      </button>
    </div>
  </section>
</template>
