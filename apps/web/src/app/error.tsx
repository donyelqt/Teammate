"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log the error to your observability provider here.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-4">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted">{error.message}</p>
      <button
        onClick={reset}
        className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}