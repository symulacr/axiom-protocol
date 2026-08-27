/*
  StoragePage — read-only demo pipeline. There is no backend storage endpoint
  yet (apps/backend has no storage router), so the page documents the stages a
  real upload will expose and every value stays in its honest pending state.

  L2-B4: one operable element — the "Verify on 0G" block builds a real 0G
  storage-indexer URL from a user-entered root hash. The page itself still
  performs no upload and shows no fabricated hashes.
*/
import { useState } from "react";
import {
  ArrowRight,
  FileCheck2,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
} from "../components/axiom/icons.js";
import {
  Button,
  Fact,
  PageHead,
  PanelHead,
  Status,
} from "../components/axiom/Controls.js";
import { MobileDisclosure } from "../components/MobileDisclosure.js";
import { getCopy } from "../lib/copy.js";
import type { AppState } from "../lib/models.js";
import { resolveStorageRpc } from "@axiom/config/networks";
import { APP_CHAIN_ID } from "../config/wagmi.js";
import { routePath } from "../lib/routeRegistry.js";

/** 0x + 64 hex digits — the shape of a 0G storage publication root. */
const ROOT_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/** The indexer's file-info endpoint answers GET with the file's own record
 *  (HTTP 200 JSON even for unknown roots — no blind 404 link). */
function indexerFileInfoUrl(rootHash: string): string {
  return `${resolveStorageRpc(APP_CHAIN_ID)}/file/info/?rootHash=${rootHash}`;
}

export function StoragePage({
  state,
  go,
}: {
  state: AppState;
  go: (path: string) => void;
}) {
  const copy = getCopy(state.settings.locale);
  const labels = copy.storage.labels;
  const [rootHash, setRootHash] = useState("");
  const valid = ROOT_HASH_RE.test(rootHash.trim());
  return (
    <div className="ops-page">
      <PageHead title={copy.storage.title} lede={copy.storage.description}>
        <Button
          variant="secondary"
          onClick={() => go("/chat")}
          icon={<MessageSquare size={15} />}
        >
          {copy.storage.openChat}
        </Button>
      </PageHead>
      <div className="storage-grid">
        <section className="panel storage-stage">
          <PanelHead title={copy.storage.payload} />
          <MobileDisclosure
            className="storage-stage-details"
            title={copy.storage.fileSteps}
          >
            <div className="storage-file">
              <div className="file-icon">
                <FileCheck2 size={22} />
              </div>
              <div>
                <strong>axiom-prime.metadata.json</strong>
                <span>{copy.storage.fileMeta}</span>
              </div>
              <span className="mono">JSON</span>
            </div>
            <div className="storage-steps">
              {labels.map((label, index) => (
                <div className="storage-step" key={label}>
                  <span>{`0${index + 1}`}</span>
                  <strong>{label}</strong>
                  {index < labels.length - 1 && <i />}
                </div>
              ))}
            </div>
          </MobileDisclosure>
          <div className="storage-note">
            <ShieldCheck size={14} />
            <span>{copy.storage.note}</span>
          </div>
          {/* L2-B4: the single operable element on this otherwise read-only
              page — verification happens on 0G infrastructure, never faked here. */}
          <div className="provenance-source">
            <strong>{copy.storage.verifyTitle}</strong>
            <span>{copy.storage.verifyHint}</span>
            <label className="field">
              <span className="field-label">{copy.storage.verifyLabel}</span>
              <span className="field-control">
                <input
                  className="axiom-field mono"
                  value={rootHash}
                  onChange={(event) => setRootHash(event.target.value)}
                  placeholder={copy.storage.verifyPlaceholder}
                  spellCheck={false}
                  maxLength={66}
                  aria-label={copy.storage.verifyLabel}
                />
              </span>
            </label>
            {rootHash.trim() !== "" && !valid && (
              <div className="review-error" role="alert">
                {copy.storage.verifyError}
              </div>
            )}
            <div className="not-integrated-actions">
              {valid ? (
                <a
                  className="button button-primary"
                  href={indexerFileInfoUrl(rootHash.trim())}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={copy.storage.verifyA11y}
                >
                  <ArrowRight size={14} />
                  {copy.storage.verifyAction}
                </a>
              ) : (
                <span className="button button-primary" aria-disabled="true">
                  <ArrowRight size={14} />
                  {copy.storage.verifyAction}
                </span>
              )}
            </div>
            <span>
              {copy.storage.verifyExplorerHint}{" "}
              <a
                href="https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk"
                target="_blank"
                rel="noreferrer noopener"
              >
                {copy.storage.verifyDocsLabel}
              </a>
            </span>
          </div>
        </section>
        <section className="panel provenance-panel">
          <MobileDisclosure
            className="storage-proof-disclosure"
            title={copy.storage.whatCanProve}
          >
            <dl className="provenance-list">
              <Fact label={copy.storage.rootHash} mono>
                {copy.storage.pending}
              </Fact>
              <Fact label={copy.storage.storageTx} mono>
                {copy.storage.pending}
              </Fact>
              <Fact label={copy.storage.integrityProof}>
                <Status label={copy.storage.pending} tone="warning" />
              </Fact>
              <Fact label={copy.storage.encryption}>
                <LockKeyhole size={13} /> AES-GCM
              </Fact>
              <Fact label={copy.storage.indexerAge} mono>
                {copy.storage.notIndexed}
              </Fact>
              <Fact label={copy.storage.download}>
                <Status label={copy.storage.notReady} tone="muted" />
              </Fact>
            </dl>
            <div className="provenance-source">
              <strong>{copy.storage.sourceName}</strong>
              <span>{copy.storage.sourceDescription}</span>
            </div>
            {/* L2-B4 forward exit: proofs are created by operations — /mint
                is the closest real surface that publishes agent metadata. */}
            <div className="provenance-source">
              <strong>{copy.storage.forwardTitle}</strong>
              <div className="not-integrated-actions">
                <Button
                  onClick={() => go(routePath("mint"))}
                  icon={<FileCheck2 size={15} />}
                >
                  {copy.storage.forwardCta}
                </Button>
              </div>
            </div>
          </MobileDisclosure>
        </section>
      </div>
    </div>
  );
}
