import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardId, CardId, ListId } from "@teammate/shared";
import { isBoardId, isCardId, isListId } from "@teammate/shared";
import { useRealtimeChannel } from "./useRealtimeChannel";

function makeBoardId(s: string): BoardId {
  if (!isBoardId(s)) throw new Error(`Invalid BoardId: ${s}`);
  return s;
}

function makeCardId(s: string): CardId {
  if (!isCardId(s)) throw new Error(`Invalid CardId: ${s}`);
  return s;
}

function makeListId(s: string): ListId {
  if (!isListId(s)) throw new Error(`Invalid ListId: ${s}`);
  return s;
}

interface MockSupabaseClient {
  channel: ReturnType<typeof vi.fn>;
}

function renderHook<T>(hook: () => T): {
  result: RefObject<T>;
  unmount: () => void;
} {
  const resultRef = { current: null as T | null };
  let root: ReturnType<typeof createRoot>;
  const container = document.createElement("div");
  document.body.appendChild(container);

  function TestComponent() {
    const value = hook();
    resultRef.current = value;
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(<TestComponent />);
  });

  return {
    result: resultRef as RefObject<T>,
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

describe("useRealtimeChannel", () => {
  let onMock: ReturnType<typeof vi.fn>;
  let subscribeMock: ReturnType<typeof vi.fn>;
  let unsubscribeMock: ReturnType<typeof vi.fn>;
  let mockClient: MockSupabaseClient;

  beforeEach(() => {
    onMock = vi.fn().mockReturnThis();
    subscribeMock = vi.fn(() => ({ data: "sub-ok", error: null }));
    unsubscribeMock = vi.fn(() => ({ error: null }));
    mockClient = {
      channel: vi.fn(() => ({
        on: onMock,
        subscribe: subscribeMock,
        unsubscribe: unsubscribeMock,
      })),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subscribes once with valid boardId and mock client", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const { result, unmount } = renderHook(() =>
      useRealtimeChannel(boardId, {}, mockClient as unknown as SupabaseClient),
    );

    expect(mockClient.channel).toHaveBeenCalledWith(`realtime:board:${boardId}`);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("subscribed");
    expect(result.current.error).toBeNull();
    expect(result.current.lastEvent).toBeNull();

    unmount();
  });

  it("unsubscribes exactly once on unmount", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const { unmount } = renderHook(() =>
      useRealtimeChannel(boardId, {}, mockClient as unknown as SupabaseClient),
    );

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when enabled is false", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const { result } = renderHook(() =>
      useRealtimeChannel(
        boardId,
        { enabled: false },
        mockClient as unknown as SupabaseClient,
      ),
    );

    expect(mockClient.channel).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.lastEvent).toBeNull();
  });

  it("maps INSERT payloads to INSERT events", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const onEvent = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRealtimeChannel(boardId, { onEvent }, mockClient as unknown as SupabaseClient),
    );

    const handler = onMock.mock.calls[0]?.[2] as ((payload: unknown) => void) | undefined;
    expect(typeof handler).toBe("function");

    const card = {
      id: makeCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: boardId,
      list_id: makeListId("11111111-2222-3333-4444-555555555555"),
      title: "Test Card",
      position: 1,
    };

    act(() => {
      handler?.({ eventType: 1, new: card, old: {} });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ event: "INSERT", card });
    expect(result.current.lastEvent).toEqual({ event: "INSERT", card });

    unmount();
  });

  it("maps UPDATE payloads to UPDATE events", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const onEvent = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRealtimeChannel(boardId, { onEvent }, mockClient as unknown as SupabaseClient),
    );

    const handler = onMock.mock.calls[0]?.[2] as ((payload: unknown) => void) | undefined;

    const card = {
      id: makeCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: boardId,
      list_id: makeListId("11111111-2222-3333-4444-555555555555"),
      title: "Updated Card",
      position: 2,
    };

    act(() => {
      handler?.({ eventType: 2, new: card, old: {} });
    });

    expect(onEvent).toHaveBeenCalledWith({ event: "UPDATE", card });
    expect(result.current.lastEvent).toEqual({ event: "UPDATE", card });

    unmount();
  });

  it("maps DELETE payloads to DELETE events from old row", () => {
    const boardId = makeBoardId("12345678-1234-1234-1234-123456789012");
    const onEvent = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRealtimeChannel(boardId, { onEvent }, mockClient as unknown as SupabaseClient),
    );

    const handler = onMock.mock.calls[0]?.[2] as ((payload: unknown) => void) | undefined;

    const card = {
      id: makeCardId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      board_id: boardId,
      list_id: makeListId("11111111-2222-3333-4444-555555555555"),
      title: "Deleted Card",
      position: 3,
    };

    act(() => {
      handler?.({ eventType: 3, new: {}, old: card });
    });

    expect(onEvent).toHaveBeenCalledWith({ event: "DELETE", card });
    expect(result.current.lastEvent).toEqual({ event: "DELETE", card });

    unmount();
  });
});
