import { useState } from "react";
import InfoModal from "./InfoModal.jsx";

/**
 * A field label that opens its explanatory hint (typical values, valid
 * range, source citation or "NOT IN SOURCE" flag) in a centered modal on
 * click, instead of showing it as permanently-visible small text under
 * the input — mirrors FormulaLabel's click-to-reveal convention so every
 * config parameter across every engine's Advanced panel reads the same
 * way. Falls back to a plain (non-clickable) label when there's no hint
 * to show.
 */
export default function FieldInfoLabel({ label, hint }) {
  const [open, setOpen] = useState(false);
  if (!hint) return <span className="field-label">{label}</span>;
  return (
    <span className="formula-label">
      <button
        type="button"
        className="formula-trigger field-label"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title={hint}
      >
        {label}
        <span className="formula-icon" aria-hidden="true">ⓘ</span>
      </button>
      {open && <InfoModal label={label} text={hint} onClose={() => setOpen(false)} />}
    </span>
  );
}
