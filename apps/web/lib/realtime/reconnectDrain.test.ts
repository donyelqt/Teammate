import { describe, it, expect, vi, afterEach } from "vitest";
import { isCardId } from "@teammate/shared";
import type { CardId } from "@teammate/shared";
import type { OptimisticMutation } from "./optimisticQueue";
import { OptimisticQueue } from "./optimisticQueue";
import type { BackoffPolicy, DrainAttempt } from "./reconnectDrain";
import { nextDelay, ReconnectDrain } from "./reconnectDrain";

const mkCardId = (s: string): CardId => {
  expect(isCardId(s)).toBe(true);
  return s as CardId;
};

const CARD_ID = mkCardId("00000000-0000-4000-8000-000000000001");

const POLICY: BackoffPolicy = { baseMs: 100, maxMs: 30000, factor: 2, jitter: 0 };

const attemptOk: DrainAttempt = { ok: true };

const seedRandom = (value: number): void => {
  vi.spyOn(Math, "random").mockReturnValue(value);
};

const readIndex = (payload: unknown): number => {
  if (typeof payload === "object" && payload !== null && "i" in payload) {
    const value: unknown = payload.i;
    if (typeof value === "number") {
      return value;
    }
  }
  throw new Error("payload did not carry a numeric i");
};

const transportFailure = (): Promise<DrainAttempt> =>
  Promise.reject({ kind: "transport" } as const);

const conflictFailure = (remote: unknown): DrainAttempt => ({
  ok: false,
  error: { kind: "conflict", remote },
});

const fatalFailure = (reason: string): DrainAttempt => ({
  ok: false,
  error: { kind: "fatal", reason },
});

const buildQueue = (n: number): OptimisticQueue => {
  const queue = new OptimisticQueue();
  for (let i = 0; i < n; i += 1) {
    queue.enqueue({ cardId: CARD_ID, type: "update", payload: { i } });
  }
  return queue;
};

/** Drain whose waits resolve immediately, so only their sizes are asserted. */
class RecordingDrain extends ReconnectDrain {
  readonly delays: number[] = [];

  protected override wait(ms: number): Promise<void> {
    this.delays.push(ms);
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// B + G. Backoff arithmetic
// ---------------------------------------------------------------------------

describe("nextDelay", () => {
  it("B. exponential growth, jitter 0", () => {
    seedRandom(0);
    const expected = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];
    for (const [attempt, delay] of expected.entries()) {
      expect(nextDelay(attempt, POLICY)).toBe(delay);
    }
  });

  it("B. jitter 0.5 stays inside [0.5d, 1.5d]", () => {
    seedRandom(0);
    const jittered: BackoffPolicy = { ...POLICY, jitter: 0.5 };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const base = nextDelay(attempt, POLICY);
      const delay = nextDelay(attempt, jittered);
      expect(delay).toBeGreaterThanOrEqual(base * 0.5);
      expect(delay).toBeLessThanOrEqual(base * 1.5);
    }
  });

  it("B. jitter reaches both ends of the band", () => {
    const jittered: BackoffPolicy = { ...POLICY, jitter: 0.5 };
    seedRandom(0);
    expect(nextDelay(0, jittered)).toBe(50);
    seedRandom(0.999999);
    expect(nextDelay(0, jittered)).toBeCloseTo(149.99, 1);
  });

  it("B. attempts past the cap return exactly maxMs", () => {
    // base 100 doubling reaches the 30s cap at attempt 9 (51200ms), so only
    // attempts from 9 up are capped.
    expect(nextDelay(8, POLICY)).toBe(25600);
    for (const attempt of [9, 12, 20, 60]) {
      expect(nextDelay(attempt, POLICY)).toBe(30000);
    }
  });

  it("G. never negative and never above maxMs for jitter 1.0", () => {
    const wild: BackoffPolicy = { ...POLICY, jitter: 1 };
    for (let attempt = 0; attempt <= 60; attempt += 1) {
      const delay = nextDelay(attempt, wild);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(wild.maxMs);
    }
  });

  it("is deterministic under stubbed randomness", () => {
    seedRandom(0.25);
    expect(nextDelay(3, POLICY)).toBe(nextDelay(3, POLICY));
  });
});

// ---------------------------------------------------------------------------
// A. Serial drain
// ---------------------------------------------------------------------------

