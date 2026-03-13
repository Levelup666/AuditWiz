'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveDraftRecord } from '@/app/studies/[id]/records/actions'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'
import type { CustomFieldType } from '@/lib/types'

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Save className="mr-2 h-4 w-4" />
      )}
      {pending ? 'Saving...' : 'Save Draft'}
    </Button>
  )
}

const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
]

interface CustomField {
  id: string
  name: string
  type: CustomFieldType
  value: string
}

function buildContentFromForm(
  title: string,
  summary: string,
  notes: string,
  customFields: CustomField[]
): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  if (title !== '') content.title = title
  if (summary !== '') content.summary = summary
  if (notes !== '') content.notes = notes

  for (const f of customFields) {
    const key = f.name.trim()
    if (!key) continue
    const raw = f.value.trim()
    if (raw === '') continue
    switch (f.type) {
      case 'integer':
        content[key] = parseInt(raw, 10)
        if (Number.isNaN(content[key])) content[key] = raw
        break
      case 'number':
        content[key] = parseFloat(raw)
        if (Number.isNaN(content[key])) content[key] = raw
        break
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

function contentToFormState(content: Record<string, unknown>): {
  title: string
  summary: string
  notes: string
  customFields: CustomField[]
} {
  const title = (content.title as string) ?? ''
  const summary = (content.summary as string) ?? ''
  const notes = (content.notes as string) ?? ''
  const knownKeys = new Set(['title', 'summary', 'notes'])
  const customFields: CustomField[] = []
  for (const [key, value] of Object.entries(content)) {
    if (knownKeys.has(key)) continue
    const type = typeof value === 'number'
      ? (Number.isInteger(value) ? 'integer' : 'number')
      : typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? 'date'
          : 'text'
    customFields.push({
      id: crypto.randomUUID(),
      name: key,
      type,
      value: String(value ?? ''),
    })
  }
  return { title, summary, notes, customFields }
}

interface RecordDraftFormProps {
  studyId: string
  recordId: string
  initialContent: Record<string, unknown>
}

export default function RecordDraftForm({
  studyId,
  recordId,
  initialContent,
}: RecordDraftFormProps) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const { title: t, summary: s, notes: n, customFields: cf } = contentToFormState(
      initialContent ?? {}
    )
    setTitle(t)
    setSummary(s)
    setNotes(n)
    setCustomFields(cf)
  }, [initialContent])

  function addCustomField() {
    setCustomFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', type: 'text', value: '' },
    ])
  }

  function removeCustomField(id: string) {
    setCustomFields((prev) => prev.filter((f) => f.id !== id))
  }

  function updateCustomField(
    id: string,
    updates: Partial<Pick<CustomField, 'name' | 'type' | 'value'>>
  ) {
    setCustomFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const content = buildContentFromForm(title, summary, notes, customFields)
    const result = await saveDraftRecord(studyId, recordId, content)
    setSaving(false)
    if (result?.error) {
      toast.error('Save failed', result.error)
    } else {
      toast.success('Draft saved successfully')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title for the record"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            name="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary (optional)"
            className="mt-1"
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes (optional)"
            className="mt-1"
            rows={2}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Custom fields</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomField}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add field
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Add custom fields (e.g. site ID, date) and set the type for each.
          </p>
          {customFields.map((field) => (
            <div
              key={field.id}
              className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-gray-50/50 p-3"
            >
              <div className="min-w-[120px] flex-1">
                <Label className="text-xs">Field name</Label>
                <Input
                  placeholder="e.g. site_id"
                  value={field.name}
                  onChange={(e) =>
                    updateCustomField(field.id, { name: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div className="w-[120px]">
                <Label className="text-xs">Type</Label>
                <select
                  value={field.type}
                  onChange={(e) =>
                    updateCustomField(field.id, {
                      type: e.target.value as CustomFieldType,
                    })
                  }
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {CUSTOM_FIELD_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px] flex-1">
                <Label className="text-xs">Value</Label>
                {field.type === 'boolean' ? (
                  <select
                    value={field.value}
                    onChange={(e) =>
                      updateCustomField(field.id, { value: e.target.value })
                    }
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <Input
                    type={field.type === 'date' ? 'date' : 'text'}
                    placeholder={
                      field.type === 'integer' || field.type === 'number'
                        ? '0'
                        : ''
                    }
                    value={field.value}
                    onChange={(e) =>
                      updateCustomField(field.id, { value: e.target.value })
                    }
                    className="mt-1"
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCustomField(field.id)}
                className="shrink-0"
                aria-label="Remove field"
              >
                <Trash2 className="h-4 w-4 text-gray-500" />
              </Button>
            </div>
          ))}
        </div>
      </div>
            <div className="flex gap-2">
              <SaveButton pending={saving} />
      </div>
    </form>
  )
}
