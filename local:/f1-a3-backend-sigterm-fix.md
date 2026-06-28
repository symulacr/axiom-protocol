# F1-A3: Backend SIGTERM Handler

## Changes Made

### `apps/backend/src/index.ts`
1. **Line 8**: Added `import { getEventStore } from "./events/store.js";`
2. **Line 23**: Changed `startServer({` to `const server = startServer({` to capture the returned `{ httpServer, app }` object
3. **Lines 55-62**: Added SIGTERM/SIGINT handler that:
   - Logs shutdown with signal name
   - Calls `getEventStore().flush()` (F1-A6 already implemented the `flush()` method)
   - Calls `server.httpServer.closeAllConnections?.()` (Node.js 19+ graceful connection drain)
   - Calls `server.httpServer.close(() => process.exit(0))` to complete shutdown

### `apps/backend/src/server.ts`
- No change needed — already returns `{ app, httpServer }` from `startServer()`.

### `apps/backend/src/events/store.ts`
- No change needed — F1-A6 already added the `flush()` method and cleaned up the TODOs.

## Verification
- TypeScript compilation passes (`bunx tsc --noEmit` exits cleanly)
- Both SIGTERM and SIGINT are handled
- EventStore flush ensures pending events persist before shutdown
- `.closeAllConnections?.()` drains HTTP keep-alive connections before close
