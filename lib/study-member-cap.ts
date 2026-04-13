/**
 * Per-study member limits: studies.max_members NULL → default from env.
 * Hard ceiling prevents abuse.
 */

const DEFAULT_CAP = 500
const ABSOLUTE_MAX = 10_000

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

export function getPlatformDefaultStudyMemberCap(): number {
  return parsePositiveInt(process.env.STUDY_DEFAULT_MAX_MEMBERS, DEFAULT_CAP)
}

export function getStudyAbsoluteMemberCap(): number {
  return parsePositiveInt(process.env.STUDY_ABSOLUTE_MAX_MEMBERS, ABSOLUTE_MAX)
}

/** Effective cap for a study row (null max_members → platform default, clamped). */
export function getEffectiveStudyMemberCap(study: { max_members: number | null }): number {
  const base = study.max_members ?? getPlatformDefaultStudyMemberCap()
  return Math.min(Math.max(1, base), getStudyAbsoluteMemberCap())
}
