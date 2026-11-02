import { isWorkspaceId, type WorkspaceId } from "@teammate/shared";

import { createClient } from "../supabase/client";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceMembership {
  readonly workspaceId: WorkspaceId;
  readonly role: WorkspaceRole;
}

export interface MembershipResult {
  readonly membership: WorkspaceMembership | null;
  readonly reason: MembershipFailure | null;
}

export type MembershipFailure =
  | "unauthenticated"
  | "not_a_member"
  | "lookup_failed";

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  const roles: readonly string[] = ["owner", "admin", "member", "viewer"];
  return typeof value === "string" && roles.includes(value);
}

export async function resolveMembership(
  workspaceId: WorkspaceId,
): Promise<MembershipResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { membership: null, reason: "lookup_failed" };
  }

  if (!user) {
    return { membership: null, reason: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { membership: null, reason: "lookup_failed" };
  }

  if (!data) {
    return { membership: null, reason: "not_a_member" };
  }

  const rowWorkspaceId: unknown = data.workspace_id;
  const rowRole: unknown = data.role;

  if (!isWorkspaceId(rowWorkspaceId)) {
    return { membership: null, reason: "lookup_failed" };
  }

  if (!isWorkspaceRole(rowRole)) {
    return { membership: null, reason: "lookup_failed" };
  }

  return {
    membership: { workspaceId: rowWorkspaceId, role: rowRole },
    reason: null,
  };
}
