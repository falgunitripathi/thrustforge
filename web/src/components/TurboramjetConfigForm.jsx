import { useState } from "react";
import NumberField from "./NumberField.jsx";
import SelectField from "./SelectField.jsx";
import FuelSection from "./FuelSection.jsx";
import FormulasExport from "./FormulasExport.jsx";
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

const MODE_OPTIONS = [
  { value: "auto", label: "Auto — switch at a set Mach" },
  { value: "turbojet", label: "Turbojet only" },
  { value: "ramjet", label: "Ramjet only" },
  { value: "dual", label: "Both at once (split the air)" },
];

/**
 * The turboramjet configuration form — flight, operating mode, each
 * leg's own settings, fuel, and engine quality. `result` is null whenever
 * the solve failed; readouts here are guarded so the form stays usable.
 */
export default function TurboramjetConfigForm({ config, result, onChange, onReset, onCollapse }) {
  const active = result?.mode_active;
  const tj = result?.turbojet;

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
          min={0}
          max={5}
          step={0.1}
          hint="M = how many times the speed of sound the vehicle is flying. The turbojet leg works from standstill (it can take off); the ramjet leg needs speed and works best from about Mach 2.5 to 5. A turboramjet uses each where it's strongest."
        />
      </Section>

      <Section title="Operating mode" defaultOpen>
        <SelectField
          label="Mode"
          value={config.mode}
          onChange={(v) => onChange({ mode: v })}
          options={MODE_OPTIONS}
        />
        {config.mode === "auto" && (
          <NumberField
            label="Switch Mach number"
            value={config.mach_switch}
            onChange={(v) => onChange({ mach_switch: v })}
            min={1}
            max={4}
            step={0.1}
            hint="Below this flight Mach the engine runs as a turbojet, at or above it as a ramjet. There's no formula for the best switch point — it's a design choice. Mach 3 is the textbook figure: the SR-71's engines changed character near Mach 3, and the planned SR-72 hands over from turbine to ramjet at about Mach 3. Open the 'Turbojet vs ramjet' chart on the right to see where the fuel-use curves cross for your design."
          />
        )}
        {config.mode === "dual" && (
          <NumberField
            label="Air through the turbojet β"
            value={config.beta}
            onChange={(v) => onChange({ beta: v })}
            min={0.05}
            max={0.95}
            step={0.05}
            hint="β = (ṁ_a)_TJ / ṁ_a — the fraction of the captured air sent through the turbojet; the rest goes through the ramjet duct. Both thrusts add: T = ṁ_a·[β·(T/ṁ_a)_TJ + (1−β)·(T/ṁ_a)_RJ]. Real engines blend the two like this during the hand-over."
          />
        )}
        {active && (
          <p className="section-note">
            Running right now as: <strong>{active === "dual" ? "turbojet + ramjet" : active}</strong>
            {config.mode === "auto" && ` (flight Mach ${fmt(config.mach_flight, 1)} is ${active === "turbojet" ? "below" : "at or above"} the switch Mach ${fmt(config.mach_switch, 1)})`}.
          </p>
        )}
      </Section>

      <Section title="Turbojet leg" defaultOpen>
        <NumberField
          label="Compressor pressure ratio π_c"
          value={config.pi_c}
          onChange={(v) => onChange({ pi_c: v })}
          min={1.5}
          max={30}
          step={0.5}
          hint="π_c = p03/p02. T03 = T02·[1 + (π_c^((γ_c−1)/γ_c) − 1)/η_c]. At high flight Mach the air already arrives hot from ram compression, so a high π_c soon pushes T03 above the turbine limit — high-speed turbojets like the SR-71's J58 use a modest π_c (about 8)."
        />
        <NumberField
          label="Turbine inlet temperature T04"
          value={config.T04}
          onChange={(v) => onChange({ T04: v })}
          min={900}
          max={2000}
          step={10}
          hint="K — T04 = gas temperature entering the turbine, limited by what the turbine blades can survive. The fuel-air ratio f is solved from it."
        />
        <SelectField
          label="Afterburner"
          value={config.afterburner_on ? "on" : "off"}
          onChange={(v) => onChange({ afterburner_on: v === "on" })}
          options={[
            { value: "on", label: "On (reheat lit)" },
            { value: "off", label: "Off" },
          ]}
        />
        {config.afterburner_on && (
          <NumberField
            label="Afterburner exit temperature T06"
            value={config.T06_ab}
            onChange={(v) => onChange({ T06_ab: v })}
            min={1000}
            max={2400}
            step={10}
            hint="K — a second burner after the turbine re-heats the gas to T06 before the nozzle. There's no turbine downstream, so it can run much hotter than T04. Extra fuel: f_ab = (1+f)·(Cp_h·T06 − Cp_h·T05)/(η_b·Q_R − Cp_h·T06). More thrust, but a lot more fuel."
          />
        )}
        {tj && (
          <p className="section-note">
            Compressor delivers <strong>T03 = {fmt(tj.T03, 0)} K</strong>; turbine exit <strong>T05 = {fmt(tj.T05, 0)} K</strong>.
          </p>
        )}
      </Section>

      <Section title="Ramjet leg">
        <NumberField
          label="Ramjet combustor exit temperature T09"
          value={config.T09}
          onChange={(v) => onChange({ T09: v })}
          min={1000}
          max={2400}
          step={10}
          hint="K — T09 = gas temperature leaving the ramjet combustor. No turbine to protect, so about 1500-2000 K is typical. The ramjet's fuel-air ratio f_R is solved from it."
        />
      </Section>

      <Section title="Mass flow">
        <NumberField
          label="Air mass flow rate"
          value={config.mdot_a}
          onChange={(v) => onChange({ mdot_a: v })}
          min={0.01}
          max={2000}
          step={1}
          hint="kg/s — total air captured by the shared intake. Only scales absolute thrust; specific thrust, TSFC and the efficiencies don't depend on it."
        />
      </Section>

      <FuelSection engineType="turboramjet" config={config} result={result} onChange={onChange} />

      <Section title="Engine quality: efficiencies & gas properties" advanced>
        <p className="section-intro-note">
          These describe how well the engine&rsquo;s own hardware is built and the air/gas it works with
          &mdash; not the fuel, which has its own section above. They start at typical textbook values.
        </p>
        <div className="advanced-grid">
          <NumberField label="Intake efficiency η_d" value={config.eta_d}
            onChange={(v) => onChange({ eta_d: v })} min={0.5} max={1.0} step={0.01}
            hint="η_d = intake efficiency, shared by both legs: p02 = p_a·(1 + η_d·(γ_c−1)/2·M²)^(γ_c/(γ_c−1))." />
          <NumberField label="Compressor efficiency η_c" value={config.eta_c}
            onChange={(v) => onChange({ eta_c: v })} min={0.5} max={1.0} step={0.01}
            hint="η_c = overall compressor isentropic efficiency (typically 0.85-0.90)." />
          <NumberField label="Turbine efficiency η_t" value={config.eta_t}
            onChange={(v) => onChange({ eta_t: v })} min={0.5} max={1.0} step={0.01}
            hint="η_t = turbine isentropic efficiency. The turbine only has to drive the compressor: Cp_c·(T03−T02) = η_m·(1+f)·Cp_h·(T04−T05)." />
          <NumberField label="Mechanical efficiency η_m" value={config.eta_m}
            onChange={(v) => onChange({ eta_m: v })} min={0.8} max={1.0} step={0.01}
            hint="η_m = fraction of the turbine's work that reaches the compressor through the shaft." />
          <NumberField label="Combustor efficiency η_b" value={config.eta_b}
            onChange={(v) => onChange({ eta_b: v })} min={0.5} max={1.0} step={0.01}
            hint="η_b = burner efficiency, used for the main combustor, the afterburner and the ramjet combustor." />
          <NumberField label="Combustor Δp loss" value={config.delta_p_cc_pct}
            onChange={(v) => onChange({ delta_p_cc_pct: v })} min={0} max={0.2} step={0.005}
            hint="fraction — pressure lost in the main and ramjet combustors: p_out = p_in·(1 − Δp)." />
          <NumberField label="Afterburner Δp loss" value={config.delta_p_ab_pct}
            onChange={(v) => onChange({ delta_p_ab_pct: v })} min={0} max={0.2} step={0.005}
            hint="fraction — p06 = p05·(1 − Δp_ab), only when the afterburner is on." />
          <NumberField label="Nozzle efficiency η_N" value={config.eta_N}
            onChange={(v) => onChange({ eta_N: v })} min={0.5} max={1.0} step={0.01}
            hint="η_N = nozzle efficiency, both nozzles. Both are fully expanded to outside air pressure." />
          <NumberField label="Cold section γ_c" value={config.gamma_c}
            onChange={(v) => onChange({ gamma_c: v })} min={1.2} max={1.5} step={0.001}
            hint="γ_c = ratio of specific heats for the air upstream of the combustors" />
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

      <FormulasExport engineType="turboramjet" />
    </div>
  );
}
