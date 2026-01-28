# Scripts

## create-test-user.js

Creates a test user for local development.

### Usage

```bash
npm run create-test-user
```

Or directly:
```bash
node scripts/create-test-user.js
```

### Test User Credentials

- **Email**: `test@email.com`
- **Password**: `testing`

### Requirements

The script requires the following environment variables in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key (minimum)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (recommended)

### Service Role Key (Recommended)

For the best experience, add your Supabase service role key to `.env.local`:

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy the **service_role** key (keep this secret!)
4. Add it to `.env.local`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

**Benefits of using service role key:**
- Bypasses email confirmation (user can sign in immediately)
- Can update existing users
- More reliable for automated scripts

### Without Service Role Key

If you don't have the service role key, the script will:
- Still create the user using the anon key
- May require email confirmation (check your Supabase auth settings)
- Cannot update existing users

### Troubleshooting

**Network errors:**
- Ensure you have internet connectivity
- Verify your Supabase project is active (not paused)
- Check that `NEXT_PUBLIC_SUPABASE_URL` is correct

**User already exists:**
- If using service role key: The script will update the password
- If using anon key: You'll need to delete the user manually from Supabase dashboard or add the service role key

**Email confirmation required:**
- Go to Supabase dashboard → **Authentication** → **Settings**
- Disable "Enable email confirmations" for local development
- Or use the service role key to auto-confirm users
