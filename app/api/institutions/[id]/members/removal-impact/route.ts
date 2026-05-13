import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { getInstitutionMemberRemovalImpact } from '@/lib/institution-member-removal-cascade'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: institutionId } = await params
  const userIdParam = request.nextUrl.searchParams.get('userId')?.trim()

  if (!userIdParam) {
    return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const impact = await getInstitutionMemberRemovalImpact(admin, institutionId, userIdParam)
  return NextResponse.json(impact)
}
