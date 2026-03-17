'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import {
  validateFile,
  FILE_INPUT_ACCEPT,
  MAX_FILE_SIZE_MB,
  SUPPORTED_TYPES_DESCRIPTION,
} from '@/lib/document-upload'

interface DocumentRow {
  id: string
  file_name: string
  file_path: string
  file_hash: string
  file_size: number
  mime_type: string
  uploaded_at: string
}

interface RecordDocumentsProps {
  recordId: string
  studyId: string
  canUpload: boolean
}

export default function RecordDocuments({ recordId, studyId, canUpload }: RecordDocumentsProps) {
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchDocs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/records/${recordId}/documents`)
      if (!res.ok) throw new Error('Failed to load documents')
      const data = await res.json()
      setDocs(data)
    } catch {
      toast.error('Load failed', 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
  }, [recordId])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input?.files?.length) return
    const file = input.files[0]
    const validation = validateFile({
      size: file.size,
      type: file.type || 'application/octet-stream',
      name: file.name,
    })
    if (!validation.valid) {
      toast.error('Upload failed', validation.error)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch(`/api/records/${recordId}/documents`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      input.value = ''
      toast.success('Document uploaded successfully')
      fetchDocs()
    } catch (e) {
      toast.error('Upload failed', e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="doc-file">Upload file</Label>
            <Input
              id="doc-file"
              type="file"
              accept={FILE_INPUT_ACCEPT}
              className="mt-1"
              disabled={uploading}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Max {MAX_FILE_SIZE_MB} MB. {SUPPORTED_TYPES_DESCRIPTION}.
            </p>
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </form>
      )}
      {docs.length === 0 ? (
        <p className="text-sm text-gray-500">No documents attached.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[200px]" title={d.file_name}>
                {d.file_name}
              </span>
              <span className="text-gray-500">{formatSize(d.file_size)}</span>
              <Link
                href={`/api/records/${recordId}/documents/${d.id}/download`}
                className="text-primary hover:underline"
              >
                Download
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
