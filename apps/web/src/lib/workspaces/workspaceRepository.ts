import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isWorkspaceId,
  isWorkspaceRole,
  type WorkspaceId,
  type WorkspaceRole,
} from "@teammate/shared";

export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface WorkspaceRepository {
  list(): Promise<WorkspaceSummary[]>;
  create(name: string, slug: string): Promise<WorkspaceSummary>;
}

function validateSummary(row: Record<string, unknown>): WorkspaceSummary | null {
  const id = row.id;
  const name = row.name;
  const slug = row.slug;
  const role = row.role;

  if (!isWorkspaceId(id)) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof slug !== "string" || slug.length === 0) return null;
  if (!isWorkspaceRole(role)) return null;

  return { id, name, slug, role };
}

export function createWorkspaceRepository(
  client: SupabaseClient,
): WorkspaceRepository {
  return {
    async list(): Promise<WorkspaceSummary[]> {
      const { data, error } = await client
        .from("workspace_members")
        .select(
          `
          workspaces:id (
            id,
            name,
            slug
          ),
          role
        `,
        );

      if (error || !data) return [];

      const summaries: WorkspaceSummary[] = [];
      for (const row of data) {
        const wsList = row.workspaces;
        if (!Array.isArray(wsList) || wsList.length === 0) continue;
        const ws = wsList[0];
        if (!ws || typeof ws !== "object") continue;
        const wsRecord = ws as unknown as Record<string, unknown>;
        const candidate: Record<string, unknown> = {
          id: wsRecord.id,
          name: wsRecord.name,
          slug: wsRecord.slug,
          role: row.role,
        };
        const validated = validateSummary(candidate);
        if (validated) summaries.push(validated);
      }
      return summaries;
    },

    async create(
      name: string,
      slug: string,
    ): Promise<WorkspaceSummary> {
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();

      if (authError || !user) {
        throw new Error("User must be authenticated to create a workspace");
      }

      const { data, error } = await client
        .from("workspaces")
        .insert({ name, slug, created_by: user.id })
        .select("id, name, slug")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to create workspace");
      }

      const id = data.id;
      if (!isWorkspaceId(id)) {
        throw new Error("Invalid workspace id returned from database");
      }

      return {
        id,
        name: data.name as string,
        slug: data.slug as string,
        role: "owner",
      };
    },
  };
}