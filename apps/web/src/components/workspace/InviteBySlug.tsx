"use client";

import { useCallback, useState } from "react";

interface InviteBySlugProps {
  slug: string;
  onInvite: (slug: string) => void;
}

export function InviteBySlug({ slug, onInvite }: InviteBySlugProps) {
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/invite/${slug}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleInvite = useCallback(() => {
    onInvite(slug);
  }, [slug, onInvite]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-700 p-4">
      <label className="text-sm font-medium text-zinc-300">
        Invite link
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={inviteLink}
          className="flex-1 rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
        >
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>
      <button
        type="button"
        onClick={handleInvite}
        className="self-start text-sm text-zinc-400 underline hover:text-zinc-200"
      >
        Invite
      </button>
    </div>
  );
}