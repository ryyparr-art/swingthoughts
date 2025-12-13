# Copilot / AI agent instructions for SwingThoughts

Purpose: give an AI code assistant the precise, actionable context needed to be productive in this repo.

- Project type: Expo + React Native (TypeScript) using `expo-router` for file-based routing.
- Entry points / important files:
  - `app/_layout.tsx` — global layout and auth guard. This file contains the listener that uses `onAuthStateChanged(auth, ...)` and redirects based on `segments` and a `userType` claim on the ID token.
  - `constants/firebaseConfig.ts` — Firebase initialization and `auth` export used by `_layout.tsx`.
  - `app/` — file-system routes. Subfolders map directly to URL groups (for example, `app/auth/*`, `app/clubhouse/*`).
  - `components/navigation/` — shared navigation pieces (`BottomActionBar.tsx`, `TopNavBar.tsx`, `LowmanCarousel.tsx`).
  - `components/*Icon.tsx` naming convention for icon components (e.g. `ClubhouseIcon.tsx`).
  - `constants/theme.ts` + `hooks/use-theme-color.ts` and `hooks/use-color-scheme*.ts` — centralized theming and platform-specific color-scheme helpers.
  - `scripts/reset-project.js` — repo helper script (utility to reset local state; inspect before running).

Key architecture & patterns (do not change without checking implications):

- Routing and auth guard
  - `expo-router` file-based routing maps `app/*` to routes. `app/_layout.tsx` implements the auth-check flow: it waits for router `segments` (via `useSegments()`), listens for Firebase auth state (`onAuthStateChanged`) and then:
    - If not logged-in → redirect to `/auth/login` using `router.replace('/auth/login')`.
    - If logged-in but missing `userType` claim → redirect to `/auth/user-type`.
    - If authenticated + has `userType` → ensure app leaves `auth` routes and goes to `/clubhouse`.
  - Important detail: guard for router readiness uses `if (!segments || segments.length === 0) { /* wait */ }` — preserve this check when modifying the flow.

- Firebase / auth details
  - The code expects a custom Claim `userType` on the ID token (`await user.getIdTokenResult(); idTokenResult.claims.userType`).
  - Changes that affect auth redirects or claim handling require updating `app/_layout.tsx` only (single source of truth for routing decisions).

- Theming & UI
  - Use `themed-text.tsx` and `themed-view.tsx` for components that must follow app theme.
  - Platform differences are handled by separate hooks (e.g. `use-color-scheme.ts` and `use-color-scheme.web.ts`) — prefer adding platform-specific behavior via hooks rather than ad-hoc checks in components.

Developer workflows & commands

- Start web dev (observed in terminal history):
  - `npm run web` — launches the Expo web target (useful for fast iteration).
- Standard Expo scripts likely available (inspect `package.json` for full scripts). When in doubt, prefer `npm run web` or `expo start` if available.
- Utility script: `node scripts/reset-project.js` — inspect before running; it may clear local project state.

Project-specific conventions

- Routes: keep UI pages under `app/`. For group-level auth gating, put pages in `app/auth/` and rely on `segments[0] === 'auth'` checks.
- Navigation: use `router.replace(...)` in centralized places like `_layout.tsx` for hard redirects (avoid mixing `push`/`replace` semantics across files unless intentional).
- Naming: icon components end with `Icon.tsx`; navigational components live under `components/navigation/`.
- Small utilities and hooks live under `hooks/` — add platform-specific variants using `.web.ts` naming where needed (existing example: `use-color-scheme.web.ts`).

What to look for when making changes

- If you modify routing/auth behavior, update `app/_layout.tsx` and test these flows manually: login, signup, choose `userType`, and leaving auth pages.
- When touching Firebase config, update `constants/firebaseConfig.ts` only and ensure other files import `auth` from there.
- For theming changes, update `constants/theme.ts` and `hooks/use-theme-color.ts` first; prefer changing theme tokens there rather than in scattered components.

Files to inspect when uncertain

- `app/_layout.tsx` — auth flow and router/segment logic (first place to check for routing bugs).
- `constants/firebaseConfig.ts` — Firebase SDK setup.
- `constants/theme.ts` and `hooks/` — theme and color-scheme behavior.
- `components/navigation/` and `components/*Icon.tsx` — navigation and icon conventions.

Limitations and missing pieces

- There are no visible automated tests in the repo root — assume manual verification is required for UI/auth flows.
- Check `package.json` for exact scripts before running anything other than `npm run web`.

If you need clarification or want me to expand this (for example, include `package.json` scripts or specific code snippets), tell me which part you'd like more detail on.

---
Please review and tell me if you'd like more precise run/test commands or additional examples from specific files.
