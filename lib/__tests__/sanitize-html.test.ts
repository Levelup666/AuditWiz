import { describe, it, expect } from 'vitest'
import { sanitizeRecordNotesHtml, stripHtmlToPlainText } from '@/lib/sanitize-html'

describe('sanitizeRecordNotesHtml', () => {
  it('allows safe formatting tags', () => {
    const html = '<p><strong>B</strong> <em>i</em> <u>u</u></p><ul><li>a</li></ul>'
    const out = sanitizeRecordNotesHtml(html)
    expect(out).toContain('<strong>')
    expect(out).toContain('<ul>')
  })

  it('strips script and event handlers', () => {
    const evil = '<p onclick="alert(1)">x</p><script>alert(1)</script><img src=x onerror=alert(1)>'
    const out = sanitizeRecordNotesHtml(evil)
    expect(out.toLowerCase()).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
  })
})

describe('stripHtmlToPlainText', () => {
  it('removes tags for prompts', () => {
    expect(stripHtmlToPlainText('<p>Hello <strong>world</strong></p>')).toMatch(/Hello world/i)
  })
})
