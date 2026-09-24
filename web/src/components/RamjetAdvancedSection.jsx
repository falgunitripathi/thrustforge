import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Efficiencies and gas properties for the ramjet — collapsed by default,
 * same pattern as the other engines. No ramjet-specific values in the
 * source (reference/ramjet.md §3), so these carry the project defaults.
 */
export default function RamjetAdvancedSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section advanced">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Engine quality: efficiencies &amp; gas properties
        </button>
      </legend>
      {open && (
        <>
        <p className="section-intro-note">
          These describe how well the engine&rsquo;s own hardware is built (intake, combustor and nozzle losses)
          and the air/gas it works with &mdash; not the fuel, which has its own section above. They start at
          typical textbook values; change one to see how a lossier part costs thrust or fuel.
        </p>
        <div className="advanced-grid">
          <NumberField label="Intake efficiency η_d" value={config.eta_d}
            onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
            hint="η_d = intake (diffuser) efficiency — how much of the ideal ram pressure rise the intake actually keeps. p02 = p_a·(1 + η_d·(γ_c−1)/2·M²)^(γ_c/(γ_c−1)). Shock waves in a supersonic intake make this the ramjet's biggest single loss." />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="η_b = combustor (burner) efficiency — the fraction of the fuel's heat that actually ends up in the gas. Used in the fuel-air ratio." />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.005}
            hint="fraction — p04 = p02·(1 − Δp). Flame holders and friction cost some pressure. At low flight speed this loss can exceed the ram pressure rise, and the ramjet can't run at all." />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="η_N = nozzle efficiency — how close the expansion comes to an ideal, loss-free one." />

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
        </>
      )}
    </fieldset>
  );
}
