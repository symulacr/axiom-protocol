import { useState, type ReactNode } from "react";
import { ChevronDown } from "./axiom/icons";

type MobileDisclosureProps = {
  className?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
};

export function MobileDisclosure({
  className = "",
  eyebrow,
  title,
  children,
}: MobileDisclosureProps) {
  const [open, setOpen] = useState(
    () => !window.matchMedia("(max-width: 480px)").matches,
  );

  return (
    <details
      className={`mobile-disclosure ${className}`.trim()}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {eyebrow && <small className="eyebrow">{eyebrow}</small>}
          <strong>{title}</strong>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="mobile-disclosure-content">{children}</div>
    </details>
  );
}
