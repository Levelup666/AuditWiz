'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRecord } from '@/app/studies/[id]/records/actions'
import { Plus, Trash2 } from 'lucide-react'
import type { CustomFieldType, RecordTemplate } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Record'}
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

interface NewRecordFormProps {
  studyId: string
  templates?: RecordTemplate[]
}

export default function NewRecordForm({ studyId, templates = [] }: NewRecordFormProps) {
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')

  function applyTemplate(template: RecordTemplate | null) {
    if (!template) {
      setTitle('')
      setSummary('')
      setNotes('')
      setCustomFields([])
      return
    }
    const schema = template.contentSchema
    setTitle(schema.title ?? '')
    setSummary(schema.summary ?? '')
    setNotes(schema.notes ?? '')
    setCustomFields(
      (schema.customFields ?? []).map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: f.type,
        value: f.value ?? '',
      }))
    )
  }

  function handleTemplateChange(nextId: string) {
    if (selectedTemplateId && (title || summary || notes || customFields.length > 0)) {
      if (!confirm('This will replace your current content. Continue?')) return
    }
    const template = nextId ? templates.find((t) => t.id === nextId) ?? null : null
    setSelectedTemplateId(nextId)
    applyTemplate(template ?? null)
  }

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

  async function handleSubmit(formData: FormData) {
    const titleVal = (formData.get('title') as string)?.trim() ?? ''
    const summaryVal = (formData.get('summary') as string)?.trim() ?? ''
    const notesVal = (formData.get('notes') as string)?.trim() ?? ''
    const content = buildContentFromForm(titleVal, summaryVal, notesVal, customFields)
    // Pass content as JSON in a hidden field; action still expects record_number + content
    const fd = new FormData()
    fd.set('record_number', (formData.get('record_number') as string) ?? '')
    fd.set('content', JSON.stringify(content))
    const result = await createRecord(studyId, fd)
    if (result?.error) {
      toast.error('Create record failed', result.error)
    } else {
      toast.success('Record created successfully')
    }
  }

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        {templates.length > 0 && (
          <div>
            <Label htmlFor="template">Start from template</Label>
            <select
              id="template"
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="mt-1 flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Blank</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="record_number">Record Number *</Label>
          <Input
            id="record_number"
            name="record_number"
            type="text"
            required
            placeholder="e.g. REC-001"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500">
            Unique identifier for this record within the study.
          </p>
        </div>
        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Short title for the record"
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            name="summary"
            placeholder="Brief summary (optional)"
            className="mt-1"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Additional notes (optional)"
            className="mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
        <SubmitButton />
        <Button
          type="button"
          variant="outline"
          onClick={() => window.history.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
