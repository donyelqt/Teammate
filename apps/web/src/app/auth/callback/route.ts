import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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
