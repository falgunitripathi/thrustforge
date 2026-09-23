import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Gas-generator compressors — IPC (intermediate-pressure) and HPC
 * (high-pressure). Each is a single overall pressure-ratio/efficiency
 * step, the same one-shot `_compressor_step` form turbofan.py's own
 * LPC/HPC use — no stage-stacking like the turbojet's compressor.py.
 * Ref: reference/propfan.md §2.1.
 *
 * NOT IN SOURCE numerically (reference/propfan.md has no worked
 * example) — same provisional status as turbofan.py's own LPC/HPC
 * defaults; chosen so π_IPC·π_HPC lands near a plausible core overall
 * pressure ratio for a three-spool gas generator.
 */
export default function PropfanCompressorsSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} IPC &amp; HPC
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="IPC pressure ratio π_IPC"
            value={config.pi_IPC}
            onChange={(v) => onChange({ pi_IPC: v })}
            min={1.0}
            max={5.0}
            step={0.1}
            hint="IPC = Intermediate-Pressure Compressor, the first (lowest-pressure) of the two gas-generator compressors, right after the core intake. p03 = p02·π_IPC (§2.1)."
          />
          <NumberField
            label="IPC efficiency η_IPC"
            value={config.eta_IPC}
            onChange={(v) => onChange({ eta_IPC: v })}
            min={0.7}
            max={0.98}
            step={0.01}
            hint="IPC = Intermediate-Pressure Compressor — see the pressure-ratio field above for what it is. How much of the ideal compression this stage actually achieves."
          />
          <NumberField
            label="HPC pressure ratio π_HPC"
            value={config.pi_HPC}
            onChange={(v) => onChange({ pi_HPC: v })}
            min={2}
            max={25}
            step={0.5}
            hint="HPC = High-Pressure Compressor, the second (final, highest-pressure) gas-generator compressor, right before the combustor. p04 = p03·π_HPC (§2.1). Chosen with π_IPC to reach a plausible core overall pressure ratio."
          />
          <NumberField
            label="HPC efficiency η_HPC"
            value={config.eta_HPC}
            onChange={(v) => onChange({ eta_HPC: v })}
            min={0.7}
            max={0.98}
            step={0.01}
            hint="HPC = High-Pressure Compressor — see the pressure-ratio field above for what it is. How much of the ideal compression this stage actually achieves."
          />
        </>
      )}
    </fieldset>
  );
}
