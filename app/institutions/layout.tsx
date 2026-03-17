import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InstitutionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  return <main className="flex-1 overflow-y-auto">{children}</main>
}
