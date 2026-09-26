import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHALLENGES } from "../utils/challenges.js";
import { ENGINE_INFO } from "../utils/engineInfo.js";

/** The list of "try this" challenges, in the site's standard modal. */
export function ChallengesDialog({ completed, activeId, onStart, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="ed-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ed-modal-content challenges-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" ref={closeRef} className="ed-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="results-section-modal-title" id={titleId}>Try this: challenges</h2>
        <p className="section-note expandable-section-summary">
          Each challenge sets up an engine and a goal. Change the inputs on the left until the goal turns green
          — the check runs live as you type. {completed.length} of {CHALLENGES.length} done.
        </p>
        <ol className="challenge-list">
          {CHALLENGES.map((ch) => {
            const done = completed.includes(ch.id);
            const info = ENGINE_INFO[ch.layout && ch.layout !== "unmixed" ? `turbofan_${ch.layout}` : ch.engine];
            return (
              <li key={ch.id} className={`challenge-item${done ? " challenge-done" : ""}`}>
                <div className="challenge-item-text">
                  <strong>
                    <span aria-hidden="true">{done ? "✓ " : ""}</span>
                    {ch.title}
                    {done && <span className="sr-only"> (done)</span>}
                  </strong>
                  <span className="challenge-engine">{info?.icon} {info?.name}</span>
                  <p>{ch.goal}</p>
                </div>
                <button type="button" className="reset-button" onClick={() => onStart(ch)}>
                  {activeId === ch.id ? "Restart" : done ? "Try again" : "Start"}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The active challenge, pinned above the results: its goal, a live
 * progress line and a tick when it's met. `solve` is the open engine's
 * solver, for goals that compare against a variant of the design.
 */
export function ChallengeBanner({ challenge, result, config, solve, done, onComplete, onStop, onOpenList }) {
  const [showHint, setShowHint] = useState(false);
  let met = false;
  let readout = null;
  if (result) {
    try {
      met = !!challenge.check(result, config, solve);
      readout = challenge.readout(result, config, solve);
    } catch {
      met = false;
    }
  }
  useEffect(() => {
    if (met && !done) onComplete(challenge.id);
  }, [met, done, challenge.id, onComplete]);

  return (
    <div className={`challenge-banner${met ? " challenge-banner-met" : ""}`} role="status" aria-live="polite">
      <div className="challenge-banner-main">
        <span className="challenge-banner-kicker">{met ? "✓ Challenge complete" : "🎯 Challenge"}</span>
        <strong>{challenge.title}</strong>
        <p>{challenge.goal}</p>
        <p className="challenge-readout">
          {readout ?? "No valid engine at these settings yet — see the message below."}
        </p>
        {showHint && <p className="challenge-hint">{challenge.hint}</p>}
      </div>
      <div className="challenge-banner-actions">
        {!met && (
          <button type="button" className="reset-button" onClick={() => setShowHint((h) => !h)} aria-expanded={showHint}>
            {showHint ? "Hide hint" : "Hint"}
          </button>
        )}
        <button type="button" className="reset-button" onClick={onOpenList}>
          {met ? "Next challenge" : "All challenges"}
        </button>
        <button type="button" className="reset-button" onClick={onStop}>Stop</button>
      </div>
    </div>
  );
}
