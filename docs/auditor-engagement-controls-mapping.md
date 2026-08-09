# Auditor engagement controls mapping (Phase 5 + redesign)

This document maps AuditWiz audit-engagement features to familiar **control language** used in research integrity and access-governance discussions.

It is a **design / architecture reference for the team**. It is **not** a claim of regulatory compliance (GCP, FDA 21 CFR Part 11, ISO, SOC, or otherwise). Do not surface this mapping as marketing copy in the product UI.

---

## Control themes → product mechanisms

| Control theme | What it means here | Implemented by |
|---|---|---|
| **Unique identification** | Auditor actions are attributable to a specific authenticated person and engagement identity | Auth user (`auditor_user_id`); email-bound invite; attested firm / title / reference ID; ORCID when linked |
| **Authority** | Access is granted by an authorized institutional actor, not self-asserted | Institution admin issuance (`canManageInstitution`); `granted_by`; required engagement letter PDF; `audit_engagement_granted` |
| **Acceptance / attestation** | The invitee consciously accepts scope and identity statements | Guided `/invites/audit/[id]` funnel; credentials + attestation; letter acknowledgment; `accept_audit_engagement` RPC |
| **Conflict awareness** | Conflicts are disclosed (or explicitly cleared) at accept | `coi_has_conflict`, optional `coi_disclosure`, hashed statement |
| **Scope limitation** | Access is bounded by purpose, studies, and time | `scope`, `audit_engagement_studies`, `starts_at` / `expires_at`, revoke; SELECT-only RLS |
| **Separation of duties** | Auditors are not study collaborators; dual-role writes are sandboxed | Engagements ≠ `study_members`; eligibility blocks same-institution members; `active_context=auditor` blocks member write APIs |
| **Containerized review UX** | Deep review does not mount member write chrome | `/auditor/engagements/...` study/record routes; redirects from member URLs when auditor shell applies |
| **Audit trail** | Significant actions leave append-only evidence | `audit_engagement_*` events including per-surface access and export |
| **Trust artifacts** | Scope agreement and identity proofs are retained with integrity hashes | Engagement letter PDF + file hash; attestation / COI hashes; evidence pack with document hashes + manifest hash |
| **Tooling without UI privilege creep** | Firms can integrate read-only without member write paths | Read-only auditor API under `/api/auditor/engagements/...` |

---

## Event coverage (audit trail checklist)

| Event | When |
|---|---|
| `audit_engagement_granted` | Institution admin issues engagement |
| `invite_created` / `invite_resent` / `invite_revoked` | Invite lifecycle |
| `audit_engagement_letter_uploaded` | Scope / engagement letter PDF attached (immutable; no replace) |
| `audit_engagement_accepted` | Auditor accepts via RPC with credentials + COI |
| `invite_accepted` | Parallel invite ledger event |
| `audit_engagement_accessed` | Hub / study / record view (deduped per surface+entity per session) |
| `audit_engagement_export` | Evidence pack download |
| `audit_engagement_extended` / `revoked` / `expired` | Window changes / end of life / re-issue supersede |

---

## Explicit non-claims

- Mapping a feature to a control theme does **not** make AuditWiz “Part 11 compliant,” “validated,” or “certified.”
- COI declaration is an integrity disclosure captured at accept — not legal advice, not a COI management program.
- Engagement letters are integrity-hashed artifacts; AuditWiz does not replace institutional contracting workflows.
- Read-only API access still requires an authenticated session for the engagement invitee; it is not anonymous or public.
- Dual-role sandbox depends on the `auditwiz_active_context` cookie plus API/proxy enforcement — switch to Member context to perform writes.

---

## Related code

- Corpus / API / routes inventory: `lib/auditor/auditable-corpus.ts`
- Eligibility: `lib/auditor/auditor-invite-eligibility.ts`
- Credentials / COI: `lib/auditor/auditor-credentials.ts`, `lib/auditor/auditor-coi.ts`
- Session context + write sandbox: `lib/auditor/active-context.ts`, `lib/auditor/assert-member-writes-allowed.ts`
- Accept RPC client: `lib/invites/accept-audit-engagement.ts`
- Review route helpers: `lib/auditor/auditor-review-routes.ts`
