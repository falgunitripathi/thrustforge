import { useState } from "react";
import FieldInfoLabel from "./FieldInfoLabel.jsx";

/**
 * A finite min AND max together are treated as this field's actual valid
 * range (not just a spinner nicety) and folded into the click-to-reveal
 * info modal (see FieldInfoLabel) — every call site already carries
 * correct min/max (validated against the physics core and its input
 * checks), so this is free coverage rather than something each section
 * has to spell out by hand. A lone min with no max (e.g. "target thrust
 * >= 0") isn't a real ceiling, so it's left alone.
 */
function formatBound(n) {
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Reusable labeled numeric input, controlled, with an optional unit/hint.
 *
 * Only valid numbers reach `onChange`: an empty box, or a value outside
 * min/max, is kept as a local draft (shown with an inline message) and
 * the engine keeps solving with the last valid value. Leaving the field
 * reverts the draft. Without this, NaN or out-of-range values went
 * straight into the physics and came back as "NaN K" messages or
 * efficiencies above 100%.
 */
export default function NumberField({
  label, value, onChange, min, max, step = "any", hint, disabled = false,
}) {
  const [draft, setDraft] = useState(null);
  function problemWith(raw) {
    const v = parseFloat(raw);
    if (raw.trim() === "" || !Number.isFinite(v)) return "Enter a number";
    if (Number.isFinite(min) && v < min) return `Must be at least ${formatBound(min)}`;
    if (Number.isFinite(max) && v > max) return `Must be at most ${formatBound(max)}`;
    return null;
  }
  const problem = draft !== null ? problemWith(draft) : null;
  const rangeText = Number.isFinite(min) && Number.isFinite(max)
    ? `valid range ${formatBound(min)}–${formatBound(max)}`
    : null;
  const combinedHint = hint && rangeText ? `${hint} · ${rangeText}` : (hint || rangeText);
  // A bare unit ("N", "kg/s", "J/(kg·K)") has no space and nothing to
  // explain, so it stays a plain always-visible suffix next to the
  // label — only a real explanation (which always contains a space,
  // whether from prose or an appended "· valid range ...") is worth a
  // click-to-reveal modal.
  const isExplanatory = combinedHint && combinedHint.includes(" ");
  return (
    <label className="field">
      {isExplanatory ? (
        <FieldInfoLabel label={label} hint={combinedHint} />
      ) : (
        <span className="field-label">
          {label}
          {combinedHint && <span className="field-unit">{combinedHint}</span>}
        </span>
      )}
      <input
        type="number"
        value={draft ?? (Number.isFinite(value) ? value : "")}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={problem ? true : undefined}
        className={problem ? "field-input-invalid" : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          if (problemWith(raw)) {
            setDraft(raw);
          } else {
            setDraft(null);
            onChange(parseFloat(raw));
          }
        }}
        onBlur={() => setDraft(null)}
      />
      {problem && (
        <span className="field-error" role="alert">
          {problem} — still using {formatBound(value)}
        </span>
      )}
    </label>
  );
}
