import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignInForm from '@/components/auth/signin-form'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/studies')
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
        </div>
        <SignInForm redirectedFrom={params.redirectedFrom} />
      </div>
    </div>
  )
}
