# Deployment Guide

## Vercel Deployment

### Required Environment Variables

The following environment variables **must** be set in your Vercel project settings for the application to function correctly:

#### Required Variables

1. **`NEXT_PUBLIC_SUPABASE_URL`**
   - Your Supabase project URL
   - Format: `https://<project-ref>.supabase.co`
   - Found in: Supabase Dashboard → Settings → API → Project URL
   - **Critical**: Without this, middleware will fail and cause NOT_FOUND errors

2. **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - Your Supabase anonymous/public key
   - Found in: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
   - **Critical**: Without this, middleware will fail and cause NOT_FOUND errors

#### Optional Variables

3. **`NEXT_PUBLIC_APP_URL`**
   - Your application's public URL
   - For production: `https://your-domain.vercel.app` or your custom domain
   - For development: `http://localhost:3000`
   - Used for OAuth callbacks and redirects

4. **`WEB3_STORAGE_TOKEN`** (Optional)
   - Token for Web3.storage integration
   - Only needed if using Web3.storage for document storage

5. **`ALCHEMY_RPC_URL`** (Optional)
   - Alchemy RPC endpoint URL
   - Only needed for blockchain anchoring functionality

### Setting Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Name**: The variable name (e.g., `NEXT_PUBLIC_SUPABASE_URL`)
   - **Value**: The variable value
   - **Environment**: Select which environments (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

### Common Deployment Issues

#### NOT_FOUND Error

If you're seeing NOT_FOUND errors on Vercel:

1. **Check environment variables are set**
   - Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured
   - Ensure they're set for the correct environment (Production/Preview)

2. **Verify middleware configuration**
   - Middleware should exclude `/api` routes (see `middleware.ts`)
   - API routes handle their own authentication

3. **Check build logs**
   - Review Vercel build logs for any errors
   - Look for missing environment variable warnings

4. **Redeploy after changes**
   - Environment variable changes require a new deployment
   - Use "Redeploy" in Vercel dashboard

### Database Migrations

Before deploying, ensure your Supabase database is up to date:

```bash
# Using Supabase CLI
supabase db push

# Or manually execute the SQL in supabase/migrations/
```

### Build Configuration

Vercel should automatically detect Next.js and use the correct build settings:
- **Framework Preset**: Next.js
- **Build Command**: `npm run build` (or `next build`)
- **Output Directory**: `.next` (default)

If Vercel doesn't auto-detect, manually set:
- Framework: Next.js
- Root Directory: `.` (project root)

### Post-Deployment Checklist

- [ ] All required environment variables are set
- [ ] Database migrations are applied
- [ ] Test authentication flow (sign in/sign up)
- [ ] Verify API routes are accessible (`/api/system-actions`)
- [ ] Test protected routes (`/studies`, `/dashboard`)
- [ ] Check OAuth callback route (`/auth/callback`)
