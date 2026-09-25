import { useMemo, useState } from "react";
import { solveEngine } from "../physics/engine.js";
import { lockDesignPoint, solveOffDesign, OffDesignError } from "../physics/offDesign.js";
import ExpandableSection from "./ExpandableSection.jsx";
import SweepChart from "./SweepChart.jsx";
import { downloadCsv } from "../utils/csv.js";
import { fmt, tsfcPerHour } from "../utils/format.js";

let nextId = 1;
function segment(label, altitude_m, mach_flight, duration_min, T04_target) {
  return { id: nextId++, label, altitude_m, mach_flight, duration_min, T04_target };
}

const DEFAULT_SEGMENTS = [
  segment("Takeoff", 0, 0.25, 2, 1400),
  segment("Climb", 5000, 0.6, 15, 1400),
  segment("Cruise", 11000, 0.85, 60, 1250),
  segment("Descent", 3000, 0.5, 20, 950),
];

/** Build a step-function timeline for one output: two points per segment
 *  (start, end) at the same value, so consecutive points drawn as a
 *  straight line produce flat segments with a vertical jump between them —
 *  no extra charting code needed, `SweepChart` already just connects
 *  points in order. */
function buildTimeline(rows, valueFn) {
  const xValues = [];
  const yValues = [];
  for (const row of rows) {
    const v = row.valid ? valueFn(row) : null;
    xValues.push(row.tStart, row.tEnd);
    yValues.push(v, v);
  }
  return { xValues, yValues };
}

/**
 * 🚀 Mission analysis — a multi-segment flight profile (takeoff → climb →
 * cruise → descent, or whatever the user defines).
 *
 * This is FIXED hardware flying the mission — the compressor wheel, the
 * turbine, the nozzle throat are whatever the current engine configuration
 * (on the left) sizes them to, locked at that one design point. As
 * altitude, Mach, and throttle (T04 target) change segment to segment, the
 * engine's actual operating point is found by component-map matching
 * (`offDesign.lockDesignPoint`/`solveOffDesign` — see that module for the
 * method), NOT by re-solving a fresh "design" cycle at each condition the
 * way this panel originally did. That distinction is exactly what makes
 * the mass flow, thrust, and fuel flow below throttle-dependent instead of
 * only altitude/Mach-dependent: a real engine's air mass flow through a
 * fixed nozzle throat is an OUTPUT of the matching, not a fixed input.
 *
 * Off-design matching (v1) only covers an axial-compressor, convergent-
 * nozzle design point whose nozzle chokes at the design condition — see
 * `lockDesignPoint`'s own preconditions. When the current configuration
 * doesn't satisfy them, this panel falls back to the original per-segment
 * fresh-design-cycle re-solve (clearly labeled below) rather than refusing
 * to show anything.
 */
