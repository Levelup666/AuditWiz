import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  pathBypassesOrcidEmailGate,
  userNeedsOrcidEmailGateRedirect,
} from '@/lib/auth/orcid-email-gate'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    // Protect dashboard/study routes - require authentication
    if (
      pathname.startsWith('/studies') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/logs')
    ) {
      if (!user) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/signin'
        url.searchParams.set('redirectedFrom', pathname)
        return NextResponse.redirect(url)
      }
    }

    // ORCID-primary users without contact email must complete account setup first
    if (user && !pathBypassesOrcidEmailGate(pathname)) {
      const needsEmailSetup = await userNeedsOrcidEmailGateRedirect(supabase, user.id, user)
      if (needsEmailSetup) {
        const url = request.nextUrl.clone()
        url.pathname = '/account/setup'
        url.searchParams.set('orcid_email_required', '1')
        const nextPath = pathname + request.nextUrl.search
        url.searchParams.set('next', nextPath || '/onboarding')
        return NextResponse.redirect(url)
      }
    }

    // Redirect authenticated users away from auth pages (not signin/signup: hash fragments
    // are invisible to the server; the client must parse #access_token and route invites).
    if (pathname.startsWith('/auth')) {
      const skipForHashClient =
        pathname === '/auth/signin' ||
        pathname === '/auth/signup' ||
        pathname === '/auth/callback'
      if (user && !skipForHashClient) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  } catch (error) {
    console.error('Proxy error:', error)
    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
