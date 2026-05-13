import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AuditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin?redirectedFrom=/auditor')

  return <main className="flex-1 overflow-y-auto">{children}</main>
}
