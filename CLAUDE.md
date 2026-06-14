# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server on localhost:3000
npm run build    # production build
npm run lint     # ESLint via next lint
```

No test suite is configured. No separate type-check script — TypeScript errors surface via `npm run build`.

## Architecture

**Next.js 14 App Router** with Supabase as the backend. Deployed to Vercel. PWA-capable (manifest + service worker).

### Auth & routing

- `middleware.ts` guards all routes: unauthenticated users → `/login`, authenticated users on `/login` → `/dashboard`
- All authenticated pages live under `app/(protected)/` with a shared layout that injects `Sidebar` (desktop), `MobileNav` (mobile), `LanguageToggle`, and `NotificationBell`
- Two Supabase clients: `lib/supabase/server.ts` (Server Components / Route Handlers) and `lib/supabase/client.ts` (Client Components)

### App sections

| Route | Component | Notes |
|---|---|---|
| `/dashboard` | `DashboardContent` | Daily summary widget |
| `/weight` | `WeightClient` | Weight tracking with Recharts |
| `/planner` | `PlannerClient` | Task planner |
| `/journal` | `JournalClient` | Personal journal |
| `/shopping` | `ShoppingPage` | Collaborative shopping lists via Server Actions |
| `/game` | `GameMenu` → `JokerGame` | Joker card game |
| `/sacred` | `SacredGame` | Seraphites turn-based strategy |
| `/games` | games hub | |

### i18n

`lib/LanguageContext.tsx` + `lib/i18n.ts` — supports `'en'` and `'ua'` (Ukrainian). Language toggled via `LanguageToggle` component and stored in `localStorage`. All UI strings for both languages live in `lib/i18n.ts`.

### Theming

CSS custom properties defined in `app/globals.css` under `:root` (light) and `[data-theme="dark"]`. Theme saved to `localStorage` key `'theme'`; injected in `<head>` before first paint to prevent flash. Never use hard-coded colors — always use CSS vars like `var(--bg)`, `var(--accent)`, `var(--text)`, etc.

### Supabase / data

- All DB mutations in `app/(protected)/shopping/actions.ts` use `'use server'` + admin client (bypasses RLS) while the regular server client uses the user's session for reads
- SQL migrations stored as `supabase-*.sql` files in the repo root (no migration tool configured)

### Seraphites game (`/sacred`)

The most complex module. Architecture:

- **`lib/sacred/types.ts`** — all TypeScript types + static level-up data tables (`MAGE_PATHS`, `WARRIOR_PATHS`, `ARCHER_LEVELS`, `CATAPULT_PATHS`, etc.)
- **`lib/sacred/game.ts`** — pure battle engine: `battleReducer`, `createInitialState`, action resolution, XP/leveling
- **`lib/sacred/territories.ts`** — campaign map: `Territory`, `TerritoryMapState`, army specs, revival/hire/upgrade cost tables
- **`lib/sacred/worldMap.ts`** — polygon coordinates for map rendering
- **`components/sacred/SacredGame.tsx`** — top-level orchestrator; holds all game state via `useReducer`; renders sub-screens based on mode
- Sub-screens: `ArmyBuilder`, `PlacementScreen`, `FreeBattleSetup`, `WorldMap`

Army layout rules:
- Always **2 rows × 4 slots** in all modes
- Row 0 = front (warriors); Row 1 = back (archers/mages)
- Mages always in row 1
- Catapult occupies **row 0 slot 2 + row 1 slot 2** (spans both rows, same slot)
- Unit reordering is **same-row only** — swaps never cross rows

Unit classes have branching level-up paths at level 3+:
- Warrior → Paladin or Champion paths
- Mage → Fire / Water / Earth / Air paths  
- Catapult → Ballista or Trebuchet paths
- Archer → single linear path (3 levels)

### Joker card game (`/game`)

- **`lib/game/types.ts`** — `GameState`, `Card`, `Meld`, `Player` interfaces
- **`lib/game/cards.ts`** — deck creation/shuffle
- **`lib/game/meld.ts`** — meld validation logic
- **`lib/game/ai.ts`** — AI opponent logic
- **`components/game/JokerGame.tsx`** — main game component
- Online multiplayer via `/game/online/[roomId]` using Supabase Realtime
