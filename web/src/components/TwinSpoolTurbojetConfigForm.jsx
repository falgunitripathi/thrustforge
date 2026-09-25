import { useState } from "react";
import NumberField from "./NumberField.jsx";
import FlightConditionsSection from "./FlightConditionsSection.jsx";
import AfterburnerSection from "./AfterburnerSection.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";
import { solveTwinSpoolTurbojet } from "../physics/twinSpoolTurbojet.js";
import { fmt } from "../utils/format.js";

function Section({ title, defaultOpen = false, advanced = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className={`config-section${advanced ? " advanced" : ""}`}>
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {title}
        </button>
      </legend>
      {open && children}
    </fieldset>
  );
}

/** Configuration form for the two-spool turbojet (aeropropsim/twin_spool_turbojet.py). */
export default function TwinSpoolTurbojetConfigForm({ config, result, onChange, onReset, onCollapse }) {
  const opr = config.pi_LPC * config.pi_HPC;
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

      <FlightConditionsSection config={config} onChange={onChange} machMin={0} machMax={3.0}
        machNote="Two-spool turbojets powered Concorde (Mach 2) and the B-52; like any turbojet they run out of turbine work above about Mach 3." />

      <Section title="LP spool (outer shaft)" defaultOpen>
        <NumberField
          label="LP compressor pressure ratio π_LPC"
          value={config.pi_LPC}
          onChange={(v) => onChange({ pi_LPC: v })}
          min={1.2}
          max={8}
          step={0.1}
          hint="p03 = π_LPC·p02, T03 = T02·[1 + (π_LPC^((γ_c−1)/γ_c) − 1)/η_LPC]. The LP compressor sits at the front on the outer shaft, turned by the LP turbine at the back."
        />
        <NumberField
          label="LP compressor efficiency η_LPC"
          value={config.eta_LPC}
          onChange={(v) => onChange({ eta_LPC: v })}
          min={0.6}
          max={1.0}
          step={0.01}
          hint="isentropic efficiency of the LP compressor"
        />
        <NumberField
          label="LP turbine efficiency η_LPT"
          value={config.eta_LPT}
          onChange={(v) => onChange({ eta_LPT: v })}
          min={0.6}
          max={1.0}
          step={0.01}
          hint="The LP turbine drives only the LP compressor: Cp_c·(T03−T02) = λ2·(1+f)·η_m2·Cp_h·(T06−T07)."
        />
      </Section>

      <Section title="HP spool (inner shaft)" defaultOpen>
        <NumberField
          label="HP compressor pressure ratio π_HPC"
          value={config.pi_HPC}
          onChange={(v) => onChange({ pi_HPC: v })}
          min={1.2}
          max={10}
          step={0.1}
          hint="p04 = π_HPC·p03. The HP compressor and HP turbine share the inner shaft, which spins faster than the LP one — the point of two spools is that each compressor can turn at its own best speed."
        />
        <NumberField
          label="HP compressor efficiency η_HPC"
          value={config.eta_HPC}
          onChange={(v) => onChange({ eta_HPC: v })}
          min={0.6}
          max={1.0}
          step={0.01}
          hint="isentropic efficiency of the HP compressor"
        />
        <NumberField
          label="HP turbine efficiency η_HPT"
          value={config.eta_HPT}
          onChange={(v) => onChange({ eta_HPT: v })}
          min={0.6}
          max={1.0}
          step={0.01}
          hint="The HP turbine drives only the HP compressor: Cp_c·(T04−T03) = λ1·(1+f)·η_m1·Cp_h·(T05−T06)."
        />
        <p className="section-note">Overall pressure ratio π_LPC·π_HPC = <strong>{fmt(opr, 2)}</strong>.</p>
      </Section>

      <Section title="Combustor" defaultOpen>
        <NumberField
          label="Turbine inlet temperature T05"
          value={config.T05}
          onChange={(v) => onChange({ T05: v })}
          min={900}
          max={2000}
          step={10}
          hint="K — the gas temperature leaving the combustor and entering the HP turbine, limited by the turbine blades. The fuel-air ratio is solved from it: f = [(Cp_h/Cp_c)(T05/T04) − 1]/[η_b·Q_R/(Cp_c·T04) − (Cp_h/Cp_c)(T05/T04)]."
        />
        {result && (
          <p className="section-note">
            Compressors deliver <strong>T04 = {fmt(result.hpc.T04, 0)} K</strong>; the gas leaves the LP turbine at{" "}
            <strong>T07 = {fmt(result.lpt.T07, 0)} K</strong>.
          </p>
        )}
      </Section>

      <Section title="Mass flow">
        <NumberField
          label="Air mass flow rate"
          value={config.mdot_a}
          onChange={(v) => onChange({ mdot_a: v })}
          min={0.01}
          max={2000}
          step={1}
          hint="kg/s — only scales absolute thrust; specific thrust, TSFC and the efficiencies don't depend on it."
        />
      </Section>

      <AfterburnerSection
        config={config}
        result={result}
        onChange={onChange}
        solve={solveTwinSpoolTurbojet}
        tempKey="T08_ab"
        outSymbol="T08"
        inSymbol="T07"
        pOut="p08"
        pIn="p07"
        note="Here it sits in the jet pipe after the LP turbine, as on Concorde's Olympus 593."
      />
      <FuelSection engineType="turbojet2" config={config} result={result} onChange={onChange} />

      <Section title="Engine quality: efficiencies & gas properties" advanced>
        <p className="section-intro-note">
          These describe how well the engine&rsquo;s own hardware is built and the air/gas it works with
          &mdash; not the fuel, which has its own section above. They start at typical textbook values.
        </p>
        <div className="advanced-grid">
          <NumberField label="Intake efficiency η_d" value={config.eta_d}
            onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
            hint="η_d = intake efficiency: p02 = p_a·(1 + η_d·(γ_c−1)/2·M²)^(γ_c/(γ_c−1))." />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="η_b = burner efficiency (main combustor and afterburner)." />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.005}
            hint="fraction — p05 = p04·(1 − Δp_cc)." />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="η_N = nozzle efficiency (convergent nozzle, choking checked)." />
          <NumberField label="HP spool mechanical efficiency η_m1" value={config.eta_m1}
            onChange={(v) => onChange({ eta_m1: v })} min={0.8} max={1.0} step={0.005}
            hint="Fraction of the HP turbine's work reaching the HP compressor; the source gives about 99%." />
          <NumberField label="LP spool mechanical efficiency η_m2" value={config.eta_m2}
            onChange={(v) => onChange({ eta_m2: v })} min={0.8} max={1.0} step={0.005}
            hint="Fraction of the LP turbine's work reaching the LP compressor." />
          <NumberField label="HP work share λ1" value={config.lambda1}
            onChange={(v) => onChange({ lambda1: v })} min={0.5} max={1.0} step={0.01}
            hint="λ1 = share of the HP turbine's power that goes to the HP compressor: W_HPC = λ1·η_m1·W_HPT. The source gives 75-80%." />
          <NumberField label="LP work share λ2" value={config.lambda2}
            onChange={(v) => onChange({ lambda2: v })} min={0.5} max={1.0} step={0.01}
            hint="λ2 = share of the LP turbine's power that goes to the LP compressor: W_LPC = λ2·η_m2·W_LPT." />
          <NumberField label="Cold section γ_c" value={config.gamma_c}
            onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001}
            hint="γ_c = ratio of specific heats for the air upstream of the combustor" />
          <NumberField label="Cold section Cp_c" value={config.cp_c}
            onChange={(v) => onChange({ cp_c: v })} min={800} max={1200} step={1}
            hint="J/(kg·K) — Cp_c = specific heat of the incoming air" />
          <NumberField label="Hot section γ_h" value={config.gamma_h}
            onChange={(v) => onChange({ gamma_h: v })} min={1.2} max={1.45} step={0.001}
            hint="γ_h = ratio of specific heats for the hot combustion gas" />
          <NumberField label="Hot section Cp_h" value={config.cp_h}
            onChange={(v) => onChange({ cp_h: v })} min={900} max={1400} step={1}
            hint="J/(kg·K) — Cp_h = specific heat of the hot combustion gas" />
        </div>
      </Section>

      <FormulasExport engineType="turbojet2" />
    </div>
  );
}
