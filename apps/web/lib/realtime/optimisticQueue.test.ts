import { describe, it, expect } from "vitest";
import { isCardId } from "@teammate/shared";
import type { CardId } from "@teammate/shared";
import type { OptimisticMutation } from "./optimisticQueue";
import { OptimisticQueue } from "./optimisticQueue";

const mkCardId = (s: string): CardId => {
  expect(isCardId(s)).toBe(true);
  return s as CardId;
};

const CARD_ID = mkCardId("00000000-0000-4000-8000-000000000001");

describe("OptimisticQueue", () => {
  it("echo updates, does not append", () => {
    const queue = new OptimisticQueue();
    const id1 = queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M1" },
    });
    expect(queue.applyEcho(id1)).toBe(true);
    expect(queue.pending).toHaveLength(1);
    expect(queue.applyEcho(id1)).toBe(false);
  });

  it("duplicate echo yields no duplicate card", () => {
    const queue = new OptimisticQueue();
    const id1 = queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M1" },
    });
    // Duplicate echo: applyEcho twice, second returns false
    expect(queue.applyEcho(id1)).toBe(true);
    expect(queue.applyEcho(id1)).toBe(false);
    // Low-level path: simulate duplicate enqueue with same id via internal state.
    // Cast needed to reach private fields for dedup testing; no runtime risk.
    const internal = queue as unknown as {
      mutations: Map<string, OptimisticMutation>;
      order: string[];
    };
    expect(internal.mutations.has(id1)).toBe(true);
    internal.order.push(id1);
    // drain returns exactly 1 entry (deduplication via snapshot)
    expect(queue.drain()).toHaveLength(1);
  });

  it("reconnect then drain yields no duplicates after 20 edits", () => {
    const queue = new OptimisticQueue();
    for (let i = 0; i < 20; i++) {
      queue.enqueue({ cardId: CARD_ID, type: "update", payload: { i } });
    }
    expect(queue.reconnect()).toHaveLength(20);
    expect(queue.count).toBe(20);
    expect(queue.drain()).toHaveLength(20);
    expect(queue.drain()).toHaveLength(0);
  });

  it("ack/drop/unknown", () => {
    const queue = new OptimisticQueue();
    const id1 = queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M1" },
    });
    const id2 = queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M2" },
    });
    expect(queue.ack(id1)).toBe(true);
    expect(queue.pending).toHaveLength(1);
    expect(queue.drop(id2)).toBe(true);
    expect(queue.pending).toHaveLength(0);
    expect(queue.ack("nope")).toBe(false);
    expect(queue.drop("nope")).toBe(false);
  });

  it("oldest-first ordering", () => {
    const queue = new OptimisticQueue();
    queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M1" },
    });
    queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M2" },
    });
    queue.enqueue({
      cardId: CARD_ID,
      type: "create",
      payload: { title: "M3" },
    });
    expect(queue.pending.map((m) => m.payload)).toEqual([
      { title: "M1" },
      { title: "M2" },
      { title: "M3" },
    ]);
    expect(queue.drain().map((m) => m.payload)).toEqual([
      { title: "M1" },
      { title: "M2" },
      { title: "M3" },
    ]);
  });
});
