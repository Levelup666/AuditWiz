import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'
import type { CustomFieldType, RecordTemplateContentSchema } from '@/lib/types'

/** UI labels for record custom field types (create record, draft, templates). */
export const RECORD_CUSTOM_FIELD_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'list', label: 'List' },
]

const KNOWN_CONTENT_KEYS = new Set(['title', 'summary', 'notes'])

export interface CustomFieldFormRow {
  id: string
  name: string
  type: CustomFieldType
  /** Scalar fields */
  value: string
  /** When type === 'list' */
  listItems: string[]
}

export function emptyCustomFieldRow(): CustomFieldFormRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'text',
    value: '',
    listItems: [''],
  }
}

/** Map template / saved schema custom field defs into form rows */
export function customFieldsFromSchema(
  defs: RecordTemplateContentSchema['customFields'] | undefined
): CustomFieldFormRow[] {
  if (!defs?.length) return []
  return defs.map((f) => {
    const listItems =
      f.type === 'list'
        ? Array.isArray(f.value) && f.value.length
          ? [...f.value]
          : ['']
        : ['']
    const scalar =
      f.type === 'list'
        ? ''
        : typeof f.value === 'string'
          ? f.value
          : f.value != null
            ? String(f.value)
            : ''
    return {
      id: crypto.randomUUID(),
      name: f.name,
      type: f.type,
      value: scalar,
      listItems,
    }
  })
}

export function buildContentFromForm(
  title: string,
  summary: string,
  notes: string,
  customFields: CustomFieldFormRow[]
): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  const t = title.trim()
  const s = summary.trim()
  const n = notes.trim()
  if (t !== '') content.title = t
  if (s !== '') content.summary = s
  if (n !== '') content.notes = sanitizeRecordNotesHtml(n)

  for (const f of customFields) {
    const key = f.name.trim()
    if (!key) continue

    if (f.type === 'list') {
      const items = (f.listItems ?? []).map((x) => x.trim()).filter(Boolean)
      if (items.length > 0) content[key] = items
      continue
    }

    const raw = f.value.trim()
    if (raw === '') continue

    switch (f.type) {
      case 'integer': {
        const n0 = parseInt(raw, 10)
        content[key] = Number.isNaN(n0) ? raw : n0
        break
      }
      case 'number': {
        const n0 = parseFloat(raw)
        content[key] = Number.isNaN(n0) ? raw : n0
        break
      }
      case 'boolean':
        content[key] = raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes'
        break
      case 'date':
        content[key] = raw
        break
      default:
        content[key] = raw
    }
  }

  return content
}

function inferScalarType(value: unknown): CustomFieldType {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  return 'text'
}

export function contentToFormState(content: Record<string, unknown>): {
  title: string
  summary: string
  notes: string
  customFields: CustomFieldFormRow[]
} {
  const title = (content.title as string) ?? ''
  const summary = (content.summary as string) ?? ''
  const notes = (content.notes as string) ?? ''
  const customFields: CustomFieldFormRow[] = []

  for (const [key, value] of Object.entries(content)) {
    if (KNOWN_CONTENT_KEYS.has(key)) continue

    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      customFields.push({
        id: crypto.randomUUID(),
        name: key,
        type: 'list',
        value: '',
        listItems: value.length ? [...value] : [''],
      })
      continue
    }

    const type = inferScalarType(value)
    customFields.push({
      id: crypto.randomUUID(),
      name: key,
      type,
      value: String(value ?? ''),
      listItems: [''],
    })
  }

  return { title, summary, notes, customFields }
}

/** Build a RecordTemplate contentSchema from current form state (for “save as template”). */
export function contentSchemaFromFormState(
  title: string,
  summary: string,
  notes: string,
  customFields: CustomFieldFormRow[]
): RecordTemplateContentSchema {
  const customFieldDefs: RecordTemplateContentSchema['customFields'] = []

  for (const f of customFields) {
    const name = f.name.trim()
    if (!name) continue

    if (f.type === 'list') {
      const items = (f.listItems ?? []).map((x) => x.trim()).filter(Boolean)
      customFieldDefs.push({
        name,
        type: 'list',
        ...(items.length ? { value: items } : {}),
      })
      continue
    }

    const raw = f.value.trim()
    if (f.type === 'boolean') {
      customFieldDefs.push({
        name,
        type: 'boolean',
        ...(raw !== '' ? { value: raw } : {}),
      })
      continue
    }

    if (raw === '') {
      customFieldDefs.push({ name, type: f.type })
      continue
    }

    customFieldDefs.push({ name, type: f.type, value: raw })
  }

  return {
    title: title.trim() || undefined,
    summary: summary.trim() || undefined,
    notes: notes.trim() ? sanitizeRecordNotesHtml(notes.trim()) : undefined,
    customFields: customFieldDefs,
  }
}
