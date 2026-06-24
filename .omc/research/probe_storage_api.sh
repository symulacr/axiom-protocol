#!/bin/bash
# Parallel probe runner for 0G Storage Indexer API
OUTFILE=/home/eya/og/.omc/research/storage-api-probe.txt

TMPDIR=$(mktemp -d /tmp/probe_results.XXXXXX)
trap "rm -rf $TMPDIR" EXIT

echo "date: $(date)" > "$OUTFILE"

# Launch a JSON-RPC probe in background
probe() {
  local url=$1 method=$2 desc=$3
  local safe=$(echo "${method}_${url}" | md5sum | cut -c1-12)
  (curl -s --connect-timeout 10 -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":[],\"id\":1}" 2>&1) > "$TMPDIR/$safe.txt" &
  echo "$!|$url|$method|$desc|$TMPDIR/$safe.txt" >> "$TMPDIR/jobs"
}

# Launch an HTTP GET in background
http_get() {
  local url=$1 path=$2 desc=$3
  local safe=$(echo "GET${path}_${url}" | md5sum | cut -c1-12)
  (curl -s --connect-timeout 5 "$url$path" 2>&1 | head -40) > "$TMPDIR/$safe.txt" &
  echo "$!|$url|$desc|$TMPDIR/$safe.txt" >> "$TMPDIR/http_jobs"
}

# Launch a raw probe in background
raw_probe() {
  local url=$1 method=$2 params=$3 label=$4
  local safe=$(echo "RAW${method}_${params}_${url}" | md5sum | cut -c1-12)
  local result=$(curl -s --connect-timeout 10 -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}" 2>&1)
  echo "$url | $label: $result" > "$TMPDIR/$safe.txt" &
  echo "$!|$label|$TMPDIR/$safe.txt" >> "$TMPDIR/raw_jobs"
}

> "$TMPDIR/jobs"
> "$TMPDIR/http_jobs"
> "$TMPDIR/raw_jobs"

BASE_T="https://indexer-storage-testnet-turbo.0g.ai"
BASE_M="https://indexer-storage-turbo.0g.ai"

for BASE in "$BASE_T" "$BASE_M"; do
  # Common JSON-RPC
  probe "$BASE" "rpc_modules" "list available modules"
  probe "$BASE" "rpc_methods" "list all methods"
  probe "$BASE" "web3_clientVersion" "client version"
  probe "$BASE" "net_version" "network version"
  
  # Storage-specific guesses
  probe "$BASE" "zg_getUploadPrice" "upload pricing"
  probe "$BASE" "zg_getUploadQueue" "upload queue"
  probe "$BASE" "zg_getDownloadUrl" "get download URL"
  probe "$BASE" "zg_upload" "upload blob"
  probe "$BASE" "zg_download" "download blob"
  probe "$BASE" "zg_getStatus" "storage status"
  probe "$BASE" "zg_getFileInfo" "file info by hash"
  probe "$BASE" "zg_fileInfo" "file info"
  probe "$BASE" "zg_stat" "stat"
  probe "$BASE" "zg_submit" "submit"
  probe "$BASE" "zg_get" "get"
  probe "$BASE" "zg_put" "put"
  probe "$BASE" "zg_store" "store"
  probe "$BASE" "zg_getSegment" "get segment"
  probe "$BASE" "zg_getRoot" "get root hash"
  probe "$BASE" "zg_flow" "flow contract"
  probe "$BASE" "zg_txStatus" "transaction status"
  probe "$BASE" "zg_blobStatus" "blob status"
  probe "$BASE" "zg_merkleProof" "merkle proof"
  probe "$BASE" "zg_getNodes" "get storage nodes"
  probe "$BASE" "zg_nodeInfo" "node info"
  probe "$BASE" "zg_getNode" "get specific node"
  probe "$BASE" "zg_getEpoch" "get epoch info"
  probe "$BASE" "og_totalSupply" "OG total supply"
  probe "$BASE" "og_getBalance" "OG balance"
  probe "$BASE" "kv_get" "KV get"
  probe "$BASE" "kv_put" "KV put"
  probe "$BASE" "kv_delete" "KV delete"
  probe "$BASE" "kv_exists" "KV exists"
  probe "$BASE" "kv_list" "KV list"

  # HTTP GET
  http_get "$BASE" "/" "root"
  http_get "$BASE" "/health" "health endpoint"
  http_get "$BASE" "/api" "api endpoint"
  http_get "$BASE" "/v1" "v1 endpoint"
  http_get "$BASE" "/v2" "v2 endpoint"
  http_get "$BASE" "/status" "status endpoint"
  http_get "$BASE" "/metrics" "metrics endpoint"
  http_get "$BASE" "/swagger" "swagger docs"
  http_get "$BASE" "/docs" "docs"
  http_get "$BASE" "/openapi" "openapi"
  http_get "$BASE" "/.well-known" "well-known"

  # Raw probes
  raw_probe "$BASE" "zg_getStatus" "null" "zg_getStatus params=null"
  raw_probe "$BASE" "zg_getStatus" "{}" "zg_getStatus params={}"
done

echo "Launched all probes. Waiting..."
wait
echo "All done. Collecting..."

# Collect JSON-RPC probes
sort "$TMPDIR/jobs" | while IFS='|' read -r pid url method desc outfile; do
  content=$(cat "$outfile")
  {
    echo "---"
    echo "ENDPOINT: $url"
    echo "METHOD: $method ($desc)"
    echo "$content"
    echo ""
  } >> "$OUTFILE"
done

# Collect HTTP GET probes
sort "$TMPDIR/http_jobs" | while IFS='|' read -r pid url desc outfile; do
  content=$(cat "$outfile")
  {
    echo "---"
    echo "ENDPOINT: $url"
    echo "METHOD: HTTP GET $desc"
    echo "$content"
    echo ""
  } >> "$OUTFILE"
done

# Collect raw probes
echo "=== RAW PROBE ===" >> "$OUTFILE"
sort "$TMPDIR/raw_jobs" | while IFS='|' read -r pid label outfile; do
  content=$(cat "$outfile")
  echo "$content" >> "$OUTFILE"
done

echo "" >> "$OUTFILE"
echo "=== PROBE COMPLETE ===" >> "$OUTFILE"
date >> "$OUTFILE"

echo "Results written to $OUTFILE"
echo "File size: $(wc -c < "$OUTFILE") bytes"
echo "Total JSON-RPC probes: $(wc -l < "$TMPDIR/jobs")"
echo "Total HTTP GET probes: $(wc -l < "$TMPDIR/http_jobs")"
echo "Total raw probes: $(wc -l < "$TMPDIR/raw_jobs")"
