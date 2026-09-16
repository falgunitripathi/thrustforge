import { useState } from "react";

/**
 * A label that reveals its underlying formula on click/tap instead of only
 * on hover — a `title` attribute never fires on a touchscreen, so this is
 * the actual "click a result to see its formula" interaction. Click again
 * to collapse it. Keeps `title` too, as a bonus for desktop hover.
 */
export default function FormulaLabel({ label, formula, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="formula-label">
      <button
        type="button"
        className={`formula-trigger ${className}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={formula}
      >
        {label}
        <span className="formula-icon" aria-hidden="true">{open ? "▾" : "ƒ"}</span>
      </button>
      {open && <span className="formula-popover" role="note">{formula}</span>}
    </span>
  );
}
