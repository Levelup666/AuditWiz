import { createClient } from '@/lib/supabase/server'

export default async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-gray-900">AuditWiz Platform</h2>
      </div>
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-600">
          <span className="font-medium">{user?.email}</span>
        </div>
      </div>
    </header>
  )
}
