# Axiom Protocol — Change Log (all 688 commits)

*Generated from git history, 2026-08-29. HEAD = `a9ce3eec5` (docs: 0G Bridge one-pager). Branch `master`, 688 commits since `93c1f6aaa` (2026-06-23, initial drop). Tree clean; local master is 688 ahead of the force-updated origin snapshot.*

## Headline arc (one screen)

| Phase | Dates | Commits | What happened |
| --- | --- | --- | --- |
| 2026-06 — Bootstrap & foundation | — | 131 | see section |
| 2026-07 early — Contracts depth & deploy prep | — | 181 | see section |
| 2026-07 late — Live-flow hardening (Galileo) | — | 103 | see section |
| 2026-08 early — Bun-native migration & test scale-up | — | 28 | see section |
| 2026-08 mid — UX phases, CSS consolidation, live proofs | — | 90 | see section |
| 2026-08/29 — V2 contracts, testnet deploy, 0G adoption (RD/CSV/I waves) | — | 15 | see section |
| 2026-08 late — LOC/perf cycles & audit closure | — | 99 | see section |
| 2026-08 final — F/G waves (audits→fixes), jargon & design | — | 41 | see section |

---

## 2026-06 — Bootstrap & foundation  ·  131 commits

**general** (25)

- `93c1f6aaa` add: clean core production codebase with 0g integration · *2026-06-23*
- `7b2443ad0` chore(root): untrack 8 non-essential config files · *2026-06-23*
- `102df4ab1` chore(project): untrack 29 non-essential files · *2026-06-23*
- `14b37ae9a` chore(gitignore): harden and pin untracked files · *2026-06-23*
- `60b3276e2` feat: dark bronze branding across all pages — colorize, clarify,... · *2026-06-23*
- `c1c109e7c` feat: final visual consistency pass — dark palette across all... · *2026-06-23*
- `a5de741b5` feat: onboard + polish — improved empty states, button hover states,... · *2026-06-23*
- `de924dfef` feat: final cleanup pass — 404 page, all pages migrated to... · *2026-06-23*
- `a602490e8` chore: checkpoint before wave 2 micro-change implementation · *2026-06-23*
- `d965e0a14` wave 1: error handling & resilience · *2026-06-23*
- `61a82f260` wave 4: architecture foundations · *2026-06-23*
- `de46b2d59` wave 6: targeted features & cleanup · *2026-06-23*
- …and 13 more general commits

**testing** (5)

- `3f97b03a2` chore: untrack 2 orphaned test/stress files · *2026-06-23*
- `94ec447fd` fix(ci): fix 6 lint errors + transfer test null address bug · *2026-06-23*
- `e0e52dfe4` chore: galileo testnet setup + live endpoint verification · *2026-06-24*
- `b5a53231c` chore: untrack all test files + .gitignore · *2026-06-24*
- `ec6e0258b` test: repair pre-existing failures in all packages · *2026-06-28*

**docs** (16)

- `12fd09b23` docs(readme): add banner, logo, and badges · *2026-06-23*
- `b1cc458db` docs(readme): fix link coherence — version badges to real docs, fix... · *2026-06-23*
- `b4dfedc84` docs(readme): link akindo acknowledgment to actual hackathon page · *2026-06-23*
- `d0d15d2f5` chore: trim 10 noisy docstring blocks · *2026-06-23*
- `6e76b335f` chore: trim 10 more noisy docstring blocks · *2026-06-23*
- `c71a5bee3` chore: trim docstrings across 30+ files · *2026-06-23*
- `ebdcf9b64` chore: trim docstrings wave 4 · *2026-06-24*
- `03a1472a5` chore: trim docstrings wave 5 · *2026-06-24*
- `171dc0942` chore: trim docstrings wave 6 · *2026-06-24*
- `d36eb525b` docs: add v0.2.1 changelog · *2026-06-24*
- `7ad40c9d9` comment cleanup + docs update · *2026-06-25*
- `0fa044ff2` readme: remove changelog link, tighter layout · *2026-06-25*
- …and 4 more docs commits

**contracts** (15)

- `45d623e08` chore: move solhint.json into apps/contracts/; add ci/cd workflows · *2026-06-23*
- `96501beb7` fix(docker): switch to pnpm for workspace:* dep resolution;... · *2026-06-23*
- `a830ee273` fix(ci): exclude contracts from ts ci (no forge); proper pnpm... · *2026-06-23*
- `6b31015ae` fix(ci): solhint rules, tsconfig paths, contracts.yml filter asymmetry · *2026-06-23*
- `e60c1ddd6` wave 1: consolidate duplicated implementations · *2026-06-24*
- `a61b1c0bc` wave 6: foundation - env vars, networks, storage, contracts · *2026-06-24*
- `80f48593c` wave 7: backend + oracle + indexer + solidity rpc · *2026-06-24*
- `4af622c23` wave 8: frontend config, sse streaming, contract tests · *2026-06-24*
- `5985a39ca` fix(ci): resolve 4 failing ci checks · *2026-06-24*
- `b15241220` contract redeploy: axiompaymentprocessor + mockusdc on galileo · *2026-06-25*
- `5c159b257` centralize addresses: env-driven contract addresses across ts +... · *2026-06-25*
- `fa939000a` railway: exclude contracts from root build, track abi jsons for... · *2026-06-25*
- …and 3 more contracts commits

**infra** (11)

