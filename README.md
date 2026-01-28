# AuditWiz - Clinical-Ready Research Platform

Research-focused auditing platform designed with clinical-ready architecture principles: immutable records, append-only audit trails, study-scoped RBAC, and electronic signatures.

## Architecture Principles

### Core Design Principles
- **No data overwriting**: All records are immutable; amendments create new versions
- **Attribution**: Every action is attributable to a verified individual
- **Immutability**: Audit events are append-only and cannot be modified
- **Transparency**: System/AI actions are clearly logged and auditable
- **Human authority**: Humans retain final approval authority

## Features

### Study Management
- Studies replace "projects" as the core organizational unit
- Study-scoped role-based access control (RBAC)
- Roles: `creator`, `reviewer`, `approver`, `auditor`, `admin`

### Immutable Records with Versioning
- Records cannot be edited once created
- Amendments create new versions linked to previous versions
- Full version history preserved
- Content hashing for integrity verification

### Electronic Signatures
- Cryptographically verifiable signatures
- Re-authentication required before signing
- Signatures tied to specific record versions
- Multiple signature intents: review, approval, amendment, rejection

### Audit Trail
- Append-only immutable event ledger
- All significant actions emit audit events
- System/AI actions clearly marked
- Historical role information preserved

### Blockchain Anchoring (Stub)
- Placeholder for blockchain integration
- Designed to anchor finalized approvals
- Integration with Alchemy RPC pending

## Database Schema

See `supabase/migrations/20241221000001_initial_clinical_ready_schema.sql` for the complete schema.

### Key Tables
- `studies`: Research studies
- `study_members`: Study-scoped role assignments
- `records`: Immutable records with versioning
- `documents`: File attachments
- `signatures`: Electronic signatures
- `audit_events`: Append-only audit ledger
- `blockchain_anchors`: Blockchain anchoring records

### Row Level Security (RLS)
All tables have RLS policies enforcing study-scoped access control. Audit events are read-only for all users.

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase account and project
- npm or pnpm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
WEB3_STORAGE_TOKEN=your_token (optional)
ALCHEMY_RPC_URL=your_rpc_url (optional)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Run database migrations:
```bash
# Using Supabase CLI
supabase db push

# Or manually execute the SQL in supabase/migrations/
```

4. Create a test user (optional):
```bash
npm run create-test-user
```
This creates a test user with:
- Email: `test@email.com`
- Password: `testing`

For best results, add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (see `scripts/README.md` for details).

5. Start development server:
```bash
npm run dev
```

## Usage

### Creating a Study
1. Navigate to `/studies`
2. Click "New Study"
3. Fill in study details
4. You'll be automatically added as a creator/admin

### Creating Records
1. Open a study
2. Click "Create Record"
3. Fill in record content
4. Records are immutable once created

### Amending Records
1. Open a record
2. Click "Amend Record"
3. Provide amendment reason (required)
4. New version is created with full history

### Signing Records
1. Open a record under review
2. Click "Sign Record"
3. Re-authenticate with password
4. Select signature intent
5. Signature is cryptographically verified

### Viewing Audit Trail
- Each record has a complete audit trail
- System actions are clearly marked
- All events are immutable and append-only

## API Routes

### System Actions
`POST /api/system-actions`
- Log system/AI actions transparently
- Requires authentication
- Creates audit events with system actor

## Security Considerations

- All audit events are append-only (no UPDATE/DELETE)
- Records are immutable (amendments create versions)
- Electronic signatures require re-authentication
- Study-scoped permissions enforced via RLS
- Content hashing for integrity verification

## Future Enhancements

- [ ] Full blockchain anchoring implementation
- [ ] Web3.storage integration for document storage
- [ ] AI-powered audit analysis
- [ ] ORCID OAuth integration
- [ ] Advanced workflow management
- [ ] Export audit reports

## License

Private project - All rights reserved
