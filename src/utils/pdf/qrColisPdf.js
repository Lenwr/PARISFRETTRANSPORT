import { jsPDF } from "jspdf"

function clean(value) {
  return String(value || "-")
}

function fileNamePart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "document"
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

function drawField(pdf, label, value, x, y, width) {
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(6.2)
  pdf.setTextColor(100, 116, 139)
  pdf.text(label.toUpperCase(), x, y)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.4)
  pdf.setTextColor(15, 23, 42)
  const lines = pdf.splitTextToSize(clean(value), width)
  pdf.text(lines.slice(0, 2), x, y + 5)
}

function drawCard(pdf, label, value, x, y, width, height) {
  pdf.setDrawColor(226, 232, 240)
  pdf.setFillColor(248, 250, 252)
  pdf.roundedRect(x, y, width, height, 3, 3, "FD")
  drawField(pdf, label, value, x + 4, y + 8, width - 8)
}

export async function generateQrColisPdf(colis, { entreprise } = {}) {
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: [80, 120],
    compress: true
  })
  const logoUrl =
    entreprise?.logoUrl ||
    entreprise?.logoURL ||
    entreprise?.logo ||
    entreprise?.imageUrl ||
    "/images/logo.png"
  let logoImage = await imageUrlToBase64(logoUrl)

  if (!logoImage && logoUrl !== "/images/logo.png") {
    logoImage = await imageUrlToBase64("/images/logo.png")
  }

  let first = true

  colis.colis?.forEach((item, colisIndex) => {
    item.details?.forEach((detail, detailIndex) => {
      const el = document.getElementById(`qr-${colisIndex}-${detailIndex}`)
      const canvas = el?.querySelector("canvas")
      if (!canvas) return

      if (!first) pdf.addPage()
      first = false

      const image = canvas.toDataURL("image/png")

      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, 80, 120, "F")

      pdf.setFillColor(15, 23, 42)
      pdf.rect(0, 0, 80, 18, "F")

      if (logoImage) {
        pdf.setFillColor(255, 255, 255)
        pdf.roundedRect(7, 4, 10, 10, 2, 2, "F")
        pdf.addImage(logoImage, imageFormat(logoImage), 8.5, 5.5, 7, 7)
      }

      pdf.setTextColor(255, 255, 255)
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(8.5)
      pdf.text(clean(entreprise?.nom || "WefretAfrica"), logoImage ? 21 : 7, 9)
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(6)
      pdf.text("ETIQUETTE QR COLIS", logoImage ? 21 : 7, 14)

      drawCard(pdf, "Destinataire", colis.destinataire, 7, 24, 66, 18)
      drawCard(pdf, "Téléphone", colis.telephoneDestinataire, 7, 46, 31, 17)
      drawCard(pdf, "Destination", colis.destination, 42, 46, 31, 17)

      pdf.setDrawColor(226, 232, 240)
      pdf.setFillColor(255, 255, 255)
      pdf.roundedRect(20, 68, 40, 40, 4, 4, "FD")
      pdf.addImage(image, "PNG", 25, 73, 30, 30)

      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(6.5)
      pdf.setTextColor(100, 116, 139)
      pdf.text(`Ref: ${clean(colis.numero || colis.id)}`, 40, 106, { align: "center" })

      pdf.setFontSize(7)
      pdf.setTextColor(15, 23, 42)
      const colisLabel = pdf.splitTextToSize(`Colis: ${clean(detail.coli)}`, 68)
      pdf.text(colisLabel.slice(0, 1), 40, 113, { align: "center" })
    })
  })

  pdf.save(`qr-${fileNamePart(colis.expediteur)}.pdf`)
}
