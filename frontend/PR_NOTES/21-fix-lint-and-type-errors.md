PR #21 — fix(lint): ruff fixes and TS handler usage

Summary:
- Fixed TypeScript type errors in `frontend/src/pages/Movies.tsx` that were breaking the frontend type check in CI (GH Actions `test-frontend` job).
- Change: updated `confirmScopeAndRun` signature to accept an optional `ids?: number[]` and adjusted callers to pass `ids ?? []` into their mutation wrappers. This prevents `TS2345` errors where `undefined` was not assignable to required `number[]`.

Verification:
- `npm run build` (runs `tsc && vite build`) passes locally after the change.
- Commit pushed to branch `fix/lint-and-type-errors` and updates PR #21.

Notes:
- If CI still errors, re-run the `test-frontend` workflow to see exact failures and attach logs.

Date: 2025-12-21
Author: kronnnnnn