describe("serial drain", () => {
  it("A. one send per mutation, oldest first, never concurrent", async () => {
    const queue = buildQueue(5);
    const calls: number[] = [];
    let inFlight = 0;
    let overlapped = false;

    // Fake timers keep the per-send delay virtual, so no real time is spent.
    vi.useFakeTimers();

    const send = (mutation: OptimisticMutation): Promise<DrainAttempt> => {
      const index = readIndex(mutation.payload);
      if (inFlight > 0) {
        overlapped = true;
      }
      inFlight += 1;
      calls.push(index);
      return new Promise<DrainAttempt>((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve(attemptOk);
        }, 5);
      });
    };

    const run = new ReconnectDrain(queue, send, POLICY).drain();
    await vi.advanceTimersByTimeAsync(100);
    const summary = await run;

    expect(overlapped).toBe(false);
    expect(calls).toEqual([0, 1, 2, 3, 4]);
    expect(summary.sent).toBe(5);
    expect(summary.conflicts).toHaveLength(0);
    expect(summary.stopped).toBeNull();
    expect(queue.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C. Transport failure keeps work
// ---------------------------------------------------------------------------

describe("transport failures", () => {
  it("C. drainAndStop keeps every mutation queued, sends nothing", async () => {
    const queue = buildQueue(3);
    let sends = 0;
    const send = (): Promise<DrainAttempt> => {
      sends += 1;
      return transportFailure();
    };

    const summary = await new ReconnectDrain(queue, send, POLICY).drainAndStop();

    expect(sends).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.stopped).not.toBeNull();
    expect(queue.count).toBe(3);
  });

  it("C. drain retries until the transport recovers", async () => {
    const queue = buildQueue(4);
    let sends = 0;
    const send = (): Promise<DrainAttempt> => {
      sends += 1;
      return Promise.resolve(
        sends <= 6
          ? ({ ok: false, error: { kind: "transport" } } as const)
          : attemptOk,
      );
    };

    const drain = new RecordingDrain(queue, send, {
      baseMs: 100,
      maxMs: 1000,
      factor: 2,
      jitter: 0,
    });
    const summary = await drain.drain();

    expect(summary.sent).toBe(4);
    expect(summary.attempts).toBe(sends);
    expect(queue.count).toBe(0);
    expect(drain.delays.every((ms) => ms <= 1000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. Conflicts drop
// ---------------------------------------------------------------------------

describe("conflicts", () => {
  it("D. conflicted mutations are dropped and recorded, others sent", async () => {
    const queue = buildQueue(4);
    const targetIds = [queue.pending[1]?.id, queue.pending[3]?.id];
    const remote = { serverVersion: 7 };

    const summary = await new ReconnectDrain(
      queue,
      (mutation) =>
        Promise.resolve(
          targetIds.includes(mutation.id) ? conflictFailure(remote) : attemptOk,
        ),
      POLICY,
    ).drain();

    expect(summary.sent).toBe(2);
    expect(summary.conflicts).toHaveLength(2);
    expect(summary.conflicts.map((record) => record.mutationId)).toEqual(
      targetIds,
    );
    expect(summary.conflicts.every((record) => record.remote === remote)).toBe(
      true,
    );
    expect(queue.count).toBe(0);
  });

  it("D. queue count falls by exactly the conflict count", async () => {
    const queue = buildQueue(6);
    const ids = queue.pending.map((mutation) => mutation.id);
    const conflicted = new Set([ids[2], ids[4]]);
    let sends = 0;

    const summary = await new ReconnectDrain(
      queue,
      (mutation) => {
        sends += 1;
        return Promise.resolve(
          conflicted.has(mutation.id)
            ? conflictFailure("stale")
            : attemptOk,
        );
      },
      POLICY,
    ).drain();

    expect(sends).toBe(6);
    expect(summary.sent).toBe(4);
    expect(summary.conflicts).toHaveLength(2);
    expect(queue.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. Fatal stops
// ---------------------------------------------------------------------------

describe("fatal errors", () => {
  it("E. stops immediately and leaves the rest queued", async () => {
    const queue = buildQueue(5);
    const sentIds: string[] = [];
    const fatalId = queue.pending[2]?.id ?? "";

    const summary = await new ReconnectDrain(
      queue,
      (mutation) => {
        sentIds.push(mutation.id);
        return mutation.id === fatalId
          ? Promise.resolve(fatalFailure("auth"))
          : Promise.resolve(attemptOk);
      },
      POLICY,
    ).drain();

    expect(summary.stopped).toBe("auth");
    expect(summary.sent).toBe(2);
    expect(sentIds).toHaveLength(3);
    expect(sentIds.at(-1)).toBe(fatalId);
    expect(queue.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// F. 60s outage, 20 edits
// ---------------------------------------------------------------------------

describe("outage replay", () => {
  const OUTAGE_MS = 60000;

  it("F. 20 edits across a 60s outage: each delivered exactly once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const queue = buildQueue(20);
    const delivered: string[] = [];
    let sends = 0;
    let failedDuringOutage = 0;

    const send = (mutation: OptimisticMutation): Promise<DrainAttempt> => {
      sends += 1;
      if (Date.now() < OUTAGE_MS) {
        failedDuringOutage += 1;
        return Promise.resolve({ ok: false, error: { kind: "transport" } });
      }
      delivered.push(mutation.id);
      return Promise.resolve(attemptOk);
    };

    const drain = new ReconnectDrain(queue, send, POLICY);
    const run = drain.drain();

    // Outage window: every send inside it fails, backoff keeps retrying.
    await vi.advanceTimersByTimeAsync(OUTAGE_MS);
    expect(failedDuringOutage).toBeGreaterThan(0);
    expect(delivered).toHaveLength(0);
    expect(queue.count).toBe(20);

    // Transport heals; the drain delivers the rest without losing anything.
    await vi.advanceTimersByTimeAsync(400000);
    const summary = await run;

    const counts = new Map<string, number>();
    for (const id of delivered) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    expect(failedDuringOutage).toBe(sends - 20);
    expect(delivered).toHaveLength(20);
    expect(new Set(delivered).size).toBe(20);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(queue.count).toBe(0);
    expect(summary.sent).toBe(20);
    expect(summary.conflicts).toHaveLength(0);
    expect(summary.stopped).toBeNull();
    expect(summary.attempts).toBe(sends);
  });

  it("F. outage then fatal leaves the tail queued in order", async () => {
    const queue = buildQueue(3);
    const fatalId = queue.pending[0]?.id ?? "";

    const summary = await new ReconnectDrain(
      queue,
      (mutation) =>
        Promise.resolve(
          mutation.id === fatalId ? fatalFailure("drop") : attemptOk,
        ),
      POLICY,
    ).drain();

    expect(summary.stopped).toBe("drop");
    expect(queue.count).toBe(3);
    expect(queue.pending.map((mutation) => mutation.payload)).toEqual([
      { i: 0 },
      { i: 1 },
      { i: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Backoff seam
// ---------------------------------------------------------------------------

describe("backoff seam", () => {
  it("waits before each retry, never before the first attempt", async () => {
    // One mutation failing three times accumulates 100, 200, 400 across its
    // own retries. With two queued mutations the freshest work is tried first,
    // so each mutation would retry once rather than three times.
    const queue = buildQueue(1);
    let sends = 0;
    const send = (): Promise<DrainAttempt> => {
      sends += 1;
      return Promise.resolve(
        sends <= 3
          ? ({ ok: false, error: { kind: "transport" } } as const)
          : attemptOk,
      );
    };

    const drain = new RecordingDrain(queue, send, POLICY);
    const summary = await drain.drain();

    expect(drain.delays).toEqual([100, 200, 400]);
    expect(summary.sent).toBe(1);
    expect(queue.count).toBe(0);
  });

  it("never waits when every send succeeds first try", async () => {
    const queue = buildQueue(3);
    const drain = new RecordingDrain(
      queue,
      () => Promise.resolve(attemptOk),
      POLICY,
    );
    const summary = await drain.drain();

    expect(drain.delays).toHaveLength(0);
    expect(summary.sent).toBe(3);
  });

  it("backs off exponentially across retries of one mutation", async () => {
    const queue = buildQueue(1);
    let sends = 0;
    const send = (): Promise<DrainAttempt> => {
      sends += 1;
      return sends <= 4
        ? Promise.resolve({ ok: false, error: { kind: "transport" } } as const)
        : Promise.resolve(attemptOk);
    };

    const drain = new RecordingDrain(queue, send, POLICY);
    const summary = await drain.drain();

    expect(drain.delays).toEqual([100, 200, 400, 800]);
    expect(summary.sent).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

describe("rejections", () => {
  it("treats a thrown transport failure as a retry", async () => {
    vi.useFakeTimers();

    const queue = buildQueue(1);
    let sends = 0;
    const send = (): Promise<DrainAttempt> => {
      sends += 1;
      return sends === 1
        ? Promise.reject(new Error("socket closed"))
        : Promise.resolve(attemptOk);
    };

    const run = new ReconnectDrain(queue, send, POLICY).drain();
    await vi.advanceTimersByTimeAsync(500);
    const summary = await run;

    expect(sends).toBe(2);
    expect(summary.sent).toBe(1);
    expect(queue.count).toBe(0);
  });
});
