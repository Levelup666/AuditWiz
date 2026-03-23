'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SYSTEM_RECORD_TEMPLATES,
  getRecommendedSystemTemplates,
  type RecordTemplateDefinition,
} from '@/lib/record-system-templates'
import { RECORD_CUSTOM_FIELD_OPTIONS } from '@/lib/record-content-form'
import type { RecordTemplate, RecordTemplateContentSchema } from '@/lib/types'
import { stripHtmlToPlainText } from '@/lib/sanitize-html'

function fieldTypeLabel(type: string): string {
  return RECORD_CUSTOM_FIELD_OPTIONS.find((o) => o.value === type)?.label ?? type
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function PreviewBody({
  name,
  description,
  schema,
}: {
  name: string
  description?: string
  schema: RecordTemplateContentSchema
}) {
  const fields = schema.customFields ?? []
  const notesPlain = stripHtmlToPlainText(schema.notes ?? '')

  return (
    <div className="space-y-3 text-sm">
      {description ? <p className="text-muted-foreground">{description}</p> : null}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Defaults</h4>
        <dl className="mt-1 space-y-1">
          <div>
            <dt className="text-muted-foreground">Title</dt>
            <dd>{schema.title?.trim() ? truncate(schema.title, 120) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Summary</dt>
            <dd>{schema.summary?.trim() ? truncate(schema.summary, 200) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{notesPlain ? truncate(notesPlain, 400) : '—'}</dd>
          </div>
        </dl>
      </div>
      {fields.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Custom fields</h4>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1 pr-2 font-medium">Name</th>
                <th className="py-1 pr-2 font-medium">Type</th>
                <th className="py-1 font-medium">Default</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1 pr-2 font-mono">{f.name || '—'}</td>
                  <td className="py-1 pr-2">{fieldTypeLabel(f.type)}</td>
                  <td className="py-1 text-muted-foreground">
                    {f.type === 'list' && Array.isArray(f.value)
                      ? truncate(f.value.join(', '), 60)
                      : typeof f.value === 'string'
                        ? truncate(f.value, 60)
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export interface RecordTemplateBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studyTemplates: RecordTemplate[]
  primaryResearchField: string | null
  onApplySchema: (schema: RecordTemplateContentSchema) => void
}

export default function RecordTemplateBrowser({
  open,
  onOpenChange,
  studyTemplates,
  primaryResearchField,
  onApplySchema,
}: RecordTemplateBrowserProps) {
  const [preview, setPreview] = useState<
    | { kind: 'system'; def: RecordTemplateDefinition }
    | { kind: 'study'; template: RecordTemplate }
    | null
  >(null)

  const recommended = getRecommendedSystemTemplates(primaryResearchField)
  const recommendedIds = new Set(recommended.map((r) => r.id))
  const otherSystemTemplates = SYSTEM_RECORD_TEMPLATES.filter((d) => !recommendedIds.has(d.id))

  function applySchema(schema: RecordTemplateContentSchema) {
    onApplySchema({
      ...schema,
      customFields: [...(schema.customFields ?? [])],
    })
    setPreview(null)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Browse record templates</DialogTitle>
            <DialogDescription>
              System templates match common research setups. Study templates are defined in settings. Preview
              before applying; you can still edit everything after.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {primaryResearchField && recommended.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Recommended for your institution</h3>
                <ul className="space-y-2">
                  {recommended.map((def) => (
                    <li
                      key={def.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-medium">{def.name}</span>
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          System
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{def.shortDescription}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setPreview({ kind: 'system', def })}>
                          Preview
                        </Button>
                        <Button type="button" size="sm" onClick={() => applySchema(def.contentSchema)}>
                          Use
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">
                {recommended.length > 0 ? 'More system templates' : 'All system templates'}
              </h3>
              <ul className="space-y-2">
                {(recommended.length > 0 ? otherSystemTemplates : SYSTEM_RECORD_TEMPLATES).map((def) => (
                  <li
                    key={def.id}
                    className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium">{def.name}</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        System
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{def.shortDescription}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setPreview({ kind: 'system', def })}>
                        Preview
                      </Button>
                      <Button type="button" size="sm" onClick={() => applySchema(def.contentSchema)}>
                        Use
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Study templates</h3>
              {studyTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No study templates yet. Admins can add them under Study settings, or save the current form as a template.
                </p>
              ) : (
                <ul className="space-y-2">
                  {studyTemplates.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-medium">{t.name}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Study
                        </Badge>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setPreview({ kind: 'study', template: t })}>
                          Preview
                        </Button>
                        <Button type="button" size="sm" onClick={() => applySchema(t.contentSchema)}>
                          Use
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview?.kind === 'system' ? preview.def.name : preview?.kind === 'study' ? preview.template.name : 'Preview'}
            </DialogTitle>
            {preview?.kind === 'system' ? (
              <DialogDescription>{preview.def.shortDescription}</DialogDescription>
            ) : null}
          </DialogHeader>
          {preview?.kind === 'system' ? (
            <PreviewBody name={preview.def.name} description={preview.def.shortDescription} schema={preview.def.contentSchema} />
          ) : preview?.kind === 'study' ? (
            <PreviewBody name={preview.template.name} schema={preview.template.contentSchema} />
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              Close
            </Button>
            {preview?.kind === 'system' ? (
              <Button type="button" onClick={() => applySchema(preview.def.contentSchema)}>
                Use template
              </Button>
            ) : preview?.kind === 'study' ? (
              <Button type="button" onClick={() => applySchema(preview.template.contentSchema)}>
                Use template
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
