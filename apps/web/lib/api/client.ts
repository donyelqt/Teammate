/**
 * Typed API client for the FastAPI boundary.
 *
 * Every response is validated against a zod schema before it reaches
 * application code. `unknown` enters; a typed value leaves.
 */

import { z } from "zod";


export interface ApiClientOptions {
  baseUrl?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(options?: ApiClientOptions) {
    this.baseUrl = options?.baseUrl ?? "http://127.0.0.1:8787";
  }

  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as unknown;
        if (typeof body === "object" && body !== null && "detail" in body) {
          const d = (body as { detail: unknown }).detail;
          if (typeof d === "string") detail = d;
        }
      } catch {
        // body not JSON; keep statusText
      }
      throw new ApiError(res.status, detail);
    }
    const body = (await res.json()) as unknown;
    return schema.parse(body);
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    const data = (await res.json()) as unknown;
    return schema.parse(data);
  }
}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
