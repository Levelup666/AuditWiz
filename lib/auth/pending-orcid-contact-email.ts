/** Session key: email collected on sign-up before ORCID OAuth (applied on account setup). */
export const PENDING_ORCID_CONTACT_EMAIL_KEY = 'auditwiz_pending_orcid_contact_email'

export function readPendingOrcidContactEmail(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(PENDING_ORCID_CONTACT_EMAIL_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writePendingOrcidContactEmail(email: string): void {
  if (typeof window === 'undefined') return
  try {
    const normalized = email.trim()
    if (normalized) {
      sessionStorage.setItem(PENDING_ORCID_CONTACT_EMAIL_KEY, normalized)
    } else {
      sessionStorage.removeItem(PENDING_ORCID_CONTACT_EMAIL_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function clearPendingOrcidContactEmail(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_ORCID_CONTACT_EMAIL_KEY)
  } catch {
    /* ignore */
  }
}
