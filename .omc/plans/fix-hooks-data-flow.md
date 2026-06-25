# Fix Plan: Hooks + Data Flow Bugs and Patterns

**Plan saved to:** `.omc/plans/fix-hooks-data-flow.md`

**Scope:**
- 6 findings across 6 hook files
- Estimated complexity: MEDIUM

**Key Deliverables:**
1. Fix stale-close reconnection bug in `useEventStream`
2. Eliminate per-token re-render storm in `useOrchestratorTick`
3. Stop in-place API response mutation in `useTransfer`
4. Reduce spaghetti complexity in `useTransfer`
5. Remove dead `payComputeProvider` code
6. Eliminate duplicate AbortSignal chaining across 3 hooks

---

## 1. P0 — `useEventStream` stale-close reconnection bug

**Problem:** When `enabled` transitions `true→false`, the `useEffect` cleanup closes the old WebSocket. The old `ws.onclose` handler (which captured `enabled=true` in its closure at creation time) fires during this close and schedules a `setTimeout(connect, delay)` with the old `connect` callback. Even though a new `connect()` (with `enabled=false`) is created and called by the re-running effect, the stale timer from the old `onclose` fires later and creates a new WS connection regardless of `enabled`.

**Current code (useEventStream.ts:86-98):**
```ts
ws.onclose = () => {
    setIsConnected(false);
    wsRef.current = null;
    if (enabled) {  // stale closure
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), maxReconnectDelay);
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
    }
};
```

### 1a. Smaller delta
Add a `const enabledRef = useRef(enabled)` that's synced via `useEffect(() => { enabledRef.current = enabled; }, [enabled])`. In `onclose`, check `enabledRef.current` instead of `enabled`. Also clear the reconnect timer at the start of `connect()`. **~5 LOC, 1 file, 5 min.**

### 1b. More elegant
Extract a shared `useWebSocket(topics, enabled)` hook with proper lifecycle: a ref for enabled, exponential-backoff reconnect capped at 30s, topic-based subscriptions, and a cleanup that kills both the WS and any pending reconnect timer atomically. Both `useEventStream` and `useOrchestratorTick.tickStream` could consume it.

### 1c. Not architecturally coherent
The hook mixes connection lifecycle management (onopen/onclose/reconnect) with message parsing (JSON normalize → AxiomEvent) in a single `connect` callback factory. The `enabled` flag and `connect` are coupled through `useCallback` deps, but the `onclose` handler set during a specific render still executes with that render's closure values.

### 1d. Overengineered
A full state machine library (`xstate`), a reactive WebSocket library like `rxjs/webSocket`, or React Query subscription-based approach. The fix needs only ~5 LOC.

### 1e. Recommendation
**Smaller delta.** Add `enabledRef`, clear timer at `connect()` start. **Effort: 5 min. Files: `useEventStream.ts`.**

---

## 2. P0 — `useOrchestratorTick` per-token re-render storm

**Problem:** `tickStream` calls `setStreamedTokens((prev) => prev + payload.content)` on every WebSocket message containing a `"token"` type payload. For a 1000-token stream, this triggers 1000 React re-renders of every component consuming the hook. Each re-render re-evaluates `useVaultData`, `useAgents`, and all `useMemo`s in the tree.

**Current code (useOrchestratorTick.ts:139-141):**
```ts
if (payload.type === 'token') {
    onChunk(payload.content);
    setStreamedTokens((prev) => prev + payload.content);  // 1000 re-renders
}
```

### 2a. Smaller delta
Keep accumulated tokens in a `useRef<string>` in `tickStream`. Add a `useEffect` with a 100ms `setInterval` that flushes the ref into `setStreamedTokens` state. This collapses 1000 re-renders into ~10 (assuming 10 chars/token, 100ms intervals). **~15 LOC, 1 file, 30 min.**

### 2b. More elegant
Use `useRef<string>` for accumulation + `requestAnimationFrame` draining. Each WS token event appends to the ref. An rAF loop checks if the ref differs from the last-flushed state and calls `setStreamedTokens` once per frame (max ~60 updates/sec). This automatically adapts to display refresh rate.

### 2c. Not architecturally coherent
The hook couples rendering concerns (token display for UI) with data-fetching concerns (tick result). `streamedTokens` is UI-only display state, but it lives in the same hook that manages the business logic of the tick protocol. Every token triggers a state update that cascades through unrelated hooks.

