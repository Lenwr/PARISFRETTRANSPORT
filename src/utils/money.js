export function parseMoney(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")

  if (!raw) return 0

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "")

  const number = Number(normalized)

  return Number.isFinite(number) ? number : 0
}

export function formatMoney(value, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency
  }).format(parseMoney(value))
}
