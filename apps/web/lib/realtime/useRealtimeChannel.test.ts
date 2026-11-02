import { describe, it, expect, vi, type Mock } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardId, CardId, ListId } from "@teammate/shared";
import { isBoardId, isCardId, isListId } from "@teammate/shared";
import type { RealtimeStatus } from "./useRealtimeChannel";
import {
  runRealtimeSubscription,
  toCardRow,
  mapRealtimePayload,
  toErrorMessage,
} from "./useRealtimeChannel";

interface MockChannel {
  on: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
}

interface MockClient {
  channel: Mock;
}

function makeChannel(): MockChannel {
  const channel: MockChannel = {
    on: vi.fn(),
    subscribe: vi.fn(() => ({ data: "sub-ok", error: null })),
    unsubscribe: vi.fn(() => ({ error: null })),
  };
  channel.on.mockReturnThis();
  return channel;
}

function makeClient(channel: MockChannel): MockClient {
  return { channel: vi.fn(() => channel) };
}

/**
 * Mock clients stand in for the Supabase client surface this hook touches.
 * The structural gap is bridged in one place rather than per call site.
 */
function toSupabaseClient(mock: MockClient): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

function toBoardId(s: string): BoardId {
  if (!isBoardId(s)) throw new Error(`bad BoardId ${s}`);
  return s;
}

function toCardId(s: string): CardId {
  if (!isCardId(s)) throw new Error(`bad CardId ${s}`);
  return s;
}

function toListId(s: string): ListId {
  if (!isListId(s)) throw new Error(`bad ListId ${s}`);
  return s;
}

const BOARD = toBoardId("12345678-1234-1234-1234-123456789012");
const LIST = toListId("11111111-2222-3333-4444-555555555555");

function fakeCard(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    board_id: BOARD,
    list_id: LIST,
    title: "Card",
    position: 1,
    ...overrides,
  };
}

describe("toErrorMessage", () => {
  it("passes through strings and Error messages", () => {
    expect(toErrorMessage("boom")).toBe("boom");
    expect(toErrorMessage(new Error("nope"))).toBe("nope");
  });

  it("reads message from objects and falls back otherwise", () => {
    expect(toErrorMessage({ message: "obj msg" })).toBe("obj msg");
    expect(toErrorMessage({})).toBe("Subscription error");
    expect(toErrorMessage(null)).toBe("Subscription error");
  });
});

describe("toCardRow", () => {
  it("narrows a well-formed row", () => {
    const row = toCardRow(fakeCard());
    expect(row).not.toBeNull();
    expect(row?.id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(row?.position).toBe(1);
  });

  it("rejects rows with a non-UUID id, missing field, or wrong type", () => {
    expect(toCardRow(fakeCard({ id: "not-a-uuid" }))).toBeNull();
    expect(toCardRow(fakeCard({ title: 5 }))).toBeNull();
    expect(toCardRow(fakeCard({ position: "1" }))).toBeNull();
    expect(toCardRow({})).toBeNull();
    expect(toCardRow(null)).toBeNull();
    expect(toCardRow("nope")).toBeNull();
  });
});

describe("runRealtimeSubscription lifecycle", () => {
  it("subscribes once and reports subscribed", () => {
    const channel = makeChannel();
    const client = makeClient(channel);
    const statuses: RealtimeStatus[] = [];
    const onEvent = vi.fn();

    const deps = {
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onEvent,
      onStatus: (s: RealtimeStatus) => statuses.push(s),
      onError: () => {},
      onEventState: () => {},
    };

    const cleanup = runRealtimeSubscription(deps);

    expect(client.channel).toHaveBeenCalledWith(`realtime:board:${BOARD}`);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(statuses[0]).toBe("subscribing");
    expect(statuses).toContain("subscribed");
    expect(typeof cleanup).toBe("function");

    cleanup();
  });

  it("unsubscribes exactly once on cleanup", () => {
    const channel = makeChannel();
    const client = makeClient(channel);

    const cleanup = runRealtimeSubscription({
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onStatus: () => {},
      onError: () => {},
      onEventState: () => {},
    });

    expect(channel.unsubscribe).not.toHaveBeenCalled();
    cleanup();
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when disabled or boardId is absent", () => {
    for (const partial of [
      { enabled: false, hasBoardId: true },
      { enabled: true, hasBoardId: false },
      { enabled: false, hasBoardId: false },
    ]) {
      const channel = makeChannel();
      const client = makeClient(channel);
      const statuses: RealtimeStatus[] = [];

      runRealtimeSubscription({
        boardId: BOARD,
        ...partial,
        client: toSupabaseClient(client),
        onStatus: (s: RealtimeStatus) => statuses.push(s),
        onError: () => {},
        onEventState: () => {},
      });

      expect(client.channel).not.toHaveBeenCalled();
      expect(channel.subscribe).not.toHaveBeenCalled();
      expect(statuses).toEqual(["idle"]);
    }
  });
});

describe("mapRealtimePayload", () => {
  it("maps eventType 1 to INSERT with the new row", () => {
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "New",
      position: 1,
    };

    expect(mapRealtimePayload({ eventType: 1, new: card, old: {} })).toEqual({
      event: "INSERT",
      card,
    });
  });

  it("maps eventType 2 to UPDATE with the new row", () => {
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "Moved",
      position: 7,
    };

    expect(mapRealtimePayload({ eventType: 2, new: card, old: {} })).toEqual({
      event: "UPDATE",
      card,
    });
  });

  it("maps eventType 3 to DELETE taking the card from old", () => {
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "Gone",
      position: 3,
    };

    expect(mapRealtimePayload({ eventType: 3, new: {}, old: card })).toEqual({
      event: "DELETE",
      card,
    });
  });

  it("yields DELETE with a null card when old is absent", () => {
    expect(mapRealtimePayload({ eventType: 3, new: {}, old: {} })).toEqual({
      event: "DELETE",
      card: null,
    });
  });

  it("ignores malformed payloads and unknown event types", () => {
    expect(mapRealtimePayload(null)).toBeNull();
    expect(mapRealtimePayload({ eventType: "1", new: {} })).toBeNull();
    expect(mapRealtimePayload({ eventType: 9, new: fakeCard(), old: {} })).toBeNull();
    expect(mapRealtimePayload({ eventType: 1, new: {}, old: {} })).toBeNull();
  });
});