### 2d. Overengineered
A virtualized streaming buffer that only renders visible tokens, React 19 `use()` with async generators, a Web Worker for token accumulation, or integrating with `useDeferredValue` + `React.memo` on every consumer.

### 2e. Recommendation
**Smaller delta.** Ref-based accumulation with interval flush. **Effort: 30 min. Files: `useOrchestratorTick.ts`.**

---

## 3. P0 — `useTransfer` mutates API response in-place

**Problem:** Line ~193: `proof.rekeyed = true` mutates the object returned by `apiFetch`. This breaks referential transparency — the object is shared with any code holding a reference to the raw response. If the API response shape changes or is frozen in the future, this silently fails.

**Current code (useTransfer.ts:192-196):**
```ts
if (challenge.rekeyed) {
    proof.rekeyed = true;            // mutation!
    proof.newDataHash = challenge.newDataHash;
    proof.newDataUri = challenge.newDataUri;
}
```

### 3a. Smaller delta
Replace the mutation with a spread when calling `setSignature`:
```ts
setSignature({ ...proof, rekeyed: true, newDataHash: challenge.newDataHash, newDataUri: challenge.newDataUri });
```
**~1 LOC, 1 file, 2 min.**

### 3b. More elegant
Make `apiFetch` return frozen objects in development (`Object.freeze(response)`). Add an ESLint rule (`no-param-reassign` or `fp/no-mutation`). The hook's data transformation should happen before `setSignature`, not after the fact.

### 3c. Not architecturally coherent
Mutation of API responses indicates no clear boundary between "backend-originated data" and "frontend-augmented data." The hook treats the API response as a mutable scratchpad rather than a value to be transformed.

### 3d. Overengineered
Immer, Immutable.js, a custom response proxy, or a full normalization layer just for this one assignment.

### 3e. Recommendation
**Smaller delta.** Spread into a new object. **Effort: 2 min. Files: `useTransfer.ts`.**

---

## 4. Spaghetti: `useTransfer` (269 lines)

**Problem:** 4 `setTimeout` warning timers (duplicated), 5-phase state machine (`idle → challenge → signing → finalizing → confirming`), hardcoded UI strings in error messages (`'Click "Prepare Transfer" to restart.'`), in-place API mutation, dual loading state (`actionLoading || isWritePending`).

### 4a. Smaller delta
Extract a `useWarningTimer(isLoading, message, delay)` helper that wraps the `setTimeout`/`clearTimeout` pair. Replace the 4 warning timer pairs with 2 calls (prepare + confirm). Move hardcoded UI strings into a `const TRANSFER_ERRORS` object at module scope. Remove the mutation (Finding 3). **~20 LOC reduction, 1 file, 45 min.**

### 4b. More elegant
Split into `useTransferChallenge` (handles `prepare`: backend call + signing, returns proof) and `useTransferConfirmation` (handles `confirm`: on-chain write via wagmi). Each has a single phase, single loading state, single error type. The parent `useTransfer` orchestrates the two via `transfer()`.

### 4c. Not architecturally coherent
The hook does backend API calls, EIP-712 signing, on-chain transactions, and UI state management all in one function. Error messages contain UI copy ("Click Prepare Transfer to restart") that couples the hook to a specific component's UX text. The 5-phase state machine is over-specified (only 3 phases matter to the caller: idle/preparing/confirming).

### 4d. Overengineered
XState machine, a custom `useTransferMachine` reducer, splitting into 5+ micro-hooks, or a context provider for transfer state.

### 4e. Recommendation
**Smaller delta.** Extract warning timer helper, move error strings to constants, remove mutation. **Effort: 45 min. Files: `useTransfer.ts`.** Don't split the hook — it has one consumer (`TransferModal`), and splitting creates more surface area than it saves.

---

## 5. `usePayment.payComputeProvider` dead code

**Problem:** The function is defined (lines 77-82), exported, and typed, but no UI component imports or calls it.

**Current code (usePayment.ts:77-82):**
```ts
const payComputeProvider = useCallback(
    (provider: Address, amount: string): Promise<ComputePayResult> =>
        payAction.execute((signal) =>
            apiFetch<ComputePayResult>('/v1/compute/pay', { ... }),
        ),
    [payAction.execute],
);
```

### 5a. Smaller delta
Remove the function, its `ComputePayResult` type (if not used elsewhere), and its entry in the return object. **~10 LOC removed, 1 file, 2 min.**

### 5b. More elegant
N/A — the elegant solution is to not have dead code.

### 5c. Not architecturally coherent
Exported API surface with zero consumers indicates either unimplemented features or incomplete cleanup after refactoring. Every exported function is a maintenance contract.

