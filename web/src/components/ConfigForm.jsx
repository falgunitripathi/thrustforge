import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import CompressorSection from "./CompressorSection.jsx";
import CombustorSection from "./CombustorSection.jsx";
import TurbineSection from "./TurbineSection.jsx";
import NozzleSection from "./NozzleSection.jsx";
import AdvancedSection from "./AdvancedSection.jsx";
import FuelSection from "./FuelSection.jsx";
import ReportExport from "./ReportExport.jsx";
import FormulasExport from "./FormulasExport.jsx";
import { buildShareUrl } from "../utils/shareLink.js";

/**
 * The full engine-configuration form: flight condition, compressor,
 * combustor, turbine, nozzle, mass flow, and an advanced/collapsed
 * section for design-value defaults and gas properties.
 *
 * `config` is an EngineConfig-shaped plain object (see
 * physics/engine.js `defaultEngineConfig`); `onChange` receives a partial
 * patch to merge in, mirroring the parent's state-update pattern.
 */
export default function ConfigForm({ config, result, onChange, onReset, onCollapse }) {
  const [copied, setCopied] = useState(false);
  const [massFlowOpen, setMassFlowOpen] = useState(false);

  // Phase 3 — shareable configuration links: every field here already
  // lives in the URL's query string (see utils/shareLink.js + App.jsx),
  // so "copy link" just needs to grab the current address bar value.
  const copyShareLink = async () => {
    const url = buildShareUrl(config);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context);
      // fall back to a prompt the user can copy from by hand.
      try {
        window.prompt("Copy this link:", url);
      } catch {
        // Some embedded browsers block prompt() too; the address bar
        // already holds the same link, so there's nothing more to do.
      }
    }
  };

  return (
    <div className="config-form">
      <div className="config-form-header">
        <h2>Engine configuration</h2>
        <div className="config-form-actions">
          <button type="button" className="reset-button" onClick={copyShareLink}>
            {copied ? "Link copied!" : "Copy shareable link"}
          </button>
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
      <FlightConditionsSection config={config} onChange={onChange} machMin={0} machMax={3.0} machNote="Turbojets reach about Mach 3 (the SR-71's J58 engines cruised near Mach 3.2); faster than that, ram heating leaves the turbine unable to drive the compressor." />
      <CompressorSection config={config} onChange={onChange} />
      <CombustorSection config={config} onChange={onChange} />
      <TurbineSection config={config} onChange={onChange} />
      <NozzleSection config={config} onChange={onChange} />
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
      <FuelSection engineType="turbojet" config={config} result={result} onChange={onChange} />
      <AdvancedSection config={config} onChange={onChange} />
      {result && <ReportExport config={config} result={result} />}
      <FormulasExport engineType="turbojet" />
    </div>
  );
}
