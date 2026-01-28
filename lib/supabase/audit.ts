// Audit event creation utilities
// All audit events are append-only and immutable

import { createClient } from './server';
import { AuditActionType, SYSTEM_ACTOR_ID, SystemActionMetadata } from '@/lib/types';

/**
 * Create an audit event
 * Uses Supabase RPC function to ensure immutability
 */
export async function createAuditEvent(
  studyId: string | null,
  actorId: string | null,
  actionType: AuditActionType,
  targetEntityType: string,
  targetEntityId: string | null,
  previousStateHash: string | null,
  newStateHash: string,
  metadata: Record<string, any> = {}
): Promise<string> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('create_audit_event', {
    p_study_id: studyId,
    p_actor_id: actorId,
    p_action_type: actionType,
    p_target_entity_type: targetEntityType,
    p_target_entity_id: targetEntityId,
    p_previous_state_hash: previousStateHash,
    p_new_state_hash: newStateHash,
    p_metadata: metadata,
  });

  if (error) {
    throw new Error(`Failed to create audit event: ${error.message}`);
  }

  return data;
}

/**
 * Create a system/AI action audit event
 * For automated actions that need to be transparent
 */
export async function createSystemAuditEvent(
  studyId: string | null,
  actionType: AuditActionType,
  targetEntityType: string,
  targetEntityId: string | null,
  previousStateHash: string | null,
  newStateHash: string,
  systemMetadata: SystemActionMetadata
): Promise<string> {
  return createAuditEvent(
    studyId,
    SYSTEM_ACTOR_ID,
    actionType,
    targetEntityType,
    targetEntityId,
    previousStateHash,
    newStateHash,
    {
      ...systemMetadata,
      is_system_action: true,
    }
  );
}

/**
 * Get audit trail for an entity
 */
export async function getAuditTrail(
  targetEntityType: string,
  targetEntityId: string,
  limit: number = 100
) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('target_entity_type', targetEntityType)
    .eq('target_entity_id', targetEntityId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch audit trail: ${error.message}`);
  }

  return data;
}

/**
 * Get all audit events (for dashboard view)
 * Optionally filter by study_id
 */
export async function getAllAuditEvents(
  studyId?: string | null,
  limit: number = 200
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('audit_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (studyId) {
    query = query.eq('study_id', studyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit events: ${error.message}`);
  }

  return data;
}
