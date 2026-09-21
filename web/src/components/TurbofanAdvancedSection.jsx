import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Design-value defaults and gas properties for the turbofan — same
 * spirit as the turbojet/turboprop/turboshaft's own Advanced sections.
 * Collapsed by default. Ref: reference/turbofan.md.
 */
export default function TurbofanAdvancedSection({ config, onChange }) {
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
          <NumberField label="Intake efficiency η_d" value={config.eta_d}
            onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
            hint="same intake formula as the turbojet" />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="same fuel-air-ratio energy balance as the turbojet" />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.01}
            hint="fraction, not %. NOT IN SOURCE (conventional placeholder)" />
          <NumberField label="Fuel heating value Q_R" value={config.Q_R}
            onChange={(v) => onChange({ Q_R: v })} min={3.0e7} max={5.0e7} step={1.0e5}
            hint="J/kg. NOT IN SOURCE (standard published Jet-A LHV)" />
          <NumberField label="HPT efficiency η_HPT" value={config.eta_HPT}
            onChange={(v) => onChange({ eta_HPT: v })} min={0.5} max={1.0} step={0.01}
            hint="HPT drives the HPC only (§3)" />
          <NumberField label="LPT efficiency η_LPT" value={config.eta_LPT}
            onChange={(v) => onChange({ eta_LPT: v })} min={0.5} max={1.0} step={0.01}
            hint="LPT drives the fan + LPC together (§3)" />
          <NumberField label="HP-spool mechanical efficiency η_m1" value={config.eta_m1}
            onChange={(v) => onChange({ eta_m1: v })} min={0.9} max={1.0} step={0.005} />
          <NumberField label="LP-spool mechanical efficiency η_m2" value={config.eta_m2}
            onChange={(v) => onChange({ eta_m2: v })} min={0.9} max={1.0} step={0.005} />
          <NumberField label="HPT work fraction λ1" value={config.lambda1}
            onChange={(v) => onChange({ lambda1: v })} min={0.8} max={1.0} step={0.01}
            hint="the source never precisely defines this 'conversion factor' — defaults to 1.0, the same resolution used elsewhere in this project for the same ambiguity" />
          <NumberField label="LPT work fraction λ2" value={config.lambda2}
            onChange={(v) => onChange({ lambda2: v })} min={0.8} max={1.0} step={0.01} />
          <NumberField label="Jet-pipe Δp loss" value={config.delta_p_jetpipe}
            onChange={(v) => onChange({ delta_p_jetpipe: v })} min={0} max={0.1} step={0.005}
            hint="fraction, not %. NOT IN SOURCE numerically" />
          <NumberField label="Hot nozzle efficiency η_n1" value={config.eta_n1}
            onChange={(v) => onChange({ eta_n1: v })} min={0.5} max={1.0} step={0.01} />
          <NumberField label="Cold (fan) nozzle efficiency η_fn" value={config.eta_fn}
            onChange={(v) => onChange({ eta_fn: v })} min={0.5} max={1.0} step={0.01} />

          <NumberField label="Cold section γ_c" value={config.gamma_c}
            onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001} />
          <NumberField label="Cold section Cp_c" value={config.cp_c}
            onChange={(v) => onChange({ cp_c: v })} min={800} max={1200} step={1}
            hint="J/(kg·K)" />
          <NumberField label="Hot section γ_h" value={config.gamma_h}
            onChange={(v) => onChange({ gamma_h: v })} min={1.2} max={1.45} step={0.001} />
          <NumberField label="Hot section Cp_h" value={config.cp_h}
            onChange={(v) => onChange({ cp_h: v })} min={900} max={1400} step={1}
            hint="J/(kg·K)" />
        </div>
      )}
    </fieldset>
  );
}
