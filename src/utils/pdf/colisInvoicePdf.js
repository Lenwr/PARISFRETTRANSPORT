import { resolveCompanyLogo } from "../../branding"
import { jsPDF } from "jspdf"
import { formatMoney, parseMoney } from "../money"

const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const BORDER = [30, 41, 59]
const PALE = [254, 252, 220]

function clean(value) {
  return String(value ?? "").trim() || "-"
}

function fileNamePart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "facture"
}

function pdfMoney(value) {
  return formatMoney(value)
    .replace(/\u00a0|\u202f/g, " ")
    .replace("€", "EUR")
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  return new Intl.DateTimeFormat("fr-FR").format(safeDate)
}

function companyAddress(entreprise = {}) {
  const address = entreprise.address || {}
  return [
    address.number || entreprise.numeroRue,
    address.street || entreprise.rue || entreprise.adresse,
    address.postalCode || entreprise.codePostal,
    address.city || entreprise.ville,
    address.country || entreprise.pays
  ].filter(Boolean).join(" ")
}

function watermarkText(entreprise = {}) {
  const name = clean(entreprise.nom || entreprise.companyName || "PFT")
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join("")
    .slice(0, 5)
    .toUpperCase()
  return initials === "-" ? "PFT" : initials
}

async function imageUrlToBase64(url) {
  if (!url) return null

  try {
    const sourceUrl = new URL(url, window.location.origin)
    sourceUrl.searchParams.set("_invoice", Date.now().toString())
    const response = await fetch(sourceUrl.href, { cache: "no-store" })
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

function imageFormat(dataUrl) {
  return String(dataUrl || "").startsWith("data:image/jpeg") ? "JPEG" : "PNG"
}

function drawWatermarks(pdf, value) {
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(34)
  pdf.setTextColor(222, 238, 235)

  for (const y of [128, 175, 222]) {
    pdf.text(value, 105, y, { align: "center", angle: 42 })
  }

}

function drawWrapped(pdf, value, x, y, width, maxLines = 2) {
  const lines = pdf.splitTextToSize(clean(value), width)
  pdf.text(lines.slice(0, maxLines), x, y)
}

function invoiceLines(colis) {
  const items = (colis.colis || []).map(item => {
    const quantity = Math.max(1, Number(item.quantite || 1))
    const unitPrice = parseMoney(item.prixUnitaire)
    const amount = parseMoney(item.totalLigne) || unitPrice * quantity

    return {
      name: item.nom || "Colis",
      description: item.description || item.typeTarif || colis.typeDeFret || "Transport",
      quantity,
      unitPrice,
      amount
    }
  })

  const pricedTotal = items.reduce((sum, item) => sum + item.amount, 0)
  const invoiceTotal = parseMoney(colis.prix)

  if (!items.length) {
    return [{
      name: "Transport de colis",
      description: `${clean(colis.typeDeFret)} vers ${clean(colis.destination)}`,
      quantity: 1,
      unitPrice: invoiceTotal,
      amount: invoiceTotal
    }]
  }

  // Quand le prix a été saisi globalement (tarification libre), on conserve
  // chaque ligne et sa quantité au lieu de les remplacer par une ligne x1.
  if (!pricedTotal && invoiceTotal) {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0) || 1
    const sharedUnitPrice = invoiceTotal / totalQuantity

    return items.map((item, index) => {
      const amount = index === items.length - 1
        ? invoiceTotal - sharedUnitPrice * items.slice(0, -1).reduce((sum, entry) => sum + entry.quantity, 0)
        : sharedUnitPrice * item.quantity

      return {
        ...item,
        unitPrice: sharedUnitPrice,
        amount
      }
    })
  }

  return items
}

export async function generateColisInvoicePdf({ colis, entreprise }) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true })
  const logoUrl = resolveCompanyLogo(entreprise)
  const logo = await imageUrlToBase64(logoUrl)
  const qrCanvas = document.querySelector("#mainQr canvas")
  const qrImage = qrCanvas?.toDataURL("image/png")
  const total = parseMoney(colis.prix)
  const outstanding = Math.max(0, parseMoney(colis.resteAPayer))
  const paid = Math.max(0, total - outstanding)
  const reference = `FAC-${clean(colis.numero || colis.id)}`
  const lines = invoiceLines(colis)

  pdf.setFillColor(255, 255, 255)
  pdf.rect(0, 0, 210, 297, "F")

  if (logo) {
    pdf.addImage(logo, imageFormat(logo), 15, 14, 18, 18)
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12)
  pdf.setTextColor(...INK)
  drawWrapped(pdf, entreprise?.nom || entreprise?.companyName || "Paris Fret Transport", 15, 38, 72)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  drawWrapped(pdf, companyAddress(entreprise), 15, 46, 76, 3)
  pdf.text(`Tél. : ${clean(entreprise?.tel)}`, 15, 58)
  pdf.text(clean(entreprise?.email), 15, 63)

  if (qrImage) {
    pdf.addImage(qrImage, "PNG", 15, 70, 27, 27)
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(18)
  pdf.setTextColor(...INK)
  pdf.text("FACTURE", 195, 20, { align: "right" })
  pdf.setFontSize(8)
  pdf.setFont("helvetica", "normal")
  pdf.text(reference, 195, 27, { align: "right" })
  pdf.text(`Éditée le ${formatDate(new Date())}`, 132, 39)

  pdf.setFont("helvetica", "bold")
  pdf.text("Facture adressée à", 132, 54)
  pdf.setFont("helvetica", "normal")
  drawWrapped(pdf, colis.expediteur, 132, 61, 63)
  pdf.text(clean(colis.telephoneExpediteur), 132, 68)
  if (colis.adresseEnlevement) drawWrapped(pdf, colis.adresseEnlevement, 132, 74, 63)

  pdf.setFont("helvetica", "bold")
  pdf.text("Destinée à", 132, 86)
  pdf.setFont("helvetica", "normal")
  drawWrapped(pdf, colis.destinataire, 132, 93, 63)
  pdf.text(clean(colis.telephoneDestinataire), 132, 100)
  pdf.text(clean(colis.destination), 132, 107)

  const tableX = 12
  const tableY = 116
  const tableW = 186
  const columns = [37, 73, 17, 18, 41]
  const headers = ["Colis", "Description", "Prix unit.", "Quantité", "Montant"]

  pdf.setDrawColor(...BORDER)
  pdf.setFillColor(...PALE)
  pdf.rect(tableX, tableY, tableW, 10, "FD")

  let x = tableX
  headers.forEach((header, index) => {
    if (index) pdf.line(x, tableY, x, tableY + 10)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(7.2)
    pdf.setTextColor(...INK)
    pdf.text(header, x + columns[index] / 2, tableY + 6.5, { align: "center" })
    x += columns[index]
  })

  let rowY = tableY + 16
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.5)
  lines.slice(0, 10).forEach(line => {
    drawWrapped(pdf, line.name, tableX + 3, rowY, columns[0] - 6, 1)
    drawWrapped(pdf, line.description, tableX + columns[0] + 3, rowY, columns[1] - 6, 1)
    pdf.text(line.unitPrice ? pdfMoney(line.unitPrice) : "-", 136, rowY, { align: "right" })
    pdf.text(String(line.quantity), 149, rowY, { align: "center" })
    pdf.text(line.amount ? pdfMoney(line.amount) : "-", 194, rowY, { align: "right" })
    rowY += 8
  })

  pdf.rect(tableX, tableY, tableW, 134)
  drawWatermarks(pdf, watermarkText(entreprise))

  const totalsX = 132
  const totalsY = 218
  const totalsW = 60
  const totalRows = [
    ["TOTAL", total],
    ["AVANCE", paid],
    ["NET À RÉGLER", outstanding]
  ]

  totalRows.forEach(([label, value], index) => {
    const y = totalsY + index * 10
    if (index === 2) pdf.setFillColor(...PALE)
    else pdf.setFillColor(255, 255, 255)
    pdf.rect(totalsX, y, totalsW, 10, "FD")
    pdf.line(totalsX + 33, y, totalsX + 33, y + 10)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(7.5)
    pdf.setTextColor(...INK)
    pdf.text(label, totalsX + 3, y + 6.5)
    pdf.text(pdfMoney(value), totalsX + totalsW - 3, y + 6.5, { align: "right" })
  })

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.setTextColor(...INK)
  pdf.text("Marchandise destinée à l’exportation — document commercial", 105, 263, { align: "center" })
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.5)
  pdf.text(`${clean(entreprise?.nom)} · ${clean(entreprise?.email)} · ${clean(entreprise?.tel)}`, 105, 269, { align: "center" })
  pdf.text(`Référence sécurisée : ${reference}`, 105, 275, { align: "center" })
  pdf.setTextColor(...MUTED)
  pdf.text("Toute modification rend ce document non conforme aux données du colis.", 105, 282, { align: "center" })

  pdf.save(`facture-${fileNamePart(colis.numero || colis.id)}.pdf`)
}
