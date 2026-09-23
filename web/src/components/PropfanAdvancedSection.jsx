import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Design-value defaults and gas properties for the propfan — same
 * spirit as the other engines' own Advanced sections. Collapsed by
 * default. Ref: reference/propfan.md.
 */
export default function PropfanAdvancedSection({ config, onChange }) {
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
            hint="same intake formula as the turbojet — CORE stream only; the fan sits directly in the freestream, ahead of any diffuser" />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="same fuel-air-ratio energy balance as the turbojet" />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.01}
            hint="fraction, not %. Typical value" />
          <NumberField label="HPT efficiency η_HPT" value={config.eta_HPT}
            onChange={(v) => onChange({ eta_HPT: v })} min={0.5} max={1.0} step={0.01}
            hint="HPT = High-Pressure Turbine, right after the combustor — drives the HPC (High-Pressure Compressor) only, bare energy balance — no lambda/eta_m term (§2.1, module docstring: shaft/mechanical efficiency taken as 100% here)" />
          <NumberField label="IPT efficiency η_IPT" value={config.eta_IPT}
            onChange={(v) => onChange({ eta_IPT: v })} min={0.5} max={1.0} step={0.01}
            hint="IPT = Intermediate-Pressure Turbine, right after the HPT — drives the IPC (Intermediate-Pressure Compressor) only, same bare energy balance as the HPT (§2.1)" />
          <NumberField label="Fan mechanical efficiency η_m,UDF" value={config.eta_m_UDF}
            onChange={(v) => onChange({ eta_m_UDF: v })} min={0.9} max={1.0} step={0.005}
            hint="UDF = Unducted Fan, the propfan's own open-rotor fan (see the Unducted fan section). This is the mechanical efficiency between the free turbine and that fan (§2.4)" />
          <NumberField label="Hot nozzle efficiency η_n" value={config.eta_n}
            onChange={(v) => onChange({ eta_n: v })} min={0.5} max={1.0} step={0.01}
            hint="always fully expanded to ambient here — no choking check, unlike the turbojet's nozzle.py (§2.3)" />
          <NumberField label="Bleed ratio b" value={config.bleed_ratio}
            onChange={(v) => onChange({ bleed_ratio: v })} min={0} max={0.2} step={0.01}
            hint="mdot_bleed/mdot_a. Applied as (1-b) on the fuel-air ratio and uniformly as (1+f-b) throughout the cycle — a deliberate departure from the source's own inconsistent (1+f-b)/(1+f) usage past the HPT (reference/propfan.md §4, judgment call #1)" />

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
        </>
      )}
    </fieldset>
  );
}
