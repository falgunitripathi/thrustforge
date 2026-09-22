import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import PropfanFanSection from "./PropfanFanSection.jsx";
import PropfanCompressorsSection from "./PropfanCompressorsSection.jsx";
import PropfanCombustorSection from "./PropfanCombustorSection.jsx";
import PropfanFreeTurbineSection from "./PropfanFreeTurbineSection.jsx";
import PropfanAdvancedSection from "./PropfanAdvancedSection.jsx";
import FormulasExport from "./FormulasExport.jsx";

/**
 * The full propfan configuration form — same layout/pattern as the
 * turbofan's form, reusing FlightConditionsSection as-is. The Unducted
 * fan (UDF), IPC & HPC, Combustor, and Free (power) turbine sections are
 * new (see aeropropsim/propfan.py's module docstring for the three-spool
 * gas-generator + free-turbine-driven-fan layout). HPT/IPT efficiencies,
 * fan mechanical efficiency, hot-nozzle efficiency, bleed, intake
 * efficiency, and gas properties live in Advanced, same as the other
 * engines' shaft/nozzle efficiency terms.
 */
export default function PropfanConfigForm({ config, onChange, onReset, onCollapse }) {
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
      <PropfanFanSection config={config} onChange={onChange} />
      <PropfanCompressorsSection config={config} onChange={onChange} />
      <PropfanCombustorSection config={config} onChange={onChange} />
      <PropfanFreeTurbineSection config={config} onChange={onChange} />
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
            hint="kg/s — the SAME mdot_a figure the source uses for both the gas-generator core and (scaled by the solved fan power-split fraction β) the fan thrust formula. Scales absolute thrust; specific thrust/TSFC/efficiencies are independent of it."
          />
        )}
      </fieldset>
      <PropfanAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="propfan" />
    </div>
  );
}
