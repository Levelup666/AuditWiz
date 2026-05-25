#!/usr/bin/env node
/**
 * One-off: ensure study creator has admin assignment + study_members row.
 *
 * Usage:
 *   npx tsx scripts/repair-study-creator.ts --institution "Pivot AI Sol: AuditWiz Test01" --study "Testing01"
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { bootstrapStudyCreatorAsAdmin } from '../lib/supabase/bootstrap-study-creator'

function loadEnvFile(filename: string) {
  try {
    const envPath = resolve(process.cwd(), filename)
    const envFile = readFileSync(envPath, 'utf-8')
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '')
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value.trim()
          }
        }
      }
    })
    return true
  } catch {
    return false
  }
}

function loadEnv() {
  const loaded = loadEnvFile('.env.local') || loadEnvFile('.env')
  if (!loaded) {
    console.warn('Could not load .env.local or .env')
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i === -1 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

async function main() {
  loadEnv()

  const institutionName = arg('--institution')
  const studyTitle = arg('--study')
  if (!institutionName || !studyTitle) {
    console.error(
      'Usage: npx tsx scripts/repair-study-creator.ts --institution "Name" --study "Title"'
    )
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: institutions, error: instErr } = await admin
    .from('institutions')
    .select('id, name')
    .eq('name', institutionName)

  if (instErr) {
    console.error('Institution lookup failed:', instErr.message)
    process.exit(1)
  }
  if (!institutions?.length) {
    console.error(`No institution named: ${institutionName}`)
    process.exit(1)
  }
  if (institutions.length > 1) {
    console.warn(`Multiple institutions (${institutions.length}); using first.`)
  }
  const institutionId = institutions[0].id

  const { data: studies, error: studyErr } = await admin
    .from('studies')
    .select('id, title, created_by, institution_id')
    .eq('institution_id', institutionId)
    .eq('title', studyTitle)

  if (studyErr) {
    console.error('Study lookup failed:', studyErr.message)
    process.exit(1)
  }
  if (!studies?.length) {
    console.error(`No study "${studyTitle}" under institution "${institutionName}"`)
    process.exit(1)
  }
  if (studies.length > 1) {
    console.warn(`Multiple studies (${studies.length}); repairing each.`)
  }

  for (const study of studies) {
    const creatorId = study.created_by
    if (!creatorId) {
      console.error(`Study ${study.id} has no created_by`)
      continue
    }

    console.log('Study:', study.id, study.title)
    console.log('Creator:', creatorId)

    const beforeAssign = await admin
      .from('study_member_role_assignments')
      .select('id, role_definition_id')
      .eq('study_id', study.id)
      .eq('user_id', creatorId)
      .is('revoked_at', null)

    const beforeMembers = await admin
      .from('study_members')
      .select('id, role')
      .eq('study_id', study.id)
      .eq('user_id', creatorId)
      .is('revoked_at', null)

    console.log('Before assignments:', beforeAssign.data?.length ?? 0)
    console.log('Before members:', beforeMembers.data?.length ?? 0, beforeMembers.data)

    const result = await bootstrapStudyCreatorAsAdmin(study.id, creatorId)
    if (!result.ok) {
      console.error('Repair failed:', result.error)
      process.exit(1)
    }

    const afterAssign = await admin
      .from('study_member_role_assignments')
      .select('id, role_definition_id')
      .eq('study_id', study.id)
      .eq('user_id', creatorId)
      .is('revoked_at', null)

    const afterMembers = await admin
      .from('study_members')
      .select('id, role')
      .eq('study_id', study.id)
      .eq('user_id', creatorId)
      .is('revoked_at', null)

    console.log('After assignments:', afterAssign.data?.length ?? 0)
    console.log('After members:', afterMembers.data?.length ?? 0, afterMembers.data)
    console.log('Repair OK for', study.id)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
