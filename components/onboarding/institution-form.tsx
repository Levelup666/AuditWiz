'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createInstitution } from '@/app/onboarding/actions'
import { toast } from '@/lib/toast'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function InstitutionForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  useEffect(() => {
    if (!slugManuallyEdited && name) {
      setSlug(slugify(name))
    }
  }, [name, slugManuallyEdited])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const formData = new FormData(e.currentTarget)
    const result = await createInstitution(formData)
    setPending(false)
    if (result?.error) {
      toast.error('Create institution failed', result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div>
        <Label htmlFor="name">Institution name *</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. Acme Research Institute"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="slug">URL slug *</Label>
        <Input
          id="slug"
          name="slug"
          type="text"
          required
          placeholder="acme-research-institute"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugManuallyEdited(true)
          }}
          className="mt-1 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Used in URLs. Letters, numbers, and hyphens only. Auto-generated from name.
        </p>
      </div>
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Brief description of your institution"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="domain">Domain (optional)</Label>
        <Input
          id="domain"
          name="domain"
          type="text"
          placeholder="e.g. university.edu"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          For future email-domain validation.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create institution'}
        </Button>
      </div>
    </form>
  )
}
