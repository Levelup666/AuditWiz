/**
 * Read the `role` claim from a Supabase JWT (anon / service_role / authenticated)
 * without verifying the signature. Used only to detect misconfigured env keys.
 */
export function getJwtRoleFromSecret(secret: string | undefined): string | null {
  if (!secret || typeof secret !== 'string') return null
  const parts = secret.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}
