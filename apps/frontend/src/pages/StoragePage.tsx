/*
  StoragePage — read-only demo pipeline. There is no backend storage endpoint
  yet (apps/backend has no storage router), so the page documents the stages a
  real upload will expose and every value stays in its honest pending state.
   fixture purge: the phase-advance button and the
  hardcoded "0x3b9…f10" copy-root affordance are gone — a fixture no longer
  owns a primary action, and no fake hash can be copied.
*/
import {
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
import type { ConsoleAction } from "../lib/consoleStore.js";

export function StoragePage({
  state,
  go,
}: {
  state: AppState;
  dispatch: React.Dispatch<ConsoleAction>;
  go: (path: string) => void;
}) {
  const copy = getCopy(state.settings.locale);
  const labels = copy.storage.labels;
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
          </MobileDisclosure>
        </section>
      </div>
    </div>
  );
}
