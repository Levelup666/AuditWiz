/**
 * Declarations for Next.js subpath modules when the package omits some .d.ts files.
 * Covers next, next/server, next/server.js, and next/types.js used by API routes and app.
 */
declare module 'next' {
  export interface Metadata {
    title?: string | { default: string; template?: string }
    description?: string
    [key: string]: unknown
  }
  export interface NextConfig {
    [key: string]: unknown
  }
}
declare module 'next/server' {
  export interface NextURL extends URL {
    clone(): NextURL
  }
  export class NextRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit)
    readonly url: string
    readonly nextUrl: NextURL
    readonly cookies: {
      getAll(): { name: string; value: string }[]
      set(name: string, value: string): void
    }
  }

  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse
    static next(init?: { request: NextRequest }): NextResponse
    static redirect(url: URL | string): NextResponse
    readonly cookies: {
      set(name: string, value: string, options?: unknown): void
    }
  }
}

declare module 'next/server.js' {
  export interface NextURL extends URL {
    clone(): NextURL
  }
  export class NextRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit)
    readonly url: string
    readonly nextUrl: NextURL
    readonly cookies: {
      getAll(): { name: string; value: string }[]
      set(name: string, value: string): void
    }
  }

  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse
    static next(init?: { request: Request }): NextResponse
    static redirect(url: URL | string): NextResponse
    readonly cookies: {
      set(name: string, value: string, options?: unknown): void
    }
  }
}

declare module 'next/types.js' {
  export interface Metadata {
    title?: string | { default: string; template?: string }
    description?: string
    [key: string]: unknown
  }
  export type ResolvingMetadata = (parent: Promise<Metadata>) => Promise<Metadata>
  export type ResolvingViewport = (parent: Promise<unknown>) => Promise<unknown>
}
