# Oracle API Reference (in-process)

The oracle is **not a standalone service**. It is a module inside the backend
(`apps/backend/src/oracle/`) whose routes are mounted on the backend's own HTTP app under
the `/oracle` prefix — the same origin and port as the rest of the API (default `:3000`).
The prefix preserves the frontend same-origin proxy contract (`VITE_ORACLE_URL ?? "/oracle"`;
Vercel rewrites `/oracle/*` to the backend).

Auth: `x-api-key` header (optional, inherited from `AXIOM_API_KEY`).

Ownership signing (`signOwnership`) and the full re-key (`transferValidity`) are **in-process
function calls** made by backend routes (e.g. `POST /v1/agents/:id/transfer`) — they are not
separate HTTP endpoints.

---

## HTTP endpoints

### GET /oracle/health

Oracle health check. Response:

```json
{
  "ok": true,
  "signer": "0x...",
  "uncompressedPubkey": "0x...",
  "version": "0.1.0"
}
```

### POST /oracle/v1/agents/mint

Register a data hash as seen by the oracle.

| Field      | Type         | Required   | Description                    |
| ---------- | ------------ | ---------- | ------------------------------ |
| `dataHash` | `0x{64 hex}` | yes        | 32-byte data storage root hash |

Response:

```json
{
  "ok": true,
  "dataHash": "0x...",
  "seen": true
}
```

The oracle must see a data hash via this endpoint (or via a transfer, which auto-registers)
before ownership will be signed for it. Errors: `400` (invalid dataHash format).

---

## In-process operations

### signOwnership(input)

Signs an EIP-712 ownership proof for a data hash the oracle has already seen.

| Field          | Type         | Required   | Description                                        |                    |                                            |
| -------------- | ------------ | ---------- | -------------------------------------------------- | ------------------ | ------------------------------------------ |
| `dataHash`     | `0x{64 hex}` | yes        | Data hash (must be previously registered via mint) |                    |                                            |
| `targetPubkey` | `0x{* hex}`  | yes        | Receiver's uncompressed public key                 |                    |                                            |
| `sealedKey`    | `0x{* hex}`  | yes        | ECIES-sealed AES encryption key                    |                    |                                            |
| `nonce`        | string \     | number     | yes                                                | Access proof nonce |                                            |
| `to`           | `0x{40 hex}` | yes        | Receiver's Ethereum address                        |                    |                                            |
| `nft`          | `0x{40 hex}` | yes        | NFT contract address                               |                    |                                            |
| `validUntil`   | bigint \     | string \   | number                                             | no                 | Unix expiry timestamp (default: now + 24h) |

Returns:

```json
{
  "signature": "0x...",
  "signer": "0x...",
  "validUntil": "1700000000"
}
```

Throws `OracleRequestError` on unknown dataHash (register via mint first), invalid address,
or invalid `validUntil`.

### transferValidity(input)

Full re-key used by the transfer flow: decrypt old data, re-encrypt with a new key, upload
to 0G Storage, seal the new key for the receiver, and sign an ownership proof — one call.

| Field                  | Type            | Required   | Description                                                  |                                                          |
| ---------------------- | --------------- | ---------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `oldDataHash`          | `0x{64 hex}`    | yes        | Hash of existing ciphertext                                  |                                                          |
| `oldDataUri`           | `0x{* hex}`     | yes        | 0G Storage blob ID of existing ciphertext                    |                                                          |
| `targetPubkey64`       | `0x{128 hex}`   | yes        | Receiver's 64-byte uncompressed public key (X\               | Y, 128 hex chars)                                        |
| `accessProofNonce`     | string \        | number     | yes                                                          | Nonce for access proof                                   |
| `ownershipProofNonce`  | string \        | number     | no                                                           | Nonce for ownership proof (defaults to accessProofNonce) |
| `oldDataEncryptionKey` | string (base64) | yes        | 32-byte AES key that decrypts old ciphertext, base64-encoded |                                                          |
| `to`                   | `0x{40 hex}`    | no         | Receiver address                                             |                                                          |
| `nft`                  | `0x{40 hex}`    | no         | NFT contract address                                         |                                                          |

Returns:

```json
{
  "newDataUri": "0x...",
  "newDataHash": "0x...",
  "sealedKey": "0x...",
  "ownershipSignature": "0x...",
  "accessProofNonce": 0,
  "ownershipProofNonce": 0,
  "validUntil": "1700000000"
}
```

Throws `OracleRequestError` on validation failures or a failed transfer/upload.
