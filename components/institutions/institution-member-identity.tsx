type InstitutionMemberIdentityProps = {
  displayName: string
  email?: string
  title?: string | null
  /** Show email on a second line when distinct from display name */
  showEmail?: boolean
  className?: string
}

export function institutionMemberPrimaryLabel(
  displayName: string | null | undefined,
  email?: string | null
): string {
  const name = displayName?.trim()
  if (name) return name
  const em = email?.trim()
  if (em && em !== 'Email unavailable') return em
  return 'Unknown member'
}

/** Name with optional job title (institution_members.title) and email. */
export default function InstitutionMemberIdentity({
  displayName,
  email,
  title,
  showEmail = true,
  className = '',
}: InstitutionMemberIdentityProps) {
  const primary = institutionMemberPrimaryLabel(displayName, email)
  const trimmedTitle = title?.trim() || null
  const emailLine =
    showEmail && email && email !== 'Email unavailable' && email !== primary ? email : null

  return (
    <div className={className}>
      <div className="font-medium">{primary}</div>
      {trimmedTitle ? (
        <div className="text-xs text-muted-foreground mt-0.5">{trimmedTitle}</div>
      ) : null}
      {emailLine ? <div className="text-sm text-muted-foreground mt-0.5">{emailLine}</div> : null}
    </div>
  )
}
