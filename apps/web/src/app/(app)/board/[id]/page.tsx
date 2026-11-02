"use client";

import { use } from "react";

import { BoardShell } from "@/components/board/BoardShell";

export default function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <BoardShell boardId={id} />;
}
