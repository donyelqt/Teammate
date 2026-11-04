import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserId, isWorkspaceId } from "@teammate/shared";

export interface MemberSummary {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
}

export interface MemberRepository {
  list(workspaceId: string): Promise<MemberSummary[]>;
  updateRole(
    workspaceId: string,
    userId: string,
    role: "owner" | "admin" | "member" | "viewer",
  ): Promise<void>;
  regenerateSlug(workspaceId: string): Promise<string>;
}

const ROLES: readonly string[] = ["owner", "admin", "member", "viewer"];

function isRole(value: unknown): value is MemberSummary["role"] {
  return typeof value === "string" && ROLES.includes(value);
}

interface MemberRow {
  user_id: string;
  workspace_id: string;
  role: string;
}

interface UserRow {
  id: string;
  email: string;
  raw_user_meta_data: Record<string, unknown>;
}

function toMemberSummary(
  row: MemberRow,
  user: UserRow | null,
): MemberSummary | null {
  if (!isUserId(row.user_id)) return null;
  if (!isWorkspaceId(row.workspace_id)) return null;
  if (!isRole(row.role)) return null;

  const displayName =
    typeof user?.raw_user_meta_data?.display_name === "string"
      ? (user.raw_user_meta_data.display_name as string)
      : "";
  const email = typeof user?.email === "string" ? user.email : "";

  return { userId: row.user_id, displayName, email, role: row.role };
}

export function createMemberRepository(
  client: SupabaseClient,
): MemberRepository {
  return {
    async list(workspaceId) {
      const { data, error } = await client
        .from("workspace_members")
        .select("user_id, workspace_id, role")
        .eq("workspace_id", workspaceId);

      if (error) throw new Error(error.message);

      const rows: MemberRow[] = [];
      for (const row of data ?? []) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        if (typeof r.user_id !== "string") continue;
        if (typeof r.workspace_id !== "string") continue;
        if (typeof r.role !== "string") continue;
        rows.push({
          user_id: r.user_id,
          workspace_id: r.workspace_id,
          role: r.role,
        });
      }

      if (rows.length === 0) return [];

      const userIds = rows.map((r) => r.user_id);
      const { data: userData, error: userError } = await client
        .from("auth.users")
        .select("id, email, raw_user_meta_data")
        .in("id", userIds);

      if (userError) throw new Error(userError.message);

      const userMap = new Map<string, UserRow>();
      for (const u of userData ?? []) {
        if (!u || typeof u !== "object") continue;
        const ur = u as Record<string, unknown>;
        if (typeof ur.id !== "string") continue;
        userMap.set(ur.id, {
          id: ur.id,
          email: typeof ur.email === "string" ? ur.email : "",
          raw_user_meta_data:
            ur.raw_user_meta_data &&
            typeof ur.raw_user_meta_data === "object"
              ? (ur.raw_user_meta_data as Record<string, unknown>)
              : {},
        });
      }

      const members: MemberSummary[] = [];
      for (const row of rows) {
        const member = toMemberSummary(row, userMap.get(row.user_id) ?? null);
        if (member) members.push(member);
      }
      return members;
    },

    async updateRole(workspaceId, userId, role) {
      const { error } = await client
        .from("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
    },

    async regenerateSlug(workspaceId) {
      const { data, error } = await client.rpc(
        "generate_workspace_slug",
        { p_workspace_id: workspaceId },
      );

      if (error) throw new Error(error.message);
      if (typeof data !== "string" || data.length === 0) {
        throw new Error("regenerateSlug returned an empty slug");
      }
      return data;
    },
  };
}