import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { readPublicEnvSafe } from "../env";

export interface SessionUpdate {
  readonly response: NextResponse;
  readonly supabase: SupabaseClient;
}

export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  const { supabaseUrl, supabaseAnonKey } = readPublicEnvSafe();

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  await supabase.auth.getClaims();

  return { response, supabase };
}

export function redirectToSignIn(request: NextRequest): NextResponse {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname);

  const redirect = NextResponse.redirect(signInUrl);
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}
