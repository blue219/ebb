# Architecture

Ebb groups platform-specific behavior by platform while keeping application entry points and proven shared behavior separate.

```text
shared/platforms/<platform>/  Cross-process contracts
electron/platforms/<platform>/  Main-process implementation and preload bridge
src/platforms/<platform>/  Renderer workspace and platform copy
electron/shared/  Main-process behavior shared by multiple platforms
src/shared/  Renderer behavior shared by multiple platforms
```

## Module rules

- Keep `electron/main.ts`, `electron/preload.ts`, and `src/App.tsx` as composition roots.
- Put platform-owned behavior, copy, security policy, and integration details under the matching `platforms/<platform>` directory.
- Put cross-process data and bridge interfaces in `shared/platforms/<platform>` so the main process, preload, and renderer use one contract.
- Move behavior into a runtime-specific `shared` directory only after it is platform-independent and reusable.
- Do not add an empty platform directory or a generic platform adapter before a second implementation exists.
- Preserve platform names in IPC channels and persisted session keys unless a compatibility migration is explicitly planned.
