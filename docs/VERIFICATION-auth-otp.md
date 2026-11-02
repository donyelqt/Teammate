# Verification: email OTP against the local Supabase stack

Date: 2026-11-02
Environment: Supabase CLI 2.122.0, local stack via Docker, Mailpit on 127.0.0.1:54324

## What was exercised

Not a proxy or a mock: the real GoTrue auth server, the real REST/PostgREST layer,
and real RLS policies from `supabase/migrations/001_init.sql`.

| Check | Result |
|---|---|
| Migration applies to the local stack | PASS |
| `identities` row required for password login | confirmed |
| Password grant (`/auth/v1/token?grant_type=password`) | PASS, returns a 780-char access token |
| Anon-key query on `workspace_members` returns zero rows | PASS, `[]` |
| `POST /auth/v1/otp` accepted by server | PASS, `{}` |
| Mailpit receives the email | PASS, subject "Your sign-in link" |
| Email contains a 6-digit code | **FAIL — link only** |

## The finding that changes the implementation

The server sends `type=magiclink`, not a numeric code:

```
http://127.0.0.1:54321/auth/v1/verify?token=dd823d93f7...&type=magiclink&redirect_to=...
```

`config.toml` sets `otp_length = 6` and `otp_expiry = 3600`, but those control the
length and lifetime of a code and not whether a code is sent at all. Requesting a
code with `should_create_user: true` and an explicit `email_redirect_to` still
produced a link, for both an existing user and a new one.

The consequence for the code in `apps/web`: the sign-in page calls
`verifyOtp({ type: "email", token: <six digits> })`. There is never a six-digit
token to read, because the template emits a URL and a one-use token hash. The
form could not have worked, and no amount of testing the request path would have
shown it, because the request succeeds.

## How sign-in verifies instead

Exchange the token from the emailed link for a session, which is what
`exchangeCodeForSession` is for:

```
GET /auth/v1/verify?token=<hash>&type=magiclink&redirect_to=<app>
```

GoTrue redirects to `redirect_to` with a `code` query parameter, and
`/auth/callback` exchanges that code. This is the path already implemented in
`apps/web/src/app/auth/callback/route.ts`, and it is the correct mechanism for
this server rather than a workaround.

## What remains unverified

- The actual round trip in a browser, where `redirect_to` must point at a
  reachable origin. The local origin is `http://localhost:3000`, which requires
  the dev server running and Mailpit's link to be followed.
- Whether the hosted Supabase project behaves the same way. It is the same
  product and version line, but the hosted default templates are site
  configuration, not code, so it is confirmed separately rather than assumed.
