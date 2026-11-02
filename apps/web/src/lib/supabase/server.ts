import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnvSafe } from "../env";

export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = readPublicEnvSafe();

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
        }
      },
    },
  });
}
