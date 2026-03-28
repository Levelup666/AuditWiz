/** Relative path only; prevents open redirects. */
export function safeAppPath(path: string | null | undefined, fallback = '/studies'): string {
  if (!path || typeof path !== 'string') return fallback
  const t = path.trim()
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('\\')) return fallback
  return t
}
