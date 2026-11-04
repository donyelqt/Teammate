import { describe, it, expect } from "vitest";
import type { CardId, ListId } from "@teammate/shared";
import { isCardId, isListId } from "@teammate/shared";
import { cardReducer, createCardState, isPending } from "./cardReducer";

function toCardId(raw: string): CardId {
  if (!isCardId(raw)) throw new Error("invalid card id");
  return raw as CardId;
}

function toListId(raw: string): ListId {
  if (!isListId(raw)) throw new Error("invalid list id");
  return raw as ListId;
}

function card(overrides: Partial<{
  id: CardId;
  list_id: ListId;
  title: string;
  position: number;
}> = {}) {
  return {
    id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    list_id: toListId("11111111-2222-3333-4444-555555555555"),
    title: "Card",
    position: 0,
    ...overrides,
  };
}

describe("cardReducer", () => {
  it("hydrates from server cards", () => {
    const s = createCardState();
    const c = card({ position: 1 });
    const next = cardReducer(s, { type: "hydrate", cards: [c] });
    expect(next.cards).toEqual([c]);
    expect(next.pending.size).toBe(0);
  });

  it("optimistic create adds card and marks pending", () => {
    const s = createCardState();
    const c = card();
    const next = cardReducer(s, {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    expect(next.cards).toEqual([c]);
    expect(isPending(next, c.id)).toBe(true);
  });

  it("optimistic update changes title and marks pending", () => {
    const c = card();
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    const next = cardReducer(s, {
      type: "optimistic",
      mutation: { kind: "update", cardId: c.id, title: "New" },
    });
    expect(next.cards.map((x) => x.title)).toEqual(["New"]);
    expect(isPending(next, c.id)).toBe(true);
  });

  it("optimistic delete removes card and marks pending", () => {
    const c = card();
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    const next = cardReducer(s, {
      type: "optimistic",
      mutation: { kind: "delete", cardId: c.id },
    });
    expect(next.cards).toEqual([]);
    expect(isPending(next, c.id)).toBe(true);
  });

  it("ack clears pending", () => {
    const c = card();
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    const next = cardReducer(s, { type: "ack", cardId: c.id });
    expect(isPending(next, c.id)).toBe(false);
  });

  it("remoteUpsert replaces existing card by id", () => {
    const c = card({ title: "Old" });
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    const updated = card({ title: "New" });
    const next = cardReducer(s, { type: "remoteUpsert", card: updated });
    expect(next.cards).toEqual([updated]);
  });

  it("remoteUpsert appends new card", () => {
    const c1 = card({ position: 0 });
    const c2 = card({
      id: toCardId("bbbbbbbb-cccc-dddd-eeee-ffffffffffff"),
      position: 1,
    });
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c1 },
    });
    const next = cardReducer(s, { type: "remoteUpsert", card: c2 });
    expect(next.cards).toEqual([c1, c2]);
  });

  it("remoteDelete removes card", () => {
    const c = card();
    const s = cardReducer(createCardState(), {
      type: "optimistic",
      mutation: { kind: "create", card: c },
    });
    const next = cardReducer(s, { type: "remoteDelete", cardId: c.id });
    expect(next.cards).toEqual([]);
  });
});