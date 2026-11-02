import { ulid } from "ulid";
import type { CardId } from "@teammate/shared";

// ---------------------------------------------------------------------------
// Optimistic mutation queue
// ---------------------------------------------------------------------------

export interface OptimisticMutation {
  readonly id: string;
  readonly cardId: CardId;
  readonly type: "create" | "update" | "delete";
  readonly payload: unknown;
  readonly queuedAt: string;
}

export class OptimisticQueue {
  private readonly mutations = new Map<string, OptimisticMutation>();
  private readonly order: string[] = [];
  private readonly applied = new Set<string>();

  enqueue(mutation: Omit<OptimisticMutation, "id" | "queuedAt">): string {
    const id = ulid();
    if (this.mutations.has(id)) {
      return id;
    }
    const entry: OptimisticMutation = {
      ...mutation,
      id,
      queuedAt: new Date().toISOString(),
    };
    this.mutations.set(id, entry);
    this.order.push(id);
    return id;
  }

  get pending(): readonly OptimisticMutation[] {
    return this.snapshot();
  }

  get count(): number {
    return this.mutations.size;
  }

  applyEcho(id: string): boolean {
    if (!this.mutations.has(id) || this.applied.has(id)) {
      return false;
    }
    this.applied.add(id);
    return true;
  }

  ack(id: string): boolean {
    const index = this.order.indexOf(id);
    if (index === -1) {
      return false;
    }
    this.order.splice(index, 1);
    this.mutations.delete(id);
    this.applied.delete(id);
    return true;
  }

  drop(id: string): boolean {
    return this.ack(id);
  }

  drain(): OptimisticMutation[] {
    const result = this.snapshot();
    this.order.length = 0;
    this.mutations.clear();
    this.applied.clear();
    return result;
  }

  reconnect(): OptimisticMutation[] {
    return this.snapshot();
  }

  clear(): void {
    this.order.length = 0;
    this.mutations.clear();
    this.applied.clear();
  }

  private snapshot(): OptimisticMutation[] {
    const seen = new Set<string>();
    const result: OptimisticMutation[] = [];
    for (const id of this.order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = this.mutations.get(id);
      if (entry) {
        result.push(entry);
      }
    }
    return result;
  }
}
