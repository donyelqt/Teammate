import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { WorkspaceSwitcher } from "@/components/workspace/Switcher";
import { createWorkspaceRepository } from "@/lib/workspaces/workspaceRepository";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceSummary } from "@/lib/workspaces/workspaceRepository";
import "./globals.css";

export const metadata = {
  title: "Teammate",
  description: "Real-time collaborative kanban workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const repository = createWorkspaceRepository(createClient());
    repository.list().then((list) => {
      setWorkspaces(list);
      const first = list[0];
      if (first) {
        setCurrentWorkspaceId(first.id);
      }
    });
  }, []);

  function handleSelect(workspaceId: string) {
    setCurrentWorkspaceId(workspaceId);
  }

  function handleCreate(name: string, slug: string) {
    const repository = createWorkspaceRepository(createClient());
    repository
      .create(name, slug)
      .then((created) => {
        setWorkspaces((prev) => [...prev, created]);
        setCurrentWorkspaceId(created.id);
      })
      .catch(() => {
        // Silently ignore — error boundary or toast could go here
      });
  }

  return (
    <html lang="en">
      <body>
        <header>
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspaceId={currentWorkspaceId}
            onSelect={handleSelect}
            onCreate={handleCreate}
          />
        </header>
        {children}
      </body>
    </html>
  );
}