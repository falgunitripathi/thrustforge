import { useMemo, useState } from "react";
import NumberField from "./NumberField.jsx";
import { fmt } from "../utils/format.js";

/**
 * Afterburner on/off switch plus its two settings, shared by every engine
 * that has one. `solve` is that engine's own solver: the section re-solves
 * the same design with the afterburner off to show what lighting it buys
 * (thrust gain vs extra fuel). Station names differ per engine: the
 * turbojet re-heats 5 -> 6 (config key T06_ab), the turbofan's core jet
 * pipe 7 -> 8 (T08_ab), so `tempKey`, `outSymbol` and `inSymbol` say which.
 */
export default function AfterburnerSection({
  config, result, onChange, solve, note,
  tempKey = "T06_ab", outSymbol = "T06", inSymbol = "T05", pOut = "p06", pIn = "p05",
}) {
  const [open, setOpen] = useState(true);
  const on = !!config.afterburner_on;

  const comparison = useMemo(() => {
    if (!on || !result) return null;
    try {
      const off = solve({ ...config, afterburner_on: false }).performance;
      const p = result.performance;
      return {
        thrustGain: p.thrust / off.thrust - 1,
        fuelRatio: (p.thrust * p.tsfc) / (off.thrust * off.tsfc),
      };
    } catch {
      return null;
    }
  }, [on, result, config, solve]);

  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Afterburner
        </button>
      </legend>
      {open && (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            className={`ab-switch${on ? " ab-switch-on" : ""}`}
            onClick={() => onChange({ afterburner_on: !on })}
          >
            <span className="ab-switch-track" aria-hidden="true"><span className="ab-switch-thumb" /></span>
            <span className="ab-switch-text">
              {on ? "Afterburner ON — reheat lit" : "Afterburner OFF — click to light it"}
            </span>
          </button>
          <p className="section-note">
            An afterburner is a second combustor between the turbine and the nozzle. There are no turbine
            blades after it to protect, so it can re-heat the exhaust far hotter than the turbine inlet
            temperature, giving a big thrust boost for take-off, combat or supersonic dash, at the cost of
            burning fuel very fast.{note ? ` ${note}` : ""}
          </p>
          {on && (
            <>
              <NumberField
                label={`Afterburner exit temperature ${outSymbol}`}
                value={config[tempKey]}
                onChange={(v) => onChange({ [tempKey]: v })}
                min={1000}
                max={2400}
                step={10}
                hint={`K — ${outSymbol} = the gas temperature leaving the afterburner (the cycle's maximum). It must be above the turbine exit temperature ${inSymbol}. Extra fuel: f_ab = (1+f)·(Cp_h·${outSymbol} − Cp_h·${inSymbol})/(η_b·Q_R − Cp_h·${outSymbol}). About 1900-2200 K is typical.`}
              />
              <NumberField
                label="Afterburner Δp loss"
                value={config.delta_p_ab_pct}
                onChange={(v) => onChange({ delta_p_ab_pct: v })}
                min={0}
                max={0.2}
                step={0.005}
                hint={`fraction — ${pOut} = ${pIn}·(1 − Δp_ab). The flame holders and the heat addition itself cost some total pressure; a few percent is typical.`}
              />
              {comparison && (
                <p className="section-note">
                  Lighting it gives <strong>{comparison.thrustGain >= 0 ? "+" : ""}{fmt(comparison.thrustGain * 100, 0)}% thrust</strong> for{" "}
                  <strong>{fmt(comparison.fuelRatio, 1)}× the fuel flow</strong> of the same engine with it off.
                </p>
              )}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
