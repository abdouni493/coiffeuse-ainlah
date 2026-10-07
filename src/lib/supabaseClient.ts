import { createClient } from '@supabase/supabase-js';

// The anon/public key is safe to ship in the client bundle — row level security
// on the database is what protects the data. Values can be overridden with Vite
// env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) for other environments.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://klwovduevlwvoccxhbpm.supabase.co';

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd292ZHVldmx3dm9jY3hoYnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjE0NTAsImV4cCI6MjEwNjkzNzQ1MH0.f0Mg2MS1asXUHAfic_mEHSHy8YIi7el-eVZHyblAtks';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * A second, isolated client used ONLY to create worker accounts from the admin
 * Workers page. Because supabase.auth.signUp() would otherwise replace the
 * admin's session with the freshly-created worker session, this client keeps
 * its own storage and never persists — the admin stays logged in.
 */
export function createSignupClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'salon-signup-tmp',
    },
  });
}
