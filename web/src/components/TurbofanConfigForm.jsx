import { useState } from "react";
import CopyLinkButton from "./CopyLinkButton.jsx";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import FanSection from "./FanSection.jsx";
import CoreCompressorsSection from "./CoreCompressorsSection.jsx";
import TurbofanCombustorSection from "./TurbofanCombustorSection.jsx";
import TurbofanAdvancedSection from "./TurbofanAdvancedSection.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";
import AfterburnerSection from "./AfterburnerSection.jsx";
import TurbofanLayoutSection from "./TurbofanLayoutSection.jsx";
import { solveTurbofan } from "../physics/turbofan.js";

/**
 * The full turbofan configuration form — same layout/pattern as the
 * other engines' forms, reusing FlightConditionsSection as-is. Fan/
 * bypass, LPC/HPC, and combustor are new sections (see
 * aeropropsim/turbofan.py's module docstring for why the fan/LPC/HPC
 * are single-step components here, not stage-stacked like the
 * turbojet's). HPT/LPT and both nozzles' efficiencies live in Advanced,
 * same as the other engines' shaft/nozzle efficiency terms.
 */
export default function TurbofanConfigForm({ config, result, onChange, onReset, onCollapse, presetPicker }) {
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

      {presetPicker}
      <FlightConditionsSection config={config} onChange={onChange} machMin={0} machMax={2.0} machNote="Airliner turbofans cruise near Mach 0.8; low-bypass fighter turbofans reach about Mach 2." />
      <FanSection config={config} onChange={onChange} />
      <CoreCompressorsSection config={config} onChange={onChange} />
      <TurbofanCombustorSection config={config} onChange={onChange} />
      <TurbofanLayoutSection config={config} onChange={onChange} />
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
      {config.layout === "mixed" ? (
        <AfterburnerSection
          config={config}
          result={result}
          onChange={onChange}
          solve={solveTurbofan}
          tempKey="T08_ab"
          outSymbol="T011"
          inSymbol="T08"
          pOut="p011"
          pIn="p08"
          note="In this mixed-flow layout it sits after the mixer and re-heats the whole mixed stream — the textbook's afterburning turbofan, as in fighters like the F-15 and F-16."
        />
      ) : config.layout === "unmixed" ? (
        <AfterburnerSection
          config={config}
          result={result}
          onChange={onChange}
          solve={solveTurbofan}
          tempKey="T08_ab"
          outSymbol="T08"
          inSymbol="T07"
          pOut="p08"
          pIn="p07"
          note="Here it re-heats the core (hot) stream in the jet pipe after the low-pressure turbine; the bypass air is untouched. Real afterburning fighter turbofans usually mix the two streams first — try the Mixed-flow layout."
        />
      ) : null}
      <FuelSection engineType="turbofan" config={config} result={result} onChange={onChange} />
      <TurbofanAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="turbofan" />
    </div>
  );
}
