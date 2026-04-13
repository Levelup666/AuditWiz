import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignInForm from '@/components/auth/signin-form'
import { AuthHashRedirect } from '@/components/auth/auth-hash-redirect'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string; inviteNotice?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to AuditWiz
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Clinical-ready research auditing platform
          </p>
          {params.inviteNotice && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {params.inviteNotice}
            </p>
          )}
        </div>
        <AuthHashRedirect redirectedFrom={params.redirectedFrom}>
          <SignInForm redirectedFrom={params.redirectedFrom} />
        </AuthHashRedirect>
      </div>
    </div>
  )
}
