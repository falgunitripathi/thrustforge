import { useState } from "react";
import FormulaModal from "./FormulaModal.jsx";

/**
 * A label that opens its underlying formula in a centered, closeable
 * modal on click/tap — a `title` attribute never fires on a
 * touchscreen, so this is the actual "click a result to see its
 * formula" interaction, and a modal (not an inline dropdown) gives the
 * formula room to be typeset clearly instead of cramped into the
 * card/table it was clicked from. Keeps `title` too, as a bonus for
 * desktop hover.
 */
export default function FormulaLabel({ label, formula, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="formula-label">
      <button
        type="button"
        className={`formula-trigger ${className}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title={formula}
      >
        {label}
        <span className="formula-icon" aria-hidden="true">ƒ</span>
      </button>
      {open && <FormulaModal label={label} formula={formula} onClose={() => setOpen(false)} />}
    </span>
  );
}
