import type { OptimisticMutation, OptimisticQueue } from "./optimisticQueue";

export type DrainError =
  | { readonly kind: "transport" }
  | { readonly kind: "conflict"; readonly remote: unknown }
  | { readonly kind: "fatal"; readonly reason: string };

export type DrainAttempt =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DrainError };

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly factor: number;
  readonly jitter: number;
}

export type PartialBackoffPolicy = {
  readonly [K in keyof BackoffPolicy]?: BackoffPolicy[K];
};

export const DEFAULT_BACKOFF_POLICY: BackoffPolicy = {
  baseMs: 1000,
  maxMs: 30000,
  factor: 2,
  jitter: 0.25,
};

export function nextDelay(attempt: number, policy: BackoffPolicy): number {
  const capped = Math.min(
    policy.baseMs * Math.pow(policy.factor, attempt),
    policy.maxMs,
  );

  const spread = capped * clamp(policy.jitter, 0, 1);
  return clamp(capped + (Math.random() * 2 - 1) * spread, 0, policy.maxMs);
}

export type DrainSummary = {
  readonly sent: number;
  readonly conflicts: readonly DropRecord[];
  readonly stopped: string | null;
  readonly queuedRemaining: number;
  readonly attempts: number;
};

export type DropRecord = {
  readonly mutationId: string;
  readonly remote: unknown;
};

type PendingAttempt = {
  readonly mutation: OptimisticMutation;
  readonly retries: number;
};

type RunState =
  | { readonly kind: "running" }
  | { readonly kind: "stopped"; readonly reason: string };

export class ReconnectDrain {
  private readonly queue: OptimisticQueue;
  private readonly send: (
    mutation: OptimisticMutation,
  ) => Promise<DrainAttempt>;
  private readonly policy: BackoffPolicy;
  private state: RunState;

  constructor(
    queue: OptimisticQueue,
    send: (mutation: OptimisticMutation) => Promise<DrainAttempt>,
    policy?: PartialBackoffPolicy,
  ) {
    this.queue = queue;
    this.send = send;
    this.policy =
      policy === undefined
        ? DEFAULT_BACKOFF_POLICY
        : {
            baseMs: policy.baseMs ?? DEFAULT_BACKOFF_POLICY.baseMs,
            maxMs: policy.maxMs ?? DEFAULT_BACKOFF_POLICY.maxMs,
            factor: policy.factor ?? DEFAULT_BACKOFF_POLICY.factor,
            jitter: policy.jitter ?? DEFAULT_BACKOFF_POLICY.jitter,
          };
    this.state = { kind: "running" };
  }

  
  async drain(): Promise<DrainSummary> {
    this.state = { kind: "running" };
    return this.run();
  }

  
  async drainAndStop(): Promise<DrainSummary> {
    this.state = { kind: "stopped", reason: "stopped at first failure" };
    return this.run();
  }

  
  protected wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async run(): Promise<DrainSummary> {
    let sentCount = 0;
    let attemptCount = 0;
    let stopped: string | null = null;
    const conflicts: DropRecord[] = [];

    let pending: PendingAttempt[] = this.queue.reconnect().map((mutation) => ({
      mutation,
      retries: 0,
    }));

    while (pending.length > 0) {

      const index = nextAttempt(pending);
      const entry = pending[index];
      if (entry === undefined) {
        break;
      }

      if (entry.retries > 0) {

        await this.wait(nextDelay(entry.retries - 1, this.policy));
      }
      attemptCount += 1;

      const outcome = await this.attempt(entry.mutation);

      if (outcome.ok) {
        sentCount += 1;
        this.queue.ack(entry.mutation.id);
        pending = removeAt(pending, index);
        continue;
      }

      switch (outcome.error.kind) {
        case "conflict": {

          conflicts.push({
            mutationId: entry.mutation.id,
            remote: outcome.error.remote,
          });
          this.queue.ack(entry.mutation.id);
          pending = removeAt(pending, index);
          continue;
        }
        case "fatal": {
          stopped = outcome.error.reason;
          return this.summarise(sentCount, conflicts, stopped, attemptCount);
        }
        case "transport": {
          if (this.state.kind === "stopped") {
            stopped = this.state.reason;
            return this.summarise(sentCount, conflicts, stopped, attemptCount);
          }
          pending = bumpRetry(pending, index);
          continue;
        }
      }
    }

    return this.summarise(sentCount, conflicts, stopped, attemptCount);
  }

  
  private async attempt(
    mutation: OptimisticMutation,
  ): Promise<DrainAttempt> {
    try {
      return await this.send(mutation);
    } catch {
      return { ok: false, error: { kind: "transport" } };
    }
  }

  private summarise(
    sentCount: number,
    conflicts: readonly DropRecord[],
    stopped: string | null,
    attemptCount: number,
  ): DrainSummary {
    return {
      sent: sentCount,
      conflicts,
      stopped,
      queuedRemaining: this.queue.count,
      attempts: attemptCount,
    };
  }
}

function nextAttempt(pending: readonly PendingAttempt[]): number {
  let best = 0;
  for (let i = 1; i < pending.length; i += 1) {
    const candidate = pending[i];
    const current = pending[best];
    if (
      candidate !== undefined &&
      current !== undefined &&
      candidate.retries < current.retries
    ) {
      best = i;
    }
  }
  return best;
}

function removeAt(
  pending: readonly PendingAttempt[],
  index: number,
): PendingAttempt[] {
  return pending.filter((_, i) => i !== index);
}

function bumpRetry(
  pending: readonly PendingAttempt[],
  index: number,
): PendingAttempt[] {
  const entry = pending[index];
  if (entry === undefined) {
    return [...pending];
  }
  return pending.map((candidate, i) =>
    i === index
      ? { mutation: candidate.mutation, retries: entry.retries + 1 }
      : candidate,
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
