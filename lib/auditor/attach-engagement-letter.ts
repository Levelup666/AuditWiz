import { createHash, randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '@/lib/document-upload'

const BUCKET = 'documents'

export const ENGAGEMENT_LETTER_ALLOWED_MIME = new Set([
  'application/pdf',
])

export const ENGAGEMENT_LETTER_ALLOWED_EXTENSIONS = new Set(['.pdf'])

/** Ensure the shared documents storage bucket exists (idempotent). */
export async function ensureDocumentsBucket(admin: SupabaseClient): Promise<{
  ok: boolean
  created: boolean
  error?: string
}> {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets()
  if (listErr) {
    return { ok: false, created: false, error: listErr.message }
  }
  if ((buckets ?? []).some((b) => b.name === BUCKET)) {
    return { ok: true, created: false }
  }
  const { error: createErr } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
  })
  if (createErr) {
    // Race: another request created it
    const msg = createErr.message?.toLowerCase() ?? ''
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      return { ok: true, created: false }
    }
    return { ok: false, created: false, error: createErr.message }
  }
  return { ok: true, created: true }
}

export function validateEngagementLetterFile(file: {
  size: number
  type: string
  name: string
}): { valid: boolean; error?: string } {
  if (file.size <= 0) {
    return { valid: false, error: 'File is empty.' }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
    }
  }
  const ext = file.name.includes('.')
    ? '.' + file.name.split('.').pop()!.toLowerCase()
    : ''
  const mime = (file.type || 'application/octet-stream').toLowerCase()
  if (!ENGAGEMENT_LETTER_ALLOWED_MIME.has(mime) && !ENGAGEMENT_LETTER_ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: 'Engagement letter must be a PDF.' }
  }
  return { valid: true }
}

export type AttachEngagementLetterResult =
  | {
      ok: true
      fileHash: string
      filePath: string
      fileName: string
      fileSize: number
      mimeType: string
    }
  | { ok: false; status: number; error: string; code?: string }

/**
 * Attach an engagement letter / scope PDF to a pending or active engagement.
 * No replacement: if a letter already exists, returns 409.
 */
export async function attachEngagementLetter(params: {
  supabase: SupabaseClient
  admin: SupabaseClient
  institutionId: string
  engagementId: string
  uploadedBy: string
  file: { name: string; type: string; size: number; buffer: Buffer }
}): Promise<AttachEngagementLetterResult> {
  const { supabase, admin, institutionId, engagementId, uploadedBy, file } = params

  const validation = validateEngagementLetterFile(file)
  if (!validation.valid) {
    const status = validation.error?.includes('too large') ? 413 : 400
    return { ok: false, status, error: validation.error ?? 'Invalid file' }
  }

  const { data: engagement, error: fetchErr } = await supabase
    .from('audit_engagements')
    .select(
      'id, institution_id, revoked_at, engagement_letter_file_path, engagement_letter_file_hash'
    )
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .maybeSingle()

  if (fetchErr || !engagement) {
    return { ok: false, status: 404, error: 'Engagement not found' }
  }
  if (engagement.revoked_at) {
    return { ok: false, status: 410, error: 'This engagement was revoked.' }
  }
  if (engagement.engagement_letter_file_path || engagement.engagement_letter_file_hash) {
    return {
      ok: false,
      status: 409,
      error: 'An engagement letter is already attached. Letters cannot be replaced.',
      code: 'letter_already_attached',
    }
  }

  const fileHash = createHash('sha256').update(file.buffer).digest('hex')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `audit-engagements/${engagementId}/letter-${randomUUID()}-${safeName}`
  const mimeType = file.type || 'application/pdf'
  const uploadedAt = new Date().toISOString()

  const bucketReady = await ensureDocumentsBucket(admin)
  if (!bucketReady.ok) {
    return {
      ok: false,
      status: 500,
      error:
        bucketReady.error ||
        'Could not create the "documents" storage bucket. Create it in Supabase Dashboard → Storage.',
      code: 'letter_storage_failed',
    }
  }

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(filePath, file.buffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (uploadError) {
    return {
      ok: false,
      status: 500,
      error:
        uploadError.message ||
        'Upload failed. Ensure the "documents" bucket exists in Supabase Storage.',
      code: 'letter_storage_failed',
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('audit_engagements')
    .update({
      engagement_letter_file_name: file.name,
      engagement_letter_file_path: filePath,
      engagement_letter_file_hash: fileHash,
      engagement_letter_file_size: file.size,
      engagement_letter_mime_type: mimeType,
      engagement_letter_uploaded_at: uploadedAt,
    })
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .is('engagement_letter_file_path', null)
    .is('revoked_at', null)
    .select('id')

  if (updateErr || !updated?.length) {
    await admin.storage.from(BUCKET).remove([filePath]).catch(() => undefined)
    return {
      ok: false,
      status: 500,
      error: updateErr?.message ?? 'Could not attach engagement letter.',
    }
  }

  const eventHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    file_hash: fileHash,
    file_size: file.size,
    mime_type: mimeType,
  })

  await createAuditEvent(
    null,
    uploadedBy,
    'audit_engagement_letter_uploaded',
    'audit_engagement',
    engagementId,
    null,
    eventHash,
    {
      institution_id: institutionId,
      file_name: file.name,
      file_hash: fileHash,
      file_size: file.size,
      mime_type: mimeType,
    }
  )

  return {
    ok: true,
    fileHash,
    filePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType,
  }
}
