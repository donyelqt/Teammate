import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/**
 * The service-role Supabase key bypasses every RLS policy (ADR-0005). A
 * NEXT_PUBLIC_ prefix ships it to the browser, which is a cross-tenant data
 * leak rather than a style violation.
 *
 * Implemented over the raw source rather than as an esquery selector because a
 * selector that silently matches nothing is worse than no rule at all. This
 * form fires on any occurrence in any position: declaration, object key,
 * destructuring, or string literal.
 */
const noPublicSecretRule = {
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();

    return {
      Program() {
        const pattern = /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE)[A-Z0-9_]*/g;

        for (const match of source.getText().matchAll(pattern)) {
          const start = match.index ?? 0;
          const end = start + match[0].length;
          const loc = source.getLocFromIndex(start);

          context.report({
            loc: {
              start: loc,
              end: source.getLocFromIndex(end),
            },
            message:
              "A secret must never carry the NEXT_PUBLIC_ prefix. " +
              "The service-role key bypasses all RLS policies (ADR-0005).",
          });
        }
      },
    };
  },
};

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    plugins: {
      teammate: {
        rules: {
          "no-public-secret": noPublicSecretRule,
        },
      },
    },
    rules: {
      "teammate/no-public-secret": "error",

      // process.env is permitted only inside src/lib/env.ts, which is the one
      // module that validates the browser contract. Everywhere else it is a
      // sign the contract leaked.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read NEXT_PUBLIC_* through src/lib/env.ts so the contract is validated in one place.",
        },
      ],

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    files: ["src/lib/env.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
];

export default config;
