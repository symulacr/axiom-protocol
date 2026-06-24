# Lint Investigation Report — Solidity Contracts

**Date:** 2026-06-24
**Scope:** `apps/contracts/src/**/*.sol` (15 source files)
**Tools used:** `forge build` (v1.5.1), `forge lint`, `solhint` (v5.2.0)

---

## Section 1: Suppressions Removed

| File | Line | Suppression Type | What It Was Hiding | Removed? |
|------|------|-----------------|-------------------|----------|
| - | - | - | - | **No suppressions found** |

**Detail:** No `forge-lint-disable`, `nolint`, `NOSONAR`, `lint-ignore`, or any other suppression comments exist in the source Solidity files under `apps/contracts/src/`. The only references to "forge-lint" found are two **explanatory NatSpec comments** (not directives) in `AxiomMetadataJson.sol` (lines 237, 275) that explain why certain code is safe despite potential forge-lint warnings:

- Line 237: `/// forge-lint 'unsafe-typecast' warnings on the index expression are provably safe`
- Line 275: `/// into a helper so the forge-lint 'unsafe-typecast' warning is isolated to a single, well-justified site`

These are documentation comments (prefixed `///`), not suppression pragmas, and were left as-is.

---

## Section 2: All Forge / Solhint Warnings & Errors

### 2A. FORGE BUILD — Compilation Errors (Exit Code: 1)

The code **does not compile**. There is 1 unique error causing the build to fail.

| File | Line | Rule / Error Code | Message | Severity | Proper Fix |
|------|------|-------------------|---------|----------|------------|
| `src/extensions/ERC7857AuthorizeUpgradeable.sol` | 62 | `Error (9553): Invalid type for argument in function call` | `Invalid implicit conversion from uint256 to address requested. emit Authorization(tokenId, msg.sender, to);` | **BLOCKING** | Fix argument order in `emit Authorization(tokenId, msg.sender, to)`. The event `Authorization` in `IERC7857Authorize.sol` is declared as `event Authorization(address indexed from, address indexed to, uint256 indexed tokenId)` — parameters are `(address, address, uint256)`. The call site passes `(uint256, address, address)`. Change to: `emit Authorization(msg.sender, to, tokenId);` |

**Root cause:** Parameter order mismatch between event definition and emission.

---

### 2B. SOLHINT — 84 Problems (1 Error, 83 Warnings)

All findings below are from `npx solhint "apps/contracts/src/**/*.sol"`. Results are grouped by rule.

#### Rule: `import-path-check` (many false positives)

| File | Line | Message | Real Issue? | Proper Fix |
|------|------|---------|-------------|------------|
| All files importing from `@openzeppelin/...` or `@0g-agent-nft/...` | Various | "Import ... doesn't exist in: ..." | **FALSE POSITIVE** — solhint does not resolve Foundry remappings. The imports resolve correctly during `forge build` (the failed build is unrelated to import resolution). | Configure solhint to use Foundry remappings (not natively supported) or ignore this rule in `.solhint.json`: `"import-path-check": "off"` |

#### Rule: `no-unused-import` (7 occurrences)

| File | Line | Unused Import | Severity | Proper Fix |
|------|------|---------------|----------|------------|
| `src/AxiomAgentNFT.sol` | 10 | `import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol"` | warning | Remove the import line (IERC165 is not used directly; `supportsInterface` uses it via inheritance) |
| `src/AxiomAgentNFT.sol` | 25 | `import {IERC7857DataVerifier} from "./interfaces/IERC7857DataVerifier.sol"` | warning | Remove the import (the verifier type is accessed via the base contract, not directly) |
| `src/extensions/ERC7857AuthorizeUpgradeable.sol` | 15 | `imported name IntelligentData is not used` | warning | Remove `IntelligentData` from the import, or remove the import line entirely |
| `src/extensions/ERC7857CloneableUpgradeable.sol` | 14 | `imported name IERC7857DataVerifier is not used` | warning | Remove `IERC7857DataVerifier` and `TransferValidityProof` from the import |
| `src/extensions/ERC7857IDataStorageUpgradeable.sol` | 10 | `imported name EnumerableSet is not used` | warning | Remove the entire `EnumerableSet` import line |
| `src/interfaces/IERC7857.sol` | 6 | `imported name IntelligentData is not used` | warning | Remove `IntelligentData` from the import (only the `IERC7857Metadata` interface is needed) |
| `src/interfaces/IERC7857Cloneable.sol` | 5 | `imported name IERC7857DataVerifier is not used` | warning | Remove `IERC7857DataVerifier` from the import |

