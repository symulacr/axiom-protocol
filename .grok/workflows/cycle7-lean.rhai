let meta = #{
    name: "cycle7-lean",
    description: "Cycle 7: file-count reduction merges, memory quick wins, dist levers (locales, connectors)",
    phases: [
        #{ title: "Merges", detail: "5 parallel disjoint lanes" },
        #{ title: "Dist", detail: "locale exclusion then connector pruning" },
    ],
};

let common_rules = "RULES: behavior-identical only — no design/JSX-visual changes, no comment rewrites, "
    + "no dependency manifest edits, NO git commands (leave edits uncommitted). "
    + "After your edits run, from apps/frontend: `bunx tsc --noEmit` and the enumerated test suite "
    + "`bun test $(sed -n 's/^    \"test\": \"bun test //p' package.json | sed 's/\",$//')` — all must pass; revert any change that fails them. "
    + "Count LOC before/after per file and include the tally in your final message. ";

phase("Merges");

let p1 = "Repo /home/eya/og. Merge two sole-consumer components into apps/frontend/src/components/axiom/AppShell.tsx: "
    + "(1) PriorityActionStrip (apps/frontend/src/components/PriorityActionStrip.tsx, sole importer is AppShell) — move its implementation in as a local component, preserve exact JSX/props behavior; "
    + "(2) BrandMark (components/axiom/BrandMark.tsx, <20 lines, importers AppShell + LandingPage/NotFound/LockedRoute per prior audit — re-verify importers first; only absorb it into AppShell if ALL importers are inside AppShell's own file graph reachable without duplication, otherwise instead create components/axiom/BrandMark re-export... NO — if extra importers exist, SKIP BrandMark entirely and say so). "
    + "Delete the absorbed files. Update every importer. Verify no dangling imports remain via grep. "
    + common_rules;

let p2 = "Repo /home/eya/og. Merge two App-only components into apps/frontend/src/App.tsx: "
    + "LockedRoute.tsx and ErrorBoundary.tsx (verify each is imported ONLY by App.tsx; if other importers exist, skip that one and say so). "
    + "Move implementations in as local components of App.tsx preserving exact behavior, delete the files, update importers. "
    + common_rules;

let p3 = "Repo /home/eya/og. Absorb two single-consumer hooks: "
    + "(1) apps/frontend/src/hooks/useWriteToast.ts — verify its only consumer is hooks/useVaultWrite.ts, inline it there; "
    + "(2) apps/frontend/src/hooks/useVaultData.ts — verify its only consumer is hooks/useVaultDataBatch.ts, inline it there. "
    + "If any claimed sole-consumer status is false, skip that absorption and say so. Delete absorbed files, update importers. "
    + common_rules;

let p4 = "Repo /home/eya/og. Two cleanups: "
    + "(1) In packages/chat-runtime/src/lib.ts (or wherever lib.ts lives under packages/chat-runtime/src) remove dead exports `linkifyConsoleRefs` and `formatNeuron` — FIRST prove zero consumers via grep across apps/ and packages/ (excluding dist/node_modules); if consumers exist, skip and say so. Also remove their implementation code if now unreferenced internally. "
    + "(2) Consolidate the abi trio: apps/frontend/src/abi/addresses.ts + apps/frontend/src/abi/eip712 wrapper + apps/frontend/src/lib/abi (verify actual filenames) where consumer overlap >=80% — merge into ONE module keeping all exports stable; skip if exports genuinely differ in kind. Update importers. "
    + common_rules;

let p5 = "Repo /home/eya/og. Three memory quick wins in frontend: "
    + "(1) apps/frontend/src/pages/ChatPage.tsx around line 791: delete the write-only localStorage key `axiom:thread:${threadId}` persistence (verify nothing ever reads it back via grep 'axiom:thread'); do NOT touch the legitimate transcript persistence path; "
    + "(2) apps/frontend/src/hooks/useChatHistory.ts around lines 88-100: add a react-query `select` so the hook returns lightweight metadata (ids/titles/updatedAt) instead of full message arrays — verify every consumer of the hook uses only metadata via grep before changing, else skip; "
    + "(3) apps/frontend/src/lib/consoleStore.ts reducer around line 259: cap in-memory transactions array at 50 like the persist path. "
    + common_rules;

