// Audit event creation utilities
// All audit events are append-only and immutable

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuditUiRetentionCutoffIso } from '@/lib/audit-ui-retention'
import { createClient } from './server'
import { AuditActionType, SystemActionMetadata } from '@/lib/types'

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

  return data
}

/** Same as createAuditEvent but uses a provided client (e.g. service role) when no user session exists. */
export async function createAuditEventWithClient(
  supabase: SupabaseClient,
  studyId: string | null,
  actorId: string | null,
  actionType: AuditActionType,
  targetEntityType: string,
  targetEntityId: string | null,
  previousStateHash: string | null,
  newStateHash: string,
  metadata: Record<string, any> = {}
): Promise<string> {
  const { data, error } = await supabase.rpc('create_audit_event', {
    p_study_id: studyId,
    p_actor_id: actorId,
    p_action_type: actionType,
    p_target_entity_type: targetEntityType,
    p_target_entity_id: targetEntityId,
    p_previous_state_hash: previousStateHash,
    p_new_state_hash: newStateHash,
    p_metadata: metadata,
  })

  if (error) {
    throw new Error(`Failed to create audit event: ${error.message}`)
  }

  return data
}

/**
 * Create a system/AI action audit event
 * For automated actions that need to be transparent.
 * Uses null actor_id (FK to auth.users); human context lives in metadata (e.g. requested_by).
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
    null,
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
    .gte('timestamp', getAuditUiRetentionCutoffIso())
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
    .gte('timestamp', getAuditUiRetentionCutoffIso())
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

/**
 * Get audit events for export (optional study and date range filter)
 */
export async function getAuditEventsForExport(
  studyId?: string | null,
  from?: string | null,
  to?: string | null,
  limit: number = 5000,
  studyIdsFilter?: string[] | null
) {
  const supabase = await createClient();

  const retentionFloor = getAuditUiRetentionCutoffIso()
  const effectiveFrom =
    from && from > retentionFloor ? from : retentionFloor

  let query = supabase
    .from('audit_events')
    .select('*')
    .gte('timestamp', effectiveFrom)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (studyId) {
    query = query.eq('study_id', studyId);
  } else if (studyIdsFilter && studyIdsFilter.length > 0) {
    query = query.in('study_id', studyIdsFilter);
  }
  if (to) {
    query = query.lte('timestamp', to);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit events: ${error.message}`);
  }

  return data ?? [];
}

export type AuditEventsCursor = { timestamp: string; id: string }

/**
 * Keyset-paged audit events for the Logs hub (RPC + RLS). studyIds must be non-empty.
 */
export async function listAuditEventsPage(opts: {
  studyIds: string[]
  targetEntityType?: string | null
  cursor?: AuditEventsCursor | null
  limit?: number
}): Promise<{ events: Record<string, unknown>[]; nextCursor: AuditEventsCursor | null }> {
  if (opts.studyIds.length === 0) {
    return { events: [], nextCursor: null }
  }

  const supabase = await createClient()
  const pageSize = Math.min(Math.max(opts.limit ?? 40, 1), 100)
  const fetchLimit = pageSize + 1

  const targetType = opts.targetEntityType?.trim()
  const { data, error } = await supabase.rpc('audit_events_page_for_viewer', {
    p_cutoff: getAuditUiRetentionCutoffIso(),
    p_study_ids: opts.studyIds,
    p_target_entity_type: targetType && targetType.length > 0 ? targetType : null,
    p_cursor_ts: opts.cursor?.timestamp ?? null,
    p_cursor_id: opts.cursor?.id ?? null,
    p_limit: fetchLimit,
  })

  if (error) {
    throw new Error(`Failed to list audit events: ${error.message}`)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const hasMore = rows.length > pageSize
  const events = hasMore ? rows.slice(0, pageSize) : rows
  let nextCursor: AuditEventsCursor | null = null
  if (hasMore && events.length > 0) {
    const last = events[events.length - 1]
    nextCursor = {
      timestamp: String(last.timestamp),
      id: String(last.id),
    }
  }
  return { events, nextCursor }
}
