"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "../../../lib/supabase/client";

type Phase =
  | { readonly kind: "email" }
  | { readonly kind: "sent"; readonly email: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Email OTP sign-in.
 *
 * Two steps by design, mirroring how the one-time-code flow actually works:
 * the address is submitted first, then the code arrives out of band. Rendering
 * one combined form would have to fake a delay it does not control.
 *
 * The `next` parameter is carried through so the redirect after sign-in returns
 * the user to what they asked for rather than to the home page.
 */
export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";

  const [phase, setPhase] = useState<Phase>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  const supabase = createClient();

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setPhase({ kind: "email" });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // The callback route exchanges the token in the URL for a session.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    setPending(false);

    if (error) {
      setPhase({ kind: "error", message: error.message });
      return;
    }

    setPhase({ kind: "sent", email });
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const { error } = await supabase.auth.verifyOtp({
      email: phase.kind === "sent" ? phase.email : email,
      token: code,
      type: "email",
    });

    if (error) {
      setPending(false);
      setPhase({ kind: "error", message: error.message });
      return;
    }

    setPending(false);
    router.push(nextPath);
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Sign in to Teammate
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          We send a one-time code to your email.
        </p>

        {phase.kind === "error" && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {phase.message}
          </p>
        )}

        {phase.kind === "sent" ? (
          <form onSubmit={verifyCode} className="mt-6 grid gap-2">
            <label htmlFor="code" className="text-sm font-medium text-zinc-700">
              One-time code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base text-zinc-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? "Verifying" : "Verify code"}
            </button>
            <button
              type="button"
              onClick={() => setPhase({ kind: "email" })}
              className="text-sm text-zinc-600 underline"
            >
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="mt-6 grid gap-2">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base text-zinc-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? "Sending" : "Send code"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
