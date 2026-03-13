'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { generateSignatureHash } from '@/lib/crypto'
import { SignatureIntent } from '@/lib/types'
import { toast } from '@/lib/toast'

interface SignRecordButtonProps {
  studyId: string
  record: {
    id: string
    record_number: string
    version: number
    status: string
  }
}

export default function SignRecordButton({ studyId, record }: SignRecordButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [intent, setIntent] = useState<SignatureIntent>('approval')
  const [password, setPassword] = useState('')

  const handleSign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      toast.error('Authentication required', 'Please sign in again.')
      return
    }

    if (!password.trim()) {
      toast.error('Validation error', 'Password is required to create a signature.')
      return
    }

    // Re-authenticate with password before signing
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    })

    if (reAuthError) {
      toast.error('Authentication failed', reAuthError.message === 'Invalid login credentials' ? 'Invalid password.' : reAuthError.message)
      return
    }

    setLoading(true)

    try {
      const timestamp = new Date().toISOString()
      const signatureHash = await generateSignatureHash(
        record.id,
        record.version,
        user.id,
        intent,
        timestamp
      )

      const ipAddress = await fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => data.ip)
        .catch(() => null)
      const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : null

      const res = await fetch(`/api/records/${record.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          signature_hash: signatureHash,
          ip_address: ipAddress,
          user_agent: userAgent,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create signature')
      }

      setOpen(false)
      toast.success('Signature created successfully')
      router.refresh()
    } catch (err: unknown) {
      toast.error('Signing failed', err instanceof Error ? err.message : 'Failed to create signature')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Sign Record</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSign}>
          <DialogHeader>
            <DialogTitle>Electronic Signature</DialogTitle>
            <DialogDescription>
              Provide your signature for Record {record.record_number} (Version {record.version}).
              This action is cryptographically verifiable and permanently recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="signature-intent">Signature Intent</Label>
              <select
                id="signature-intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value as SignatureIntent)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="review">Review</option>
                <option value="approval">Approval</option>
                <option value="amendment">Amendment</option>
                <option value="rejection">Rejection</option>
              </select>
            </div>
            <div>
              <Label htmlFor="password">Re-authenticate</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                placeholder="Enter your password to confirm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Your password is required to create a signature.
              </p>
            </div>
            <div className="rounded-md bg-blue-50 p-3">
              <p className="text-xs text-blue-800">
                By signing, you acknowledge that this action is legally binding and will be
                permanently recorded in the audit trail.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Signing...' : 'Create Signature'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
