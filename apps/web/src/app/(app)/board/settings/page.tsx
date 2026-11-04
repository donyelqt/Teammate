"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { isWorkspaceId } from "@teammate/shared";

import { InviteBySlug } from "@/components/workspace/InviteBySlug";
import { RoleSelector } from "@/components/workspace/RoleSelector";
import {
  createMemberRepository,
  type MemberSummary,
} from "@/lib/workspaces/memberRepository";
import { createClient } from "@/lib/supabase/client";
import { resolveMembership } from "@/lib/auth/workspace";

interface SettingsPageProps {
  searchParams: Promise<{ workspaceId?: string }>;
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolved = use(searchParams);
  const workspaceId = resolved.workspaceId ?? "";

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [slug, setSlug] = useState("");
  const [currentRole, setCurrentRole] = useState<
    "owner" | "admin" | "member" | "viewer"
  >("viewer");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const repo = createMemberRepository(supabase);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const membership = isWorkspaceId(workspaceId)
          ? await resolveMembership(workspaceId)
          : { membership: null, reason: "lookup_failed" as const };

        if (!membership.membership) {
          throw new Error("Not a member of this workspace");
        }

        if (cancelled) return;

        setCurrentRole(membership.membership.role);
        setCurrentUserId(user.id);

        const [membersResult, slugResult] = await Promise.all([
          repo.list(workspaceId),
          supabase
            .from("workspaces")
            .select("slug")
            .eq("id", workspaceId)
            .single(),
        ]);

        if (cancelled) return;

        setMembers(membersResult);
        if (slugResult.data?.slug) setSlug(slugResult.data.slug);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleRoleChange = async (
    wsId: string,
    userId: string,
    role: "owner" | "admin" | "member" | "viewer",
  ) => {
    const supabase = createClient();
    const repo = createMemberRepository(supabase);

    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, role } : m)),
    );

    try {
      await repo.updateRole(wsId, userId, role);
    } catch (err) {
      // Revert on failure
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: m.role } : m)),
      );
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleInvite = async () => {
    if (!slug) return;
    const link = `${window.location.origin}/invite/${slug}`;
    await navigator.clipboard.writeText(link);
  };

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-6">
        <p className="text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-6">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
        Workspace settings
      </h1>

      <div className="flex flex-col gap-6">
        <InviteBySlug slug={slug} onInvite={handleInvite} />

        {currentRole !== "viewer" && (
          <RoleSelector
            workspaceId={workspaceId}
            members={members}
            currentRole={currentRole}
            currentUserId={currentUserId}
            onChange={handleRoleChange}
          />
        )}
      </div>
    </main>
  );
}