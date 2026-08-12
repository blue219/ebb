# Testing

Ebb has deterministic unit checks for local policy and scope logic. Its Douyin integration uses a real account and private web API, so end-to-end verification is manual and destructive.

## Automated checks

Run the smallest relevant command first:

```bash
npm test
npm run lint
npm run build
```

`npm test` covers:

- Douyin navigation and QR-image policy.
- Automatic-removal limits and completion rules.
- Renderer clear-scope selection and clamping.

There is currently no automated browser, IPC integration, or live-Douyin test suite.

## Real-account smoke test

> This procedure removes real likes and Ebb cannot restore them. Use a video you are willing to unlike. Do not start with **All**.

1. Run `npm run dev` and sign in by QR code.
2. Confirm that the account name, Likes count, and first 10 rows load.
3. Scroll near the end of the table and confirm another page loads when more likes exist.
4. Select one expendable video so the scope changes to **Custom**.
5. Confirm that the displayed clear target is 1, start the task, and verify it reaches **Completed**.
6. Check in Douyin that the like was removed and that Ebb's Likes count decreased by one.
7. Restart Ebb and confirm the saved session restores without another QR scan.
8. Choose **Sign out**, restart, and confirm Ebb asks for a QR scan.

For pause and stop checks, use a small numeric scope with multiple expendable likes. Because control is cooperative, allow the current request to finish before asserting that no further rows change.

## External failure checks

If Douyin rejects a request or requests verification, verify that Ebb pauses and shows the error instead of continuing mutations. Ebb has no general-purpose browser for interactive security challenges. Stop the task, sign out, sign in again with a refreshed QR code, and retry a small scope. Do not repeatedly retry a rate-limited account.
