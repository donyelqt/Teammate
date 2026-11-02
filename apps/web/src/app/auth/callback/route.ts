import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the one-time code Supabase emails for a session.
 *
 * `code` is the PKCE authorization code in the emailed link, not the code the
 * user types into the form. That form is handled by `verifyOtp` on the sign-in
 * page. Both paths land on the browser, but only a followed link reaches this
 * route, which is why it reads a query parameter rather than a request body.
 *
 * Every failure is a redirect to sign-in rather than an error page, because a
 * user clicking a stale link, or one whose code expired, is a normal occurrence
 * and not a fault. Sending them back to sign in is the recoverable path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return redirectToSignIn(origin, next, "missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToSignIn(origin, next, error.message);
  }

  const response = NextResponse.redirect(new URL(next, origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function redirectToSignIn(
  origin: string,
  next: string,
  reason: string,
): NextResponse {
  const target = new URL("/sign-in", origin);
  target.searchParams.set("next", next);
  target.searchParams.set("error", reason);

  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
