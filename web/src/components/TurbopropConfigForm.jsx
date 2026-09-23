import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import CompressorSection from "./CompressorSection.jsx";
import CombustorSection from "./CombustorSection.jsx";
import TurbineSection from "./TurbineSection.jsx";
import PropellerSection from "./PropellerSection.jsx";
import TurbopropAdvancedSection from "./TurbopropAdvancedSection.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";

/**
 * The full turboprop configuration form — same layout/pattern as the
 * turbojet's ConfigForm (flight condition, compressor, combustor,
 * turbine, propeller, mass flow, advanced), reusing the turbojet's own
 * FlightConditionsSection/CompressorSection/CombustorSection/
 * TurbineSection components as-is (same field names/meaning — see
 * aeropropsim/turboprop.py's module docstring on why intake/compressor/
 * combustor are identical to the turbojet's). The Propeller section is
 * new — the turboprop's defining difference — and the nozzle has no
 * separate section here since this model always treats the residual
 * jet as fully expanded (no choking, no C-D geometry option to expose).
 */
export default function TurbopropConfigForm({ config, result, onChange, onReset, onCollapse }) {
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
      <PropellerSection config={config} onChange={onChange} />
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
            hint="kg/s — scales absolute thrust and shaft power; specific thrust/TSFC/efficiencies are independent of it"
          />
        )}
      </fieldset>
      <FuelSection engineType="turboprop" config={config} result={result} onChange={onChange} />
      <TurbopropAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="turboprop" />
    </div>
  );
}
