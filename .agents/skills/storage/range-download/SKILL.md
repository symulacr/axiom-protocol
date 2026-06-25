# 0G Storage Range Download

## Metadata

- **Category**: storage
- **SDK**: `@0gfoundation/0g-ts-sdk` ^1.2.8, `fetch` (Node 22 native)
- **Activation Triggers**: "Range header", "byte range", "partial download", "fetchRange",
  "planRanges", "bytes=N-M"

## Purpose

Download a specific byte range of a 0G-stored file via an HTTP `Range: bytes=…` header,
without pulling the whole file. The 0G TS SDK's public surface only exposes
`Indexer#downloadToBlob(root)` (whole file) and `Indexer#downloadSegment(root, startIndex,
endIndex)` (a JSON-RPC segment call). When you need RFC 9110 / HTTP `Range` semantics
(compose with a CDN, hit a storage node's raw `/file` endpoint, or stream-verify a window
of bytes against an expected Merkle root), build the `Range` header explicitly.

This is the right skill for **bounded** reads of large blobs (a 5 GB model, a 200 MB
encrypted key, a 50 MB iNFT payload you only need the first 1 MB of). It is NOT a
replacement for `indexer.download(root, path, true)` when you need the full file
verified end-to-end.

## Prerequisites

- Node.js >= 18 (the helpers use `Uint8Array` and native `fetch`)
- The storage node's `/file?root=…&start=…&end=…` endpoint URL
- The root hash of the file you want a window of (32-byte hex)
- A `fetcher` function for tests (defaults to native `fetch`)

## Quick Workflow

1. Validate `0 <= start <= end` (throw `RangeError` otherwise)
2. If `end === Number.MAX_SAFE_INTEGER`, emit `bytes={start}-` (open-ended)
3. Otherwise emit `bytes={start}-{end}` (both bounds inclusive)
4. GET `<node-url>/file?root=<rootHash>&start=<start>&end=<end>` with that header
5. Validate the response is 206 Partial Content; reject 200 (whole file) and 416
   (Range Not Satisfiable)
6. Return the body as `Uint8Array`

## Core Rules

### ALWAYS

- Treat `start` and `end` as **inclusive** byte offsets (matches what
  `Indexer#downloadSegment(root, startIndex, endIndex)` and the Go node's `/file` endpoint
  accept).
- Use `Number.MAX_SAFE_INTEGER` as the `end` sentinel for "to the end of file". The header
  becomes `bytes={start}-` (open-ended per RFC 9110 / MDN).
- Validate `start >= 0` and `end >= start` BEFORE building the header. A negative `start`
  or an `end < start` is a programmer error; throw `RangeError` synchronously.
- Check the response status is 206 Partial Content. 200 means the server ignored the
  `Range` header (CDN misconfig, custom node); 416 means the range is unsatisfiable.
- Allow a `fetcher` seam for tests so a forged-blob rejection can be exercised against a
  real Galileo response without depending on the network.

### NEVER

- Treat `end` as exclusive (this is HTTP, not Python slicing). Off-by-one here silently
  drops or duplicates a byte.
- Reuse one `Range` header across two different `(start, end)` pairs. Each request gets
  its own header.
- Skip the 206 check. A 200 with a truncated body is the common failure mode of a CDN
  configured to ignore `Range`.
- Issue a `Range` request for a range that starts at byte `0` and ends at
  `Number.MAX_SAFE_INTEGER` — that is "the whole file", and `indexer.download(root, path, true)`
  is the right tool (and you get the Merkle proof for free).

## Code Examples

### Build a `Range` Header

```typescript
/**
 * Build a `Range` header value for a half-open byte interval `[start, end]`.
 *
 * Both bounds are inclusive. Pass `Number.MAX_SAFE_INTEGER` for `end` to mean
 * "to the end of file"; the header becomes `bytes={start}-`.
 */
export function buildRangeHeader(start: number, end: number): string {
  if (start < 0) throw new RangeError(`start must be >= 0, got ${start}`);
  if (end < start) throw new RangeError(`end (${end}) < start (${start})`);
  if (end === Number.MAX_SAFE_INTEGER) return `bytes=${start}-`;
  return `bytes=${start}-${end}`;
}
```

### Plan a Tiled Range Sweep

```typescript
/**
 * Compute half-open byte intervals that tile `[0, totalSize)`.
 *
 * Use this to drive a parallel `fetchRange` fan-out (e.g. to verify a 5 GB
 * model's Merkle root by re-deriving it on a 50 MB chunk at a time).
 */
export function planRanges(totalSize: number, rangeSize: number): Array<{ start: number; end: number }> {
  if (totalSize < 0) throw new RangeError(`totalSize must be >= 0`);
  if (rangeSize <= 0) throw new RangeError(`rangeSize must be > 0`);
  const out: Array<{ start: number; end: number }> = [];
  for (let s = 0; s < totalSize; s += rangeSize) {
    out.push({ start: s, end: Math.min(s + rangeSize, totalSize) - 1 });
  }
  return out;
}
```

### Fetch One Range

```typescript
import { buildRangeHeader } from "./range";

export async function fetchRange(
  rootHash: `0x${string}`,
  start: number,
  end: number,
  nodeUrl: string = process.env.STORAGE_NODE_URL!,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const range = buildRangeHeader(start, end);
  const url = `${nodeUrl}/file?root=${rootHash}&start=${start}&end=${end}`;
  const res = await fetcher(url, { headers: { Range: range } });
  if (res.status !== 206) {
    throw new Error(`Expected 206 Partial Content, got ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
```

## Anti-Patterns

```typescript
// BAD: treating `end` as exclusive
const range = `bytes=${start}-${end + 1}`; // off-by-one

// BAD: emitting a range that covers the whole file
const range = `bytes=0-`; // use indexer.download(root, path, true) instead — you get
                            // the Merkle proof for free

// BAD: ignoring the 206 status
const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
const bytes = new Uint8Array(await res.arrayBuffer()); // could be 200 with the whole file
                                                       // if the CDN ignored Range

// BAD: building a Range header for a negative start
const range = `bytes=${-1}-1023`; // some nodes parse this as "from -1 to 1023"
                                  // and return a confusing 416 — validate first
```

## Common Errors & Fixes

| Error                          | Cause                                | Fix                                                       |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------- |
| 200 OK instead of 206          | CDN/storage node ignored `Range`    | Verify the node URL exposes raw `/file` with `Range` support |
| 416 Range Not Satisfiable      | `end >= totalSize`                   | Cap `end` at `totalSize - 1`                              |
| `RangeError: end < start`      | Caller bug                           | Validate inputs before calling `buildRangeHeader`        |
| Whole file returned in 1 req   | Issued `bytes=0-` for a known-size file | For "to the end" only when you genuinely don't know `totalSize` |
| Bytes differ from Merkle root  | Truncated/expanded response          | Always re-derive the root from the bytes you received     |

## Related Skills

- [Upload File](../upload-file/SKILL.md) — for whole-file uploads
- [Download File](../download-file/SKILL.md) — for whole-file verified downloads
- [Merkle Verification](../merkle-verification/SKILL.md) — for re-deriving the root from
  the bytes you get back

## References

- [MDN: HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [MDN: Range Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range)
- [RFC 9110: HTTP Semantics (Range)](https://www.rfc-editor.org/rfc/rfc9110#name-range)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [0G Storage merkle proofs (file/segment/chunk layering)](https://docs.0g.ai/developer-hub/building-on-0g/storage/merkle-proofs)
