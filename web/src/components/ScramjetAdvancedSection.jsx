import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Design-value defaults and gas properties for the scramjet — same
 * spirit as the other engines' own Advanced sections. Collapsed by
 * default. The source gives no scramjet-specific numbers for eta_b,
 * eta_N, or Q_R (reference/scramjet.md §3), so these carry over the
 * project-wide defaults (constants.js DEFAULTS). eta_I lives in the
 * Intake section instead, since it's one of the two intake knobs.
 */
export default function ScramjetAdvancedSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section advanced">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Advanced: design defaults &amp; gas properties
        </button>
      </legend>
      {open && (
        <div className="advanced-grid">
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="η_b = combustor (burner) efficiency — the fraction of the fuel's heat that actually ends up in the gas. Used in T03 (§2.2) and in the thermal efficiency. No scramjet-specific value in the source — project-wide default carried over." />
          <NumberField label="Fuel heating value Q_R" value={config.Q_R}
            onChange={(v) => onChange({ Q_R: v })} min={3.0e7} max={1.5e8} step={1.0e5}
            hint="J/kg — Q_R = the fuel's heating value, the heat released by burning 1 kg of it (QHV in the source). NOT IN SOURCE (standard published Jet-A LHV, the project-wide default). Real scramjets often burn hydrogen, whose heating value is roughly three times higher — the range here allows that." />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="η_N = nozzle isentropic efficiency, η_N = (T3 − T4)/(T3 − Ty) (§2.3, NPTEL p.279). The nozzle is expanded fully to ambient pressure p_a here — a deliberate deviation from the source's own (p2/p3) ratio, which is physically anomalous for a 3→4 expansion (judgment call #1). No scramjet-specific value in the source — project-wide default carried over." />

          <NumberField label="Cold section γ_c" value={config.gamma_c}
            onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001}
            hint="γ_c = ratio of specific heats for the incoming air (intake, upstream of the combustor)" />
          <NumberField label="Cold section Cp_c" value={config.cp_c}
            onChange={(v) => onChange({ cp_c: v })} min={800} max={1200} step={1}
            hint="J/(kg·K) — Cp_c = specific heat at constant pressure of the incoming air" />
          <NumberField label="Hot section γ_h" value={config.gamma_h}
            onChange={(v) => onChange({ gamma_h: v })} min={1.2} max={1.45} step={0.001}
            hint="γ_h = ratio of specific heats for the hot combustion gas (combustor exit and nozzle)" />
          <NumberField label="Hot section Cp_h" value={config.cp_h}
            onChange={(v) => onChange({ cp_h: v })} min={900} max={1400} step={1}
            hint="J/(kg·K) — Cp_h = specific heat at constant pressure of the hot combustion gas" />
        </div>
      )}
    </fieldset>
  );
}
