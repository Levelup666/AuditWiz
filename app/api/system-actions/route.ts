// API route for system/AI actions
// Demonstrates how automated actions are logged transparently

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSystemAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { SYSTEM_ACTOR_ID } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      studyId,
      actionType,
      targetEntityType,
      targetEntityId,
      previousStateHash,
      newStateHash,
      systemMetadata,
    } = body

    // Validate required fields
    if (!studyId || !actionType || !targetEntityType || !newStateHash) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create system audit event
    const eventId = await createSystemAuditEvent(
      studyId,
      actionType,
      targetEntityType,
      targetEntityId || null,
      previousStateHash || null,
      newStateHash,
      {
        ...systemMetadata,
        requested_by: user.id,
      }
    )

    return NextResponse.json({
      success: true,
      eventId,
      message: 'System action logged successfully',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
