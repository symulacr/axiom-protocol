import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CHAT_TOOL_CLASS_LABELS,
  classOfTool,
  getChatToolSpec,
} from "@axiom/config/chat-tools";
import { COLORS, Textarea } from "../components/ui.js";
import { Button } from "../components/axiom/Controls.js";
import type { Copy } from "../lib/copy.js";

export const insetCardStyle: CSSProperties = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-sm) var(--space-md)",
  marginTop: "var(--space-xs)",
};

export function ToolClassBadge({
  name,
}: {
  name: string;
}): ReactElement | null {
  const cls = classOfTool(name);
  if (!cls) return null;
  return (
    <span
      aria-label={`Tool class: ${CHAT_TOOL_CLASS_LABELS[cls]}`}
      title={getChatToolSpec(name)?.hint}
      style={{
        marginLeft: 6,
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-medium)",
        color: COLORS.textDim,
        textTransform: "lowercase",
        letterSpacing: "0.02em",
      }}
    >
      ({CHAT_TOOL_CLASS_LABELS[cls]})
    </span>
  );
}

export function StatusDot({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: "var(--space-xs)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      <span className="fw-semibold text-xs text-dim uppercase">{children}</span>
    </div>
  );
}

export function ChatBanner({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div className="chat-banner" role="status">
      {children}
    </div>
  );
}

export function AskUserCard({
  content,
  onAnswer,
  copy,
}: {
  content: string;
  onAnswer: (answer: string) => void;
  copy: Copy["chat"];
}): ReactElement | null {
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  let data: {
    ask?: boolean;
    question?: string;
    options?: string[];
    multiSelect?: boolean;
  } | null;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || data.ask !== true) return null;
  const question = data.question ?? copy.questionFallback;
  const options = Array.isArray(data.options) ? data.options : [];
  const multiSelect = data.multiSelect === true;

  const submit = (answer: string): void => {
    setSelected([]);
    setFreeText("");
    onAnswer(answer);
  };

  return (
    <div style={insetCardStyle}>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: "var(--text-sm)",
          color: COLORS.text,
        }}
      >
        {question}
      </p>
      {options.length > 0 ? (
        multiSelect ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "flex-start",
            }}
          >
            {options.map((o, i) => {
              const checked = selected.includes(o);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "var(--text-sm)",
                    color: COLORS.text,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((prev) =>
                        checked ? prev.filter((x) => x !== o) : [...prev, o],
                      )
                    }
                  />
                  {o}
                </label>
              );
            })}
            <Button
              variant="primary"
              disabled={selected.length === 0}
              onClick={() => submit(selected.join(", "))}
            >
              {copy.send}
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {options.map((o, i) => (
              <Button key={i} variant="secondary" onClick={() => submit(o)}>
                {o}
              </Button>
            ))}
          </div>
        )
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <Textarea
            aria-label={copy.answerPlaceholder}
            value={freeText}
            rows={1}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && freeText.trim()) {
                e.preventDefault();
                submit(freeText.trim());
              }
            }}
            placeholder={copy.answerPlaceholder}
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            disabled={!freeText.trim()}
            onClick={() => submit(freeText.trim())}
          >
            {copy.send}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Per-message copy action with the app-wide inline-confirm contract (04
 * ): the label swaps to "✓ Copied" for ~1.2s, matching the ui.tsx
 * CopyButton primitive used inside tool cards. */
export function MsgCopyAction({
  text,
  copy,
}: {
  text: string;
  copy: Copy["chat"];
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="msg-action"
      title={copied ? copy.copiedMessage : copy.copyMessage}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        if (timerRef.current !== undefined) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? `✓ ${copy.copiedMessage}` : copy.copyShort}
    </button>
  );
}

export function MessageEditConfirm({
  onConfirm,
  onCancel,
  copy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  copy: Copy["chat"];
}): ReactElement {
  return (
    <span className="msg-confirm">
      <span className="msg-confirm__text">{copy.editDiscards}</span>
      <button
        type="button"
        className="msg-action msg-action--danger"
        title={copy.discardEditTitle}
        onClick={onConfirm}
      >
        {copy.edit}
      </button>
      <button
        type="button"
        className="msg-action"
        title={copy.keepConversationTitle}
        onClick={onCancel}
      >
        {copy.cancel}
      </button>
    </span>
  );
}
