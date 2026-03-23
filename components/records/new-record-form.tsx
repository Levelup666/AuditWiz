'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createRecord } from '@/app/studies/[id]/records/actions'
import { updateRecordTemplates } from '@/app/studies/[id]/settings/templates/actions'
import { Plus, Trash2, LayoutTemplate } from 'lucide-react'
import type { CustomFieldType, RecordTemplate, RecordTemplateContentSchema } from '@/lib/types'
import {
  buildContentFromForm,
  contentSchemaFromFormState,
  customFieldsFromSchema,
  emptyCustomFieldRow,
  RECORD_CUSTOM_FIELD_OPTIONS,
  type CustomFieldFormRow,
} from '@/lib/record-content-form'
import RecordNotesEditor from '@/components/records/record-notes-editor'
import RecordTemplateBrowser from '@/components/records/record-template-browser'
import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Record'}
    </Button>
  )
}

interface NewRecordFormProps {
  studyId: string
  templates?: RecordTemplate[]
  primaryResearchField?: string | null
  canSaveStudyTemplate?: boolean
}

export default function NewRecordForm({
  studyId,
  templates = [],
  primaryResearchField = null,
  canSaveStudyTemplate = false,
}: NewRecordFormProps) {
  const router = useRouter()
  const [browseOpen, setBrowseOpen] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [saveTemplatePending, setSaveTemplatePending] = useState(false)

  const [customFields, setCustomFields] = useState<CustomFieldFormRow[]>([])
  const [selectedStudyTemplateId, setSelectedStudyTemplateId] = useState<string>('')
  const [notesEditorKey, setNotesEditorKey] = useState(0)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')

  function hasFormInput() {
    return Boolean(
      title.trim() ||
        summary.trim() ||
        notes.trim() ||
        customFields.some(
          (f) =>
            f.name.trim() &&
            (f.type === 'list'
              ? f.listItems.some((x) => x.trim())
              : f.type === 'boolean'
                ? f.value !== ''
                : f.value.trim())
        )
    )
  }

  function applyContentSchema(schema: RecordTemplateContentSchema) {
    setTitle(schema.title ?? '')
    setSummary(schema.summary ?? '')
    setNotes(sanitizeRecordNotesHtml(schema.notes ?? ''))
    setCustomFields(customFieldsFromSchema(schema.customFields))
    setNotesEditorKey((k) => k + 1)
  }

  function applyStudyTemplateById(nextId: string) {
    if (nextId && hasFormInput()) {
      if (!confirm('This will replace your current content. Continue?')) return
    }
    const template = nextId ? templates.find((t) => t.id === nextId) ?? null : null
    setSelectedStudyTemplateId(nextId)
    if (!template) {
      setTitle('')
      setSummary('')
      setNotes('')
      setCustomFields([])
      setNotesEditorKey((k) => k + 1)
      return
    }
    applyContentSchema(template.contentSchema)
  }

  function handleBrowseApply(schema: RecordTemplateContentSchema) {
    if (hasFormInput()) {
      if (!confirm('This will replace your current content. Continue?')) return
    }
    setSelectedStudyTemplateId('')
    applyContentSchema(schema)
  }

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

  async function handleSubmit(formData: FormData) {
    const titleVal = title.trim()
    const summaryVal = summary.trim()
    const notesVal = notes.trim()
    const content = buildContentFromForm(titleVal, summaryVal, notesVal, customFields)
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

  async function handleSaveAsStudyTemplate() {
    const name = newTemplateName.trim()
    if (!name) {
      toast.error('Name required', 'Enter a template name.')
      return
    }
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Duplicate name', 'A study template with this name already exists.')
      return
    }
    setSaveTemplatePending(true)
    const schema = contentSchemaFromFormState(title, summary, notes, customFields)
    const newT: RecordTemplate = {
      id: crypto.randomUUID(),
      name,
      contentSchema: {
        ...schema,
        customFields: schema.customFields ?? [],
      },
    }
    const merged = [...templates, newT]
    const result = await updateRecordTemplates(studyId, merged)
    setSaveTemplatePending(false)
    if (result?.error) {
      toast.error('Save failed', result.error)
      return
    }
    toast.success('Template saved', 'You can reuse it from Browse templates or the quick picker.')
    setSaveTemplateOpen(false)
    setNewTemplateName('')
    router.refresh()
  }

  return (
    <>
      <form action={handleSubmit} className="max-w-2xl space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="template-quick">Study template (quick)</Label>
              <select
                id="template-quick"
                value={selectedStudyTemplateId}
                onChange={(e) => applyStudyTemplateById(e.target.value)}
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
            <Button type="button" variant="outline" className="mt-6 sm:mt-0" onClick={() => setBrowseOpen(true)}>
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Browse templates
            </Button>
          </div>

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
            <p className="mt-1 text-xs text-gray-500">Unique identifier for this record within the study.</p>
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
            <Label htmlFor="record-notes">Notes</Label>
            <p className="mb-1 text-xs text-muted-foreground">
              Rich text: bold, underline, bullets, numbered lists, and task checkboxes.
            </p>
            <RecordNotesEditor
              id="record-notes"
              editorKey={notesEditorKey}
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
            <p className="text-xs text-gray-500">
              Add typed fields (including lists). Empty values are omitted from the saved record.
            </p>
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
                  <div className="pl-0 sm:pl-1">
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

        <div className="flex flex-wrap gap-2">
          <SubmitButton />
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          {canSaveStudyTemplate ? (
            <Button type="button" variant="secondary" onClick={() => setSaveTemplateOpen(true)}>
              Save current as study template…
            </Button>
          ) : null}
        </div>
      </form>

      <RecordTemplateBrowser
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        studyTemplates={templates}
        primaryResearchField={primaryResearchField}
        onApplySchema={handleBrowseApply}
      />

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as study template</DialogTitle>
            <DialogDescription>
              Saves the current title, summary, notes, and custom field definitions (names, types, defaults) to this
              study&apos;s templates. Record number is not included.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="save-template-name">Template name *</Label>
            <Input
              id="save-template-name"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="e.g. Our lab visit form"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveAsStudyTemplate} disabled={saveTemplatePending}>
              {saveTemplatePending ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
