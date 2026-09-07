# KB-Chat — Design System

Flows these components serve: [USER_FLOWS.md](./USER_FLOWS.md) · Stack context: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Principles

| Principle | Meaning in practice |
|---|---|
| Legibility > decoration | Generous line-height and measure for answer text; no gradients/ornament competing with content |
| Chat text is the hero | Largest comfortable reading size in the answer column; UI chrome recedes (muted neutral) |
| Citations must feel trustworthy | Citation chips are visually distinct, consistent, and always clickable to a real source location — never decorative |
| Ingestion status always visible | Every document shows its pipeline stage at all times; failures are loud (red), never silent |

## Token strategy — Tailwind v4 + shadcn/ui

CSS-first tokens via `@theme` in `globals.css`; shadcn/ui semantic variables (`--background`, `--foreground`, `--primary`, …) mapped onto them.

### Palette

| Role | Token basis | Usage |
|---|---|---|
| Neutrals | Neutral scale (shadcn `neutral` base color — zero-chroma oklch tokens in `globals.css`) | Backgrounds, borders, body text, chrome — the whole base UI |
| Accent (ONE) | Single interactive accent → shadcn `--primary` | Buttons, links, focus rings, active states. One accent only — no second brand color |
| Status: ready | Green (e.g. `green-600` / dark `green-400`) | Ready badge, success toasts |
| Status: processing | Amber | pending/parsing/chunking/embedding badges, progress |
| Status: failed | Red | Failed badge, destructive actions, error text |
| Citation accent | Blue | Citation chips + source-viewer highlight — reserved for citations so they stay recognizable |

Status colors are semantic tokens (`--status-ready`, `--status-processing`, `--status-failed`, `--citation`) — components never hardcode raw palette classes for status.

### Typography — Geist (from the Next.js scaffold)

| Level | Size / weight | Use |
|---|---|---|
| Display | `text-2xl` semibold | Page titles |
| Heading | `text-lg` semibold | Section/panel headers |
| Body (chat) | `text-base` (16px), `leading-7`, max measure ~70ch | Answer + message text |
| Secondary | `text-sm` normal | Doc metadata, timestamps, labels |
| Caption / mono | `text-xs`; `Geist Mono` | Status badges, chunk/page refs, code |

### Spacing rhythm

4px base grid. Component padding steps: `p-2` (chips/badges), `p-4` (cards, bubbles), `p-6` (panels/pages). Vertical stack rhythm: `space-y-2` within a group, `space-y-6` between sections. Chat messages separated by `gap-4`.

## Component inventory

| Component | Notes |
|---|---|
| Chat bubble | User: accent-tinted, right-aligned. Assistant: plain background, full measure, streaming text with cursor; renders inline citation chips |
| Citation chip | Small blue pill `[1]` inline in answer text; hover shows doc title + page; click opens source viewer. Keyboard focusable |
| Source-viewer panel | Side panel (sheet on mobile): document title, heading path, page range, cited chunk highlighted in context |
| Upload dropzone | Drag-and-drop + click; shows allowlist + 50MB limit; inline validation errors (invalid type, oversized, duplicate) |
| Status badge | pending/parsing/chunking/embedding = amber (stage named), ready = green, failed = red with error tooltip + retry affordance |
| Empty states | Chat (no messages → suggested questions), documents (no docs → dropzone CTA), admin (no flags/failures → all-clear) |
| Skeletons | Documents list rows, conversation list, source-viewer content while loading; shimmer respects reduced motion |

Built on shadcn/ui primitives in the **base-nova** style (`@base-ui/react`, not Radix): Button, Badge, Sheet, Card, Tooltip, Skeleton, Tabs, Dialog, Table, and Sonner toasts. Custom components live in `src/components/{chat,documents,admin,auth}` plus `app-sidebar`.

## Dark mode

- Tokens: a complete dark palette is defined under the `.dark` class (`@custom-variant dark` in `globals.css`), including dark-adjusted status/citation colors for AA contrast.
- All colors flow through the semantic tokens above; components never branch on theme directly.
- Applied via `next-themes` (`ThemeProvider attribute="class" defaultTheme="system" enableSystem` in the root layout): follows the OS preference by default, with a light/dark toggle in the sidebar account menu.

## Accessibility (WCAG AA)

| Requirement | Implementation |
|---|---|
| Contrast | AA minimums: 4.5:1 body text, 3:1 large text/UI — verified for both themes, including status badges and chips |
| Focus | Visible focus ring (accent, 2px offset) on every interactive element; never `outline-none` without replacement |
| Keyboard nav | Full flows keyboard-operable: composer, send, citation chips (tab-reachable, Enter opens viewer), source viewer (Esc closes, focus trapped then restored), dropzone (Enter opens file picker) |
| Reduced motion | `prefers-reduced-motion`: disable shimmer/slide animations; streaming text still appears (content, not decoration) |
| Semantics | Chat log as `role="log"` with `aria-live="polite"`; status badges carry text, never color-only; form errors linked via `aria-describedby` |
