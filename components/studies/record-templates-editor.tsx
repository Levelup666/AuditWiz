'use client'

import { useState } from 'react'
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
import type { RecordTemplate, CustomFieldType } from '@/lib/types'

const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
]

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

interface RecordTemplatesEditorProps {
  studyId: string
  initialTemplates: RecordTemplate[]
}

export default function RecordTemplatesEditor({
  studyId,
  initialTemplates,
}: RecordTemplatesEditorProps) {
  const [templates, setTemplates] = useState<RecordTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<RecordTemplate | null>(null)
  const [pending, setPending] = useState(false)

  const openAdd = () => {
    setEditing(emptyTemplate())
  }

  const openEdit = (t: RecordTemplate) => {
    setEditing({ ...t, contentSchema: { ...t.contentSchema } })
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
    if (existing) {
      saveTemplates(
        templates.map((t) =>
          t.id === editing.id
            ? { ...editing, name, contentSchema: { ...editing.contentSchema } }
            : t
        )
      )
    } else {
      saveTemplates([...templates, { ...editing, name, contentSchema: { ...editing.contentSchema } }])
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
          <CardDescription>
            Define reusable structures to prefill the Create Record form. Users can start from a template or blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <Button type="button" variant="outline" size="sm" onClick={openAdd}>
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
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(t.id)}
                      aria-label="Delete template"
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
                  const customFields = [...(schema.customFields ?? []), { name: '', type: 'text' as CustomFieldType, value: '' }]
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
                    i === idx ? { ...f, ...updates } : f
                  )
                  return { ...prev, contentSchema: { ...schema, customFields } }
                })
              }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={pending}>
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface TemplateEditFormProps {
  template: RecordTemplate
  onChange: (t: RecordTemplate) => void
  onAddField: () => void
  onRemoveField: (idx: number) => void
  onUpdateField: (idx: number, updates: Partial<{ name: string; type: CustomFieldType; value: string }>) => void
}

function TemplateEditForm({
  template,
  onChange,
  onAddField,
  onRemoveField,
  onUpdateField,
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
        <Label htmlFor="template-notes">Default notes</Label>
        <Input
          id="template-notes"
          value={schema.notes ?? ''}
          onChange={(e) => onChange({ ...template, contentSchema: { ...schema, notes: e.target.value } })}
          placeholder="Optional default"
          className="mt-1"
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
          <div key={idx} className="flex gap-2 items-end rounded border p-2">
            <div className="flex-1 min-w-0">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="field_name"
                value={f.name}
                onChange={(e) => onUpdateField(idx, { name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="w-24">
              <Label className="text-xs">Type</Label>
              <select
                value={f.type}
                onChange={(e) => onUpdateField(idx, { type: e.target.value as CustomFieldType })}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {CUSTOM_FIELD_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-xs">Default value</Label>
              {f.type === 'boolean' ? (
                <select
                  value={f.value ?? ''}
                  onChange={(e) => onUpdateField(idx, { value: e.target.value })}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <Input
                  value={f.value ?? ''}
                  onChange={(e) => onUpdateField(idx, { value: e.target.value })}
                  placeholder="Optional"
                  className="mt-1"
                />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemoveField(idx)}
              aria-label="Remove field"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
