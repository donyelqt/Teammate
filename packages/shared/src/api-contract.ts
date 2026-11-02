/**
 * API contract between the web app and the FastAPI service.
 *
 * Every response that crosses the FastAPI boundary is parsed here with zod
 * before it reaches application code. `unknown` enters; a typed value leaves.
 * Nothing downstream trusts a raw `Response.json()`.
 */

import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const BoardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
});

export type Board = z.infer<typeof BoardSchema>;

export const CardSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  list_id: z.string().uuid(),
  title: z.string(),
  position: z.number().int().nonnegative(),
});

export type Card = z.infer<typeof CardSchema>;

export const CardsResponseSchema = z.array(CardSchema);

export type CardsResponse = z.infer<typeof CardsResponseSchema>;

export const ApiErrorSchema = z.object({
  detail: z.string(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
