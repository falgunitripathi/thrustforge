import { fmt } from "../utils/format.js";

/**
 * Small ISA-atmosphere readout: static temperature, static pressure, air
 * density, and the local speed of sound at the current altitude — plus
 * flight speed for context. No new physics: `result.atmosphere` already
 * carries T_a/p_a/V_flight from `solveEngine` (Ref §1, ISA troposphere
 * relation); density and speed of sound are the standard closed-form
 * derivations from T_a/p_a using the cold-section gas constants already in
 * `config`.
 */
export default function AtmosphereReadout({ config, result }) {
  const { T_a, p_a, V_flight } = result.atmosphere;
  const R_c = (config.cp_c * (config.gamma_c - 1.0)) / config.gamma_c;
  const rho_a = p_a / (R_c * T_a);
  const speedOfSound = Math.sqrt(config.gamma_c * R_c * T_a);
  const mach = speedOfSound > 0 ? V_flight / speedOfSound : 0;

  return (
    <div className="performance-summary atmosphere-readout">
      <div className="perf-card">
        <span
          className="perf-label"
          title="ISA troposphere curve fit: T_a = 288.0 − 0.0065·altitude (Ref §1), evaluated at the configured altitude."
        >
          Static temperature T_a
        </span>
        <span className="perf-value">{fmt(T_a, 1)} <small>K</small></span>
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="ISA troposphere curve fit: p_a = (1.01325 − 1.12e-4·altitude + 3.8e-9·altitude²) × 10⁵ Pa (Ref §1), evaluated at the configured altitude."
        >
          Static pressure p_a
        </span>
        <span className="perf-value">{fmt(p_a / 1000, 2)} <small>kPa</small></span>
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="Ideal gas law: ρ_a = p_a / (R_c·T_a), with R_c = Cp_c·(γ_c−1)/γ_c from the cold-section gas properties on the left."
        >
          Air density ρ_a
        </span>
        <span className="perf-value">{fmt(rho_a, 3)} <small>kg/m³</small></span>
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="a = sqrt(γ_c·R_c·T_a) (Ref §2) — the local speed of sound at this altitude's static temperature."
        >
          Speed of sound a
        </span>
        <span className="perf-value">{fmt(speedOfSound, 1)} <small>m/s</small></span>
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="V = M∞·a — the configured flight Mach number times the local speed of sound a, above."
        >
          Flight speed V
        </span>
        <span className="perf-value">{fmt(V_flight, 1)} <small>m/s</small></span>
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="M = V/a, recomputed here from V and a as a self-consistency check — should exactly reproduce the configured flight Mach number."
        >
          Flight Mach (check)
        </span>
        <span className="perf-value">{fmt(mach, 3)}</span>
      </div>
    </div>
  );
}
