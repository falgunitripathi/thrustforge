import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import CompressorSection from "./CompressorSection.jsx";
import CombustorSection from "./CombustorSection.jsx";
import TurbineSection from "./TurbineSection.jsx";
import LoadSection from "./LoadSection.jsx";
import TurboshaftAdvancedSection from "./TurboshaftAdvancedSection.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";

/**
 * The full turboshaft configuration form — same layout/pattern as the
 * turbojet/turboprop's own forms, reusing FlightConditionsSection/
 * CompressorSection/CombustorSection/TurbineSection as-is (identical
 * field names/meaning — see aeropropsim/turboshaft.py's module
 * docstring on why intake/compressor/combustor are identical to the
 * turbojet's). The Load section is new — no propeller, no nozzle here
 * at all, since every bit of the turbine's work goes to an output shaft.
 */
export default function TurboshaftConfigForm({ config, result, onChange, onReset, onCollapse }) {
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
      <CompressorSection config={config} onChange={onChange} />
      <CombustorSection config={config} onChange={onChange} />
      <TurbineSection config={config} onChange={onChange} />
      <LoadSection config={config} onChange={onChange} />
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
            hint="kg/s — scales absolute shaft power; specific power/SFC are independent of it"
          />
        )}
      </fieldset>
      <FuelSection engineType="turboshaft" config={config} result={result} onChange={onChange} />
      <TurboshaftAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="turboshaft" />
    </div>
  );
}
