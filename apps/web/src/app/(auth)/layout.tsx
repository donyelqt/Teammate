import { Suspense, type ReactNode } from "react";

/**
 * `useSearchParams` opts a route out of static rendering. Without a Suspense
 * boundary above it, Next.js fails the build rather than prerendering it.
 *
 * The fallback is a placeholder of the same height rather than a spinner, so the
 * page does not shift when the form arrives.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Sign in to Teammate
            </h1>
            <p className="mt-2 text-sm text-zinc-600">Loading</p>
          </div>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
