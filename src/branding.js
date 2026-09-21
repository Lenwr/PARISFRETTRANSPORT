export const PARIS_FRET_LOGO_URL = "/images/paris-fret-logo-2026.jpg"
export const PARIS_FRET_LOGO_VERSION = "2026-09-20"

// Ignore pre-rebrand logos; a later upload from Settings can replace this default.
export function resolveCompanyLogo(company = {}) {
  if (company?.logoBrandVersion === PARIS_FRET_LOGO_VERSION && company?.logoUrl) {
    return company.logoUrl
  }
  return PARIS_FRET_LOGO_URL
}
