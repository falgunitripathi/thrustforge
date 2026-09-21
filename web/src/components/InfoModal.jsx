import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { renderFormulaText } from "../utils/formulaText.jsx";

/**
 * A centered, closeable overlay explaining one config parameter the way
 * a textbook margin note would — plain-English prose on the same
 * "paper" card FormulaModal uses for equations, just without the
 * equation typesetting, since these hints (typical values, valid
 * ranges, "NOT IN SOURCE" flags) are prose, not math. See
 * FieldInfoLabel.jsx, used by every NumberField/SelectField across
 * every engine's config form.
 */
export default function InfoModal({ label, text, onClose }) {
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

  // Portaled straight to <body>: a field's own ancestors (e.g. the
  // sticky config-form column) create their own stacking context, which
  // traps a plain in-place `position: fixed` overlay behind later
  // siblings like the engine diagram — even though it's still full-
  // viewport-sized. Rendering at the document root sidesteps that
  // entirely, the same fix applied to FormulaModal.
  return createPortal(
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
        <div className="formula-modal-paper info-modal-paper">
          <p className="info-modal-text">{renderFormulaText(text)}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
