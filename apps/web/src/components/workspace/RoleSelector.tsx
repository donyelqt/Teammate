"use client";

import { useCallback, useState } from "react";

interface MemberSummary {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
}

interface RoleSelectorProps {
  workspaceId: string;
  members: MemberSummary[];
  currentRole: "owner" | "admin" | "member" | "viewer";
  currentUserId: string;
  onChange: (
    workspaceId: string,
    userId: string,
    role: "owner" | "admin" | "member" | "viewer",
  ) => void;
}

const ROLES: readonly ("owner" | "admin" | "member" | "viewer")[] = [
  "owner",
  "admin",
  "member",
  "viewer",
];

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-amber-500/20 text-amber-300",
  admin: "bg-blue-500/20 text-blue-300",
  member: "bg-green-500/20 text-green-300",
  viewer: "bg-zinc-500/20 text-zinc-300",
};

export function RoleSelector({
  workspaceId,
  members,
  currentRole,
  currentUserId,
  onChange,
}: RoleSelectorProps) {
  const canManage = currentRole === "owner" || currentRole === "admin";

  const handleChange = useCallback(
    (userId: string, role: "owner" | "admin" | "member" | "viewer") => {
      onChange(workspaceId, userId, role);
    },
    [workspaceId, onChange],
  );

  if (!canManage) return null;

  return (
    <div className="rounded-md border border-zinc-700 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-300">Members</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="pb-2">Name</th>
            <th className="pb-2">Email</th>
            <th className="pb-2">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const disabled = !canManage || isSelf;
            return (
              <tr key={member.userId} className="border-t border-zinc-800">
                <td className="py-2 text-zinc-100">
                  {member.displayName || "—"}
                </td>
                <td className="py-2 text-zinc-400">{member.email || "—"}</td>
                <td className="py-2">
                  <span
                    className={`mr-2 inline-block rounded px-2 py-0.5 text-xs ${ROLE_BADGE[member.role] ?? ""}`}
                  >
                    {member.role}
                  </span>
                  <select
                    value={member.role}
                    disabled={disabled}
                    onChange={(e) =>
                      handleChange(
                        member.userId,
                        e.target.value as "owner" | "admin" | "member" | "viewer",
                      )
                    }
                    className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-100 disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}