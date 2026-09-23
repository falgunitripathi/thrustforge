import { useState } from "react";
import NumberField from "./NumberField.jsx";
import SelectField from "./SelectField.jsx";

/** Compressor configuration — Ref §4 (Compressor). Collapsed by default —
 *  click the legend to open it. */
export default function CompressorSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  const isAxial = config.compressor_type === "axial";
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Compressor
        </button>
      </legend>
      {open && (
        <>
          <SelectField
            label="Type"
            value={config.compressor_type}
            onChange={(v) => onChange(
              // Real centrifugal compressors use 1-2 stages; carrying over an
              // axial stage count (e.g. 8) would stack to a ~200:1 pressure
              // ratio that no turbine can drive.
              v === "centrifugal"
                ? { compressor_type: v, n_compressor_stages: 1 }
                : { compressor_type: v }
            )}
            options={[
              { value: "axial", label: "Axial (stage-stacked)" },
              { value: "centrifugal", label: "Centrifugal" },
            ]}
          />
          <NumberField
            label="Number of stages"
            value={config.n_compressor_stages}
            onChange={(v) => onChange({ n_compressor_stages: Math.max(1, Math.round(v)) })}
            min={1}
            max={isAxial ? 20 : 3}
            step={1}
            hint={isAxial
              ? "splits the target π_c across this many stages via the stage-stacking procedure, each stage's own π_i = (1+η_c·ΔT0/T01)^(γ_c/(γ_c−1)) (§4.2)"
              : "each centrifugal stage multiplies the pressure ratio (typically 4-8:1 per stage), so real engines use 1 or 2. More than that needs more power than the turbine can supply."}
          />
          {isAxial ? (
            <NumberField
              label="Target overall pressure ratio"
              value={config.pi_c}
              onChange={(v) => onChange({ pi_c: v })}
              min={1.01}
              max={40}
              step={0.1}
              hint="π_c = p03/p01, stage-stacked to hit this exactly (§4.2)"
            />
          ) : (
            <NumberField
              label="Blade tip speed U2"
              value={config.centrifugal_U2}
              onChange={(v) => onChange({ centrifugal_U2: v })}
              min={50}
              max={600}
              step={10}
              hint="m/s, per stage (§4.3) — resulting pressure ratio is derived, not targeted"
            />
          )}
        </>
      )}
    </fieldset>
  );
}
