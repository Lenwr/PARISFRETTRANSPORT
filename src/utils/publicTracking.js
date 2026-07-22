import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore"

export function trackingSlug(value, fallback = "entreprise") {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || fallback
}

export function publicTrackingDocId(entrepriseSlug, numero) {
  const slug = trackingSlug(entrepriseSlug)
  const code = String(numero || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `${slug}_${code}`
}

export function publicTrackingUrl(entrepriseSlug, numero) {
  const baseUrl = import.meta.env.VITE_TRACKING_BASE_URL || "https://wefretafrica.vercel.app"
  const cleanBaseUrl = String(baseUrl).replace(/\/+$/, "")

  return `${cleanBaseUrl}/suivi/${trackingSlug(entrepriseSlug)}?code=${encodeURIComponent(numero || "")}`
}

function publicColis(colis = []) {
  return colis.map(item => ({
    nom: item.nom || "",
    quantite: Number(item.quantite || 1),
    poids: Number(item.poids || 0),
    poidsTotal: Number(item.poidsTotal || 0),
    statutColis: item.statutColis || "",
    details: (item.details || []).map(detail => ({
      packageId: detail.packageId || "",
      coli: detail.coli || "",
      statutColis: detail.statutColis || "En attente",
      poids: Number(detail.poids || 0),
      historique: detail.historique || []
    }))
  }))
}

export function buildPublicTracking(enlevement, entreprise = {}, sourceId = "") {
  const entrepriseId = enlevement.entrepriseId || entreprise.id || ""
  const entrepriseSlug = trackingSlug(
    entreprise.trackingSlug || entreprise.slug || entreprise.nom || entreprise.companyName,
    entrepriseId || "entreprise"
  )

  return {
    sourceId,
    entrepriseId,
    entrepriseSlug,
    entrepriseNom: entreprise.nom || entreprise.companyName || "",
    numero: enlevement.numero || "",
    deliveryStatus: enlevement.deliveryStatus || "En attente",
    destination: enlevement.destination || "",
    typeDeFret: enlevement.typeDeFret || "",
    nombreDeColis: Number(enlevement.nombreDeColis || 0),
    poidsTotal: Number(enlevement.poidsTotal || 0),
    expediteur: enlevement.expediteur || "",
    destinataire: enlevement.destinataire || "",
    telephoneDestinataire: enlevement.telephoneDestinataire || "",
    date: enlevement.date || "",
    lastUpdate: new Date().toISOString(),
    colis: publicColis(enlevement.colis || [])
  }
}

export async function syncPublicTracking(db, enlevement, entreprise = {}, sourceId = "") {
  if (!enlevement?.numero) return null

  const publicData = buildPublicTracking(enlevement, entreprise, sourceId)
  const ref = doc(
    db,
    "publicTrackings",
    publicTrackingDocId(publicData.entrepriseSlug, publicData.numero)
  )

  await setDoc(ref, {
    ...publicData,
    updatedAt: serverTimestamp()
  })

  return publicData
}

export async function deletePublicTracking(db, enlevement, entreprise = {}) {
  if (!enlevement?.numero) return

  const entrepriseSlug = trackingSlug(
    entreprise.trackingSlug || entreprise.slug || entreprise.nom || entreprise.companyName,
    enlevement.entrepriseId || entreprise.id || "entreprise"
  )

  await deleteDoc(
    doc(db, "publicTrackings", publicTrackingDocId(entrepriseSlug, enlevement.numero))
  )
}
