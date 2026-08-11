# Ebb

Desktop app for bulk-removing liked videos from Douyin.

## Requirements

- Node.js 22 LTS

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

`npm run dev` starts the Vite development server and Electron with hot reload. `npm run build` writes the renderer bundle to `dist/` and Electron main/preload bundles to `dist-electron/`.

## Stack

- Electron 43
- Vite 8
- React 19 and TypeScript 5.9
- Tailwind CSS 4.3
- shadcn/ui (Base UI, Nova style)
- liquid-glass-react

The renderer uses `@/` as an alias for `src/`. Native functionality must be exposed through the sandboxed preload bridge rather than enabling Node integration in the renderer.

## Using Ebb

1. Start Ebb and select **Open Douyin**. Sign in manually in the separate Douyin workspace.
2. Navigate to your Likes tab if it does not open automatically, then select **Scan likes**.
3. Search and select the videos to process. Choose **Remove likes** and confirm the irreversible change.

Ebb loads up to the first 100 liked videos and submits unlike requests through Douyin's web API inside the isolated signed-in workspace. It does not read, export, or store passwords and cookies. The workspace retains its sign-in state until **Sign out** is selected; the video list and task results exist only for the current app run.

Douyin can change its private web API, require request signatures, or request verification. Ebb pauses immediately when an API response is rejected. Complete any verification manually in the workspace, then select **Continue**. Start with a small selection on your own account: removing a like changes the account data and cannot be undone by Ebb.
