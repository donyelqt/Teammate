import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  type WorkspaceId,
  type WorkspaceRole,
} from "@teammate/shared";

export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string, slug: string) => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onSelect,
  onCreate,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const currentWorkspace = workspaces.find(
    (w) => w.id === currentWorkspaceId,
  );

  useEffect(() => {
    if (!isOpen) {
      setShowCreateForm(false);
      setCreateName("");
      setCreateSlug("");
      setFocusedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (createName && !createSlug) {
      setCreateSlug(slugify(createName));
    }
  }, [createName, createSlug]);


  const handleSelect = useCallback(
    (id: WorkspaceId) => {
      onSelect(id);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleCreateSubmit = useCallback(() => {
    const name = createName.trim();
    const slug = createSlug.trim();
    if (!name || !slug) return;
    onCreate(name, slug);
    setShowCreateForm(false);
    setCreateName("");
    setCreateSlug("");
    setIsOpen(false);
  }, [createName, createSlug, onCreate]);

  const handleCreateCancel = useCallback(() => {
    setShowCreateForm(false);
    setCreateName("");
    setCreateSlug("");
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (showCreateForm) return;

      const count = workspaces.length;
      if (count === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const ws = workspaces[focusedIndex];
        if (ws) handleSelect(ws.id);
      }
    },
    [isOpen, showCreateForm, workspaces, focusedIndex, handleSelect],
  );



  const handleCreateKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCreateCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleCreateSubmit();
      }
    },
    [handleCreateCancel, handleCreateSubmit],
  );

  const items: ReactNode[] = workspaces.map((ws, idx) => (
    <li key={ws.id}>
      <button
        type="button"
        className={`workspace-switcher-item ${
          idx === focusedIndex ? "focused" : ""
        } ${ws.id === currentWorkspaceId ? "active" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded`}
      >
        <span className="workspace-switcher-name">{ws.name}</span>
        <span className="workspace-switcher-role">{ws.role}</span>
      </button>
    </li>
  ));

  return (
    <div
      ref={containerRef}
      className="workspace-switcher"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        aria-label={`Switch to ${currentWorkspace ? currentWorkspace.name : "select workspace"}`}
        className="workspace-switcher-trigger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
      >
        <span className="workspace-switcher-current">
          {currentWorkspace ? currentWorkspace.name : "Select workspace"}
        </span>
        <span className="workspace-switcher-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="workspace-switcher-dropdown">
          <ul
            ref={listRef}
            className="workspace-switcher-list"
            role="listbox"
          >
            {items.length > 0 ? (
              items
            ) : (
              <li className="workspace-switcher-empty">No workspaces</li>
            )}
          </ul>

          {showCreateForm ? (
            <form
              className="workspace-switcher-create-form"
              onSubmit={handleCreateSubmit}
              onKeyDown={handleCreateKeyDown}
            >
              <label className="sr-only" htmlFor="ws-name">
                Workspace name
              </label>
              <input
                id="ws-name"
                type="text"
                placeholder="Workspace name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoFocus
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded px-2 py-1"
              />
              <label className="sr-only" htmlFor="ws-slug">
                Slug
              </label>
              <input
                id="ws-slug"
                type="text"
                placeholder="slug"
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded px-2 py-1"
              />
              <div className="workspace-switcher-create-actions">
                <button
                  type="submit"
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded px-2 py-1"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={handleCreateCancel}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="workspace-switcher-create">
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded px-2 py-1"
              >
                + Create workspace
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}