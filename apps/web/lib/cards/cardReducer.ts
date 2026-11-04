import type { CardId, ListId } from "@teammate/shared";

export interface Card {
  id: CardId;
  list_id: ListId;
  title: string;
  position: number;
}

export type CardMutation =
  | { kind: "create"; card: Card }
  | { kind: "update"; cardId: CardId; title: string }
  | { kind: "delete"; cardId: CardId };

export interface CardState {
  cards: Card[];
  pending: Set<CardId>;
}

export type CardAction =
  | { type: "hydrate"; cards: Card[] }
  | { type: "optimistic"; mutation: CardMutation }
  | { type: "ack"; cardId: CardId }
  | { type: "remoteUpsert"; card: Card }
  | { type: "remoteDelete"; cardId: CardId };

export function createCardState(): CardState {
  return { cards: [], pending: new Set() };
}

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.position - b.position);
}

export function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case "hydrate":
      return { cards: sortCards(action.cards), pending: new Set(state.pending) };
    case "optimistic": {
      const m = action.mutation;
      if (m.kind === "create") {
        return {
          cards: sortCards([...state.cards, m.card]),
          pending: new Set(state.pending).add(m.card.id),
        };
      }
      if (m.kind === "update") {
        return {
          cards: state.cards.map((c) =>
            c.id === m.cardId ? { ...c, title: m.title } : c,
          ),
          pending: new Set(state.pending).add(m.cardId),
        };
      }
      if (m.kind === "delete") {
        return {
          cards: state.cards.filter((c) => c.id !== m.cardId),
          pending: new Set(state.pending).add(m.cardId),
        };
      }
      return state;
    }
    case "ack": {
      const next = new Set(state.pending);
      next.delete(action.cardId);
      return { ...state, pending: next };
    }
    case "remoteUpsert": {
      const exists = state.cards.some((c) => c.id === action.card.id);
      const cards = exists
        ? state.cards.map((c) =>
            c.id === action.card.id ? action.card : c,
          )
        : sortCards([...state.cards, action.card]);
      return { ...state, cards };
    }
    case "remoteDelete": {
      return {
        cards: state.cards.filter((c) => c.id !== action.cardId),
        pending: state.pending,
      };
    }
    default:
      return state;
  }
}

export function isPending(state: CardState, cardId: CardId): boolean {
  return state.pending.has(cardId);
}