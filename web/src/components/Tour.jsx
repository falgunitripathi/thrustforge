import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Each step points at one part of the page. Steps whose target isn't on
// screen (e.g. the sidebar is hidden) are skipped.
const STEPS = [
  {
    target: ".engine-type-tabs",
    title: "1. Pick an engine",
    text: "Eight engine families, from the propeller-driving turboprop to the hypersonic scramjet. Turbojets and turbofans have variants underneath the tabs.",
  },
  {
    target: ".config-form",
    title: "2. Change anything",
    text: "Every input lives here. Change a number and the whole engine cycle re-solves instantly. Tap ⓘ next to a field to see the formula behind it.",
  },
  {
    target: ".preset-picker",
    title: "3. Optional: start from a real engine",
    text: "You're building your own engine, but if you'd like a starting point, open this to load Concorde's Olympus 593, the SR-71's J58 or an airliner's CFM56 — and see how close the model gets to the real figures.",
  },
  {
    target: ".results-panel section",
    title: "4. Read the results",
    text: "Thrust, fuel use (TSFC) and efficiencies for your design. Tap ƒ on any card to see how that number was worked out.",
  },
  {
    target: ".ed-diagram-wrap",
    title: "5. Look inside",
    text: "A live cutaway of your engine. Click any part — or any station number — for its temperatures and pressures.",
  },
  {
    target: ".results-panel-tools",
    title: "6. Compare and explore",
    text: "Put two engines side by side, see which engine wins at each flight speed, sweep an input across a range, and save designs to compare.",
  },
  {
    target: ".header-challenges",
    title: "7. Try a challenge",
    text: "Small goals — like making a turbojet fly at Mach 3 — that are checked live while you change the inputs. Share any design with “Copy shareable link”.",
  },
];

const GAP = 12;
const CARD_W = 320;

function findStep(from, dir) {
  for (let i = from; i >= 0 && i < STEPS.length; i += dir) {
    const el = document.querySelector(STEPS[i].target);
    if (el && el.getClientRects().length) return i;
  }
  return -1;
}

/** A short spotlight tour of the page: Back / Next / Skip, Esc to close. */
export default function Tour({ onClose }) {
  const [index, setIndex] = useState(() => findStep(0, 1));
  const [rect, setRect] = useState(null);
  const nextRef = useRef(null);
  const step = STEPS[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Big targets (the whole sidebar) are clipped to the viewport.
    const top = Math.max(r.top, 8);
    const bottom = Math.min(r.bottom, window.innerHeight - 8);
    setRect({ top, left: Math.max(r.left, 8), width: Math.min(r.width, window.innerWidth - 16), height: Math.max(bottom - top, 24) });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    el?.scrollIntoView({ block: "nearest", behavior: "instant" });
    measure();
  }, [step, measure]);

  useEffect(() => {
    if (!step) return undefined;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  const go = useCallback((dir) => {
    const next = findStep(index + dir, dir);
    if (next < 0) {
      if (dir > 0) onClose();
      return;
    }
    setIndex(next);
  }, [index, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => { nextRef.current?.focus(); }, [index]);

  useEffect(() => {
    if (index < 0) onClose();
  }, [index, onClose]);
  if (!step || !rect) return null;

  // Card below the target if it fits, else above, else pinned to the
  // bottom of the screen (phones, or very tall targets).
  const vw = window.innerWidth, vh = window.innerHeight;
  const narrow = vw < 640;
  const cardW = Math.min(CARD_W, vw - 32);
  let style;
  if (narrow) {
    style = { left: 16, right: 16, bottom: 16 };
  } else {
    const below = rect.top + rect.height + GAP;
    const left = Math.min(Math.max(rect.left, 16), vw - cardW - 16);
    if (below + 220 < vh) style = { top: below, left, width: cardW };
    else if (rect.top - GAP - 220 > 0) style = { top: rect.top - GAP - 220, left, width: cardW };
    else style = { top: Math.min(Math.max(rect.top + 16, 16), vh - 236), left: Math.min(rect.left + rect.width + GAP, vw - cardW - 16), width: cardW };
  }
  const shown = STEPS.filter((s) => document.querySelector(s.target));
  const pos = shown.indexOf(step) + 1;
  const isLast = findStep(index + 1, 1) < 0;

  return createPortal(
    <div className="tour-layer">
      <div className="tour-spotlight" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />
      <div className="tour-card" style={style} role="dialog" aria-modal="false" aria-labelledby="tour-title">
        <p className="tour-count">{pos} of {shown.length}</p>
        <h2 id="tour-title">{step.title.replace(/^\d+\.\s*/, "")}</h2>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>Skip tour</button>
          <span>
            {findStep(index - 1, -1) >= 0 && (
              <button type="button" className="reset-button" onClick={() => go(-1)}>Back</button>
            )}
            <button type="button" ref={nextRef} className="reset-button tour-next" onClick={() => go(1)}>
              {isLast ? "Done" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
