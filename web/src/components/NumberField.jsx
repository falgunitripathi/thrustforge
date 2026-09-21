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

/** Reusable labeled numeric input, controlled, with an optional unit/hint. */
export default function NumberField({
  label, value, onChange, min, max, step = "any", hint, disabled = false,
}) {
  const rangeText = Number.isFinite(min) && Number.isFinite(max)
    ? `valid range ${formatBound(min)}–${formatBound(max)}`
    : null;
  const combinedHint = hint && rangeText ? `${hint} · ${rangeText}` : (hint || rangeText);
  return (
    <label className="field">
      <FieldInfoLabel label={label} hint={combinedHint} />
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? NaN : parseFloat(raw));
        }}
      />
    </label>
  );
}
