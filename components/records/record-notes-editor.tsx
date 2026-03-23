'use client'

import { useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Button } from '@/components/ui/button'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, ListChecks } from 'lucide-react'
import { notesToEditorHtml } from '@/lib/record-notes-html'
import { sanitizeRecordNotesHtml } from '@/lib/sanitize-html'
import { cn } from '@/lib/utils'

function buildExtensions() {
  return [
    StarterKit.configure({
      bulletList: { HTMLAttributes: { class: 'list-disc pl-4 my-1' } },
      orderedList: { HTMLAttributes: { class: 'list-decimal pl-4 my-1' } },
      paragraph: { HTMLAttributes: { class: 'my-1 min-h-[1em]' } },
    }),
    Underline,
    TaskList.configure({ HTMLAttributes: { class: 'not-prose' } }),
    TaskItem.configure({ nested: true, HTMLAttributes: { class: 'flex gap-2' } }),
  ]
}

export interface RecordNotesEditorProps {
  id?: string
  value: string
  onChange: (sanitizedHtml: string) => void
  placeholder?: string
  className?: string
  /** When this changes, the editor remounts with the current `value` (e.g. template applied). */
  editorKey?: string | number
}

export default function RecordNotesEditor({
  id,
  value,
  onChange,
  placeholder = 'Additional notes…',
  className,
  editorKey = 0,
}: RecordNotesEditorProps) {
  const extensions = useMemo(() => buildExtensions(), [])

  const onUpdate = useCallback(
    (html: string) => {
      onChange(sanitizeRecordNotesHtml(html))
    },
    [onChange]
  )

  const initialHtml = notesToEditorHtml(value)

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: initialHtml,
      editorProps: {
        attributes: {
          class: cn(
            'min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'prose prose-sm dark:prose-invert max-w-none [&_ul]:my-1 [&_ol]:my-1'
          ),
          ...(id ? { id } : {}),
          'data-placeholder': placeholder,
        },
      },
      onUpdate: ({ editor: ed }) => {
        onUpdate(ed.getHTML())
      },
    },
    [editorKey]
  )

  if (!editor) {
    return (
      <div
        className={cn(
          'min-h-[120px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground',
          className
        )}
      >
        Loading editor…
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1 rounded-md border border-input bg-muted/40 p-1">
        <Button
          type="button"
          variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('taskList') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          aria-label="Task list"
        >
          <ListChecks className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
