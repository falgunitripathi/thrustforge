import { useState } from "react";
import NumberField from "./NumberField.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import { fmt } from "../utils/format.js";

/**
 * Engine sizing: "what air mass flow, nozzle exit area, and fuel flow do I
 * need to hit a target thrust?" — answered as pure linear scaling of the
 * already-solved result, not a re-solve. `mdot_a` only enters the cycle
 * solve at the very last step (nozzle area and absolute thrust); every
 * other computed quantity (temperatures, pressures, the fuel-air ratio f,
 * exit velocity, all efficiencies) is independent of it. So scaling
 * `mdot_a` by `target / current thrust` scales thrust, nozzle area, and
 * fuel flow by exactly the same factor, with zero new physics.
 */
export default function EngineSizing({ config, result }) {
  const currentThrust = result.performance.thrust;
  const [targetThrust, setTargetThrust] = useState(Math.round(currentThrust));

  const valid = Number.isFinite(targetThrust) && targetThrust > 0 && currentThrust > 0;
  const scale = valid ? targetThrust / currentThrust : null;
  const requiredMdotA = valid ? config.mdot_a * scale : null;
  const requiredAExit = valid ? result.nozzle.A_exit * scale : null;
  const requiredMdotF = valid ? (result.performance.f_total ?? result.performance.f) * requiredMdotA : null;

  return (
    <ExpandableSection
      title="Engine sizing"
      summary="Target a specific thrust and see the air mass flow, nozzle exit area, and fuel flow this design would need — pure scaling of the current result, no re-solve. Expand to size it."
    >
      <p className="section-note">
        Every quantity on the left except air mass flow (temperatures,
        pressures, the fuel-air ratio, exit velocity, all efficiencies) is
        independent of scale — only thrust, nozzle area, and fuel flow
        scale with it. So hitting a target thrust is just scaling the
        current air mass flow by target ÷ current thrust; the rest of the
        cycle is unchanged.
      </p>
      <div className="sweep-controls">
        <NumberField
          label="Target thrust"
          value={Number.isFinite(targetThrust) ? targetThrust : ""}
          onChange={setTargetThrust}
          min={0}
          step={10}
          hint="N"
        />
      </div>
      {!valid ? (
        <p className="section-note">Enter a positive target thrust.</p>
      ) : (
        <div className="performance-summary">
          <div className="perf-card">
            <span className="perf-label" title="scale = target thrust / current thrust — the single factor every mdot_a-proportional quantity below is scaled by.">
              Scale factor
            </span>
            <span className="perf-value">{fmt(scale, 3)}×</span>
          </div>
          <div className="perf-card">
            <span className="perf-label" title="required mdot_a = (current mdot_a) × scale — thrust is linear in mdot_a with everything else on the left held fixed, so this is the only re-solve needed.">
              Required air mass flow
            </span>
            <span className="perf-value">{fmt(requiredMdotA, 3)} <small>kg/s</small></span>
          </div>
          <div className="perf-card">
            <span className="perf-label" title="required A_exit = (current nozzle exit area) × scale — exit area scales with mass flow to keep the same exit Mach/velocity and all other cycle numbers unchanged.">
              Required nozzle exit area
            </span>
            <span className="perf-value">{fmt(requiredAExit, 4)} <small>m²</small></span>
          </div>
          <div className="perf-card">
            <span className="perf-label" title="required mdot_f = f × required mdot_a — the fuel-air ratio f is independent of scale, so fuel flow scales with air mass flow exactly like thrust does.">
              Required fuel flow
            </span>
            <span className="perf-value">{fmt(requiredMdotF, 4)} <small>kg/s</small></span>
          </div>
          <div className="perf-card">
            <span className="perf-label" title="Same required fuel flow as above, × 3600 s/h.">
              Required fuel flow
            </span>
            <span className="perf-value">{fmt(requiredMdotF * 3600, 1)} <small>kg/h</small></span>
          </div>
          <div className="perf-card">
            <span className="perf-label">Current air mass flow</span>
            <span className="perf-value">{fmt(config.mdot_a, 3)} <small>kg/s</small></span>
          </div>
        </div>
      )}
    </ExpandableSection>
  );
}
