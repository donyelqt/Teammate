import { createBrowserClient } from "@supabase/ssr";

import { readPublicEnvSafe } from "../env";

/**
 * Browser-side Supabase client.
 *
 * This is the only client that may hold the anon key in the browser bundle,
 * and the anon key is safe there precisely because RLS enforces authorization
 * (ADR-0005). The service-role key has no reason to appear in this package and
 * is blocked by `env.ts` and by the lint guard.
 *
 * A `getAll`/`setAll` pair is not passed because `createBrowserClient` falls
 * back to `document.cookie` when neither is provided, which is what the
 * package documents. Passing a hand-written adapter instead is the deprecated
 * shape.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = readPublicEnvSafe();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