let merges = parallel([
    #{ prompt: p1, label: "merge:appshell", capability_mode: "read-write" },
    #{ prompt: p2, label: "merge:app", capability_mode: "read-write" },
    #{ prompt: p3, label: "merge:hooks", capability_mode: "read-write" },
    #{ prompt: p4, label: "merge:chatlib-abi", capability_mode: "read-write" },
    #{ prompt: p5, label: "memory:wins", capability_mode: "read-write" },
]);

let done = 0;
for r in merges {
    if r != () && r.success { done += 1; }
}
log(done.to_string() + "/5 merge lanes succeeded");

phase("Dist");

let a1 = "Repo /home/eya/og. RainbowKit ships 19 non-English locale chunks (~1.34 MB raw) that this app never uses "
    + "(apps/frontend/src/config/wagmi.tsx hardcodes locale en). Investigate @rainbow-me/rainbowkit's package layout "
    + "(node_modules/.bun/@rainbow-me+rainbowkit*/node_modules/@rainbow-me/rainbowkit) for how locales are imported "
    + "(dynamic per-locale chunks vs static). If locales are dynamically imported chunks: they cost dist size but not load — "
    + "attempt exclusion via build config ONLY if safe (check apps/frontend/build.mjs for external/drop options); "
    + "if statically bundled, find the official RK way to ship one locale. If no clean mechanism exists, DO NOT force it — "
    + "document exactly why and what mechanism would be needed. Behavior must be unchanged (connect flow still works, English UI). "
    + "Verify with frontend typecheck + enumerated tests + production build. Measure dist bytes before/after "
    + "(`du -sb apps/frontend/dist`). NO git commands. Report numbers in final message.";

let a2 = "Repo /home/eya/og. The frontend bundle includes MetaMask SDK (~560KB), Base/Coinbase SDK (~373KB) and Safe SDK (~580KB) "
    + "because `import { injected, walletConnect } from \"wagmi/connectors\"` resolves a barrel whose tree-shaking Bun ignores "
    + "(@wagmi/connectors declares sideEffects:false but Bun keeps them). Only injected + walletConnect are registered in "
    + "apps/frontend/src/config/wagmi.tsx. Approach: create apps/frontend/src/config/connectors-shim.ts that deep-imports the two "
    + "connector implementations directly from @wagmi/connectors' dist files (bypass the barrel — check what dist files exist and "
    + "whether the package exports map blocks deep imports; if blocked, try importing from the resolved node_modules path used by bun, "
    + "or vendor the two small connector wrappers). Then switch wagmi.tsx to import injected/walletConnect from the shim. "
    + "CRITICAL verification: frontend typecheck + enumerated tests + production build MUST pass AND the built dist must no longer "
    + "contain MetaMask/Safe/Base SDK markers (`grep -rl \"@walletconnect\\|safe-sdk\\|base-account\" apps/frontend/dist` shrinks) "
    + "AND `grep -c \"metamask\"` drops. If deep imports are impossible cleanly, revert and document why. Measure dist bytes before/after. NO git commands.";

let d1 = agent(a1, #{ label: "dist:locales", capability_mode: "read-write" });
let d2 = agent(a2, #{ label: "dist:connectors", capability_mode: "read-write" });

let dist_ok = 0;
if d1 != () && d1.success { dist_ok += 1; }
if d2 != () && d2.success { dist_ok += 1; }

complete(#{
    summary: "Cycle 7: " + done.to_string() + "/5 merge lanes + " + dist_ok.to_string() + "/2 dist levers succeeded. "
        + "Central gate run, measurement, and commit happen outside the workflow.",
    merges_succeeded: done,
    dist_succeeded: dist_ok,
});
