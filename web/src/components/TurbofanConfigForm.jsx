import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import FanSection from "./FanSection.jsx";
import CoreCompressorsSection from "./CoreCompressorsSection.jsx";
import TurbofanCombustorSection from "./TurbofanCombustorSection.jsx";
import TurbofanAdvancedSection from "./TurbofanAdvancedSection.jsx";

/**
 * The full turbofan configuration form — same layout/pattern as the
 * other engines' forms, reusing FlightConditionsSection as-is. Fan/
 * bypass, LPC/HPC, and combustor are new sections (see
 * aeropropsim/turbofan.py's module docstring for why the fan/LPC/HPC
 * are single-step components here, not stage-stacked like the
 * turbojet's). HPT/LPT and both nozzles' efficiencies live in Advanced,
 * same as the other engines' shaft/nozzle efficiency terms.
 */
export default function TurbofanConfigForm({ config, onChange, onReset, onCollapse }) {
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
      <FanSection config={config} onChange={onChange} />
      <CoreCompressorsSection config={config} onChange={onChange} />
      <TurbofanCombustorSection config={config} onChange={onChange} />
      <fieldset className="config-section">
        <legend>
          <button type="button" className="disclosure" aria-expanded={massFlowOpen} onClick={() => setMassFlowOpen(!massFlowOpen)}>
            {massFlowOpen ? "▾" : "▸"} Mass flow
          </button>
        </legend>
        {massFlowOpen && (
          <NumberField
            label="Core air mass flow rate"
            value={config.mdot_a}
            onChange={(v) => onChange({ mdot_a: v })}
            min={0.01}
            max={2000}
            step={1}
            hint="kg/s — the CORE (hot-stream) mass flow; the bypass stream is β× this. Scales absolute thrust; specific thrust/TSFC/efficiencies are independent of it."
          />
        )}
      </fieldset>
      <TurbofanAdvancedSection config={config} onChange={onChange} />
    </div>
  );
}
