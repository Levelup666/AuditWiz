'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** After server sets auth.users.email, refresh JWT so RLS email claims match. */
export function OrcidSessionRefreshOnQuery() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (searchParams.get('orcid_session_refresh') !== '1') return
    ran.current = true

    const supabase = createClient()
    void supabase.auth.refreshSession().then(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete('orcid_session_refresh')
      const target = url.pathname + (url.search || '')
      router.replace(target)
    })
  }, [searchParams, router])

  return null
}