#### Rule: `gas-custom-errors` (18 occurrences)

| File | Lines | Message | Severity | Proper Fix |
|------|-------|---------|----------|------------|
| `src/AxiomAgentNFT.sol` | 91, 92, 137, 174, 175, 192, 193, 194, 205, 206, 213, 214, 232, 237, 240 | "GC: Use Custom Errors instead of require statements" | warning | Replace `require(condition, "message")` with a custom error + `revert`. For Solidity >=0.8.4, custom errors are more gas-efficient. Example: `error ZeroVerifierAddress();` then `if (verifierAddr == address(0)) revert ZeroVerifierAddress();` |
| `src/AxiomStrategyVault.sol` | 95, 162 | "GC: Use Custom Errors instead of require statements" | warning | Same fix — replace `require(ok, "...")` with custom errors (the contract already defines many custom errors; just convert remaining `require` calls) |
| `src/verifiers/AxiomTeeVerifier.sol` | 87, 88, 122 | "GC: Use Custom Errors instead of require statements" | warning | Same fix — replace `require(condition, "...")` with defined custom errors (`AxiomInvalidSigner`, etc.) |

#### Rule: `max-line-length` (many occurrences)

| File | Lines | Current Length | Severity | Proper Fix |
|------|-------|----------------|----------|------------|
| `src/AxiomAgentNFT.sol` | 111, 115, 119, 123, 191, 204, 212 | 137–169 chars | warning | Break long lines at 120 chars. Mostly in function signatures with long inheritance lists and NatSpec comments |
| `src/AxiomPaymentProcessor.sol` | 202, 235 | 127, 142 chars | warning | Break long comment lines at 120 chars |
| `src/AxiomStrategyVault.sol` | 106, 115 | 124, 136 chars | warning | Break long lines at 120 chars |
| `src/ERC7857Upgradeable.sol` | 9 | 127 chars | warning | Break import line or comment |
| `src/extensions/AxiomMetadataJson.sol` | 249 | 123 chars | warning | Break line at 120 chars |
| `src/extensions/ERC7857AuthorizeUpgradeable.sol` | 101 | 125 chars | warning | Break `supportsInterface` line at 120 chars |
| `src/extensions/ERC7857CloneableUpgradeable.sol` | 59, 77 | 125, 135 chars | warning | Break long lines |
| `src/interfaces/IERC7857Cloneable.sol` | 31 | 131 chars | warning | Break long function signature |
| `src/interfaces/IERC7857DataVerifier.sol` | 19, 36 | 130, 149 chars | warning | Break long NatSpec/dev comments |
| `src/verifiers/AxiomTeeVerifier.sol` | 71 | 133 chars | warning | Break long comment line |

#### Rule: `func-name-mixedcase` (2 occurrences)

| File | Line | Function Name | Severity | Proper Fix |
|------|------|---------------|----------|------------|
| `src/ERC7857Upgradeable.sol` | 42 | `__ERC7857_init` | warning | This is a convention from OpenZeppelin upgradeable contracts (double underscore prefix for initializers). Accepted pattern — can be suppressed or renamed to `erc7857_init` but would break OZ conventions |
| `src/ERC7857Upgradeable.sol` | 47 | `__ERC7857_init_unchained` | warning | Same as above — OZ upgradeable naming convention |

#### Rule: `no-global-import` (3 occurrences)

| File | Line | Import | Severity | Proper Fix |
|------|------|--------|----------|------------|
| `src/ERC7857Upgradeable.sol` | 11 | `import "@0g-agent-nft/Utils.sol"` | warning | Change to named import: `import {Utils} from "@0g-agent-nft/Utils.sol"` (need to verify Utils is a library) |
| `src/verifiers/AxiomTeeVerifier.sol` | 6 | `import "./BaseVerifier.sol"` | warning | Change to: `import {BaseVerifier} from "./BaseVerifier.sol"` |
| `src/verifiers/BaseVerifier.sol` | 4 | `import "../interfaces/IERC7857DataVerifier.sol"` | warning | Change to: `import {IERC7857DataVerifier, TransferValidityProof, TransferValidityProofOutput, AccessProof, OwnershipProof, OracleType} from "../interfaces/IERC7857DataVerifier.sol"` |

#### Rule: `quotes` (1 error)

