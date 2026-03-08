import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

// ORCID ID format: 16 digits, last can be X; display 0000-0000-0000-000X
function normalizeOrcidId(raw: string): string {
  const digits = raw.replace(/-/g, '').trim().toUpperCase()
  if (digits.length !== 16) return ''
  const valid = /^\d{15}[\dX]$/.test(digits)
  if (!valid) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const {
    orcid_id: rawOrcid,
    verified = false,
    affiliation_snapshot = null,
  } = body as { orcid_id?: string; verified?: boolean; affiliation_snapshot?: string | null }

  if (!rawOrcid || typeof rawOrcid !== 'string') {
    return NextResponse.json({ error: 'orcid_id is required' }, { status: 400 })
  }

  const orcidId = normalizeOrcidId(rawOrcid)
  if (!orcidId) {
    return NextResponse.json({ error: 'Invalid ORCID ID format (expected 16 digits, e.g. 0000-0001-2345-6789)' }, { status: 400 })
  }

  // Prevent linking multiple ORCID IDs: check for existing active ORCID for this user
  const { data: existing } = await supabase
    .from('user_identities')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'orcid')
    .is('revoked_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have an ORCID linked. Only one ORCID per account.' },
      { status: 409 }
    )
  }

  // Check ORCID not already linked to another user
  const { data: taken } = await supabase
    .from('user_identities')
    .select('id')
    .eq('provider', 'orcid')
    .eq('provider_id', orcidId)
    .is('revoked_at', null)
    .maybeSingle()

  if (taken) {
    return NextResponse.json(
      { error: 'This ORCID is already linked to another account.' },
      { status: 409 }
    )
  }

  const { error: identityError } = await supabase.from('user_identities').insert({
    user_id: user.id,
    provider: 'orcid',
    provider_id: orcidId,
    verified: Boolean(verified),
    linked_at: new Date().toISOString(),
  })

  if (identityError) {
    return NextResponse.json({ error: identityError.message }, { status: 500 })
  }

  const { error: upsertError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      orcid_id: orcidId,
      orcid_verified: Boolean(verified),
      orcid_affiliation_snapshot:
        affiliation_snapshot != null && String(affiliation_snapshot).trim() !== ''
          ? String(affiliation_snapshot).trim()
          : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    provider: 'orcid',
    provider_id: orcidId,
    user_id: user.id,
    verified: Boolean(verified),
  })

  await createAuditEvent(
    null,
    user.id,
    'identity_linked',
    'user_identity',
    user.id,
    null,
    stateHash,
    { orcid_id: orcidId, verified: Boolean(verified) }
  )

  return NextResponse.json({
    success: true,
    orcid_id: orcidId,
    orcid_verified: Boolean(verified),
  })
}
