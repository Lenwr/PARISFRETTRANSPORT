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