describe("registered handler forwards mapped events to onEvent", () => {
  function captureHandler(channel: MockChannel): (payload: unknown) => void {
    expect(channel.on).toHaveBeenCalledTimes(1);
    const args = channel.on.mock.calls[0];
    expect(args?.[0]).toBe("postgres_changes");
    const handler = args?.[2];
    if (typeof handler !== "function") throw new Error("handler not captured");
    return handler as (payload: unknown) => void;
  }

  it("INSERT payload reaches onEvent as a typed INSERT event", () => {
    const channel = makeChannel();
    const client = makeClient(channel);
    const onEvent = vi.fn();
    const seen: unknown[] = [];

    runRealtimeSubscription({
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onEvent,
      onStatus: () => {},
      onError: () => {},
      onEventState: (e) => seen.push(e),
    });

    const handler = captureHandler(channel);
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "New",
      position: 1,
    };

    handler({ eventType: 1, new: card, old: {} });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ event: "INSERT", card });
    expect(seen).toEqual([{ event: "INSERT", card }]);
  });

  it("UPDATE payload reaches onEvent as a typed UPDATE event", () => {
    const channel = makeChannel();
    const client = makeClient(channel);
    const onEvent = vi.fn();

    runRealtimeSubscription({
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onEvent,
      onStatus: () => {},
      onError: () => {},
      onEventState: () => {},
    });

    const handler = captureHandler(channel);
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "Moved",
      position: 9,
    };

    handler({ eventType: 2, new: card, old: {} });

    expect(onEvent).toHaveBeenCalledWith({ event: "UPDATE", card });
  });

  it("DELETE payload reaches onEvent with the old row as the card", () => {
    const channel = makeChannel();
    const client = makeClient(channel);
    const onEvent = vi.fn();

    runRealtimeSubscription({
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onEvent,
      onStatus: () => {},
      onError: () => {},
      onEventState: () => {},
    });

    const handler = captureHandler(channel);
    const card = {
      id: toCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: BOARD,
      list_id: LIST,
      title: "Gone",
      position: 3,
    };

    handler({ eventType: 3, new: {}, old: card });

    expect(onEvent).toHaveBeenCalledWith({ event: "DELETE", card });
  });

  it("does not call onEvent for payloads that do not map", () => {
    const channel = makeChannel();
    const client = makeClient(channel);
    const onEvent = vi.fn();

    runRealtimeSubscription({
      boardId: BOARD,
      enabled: true,
      hasBoardId: true,
      client: toSupabaseClient(client),
      onEvent,
      onStatus: () => {},
      onError: () => {},
      onEventState: () => {},
    });

    const handler = captureHandler(channel);
    handler({ eventType: 7, new: fakeCard(), old: {} });
    handler(null);

    expect(onEvent).not.toHaveBeenCalled();
  });
});
