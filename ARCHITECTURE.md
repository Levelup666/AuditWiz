# Clinical-Ready Architecture Documentation

## Overview

This document explains the architectural decisions and design patterns used in AuditWiz to achieve "clinical-ready by design" without implementing full clinical workflows or PHI handling.

## Core Principles Implementation

### 1. Immutability

**Records are Immutable**
- Records table: No UPDATE allowed on content after creation
- Amendments create new `records` rows with incremented `version`
- `previous_version_id` links versions in a chain
- Content hash (SHA-256) ensures integrity

**Audit Events are Append-Only**
- `audit_events` table: No UPDATE or DELETE policies
- Only `create_audit_event()` RPC function can insert
- Events include state hashes (before/after) for verification

### 2. Attribution

**Every Action is Attributed**
- All audit events include `actor_id` (user or system)
- `actor_role_at_time` preserves historical role information
- Signatures include signer ID, timestamp, IP, user agent
- System actions use `SYSTEM_ACTOR_ID` constant

**Re-authentication for Signatures**
- Users must re-enter password before signing
- Signature hash combines: record ID, version, signer ID, intent, timestamp
- This prevents unauthorized signature creation

### 3. Study-Scoped RBAC

**Roles are Study-Specific**
- `study_members` table: One user can have different roles in different studies
- Roles: `creator`, `reviewer`, `approver`, `auditor`, `admin`
- Permissions checked via `get_user_study_role()` function
- RLS policies enforce access at database level

**Permission Hierarchy**
- `creator`: Can create records
- `reviewer`: Can view and review records
- `approver`: Can approve records and sign
- `auditor`: Full read access, audit capabilities
- `admin`: Full control, can manage members

### 4. Versioning & Amendments

**Version Chain**
- Records linked via `previous_version_id`
- Version history viewable via `record_version_history` view
- Amendments require `amendment_reason` (mandatory)
- UI prevents inline editing - only "Amend" action available

**Content Integrity**
- Each version has `content_hash` (SHA-256 of content JSON)
- Hashes verified when viewing records
- Previous/next state hashes stored in audit events

### 5. Electronic Signatures

**Cryptographic Signatures**
- Signature hash = SHA-256(record_id + version + signer_id + intent + timestamp)
- Signatures stored in `signatures` table
- Tied to specific record version (not mutable entity)
- Multiple intents: review, approval, amendment, rejection

**Signature Workflow**
1. User clicks "Sign Record"
2. Re-authentication dialog appears
3. User selects intent and enters password
4. Signature hash generated and stored
5. Audit event created
6. Record status updated if approved

### 6. System/AI Action Transparency

**System Actor**
- `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'`
- Used for all automated/AI actions
- Metadata includes: model_version, input_hash, output_hash

**API Route for System Actions**
- `/api/system-actions` endpoint
- Requires authentication (to track who triggered system action)
- Logs system action with full metadata
- UI clearly labels system-generated content

### 7. Blockchain Anchoring (Stub)

**Design for Future**
- `blockchain_anchors` table ready
- `anchorRecordToBlockchain()` function stub
- Intended for finalized approvals only
- Will integrate with Alchemy RPC when implemented

## Database Schema Decisions

### Why UUIDs?
- Globally unique identifiers
- No sequential IDs that reveal record count
- Better for distributed systems

### Why JSONB for Metadata?
- Flexible schema for future extensibility
- Indexed for query performance
- Allows adding fields without migrations

### Why Separate Signature Table?
- Signatures are entities themselves (not just fields)
- Multiple signatures per record version
- Different intents per signature
- Full audit trail of signature creation

### Why Denormalized Fields?
- `record_version` in signatures table (denormalized)
- Improves query performance
- Version is immutable once set

## Security Architecture

### Row Level Security (RLS)
- All tables have RLS enabled
- Policies enforce study membership
- Users can only access studies they belong to
- Audit events read-only for members

### Function Security
- `create_audit_event()` uses `SECURITY DEFINER`
- Ensures only system can create audit events
- Prevents client-side manipulation

### Content Hashing
- SHA-256 hashes for all content
- Prevents tampering
- Enables integrity verification

## UI/UX Patterns

### "Amend" vs "Edit"
- UI uses "Amend Record" button (not "Edit")
- Makes immutability clear to users
- Amendment dialog requires reason

### Version History Display
- Chronological version chain
- Current version highlighted
- Links to previous versions
- Amendment reasons shown

### Audit Trail Display
- Chronological list of all events
- System actions clearly marked
- Expandable metadata
- Color-coded by action type

### Signature Display
- List of all signatures for version
- Intent badges (review, approval, etc.)
- Timestamp and signer info
- Signature hash (partial for readability)

## Future Extensibility

### Clinical Research Ready
- Schema supports trial phases (via study status)
- Role structure aligns with clinical roles
- Audit trail meets regulatory audit requirements
- Signature system ready for regulatory approval workflows

### What's NOT Included (By Design)
- PHI handling logic
- Patient data structures
- Regulatory compliance claims
- Full clinical trial workflows

### Extension Points
- Add study phases: `studies.metadata.phases`
- Add record templates: `studies.metadata.record_templates`
- Add approval workflows: `studies.metadata.workflows`
- Add data exports: API route for audit report generation

## Migration Path to Clinical Use

1. **Add PHI Handling** (if needed)
   - Encrypt sensitive fields
   - Add PHI access logging
   - Implement data retention policies

2. **Extend Roles**
   - Add clinical-specific roles
   - Implement delegation
   - Add multi-site support

3. **Add Workflows**
   - Phase transitions
   - Multi-level approvals
   - Conditional routing

4. **Regulatory Features**
   - 21 CFR Part 11 compliance checks
   - Audit report generation
   - Data export formats

## Testing Considerations

### Unit Tests Needed
- Hash generation and verification
- Signature creation and verification
- Permission checking functions
- Audit event creation

### Integration Tests Needed
- Amendment creation flow
- Signature workflow
- RLS policy enforcement
- Version chain traversal

### Audit Trail Verification
- Verify no UPDATE/DELETE possible
- Verify all actions create events
- Verify system actions are marked
- Verify state hashes are correct

## Performance Considerations

### Indexes
- All foreign keys indexed
- Audit events indexed by timestamp and target
- Study members indexed for permission checks

### Query Patterns
- Version chains use recursive CTE
- Latest version computed via window functions
- Audit trails paginated (limit 100 by default)

### Caching Strategy
- User study roles could be cached (with invalidation)
- Version history could be cached per record
- Audit trails rarely change (append-only)

## Compliance Notes

This system is designed to be "clinical-ready by design" but does NOT claim:
- FDA regulatory compliance
- 21 CFR Part 11 compliance
- HIPAA compliance
- GCP compliance

These would require:
- Additional security controls
- Validation documentation
- Formal audit procedures
- Regulatory review

The architecture provides the foundation for such compliance but does not implement full regulatory requirements.
