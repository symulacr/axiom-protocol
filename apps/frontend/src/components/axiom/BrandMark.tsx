/** Copper Command Deck: one text-free split-chevron and copper nucleus on every route. */
export function AxiomBrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`axiom-brand-mark ${className}`.trim()} aria-hidden="true">
      <i />
      <b />
      <em />
    </span>
  );
}
