import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Click-to-open wrapper for heavier analysis sections (Station analysis,
 * Compressor & turbine stages, Cycle diagrams, Parameter sweep, and the
 * rest) — clicking the title opens its content in a centered, closeable
 * overlay (the same modal convention as the engine diagram's own
 * "Expand" view and every formula card — see FormulaModal.jsx), rather
 * than expanding in place. Used identically across every engine's
 * ResultsPanel.
 */
export default function ExpandableSection({ title, summary, children }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const previouslyFocused = useRef(null);

  function openModal() {
    previouslyFocused.current = document.activeElement;
    setOpen(true);
  }
  function closeModal() {
    setOpen(false);
    (previouslyFocused.current || triggerRef.current)?.focus?.();
  }

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <section className="results-section">
      <button
        type="button"
        ref={triggerRef}
        className="results-section-header"
        aria-haspopup="dialog"
        onClick={openModal}
      >
        <span className="results-section-chevron" aria-hidden="true">▸</span>
        <span className="results-section-title">{title}</span>
      </button>

      {open && createPortal(
        // Portaled to <body> — a sticky/otherwise stacking-context
        // ancestor (e.g. the config sidebar) would otherwise trap this
        // "full-viewport" overlay behind a later sibling. See
        // InfoModal.jsx for the concrete bug this avoids.
        <div
          className="ed-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="ed-modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button
              type="button"
              ref={closeButtonRef}
              className="ed-modal-close"
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="results-section-modal-title" id={titleId}>{title}</h2>
            {summary && <p className="section-note expandable-section-summary">{summary}</p>}
            {children}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
