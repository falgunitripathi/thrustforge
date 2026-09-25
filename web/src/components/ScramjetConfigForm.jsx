import { useState } from "react";
import CopyLinkButton from "./CopyLinkButton.jsx";
import NumberField from "./NumberField.jsx";
import ScramjetFlightSection from "./ScramjetFlightSection.jsx";
import ScramjetIntakeSection from "./ScramjetIntakeSection.jsx";
import ScramjetCombustorSection from "./ScramjetCombustorSection.jsx";
import ScramjetAdvancedSection from "./ScramjetAdvancedSection.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";

/**
 * The full scramjet configuration form — same layout/pattern as the
 * propfan's. Uses its own ScramjetFlightSection instead of the shared
 * FlightConditionsSection, whose flight-Mach ceiling (5.0) sits right
 * where a scramjet only starts working. No compressor/turbine sections:
 * the scramjet has no rotating machinery at all (aeropropsim/scramjet.py).
 *
 * `result` is null whenever the solve failed (e.g. thermal choking) —
 * nothing here depends on it except the combustor's guarded live M3
 * note, so the form always renders and stays usable to fix the input.
 */
export default function ScramjetConfigForm({ config, result, onChange, onReset, onCollapse }) {
  const [massFlowOpen, setMassFlowOpen] = useState(false);

  return (
    <div className="config-form">
      <div className="config-form-header">
        <h2>Engine configuration</h2>
        <div className="config-form-actions">
          <CopyLinkButton />
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
      <ScramjetFlightSection config={config} onChange={onChange} />
      <ScramjetIntakeSection config={config} onChange={onChange} />
      <ScramjetCombustorSection config={config} result={result} onChange={onChange} />
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
            hint="kg/s — ṁ_a = mass of air swallowed by the intake per second. Only scales absolute thrust, T = ṁ_a·[(1+f)·V4 − V1] (§2.4); specific thrust, TSFC, Isp, and the efficiencies don't depend on it."
          />
        )}
      </fieldset>
      <FuelSection engineType="scramjet" config={config} result={result} onChange={onChange} />
      <ScramjetAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="scramjet" />
    </div>
  );
}
