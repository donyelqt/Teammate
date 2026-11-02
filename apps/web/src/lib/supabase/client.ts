import { createBrowserClient } from "@supabase/ssr";

import { readPublicEnvSafe } from "../env";

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = readPublicEnvSafe();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
