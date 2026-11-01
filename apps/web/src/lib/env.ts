/**
 * Browser-safe environment contract (ADR-0005, Phase 1 Task 2).
 *
 * Only variables with the NEXT_PUBLIC_ prefix reach the browser. The Supabase
 * service-role key bypasses every RLS policy, so exposing it would be a
 * cross-tenant data leak rather than a bug. This module is the single place
 * that reads and validates the public contract.
 */

const REQUIRED_PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/**
 * A browser-exposed key is refused if it names a secret. Catching this at
 * import time beats a runtime leak that no amount of routing hygiene fixes.
 */
function assertNoPublicSecret(source: Record<string, string | undefined>): void {
  for (const key of Object.keys(source)) {
    if (!key.startsWith("NEXT_PUBLIC_")) {
      continue;
    }
    if (key.includes("SERVICE_ROLE") || key.includes("SECRET") || key.includes("PRIVATE")) {
      throw new Error(
        `Refusing to expose ${key}: a secret must never carry the NEXT_PUBLIC_ prefix. ` +
          `The service-role key bypasses all RLS policies.`,
      );
    }
  }
}

function readPublicEnv(): Record<string, string | undefined> {
  const source =
    typeof process !== "undefined" && process.env ? process.env : {};
  assertNoPublicSecret(source);
  return source;
}

export type PublicEnv = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
};

/**
 * Reads and validates the browser contract. Throws with the specific missing
 * key rather than a generic message, because the failure mode is always a
 * misconfigured deploy env.
 */
export function readPublicEnvSafe(): PublicEnv {
  const source = readPublicEnv();

  const missing = REQUIRED_PUBLIC_KEYS.filter((key) => {
    const value = source[key];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new Error(`Missing required public env: ${missing.join(", ")}`);
  }

  const supabaseUrl = source.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing required public env after validation");
  }

  if (!/^https?:\/\//.test(supabaseUrl)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an absolute http(s) URL");
  }

  return { supabaseUrl, supabaseAnonKey };
}