| File | Line | Message | Severity | Proper Fix |
|------|------|---------|----------|------------|
| `src/extensions/AxiomMetadataJson.sol` | 186 | "Use double quotes for string literals" | **error** | Change `'\\"'` to `"\\\""` on line 186. The code is: `buf = _appendBytes(buf, bytes('\\"'));` — replace with `buf = _appendBytes(buf, bytes("\\\""));` |

#### Rule: `immutable-vars-naming` (1 occurrence)

| File | Line | Variable | Severity | Proper Fix |
|------|------|----------|----------|------------|
| `src/verifiers/AxiomTeeVerifier.sol` | 46 | `uint256 public immutable maxProofAgeSeconds` | warning | Rename to `MAX_PROOF_AGE_SECONDS` to follow SNAKE_CASE convention for immutable/constant variables |

---

## Section 3: Summary

### Total Warnings After Removing All Suppressions

| Category | Count |
|----------|-------|
| **forge build compilation errors** (blocking) | **2** (from 1 root cause) |
| **solhint errors** | **1** |
| **solhint warnings** | **83** |
| **Total** | **86** |

### Exit Code of `forge build`: **1** (compilation failed)

### Forge Lint Status

`forge lint` reports the same 2 compilation errors. Because the code does not compile, forge-lint cannot produce its own lint diagnostics (linting runs after successful compilation). The solhint results above serve as the effective lint report.

### Real Bugs vs. Style Only

#### 🔴 BLOCKING (1 issue, must fix before deployment)

| Priority | Issue | File | Why |
|----------|-------|------|-----|
| **P0** | `emit Authorization(tokenId, msg.sender, to)` — wrong argument order | `ERC7857AuthorizeUpgradeable.sol:62` | Compilation error. The `Authorization` event expects `(address, address, uint256)` but receives `(uint256, address, address)`. The event emission would emit wrong data even if it compiled due to type mismatch. **This is a real bug — the tokenId and msg.sender/addresses are swapped.** |

#### 🟡 Potentially Impactful (style + best practices)

| Priority | Issue | Files | Why |
|----------|-------|-------|-----|
| **P1** | `quotes` — single quotes for string literal | `AxiomMetadataJson.sol:186` | Solhint error (not warning). Single quotes for Solidity string literals are non-standard |
| **P2** | `gas-custom-errors` — 18 `require` calls | `AxiomAgentNFT.sol`, `AxiomStrategyVault.sol`, `AxiomTeeVerifier.sol` | Medium gas savings. Custom errors are cheaper and more expressive than `require("string")` |
| **P3** | `no-global-import` — 3 global imports | `ERC7857Upgradeable.sol`, `AxiomTeeVerifier.sol`, `BaseVerifier.sol` | Global imports (`import "path"`) pollute the namespace and make dependencies unclear |
| **P4** | `no-unused-import` — 7 unused imports | Multiple files | Dead code, increases bytecode size slightly (affects deployment cost) |
| **P5** | `func-name-mixedcase` — 2 functions | `ERC7857Upgradeable.sol` | OZ upgradeable convention. Low priority but worth naming consistently |
| **P6** | `immutable-vars-naming` — SNAKE_CASE | `AxiomTeeVerifier.sol` | Naming convention only |

#### 🟢 Informational / False Positives

| Issue | Files | Why |
|-------|-------|-----|
| `import-path-check` (many) | All files | Solhint cannot resolve Foundry remappings. **False positive.** Should be disabled in `.solhint.json` |
| `max-line-length` (many) | Multiple files | Strictly style. The 120-char limit is reasonable but long import chains and NatSpec comments often exceed it |
| `no-unused-import` on interface re-imports | `IERC7857.sol`, `IERC7857Cloneable.sol` | Some unused imports exist because interfaces re-export types used by consumers; removing them may break downstream imports |

### Recommended Fix Order (by severity)

1. **P0** — Fix `emit Authorization(...)` argument order in `ERC7857AuthorizeUpgradeable.sol:62` (unblocks compilation)
2. **P1** — Fix single quotes on `AxiomMetadataJson.sol:186` (solhint error)
3. **P2** — Convert `require` statements to custom errors in all 3 files (gas optimization)
4. **P3** — Replace global imports with named imports
5. **P4** — Remove unused imports
6. **P5-P6** — Address naming convention issues
7. **Config** — Add `"import-path-check": "off"` to `.solhint.json` to eliminate false positives
8. **Config** — Consider running `forge fmt` to auto-fix formatting (line length, quotes)
