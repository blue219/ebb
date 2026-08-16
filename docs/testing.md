# Testing

Ebb separates deterministic checks from the one destructive release check. Automated tests never load Douyin, read the persistent account partition, or send an unlike request to a real account.

## Automated checks

Run the smallest relevant command first:

```bash
npm test
npm run test:typecheck
npm run test:coverage
npm run test:e2e
npm run verify
```

- `npm test` runs Node and jsdom tests with Vitest.
- `npm run test:watch` keeps Vitest running during development.
- `npm run test:coverage` enforces lines/statements/functions at 80% and branches at 70% across deterministic critical modules.
- `npm run test:typecheck` type-checks test sources and test-only configuration.
- `npm run test:e2e` builds the app and a separate Electron fixture, then runs Playwright against the production renderer and preload.
- `npm run verify` is the local release gate: coverage, test type-checking, lint, build, and offline Electron smoke.

The automated layers cover:

- Clear-scope calculation and automatic-removal policy.
- Navigation, QR-image, login-surface, and untrusted-response policy.
- Account checks, 30-row pagination, low-water prefetching, deduplication, selected/limited/all removal, replacement rows, completed-list refresh, pause, continue, stop, rejected requests, stale counts, sign out, and workspace crashes.
- Preload command/event mapping and main-process IPC registration.
- QR sign-in presentation, scope selection and confirmation, progress controls, error presentation, language switching, and load-more de-duplication.
- Electron startup, preload availability, sandbox settings, offline removal flow, and injected failure behavior.

The Electron fixture uses `test-results/` for failure screenshots and traces. It uses a new temporary user-data directory for every test, does not create `persist:ebb-douyin`, and fails if the app attempts an external HTTP(S) request.

## Real-account release check

> This procedure removes one real like and Ebb cannot restore it. Choose a video you are willing to unlike. Never use **All** for release verification.

1. Run `npm run verify`; do not continue unless every automated gate passes.
2. Run `npm run dev` and sign in by QR code.
3. Confirm that the account name, Likes count, and first 30 rows load.
4. Scroll near the end of the table and confirm another page loads when more likes exist.
5. Select exactly one expendable video so the scope changes to **Custom**.
6. Confirm that the displayed clear target is 1, start the task, and verify it reaches **Completed**.
7. Check in Douyin that the like was removed and that Ebb's Likes count decreased by one.
8. Restart Ebb and confirm the saved session restores without another QR scan.
9. Choose **Sign out**, restart, and confirm Ebb asks for a QR scan.

Pause, continue, stop, rate-limit, and rejected-response scenarios are covered by deterministic fixtures. Do not spend additional real likes to repeat them.

## Failure handling

- For a Vitest failure, run the reported file directly with `npx vitest run <path>`.
- For an Electron failure, inspect the retained trace or screenshot under `test-results/`, then rerun `npm run test:e2e`.
- If the offline Electron test reports an external request, treat it as an isolation regression; the fixture must not be allowed to contact Douyin.
- If the manual check encounters verification or rate limiting, stop the task. Do not repeatedly retry the account; sign out and retry later with a refreshed QR code.