- `da01d1787` ci: push-only triggers (no pr) · *2026-06-23*
- `d377e68c3` fix(ci): install pnpm before setup-node; fix docker npm peer deps · *2026-06-23*
- `df3473189` fix(ci): remove pnpm/action-setup version (auto-detect from... · *2026-06-23*
- `1de8724d8` fix(readme): honest ci badge + separate galileo/aristotle status · *2026-06-23*
- `8e1acf963` perf(ci): parallelize jobs, docker caching, foundry cache fix,... · *2026-06-23*
- `71d60cb07` chore: remove ci badge from readme · *2026-06-23*
- `1bf198e2e` docs(readme): modular, concise — trim badges, tighten descriptions,... · *2026-06-23*
- `00e7acb2f` chore: checkpoint — comment cleanup + fix accidental code deletions · *2026-06-23*
- `c10519653` chore: vercel deployment config — pnpm corepack +... · *2026-06-23*
- `4e0b5f376` chore: delete code proven dead by import tracing · *2026-06-28*
- `bc9cf348f` chore: remove ci, deploy, and lint configs · *2026-06-28*

**frontend** (30)

- `c09e18fe7` fix(ci): add zod dep to oracle; remove unused frontend import; fix... · *2026-06-23*
- `9ff611523` fix(ci): add pnpm setup to frontend workflow; include deps in filter · *2026-06-23*
- `3677b45ec` fix(ci): build config before tests; fix oracle lint errors · *2026-06-23*
- `50fd7740b` fix(ci): build before tests (fresh checkout has no dist); fix indexer... · *2026-06-23*
- `8a6ee79da` chore: snapshot before frontend forensic fixes · *2026-06-23*
- `a95f2488f` feat: shared utils, ui primitives, errorboundary, 404 route, active... · *2026-06-23*
- `776d7f5cf` feat: layout + typography system — spacing scale, type scale, css... · *2026-06-23*
- `6dee30785` fix: add pnpm.onlybuiltdependencies to frontend package.json · *2026-06-23*
- `afa4057ed` fix: pnpm-workspace.yaml strictdepbuilds false for vercel · *2026-06-23*
- `9fccc60c7` fix: vercel install with --no-strict-dep-builds · *2026-06-23*
- `cb6bba4ec` fix: pnpm install --config.strictdepbuilds=false · *2026-06-23*
- `db3cd8395` fix: pass --config.strictdepbuilds=false to both install and build · *2026-06-23*
- …and 18 more frontend commits

**backend/0G** (11)

- `4ec899de2` fix(ci): add zod dep to backend (3 files import it directly) · *2026-06-23*
- `639f02d71` wave 3: deduplication - backend · *2026-06-23*
- `5ae48a8fe` wave 2: backend route handler factory · *2026-06-24*
- `ed6a2f5f8` wave 9: cleanup - dead deps, delete old storage files, docker, typecheck · *2026-06-24*
- `d15ab4161` fix: storage encryption - remove trydecrypt false positive guard, align... · *2026-06-24*
- `c551db1ce` feat: add env validation and health check to indexer · *2026-06-28*
- `3aea9af6a` fix: p0 critical — oracle deploy config, compute funding, tee... · *2026-06-28*
- `573421bcd` fix: p1 high — storage adapter cleanup, ethers dep pinning · *2026-06-28*
- `0e2a579c8` fix: p2 medium — provider-discovery cleanup, multi-model, oracle auth · *2026-06-28*
- `c38df7cbd` feat: add sentry monitoring, api docs, oracle deploy plan · *2026-06-28*
- `9126e972a` fix: oracle deploy — workspace yaml, packagemanager · *2026-06-28*

**fixes** (13)

- `db2428812` fix: critical runtime bugs - eip-712 typehash, intelligentdatasof,... · *2026-06-23*
- `bd5745289` fix: wire paymentpanel into agentdetail, make settings page functional... · *2026-06-23*
- `3adc9d790` wave 0: security & critical bug fixes · *2026-06-23*
- `07434ffb4` wave 4: infra fixes + deep dive research · *2026-06-24*
- `c1a9233f6` wave 10: remaining fixes - itransfer seal, backward imports, explorer... · *2026-06-24*
- `16136ed1f` fix: authorization event param order per eip-7857 spec · *2026-06-24*
- `04580f72f` waves 1-5: all micro-fixes complete across 5 waves (69 files,... · *2026-06-25*
- `68ac56c79` waves 1-2: critical bug fixes + pattern standardization (+25 files) · *2026-06-25*
- `6ae11965a` fix agents query: read chain directly instead of relying on undeplyed... · *2026-06-25*
- `2da3dc263` fix: prevent crashes from unhandled rejections · *2026-06-28*
- `7a7f5344f` style: clear outdated todo and fixme markers · *2026-06-28*
- `27dd9531b` chore: snapshot before 0g integration fixes · *2026-06-28*
- …and 1 more fixes commits

**refactor/perf** (5)

- `6746373b5` feat: skeletons for loading states, remove dead env.ts, polish · *2026-06-23*
- `7ed916511` wave 0: dead code & overengineering removal · *2026-06-24*
- `3e16d2686` wave 5: dead code removal + url centralization · *2026-06-24*
- `0630768e9` fix: ghost abi functions, dead code removal, sdk migration,... · *2026-06-24*
- `af48823ad` refactor: deduplicate address and event definitions · *2026-06-28*

---

## 2026-07 early — Contracts depth & deploy prep  ·  181 commits

**frontend** (43)

- `bc97b38cc` feat(frontend): modernize typography, integrate live-mode... · *2026-07-04*
- `264de697b` feat(frontend): harden hooks, improve error handling, add formatting... · *2026-07-04*
- `875acf16b` docs(frontend): audit reports and fix manifest · *2026-07-06*
- `898da7a84` fix(frontend): wave f1 critical hooks and writes · *2026-07-06*
- `af51721bf` fix(frontend): wave f2 data flow and performance · *2026-07-06*
- `52081ada4` fix(frontend): wave f3 shared ui primitives · *2026-07-06*
- `1b35d8e26` fix(frontend): wave f4 architecture polish · *2026-07-06*
- `6d82a7f88` fix(frontend): wave f5 medium/low cleanup · *2026-07-06*
- `0be8db948` chat runtime, frontend prod ui, archive api, ci workflows. untrack cli... · *2026-07-07*
- `d45e703a3` readme: live vercel and railway urls, chat-runtime, ci · *2026-07-07*
- `441cadd9a` fix deploy: backend railway config, trust proxy, and docs · *2026-07-07*
- `c206ed576` docs: railway prod env for chat and oracle cors · *2026-07-07*
- …and 31 more frontend commits

**infra** (5)

- `fdeaf2d01` refactor: move crypto modules (aes-gcm, ecies, secp256k1, eip712) from... · *2026-07-04*
- `e030693b8` chore(deploy): galileo redeploy addresses 2026-07-06 · *2026-07-06*
- `aca6349e8` docs(readme): trim redundant title, deploy, and health copy · *2026-07-07*
- `7ed2b74b4` docs: rewrite readme concise · *2026-07-10*
- `3f75788f6` ci: tighten vercel csp, drop localhost · *2026-07-11*

**backend/0G** (32)

- `494d09325` refactor(backend): extract compute broker, update imports to... · *2026-07-04*
- `89c397d8f` docs(backend): audit reports and fix manifest · *2026-07-06*
- `d9b15954c` fix(backend): wave w1 security and data flow · *2026-07-06*
- `b5ed0b71f` fix(backend): wave w2 compute and payment paths · *2026-07-06*
- `cac223165` fix(backend): wave w3 cache dedup and indexer · *2026-07-06*
- `fa2b9f39e` fix(backend): wave w4 oracle and config package · *2026-07-06*
- `af380a17f` fix(backend): wave w5 persist layer and e2e split · *2026-07-06*
- `9d7b5cd8d` fix(backend): wave w6 closure sweep · *2026-07-06*
- `8637dc21f` docs: note vercel redeploy after backend · *2026-07-07*
- `57e153220` fix: prod indexer events, e6 addresses, poll window 500 · *2026-07-07*
- `2facead7d` feat(compute): add direct provider client for 0g proxy endpoint · *2026-07-12*
- `a9a376756` fix(compute): surface upstream error as 502, slim direct client · *2026-07-12*
- …and 20 more backend/0G commits

**contracts** (19)

- `1b377d692` chore: simplify contracts, update indexer watcher, workspace config · *2026-07-04*
- `e46aa7b45` fix(contracts): wave o1 p0 security hardening · *2026-07-06*
- `3bfc5fd1a` fix(contracts): wave o2 admin timelocks · *2026-07-06*
- `1ffb8530b` fix(contracts): wave o3 economic hardening · *2026-07-06*
- `7dbc2571a` fix(contracts): wave o4 mev and expiry guards · *2026-07-06*
- `9a6e8bc1a` fix(contracts): wave o5 gas storage packing · *2026-07-06*
- `f8f6c1e96` fix(contracts): wave o6 erc-7857 architecture · *2026-07-06*
- `6a7f6910e` chore(config): regenerate abis from remediated contracts · *2026-07-06*
- `d375a03dd` fix(integration): abi follow-ups for vault and indexer · *2026-07-06*
- `9eeaab121` fix: chat schema, vault abi, skip link, prod indexer · *2026-07-07*
- `90fb183e3` fix: ci pnpm 11 and forge vendor install · *2026-07-07*
- `bf3506a90` fix: resolve lint diagnostics · *2026-07-09*
- …and 7 more contracts commits

**refactor/perf** (11)

- `ea91cd9f6` chore: formatting fixes, config types cleanup, and remaining refactors · *2026-07-04*
- `ece519a72` refactor: strip redundant comments · *2026-07-10*
- `e544354e5` refactor: dedup and remove dead code · *2026-07-10*
- `8254e45c3` refactor: remove dead symbols · *2026-07-10*
- `639879adb` refactor(executepanel): delete successcelebration canvas; success shown... · *2026-07-11*
- `728fb74ef` refactor(motion): drop dead .stagger utility; normalize ease tokens · *2026-07-11*
- `cadfe6b66` refactor: drop dead usememo and unused imports (-15 loc) · *2026-07-12*
- `02012334e` chore: trim and drop redundant comments (-26 loc) · *2026-07-12*
- `0c24cdbf2` checkpoint: pre-fix workspace state (before blocker/dead-code... · *2026-07-14*
- `52fbb0c26` chore: delete zero-caller dead code + dedupe · *2026-07-14*
- `62dba4143` refactor: remove dead eventstore methods (d5-d9) · *2026-07-14*

**docs** (6)

- `ccd718e4c` docs(onchain): audit reports and fix manifest · *2026-07-06*
- `0320e6c8b` readme: slim live urls, stack, dev; drop duplicate sections · *2026-07-07*
- `b80de594d` docs: restore readme banner assets under docs/assets · *2026-07-07*
- `741303b90` docs: simplify readme to diagram · *2026-07-11*
- `197e43d31` docs: enhance readme diagram · *2026-07-11*
- `4ecc4b162` docs: add 0g integration section, align tagline · *2026-07-11*

**testing** (5)

- `22377e6e2` feat(e2e): live on-chain proofs across full protocol path · *2026-07-06*
- `782aff77f` feat(e2e): add on-chain parity matrix with provable coverage · *2026-07-06*
- `b828cf0fe` feat(e2e): dedicated wallets, scenario matrix, friction report · *2026-07-06*
- `f94cad665` chore: untrack abi json, e2e, contrast script · *2026-07-11*
- `f76d89108` fix(wave1): purge testnet config + seal rpc · *2026-07-14*

**general** (45)

- `ef6e7adc2` chore: untrack .github workflows · *2026-07-07*
- `40e9b091d` chore: untrack .gitignore · *2026-07-07*
- `869df7729` chore: snapshot working state · *2026-07-10*
- `4aaea6de3` chore: untrack analysis reports · *2026-07-11*
- `ab9d8cb68` chore: gitignore root scratch files · *2026-07-11*
- `eb18fa4c4` gitignore: add dev-artifact patterns · *2026-07-11*
- `5f1cd86f9` gitignore: anchor self-ignore · *2026-07-11*
- `dd1dd7fd9` chore: untrack .github and scripts · *2026-07-11*
- `438fba502` chore: untrack pnpm, base, eslint configs · *2026-07-11*
- `c4d1864b6` chore: re-track configs, centralize .env.example · *2026-07-11*
- `bd80861f5` centralize model config and router · *2026-07-11*
- `0aad00370` merge core files; drop vercel.json · *2026-07-11*
- …and 33 more general commits

**fixes** (15)

- `6e2fe6945` fix: wire skill routers and auth · *2026-07-09*
- `35b631b87` fix: commit missing gitignore edits · *2026-07-11*
- `08f52b845` fix env example: move inline comment off axiom_disable_auth · *2026-07-11*
- `0301a774f` fix(motion): wire modal exit via allow-discrete; grid-rows reveal;... · *2026-07-11*
- `351a1b7b5` fix(env): make axiom_operator_pk optional (placeholder-safe) · *2026-07-12*
- `664cd4d94` fix: signer provider fallback and tool compression restore · *2026-07-12*
- `58f01433d` fix(agent-runtime): surface tool capabilities + clamp archive limits;... · *2026-07-12*
- `550e0d6eb` fix(agent-runtime): add context/capabilities to event_history read spec... · *2026-07-12*
- `5e33159c2` fix: make tool calls resilient (skill param · *2026-07-13*
- `44ea4c524` fix(wave2): within-turn tokenid propagation + address casing · *2026-07-14*
- `54ca3bc46` wave1: fix p0 auth/config — .env.example secure · *2026-07-14*
- `53270b206` chore: strip comments added during fix waves · *2026-07-14*
- …and 3 more fixes commits

---

## 2026-07 late — Live-flow hardening (Galileo)  ·  103 commits

**fixes** (8)

- `435aa410a` fix: production-harden axiom (waves 1–7) · *2026-07-16*
- `6433df6f6` fix: real remaining security gaps (no theater) · *2026-07-16*
- `4bd9ba57e` wave-f: fix erc-7857 transferred event compliance · *2026-07-21*
- `bb88d5afc` 7d: erc-7857 spec alignment — nonce, event, signature fixes · *2026-07-21*
- `ca8d45b08` 7e: migrate inline routes to createroute, fix nonce types · *2026-07-21*
- `e212385fa` w6: optimizer_runs 200->300, fix wip compilation bugs · *2026-07-21*
- `572336212` fix: track .gitignore with abi/ exclusion · *2026-07-22*
- `855cf7cfb` fix: re-add provider.ts (imported by 4 production files, was... · *2026-07-22*

**docs** (2)

- `4fa970484` docs: add refactor wave reports and progress tracker · *2026-07-16*
- `c4d9785c2` fix: restore readme banner image lost during rebase · *2026-07-22*

**backend/0G** (12)

- `5aa4b88ac` fix: skeptic gaps — indexer sink, cleartext dek reject, fe seal · *2026-07-16*
- `de4bf7fcc` fix: conflict markers from stash pop, remove stray storage/0g.ts · *2026-07-21*
- `12428ea7c` wave-e: trim 0g storage wrapper, upgrade compute sdk · *2026-07-21*
- `ba2f3d139` w1: critical fixes — restore run-e2e.ts, oracle cleanup, vendor dup,... · *2026-07-21*
- `9f305b1a4` w2: compute router deepening — replace custom streaming with sdk... · *2026-07-21*
- `80ff716c4` w3: indexer — replace batch buffer with per-event sdk upload, fix... · *2026-07-21*
- `570a7d544` w4: backend dead code cleanup + env schema completion · *2026-07-21*
- `5e76b39be` w5: oracle env validation + extractuploadresult removal · *2026-07-21*
- `68de8a9ad` feat: merge indexer into backend, remove standalone indexer package · *2026-07-22*
- `2fa421d6c` refactor: merge 8 backend files into fewer units · *2026-07-22*
- `1dae3f137` refactor: dedup storage seen-hashes + enable merkle proof verification... · *2026-07-27*
- `bb04ad7be` feat: enable sdk native aes256 storage transport encryption (wave 7) · *2026-07-27*

**frontend** (19)

- `b43910279` feat(frontend): phase 1 cyber terminal revamp + master plan · *2026-07-16*
- `520f4fb1b` docs: axiom frontend revamp master plan (3-agent merge) · *2026-07-16*
- `a881b05ee` feat: brand llm as axiom; complete frontend phases 2–5 · *2026-07-16*
- `7975ea782` feat(frontend): collapse nav to home · market · axiom + mint cta · *2026-07-16*
- `94f816224` feat(frontend): simplify ia — home/market/chat + mint modal · *2026-07-16*
- `1a3b0473e` feat(frontend): ship home·chat·mint ia and cyber-luxury revamp · *2026-07-16*
- `d46075ea2` feat(frontend): one-field mint + full landing revamp · *2026-07-16*
- `1f391e3ae` fix(frontend): honest landing, readable dark, product motion · *2026-07-16*
- `78dd3ba9d` fix(frontend): short use-case copy + state feedback motion · *2026-07-16*
- `3fc2d6ad5` fix(frontend): shorter agent empty states · *2026-07-16*
- `ab8fdb3fc` feat(chat): grok-style sidebar, fixed composer, clear compute errors · *2026-07-16*
- `43c8030d4` chore(chat): drop unused chatpage imports · *2026-07-16*
- …and 7 more frontend commits

**contracts** (18)

- `b082bf815` fix(frontend): crash on invalid mock usdc env; harden address resolve · *2026-07-16*
- `aa6c41c54` feat(frontend): shell chrome, theme toggle, simpler agent vault ui · *2026-07-16*
- `358e34874` chore: wave 4 — solidity gas, lint setup, dep cleanup · *2026-07-21*
- `44cb8ffb7` wave-d: consolidate frontend abis, add zerogmainnet export · *2026-07-21*
- `f6cb03efd` w1-w5-w6: contracts compile fix, compute sdk deepen, storage sdk expose · *2026-07-21*
- `a198807b2` w7: contracts tests — itransfer, iclone, uups, eip-7201 slots, doc... · *2026-07-21*
- `f22070599` w10-w2: contract sources — uups conversion + timelock + tx additions · *2026-07-22*
- `11eb3d311` w10-w3: deploy scripts — erc1967proxy pattern for all 3 uups contracts · *2026-07-22*
- `580da5594` w10-w7: final fixes — forge build green · *2026-07-22*
- `8f6b0cdc2` w10-w8: final test fixes — teeverifier validations, edge cases · *2026-07-22*
- `e549cbb9f` fix: reduce axiomagentnft bytecode under 24kb limit · *2026-07-22*
- `4d88c8129` chore: remove dead code, un-export internals, trim contract bytecode · *2026-07-22*
- …and 6 more contracts commits

**general** (19)

- `2a533be3d` add vercelignore · *2026-07-17*
- `1d5a895ce` chore: analysis reports from 7-agent deep-dive (43 findings) · *2026-07-21*
- `efedf1741` chore: wave 5 — housekeeping · *2026-07-21*
- `fe474ad01` wave-c: standardize env schemas across 4 apps · *2026-07-21*
- `52861feaf` chore: wave 7 analysis reports (9-agent 0g deep-dive) · *2026-07-21*
- `1be0293ae` 7c: file reduction — delete wrappers, merge modules · *2026-07-21*
- `7e8ac9a8f` w10: revert w4 sdk changes (v1.4 not on npm yet) · *2026-07-22*
- `b59c23c6f` w12: sdk removal + tx reduction hook · *2026-07-22*
- `587cb5c9e` chore: git rm non-critical files · *2026-07-22*
- `656e8053b` feat: wire websocket broadcast to eventstore for real-time event... · *2026-07-22*
- `775a3f3b7` chore: remove mock abi from tracking, add commit message template · *2026-07-22*
- `9f3f67034` chore: remove 22 non-essential files, reach 180 tracked · *2026-07-22*
- …and 7 more general commits

**refactor/perf** (12)

- `997b96331` fix: waves 1-3 — critical, high, medium perf fixes (43 findings) · *2026-07-21*
- `ec87ec162` wave-a: delete 563 loc dead code + 888kb brand assets · *2026-07-21*
- `e6d08b20a` wave-b: extract success/fail helper, deduplicate process handlers · *2026-07-21*
- `0d0331a43` 7b: serviceability — retryopts, dead exports, env rename · *2026-07-21*
- `c1679846f` w2-w3: eip712 nonce fix, critical bugs, dead code cleanup · *2026-07-21*
- `9a56e56b1` w4: dedup merge — result.ts, hex cleanup, transport merge,... · *2026-07-21*
- `b6337cdbf` w10-w1: foundation — timelockmanager library, chain unification... · *2026-07-22*
- `6f3d2fb30` refactor: merge mint-encode into agents, wire watcher env, dedup event... · *2026-07-22*
- `6f580cb3d` fix: add lru-cache dep + update lockfile · *2026-07-22*
- `b11ff296a` fix: actually update lockfile with lru-cache dep · *2026-07-22*
- `a4baa1ea6` refactor: remove dead code from 0g integration cleanup wave 1 · *2026-07-27*
- `712354d8f` refactor: config dedup and internal dedup from 0g cleanup wave 2 · *2026-07-27*

**infra** (10)

- `2c04bc64a` fix: waves 2-remainder — agents parallel, dead code, ci, env docs · *2026-07-21*
- `cbf64a59a` deploy: fix balance check to 0.1 og, update script for 0g zero-gas · *2026-07-22*
- `bb3435aa2` deploy: fast+parallel only — remove --slow as default · *2026-07-22*
- `5ed4fbe2e` deploy: add auto nonce check preflight · *2026-07-22*
- `2120af9cb` feat: automate abi gen, wallet gen, deploy script, single address source · *2026-07-22*
- `8274bbb38` fix: update .env.example to new july 22 deployed addresses · *2026-07-22*
- `7f2dae848` fix: re-track ci workflow file · *2026-07-22*
- `9cbadb0c9` chore: git rm dev files, re-track dockerfile+.dockerignore · *2026-07-22*
- `aa4f2d6d0` chore: remove deployment artifacts, redundant nixpacks from tracking · *2026-07-22*
- `18b65ee5a` fix: remove stale deployed.json fallback from addresses.ts · *2026-07-22*

**testing** (3)

- `9853888dc` fix: testtransferredevent_emitted — add missing indexed on_tokenid · *2026-07-21*
- `9650e517b` w10-w6: test updates — uups proxy patterns for all test files · *2026-07-22*
- `2f3ca6541` fix: fork test — use latest block instead of pinned, fix zeroaddress... · *2026-07-22*

---

## 2026-08 early — Bun-native migration & test scale-up  ·  28 commits

**infra** (3)

- `b3f324ed8` feat: add release workflow, re-track ci, mark old deploy superseded · *2026-08-08*
- `617c51637` feat: p2 caching, route cleanup, env-configurable runtime, ci+release · *2026-08-09*
- `de69c0648` perf: cycle-8b parallel binaries 0.7s (7.5s->1x), bun-only deploy path · *2026-08-10*

**refactor/perf** (7)

- `5c4e8d682` chore: campaign baseline captured (194 files, 24.1k src loc, 17 jscpd... · *2026-08-09*
- `c90d6ad13` refactor: cycle-1 dead code + clone reduction, sdk/bun research · *2026-08-09*
- `84b2d5e08` perf: cycle-3 allocation fixes + bun p0/p1 prep · *2026-08-09*
- `ccfc26152` refactor: cycle-4 config single-source-of-truth + jscpd/dep audit · *2026-08-09*
- `2baf09111` refactor: cycle-2 zero jscpd clones — 9 dedup refactors, net -67 LOC · *2026-08-10*
- `270e74e2c` refactor: cycle-3 LOC reduction — data-tables/helpers/hooks, net -269 src LOC · *2026-08-10*
- `0ce25cb2a` refactor: cycle-8 node-crypto -> global WebCrypto ports + Bun.file checkpoint · *2026-08-10*

**frontend** (5)

- `1b33b7067` refactor: cycle-2 frontend/oracle dead code + sdk bumps · *2026-08-09*
- `9d225a048` fix: frontend browser mount — deep-import config, drop node:crypto external · *2026-08-10*
- `cd97283c4` perf: cycle-4 bun compile binaries (2.5x build, 1-file deploy) + noUnused tsconfig · *2026-08-10*
- `bf6145143` refactor: cycle-6 LOC round 2 — skills/orchestrator/store + frontend, net -90 · *2026-08-10*
- `5f23e3af9` feat: cycle-8 full bun-native frontend — bun build/serve/dev, drop vite, port node crypto · *2026-08-10*

**contracts** (4)

- `78c62e273` refactor: cycle-5 clone resolution + dep removal + patch bumps · *2026-08-09*
- `9acaab61c` perf: cycle-6 frontend critical-path + contracts gas · *2026-08-09*
- `cb77ed9f7` chore: cycle-1 deps — OZ 5.6.1 + solc 0.8.24 + RG guard, eslint/js align, eth-crypto 3.2 · *2026-08-10*
- `3966bcbc1` fix: cycle-5 — minify binaries, fix zod empty chunk, contract import lints · *2026-08-10*

**testing** (4)

- `b2a3b5ad8` fix: cycle-7 root-cause 23 pre-existing test failures + alloc fixes · *2026-08-09*
- `eede1e91d` feat: cycle-8 latest versions (changelog-verified) + 6 real bug fixes · *2026-08-09*
- `ed2d6b742` feat: full bun-native migration — pnpm→bun, node→bun, tests+CI+deploy configs · *2026-08-10*
- `870f02db0` chore: cycle-7 dep freshness — sentry/viem/ts-eslint latest, unexport TimerHandle · *2026-08-10*

**fixes** (1)

- `d4a3d69f0` feat: cycle-9 mcp surface + ux fixes + single-source env + oom-safe... · *2026-08-09*

**backend/0G** (1)

- `1ca0b3dae` chore: cycle-10 final dead-code sweep + oracle timer leak fix · *2026-08-09*

**general** (1)

- `e403d3204` chore: merge untracked junk patterns into gitignore · *2026-08-09*

**docs** (2)

- `c927bbaeb` untrack md/docs junk · *2026-08-09*
- `00b9b1310` retrack readme+banner, trim readme 20% · *2026-08-09*

---

## 2026-08 mid — UX phases, CSS consolidation, live proofs  ·  90 commits

**refactor/perf** (10)

- `174770b05` chore: prune dead bench deps from lockfile, BUN_DISABLE_NODE_API startup flag · *2026-08-11*
- `9baeb0d53` fix: blocking diagnostics — unchecked URL throws + array-callback return · *2026-08-11*
- `e6dec6ea4` refactor: merge 12 single-consumer files + LOC reductions (net -56, zero regression) · *2026-08-11*
- `6f5aa2fd7` refactor: trim comments 88.7% across 6 src trees (3336 -> 377), keep insight · *2026-08-11*
- `8faef1764` refactor: cycle 4 LOC drive — -883 lines, net -206 vs goal baseline (target -150..-200) · *2026-08-11*
- `dffaaf43d` refactor: bun-native port — randomBytes->WebCrypto getRandomValues in aes-gcm · *2026-08-11*
- `686c09264` refactor: port node:path -> Bun-native joinPath/dirnamePath helper · *2026-08-11*
- `e028da9f6` refactor: port timingSafeEqual -> globalThis.crypto.timingSafeEqual (Bun-native) · *2026-08-11*
- `981a6d736` feat(c4): execute_tick full lifecycle + WS header auth + dedup + prod polish · *2026-08-19*
- `a847f0f3d` fix(ux-phase3): P3 batch + standing rules + C-10 LockedRoute closure (row 10) · *2026-08-20*

**fixes** (6)

- `d32257024` fix: mechanical diagnostics — return-await, redundant-state, double-neg, isNaN, optional-chain · *2026-08-11*
- `a7c4c60e2` fix: toReversed, drop needless async, destructure split index · *2026-08-11*
- `d3073fb23` fix: findings C2/C3/H1/H3-H6/M1/M2 (micro, net +15) · *2026-08-12*
- `e599f6b87` fix(config): ABI truth (drop phantom Ownable/UUPS), clamp royaltyBpsOf, 0G submitter/tags, zero-copy DEK flow · *2026-08-13*
- `362e50ede` fix(ux-phase1): tick WS subscribe-before-POST + cascade hover kill (C-01, C-02) · *2026-08-20*
- `d536af5cb` fix(ux-phase3): receipt status truth + payment boundary wiring (C-15) · *2026-08-20*

**testing** (5)

- `c20ad9e77` fix: diagnostics convergence — 0 pi-lens errors, full bun-native tests, dead code + rule-defect overrides · *2026-08-11*
- `5ae931403` fix(ci): re-track tests, fix unit-tests job, add coverage gate · *2026-08-12*
- `68d8f6adc` fix(e2e): sequential-parallel waves — revoke-after-authorize, transfer ∥ payment, live-gate skipped exclusion · *2026-08-13*
- `3baeec75a` fix(e2e): merge authorizeUsage+delegateAccess into authorizeAndDelegate (34→33 txs) · *2026-08-13*
- `047b218ef` fix(c3): 5 live-flow fixes proven on Galileo — BigInt tick payloads, WS wildcard broadcast, providers canonical_id, usePayment units, wagmi reconnect guard · *2026-08-17*

**frontend** (29)

- `b1d463e2c` fix(chat): P0/P1 UX batch — error frames, tool-call cards, message actions · *2026-08-11*
- `927f7f030` fix(chat): P2 UX batch — phase labels, composer textarea, queue, 429 retry, prompt slim, usage chip · *2026-08-11*
- `043f9568f` fix(chat): P3 UX batch — aria-live, thread CRUD, breaks/lang, panel boundaries + merges · *2026-08-11*
- `435bcfcbe` fix(css): dedupe duplicated .msg-action block (jscpd 0) · *2026-08-11*
- `cfb14fc37` fix(ux): flow-audit cycle 1 — 28 findings (agent-detail 16, chat 12) · *2026-08-11*
- `788528235` fix(ux): flow-audit cycle 2 — 19 landing/home findings + 6 dedup clusters · *2026-08-11*
- `9b29b0420` fix(chat): remove dead requiresApiKey gating in tool browser · *2026-08-11*
- `04d29fd65` feat(frontend): micro-polish plan M1-M9 (presentation layer only) · *2026-08-12*
- `259521b02` fix: S1-S4 micro-fixes (chat oracle 404, missing-blob re-key, successor key surfaced, reorg broadcast) · *2026-08-12*
- `44b766e6b` feat(frontend): round-2 micro-polish R1-R13 (source-audit plan) · *2026-08-12*
- `91f6a7293` feat(backend): persist chat transcripts to 0G storage + event store · *2026-08-12*
- `91b92014e` fix(wiring): post-merge frontend↔backend convergence — /oracle→backend, Galileo env, allowlist, dead-code purge · *2026-08-14*
- …and 17 more frontend commits

**contracts** (22)

- `950eea9ce` refactor(frontend): merge 4 vault forms into VaultTools.tsx (file count 130->127) · *2026-08-11*
- `6208e73cc` fix: pi-lens warning reduction cycle 3 — 47 warnings resolved, 14 dead exports removed · *2026-08-11*
- `df156eb05` fix: cycle 5 warning sweep — 22 more resolved, keeps documented with evidence · *2026-08-11*
- `133fd32f4` bench(contracts): mainnet live-fork gas probes on deployed contracts · *2026-08-12*
- `31ac31cc9` fix(backend): restore vault strategy state contract for e2e tree · *2026-08-12*
- `ebf3d5916` fix(contracts): M1-M5 guard gaps + testnet e2e unblockers · *2026-08-12*
- `91e688706` perf(contracts): forge build 2:25->0:35 wall, RSS 2.3GB->636MB · *2026-08-13*
- `3f008abac` fix(contracts): ownership guard on authorizeAndDelegate, VerifierUpdated emit, bps 100% rejection, dead error + init guard · *2026-08-13*
- `df8b0f9c8` feat(chat): wallet-keyed 0G sessions + forge config · *2026-08-13*
- `d7f4ea1b1` perf(build): forge 1.5.1→1.7.1 + solc 0.8.30→0.8.35 — 2.27x faster clean build, no regression · *2026-08-13*
- `ea1d41066` feat(contracts): depositAndSetStrategy + payForAgentAndCompute — 34→31 txs/run, prototype redeployed + proven on Galileo · *2026-08-13*
- `30382f2fe` feat(contracts+e2e): 5 verified tx-merges — e2e 12→6 on-chain txs, config category eliminated · *2026-08-13*
- …and 10 more contracts commits

**general** (1)

- `0900c1768` style: pin prettier 2-space config + one-time format normalization (101 files) · *2026-08-11*

**backend/0G** (13)

- `6cedbbd34` refactor: align useDeposit to useWithdraw's backend encode-relay pattern · *2026-08-11*
- `64addc056` fix(backend): remove dead storage/oracle config, fail-loud oracle storage in prod · *2026-08-12*
- `400525aad` fix(backend): derive indexer event ABIs from @axiom/config/abis · *2026-08-12*
- `c360b82b4` fix(e2e): full testnet flow green — transfer, storage, oracle domain, ABIs · *2026-08-13*
- `ffa1e1c36` test(backend): transfer proof nonce is hex (bytes), not decimal · *2026-08-13*
- `bf683a99a` refactor(backend): remove dead code and dedupe shared helpers (wave3) · *2026-08-13*
- `cd39dc889` fix(oracle+config): 7 audited bugs — no empty-blob fabrication, env transport key, validUntil cap, batched seen-hash flush · *2026-08-13*
- `3ebaf279d` chore: commit wave-4 e2e/oracle test + config churn baseline before tx-merge edits · *2026-08-13*
- `fccbb3ec3` refactor(oracle): merge oracle into backend as in-process routes — single service, −720 LOC net · *2026-08-14*
- `eec8bbdb9` fix(config): Galileo compute router URL — dead router-api-testnet.0g.ai → router-api-testnet.integratenetwork.work · *2026-08-14*
- `2fa7fbe83` feat(openapi): backend OpenAPI 3.1 spec generator + wiring-assert test (47 paths, 89 schemas) · *2026-08-14*
- `a41c318d6` fix(security): scrub live compute keys from .env.example + close gitleaks whole-file blind spot · *2026-08-15*
- …and 1 more backend/0G commits

**infra** (2)

- `6bfdff1d8` docs: record merged-prototype deploy evidence (Galileo, 12→6 txs, wall 143.6→98.2s) · *2026-08-13*
- `878bf9ab1` fix(ux-phase3): chain/token interpolation + i18n wiring + fixture purge + payment decimals (C-08/C-12/C-11) · *2026-08-20*

**docs** (2)

- `5795df7b5` docs(openapi): persist research reports + PoC into repo (report/openapi/) · *2026-08-15*
- `0db73ec47` docs(manifest): LIVE-FIX closure — objective coverage table, final gates, deferred registry · *2026-08-19*

---

## 2026-08/29 — V2 contracts, testnet deploy, 0G adoption (RD/CSV/I waves)  ·  15 commits

**backend/0G** (3)

- `9f5d5a508` test(backend · *oracle|chat-runtime): extend coverage — parser decode, SSE rails, strategy runner, skills, WS|2026-08-12*
- `a6eeda9ab` feat: I1 — 0G adopt-now items: RPC fallback transports (wagmi + ethers FallbackProvider), storage wrong-key canary (AXIOM1 magic + WrongKeyOrCorruptError), router price-cap headers, loud checkpoint resync with kill-switch · *2026-08-29*
- `2a32fa689` feat(backend): I3 — sealed-DEK custody (AXIOM_DEK_CUSTODY env, prod-off; mint-time upload, senderless re-key with row deletion, BYOK preserved) + configurable keeper module (indexer/chainlink/gelato/off modes, gas cap, loud-by-default) · *2026-08-29*

**contracts** (4)

- `f37f3d8cc` feat(backend): G3 — Paused/Unpaused indexed across all three contracts, /v1/governance/timelock readout with status derivation, OE-7 verified remediated · *2026-08-28*
- `5ab74921b` feat(contracts): V2 wave CV1 — Processor _split dedup + MAX_PAY cap + AccessControl governance; NFT fee/upgrade timelocks, authorizeDelegateAndRevoke + OPERATOR_ROLE removed; strategy-guard parity proof fixes 2 real drifts (dailyLimit=0, rollover !=); ABIs regenerated, e2e matrix updated · *2026-08-28*
- `a590d256d` feat(contracts): V2 wave CV2 — TeeVerifier signer allowlist (append-only storage, immediate revoke containment, timelocked add, registeredSigner view compat), UUPS proxy posture committed · *2026-08-28*
- `fd3f92b64` feat(frontend): I2 — single icon-button recipe (tokens + ~20 site migrations, glyph lottery ended), chat rail-head [+New] [search] [Chats] consolidation, 7 dedup extracts (EmptyState/encodeRelay/tick-metrics/enumerate/MultilineHeading/cleanPathOf, -77 net LOC, MCP case-drift bug fixed) · *2026-08-29*

**general** (2)

- `e7916f20d` chore(deps): RW safe pilot — husky 9.1.7, typescript-eslint 8.68.0, openai 7.8.0, sentry 10.71.0, spec floor re-alignments; all gates green · *2026-08-28*
- `979df62e6` chore: remove dev-only h3b mock helper from public/ (unreferenced, must not ship) · *2026-08-28*

**frontend** (5)

- `2b808e9af` feat(frontend): H1 — first-run activation checklist (connect→mint→fund→run), dashboard attention split (setup vs failing), error recovery states with retry + remedies · *2026-08-28*
- `c01e21e82` feat(frontend): H2 — flow zero-agent EmptyState + loading skeleton, rail slimmed to 6 grouped icon destinations (Overview/Operations/Resources), chat parity (15px assistant body, 2x2 prompt cards, streaming cue, aria-hidden ticker) · *2026-08-28*
- `257bc48f3` feat(frontend): H3 — landing real-product preview plate, mobile pass (44px targets, minmax grids, decimal keypads), optimistic receipts on AgentPage + poll shimmer + open-storage rename · *2026-08-28*
- `7ec2e7df4` feat(deploy): RD1 — V2 suite live on Galileo testnet; 4 proxies deployed+asserted, env cut over, indexer ingesting V2 events, e2e Live Path 20/22, FE bundle verified on V2 addresses · *2026-08-28*
- `490f42434` test(e2e): RD2 — sequential authorize/revoke fix, payment lane re-point, chat auth, TEE alias, 11-step failure-scenario matrix (all V2 reverts asserted), config ABI legacy restore · *2026-08-28*

**docs** (1)

- `a9ce3eec5` docs(hackathon): 0G Bridge Wave-3 one-pager (HTML), mermaid diagram pack, logic tables · *2026-08-29*

---

## 2026-08 late — LOC/perf cycles & audit closure  ·  99 commits

**frontend** (41)

- `5652b1913` fix(transfer): cross-party transfer completes from GUI — receiver co-sign (F-01) · *2026-08-21*
- `e69ca1d17` fix(landing): nav menu dropdown rendered as unpositioned full-width strip on desktop · *2026-08-21*
- `9f43e0927` fix(phase5-S2): typography + visual-weight discipline — one type scale, bold inversion fixed, quiet confirmed states · *2026-08-22*
- `f17460b86` chore(phase5-clearance): dead hooks/ui exports/icon/CSS orphans/storage double-label removed (Group A + verified orphans) · *2026-08-22*
- `1457c4709` refactor(clearance-A): dead code removal — 2 hooks deleted, ui.tsx 923→505, dead icon/const · *2026-08-22*
- `b89768878` refactor(clearance-B): storage demo vocabulary purged, dead CSS confirmed gone · *2026-08-22*
- `8bf8e7d8d` refactor(clearance-C): prototype/mockup vocabulary eliminated — zero hits in frontend · *2026-08-22*
- `be68a1ad7` docs(css-review): critical CSS architecture audit — 12 files are remediation sediment, not a system · *2026-08-22*
- `aa27c3a73` docs(css-critique): deep read-only audit — cascade reality, 81 value conflicts, 19 breakpoints, spacing chaos · *2026-08-22*
- `ec780b5bb` docs(css-critique): timestamped read-only audit — conflicts, precision bugs, standardization plan · *2026-08-22*
- `7e717b66b` docs(css-critique): deep read-only audit of all 13 layers — timestamped 2026-08-22T1113Z · *2026-08-22*
- `6692f67a1` fix(css-audit11 phase A): safe deletes — phantom column, dead selectors, hero motion, motion dedupe · *2026-08-22*
- …and 29 more frontend commits

**fixes** (10)

- `1a615ea7d` feat(phase4): deferred backlog closeout — cross-wallet transfer handoff, i18n flows, og-image, osint tokens, bun pin + nonce-padding bug · *2026-08-21*
- `508798534` fix(phase5-S1): span debris purge + simultaneous duplication elimination · *2026-08-22*
- `e4bff5c2c` fix(phase5-S3): copy clearance + terminology — ~208 audited strings applied · *2026-08-22*
- `9527891e2` fix(phase5-S4/S5): IA/layout simplification + final verification — Phase 5 complete · *2026-08-22*
- `e8578b705` fix(dev-proxy): buffer request bodies + force identity accept-encoding · *2026-08-23*
- `674a5f858` fix(lint+gates): stale mock-era type ref in fund CLI; bring src/cli under typecheck · *2026-08-23*
- `318c4f9d5` fix(i18n): receiver co-sign page showed sender-addressed copy · *2026-08-23*
- `c7410d5c3` fix(copy): remove AI writing tells from every rendered string · *2026-08-23*
- `6e2bcec86` fix(orchestrator): serialize ticks + nonces · *2026-08-24*
- `071586187` fix(server): bounded graceful shutdown · *2026-08-24*

**refactor/perf** (11)

- `ec5e11e9a` feat(osint): replace dead OpenCorporates with keyless GLEIF company search; wire CourtListener live · *2026-08-21*
- `f83cc9d21` refactor(loc-A): copy.ts dead-key purge — 18 keys ×3 locales deleted · *2026-08-23*
- `dc2e7f738` refactor(naming+fix): mockUsdc → paymentToken; track the payment-token ABI (fresh clones were broken) · *2026-08-23*
- `a0caaa8f7` fix(events-lock): stale lock from a dead pid no longer wedges boot; cycle 11 evidence · *2026-08-23*
- `ec39b7e8e` refactor: dedupe shared helpers · *2026-08-24*
- `c9ae9c385` perf: lazy sentry+openai, dedupe fe pages · *2026-08-24*
- `0d5064ce7` refactor(config): drop ethers import from crypto/keys · *2026-08-24*
- `3bc81b686` perf(config): split zod schemas from hex types · *2026-08-24*
- `df5b6dfd7` refactor: wave 1 dead-code sweep and dedupe · *2026-08-24*
- `6dc0ce47a` refactor: wave 2 cross-package dedupe · *2026-08-24*
- `a5f44fd3c` refactor: wave 3 gap-close (routeRegistry init fix, connect labels, file merges) · *2026-08-24*

**docs** (12)

- `59e4c53b8` docs(ux-audit): round 2 — span debris + visual complexity (06) and message hierarchy + terse copy (07), read-only · *2026-08-21*
- `eef962fff` docs(phase5): simplification manifest — 5 cycles from audit 06+07 (span debris→typography→copy→IA/layout→code+verify) · *2026-08-21*
- `5eccc6cc0` docs(ux-audit): round 3 read-only — cognitive-waste notes (08) + dead code/duplication (09) · *2026-08-22*
- `9c3b307a6` docs(ux-audit): clearance plan — ≥540 LOC identified across confident + verify sets, file unification map, prototype-vocabulary elimination · *2026-08-22*
- `7f41c01af` docs(clearance): execution report — 511 LOC cleared (verified deletions only), vocabulary zero · *2026-08-22*
- `229e032a3` docs(audit11): execution report — 18/23 findings fixed+verified, 5 deferred with reasons · *2026-08-22*
- `545e640d0` docs(audit11): C2 execution appended — all 23 findings now executed (18 A-C + 5 C2), verified per audit validation plan · *2026-08-22*
- `ee3ca20aa` docs(plan): LOC savings plan — −1,250 lines verified-safe across 6 items · *2026-08-23*
- `e64af7423` docs(plan): LOC savings plan executed — outcome tally vs. estimates per item · *2026-08-23*
- `da85b36fe` docs: unslop pass on living reference prose · *2026-08-23*
- `32212001d` docs(audit): per-skill copy slop audit + final rendered-text fixes · *2026-08-23*
- `787226144` docs: densify stale comments repo-wide · *2026-08-24*

**contracts** (4)

- `46fb297ef` refactor(phase5): prototype vocabulary eliminated — files+identifiers renamed to console* · *2026-08-22*
- `d1e486bbc` fix(css-audit11 phase B): winner consolidation — one owner per rule family · *2026-08-22*
- `2819b4c5e` ci(contracts): gate ABI drift in CI · *2026-08-24*
- `354d46d29` refactor: wave 5 module merges (chat, abi, vault hooks, config types) · *2026-08-24*

**infra** (1)

- `20f4f037f` docs(audit11): C3 appended — spacing fully swept to ladder, drift table complete · *2026-08-22*

**testing** (3)

- `4d9c51a8e` refactor(loc-E2+G): single-owner helpers + dead Button kit removal + stale copy tests repaired · *2026-08-23*
- `d425ccbae` fix(security): gate e2e inference-skip tick sources behind env opt-in + server key · *2026-08-23*
- `40f2e03ec` fix(live-e2e): dev env loading, registry-stats undercount, tool-args salvage — browser-verified on Galileo · *2026-08-23*

**general** (6)

- `5dee662c2` feat(mock-to-real): public agents hub shows live on-chain registry stats · *2026-08-23*
- `4a7c9160d` chore(tooling): wire lint-staged hooks · *2026-08-24*
- `89bd54d61` feat(events): typed event names, 400 on unknown · *2026-08-24*
- `3d690a64d` chore(deps): drop scoped override, align viem · *2026-08-24*
- `62a7ecbed` chore(deps): drop hardhat toolchain, dotenv · *2026-08-24*
- `e191a626b` chore(deps): bump wagmi/rk/rq minor, patches · *2026-08-24*

**backend/0G** (11)

- `1a3279b41` fix(indexer): reorg check compared hashes of two DIFFERENT blocks — false rollback every poll · *2026-08-23*
- `e35df331c` fix(indexer): drop dead chain-id fallback · *2026-08-24*
- `a0d370f11` feat(oracle): assert EIP-712 domain chain · *2026-08-24*
- `ca20fb154` refactor(backend): extract ServerConfig type · *2026-08-24*
- `9434cd969` refactor(backend): env knobs through zod schema · *2026-08-24*
- `ac8daca55` ci(backend): fail on stale OpenAPI spec · *2026-08-24*
- `c55ed23d3` chore(lint): type-aware rules for backend · *2026-08-24*
- `0a85c28d4` fix(indexer): flush store before checkpoint · *2026-08-24*
- `4cc778988` refactor: wave 3 backend infra condensation · *2026-08-24*
- `4a0073316` refactor: wave 4 oracle, storage, lib condensation · *2026-08-24*
- `59050b010` refactor: wave 12 copy compression, parallel merge, backend round 3 · *2026-08-24*

---

## 2026-08 final — F/G waves (audits→fixes), jargon & design  ·  41 commits

**frontend** (20)

- `4e8e842d8` fix(frontend): wave 1 UX repairs — routing SSOT, event scoping, skeleton gates, copy de-jargon · *2026-08-25*
- `1027b812c` fix(frontend): wave 2 dead-zone repairs — co-sign path, hub aliases, dead clicks, type scale · *2026-08-25*
- `1cdd5afe1` refactor(backend): relocate e2e harness out of production build graph · *2026-08-25*
- `d0833313b` perf(backend): parallelize /v1/chat/history transcript downloads · *2026-08-25*
- `71743b853` refactor(frontend): delete dead StoragePhase machine and PendingIntent.source union (OE-2, OE-3) · *2026-08-25*
- `927dc7582` refactor(frontend): single-importer file merges + dead telemetry + oracle pubkey memo (F-1, F-2, F-3, OE-4, S-3) · *2026-08-25*
- `8b287c4ec` test(frontend): hub-alias guards in CI script + co-sign missing-param split + provider fetch dedupe (L5-02, L5-04, L5-05) · *2026-08-26*
- `14f048f6b` feat(frontend): upgrade wagmi 2.19.5 -> 3.7.6, useConnectors() rename (L6-W1) · *2026-08-26*
- `01fd302fa` fix(frontend): canonical regex matches hyphenated public-hub paths (/public-developers -> /developers) · *2026-08-26*
- `71bae1ca0` fix(frontend): one-click wallet connect via EIP-6963 discovery · *2026-08-26*
- `df10a449a` refactor(frontend): dead-code sweep wave 1 — certain tier (-376 LOC) · *2026-08-26*
- `bb1608205` refactor(frontend): dead-code sweep wave 2 — likely tier + export hygiene (-17 net) · *2026-08-26*
- …and 8 more frontend commits

**contracts** (8)

- `8422bc62b` fix(frontend): wave 3 theme repairs — AA light-theme state colors, token consolidation · *2026-08-25*
- `4efedcdaa` perf(backend): fire-and-forget chat transcript persistence (S-5) · *2026-08-25*
- `2355aa169` fix(frontend): memoize wagmi config on resolved inputs — no double WalletConnect Init (L5-03) · *2026-08-25*
- `37dfb9158` refactor(flows): P3 hashless completion — one-call mint, address-resolved receiver key, nonce ceremony removed · *2026-08-27*
- `ade1a41a8` refactor: wave 10 — medium ledger rows (landing hero, chat tagline, tool labels, light elevation tokens, surface consolidation, nonce dedup, chat-history LRU) · *2026-08-27*
- `a2ccf8691` refactor: wave 11 — LOW hygiene sweep (addr helper dedup, composer counter, mini-tables, stop-slot stability, focus-visible, theme mechanism consolidation, foundry pin, ADR-002, decimals 18) · *2026-08-27*
- `4e534b189` refactor(frontend): F2 — design top-10: task-surface plate demotion, de-slop sweep (100 copy fixes), dead pseudo systems removed, status dot glow removed, token ladder consolidated (render-identical, contrast 6.73/6.24 held) · *2026-08-27*
- `eb3443a5a` feat(frontend): G1 — chat thread resume survives tab close (localStorage), storage page gets 0G verification + forward exits, staking dual exits, button/card/chip pattern consolidation (render-identical) · *2026-08-27*

**backend/0G** (9)

- `10f66be93` perf(backend): parallelize creatorOf and getPayment in earnings route · *2026-08-25*
- `34393d699` refactor(backend): fold Watcher into indexer/index.ts · *2026-08-25*
- `4baaa0e90` refactor(backend): merge provider.ts + compute/index.ts into providers.ts · *2026-08-25*
- `dea23ddc1` refactor(backend): extract inline registrars from server.ts into routers/ · *2026-08-25*
- `955ce7e5b` chore(backend): land U1 script/tsconfig/CI rewiring missed from 1cdd5afe1 · *2026-08-25*
- `baf571c9f` fix(backend): public /api/health alias for unstripped /api proxies (L5-06) · *2026-08-25*
- `d6cc9003d` perf(backend): P2 speed wave — client singleton, mint fold, 3s indexer poll · *2026-08-27*
- `fd64203d9` perf(backend): P4 — oracle blob LRU cache + optimistic tick settlement · *2026-08-27*
- `610517a3d` refactor(backend): G2 — EventStore single-structure simplification (-87 LOC), SeenHashesMixin injection seam (test double disk-clean), boot shutdown listeners bound first (S-4), ADR-003 keeper options, M1/M11/L6-P1 decision labels · *2026-08-27*

**general** (2)

- `782a25d93` feat(protocol): strategy-limit surfaces + earnings withdrawal + safe bumps (M3, M6, M9, L6-V1) · *2026-08-26*
- `7075c6c41` chore: artifact cleanup — 275MB freed, tracked junk removed, brand assets re-tracked · *2026-08-26*

**testing** (1)

- `5a0b8ccd7` refactor(protocol): shared strategy-guard in config, sitemap short URLs + canonical, 18-decimal fixes (wave8) · *2026-08-26*

**infra** (1)

- `cf79ac674` feat: F3 — short hub URLs canonical with 308 legacy redirects (SPA+servers), React 19.2.8 + useMutation port, MCP in-process dispatch (loopback behind flag), M4/M5 decision labels · *2026-08-27*

---

## Notable milestones (the spine)

- 93c1f6aaa — Initial production drop with 0G integration
- · — Foundry contract suites (iTransfer, iClone, UUPS, EIP-7201) + Galileo live on-chain proofs
- · — Oracle TEE signature verification + mint flow live
- · — Cycle series: allocation fixes, warning sweeps, Bun-native frontend (dropped Vite), tx-merge prototype (12→6 txs)
- · — Deprecation of RainbowKit → wagmi-native connect; wagmi 2→3 upgrade
- ed4b28357 — Jargon sweep — plain-language locked states across en/fr/de
- 5ab74921b — Contracts V2 CV1 — Processor MAX_PAY + AccessControl, NFT timelocks, dead surfaces removed
- a590d256d — Contracts V2 CV2 — TeeVerifier signer allowlist (same-block revocation)
- 7ec2e7df4 — V2 deployed fresh to 0G Galileo testnet — 4 proxies, wiring asserted on-chain
- 490f42434 — Failure-scenario marathon — 11/11 invalid paths proven with exact revert selectors
- a6eeda9ab — 0G adopt-now resilience — RPC fallbacks (live-proven), storage canary, price caps, loud resync
- 2a32fa689 — Sealed-DEK custody (env-gated) + configurable keeper — the last deferred features
- a9ce3eec5 — 0G Bridge Buildathon one-pager + diagram pack (this submission's docs)

## Final verified state

| Suite | Tests |
| --- | --- |
| Foundry (contracts) | 201 pass / 0 fail |
| Backend (Bun) | 175 pass / 0 fail |
| Frontend (Bun) | 112 pass / 0 fail |
| Chat runtime | 64 pass / 0 fail |
| Shared config | 47 pass / 0 fail |
| **Total** | **599 pass / 0 fail · 0 suppressions** |

*Live deployment: docs/deployments/galileo-v2-2026-08-28.json (0G Galileo, chain 16602).*
