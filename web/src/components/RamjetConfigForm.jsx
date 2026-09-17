import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";

/**
 * The ramjet configuration form — flight condition (reused as-is from the
 * turbojet form: same altitude_m/mach_flight fields), combustor exit
 * temperature, mass flow, and an advanced/collapsed section for the
 * component efficiencies and gas properties.
 *
 * Deliberately much shorter than the turbojet's ConfigForm: a ramjet has
 * no compressor, no turbine, and no architecture choice to make there —
 * see aeropropsim/ramjet.py and reference/ramjet.md for why.
 */
export default function RamjetConfigForm({ config, onChange, onReset, onCollapse }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [massFlowOpen, setMassFlowOpen] = useState(false);

  return (
    <div className="config-form">
      <div className="config-form-header">
        <h2>Engine configuration</h2>
        <div className="config-form-actions">
          <button type="button" className="reset-button" onClick={onReset}>
            Reset to defaults
          </button>
          {onCollapse && (
            <button
              type="button"
              className="reset-button config-form-collapse-button"
              onClick={onCollapse}
              aria-label="Hide engine configuration panel"
              title="Hide this panel to free up space"
            >
              ⟨⟨ Hide
            </button>
          )}
        </div>
      </div>

      <FlightConditionsSection config={config} onChange={onChange} />

      <fieldset className="config-section">
        <legend>Combustor</legend>
        <NumberField
          label="Combustor exit temperature"
          value={config.T04}
          onChange={(v) => onChange({ T04: v })}
          min={800}
          max={2273}
          step={10}
          hint="K — the fixed design target, T04. No turbine to protect, so ramjets tolerate much higher temperatures than a turbojet's TIT (Ref: reference/ramjet.md §1, §3 — up to ~2000°C/2273 K, vs ~900°C for a turbojet)"
        />
      </fieldset>

      <fieldset className="config-section">
        <legend>
          <button type="button" className="disclosure" aria-expanded={massFlowOpen} onClick={() => setMassFlowOpen(!massFlowOpen)}>
            {massFlowOpen ? "▾" : "▸"} Mass flow
          </button>
        </legend>
        {massFlowOpen && (
          <NumberField
            label="Air mass flow rate"
            value={config.mdot_a}
            onChange={(v) => onChange({ mdot_a: v })}
            min={0.01}
            max={2000}
            step={1}
            hint="kg/s — scales absolute thrust; specific thrust/TSFC/efficiencies are independent of it"
          />
        )}
      </fieldset>

      <fieldset className="config-section advanced">
        <legend>
          <button type="button" className="disclosure" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(!advancedOpen)}>
            {advancedOpen ? "▾" : "▸"} Advanced: design defaults &amp; gas properties
          </button>
        </legend>
        {advancedOpen && (
          <div className="advanced-grid">
            <NumberField label="Intake efficiency η_d" value={config.eta_d}
              onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
              hint="p0B/pA = (1+η_d·(γ−1)/2·M²)^(γ/(γ−1)) (reference/ramjet.md §2.1). NOT IN SOURCE for the ramjet specifically — carried over from the turbojet's own default." />
            <NumberField label="Combustor efficiency η_b" value={config.eta_b}
              onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
              hint="appears in the fuel-air ratio energy balance (reference/ramjet.md §2.11). NOT IN SOURCE for the ramjet specifically — carried over from the turbojet's own default (~0.97)." />
            <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
              onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.01}
              hint="p04 = p02·(1−Δp_cc) (reference/ramjet.md §2.2). Fraction, not %. NOT IN SOURCE for the ramjet specifically." />
            <NumberField label="Fuel heating value Q_R" value={config.Q_R}
              onChange={(v) => onChange({ Q_R: v })} min={3.0e7} max={5.0e7} step={1.0e5}
              hint="J/kg — denominator of the fuel-air ratio f (reference/ramjet.md §2.11). NOT IN SOURCE (standard published Jet-A LHV)." />
            <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
              onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
              hint="sets choking pressure and (when unchoked) exit velocity, same formulas as the turbojet's nozzle (reference/ramjet.md §2.3-2.4). NOT IN SOURCE for the ramjet specifically." />

            <NumberField label="Cold section γ_c" value={config.gamma_c}
              onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001}
              hint="ratio of specific heats, intake side — used in every isentropic-exponent formula upstream of the combustor" />
            <NumberField label="Cold section Cp_c" value={config.cp_c}
              onChange={(v) => onChange({ cp_c: v })} min={800} max={1200} step={1}
              hint="J/(kg·K)" />
            <NumberField label="Hot section γ_h" value={config.gamma_h}
              onChange={(v) => onChange({ gamma_h: v })} min={1.2} max={1.45} step={0.001}
              hint="ratio of specific heats, combustor/nozzle side — used in every isentropic-exponent formula downstream of the combustor" />
            <NumberField label="Hot section Cp_h" value={config.cp_h}
              onChange={(v) => onChange({ cp_h: v })} min={900} max={1400} step={1}
              hint="J/(kg·K)" />
          </div>
        )}
      </fieldset>
    </div>
  );
}
