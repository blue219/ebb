## Repository description

`Ebb` is a desktop app for reviewing and bulk-removing liked videos, collected videos, and followed accounts. Douyin and TikTok are implemented; TikTok retains the live release gates documented in [docs/tiktok-web-contract.md](docs/tiktok-web-contract.md).

## Goal

Provide a private, understandable workflow for reviewing and removing account likes without exporting credentials. See [README.md](README.md) for current capabilities and safety limitations.

## Local Startup

Use Node.js 22 LTS, then run `npm ci` and `npm run dev`. See [README.md](README.md) for all commands and [docs/testing.md](docs/testing.md) before using a real account.

## Tech stack

Use these versions by default unless a task requires otherwise:

- Node.js 22 LTS
- Electron 43
- Vite 8
- React 19
- TypeScript 5.9
- Tailwind CSS 4.3
- RESTful API
- shadcn/ui
- liquid-glass-react

Do not upgrade major versions without a clear reason.

---

## Repository structure

Platform code is grouped across `shared/platforms/`, `electron/platforms/`, and `src/platforms/`; composition roots remain in `electron/main.ts`, `electron/preload.ts`, and `src/App.tsx`. See [docs/architecture.md](docs/architecture.md) for ownership and process boundaries.

## Project rules

- Design the front end in Apple Liquid Glass UI style
- You can do tests with my current real account
