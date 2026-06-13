export const MEMBER_REMOVAL_NOTE_MIN_LENGTH = 10
export const MEMBER_REMOVAL_NOTE_MAX_LENGTH = 2000

export type MemberRemovalNoteResult =
  | { ok: true; note: string }
  | { ok: false; error: string }

export function parseMemberRemovalNote(value: unknown): MemberRemovalNoteResult {
  const note = typeof value === 'string' ? value.trim() : ''
  if (!note) {
    return { ok: false, error: 'A removal note is required for the audit log.' }
  }
  if (note.length < MEMBER_REMOVAL_NOTE_MIN_LENGTH) {
    return {
      ok: false,
      error: `Removal note must be at least ${MEMBER_REMOVAL_NOTE_MIN_LENGTH} characters.`,
    }
  }
  if (note.length > MEMBER_REMOVAL_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Removal note must be at most ${MEMBER_REMOVAL_NOTE_MAX_LENGTH} characters.`,
    }
  }
  return { ok: true, note }
}
