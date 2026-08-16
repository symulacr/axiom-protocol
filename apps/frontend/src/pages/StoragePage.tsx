/*
  StoragePage (ported from the v2 mockup). The 0G storage phase ladder is a
  labeled fixture — there is no backend storage endpoint yet (see PLAN.md
  mapping: "StoragePage /storage — 0G storage phase ladder is fixture-only
  today; hook point for future storage.upload/root-hash display").
*/
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  UploadCloud,
  Zap,
} from "../components/axiom/icons.js";
import { Button, Status } from "../components/axiom/Controls.js";
import { MobileDisclosure } from "../components/MobileDisclosure.js";
import { getCopy } from "../lib/copy.js";
import type { AppState, StoragePhase } from "../lib/models.js";
import type { PrototypeAction } from "../lib/prototypeStore.js";

export function StoragePage({
  state,
  dispatch,
  go,
}: {
  state: AppState;
  dispatch: React.Dispatch<PrototypeAction>;
  go: (path: string) => void;
}) {
  const copy = getCopy(state.settings.locale);
  const order: StoragePhase[] = [
    "ready",
    "encrypted",
    "root-hashed",
    "published",
    "verified",
    "available",
  ];
  const current = Math.max(0, order.indexOf(state.storage));
  const complete = state.storage === "available";
  const labels = copy.storage.labels;
  const rootHash = current >= 2 ? "0x3b9…f10" : copy.storage.pending;
  const copyRoot = () => {
    if (current >= 2) navigator.clipboard?.writeText("0x3b9…f10");
    dispatch({
      type: "notice",
      notice:
        current >= 2
          ? "Storage root copied locally."
          : "The storage root is not available yet.",
    });
  };
  const advance = () => {
    const next = order[Math.min(current + 1, order.length - 1)] ?? "available";
    dispatch({ type: "storage", storage: next });
    if (next === "available")
      dispatch({
        type: "notice",
        notice: `0G Storage fixture ${copy.storage.available}: ${copy.storage.rootHash}, ${copy.storage.storageTx} and ${copy.storage.integrityProof}.`,
      });
  };
  return (
    <div className="ops-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{copy.storage.eyebrow}</span>
          <h1>{copy.storage.title}</h1>
          <p>{copy.storage.description}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => go("/chat")}
          icon={<MessageSquare size={15} />}
        >
          {copy.storage.openChat}
        </Button>
      </div>
      <div className="storage-grid">
        <section
          className={`panel storage-stage ${complete ? "storage-stage-complete" : ""}`}
        >
          <div className="panel-head">
            <div>
              <span className="eyebrow">{copy.storage.adapter}</span>
              <h2>{copy.storage.payload}</h2>
            </div>
            <Status
              label={complete ? copy.storage.available : copy.storage.fixture}
              tone={complete ? "success" : "warning"}
            />
          </div>
          <MobileDisclosure
            className="storage-stage-details"
            title={complete ? copy.storage.proofComplete : copy.storage.payload}
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
                <div
                  className={
                    index <= current ? "storage-step done" : "storage-step"
                  }
                  key={label}
                >
                  <span>
                    {index < current ? (
                      <Check size={13} />
                    ) : index === current ? (
                      <Zap size={13} />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  <strong>{label}</strong>
                  {index < labels.length - 1 && <i />}
                </div>
              ))}
            </div>
          </MobileDisclosure>
          {!complete ? (
            <Button onClick={advance} icon={<UploadCloud size={15} />}>
              {state.storage === "ready"
                ? copy.storage.encryptPayload
                : copy.storage.continueStep}
            </Button>
          ) : (
            <div className="storage-complete-note">
              <CircleCheck size={16} />
              <span>
                {copy.storage.proofComplete}. Global action closed; detailed
                evidence remains below.
              </span>
            </div>
          )}
          <div className="storage-note">
            <ShieldCheck size={14} />
            <span>{copy.storage.note}</span>
          </div>
        </section>
        <section className="panel provenance-panel">
          <MobileDisclosure
            className="storage-proof-disclosure"
            eyebrow={copy.storage.provenanceRecord}
            title={copy.storage.whatCanProve}
          >
            <dl className="provenance-list">
              <div>
                <dt>{copy.storage.rootHash}</dt>
                <dd className="mono">
                  {rootHash}{" "}
                  <button
                    className="inline-copy"
                    onClick={copyRoot}
                    aria-label="Copy storage root"
                  >
                    <Copy size={12} />
                  </button>
                </dd>
              </div>
              <div>
                <dt>{copy.storage.storageTx}</dt>
                <dd className="mono">
                  {current >= 3 ? "0x72a…c81" : copy.storage.pending}{" "}
                  <ExternalLink size={12} />
                </dd>
              </div>
              <div>
                <dt>{copy.storage.integrityProof}</dt>
                <dd>
                  <Status
                    label={
                      current >= 4
                        ? (labels[4] ?? copy.storage.pending)
                        : copy.storage.pending
                    }
                    tone={current >= 4 ? "success" : "warning"}
                  />
                </dd>
              </div>
              <div>
                <dt>{copy.storage.encryption}</dt>
                <dd>
                  <LockKeyhole size={13} /> AES-GCM
                </dd>
              </div>
              <div>
                <dt>{copy.storage.indexerAge}</dt>
                <dd className="mono">
                  {current >= 5 ? "18 sec" : copy.storage.notIndexed}
                </dd>
              </div>
              <div>
                <dt>{copy.storage.download}</dt>
                <dd>
                  {current >= 5 ? (
                    <Status label={copy.storage.available} tone="success" />
                  ) : (
                    <Status label={copy.storage.notReady} tone="muted" />
                  )}
                </dd>
              </div>
            </dl>
            <div className="provenance-source">
              <span className="eyebrow">{copy.storage.source}</span>
              <strong>{copy.storage.sourceName}</strong>
              <span>{copy.storage.sourceDescription}</span>
            </div>
          </MobileDisclosure>
        </section>
      </div>
    </div>
  );
}
