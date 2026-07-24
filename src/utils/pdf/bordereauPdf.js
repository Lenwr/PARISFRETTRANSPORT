import { jsPDF } from "jspdf"
import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"
import { formatMoney } from "../money"

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 14
const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const BORDER = [226, 232, 240]
const SOFT = [248, 250, 252]
const PRIMARY = [37, 99, 235]

function clean(value) {
  return String(value || "-")
}

function formatDateTime(value) {
  if (!value) return "-"

  return format(new Date(value), "d MMMM yyyy à HH'h'mm", {
    locale: frLocale
  })
}

function money(value) {
  return formatMoney(value)
}

function fileNamePart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "document"
}

function companyAddress(entreprise) {
  const address = entreprise?.address || {}

  if (entreprise?.adresse) {
    return String(entreprise.adresse).trim()
  }

  return [
    address.number || entreprise?.numeroRue,
    address.street || entreprise?.rue,
    address.postalCode || entreprise?.codePostal,
    address.city || entreprise?.ville,
    address.country || entreprise?.pays
  ].filter(Boolean).join(" ")
}

async function imageUrlToBase64(url) {
  if (!url) return null

  try {
    const sourceUrl = new URL(url, window.location.origin)
    sourceUrl.searchParams.set("_pdf", Date.now().toString())
    const response = await fetch(sourceUrl.href, { cache: "no-store" })
    const blob = await response.blob()

    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error("Erreur chargement logo :", error)
  }

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

function imageFormat(dataUrl) {
  return String(dataUrl || "").startsWith("data:image/jpeg") ? "JPEG" : "PNG"
}

function setColor(pdf, color, mode = "text") {
  if (mode === "fill") pdf.setFillColor(...color)
  if (mode === "draw") pdf.setDrawColor(...color)
  if (mode === "text") pdf.setTextColor(...color)
}

function text(pdf, value, x, y, options = {}) {
  pdf.text(clean(value), x, y, options)
}

function sectionTitle(pdf, title, x, y) {
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(8)
  setColor(pdf, PRIMARY)
  pdf.text(title.toUpperCase(), x, y)
}

function valueLine(pdf, label, value, x, y, width = 72) {
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  setColor(pdf, MUTED)
  pdf.text(label.toUpperCase(), x, y)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  setColor(pdf, INK)
  const lines = pdf.splitTextToSize(clean(value), width)
  pdf.text(lines.slice(0, 2), x, y + 5)
}

function summaryCard(pdf, label, value, x, y, width) {
  setColor(pdf, BORDER, "draw")
  setColor(pdf, SOFT, "fill")
  pdf.roundedRect(x, y, width, 22, 3, 3, "FD")
  valueLine(pdf, label, value, x + 5, y + 8, width - 10)
}

function partyBox(pdf, title, name, phone, x, y) {
  setColor(pdf, BORDER, "draw")
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(x, y, 88, 34, 3, 3, "FD")
  sectionTitle(pdf, title, x + 5, y + 9)
  valueLine(pdf, "Nom", name, x + 5, y + 18, 78)
  valueLine(pdf, "Téléphone", phone, x + 49, y + 18, 34)
}

function drawHeader(pdf, { entreprise, logoImage }) {
  const name = entreprise?.nom || entreprise?.companyName || "WefretAfrica"
  const address = companyAddress(entreprise)

  setColor(pdf, BORDER, "draw")
  pdf.line(MARGIN, 38, PAGE_WIDTH - MARGIN, 38)

  if (logoImage) {
    setColor(pdf, BORDER, "draw")
    pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(MARGIN, 12, 23, 23, 4, 4, "FD")
    pdf.addImage(logoImage, imageFormat(logoImage), MARGIN + 3, 15, 17, 17)
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(15)
  setColor(pdf, INK)
  text(pdf, name, logoImage ? 42 : MARGIN, 20)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  setColor(pdf, MUTED)
  text(pdf, address || "Transport et logistique", logoImage ? 42 : MARGIN, 27)
  const contacts = []
  if (entreprise?.tel) contacts.push(`Tel: ${entreprise.tel}`)
  if (entreprise?.email) contacts.push(`Email: ${entreprise.email}`)
  if (contacts.length) text(pdf, contacts.join(" | "), logoImage ? 42 : MARGIN, 33)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(16)
  setColor(pdf, INK)
  pdf.text("BORDEREAU", PAGE_WIDTH - MARGIN, 18, { align: "right" })

  pdf.setFontSize(9)
  setColor(pdf, PRIMARY)
  pdf.text("EXPÉDITION", PAGE_WIDTH - MARGIN, 27, { align: "right" })
}

function drawTableHeader(pdf, y, isAir) {
  setColor(pdf, INK, "fill")
  pdf.roundedRect(MARGIN, y, 182, 9, 2, 2, "F")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(8)
  pdf.setTextColor(255, 255, 255)
  pdf.text("#", 19, y + 6)
  pdf.text("Désignation", 30, y + 6)
  pdf.text("Quantité", 133, y + 6)

  if (isAir) {
    pdf.text("Poids", 166, y + 6)
  }
}

function drawFooter(pdf) {
  setColor(pdf, BORDER, "draw")
  pdf.line(MARGIN, 283, PAGE_WIDTH - MARGIN, 283)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7)
  setColor(pdf, MUTED)
  pdf.text("Document généré automatiquement par WefretAfrica", MARGIN, 289)
  pdf.text("Merci de conserver ce bordereau jusqu'à la livraison.", PAGE_WIDTH - MARGIN, 289, { align: "right" })
}

function drawPaymentBox(pdf, colis, x, y) {
  setColor(pdf, BORDER, "draw")
  setColor(pdf, SOFT, "fill")
  pdf.roundedRect(x, y, 94, 22, 3, 3, "FD")

  valueLine(pdf, "Paiement", colis.statut, x + 5, y + 9, 24)
  valueLine(pdf, "Prix", money(colis.prix), x + 40, y + 9, 22)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(6.4)
  setColor(pdf, MUTED)
  pdf.text(["RESTE", "À PAYER"], x + 67, y + 7)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  setColor(pdf, INK)
  pdf.text(money(colis.resteAPayer), x + 67, y + 18)
}

export async function generateBordereauPdf({ colis, entreprise }) {
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
    compress: true
  })
  const qrCanvas = document.querySelector("#mainQr canvas")
  const qrImage = qrCanvas?.toDataURL("image/png")
  const isAir = colis.typeDeFret === "Aérien"

  // Le bordereau reste volontairement sans logo.
  drawHeader(pdf, { entreprise, logoImage: null })

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(20)
  setColor(pdf, INK)
  pdf.text("Bordereau d'expédition", MARGIN, 54)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  setColor(pdf, MUTED)
  text(pdf, `Émis le ${formatDateTime(colis.date)}`, MARGIN, 63)

  if (qrImage) {
    setColor(pdf, BORDER, "draw")
    pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(160, 46, 36, 36, 3, 3, "FD")
    pdf.addImage(qrImage, "PNG", 164, 50, 28, 28)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(6.5)
    setColor(pdf, MUTED)
    pdf.text("SCAN SUIVI", 178, 86, { align: "center" })
  }

  summaryCard(pdf, "Destination", colis.destination, MARGIN, 87, 58)
  summaryCard(pdf, "Type de fret", colis.typeDeFret, 76, 87, 42)
  summaryCard(pdf, "Nb colis", colis.nombreDeColis, 122, 87, 32)
  summaryCard(pdf, "Statut", colis.statut, 158, 87, 38)

  partyBox(pdf, "Expéditeur", colis.expediteur, colis.telephoneExpediteur, MARGIN, 117)
  partyBox(pdf, "Destinataire", colis.destinataire, colis.telephoneDestinataire, 108, 117)

  setColor(pdf, BORDER, "draw")
  setColor(pdf, SOFT, "fill")
  pdf.roundedRect(MARGIN, 158, 182, 24, 3, 3, "FD")

  if (isAir) {
    valueLine(pdf, "Agent", colis.personneEnCharge, 19, 168, 55)
    valueLine(pdf, "Téléphone agent", colis.telephoneAgent, 78, 168, 42)
    valueLine(pdf, "Poids total", `${clean(colis.poidsTotal)} kg`, 125, 168, 30)
    valueLine(pdf, "Observations", colis.observation || colis.notes, 158, 168, 30)
  } else {
    valueLine(pdf, "Observations", colis.observation || colis.notes, 19, 168, 168)
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12)
  setColor(pdf, INK)
  pdf.text("Détails des colis", MARGIN, 198)

  let y = 204
  drawTableHeader(pdf, y, isAir)
  y += 9

  colis.colis?.forEach((item, index) => {
    if (y > 238) {
      drawFooter(pdf)
      pdf.addPage()
      drawHeader(pdf, { entreprise, logoImage: null })
      y = 52
      drawTableHeader(pdf, y, isAir)
      y += 9
    }

    const rowHeight = 9
    pdf.setFillColor(index % 2 === 0 ? 248 : 255, 250, 252)
    pdf.rect(MARGIN, y, 182, rowHeight, "F")
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8)
    setColor(pdf, INK)
    pdf.text(String(index + 1), 19, y + 6)
    pdf.text(clean(item.nom).slice(0, 58), 30, y + 6)
    pdf.text(String(item.quantite || 1), 136, y + 6)

    if (isAir) {
      pdf.text(`${clean(item.poidsTotal || 0)} kg`, 166, y + 6)
    }

    y += rowHeight
  })

  y = Math.max(y + 10, 246)
  drawPaymentBox(pdf, colis, MARGIN, y)

  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(112, y, 84, 22, 3, 3, "FD")
  sectionTitle(pdf, "Signatures", 117, y + 9)
  setColor(pdf, BORDER, "draw")
  pdf.line(117, y + 17, 139, y + 17)
  pdf.line(146, y + 17, 190, y + 17)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.5)
  setColor(pdf, MUTED)
  pdf.text(isAir ? "Agent" : "Transporteur", 117, y + 20)
  pdf.text("Client / destinataire", 146, y + 20)

  drawFooter(pdf)
  pdf.save(`bordereau-${fileNamePart(colis.expediteur)}.pdf`)
}