export default function MissionAnalysis({ config }) {
  const [segments, setSegments] = useState(DEFAULT_SEGMENTS);

  const updateSegment = (id, field, value) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };
  const removeSegment = (id) => {
    setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };
  const addSegment = () => {
    setSegments((prev) => [...prev, segment("New segment", 5000, 0.6, 10, config.T04)]);
  };

  // Lock the current configuration's design point once per config change.
  // A config that doesn't satisfy off-design matching's v1 preconditions
  // (non-axial compressor, non-convergent nozzle, or an unchoked design
  // point) raises OffDesignError — that's a real modeling boundary, not a
  // bug, so it's caught here and drives the fallback path below rather
  // than crashing the panel.
  const designPoint = useMemo(() => {
    try {
      return { ok: true, dp: lockDesignPoint(config) };
    } catch (err) {
      // Any other failure also just means "no locked design point" —
      // rethrowing would unmount the whole page.
      return { ok: false, reason: err instanceof OffDesignError ? err.message : "design point could not be locked" };
    }
  }, [config]);

  const rows = useMemo(() => {
    let cum = 0;
    return segments.map((seg) => {
      const duration = Number.isFinite(seg.duration_min) ? Math.max(seg.duration_min, 0) : 0;
      const tStart = cum;
      const tEnd = cum + duration;
      cum = tEnd;
      const durationSec = duration * 60;
      const T04_target = Number.isFinite(seg.T04_target) ? seg.T04_target : config.T04;

      if (designPoint.ok) {
        // Real off-design matching: mdot_a is a MATCHED OUTPUT of the fixed
        // hardware at this (altitude, Mach, T04_target), not config.mdot_a.
        try {
          const r = solveOffDesign(designPoint.dp, seg.altitude_m, seg.mach_flight, T04_target);
          const mdotF = r.f * r.mdot_a;
          return {
            ...seg, tStart, tEnd, valid: true,
            thrust: r.thrust,
            tsfcHr: tsfcPerHour(r.tsfc),
            mdotF,
            fuelBurn: mdotF * durationSec,
            distance: r.stations.a.V * durationSec,
            Nr: r.Nr,
            mr: r.mr,
          };
        } catch {
          // OffDesignError (can't match here) or a bad segment input such as
          // an altitude outside 0-11,000 m: either way this segment just
          // can't be flown. Rethrowing used to blank the whole page.
          return { ...seg, tStart, tEnd, valid: false };
        }
      }

      // Fallback: the current configuration can't be matched off-design
      // (see designPoint.reason) — re-solve a fresh design cycle at each
      // segment's flight condition and throttle, same as this panel did
      // before off-design matching existed. mdot_a stays fixed at
      // config.mdot_a here since there's no matched/derived value without
      // a locked design point.
      try {
        const r = solveEngine({
          ...config, altitude_m: seg.altitude_m, mach_flight: seg.mach_flight, T04: T04_target,
        });
        const mdotF = (r.performance.f_total ?? r.performance.f) * config.mdot_a;
        return {
          ...seg, tStart, tEnd, valid: true,
          thrust: r.performance.thrust,
          tsfcHr: tsfcPerHour(r.performance.tsfc),
          mdotF,
          fuelBurn: mdotF * durationSec,
          distance: r.atmosphere.V_flight * durationSec,
        };
      } catch {
        return { ...seg, tStart, tEnd, valid: false };
      }
    });
  }, [segments, config, designPoint]);

  const totals = useMemo(() => {
    const validRows = rows.filter((r) => r.valid);
    return {
      time: rows.reduce((a, r) => a + (r.tEnd - r.tStart), 0),
      fuel: validRows.reduce((a, r) => a + r.fuelBurn, 0),
      distance: validRows.reduce((a, r) => a + r.distance, 0),
      invalidCount: rows.length - validRows.length,
    };
  }, [rows]);

  const thrustLine = useMemo(() => buildTimeline(rows, (r) => r.thrust), [rows]);
  const fuelFlowLine = useMemo(() => buildTimeline(rows, (r) => r.mdotF * 3600), [rows]);
  const tsfcLine = useMemo(() => buildTimeline(rows, (r) => r.tsfcHr), [rows]);
  const nrLine = useMemo(() => buildTimeline(rows, (r) => r.Nr), [rows]);
  const altitudeLine = useMemo(() => buildTimeline(rows, (r) => r.altitude_m), [rows]);
  const machLine = useMemo(() => buildTimeline(rows, (r) => r.mach_flight), [rows]);

  const exportMission = () => {
    downloadCsv(
      "thrustforge-mission.csv",
      rows.map((r) => ({
        Segment: r.label,
        "Start (min)": r.tStart,
        "End (min)": r.tEnd,
        "Altitude (m)": r.altitude_m,
        "Mach": r.mach_flight,
        "Throttle T04 target (K)": r.T04_target,
        "Thrust (N)": r.valid ? r.thrust : null,
        "TSFC (kg/(N·h))": r.valid ? r.tsfcHr : null,
        "Fuel flow (kg/h)": r.valid ? r.mdotF * 3600 : null,
        "Fuel burned this segment (kg)": r.valid ? r.fuelBurn : null,
        "Distance this segment (km)": r.valid ? r.distance / 1000 : null,
        "Corrected speed Nr": designPoint.ok && r.valid ? r.Nr : null,
        "Corrected flow mr": designPoint.ok && r.valid ? r.mr : null,
      }))
    );
  };

  return (
    <ExpandableSection
      title="🚀 Mission analysis"
      summary={`Takeoff → climb → cruise → descent (or your own profile) — this ${designPoint.ok ? "fixed engine matched off-design" : "engine re-solved fresh"} at each segment's flight condition and throttle, with fuel and range integrated over the mission. ${totals.fuel > 0 ? `Total: ${fmt(totals.fuel, 1)} kg fuel, ${fmt(totals.distance / 1000, 0)} km.` : ""} Expand to build one.`}
    >
      {designPoint.ok ? (
        <p className="section-note">
          The current engine configuration (on the left) is locked as FIXED
          hardware at its design point; each segment sets altitude, flight
          Mach, and a throttle (target T04) and the actual operating point —
          corrected speed/flow, mass flow, thrust, fuel flow — is found by
          component-map matching against that fixed hardware, not by
          re-solving a fresh design cycle. A segment outside this model's
          reachable envelope (too far below idle, or needing more overspeed
          than the generic compressor map allows) is excluded and shown as a
          gap, same as an otherwise-invalid engine. Fuel burn and distance
          are integrated segment by segment (steady-state within each) and
          summed to a mission total.
        </p>
      ) : (
        <p className="section-note">
          This configuration can&rsquo;t be matched off-design (that needs an
          axial compressor, a convergent nozzle, no lit afterburner, and a
          design point whose nozzle chokes) —{" "}
          {designPoint.reason.replace(/^lock_?[dD]esign_?[pP]oint:\s*/, "").replace(/\s*\(v1\)/, "")}{" "}
          Falling back to re-solving a
          fresh design cycle at each segment's flight condition and
          throttle; air mass flow stays fixed at the configured value rather
          than being matched. Fuel burn and distance are integrated segment
          by segment (steady-state within each) and summed to a mission
          total.
        </p>
      )}

      <div className="table-scroll">
        <table className="mission-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Altitude (m)</th>
              <th>Mach</th>
              <th>Throttle T04 (K)</th>
              <th>Duration (min)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg) => (
              <tr key={seg.id}>
                <td>
                  <input
                    type="text"
                    value={seg.label}
                    onChange={(e) => updateSegment(seg.id, "label", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} max={11000} step={100}
                    value={Number.isFinite(seg.altitude_m) ? seg.altitude_m : ""}
                    onChange={(e) => updateSegment(seg.id, "altitude_m", parseFloat(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} max={3} step={0.05}
                    value={Number.isFinite(seg.mach_flight) ? seg.mach_flight : ""}
                    onChange={(e) => updateSegment(seg.id, "mach_flight", parseFloat(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} step={10}
                    value={Number.isFinite(seg.T04_target) ? seg.T04_target : ""}
                    onChange={(e) => updateSegment(seg.id, "T04_target", parseFloat(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} step={1}
                    value={Number.isFinite(seg.duration_min) ? seg.duration_min : ""}
                    onChange={(e) => updateSegment(seg.id, "duration_min", parseFloat(e.target.value))}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="reset-button"
                    onClick={() => removeSegment(seg.id)}
                    disabled={segments.length <= 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sweep-controls">
        <button type="button" className="reset-button" onClick={addSegment}>+ Add segment</button>
        <button type="button" className="reset-button sweep-export-button" onClick={exportMission}>
          Export CSV
        </button>
      </div>

      {totals.invalidCount > 0 && (
        <p className="section-note">
          {totals.invalidCount} segment{totals.invalidCount > 1 ? "s aren't" : " isn't"} a
          physically valid engine at that flight condition{designPoint.ok ? " and throttle, or fall outside this fixed hardware's reachable envelope," : ""} and {totals.invalidCount > 1 ? "are" : "is"} excluded
          from the totals and shown as gaps below.
        </p>
      )}

      <div className="performance-summary">
        <div className="perf-card">
          <span className="perf-label">Total mission time</span>
          <span className="perf-value">{fmt(totals.time, 0)} <small>min</small></span>
        </div>
        <div className="perf-card">
          <span className="perf-label">Total fuel burned</span>
          <span className="perf-value">{fmt(totals.fuel, 1)} <small>kg</small></span>
        </div>
        <div className="perf-card">
          <span className="perf-label">Total range</span>
          <span className="perf-value">{fmt(totals.distance / 1000, 1)} <small>km</small></span>
        </div>
      </div>

      <div className="sweep-charts">
        <SweepChart title="Thrust" xValues={thrustLine.xValues} yValues={thrustLine.yValues} unit="N" color="#2a78d6" decimals={0} xUnit="min" xDecimals={0} />
        <SweepChart title="Fuel flow" xValues={fuelFlowLine.xValues} yValues={fuelFlowLine.yValues} unit="kg/h" color="#eb6834" decimals={1} xUnit="min" xDecimals={0} />
        <SweepChart title="TSFC" xValues={tsfcLine.xValues} yValues={tsfcLine.yValues} unit="kg/(N·h)" color="#1baf7a" decimals={3} xUnit="min" xDecimals={0} />
        <SweepChart title="Altitude" xValues={altitudeLine.xValues} yValues={altitudeLine.yValues} unit="m" color="#8a7cf5" decimals={0} xUnit="min" xDecimals={0} />
        <SweepChart title="Flight Mach" xValues={machLine.xValues} yValues={machLine.yValues} unit="" color="#d64f8a" decimals={2} xUnit="min" xDecimals={0} />
        {designPoint.ok && (
          <SweepChart title="Corrected speed (Nr)" xValues={nrLine.xValues} yValues={nrLine.yValues} unit="" color="#c9942a" decimals={3} xUnit="min" xDecimals={0} />
        )}
      </div>
    </ExpandableSection>
  );
}
