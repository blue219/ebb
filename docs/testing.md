# Testing

Ebb separates deterministic checks from bounded destructive release checks. Automated tests never load Douyin or TikTok, read persistent account partitions, or send an unlike, uncollect, or unfollow request to a real account.

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

- Batch-scope calculation and automatic-removal policy.
- Navigation, QR-image, login-surface, and untrusted-response policy.
- Account checks, 30-row pagination, low-water prefetching, deduplication, selected/limited/all removal, replacement rows, completed-list refresh, pause, continue, stop, rejected requests, stale counts, sign out, and workspace crashes.
- Collected-video parsing, pagination, selected/limited/live-all collection-removal tasks, and first-rejection pause behavior.
- Following-account parsing, 20-row pagination, selected/limited/live-all unfollow tasks, and the shared mutation lock.
- Read-only scan failures keep workspace navigation and manual retry available; only active or paused mutation tasks lock workspace switching.
- Preload command/event mapping and main-process IPC registration.
- QR sign-in presentation, scope selection and confirmation, progress controls, error presentation, language switching, and load-more de-duplication.
- Electron startup, preload availability, sandbox settings, offline removal flow, and injected failure behavior.

The Electron fixture uses `test-results/` for failure screenshots and traces. It uses a new temporary user-data directory for every test, does not create `persist:ebb-douyin` or `persist:ebb-tiktok`, and fails if the app attempts an external HTTP(S) request.

Shared-platform tests additionally cover unknown totals, platform-namespaced bridges, independent account state, and the application-wide mutation lock. TikTok adapter tests use sanitized API responses and synthetic DOM fixtures described in [tiktok-web-contract.md](tiktok-web-contract.md).

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

## Real-account unfollow release check

> This procedure removes one real following relationship and Ebb cannot restore it. Choose an account you are willing to unfollow. Never use **All** for release verification.

1. Run `npm run verify`; do not continue unless every automated gate passes.
2. Run `npm run dev`, restore the saved session, and open **Following accounts**.
3. Confirm the Following count, first 20 rows, account identifiers, mutual-follow markers, and next-page loading without starting a task.
4. Select exactly one expendable account so the scope changes to **Custom**.
5. Confirm and run the task, then verify it reaches **Completed**.
6. Check in Douyin that the relationship was removed and that Ebb's Following count decreased by one.
7. Refresh the following list and confirm the account is absent. Do not automatically follow it again.

If the read-only list contract lacks stable IDs or reliable pagination, or if the private write request is rejected because its contract changed, stop verification and record the response difference. Do not fall back to DOM automation or signature engineering.

## Real-account TikTok release check

> This gate performs three irreversible changes. Use one explicitly expendable liked video, one Favorite Video, and one following relationship. Never use **All**.

1. Complete every automated gate and the read-only checks in [tiktok-web-contract.md](tiktok-web-contract.md).
2. Sign in by TikTok QR code, restart Ebb, and confirm the independent TikTok session restores.
3. Remove exactly one manually selected like, refresh, and confirm the video is absent on TikTok.
4. Remove exactly one manually selected Favorite Video, refresh, and confirm it is absent.
5. Unfollow exactly one manually selected account, refresh, and confirm it is absent.
6. Sign out from TikTok and confirm the Douyin session remains unchanged.

During a TikTok Following scan or mutation, confirm that the temporary first-party window appears, Ebb regains focus afterward, and the requested page state changes before Ebb marks the item complete. Stop immediately if the workflow requires generated-signature code, verification bypass, broad page automation, or repeated retries. A failure in any of the three workflows blocks the complete TikTok milestone.

## Real-account collection-removal release check

> This procedure removes one real collection and Ebb cannot restore it. Choose a video you are willing to remove from your collections. Never use **All** for release verification.

1. Run `npm run verify`; do not continue unless every automated gate passes.
2. Run `npm run dev`, restore the saved session, and open **Collected videos**.
3. Confirm the first collected-video rows load and the displayed collection count is plausible.
4. Select exactly one expendable video and confirm the scope changes to **Custom**.
5. Confirm and run the task; verify it reaches **Completed**.
6. Check in Douyin that the video's overall collection has been cancelled and that Ebb's collection count decreased by one.

If the read-only list contract lacks stable IDs or reliable pagination, or if the private write request is rejected because its contract changed, stop verification and record the response difference. Do not fall back to DOM automation or signature engineering.

## Failure handling

- For a Vitest failure, run the reported file directly with `npx vitest run <path>`.
- For an Electron failure, inspect the retained trace or screenshot under `test-results/`, then rerun `npm run test:e2e`.
- If the offline Electron test reports an external request, treat it as an isolation regression; the fixture must not be allowed to contact either platform.
- If the manual check encounters verification or rate limiting, stop the task. Do not repeatedly retry the account; sign out and retry later with a refreshed QR code.
