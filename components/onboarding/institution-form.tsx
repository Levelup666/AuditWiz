'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createInstitution } from '@/app/onboarding/actions'
import { toast } from '@/lib/toast'
import { INSTITUTION_RESEARCH_TYPES } from '@/lib/institution-research-types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function InstitutionForm({
  initialFirstName = '',
  initialLastName = '',
}: {
  initialFirstName?: string
  initialLastName?: string
}) {
  const [pending, setPending] = useState(false)
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">Your first name *</Label>
          <Input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="last_name">Your last name *</Label>
          <Input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown to collaborators as First L. in member lists unless you set a nickname later in account
        settings.
      </p>
      <div>
        <Label htmlFor="research_field">Primary research field *</Label>
        <select
          id="research_field"
          name="research_field"
          required
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select a research area
          </option>
          {INSTITUTION_RESEARCH_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Describes the main domain your institution works in. You can choose &quot;Other / general
          research&quot; if none of the categories fit.
        </p>
      </div>
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
      <div>
        <Label htmlFor="allow_external_collaborators">Study collaborators *</Label>
        <select
          id="allow_external_collaborators"
          name="allow_external_collaborators"
          required
          defaultValue="true"
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="true">
            Allow external collaborators (people can be on a study without joining the institution)
          </option>
          <option value="false">
            Institution members only (everyone on a study must belong to this institution)
          </option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          You can change this later in institution settings. Switching to &quot;members only&quot; is blocked while
          external collaborators remain on any study under this institution.
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
