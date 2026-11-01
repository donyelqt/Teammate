import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnvSafe } from "../env";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions.
 *
 * Cookie handling uses `getAll`/`setAll` rather than the deprecated
 * `get`/`set`/`remove` triple. Per-cookie removal cannot express "remove every
 * auth cookie, including the ones only discovered while reading", so it leaves
 * PKCE and chunked-session cookies behind on sign-out.
 *
 * On `setAll`'s second argument: it carries the cache headers the library
 * computes when auth cookies change, of the form
 * `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`.
 * They are dropped here rather than forwarded, because a `cookies()` store
 * writes cookies and cannot set response headers. Forwarding them through this
 * store would create a cookie literally named `Cache-Control`.
 *
 * Those headers are applied in `middleware.ts`, which is the only layer that
 * owns an outgoing `NextResponse`. Requests that set auth cookies must not be
 * cached by any CDN in front of them, or one user's session token is served to
 * a different user. That is a cross-tenant leak, so it is enforced in one place
 * rather than assumed in every caller.
 */
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
          // setAll is called during Server Component render, where Next.js
          // forbids writing cookies. Supabase documents ignoring this specific
          // case: middleware has already refreshed the session, so the render
          // does not run on a stale token.
        }
      },
    },
  });
}
