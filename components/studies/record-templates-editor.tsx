'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { updateRecordTemplates } from '@/app/studies/[id]/settings/templates/actions'
import { toast } from '@/lib/toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { RecordTemplate, CustomFieldType, RecordTemplateCustomFieldDef } from '@/lib/types'
import { RECORD_CUSTOM_FIELD_OPTIONS } from '@/lib/record-content-form'
import RecordNotesEditor from '@/components/records/record-notes-editor'
import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'

function emptyTemplate(): RecordTemplate {
  return {
    id: crypto.randomUUID(),
    name: '',
    contentSchema: {
      title: '',
      summary: '',
      notes: '',
      customFields: [],
    },
  }
}

function getListDefaultItems(f: RecordTemplateCustomFieldDef): string[] {
  if (f.type !== 'list') return []
  if (Array.isArray(f.value)) return f.value.length ? [...f.value] : ['']
  return ['']
}

interface RecordTemplatesEditorProps {
  studyId: string
  initialTemplates: RecordTemplate[]
  studyIsActive: boolean
}

export default function RecordTemplatesEditor({
  studyId,
  initialTemplates,
  studyIsActive,
}: RecordTemplatesEditorProps) {
  const [templates, setTemplates] = useState<RecordTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<RecordTemplate | null>(null)
  const [pending, setPending] = useState(false)

  const openAdd = () => {
    setEditing(emptyTemplate())
  }

  const openEdit = (t: RecordTemplate) => {
    const schema = { ...t.contentSchema }
    schema.notes = sanitizeRecordNotesHtml(schema.notes ?? '')
    schema.customFields = (schema.customFields ?? []).map((f) => ({ ...f }))
    setEditing({ ...t, contentSchema: schema })
  }

  const closeEdit = () => setEditing(null)

  const saveTemplates = async (next: RecordTemplate[]) => {
    setPending(true)
    const result = await updateRecordTemplates(studyId, next)
    setPending(false)
    if (result?.error) {
      toast.error('Save failed', result.error)
    } else {
      setTemplates(next)
      toast.success('Templates saved')
      closeEdit()
    }
  }

  const handleSaveEdit = () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      toast.error('Name required', 'Template name cannot be empty')
      return
    }
    const existing = templates.find((t) => t.id === editing.id)
    const others = templates.filter((t) => t.id !== editing.id)
    if (!existing && others.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Duplicate name', 'A template with this name already exists')
      return
    }
    const normalized: RecordTemplate = {
      ...editing,
      name,
      contentSchema: {
        ...editing.contentSchema,
        notes: sanitizeRecordNotesHtml(editing.contentSchema.notes ?? ''),
        customFields: editing.contentSchema.customFields ?? [],
      },
    }
    if (existing) {
      saveTemplates(templates.map((t) => (t.id === editing.id ? normalized : t)))
    } else {
      saveTemplates([...templates, normalized])
    }
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this template?')) return
    saveTemplates(templates.filter((t) => t.id !== id))
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Record Templates</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              Define reusable structures to prefill the Create Record form. System templates are available when
              creating a record (Browse templates).
            </span>
            <Link
              href={`/studies/${studyId}/records/new`}
              className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open create record to browse system templates
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!studyIsActive && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Templates are read-only because this study is not active.
            </p>
          )}
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAdd}
              disabled={!studyIsActive}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add template
            </Button>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet. Add one to get started.</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                >
                  <div>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.contentSchema.customFields?.length ?? 0} custom field(s)
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(t)}
                      aria-label="Edit template"
                      disabled={!studyIsActive}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(t.id)}
                      aria-label="Delete template"
                      disabled={!studyIsActive}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templates.some((t) => t.id === editing?.id) ? 'Edit template' : 'Add template'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <TemplateEditForm
              template={editing}
              onChange={setEditing}
              onAddField={() => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = [
                    ...(schema.customFields ?? []),
                    { name: '', type: 'text' as CustomFieldType, value: '' },
                  ]
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
              onRemoveField={(idx) => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = schema.customFields?.filter((_, i) => i !== idx) ?? []
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
              onUpdateField={(idx, updates) => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = (schema.customFields ?? []).map((f, i) =>
                    i === idx ? normalizeFieldUpdate(f, updates) : f
                  )
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
              onUpdateListDefaultItem={(fieldIdx, itemIdx, text) => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = (schema.customFields ?? []).map((f, i) => {
                    if (i !== fieldIdx || f.type !== 'list') return f
                    const items = [...getListDefaultItems(f)]
                    items[itemIdx] = text
                    return { ...f, value: items }
                  })
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
              onAddListDefaultItem={(fieldIdx) => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = (schema.customFields ?? []).map((f, i) => {
                    if (i !== fieldIdx || f.type !== 'list') return f
                    return { ...f, value: [...getListDefaultItems(f), ''] }
                  })
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
              onRemoveListDefaultItem={(fieldIdx, itemIdx) => {
                setEditing((prev) => {
                  if (!prev) return prev
                  const schema = prev.contentSchema
                  const customFields = (schema.customFields ?? []).map((f, i) => {
                    if (i !== fieldIdx || f.type !== 'list') return f
                    const items = getListDefaultItems(f).filter((_, j) => j !== itemIdx)
                    return { ...f, value: items.length ? items : [''] }
                  })
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={pending || !studyIsActive}
            >
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function normalizeFieldUpdate(
  f: RecordTemplateCustomFieldDef,
  updates: Partial<RecordTemplateCustomFieldDef>
): RecordTemplateCustomFieldDef {
  const next: RecordTemplateCustomFieldDef = { ...f, ...updates }
  const t = updates.type
  if (t === 'list') {
    return { ...next, type: 'list', value: Array.isArray(next.value) ? next.value : [''] }
  }
  if (t != null) {
    return { ...next, type: t, value: typeof next.value === 'string' ? next.value : '' }
  }
  return next
}

interface TemplateEditFormProps {
  template: RecordTemplate
  onChange: (t: RecordTemplate) => void
  onAddField: () => void
  onRemoveField: (idx: number) => void
  onUpdateField: (idx: number, updates: Partial<RecordTemplateCustomFieldDef>) => void
  onUpdateListDefaultItem: (fieldIdx: number, itemIdx: number, text: string) => void
  onAddListDefaultItem: (fieldIdx: number) => void
  onRemoveListDefaultItem: (fieldIdx: number, itemIdx: number) => void
}

function TemplateEditForm({
  template,
  onChange,
  onAddField,
  onRemoveField,
  onUpdateField,
  onUpdateListDefaultItem,
  onAddListDefaultItem,
  onRemoveListDefaultItem,
}: TemplateEditFormProps) {
  const schema = template.contentSchema
  const customFields = schema.customFields ?? []

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="template-name">Template name *</Label>
        <Input
          id="template-name"
          value={template.name}
          onChange={(e) => onChange({ ...template, name: e.target.value })}
          placeholder="e.g. Lab Report, CRF Section A"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="template-title">Default title</Label>
        <Input
          id="template-title"
          value={schema.title ?? ''}
          onChange={(e) => onChange({ ...template, contentSchema: { ...schema, title: e.target.value } })}
          placeholder="Optional default"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="template-summary">Default summary</Label>
        <Input
          id="template-summary"
          value={schema.summary ?? ''}
          onChange={(e) => onChange({ ...template, contentSchema: { ...schema, summary: e.target.value } })}
          placeholder="Optional default"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="template-notes-editor">Default notes</Label>
        <p className="mb-1 text-xs text-muted-foreground">Rich text defaults for new records using this template.</p>
        <RecordNotesEditor
          id="template-notes-editor"
          editorKey={template.id}
          value={schema.notes ?? ''}
          onChange={(html) =>
            onChange({ ...template, contentSchema: { ...schema, notes: html } })
          }
        />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label>Custom fields</Label>
          <Button type="button" variant="outline" size="sm" onClick={onAddField}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
        {customFields.map((f, idx) => (
          <div key={idx} className="flex flex-col gap-2 rounded border p-2">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-0">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="field_name"
                  value={f.name}
                  onChange={(e) => onUpdateField(idx, { name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="w-28">
                <Label className="text-xs">Type</Label>
                <select
                  value={f.type}
                  onChange={(e) => {
                    const type = e.target.value as CustomFieldType
                    if (type === 'list') {
                      onUpdateField(idx, { type, value: [''] })
                    } else if (type === 'boolean') {
                      onUpdateField(idx, { type, value: '' })
                    } else {
                      onUpdateField(idx, { type, value: '' })
                    }
                  }}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
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
                onClick={() => onRemoveField(idx)}
                aria-label="Remove field"
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {f.type === 'list' ? (
              <div className="pl-1">
                <Label className="text-xs">Default list items</Label>
                <ul className="mt-1 space-y-2">
                  {getListDefaultItems(f).map((item, itemIdx) => (
                    <li key={itemIdx} className="flex gap-2">
                      <Input
                        value={item}
                        onChange={(e) => onUpdateListDefaultItem(idx, itemIdx, e.target.value)}
                        placeholder={`Item ${itemIdx + 1}`}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveListDefaultItem(idx, itemIdx)}
                        disabled={getListDefaultItems(f).length <= 1}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onAddListDefaultItem(idx)}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add item
                </Button>
              </div>
            ) : f.type === 'boolean' ? (
              <div>
                <Label className="text-xs">Default value</Label>
                <select
                  value={typeof f.value === 'string' ? f.value : ''}
                  onChange={(e) => onUpdateField(idx, { value: e.target.value })}
                  className="mt-1 flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Default value</Label>
                <Input
                  value={typeof f.value === 'string' ? f.value : ''}
                  onChange={(e) => onUpdateField(idx, { value: e.target.value })}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
