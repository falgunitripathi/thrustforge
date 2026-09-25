import { useState } from "react";
import CopyLinkButton from "./CopyLinkButton.jsx";
import NumberField from "./NumberField.jsx";
import SelectField from "./SelectField.jsx";
import FuelSection from "./FuelSection.jsx";
import RamjetAdvancedSection from "./RamjetAdvancedSection.jsx";
import FormulasExport from "./FormulasExport.jsx";
import { fmt } from "../utils/format.js";

/** One collapsible config section — same markup as every other engine's. */
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {title}
        </button>
      </legend>
      {open && children}
    </fieldset>
  );
}

/**
 * The full ramjet configuration form — same layout as the scramjet's.
 * No compressor/turbine sections: a ramjet has no rotating machinery
 * (aeropropsim/ramjet.py). `result` is null whenever the solve failed;
 * the live readouts below are guarded so the form stays usable.
 */
export default function RamjetConfigForm({ config, result, onChange, onReset, onCollapse }) {
  const T02 = result?.intake?.T02;
  const ramPR = result?.intake?.ram_pressure_ratio;
  const choked = result?.nozzle?.choked;

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

      <Section title="Flight condition" defaultOpen>
        <NumberField
          label="Altitude"
          value={config.altitude_m}
          onChange={(v) => onChange({ altitude_m: v })}
          min={0}
          max={11000}
          step={100}
          hint="m — T_a = 288 − 0.0065·z, ISA troposphere curve-fit. Above 11 km isn't modeled."
        />
        <NumberField
          label="Flight Mach number M"
          value={config.mach_flight}
          onChange={(v) => onChange({ mach_flight: v })}
          min={0.3}
          max={6.0}
          step={0.1}
          hint="M = how many times the speed of sound the vehicle is flying. A ramjet has no compressor, so this is its ONLY way to squeeze the air: faster flight means more ram compression. It can't start from rest (zero static thrust) and works best between about Mach 2 and 5. Real ramjets are boosted up to speed by a rocket or a carrier aircraft."
        />
        {Number.isFinite(ramPR) && (
          <p className="section-note">
            Ram pressure ratio right now: <strong>p02/p_a = {fmt(ramPR, 2)}</strong> — the
            intake alone squeezes the air this much, with no moving parts.
          </p>
        )}
      </Section>

      <Section title="Combustor" defaultOpen>
        <NumberField
          label="Combustor exit temperature T04"
          value={config.T04}
          onChange={(v) => onChange({ T04: v })}
          min={1000}
          max={2400}
          step={10}
          hint="K — T04 = the hot-gas temperature leaving the combustor. With no turbine blades downstream to melt, a ramjet can run much hotter than a turbojet: about 1500-2000 K is typical and roughly 2273 K (2000 °C) is the practical limit. The fuel-air ratio is solved from it: f = (Cp_h·T04 − Cp_c·T02)/(η_b·Q_R − Cp_h·T04). T04 must stay above T02, the air temperature the intake delivers, which climbs quickly with flight Mach."
        />
        <p className="section-note">
          {Number.isFinite(T02)
            ? <>Air arrives from the intake at <strong>T02 = {fmt(T02, 0)} K</strong> — ram heating alone, before any fuel burns.</>
            : <>No valid solution at these settings — see the message on the right.</>}
        </p>
      </Section>

      <Section title="Nozzle">
        <SelectField
          label="Nozzle type"
          value={config.nozzle_type}
          onChange={(v) => onChange({ nozzle_type: v })}
          options={[
            { value: "expanded", label: "Convergent-divergent (fully expanded)" },
            { value: "convergent", label: "Convergent only" },
          ]}
        />
        <p className="section-note">
          {config.nozzle_type === "expanded"
            ? "The nozzle narrows then widens again, so the gas expands all the way down to the outside air pressure — every bit of pressure becomes speed. This is what real supersonic ramjets use."
            : choked
              ? "Choked: the gas leaves at exactly Mach 1, still above outside air pressure. That leftover pressure pushes a little (pressure thrust) but most of it is wasted — compare the thrust with the convergent-divergent nozzle."
              : "Not choked at this speed, so the gas still expands to outside air pressure and this matches the convergent-divergent nozzle. Fly faster (above about Mach 1.5) to see it choke."}
        </p>
      </Section>

      <Section title="Mass flow">
        <NumberField
          label="Air mass flow rate"
          value={config.mdot_a}
          onChange={(v) => onChange({ mdot_a: v })}
          min={0.01}
          max={2000}
          step={1}
          hint="kg/s — ṁ_a = mass of air swallowed by the intake per second. Only scales absolute thrust, T = ṁ_a·(T/ṁ_a); specific thrust, TSFC, and the efficiencies don't depend on it."
        />
      </Section>

      <FuelSection engineType="ramjet" config={config} result={result} onChange={onChange} />
      <RamjetAdvancedSection config={config} onChange={onChange} />
      <FormulasExport engineType="ramjet" />
    </div>
  );
}
