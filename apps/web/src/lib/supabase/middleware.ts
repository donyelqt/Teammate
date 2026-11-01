import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { readPublicEnvSafe } from "../env";

export interface SessionUpdate {
  readonly response: NextResponse;
  readonly supabase: SupabaseClient;
}

/**
 * Refreshes the Supabase session and returns the response for the middleware
 * pipeline to continue with.
 *
 * The caller must return `response` from its own handler, because the refreshed
 * session is written onto it. Returning the incoming request's response instead
 * discards the new tokens, and the user is signed out on the next navigation
 * with no visible cause.
 */
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

        // Supabase computes these when auth cookies change. They must reach the
        // outgoing response, or a CDN in front of this origin can cache a
        // session-bearing response and serve one user's token to another. Only
        // forwarded on the first cookie write, so they are applied directly to
        // the response rather than deferred.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Reading claims triggers the refresh when the access token has expired, and
  // the revalidation writes the new cookies through setAll above.
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
