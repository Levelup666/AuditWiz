'use client'

import Link from 'next/link'

const ORCID_URL = 'https://orcid.org'

interface OrcidBadgeProps {
  orcidId: string
  verified?: boolean
  showId?: boolean
  className?: string
}

/**
 * ORCID badge for attribution. Links to orcid.org profile.
 * Display beside contributor names per project rules.
 */
export default function OrcidBadge({
  orcidId,
  verified = false,
  showId = false,
  className = '',
}: OrcidBadgeProps) {
  const href = `${ORCID_URL}/${orcidId}`
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded border border-[#a6ce39] bg-[#a6ce39] px-1.5 py-0.5 text-white hover:bg-[#96b830]"
        title={`ORCID: ${orcidId}${verified ? ' (verified)' : ''}`}
        aria-label={`ORCID ${orcidId}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          className="h-4 w-4"
          fill="currentColor"
          aria-hidden
        >
          <path d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z" />
          <path
            fill="#fff"
            d="M86.3 186.2H70.9V79.1h15.4v107.1zm0-133.3H70.9V41.6h15.4v11.3zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-54.8 53.6h-41.3V79.1zm0 107.1V92.4h42.2c34.1 0 42.2 17.4 42.2 34.3 0 18.8-8.1 34.3-42.2 34.3h-42.2zm97.2-70.5h-15.4v70.5h15.4v-70.5zm0-11.3h-15.4V41.6h15.4v11.3z"
          />
        </svg>
      </Link>
      {verified && (
        <span className="text-xs text-green-600" title="Verified">
          ✓
        </span>
      )}
      {showId && (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:underline"
        >
          {orcidId}
        </Link>
      )}
    </span>
  )
}
