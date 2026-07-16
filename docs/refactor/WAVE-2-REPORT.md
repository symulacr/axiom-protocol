# Wave 2 Report — Critical Security

## Fixed
- **C1:** Cleartext DEK rejected unless `AXIOM_ALLOW_CLEARTEXT_DEK=true` (non-prod); prefer `sealedDataEncryptionKey` ECIES to oracle TEE key
- **C2:** FE `useTransfer` always uses `challenge.dataHash` (old) for AccessProof
- **C3:** `oldDataUri` must equal `oldDataHash` (blob root binding)
- **C6:** `requireServerAuth` on vault execute; client keys get `authPrincipal=client`

## Tests
- `packages/config` auth tests; backend `vault-execute-auth.test.ts`; transfer re-key still passes with allow-cleartext test flag
