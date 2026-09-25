import { useState } from "react";
import { ENGINE_INFO } from "../utils/engineInfo.js";

/**
 * "What is this engine?" card at the top of each engine's results. Compact
 * by default (name, tagline, real engines and speed as chips) so the live
 * diagram right below stays on the first screen; "What is it?" opens the
 * plain-language description.
 */
export default function EngineIntro({ engineType }) {
  const info = ENGINE_INFO[engineType];
  const [open, setOpen] = useState(false);
  if (!info) return null;

  return (
    <section className="engine-intro" aria-label={`About the ${info.name}`}>
      <div className="engine-intro-head">
        <span className="engine-intro-icon" aria-hidden="true">{info.icon}</span>
        <div className="engine-intro-titles">
          <h2 className="engine-intro-name">{info.name}</h2>
          <p className="engine-intro-tagline">{info.tagline}</p>
        </div>
        <button type="button" className="engine-intro-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "What is it?"}
        </button>
      </div>
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
      {open && <p className="engine-intro-what">{info.what}</p>}
    </section>
  );
}
