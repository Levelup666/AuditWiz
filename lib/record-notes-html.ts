/**
 * Legacy record notes are plain text; rich notes are HTML from TipTap.
 * Convert plain text to minimal HTML for the editor.
 */
export function notesToEditorHtml(notes: string): string {
  const t = notes ?? ''
  if (!t.trim()) return ''
  const trimmed = t.trimStart()
  if (/^\s*</.test(trimmed)) {
    return t
  }
  const esc = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withBreaks = esc.split(/\n\n/).map((para) => {
    const inner = para.split('\n').join('<br />')
    return `<p>${inner}</p>`
  })
  return withBreaks.join('')
}
