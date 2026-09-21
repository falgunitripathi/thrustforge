import { useEffect, useId, useRef } from "react";
import { splitFormula, renderFormulaText } from "../utils/formulaText.jsx";

/**
 * A centered, closeable overlay showing one formula the way it reads on
 * a printed page — large serif type on a plain light card (even in dark
 * theme, since that's the "paper" convention this is going for), real
 * subscripts/superscripts and Greek letters instead of code-style
 * identifiers, with the plain-English explanation underneath in
 * ordinary small type. Used everywhere a result, parameter, or table
 * column has a formula behind it — see FormulaLabel.jsx and
 * StationTable.jsx.
 */
export default function FormulaModal({ label, formula, onClose }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const { equation, citation, explanation } = splitFormula(formula);

  return (
    <div
      className="formula-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="formula-modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button
          type="button"
          ref={closeButtonRef}
          className="formula-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <p className="formula-modal-label" id={titleId}>{label}</p>
        <div className="formula-modal-paper">
          <p className="formula-modal-formula">{renderFormulaText(equation)}</p>
        </div>
        {citation && <span className="formula-modal-citation">{citation}</span>}
        {explanation && <p className="formula-modal-explanation">{explanation}</p>}
      </div>
    </div>
  );
}
