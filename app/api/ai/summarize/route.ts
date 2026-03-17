import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSystemAuditEvent } from '@/lib/supabase/audit'
import { getStudyMemberPermissions } from '@/lib/supabase/permissions'
import { callLLM, isAIAvailable } from '@/lib/ai/client'
import {
  getRecordSummarizationPrompt,
  getRecordSummarizationSystemPrompt,
} from '@/lib/ai/prompts'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'AI features are not configured. Contact your administrator.' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { recordId } = body as { recordId?: string }

    if (!recordId) {
      return NextResponse.json(
        { error: 'recordId is required' },
        { status: 400 }
      )
    }

    const { data: record, error: recError } = await supabase
      .from('records')
      .select('id, study_id, record_number, version, content')
      .eq('id', recordId)
      .single()

    if (recError || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const perms = await getStudyMemberPermissions(user.id, record.study_id)
    if (!perms?.can_view) {
      return NextResponse.json(
        { error: 'You do not have permission to view this record' },
        { status: 403 }
      )
    }

    const { data: study } = await supabase
      .from('studies')
      .select('metadata')
      .eq('id', record.study_id)
      .single()

    const metadata = (study?.metadata ?? {}) as Record<string, unknown>
    if (metadata.ai_enabled === false) {
      return NextResponse.json(
        { error: 'AI features are disabled for this study' },
        { status: 403 }
      )
    }

    const content = (record.content ?? {}) as Record<string, unknown>
    const prompt = getRecordSummarizationPrompt(
      record.record_number,
      record.version,
      content
    )
    const systemPrompt = getRecordSummarizationSystemPrompt()

    const result = await callLLM(prompt, systemPrompt)
    if (!result) {
      return NextResponse.json(
        { error: 'AI service unavailable' },
        { status: 503 }
      )
    }

    await createSystemAuditEvent(
      record.study_id,
      'ai_action',
      'record',
      record.id,
      result.inputHash,
      result.outputHash,
      {
        model_version: result.modelVersion,
        input_hash: result.inputHash,
        output_hash: result.outputHash,
        requested_by: user.id,
        feature: 'summarize',
        target_entity_type: 'record',
        target_entity_id: record.id,
      }
    )

    return NextResponse.json({
      success: true,
      summary: result.content,
      modelVersion: result.modelVersion,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
