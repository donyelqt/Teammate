# ADR-0009: Design tokens

- Status: accepted
- Date: 2026-11-02
- Deciders: project owner

## Context

A diagram-level decision made by a design-tool query returned an editorial palette with Playfair Display for a dashboard. That is wrong for this product, and the reason is worth recording so the query is not repeated.

## Decision

| Dimension | Value |
|---|---|
| Primary | Teal `#0D9488`, not the AI purple/blue |
| Accent / CTA | Orange `#EA580C` |
| Neutral base | Zinc / Slate |
| Type | Geist + Geist Mono |
| Serif | Banned in this UI |
| Inter | Banned |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)` for `ease-out` |
| Motion duration | 100-200ms, never above 300ms |
| Card radius | `rounded-2xl`, not `2.5rem` |

## Alternatives considered

| Option | Why not |
|---|---|
| The tool's editorial Playfair palette | Serif is banned in dashboards. Luxury editorial type reads as a marketing site, not a working tool, and a kanban board's job is to be read fast. |
| The AI purple/blue gradient look | Banned as a tell. Also, purple on white fails a 4.5:1 contrast at the weights this UI uses. |
| Default shadcn/ui | Legal but generic. Radii, colors, and shadows must be customized. |
| Linear's purple | Same family as the AI-purple ban. |

## Consequences

Motion follows the design engineering rules: `ease-out` never `ease-in`, enter with `scale(0.95)` and `opacity`, `transform` and `opacity` only, no `transition: all`, exit faster than enter, `prefers-reduced-motion` respected with a cross-fade rather than removal.

One deliberate local override: the tool's motion preset suggested `back.out(1.4)` with 300-450ms for the grid stagger. Overshoot on informational UI reads as sloppy, so the stagger is a plain `ease-out` at 150-200ms. Recorded so a future pass does not "fix" it back.
