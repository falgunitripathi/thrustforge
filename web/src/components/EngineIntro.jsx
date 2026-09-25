import { useState } from "react";
import { ENGINE_INFO } from "../utils/engineInfo.js";

/**
 * "What is this engine?" card at the top of each engine's results. Closed
 * by default it's one clickable bar (name + tagline); clicking anywhere on
 * it opens the real engines that use it, its speed range and a plain-
 * language description.
 */
export default function EngineIntro({ engineType }) {
  const info = ENGINE_INFO[engineType];
  const [open, setOpen] = useState(false);
  if (!info) return null;

  return (
    <section className={`engine-intro${open ? " engine-intro-open" : ""}`} aria-label={`About the ${info.name}`}>
      <button type="button" className="engine-intro-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="engine-intro-icon" aria-hidden="true">{info.icon}</span>
        <span className="engine-intro-titles">
          <span className="engine-intro-name">{info.name}</span>
          <span className="engine-intro-tagline">{info.tagline}</span>
        </span>
        <span className="engine-intro-toggle" aria-hidden="true">
          {open ? "Hide ▴" : "What is it? ▾"}
        </span>
      </button>
      {open && (
        <div className="engine-intro-body">
          <p className="engine-intro-what">{info.what}</p>
          <ul className="engine-intro-chips" aria-label="Where it's used and its speed range">
            {info.usedIn.map((u) => {
              const [engine, where] = u.split(" — ");
              return (
                <li key={u} className="engine-intro-chip" title={u}>
                  <strong>{where || engine}</strong>{where ? <span> · {engine}</span> : null}
                </li>
              );
            })}
            <li className="engine-intro-chip engine-intro-chip-speed">{info.speed}</li>
          </ul>
        </div>
      )}
    </section>
  );
}
