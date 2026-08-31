#!/usr/bin/env bash
# generate-abis.sh — Auto-generate TypeScript ABI files from forge-compiled contracts
#
# Reads forge inspect --json output and writes human-readable `as const` TS files
# to packages/config/src/abis/{ContractName}.ts, plus raw JSON to packages/config/abi/.
#
# Run after forge build or as part of `pnpm build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
ROOT="$CONTRACTS_DIR/../.."
ABI_TS_DIR="$ROOT/packages/config/src/abis"
ABI_JSON_DIR="$ROOT/packages/config/abi"

mkdir -p "$ABI_JSON_DIR"
cd "$CONTRACTS_DIR"

# ── map contract → TS constant name ──
declare -A CONST_NAMES
CONST_NAMES[AxiomAgentNFT]=AGENT_NFT_ABI
CONST_NAMES[AxiomTeeVerifier]=TEE_VERIFIER_ABI
CONST_NAMES[AxiomStrategyVault]=VAULT_ABI
CONST_NAMES[AxiomPaymentProcessor]=PAYMENT_PROCESSOR_ABI
CONST_NAMES[AxiomMockUSDC]=MOCK_USDC_ABI
CONST_NAMES[AxiomDelegationRegistry]=DELEGATION_REGISTRY_ABI
CONST_NAMES[AxiomStateView]=STATE_VIEW_ABI

CONTRACTS=(AxiomAgentNFT AxiomTeeVerifier AxiomStrategyVault AxiomPaymentProcessor AxiomMockUSDC AxiomDelegationRegistry AxiomStateView)

# Pyhon conversion script — writes TS human-readable format from forge inspect JSON
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

for name in "${CONTRACTS[@]}"; do
  const_name="${CONST_NAMES[$name]}"
  echo "[generate-abis] $name → $const_name"

  # Write raw JSON ABI
  forge inspect "$name" abi --json >"$ABI_JSON_DIR/$name.json"

  # Convert JSON → TypeScript human-readable
  file_name="${name}Nft"
  file_name="${name/MockUSDC/MockUsdc}"
  file_name="${name/AxiomAgentNFT/agentNft}"
  file_name="${name/AxiomTeeVerifier/teeVerifier}"
  file_name="${name/AxiomStrategyVault/vault}"
  file_name="${name/AxiomPaymentProcessor/paymentProcessor}"
  file_name="${name/AxiomMockUSDC/mockUsdc}"
  # Map to the actual file name we want
  case "$name" in
  AxiomAgentNFT) ts_name="agentNft" ;;
  AxiomTeeVerifier) ts_name="teeVerifier" ;;
  AxiomStrategyVault) ts_name="vault" ;;
  AxiomPaymentProcessor) ts_name="paymentProcessor" ;;
  AxiomMockUSDC) ts_name="mockUsdc" ;;
  AxiomDelegationRegistry) ts_name="delegationRegistry" ;;
  AxiomStateView) ts_name="stateView" ;;
  *) ts_name="${name,}" ;;
  esac

  python3 -c "$PY_CONVERTER" "$ABI_JSON_DIR/$name.json" "$ABI_TS_DIR/${ts_name}.ts" "$const_name"

  # Append legacy overrides if a .legacy.ts file exists
  legacy_file="$ABI_TS_DIR/${ts_name}.legacy.ts"
  if [ -f "$legacy_file" ]; then
    cat "$legacy_file" >>"$ABI_TS_DIR/${ts_name}.ts"
    echo "  → appended $legacy_file"
  fi

  echo "  → wrote $ABI_TS_DIR/${ts_name}.ts"
done

echo "[generate-abis] Done — ${#CONTRACTS[@]} ABIs generated."
