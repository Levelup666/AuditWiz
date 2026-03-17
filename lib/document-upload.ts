/**
 * Document upload validation constants and helpers.
 * Used for both client and server validation.
 */

const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB) || 25
export const MAX_FILE_SIZE_BYTES = MAX_MB * 1024 * 1024
export const MAX_FILE_SIZE_MB = MAX_MB

export const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Data
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'image/webp',
])

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.tiff',
  '.webp',
])

/** Accept attribute for file input (comma-separated extensions) */
export const FILE_INPUT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.png,.jpg,.jpeg,.gif,.tiff,.webp'

/** Human-readable list for error messages */
export const SUPPORTED_TYPES_DESCRIPTION =
  'PDF, Word, Excel, CSV, images, and text files'

export function validateFileSize(size: number): { valid: boolean; error?: string } {
  if (size <= 0) {
    return { valid: false, error: 'File is empty.' }
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
    }
  }
  return { valid: true }
}

export function validateFileType(
  mimeType: string,
  fileName: string
): { valid: boolean; error?: string } {
  const ext = fileName.includes('.')
    ? '.' + fileName.split('.').pop()!.toLowerCase()
    : ''
  const mime = (mimeType || 'application/octet-stream').toLowerCase()

  if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `This file type is not supported. Please upload ${SUPPORTED_TYPES_DESCRIPTION}.`,
    }
  }
  // Defense in depth: if MIME is allowed but extension is suspicious, still allow (MIME can be wrong)
  if (ALLOWED_MIME_TYPES.has(mime)) {
    return { valid: true }
  }
  if (ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: true }
  }
  return {
    valid: false,
    error: `This file type is not supported. Please upload ${SUPPORTED_TYPES_DESCRIPTION}.`,
  }
}

export function validateFile(
  file: { size: number; type: string; name: string }
): { valid: boolean; error?: string } {
  const sizeResult = validateFileSize(file.size)
  if (!sizeResult.valid) return sizeResult
  return validateFileType(file.type, file.name)
}
