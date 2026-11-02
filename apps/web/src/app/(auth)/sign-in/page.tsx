"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Phase =
  | { readonly kind: "email" }
  | { readonly kind: "sent" }
  | { readonly kind: "error"; readonly message: string };

export default function SignInPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";

  const [phase, setPhase] = useState<Phase>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  const linkError = searchParams.get("error");

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        shouldCreateUser: true,
      },
    });

    setPending(false);

    if (error) {
      setPhase({ kind: "error", message: error.message });
      return;
    }

    setPhase({ kind: "sent" });
  }

  if (phase.kind === "sent") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            We sent a sign-in link to {email}. It can be used once and expires
            shortly.
          </p>
          <button
            type="button"
            onClick={() => setPhase({ kind: "email" })}
            className="mt-6 text-sm text-zinc-600 underline"
          >
            Use a different email
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Sign in to Teammate
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          We email you a link that signs you in.
        </p>

        {linkError && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            That sign-in link did not work. Request a new one.
          </p>
        )}

        {phase.kind === "error" && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {phase.message}
          </p>
        )}

        <form onSubmit={sendLink} className="mt-6 grid gap-2">
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
            {pending ? "Sending" : "Send sign-in link"}
          </button>
        </form>
      </div>
    </main>
  );
}
