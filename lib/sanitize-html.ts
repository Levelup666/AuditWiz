import DOMPurify from 'isomorphic-dompurify'

/** Tags TipTap may emit for record notes (task lists, basic formatting). */
const NOTES_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'div',
  'span',
  'label',
  'input',
]

const NOTES_ALLOWED_ATTR = [
  'class',
  'type',
  'checked',
  'data-type',
  'data-checked',
]

/**
 * Sanitize rich-text notes before persist or render (XSS-safe subset).
 */
export function sanitizeRecordNotesHtml(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ''
  return DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: NOTES_ALLOWED_TAGS,
    ALLOWED_ATTR: NOTES_ALLOWED_ATTR,
  })
}

/** Plain text for LLM prompts (no HTML noise). */
export function stripHtmlToPlainText(html: string): string {
  if (!html?.trim()) return ''
  const noTags = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
  return noTags.replace(/\s+/g, ' ').trim()
}
