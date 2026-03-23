import { stripHtmlToPlainText } from '@/lib/sanitize-html'

/**
 * Clone record content for LLM prompts: strip HTML from notes so prompts stay readable.
 * Does not change stored record data or hashes.
 */
export function recordContentForPrompt(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content }
  if (typeof out.notes === 'string') {
    const plain = stripHtmlToPlainText(out.notes)
    out.notes = plain.length > 8000 ? `${plain.slice(0, 8000)}…` : plain
  }
  return out
}
