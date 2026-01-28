#!/usr/bin/env node

/**
 * Script to create a test user for local development
 * 
 * Usage:
 *   node scripts/create-test-user.js
 * 
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY for admin operations)
 * 
 * Note: For best results, add SUPABASE_SERVICE_ROLE_KEY to .env.local
 * You can find it in your Supabase project settings under API > service_role key
 */

const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { resolve } = require('path')

// Load environment variables from .env.local manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const envFile = readFileSync(envPath, 'utf-8')
    const envVars = {}
    
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '')
          envVars[key.trim()] = value.trim()
        }
      }
    })
    
    Object.assign(process.env, envVars)
  } catch (error) {
    // .env.local might not exist, that's okay
  }
}

loadEnv()

const TEST_EMAIL = 'test@email.com'
const TEST_PASSWORD = 'testing'

async function createTestUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local')
    process.exit(1)
  }

  // Prefer service role key for admin operations (bypasses RLS and email confirmation)
  const supabaseKey = serviceRoleKey || anonKey

  if (!supabaseKey) {
    console.error('❌ Error: Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log('🔐 Creating test user...')
  console.log(`   Email: ${TEST_EMAIL}`)
  console.log(`   Password: ${TEST_PASSWORD}`)

  try {
    // Check if user already exists (only works with service role key)
    if (serviceRoleKey) {
      const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers()
      
      if (!listError && existingUsers?.users) {
        const existingUser = existingUsers.users.find(
          (u) => u.email === TEST_EMAIL
        )

        if (existingUser) {
          console.log('⚠️  User already exists. Updating password...')
          
          const { data, error } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: TEST_PASSWORD }
          )

          if (error) {
            console.error('❌ Error updating user:', error.message)
            process.exit(1)
          }

          console.log('✅ Test user password updated successfully!')
          console.log(`   User ID: ${existingUser.id}`)
          console.log('\n📝 Test user credentials:')
          console.log(`   Email: ${TEST_EMAIL}`)
          console.log(`   Password: ${TEST_PASSWORD}`)
          console.log('\n✨ You can now sign in at http://localhost:3000/auth/signin')
          return
        }
      }
    }

    if (serviceRoleKey) {
      // Create user using admin API (bypasses email confirmation)
      const { data, error } = await supabase.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true, // Auto-confirm email for local dev
      })

      if (error) {
        console.error('❌ Error creating user:', error.message)
        process.exit(1)
      }

      console.log('✅ Test user created successfully!')
      console.log(`   User ID: ${data.user.id}`)
      console.log(`   Email: ${data.user.email}`)
    } else {
      // Fallback: Use regular signup (may require email confirmation)
      console.log('⚠️  Using anon key - email confirmation may be required')
      console.log('   For better results, add SUPABASE_SERVICE_ROLE_KEY to .env.local')
      
      const { data, error } = await supabase.auth.signUp({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })

      if (error) {
        console.error('❌ Error creating user:', error.message)
        if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND')) {
          console.error('   Network error: Cannot reach Supabase server.')
          console.error('   Please check your internet connection and Supabase project status.')
        } else {
          console.error('   Tip: Add SUPABASE_SERVICE_ROLE_KEY to .env.local for admin operations')
        }
        process.exit(1)
      }

      if (data.user) {
        console.log('✅ Test user created!')
        console.log(`   User ID: ${data.user.id}`)
        console.log(`   Email: ${data.user.email}`)
        if (!data.session) {
          console.log('⚠️  Email confirmation may be required. Check your Supabase settings.')
        }
      }
    }

    console.log('\n📝 Test user credentials:')
    console.log(`   Email: ${TEST_EMAIL}`)
    console.log(`   Password: ${TEST_PASSWORD}`)
    console.log('\n✨ You can now sign in at http://localhost:3000/auth/signin')
  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
    process.exit(1)
  }
}

createTestUser()