### 5d. Overengineered
Tree-shaking analysis, lazy-loading `usePayment`, or a dynamic registration system for payment methods.

### 5e. Recommendation
**Smaller delta.** Delete the function, its type, and the return entry. **Effort: 2 min. Files: `usePayment.ts`.**

---

## 6. 3 hooks duplicate AbortSignal chaining pattern

**Problem:** `useMint`, `useOrchestratorTick`, and `useTransfer` each create a second `AbortController` for external cancellation, then compose it with `useAsyncAction`'s signal via `AbortSignal.any()`. This pattern is identical across all three, fighting `useAsyncAction`'s own abort mechanism.

**Current pattern (appears in useMint.ts:38-42, useOrchestratorTick.ts:63-69, 93-96):**
```ts
const controller = new AbortController();
cancelRef.current = () => controller.abort();
return execute(async (signal) => {
    const combinedSignal = AbortSignal.any([signal, controller.signal]);
    // ...
});
```

**useAsyncAction.ts already manages its own AbortController per execution.** The consumer's extra controller is redundant for the lifecycle it manages — `useAsyncAction` already aborts on re-execution and on unmount.

### 6a. Smaller delta
Add a `cancel()` function to `useAsyncAction`'s return that aborts the current `abortRef` controller. Remove all consumer-side `cancelRef`/`abortControllerRef` + `AbortSignal.any` duplications. Replace with `cancel()` calls. **~10 LOC added in useAsyncAction, ~25 LOC removed across 3 files, 30 min.**

### 6b. More elegant
`useAsyncAction` becomes the single source of truth for cancellation. The consumer never needs their own AbortController. A `cancel()` on `useAsyncAction` aborts the in-flight execution. Re-execution (calling `execute` again) implicitly cancels the prior run.

### 6c. Not architecturally coherent
Every consumer re-implements the same "cancel from outside" pattern, indicating `useAsyncAction`'s API surface is incomplete. The base hook manages abort internally but doesn't expose it, so consumers hack around it.

### 6d. Overengineered
React Query migration, a custom `createCancellablePromise` utility with signal forwarding, or `AbortController` pooling.

### 6e. Recommendation
**Smaller delta.** Add `cancel` to `useAsyncAction`, remove duplicate controllers from consumers. **Effort: 30 min. Files: `useAsyncAction.ts`, `useMint.ts`, `useOrchestratorTick.ts`, `useTransfer.ts`.**

---

## Summary

| Finding | Priority | Approach | LOC Δ | Effort | Files |
|---------|----------|----------|-------|--------|-------|
| 1. useEventStream stale-close | P0 | enabledRef + timer cleanup | +5 | 5 min | `useEventStream.ts` |
| 2. useOrchestratorTick re-render storm | P0 | Ref accumulation + interval flush | +15 | 30 min | `useOrchestratorTick.ts` |
| 3. useTransfer API mutation | P0 | Spread instead of mutation | +1 | 2 min | `useTransfer.ts` |
| 4. useTransfer spaghetti | P1 | Extract timer helper, const-ify strings | -20 | 45 min | `useTransfer.ts` |
| 5. payComputeProvider dead code | P1 | Remove function + type + return entry | -10 | 2 min | `usePayment.ts` |
| 6. Duplicate AbortSignal | P1 | Add cancel() to useAsyncAction, remove duplicates | -15 | 30 min | `useAsyncAction.ts`, `useMint.ts`, `useOrchestratorTick.ts`, `useTransfer.ts` |
| **Total** | | | **~-24 net** | **~2 hr** | **5 unique files** |

### Execution order
1. **Finding 3** (2 min) — trivial, no risk
2. **Finding 5** (2 min) — trivial removal
3. **Finding 1** (5 min) — small change, fixes race condition
4. **Finding 6** (30 min) — requires understanding AbortSignal flow across 4 files
5. **Finding 2** (30 min) — self-contained, test with streaming endpoint
6. **Finding 4** (45 min) — most invasive, do last after other useTransfer changes

### Guardrails
- **Must have:** All P0 fixes (1, 2, 3) — these are observable bugs, not style issues
- **Must have:** Dead code removal (5) — zero risk, immediate hygiene improvement
- **Must NOT:** Change the public API of `useTransfer` (consumers depend on `prepare`, `confirm`, `transfer`, `reset`, `transferPhase`, `signature`)
- **Must NOT:** Add new dependencies (no libraries, no new files beyond the 5 listed)
