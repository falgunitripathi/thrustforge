import { useState } from "react";
import NumberField from "./NumberField.jsx";
import { fuelsForEngine, selectedFuel } from "../utils/fuels.js";
import { fmt } from "../utils/format.js";

/**
 * Fuel picker shared by every engine. Picking a fuel sets Q_R (see
 * utils/fuels.js for why gamma/Cp stay put) plus fuel_id, which only the
 * UI reads — the solvers ignore it.
 */
export default function FuelSection({ engineType, config, result, onChange }) {
  const [open, setOpen] = useState(true);
  const fuels = fuelsForEngine(engineType);
  const fuel = selectedFuel(engineType, config);
  const selectValue = fuel ? fuel.id : "custom";

  const f = result?.performance?.f;
  const phi = fuel && Number.isFinite(f) ? f / fuel.f_stoich : null;

  function choose(id) {
    const next = fuels.find((x) => x.id === id);
    onChange(next ? { Q_R: next.Q_R, fuel_id: id } : { fuel_id: "custom" });
  }

  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Fuel
        </button>
      </legend>
      {open && (
        <>
          <label className="field">
            <span className="field-label">Fuel type</span>
            <select value={selectValue} onChange={(e) => choose(e.target.value)}>
              {fuels.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
              <option value="custom">Custom heating value…</option>
            </select>
          </label>

          {fuel ? (
            <div className="fuel-card">
              <p className="fuel-card-note">{fuel.note}</p>
              <p className="fuel-card-row">
                Heating value Q<sub>R</sub>: <strong>{fmt(fuel.Q_R / 1e6, 2)} MJ/kg</strong>
              </p>
              <p className="fuel-card-row">
                Stoichiometric fuel-air ratio: <strong>{fmt(fuel.f_stoich, 4)}</strong>
                <span className="fuel-card-muted"> — the exact amount of fuel that uses up all the air&rsquo;s oxygen</span>
              </p>
              {phi !== null && (
                <p className={`fuel-card-row${phi > 1 ? " fuel-card-warn" : ""}`}>
                  Equivalence ratio φ = f / f<sub>stoich</sub>: <strong>{fmt(phi, 2)}</strong>
                  <span className="fuel-card-muted">
                    {phi > 1
                      ? " — richer than stoichiometric: there isn't enough oxygen to burn all this fuel, but this simple model still counts its full heat, so results here overstate performance."
                      : engineType === "scramjet"
                        ? ` — lean: only ${fmt(phi * 100, 0)}% of the air's oxygen gets used. Raise f to burn more of it, until the combustor thermally chokes.`
                        : ` — lean (${fmt((1 - phi) * 100, 0)}% more air than the fuel needs), which is normal: real engines run lean to keep the turbine and liner cool.`}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <NumberField
              label="Fuel heating value Q_R"
              value={config.Q_R}
              onChange={(v) => onChange({ Q_R: v })}
              min={1.0e7}
              max={1.5e8}
              step={1.0e5}
              hint="J/kg — Q_R = the heat released by burning 1 kg of fuel (its lower heating value). Kerosene is about 43,000,000; hydrogen about 121,000,000."
            />
          )}
        </>
      )}
    </fieldset>
  );
}
