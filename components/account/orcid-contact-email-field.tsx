'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearPendingOrcidContactEmail,
  readPendingOrcidContactEmail,
} from '@/lib/auth/pending-orcid-contact-email'

type OrcidContactEmailFieldProps = {
  orcidDiscoverableEmails: string[]
  orcidEmailRequiresAttestation: boolean
  initialEmail?: string
}

export function OrcidContactEmailField({
  orcidDiscoverableEmails,
  orcidEmailRequiresAttestation,
  initialEmail = '',
}: OrcidContactEmailFieldProps) {
  const [value, setValue] = useState(initialEmail)

  useEffect(() => {
    const pending = readPendingOrcidContactEmail()
    if (pending && !value) {
      setValue(pending)
    }
  }, [value])

  return (
    <div className="space-y-2 max-w-md">
      <Label htmlFor="orcid_contact_email">Contact email *</Label>
      <Input
        id="orcid_contact_email"
        name="orcid_contact_email"
        type="email"
        autoComplete="email"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="you@institution.edu"
        list={orcidDiscoverableEmails.length > 0 ? 'orcid-email-suggestions' : undefined}
      />
      {orcidDiscoverableEmails.length > 0 ? (
        <datalist id="orcid-email-suggestions">
          {orcidDiscoverableEmails.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      ) : null}
      {orcidEmailRequiresAttestation ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            name="orcid_email_attested"
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            I confirm this is the same email address listed on my ORCID account (Account settings
            → Contact info → Email).
          </span>
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Required before you can use invites and notifications. Enter the email on your ORCID
        record.
      </p>
    </div>
  )
}

export function clearOrcidContactEmailPendingOnSuccess() {
  clearPendingOrcidContactEmail()
}
