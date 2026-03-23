import type { ReactNode } from 'react'
import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'
import type { CustomFieldType } from '@/lib/types'

function inferLabelType(value: unknown): CustomFieldType {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'list'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  return 'text'
}

function formatValue(value: unknown, type: CustomFieldType): ReactNode {
  if (type === 'list' && Array.isArray(value)) {
    return (
      <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
        {(value as string[]).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null || value === undefined) return '—'
  return String(value)
}

const KNOWN = new Set(['title', 'summary', 'notes'])

export interface RecordContentSummaryProps {
  content: Record<string, unknown>
}

/**
 * Human-readable record content for read-only views (sanitized rich notes).
 */
export default function RecordContentSummary({ content }: RecordContentSummaryProps) {
  const title = typeof content.title === 'string' ? content.title : ''
  const summary = typeof content.summary === 'string' ? content.summary : ''
  const rawNotes = typeof content.notes === 'string' ? content.notes : ''
  const notesHtml = sanitizeRecordNotesHtml(rawNotes)

  const extras: { key: string; value: unknown; type: CustomFieldType }[] = []
  for (const [k, v] of Object.entries(content)) {
    if (KNOWN.has(k)) continue
    extras.push({ key: k, value: v, type: inferLabelType(v) })
  }

  return (
    <div className="space-y-4 text-sm">
      {title ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</h3>
          <p className="mt-1 font-medium text-foreground">{title}</p>
        </div>
      ) : null}
      {summary ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</h3>
          <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{summary}</p>
        </div>
      ) : null}
      {notesHtml ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
          <div
            className="record-notes-prose mt-1 max-w-none text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert [&_ul]:my-1 [&_ol]:my-1"
            dangerouslySetInnerHTML={{ __html: notesHtml }}
          />
        </div>
      ) : null}
      {extras.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom fields</h3>
          <dl className="mt-2 space-y-3">
            {extras.map(({ key, value, type }) => (
              <div key={key} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  {key}
                  <span className="ml-2 font-normal opacity-70">({type})</span>
                </dt>
                <dd className="mt-1">{formatValue(value, type)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {!title && !summary && !notesHtml && extras.length === 0 ? (
        <p className="text-muted-foreground">No structured content in this version.</p>
      ) : null}
    </div>
  )
}
