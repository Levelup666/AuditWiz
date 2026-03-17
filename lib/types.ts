// Clinical-Ready Research Platform Types
// Study-scoped roles and immutable record architecture

export type StudyRole = 'creator' | 'reviewer' | 'approver' | 'auditor' | 'admin';

export type StudyStatus = 'draft' | 'active' | 'completed' | 'archived';

export type RecordStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'amended';

export type SignatureIntent = 'review' | 'approval' | 'amendment' | 'rejection';

export type AuditActionType =
  | 'study_created' | 'study_updated' | 'study_deleted'
  | 'member_added' | 'member_removed' | 'member_role_changed'
  | 'study_member_invited' | 'study_member_joined'
  | 'institution_created' | 'institution_updated' | 'institution_deleted'
  | 'institution_member_added' | 'institution_member_removed' | 'institution_member_role_changed'
  | 'institution_member_invited' | 'institution_member_joined'
  | 'record_created' | 'record_submitted' | 'record_amended' | 'record_rejected' | 'record_approved'
  | 'record_draft_updated' | 'record_deleted'
  | 'document_uploaded' | 'document_deleted'
  | 'signature_added' | 'signature_revoked'
  | 'identity_linked'
  | 'share_created' | 'share_accessed'
  | 'ai_action' | 'system_action'
  | 'blockchain_anchored';

export interface Institution {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  domain: string | null;
  metadata: { [key: string]: any };
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InstitutionMember {
  id: string;
  institution_id: string;
  user_id: string;
  role: 'admin' | 'member';
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface Study {
  id: string;
  title: string;
  description: string | null;
  documentation?: string | null;
  status: StudyStatus;
  institution_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  metadata: { [key: string]: any };
  required_approval_count?: number;
  require_review_before_approval?: boolean;
  allow_creator_approval?: boolean;
}

export interface StudyMember {
  id: string;
  study_id: string;
  user_id: string;
  role: StudyRole;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  can_view: boolean;
  can_comment: boolean;
  can_review: boolean;
  can_approve: boolean;
  can_share: boolean;
}

export interface Profile {
  id: string;
  orcid_id: string | null;
  orcid_verified: boolean;
  orcid_affiliation_snapshot: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserIdentity {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
  verified: boolean;
  linked_at: string;
  revoked_at: string | null;
}

export interface SharedArtifact {
  id: string;
  record_version_id: string;
  created_by: string;
  permission_level: 'read';
  expires_at: string;
  access_token_hash: string;
  created_at: string;
}

export interface Record {
  id: string;
  study_id: string;
  record_number: string;
  version: number;
  previous_version_id: string | null;
  status: RecordStatus;
  created_by: string;
  created_at: string;
  content: { [key: string]: any };
  content_hash: string;
  amendment_reason: string | null;
  last_edited_at?: string | null;
  last_edited_by?: string | null;
}

export interface Document {
  id: string;
  record_id: string;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
  metadata: { [key: string]: any };
}

export interface Signature {
  id: string;
  record_id: string;
  record_version: number;
  signer_id: string;
  intent: SignatureIntent;
  signature_hash: string;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: { [key: string]: any };
}

export interface AuditEvent {
  id: string;
  event_id: string;
  study_id: string | null;
  actor_id: string | null;
  actor_role_at_time: string | null;
  action_type: AuditActionType;
  target_entity_type: string;
  target_entity_id: string | null;
  previous_state_hash: string | null;
  new_state_hash: string;
  timestamp: string;
  metadata: { [key: string]: any };
}

export interface BlockchainAnchor {
  id: string;
  record_id: string;
  record_version: number;
  content_hash: string;
  transaction_hash: string | null;
  block_number: number | null;
  anchored_at: string;
  metadata: { [key: string]: any };
}

// System actor identifier for AI/automated actions
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

// Custom field type for record form (add-your-own fields)
export type CustomFieldType = 'text' | 'integer' | 'number' | 'date' | 'boolean';

// Record template for study metadata
export interface RecordTemplateContentSchema {
  title?: string;
  summary?: string;
  notes?: string;
  customFields: Array<{ name: string; type: CustomFieldType; value?: string }>;
}

export interface RecordTemplate {
  id: string;
  name: string;
  contentSchema: RecordTemplateContentSchema;
}

// Helper type for system action metadata
export interface SystemActionMetadata {
  model_version?: string;
  input_hash?: string;
  output_hash?: string;
  automation_type?: string;
  [key: string]: any;
}
