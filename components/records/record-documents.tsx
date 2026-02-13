'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

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
  const [error, setError] = useState<string | null>(null)

  const fetchDocs = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/records/${recordId}/documents`)
      if (!res.ok) throw new Error('Failed to load documents')
      const data = await res.json()
      setDocs(data)
    } catch {
      setError('Failed to load documents')
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
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', input.files[0])
      const res = await fetch(`/api/records/${recordId}/documents`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      input.value = ''
      fetchDocs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
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
    return <p className="text-sm text-gray-500">Loading documents…</p>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {canUpload && (
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="doc-file">Upload file</Label>
            <Input
              id="doc-file"
              type="file"
              className="mt-1"
              disabled={uploading}
            />
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
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
