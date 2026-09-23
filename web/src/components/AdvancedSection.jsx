import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Design-value defaults and gas properties — Ref §10, plus the cold/hot
 * section gas properties from §0. Collapsed by default: these are the
 * project's DEFAULTS (constants.js), each independently sourced (or
 * flagged "NOT IN SOURCE" — see constants.js/constants.py comments), and
 * most users of the simulator won't need to touch them.
 */
export default function AdvancedSection({ config, onChange }) {
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
          These describe how well the engine's own hardware is built (intake, compressor, turbine, nozzle losses)
          and the air/gas it works with &mdash; not the fuel, which has its own section above. They start at
          typical textbook values; change one to see how a lossier part costs thrust or fuel.
        </p>
        <div className="advanced-grid">
          <NumberField label="Intake efficiency η_d" value={config.eta_d}
            onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
            hint="p02 = p_a·[1+η_d·(γ_c−1)/2·M²]^(γ_c/(γ_c−1)) (§3). Typical 0.70–0.90 (§10)." />
          <NumberField label="Compressor stage efficiency η_c" value={config.eta_c_stage}
            onChange={(v) => onChange({ eta_c_stage: v })} min={0.5} max={1.0} step={0.01}
            hint="per-stage π_i = (1+η_c·ΔT0/T01)^(γ_c/(γ_c−1)) (§4.2)" />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="appears in the fuel-air ratio energy balance: f = [(Cp_h/Cp_c)(T04/T03)−1] / [(η_b·Q_R)/(Cp_c·T03)−(Cp_h/Cp_c)(T04/T03)] (§5). Typical ~0.97 (§10)." />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.01}
            hint="p04 = p03·(1−Δp_cc) (§5). Fraction, not %. Typical value" />
          <NumberField label="Shaft power fraction λ" value={config.lambda_shaft}
            onChange={(v) => onChange({ lambda_shaft: v })} min={0.5} max={1.0} step={0.01}
            hint="fraction of turbine power driving the compressor, in the shaft balance T05/T04 = 1−Cp_c·(T03−T02)/(λ·η_m·(1+f)·Cp_h·T04) (§7). Typical 0.75–0.85 (§10)." />
          <NumberField label="Mechanical efficiency η_m" value={config.eta_m}
            onChange={(v) => onChange({ eta_m: v })} min={0.9} max={1.0} step={0.005}
            hint="same shaft-balance formula as λ above (§7). Typical ~0.98 (§10)." />
          <NumberField label="Turbine stage efficiency η_tt" value={config.eta_tt_stage}
            onChange={(v) => onChange({ eta_tt_stage: v })} min={0.5} max={1.0} step={0.01}
            hint="per-stage p_out/p_in = [1−ΔT0/(η_tt·T01)]^(γ_h/(γ_h−1)) (§6.1). Typical axial-turbine value" />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="sets choking pressure p_c = p0·[1−(1/η_N)·(γ_h−1)/(γ_h+1)]^(γ_h/(γ_h−1)), and (when unchoked) V_exit = √(2·Cp_h·η_N·T0·[1−(p_a/p0)^((γ_h−1)/γ_h)]) (§8)" />

          <NumberField label="Cold section γ_c" value={config.gamma_c}
            onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001}
            hint="ratio of specific heats, intake/compressor side — used throughout every isentropic-exponent formula upstream of the combustor (§0)" />
          <NumberField label="Cold section Cp_c" value={config.cp_c}
            onChange={(v) => onChange({ cp_c: v })} min={800} max={1200} step={1}
            hint="J/(kg·K) — cold-section specific heat, used throughout upstream-of-combustor energy formulas (§0)" />
          <NumberField label="Hot section γ_h" value={config.gamma_h}
            onChange={(v) => onChange({ gamma_h: v })} min={1.2} max={1.45} step={0.001}
            hint="ratio of specific heats, combustor/turbine/nozzle side — used throughout every isentropic-exponent formula downstream of the combustor (§0)" />
          <NumberField label="Hot section Cp_h" value={config.cp_h}
            onChange={(v) => onChange({ cp_h: v })} min={900} max={1400} step={1}
            hint="J/(kg·K) — hot-section specific heat, used throughout downstream-of-combustor energy formulas (§0)" />
        </div>
        </>
      )}
    </fieldset>
  );
}
