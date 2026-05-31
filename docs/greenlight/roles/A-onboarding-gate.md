# Role: Module A — Onboarding & Gate

## Mission
Make the intake → gate → red-to-green-flip path fully live and persisted, with no field-mismatch bugs.

## Owns (exclusive write)
- `client/src/components/greenlight/IntakeChat.jsx`
- `client/src/components/greenlight/GateScreen.jsx`
- `client/src/components/greenlight/GreenlightFlow.jsx`
- `client/src/components/OnboardingChat.jsx`

## Do NOT touch
`greenlightClient.js` (call its existing exports only), any engine/backend file, other components.

## Depends on
Module 0 (the `gate_result.checks` field + confirmed `target_balance` shape).

## Contract
Consume `OnboardResponse.gate_result` per 05-contracts §UI-Contract. Key facts:
- Emergency-fund math lives at `gate_result.math.emergency_fund.target_balance` and `.shortfall` — **not `target_amount`**.
- Per-check status is `gate_result.checks[] = {key, status:"pass"|"fail"|"warn", detail}`.
- `streamChat({messages, user_email, session_id, onSession, onProfileReady, ...})` then `postOnboard(profile, userEmail)`.

## Tasks
1. **GateScreen:** replace any `target_amount` read with `target_balance`; render the per-check list from `gate_result.checks` (pass/fail/warn + detail) instead of any hardcoded check rows.
2. **IntakeChat (greenlight tab):** thread `user_email` (and the `session_id` from the `onSession` SSE event) into `streamChat` and `postOnboard(profile, userEmail)` so greenlight-tab intake persists to the signed-in user (today it doesn't).
3. **GreenlightFlow / OnboardingChat:** ensure the fix → re-flip path re-runs `postOnboard` (or `/gate/recheck`) and that the red→green flip is driven by the live `gate_result.status` (`"halt"` → `"greenlight"`), not local state.
4. Keep the existing visual design; change data plumbing only.

## Verify
- `npm --prefix client run build` green.
- Playwright smoke against the live stack: register → onboarding chat → **halt** on a high-APR/no-EF persona (gate shows real `target_balance`, `shortfall`, and per-check rows) → fix inputs → **greenlight flip** → lands on portfolio. Confirm the chat session appears under `GET /users/{email}/chats`.

## Seed prompt
> You are implementing **Module A (Onboarding & Gate)** for Mallard Management at `/home/ethan/documents/personal/github/mallard-management-active`. Edit ONLY `client/src/components/greenlight/{IntakeChat,GateScreen,GreenlightFlow}.jsx` and `client/src/components/OnboardingChat.jsx`; call existing `greenlightClient` exports only. Fixes: (1) GateScreen reads `gate_result.math.emergency_fund.target_balance` (not `target_amount`) and renders `gate_result.checks[]` (pass/fail/warn + detail) instead of hardcoded rows; (2) greenlight-tab IntakeChat passes `user_email` + the `session_id` from the `onSession` SSE event into `streamChat` and `postOnboard(profile, userEmail)` so intake persists; (3) the fix→re-flip path re-runs onboard/gate-recheck and the red→green flip follows live `gate_result.status`. Preserve the visual design. Verify with client build + a Playwright smoke (register → halt persona → fix → greenlight flip; session shows in `/users/{email}/chats`). Do not touch engine/backend or `greenlightClient.js`. Do not commit.
