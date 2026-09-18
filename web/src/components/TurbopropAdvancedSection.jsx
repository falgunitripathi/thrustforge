import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Design-value defaults and gas properties for the turboprop — same
 * spirit as the turbojet's AdvancedSection, with the fields specific to
 * this engine's mechanical/turbine layout (eta_t, eta_mt, eta_mc, bleed)
 * in place of the turbojet's single eta_m/eta_tt_stage/lambda_shaft.
 * Collapsed by default. Ref: reference/turboprop.md.
 */
export default function TurbopropAdvancedSection({ config, onChange }) {
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
            hint="same intake formula as the turbojet (§2.1). Typical 0.70–0.90" />
          <NumberField label="Compressor stage efficiency η_c" value={config.eta_c_stage}
            onChange={(v) => onChange({ eta_c_stage: v })} min={0.5} max={1.0} step={0.01}
            hint="same stage-stacking formula as the turbojet (§2.1)" />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="same fuel-air-ratio energy balance as the turbojet" />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.01}
            hint="fraction, not %. NOT IN SOURCE (conventional placeholder)" />
          <NumberField label="Fuel heating value Q_R" value={config.Q_R}
            onChange={(v) => onChange({ Q_R: v })} min={3.0e7} max={5.0e7} step={1.0e5}
            hint="J/kg. NOT IN SOURCE (standard published Jet-A LHV)" />
          <NumberField label="Turbine efficiency η_t" value={config.eta_t}
            onChange={(v) => onChange({ eta_t: v })} min={0.5} max={1.0} step={0.01}
            hint="turbine isentropic efficiency, sets both the actual shaft work and the derived T05/p05 (§2.2)" />
          <NumberField label="Turbine mechanical efficiency η_mt" value={config.eta_mt}
            onChange={(v) => onChange({ eta_mt: v })} min={0.9} max={1.0} step={0.005}
            hint="Wshaft = η_mt·(1+f-b)·Δh_t − Δh_c/η_mc (§2.2)" />
          <NumberField label="Compressor mechanical efficiency η_mc" value={config.eta_mc}
            onChange={(v) => onChange({ eta_mc: v })} min={0.9} max={1.0} step={0.005}
            hint="same shaft-balance formula as η_mt above (§2.2)" />
          <NumberField label="Bleed ratio b" value={config.bleed_ratio}
            onChange={(v) => onChange({ bleed_ratio: v })} min={0} max={0.1} step={0.005}
            hint="mdot_bleed/mdot_a — reduces the (1+f−b) mass-flow factor used in the shaft/nozzle formulas (§2.2)" />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="ue = √(2·η_N·(1−α)·Δh) (§2.2) — this model always treats the residual jet as fully expanded to ambient, no choking check (unlike the turbojet's nozzle)" />

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
