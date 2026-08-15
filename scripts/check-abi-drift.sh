#!/usr/bin/env bash
# check-abi-drift.sh — Detect divergence between committed ABI files and contract source.
#
# Regenerates ABI TS files from the compiled contracts (using the same converter
# as apps/contracts/scripts/generate-abis.sh) into a temp directory, then diffs
# the generated `… as const;` block against the first block in each committed
# file in packages/config/src/abis/. A trailing hand-maintained legacy block
# (e.g. VAULT_ABI_LEGACY in vault.ts) is intentionally ignored — only the
# forge-exported constant is checked.
#
# Exit codes:
#   0  no drift (or forge unavailable — does not fail CI)
#   1  drift detected
#
# Run in CI to catch ABI drift before merge.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
ABI_DIR="$ROOT/packages/config/src/abis"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

CONTRACTS_DIR="$ROOT/apps/contracts"
GEN_SCRIPT="$CONTRACTS_DIR/scripts/generate-abis.sh"

# ── contract → TS file name ── (must match generate-abis.sh case statement)
declare -A TS_NAME
TS_NAME[AxiomAgentNFT]=agentNft
TS_NAME[AxiomTeeVerifier]=teeVerifier
TS_NAME[AxiomStrategyVault]=vault
TS_NAME[AxiomPaymentProcessor]=paymentProcessor
TS_NAME[AxiomMockUSDC]=mockUsdc

CONTRACTS=(AxiomAgentNFT AxiomTeeVerifier AxiomStrategyVault AxiomPaymentProcessor AxiomMockUSDC)

# ── require forge ──
if ! command -v forge >/dev/null 2>&1; then
  echo "⚠ forge not found on PATH — skipping ABI drift check"
  exit 0
fi

if ! (cd "$CONTRACTS_DIR" && forge build >/dev/null 2>&1); then
  echo "⚠ forge build failed — are the contracts compiled?"
  exit 0 # Don't fail CI on a build failure here
fi

# ── the same JSON→human-readable converter as generate-abis.sh ──
PY_CONVERTER=$(
  cat <<'PYEOF'
import json, sys

def fmt_type(param):
    t = param['type']
    if t.startswith('tuple'):
        comps = param.get('components', [])
        inner = ', '.join(
            fmt_type(c) + (f' {c.get("name","")}' if c.get('name') else '')
            for c in comps
        )
        inner = f'({inner})'
        if t.endswith('[]'):
            inner += '[]'
        return inner
    return t

def fmt_params(params, for_event=False):
    parts = []
    for p in params:
        t = fmt_type(p)
        name = p.get('name', '')
        if for_event and p.get('indexed'):
            t += ' indexed' + (f' {name}' if name else '')
        elif name:
            t += f' {name}'
        parts.append(t)
    return ', '.join(parts)

def run(in_path, out_path, const_name):
    with open(in_path) as f:
        abi = json.load(f)

    lines = []
    for entry in abi:
        typ = entry['type']
        if typ in ('constructor', 'fallback', 'receive'):
            continue

        if typ == 'function':
            inputs = fmt_params(entry.get('inputs', []))
            outputs = fmt_params(entry.get('outputs', []))
            mut = ''
            sm = entry.get('stateMutability', 'nonpayable')
            if sm == 'view':      mut += ' view'
            elif sm == 'pure':    mut += ' pure'
            elif sm == 'payable': mut += ' payable'

            sig = f"function {entry['name']}({inputs}){mut}"
            if outputs:
                sig += f' returns ({outputs})'
            lines.append(sig)

        elif typ == 'event':
            inputs = fmt_params(entry.get('inputs', []), for_event=True)
            lines.append(f"event {entry['name']}({inputs})")

        elif typ == 'error':
            inputs = fmt_params(entry.get('inputs', []))
            lines.append(f"error {entry['name']}({inputs})")

    with open(out_path, 'w') as f:
        f.write(f'export const {const_name} = [\n')
        for i, line in enumerate(lines):
            comma = ',' if i < len(lines) - 1 else ''
            escaped = line.replace('\\', '\\\\').replace('"', '\\"')
            f.write(f'  "{escaped}"{comma}\n')
        f.write('] as const;\n')

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3])
PYEOF
)

# ── const name per contract (matches generate-abis.sh) ──
declare -A CONST_NAME
CONST_NAME[AxiomAgentNFT]=AGENT_NFT_ABI
CONST_NAME[AxiomTeeVerifier]=TEE_VERIFIER_ABI
CONST_NAME[AxiomStrategyVault]=VAULT_ABI
CONST_NAME[AxiomPaymentProcessor]=PAYMENT_PROCESSOR_ABI
CONST_NAME[AxiomMockUSDC]=MOCK_USDC_ABI

drift_found=0
checked=0

for name in "${CONTRACTS[@]}"; do
  ts_name="${TS_NAME[$name]}"
  const_name="${CONST_NAME[$name]}"
  committed_ts="$ABI_DIR/${ts_name}.ts"

  if [ ! -f "$committed_ts" ]; then
    echo "⚠ Missing committed ABI file: $committed_ts"
    drift_found=1
    continue
  fi

  # Generate fresh ABI JSON from the contract
  if ! (cd "$CONTRACTS_DIR" && forge inspect "$name" abi --json >"$TEMP_DIR/$name.json" 2>/dev/null); then
    echo "⚠ Could not inspect $name — is the contract compiled?"
    exit 0 # Don't fail CI if forge can't inspect
  fi

  # Convert fresh JSON → human-readable TS (same format as generate-abis.sh)
  fresh_ts="$TEMP_DIR/${ts_name}.ts"
  if ! python3 -c "$PY_CONVERTER" "$TEMP_DIR/$name.json" "$fresh_ts" "$const_name" 2>/dev/null; then
    echo "⚠ Failed to convert $name ABI — is python3 available?"
    exit 0
  fi

  # Extract only the first `] as const;` block from the committed file — this is
  # the forge-exported constant. Any trailing hand-maintained block (e.g.
  # VAULT_ABI_LEGACY) is ignored so it never counts as drift.
  committed_block="$TEMP_DIR/committed_${ts_name}.block"
  awk '
    /^export const/ { printing=1 }
    printing { print }
    printing && /] as const;/ { printing=0; found=1; exit }
    END { exit !found }
  ' "$committed_ts" >"$committed_block" 2>/dev/null || {
    echo "⚠ Could not extract exported ABI block from $committed_ts"
    drift_found=1
    continue
  }

  if ! diff -q "$committed_block" "$fresh_ts" >/dev/null 2>&1; then
    echo "❌ ABI drift detected: $name"
    echo "   Committed: $committed_ts"
    echo "   Contract:  $name ($TEMP_DIR/$name.json)"
    diff -u "$committed_block" "$fresh_ts" | sed 's/^/     /'
    echo "   Run 'bash apps/contracts/scripts/generate-abis.sh' to update"
    drift_found=1
  else
    echo "✓ $name — ABI matches contract source"
  fi
  checked=$((checked + 1))
done

if [ $drift_found -eq 0 ] && [ $checked -gt 0 ]; then
  echo "✓ All ABIs match contract source — no drift detected"
fi

exit $drift_found
