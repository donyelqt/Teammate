const REQUIRED_PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

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

  // Next inlines `process.env.NEXT_PUBLIC_*` only for static member access.
  // A dynamic `source[key]` lookup stays undefined in the browser bundle.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export type PublicEnv = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
};

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
