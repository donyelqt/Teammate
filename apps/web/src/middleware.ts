import type { NextRequest } from "next/server";

import { updateSession } from "./lib/supabase/middleware";

/**
 * Refreshes the Supabase session before any matched request renders.
 *
 * This runs here rather than in a page or layout because it is the one point
 * that runs once per navigation, before Server Components render. Refreshing in
 * a page instead means rendering against a token that may already be expired,
 * which serves rows the user should no longer see.
 *
 * The response from `updateSession` must be the one returned. It carries the
 * refreshed cookies and the cache headers that stop a CDN caching a
 * session-bearing response; returning anything else drops both.
 *
 * Access control is not enforced here. Deciding redirects in middleware would
 * require the matcher to know which routes are public, and /sign-in and
 * /auth/callback are exactly that, so the loop is easy to construct. The
 * membership guard lives where the query is issued, where the workspace id is
 * already in hand.
 */
export async function middleware(request: NextRequest) {
  const { response } = await updateSession(request);

  return response;
}

export const config = {
  matcher: [
    /*
     * Matches every path except _next/static, _next/image, and favicon.ico,
     * which are build output and never authenticated.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
