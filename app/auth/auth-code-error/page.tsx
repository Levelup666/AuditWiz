import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            There was an error during authentication. This may happen if:
          </p>
          <ul className="mt-4 text-left text-sm text-gray-600 list-disc list-inside space-y-2">
            <li>The authentication code has expired</li>
            <li>The authentication code was already used</li>
            <li>There was a network error</li>
          </ul>
        </div>
        <div className="space-y-4">
          <Link href="/auth/signin" className="block">
            <Button className="w-full">Try Signing In Again</Button>
          </Link>
          <Link href="/" className="block">
            <Button variant="outline" className="w-full">
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
