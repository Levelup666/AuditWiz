'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveDraftRecord } from '@/app/studies/[id]/records/actions'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'
import type { CustomFieldType } from '@/lib/types'
import {
  buildContentFromForm,
  contentToFormState,
  emptyCustomFieldRow,
  RECORD_CUSTOM_FIELD_OPTIONS,
  type CustomFieldFormRow,
} from '@/lib/record-content-form'
import RecordNotesEditor from '@/components/records/record-notes-editor'
import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'

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

interface RecordDraftFormProps {
  studyId: string
  recordId: string
  initialContent: Record<string, unknown>
}

export default function RecordDraftForm({ studyId, recordId, initialContent }: RecordDraftFormProps) {
  const [title, setTitle] = useState(() => contentToFormState(initialContent ?? {}).title)
  const [summary, setSummary] = useState(() => contentToFormState(initialContent ?? {}).summary)
  const [notes, setNotes] = useState(() =>
    sanitizeRecordNotesHtml(contentToFormState(initialContent ?? {}).notes)
  )
  const [customFields, setCustomFields] = useState<CustomFieldFormRow[]>(() =>
    contentToFormState(initialContent ?? {}).customFields
  )
  const [saving, setSaving] = useState(false)
  const [notesEditorKey, setNotesEditorKey] = useState(0)
  const prevContentSig = useRef<string | null>(null)

  const contentSignature = JSON.stringify(initialContent ?? {})

  useEffect(() => {
    if (prevContentSig.current === null) {
      prevContentSig.current = contentSignature
      return
    }
    if (prevContentSig.current === contentSignature) return
    prevContentSig.current = contentSignature
    const s = contentToFormState(JSON.parse(contentSignature) as Record<string, unknown>)
    setTitle(s.title)
    setSummary(s.summary)
    setNotes(sanitizeRecordNotesHtml(s.notes))
    setCustomFields(s.customFields)
    setNotesEditorKey((k) => k + 1)
  }, [contentSignature])

  function addCustomField() {
    setCustomFields((prev) => [...prev, emptyCustomFieldRow()])
  }

  function removeCustomField(id: string) {
    setCustomFields((prev) => prev.filter((f) => f.id !== id))
  }

  function updateCustomField(
    id: string,
    updates: Partial<Pick<CustomFieldFormRow, 'name' | 'type' | 'value' | 'listItems'>>
  ) {
    setCustomFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const next = { ...f, ...updates }
        if (updates.type === 'list' && !updates.listItems) {
          next.listItems = f.type === 'list' && f.listItems.length ? f.listItems : ['']
        }
        if (updates.type && updates.type !== 'list') {
          next.listItems = ['']
        }
        return next
      })
    )
  }

  function updateListItem(fieldId: string, index: number, text: string) {
    setCustomFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f
        const listItems = [...(f.listItems ?? [''])]
        listItems[index] = text
        return { ...f, listItems }
      })
    )
  }

  function addListItem(fieldId: string) {
    setCustomFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, listItems: [...(f.listItems ?? []), ''] } : f))
    )
  }

  function removeListItem(fieldId: string, index: number) {
    setCustomFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f
        const listItems = (f.listItems ?? ['']).filter((_, i) => i !== index)
        return { ...f, listItems: listItems.length ? listItems : [''] }
      })
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
          <Label htmlFor={`notes-${recordId}`}>Notes</Label>
          <p className="mb-1 text-xs text-muted-foreground">
            Rich text: bold, underline, bullets, numbered lists, and task checkboxes.
          </p>
          <RecordNotesEditor
            id={`notes-${recordId}`}
            editorKey={`${recordId}-${notesEditorKey}`}
            value={notes}
            onChange={setNotes}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Custom fields</Label>
            <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
              <Plus className="mr-2 h-4 w-4" />
              Add field
            </Button>
          </div>
          <p className="text-xs text-gray-500">Add typed fields (including lists).</p>
          {customFields.map((field) => (
            <div
              key={field.id}
              className="space-y-2 rounded-md border border-gray-200 bg-gray-50/50 p-3 dark:border-border dark:bg-muted/20"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[120px] flex-1">
                  <Label className="text-xs">Field name</Label>
                  <Input
                    placeholder="e.g. site_id"
                    value={field.name}
                    onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
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
                    {RECORD_CUSTOM_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
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

              {field.type === 'list' ? (
                <div>
                  <Label className="text-xs">List items</Label>
                  <ul className="mt-1 space-y-2">
                    {(field.listItems ?? ['']).map((item, idx) => (
                      <li key={idx} className="flex gap-2">
                        <Input
                          value={item}
                          onChange={(e) => updateListItem(field.id, idx, e.target.value)}
                          placeholder={`Item ${idx + 1}`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeListItem(field.id, idx)}
                          disabled={(field.listItems ?? []).length <= 1}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addListItem(field.id)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add item
                  </Button>
                </div>
              ) : field.type === 'boolean' ? (
                <div>
                  <Label className="text-xs">Value</Label>
                  <select
                    value={field.value}
                    onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                    className="mt-1 flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input
                    type={field.type === 'date' ? 'date' : 'text'}
                    placeholder={field.type === 'integer' || field.type === 'number' ? '0' : ''}
                    value={field.value}
                    onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                    className="mt-1 max-w-md"
                  />
                </div>
              )}
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
