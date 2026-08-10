const crypto = require("crypto")

const TRACKING_API_URL = String(
  process.env.TRACKING_API_URL ||
  "https://europe-west1-rdsgestion-b3ec6.cloudfunctions.net/trackingApi"
).replace(/\/+$/, "")

const STATUS_ORDER = [
  "PENDING",
  "RECEIVED",
  "LOADED",
  "IN_TRANSIT",
  "READY_FOR_PICKUP",
  "DELIVERED"
]

const STATUS_LABELS = {
  PENDING: "Dossier créé",
  RECEIVED: "Colis réceptionné",
  LOADED: "Colis chargé",
  IN_TRANSIT: "Colis en transit",
  READY_FOR_PICKUP: "Colis disponible pour retrait",
  DELIVERED: "Colis livré",
  CANCELLED: "Expédition annulée"
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function trackingStatus(value, fallback = "PENDING") {
  const status = normalizeText(value).replace(/[\s-]+/g, "_")
  const mappings = {
    pending: "PENDING",
    en_attente: "PENDING",
    recu: "RECEIVED",
    receptionne: "RECEIVED",
    received: "RECEIVED",
    attribue_au_vol: "LOADED",
    charge: "LOADED",
    loaded: "LOADED",
    contenaire: "LOADED",
    conteneur: "LOADED",
    envoye: "IN_TRANSIT",
    expedie: "IN_TRANSIT",
    en_transit: "IN_TRANSIT",
    in_transit: "IN_TRANSIT",
    arrive: "READY_FOR_PICKUP",
    disponible: "READY_FOR_PICKUP",
    disponible_pour_retrait: "READY_FOR_PICKUP",
    ready_for_pickup: "READY_FOR_PICKUP",
    livre: "DELIVERED",
    recupere: "DELIVERED",
    delivered: "DELIVERED",
    annule: "CANCELLED",
    cancelled: "CANCELLED"
  }

  return mappings[status] || (/^(PENDING|RECEIVED|LOADED|IN_TRANSIT|READY_FOR_PICKUP|DELIVERED|CANCELLED)$/.test(String(value || ""))
    ? String(value)
    : fallback)
}

function isoDate(value, fallback = null) {
  if (!value) return fallback
  const raw = typeof value.toDate === "function" ? value.toDate() : value
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function packageStatus(item, shipmentStatus) {
  const statuses = (item.details || []).map(detail => trackingStatus(detail.statutColis, shipmentStatus))
  if (!statuses.length) return trackingStatus(item.statutColis, shipmentStatus)
  if (statuses.includes("CANCELLED")) return statuses.every(status => status === "CANCELLED") ? "CANCELLED" : shipmentStatus
  return statuses.reduce((least, status) => (
    STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(least) ? status : least
  ), statuses[0])
}

function buildPackages(shipment, shipmentStatus) {
  return (shipment.colis || []).slice(0, 100).map((item, index) => {
    const description = String(item.nom || `Colis ${index + 1}`).slice(0, 160)
    return {
      id: `package-${index + 1}`,
      label: description,
      description,
      quantity: Math.max(1, Math.round(Number(item.quantite || item.details?.length || 1))),
      weightKg: Math.max(0, Number(item.poidsTotal || item.poids || 0)),
      status: packageStatus(item, shipmentStatus)
    }
  })
}

function transportMode(value) {
  const mode = normalizeText(value)
  if (mode.includes("aer") || mode === "air") return "AIR"
  if (mode.includes("mar") || mode.includes("mer") || mode === "sea") return "SEA"
  if (mode.includes("rout") || mode === "road") return "ROAD"
  return null
}

function eventId(status, occurredAt) {
  return crypto.createHash("sha256").update(`${status}:${occurredAt}`).digest("hex").slice(0, 24)
}

function mergeEvents(existingEvents, status, occurredAt, location) {
  const events = Array.isArray(existingEvents) ? existingEvents.slice(0, 199) : []
  const alreadyRecorded = events.some(event => event.status === status)
  if (!alreadyRecorded) {
    events.push({
      id: eventId(status, occurredAt),
      status,
      occurredAt,
      ...(location ? { location: String(location).slice(0, 160) } : {}),
      label: STATUS_LABELS[status]
    })
  }
  return events
}

function buildPayload(shipment, company, existingEvents = []) {
  const requestedStatus = trackingStatus(shipment.deliveryStatus)
  const packages = buildPackages(shipment, requestedStatus)
  const activePackageStatuses = packages.map(item => item.status).filter(status => status !== "CANCELLED")
  const status = requestedStatus === "CANCELLED"
    ? "CANCELLED"
    : activePackageStatuses.reduce((least, packageState) => (
      STATUS_ORDER.indexOf(packageState) < STATUS_ORDER.indexOf(least) ? packageState : least
    ), requestedStatus)
  const occurredAt = isoDate(shipment.updatedAt || shipment.date || shipment.createdAt, new Date().toISOString())
  const createdAt = isoDate(shipment.createdAt || shipment.date, occurredAt)
  const destination = String(shipment.destination || "").trim()
  const mode = transportMode(shipment.typeDeFret)

  return {
    schemaVersion: 1,
    trackingNumber: String(shipment.numero || "").trim(),
    company: { name: String(company.nom || company.companyName || "Paris Fret Transport").slice(0, 160) },
    shipment: {
      status,
      ...(mode ? { transportMode: mode } : {}),
      ...(shipment.origin ? { origin: String(shipment.origin).slice(0, 160) } : {}),
      ...(destination ? { destination: destination.slice(0, 160) } : {}),
      ...(shipment.typeDeFret ? { service: String(shipment.typeDeFret).slice(0, 80) } : {}),
      ...(isoDate(shipment.estimatedDeliveryAt) ? { estimatedDeliveryAt: isoDate(shipment.estimatedDeliveryAt) } : {})
    },
    ...(shipment.expediteur ? { sender: { name: String(shipment.expediteur).slice(0, 160) } } : {}),
    ...(shipment.destinataire ? {
      recipient: {
        name: String(shipment.destinataire).slice(0, 160),
        ...(destination ? { city: destination.slice(0, 160) } : {})
      }
    } : {}),
    packages,
    events: mergeEvents(existingEvents, status, occurredAt, destination),
    createdAt,
    archived: false,
    revoked: false
  }
}

async function apiRequest(path, options = {}) {
  const tenantId = String(process.env.TRACKING_TENANT_ID || "").trim()
  const apiKey = String(process.env.TRACKING_API_KEY || "").trim()
  if (!tenantId || !apiKey) throw new Error("Configuration TRACKING_TENANT_ID/TRACKING_API_KEY manquante")

  const response = await fetch(`${TRACKING_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": tenantId,
      "X-Api-Key": apiKey,
      ...options.headers
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`API de suivi: ${response.status} ${body.error || body.message || response.statusText}`)
    error.status = response.status
    throw error
  }
  return body
}

async function getExistingEvents(companySlug, trackingNumber) {
  if (!companySlug) return []
  const response = await fetch(`${TRACKING_API_URL}/v1/public/${encodeURIComponent(companySlug)}/${encodeURIComponent(trackingNumber)}`)
  if (response.status === 404) return []
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Lecture du suivi existant impossible (${response.status})`)
  return body.events || body.data?.events || body.shipment?.events || []
}

async function syncShipment(shipment, company) {
  if (!shipment.numero) throw new Error("Numéro de suivi manquant")
  const slug = process.env.TRACKING_COMPANY_SLUG || company.trackingSlug || company.slug
  const events = await getExistingEvents(slug, shipment.numero)
  const payload = buildPayload(shipment, company, events)
  return apiRequest("/v1/shipments", { method: "PUT", body: JSON.stringify(payload) })
}

async function archiveShipment(trackingNumber) {
  if (!trackingNumber) return null
  return apiRequest(`/v1/shipments/${encodeURIComponent(trackingNumber)}`, { method: "DELETE" })
}

module.exports = { archiveShipment, buildPayload, syncShipment, trackingStatus }
