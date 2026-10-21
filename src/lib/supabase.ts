import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// The public anon / publishable key. It is designed to be exposed in the browser;
// all access is restricted by Row Level Security and function grants.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = url?.replace(/\/+$/, '') ?? '';
export const supabaseAnonKey = anonKey ?? '';
export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[Crescor] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY saknas. Webbplatsen visas, men bokning är avstängd. Se .env.example.',
  );
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'crescor-admin-session',
        detectSessionInUrl: true,
      },
    })
  : null;
