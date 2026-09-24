import { useMemo, useState } from "react";
import { solveTurboramjet } from "../physics/turboramjet.js";
import ExpandableSection from "./ExpandableSection.jsx";
import { fmt, tsfcPerHour } from "../utils/format.js";
import { linspace } from "../utils/sweepParams.js";

const MACH_MIN = 0;
const MACH_MAX = 5;
const POINTS = 21;

const W = 460, H = 220;
const PAD = { l: 48, r: 64, t: 14, b: 34 };

const SERIES = [
  { key: "tj", label: "Turbojet", color: "var(--series-1)" },
  { key: "rj", label: "Ramjet", color: "var(--series-2)" },
];

function niceTicks(lo, hi, count = 4) {
  if (lo === hi) return [lo];
  const step = (hi - lo) / count;
  return Array.from({ length: count + 1 }, (_, i) => lo + step * i);
}

/** Two series on one shared axis (same unit), with a switch-Mach marker,
 *  legend + end-of-line labels, and a hover crosshair/tooltip. */
function TwoSeriesChart({ title, unit, decimals, xs, values, switchMach, currentMach }) {
  const [hover, setHover] = useState(null);
  const all = [...values.tj, ...values.rj].filter((v) => v !== null && Number.isFinite(v));
  if (all.length === 0) {
    return (
      <div className="sweep-chart-card">
        <div className="sweep-chart-title">{title}</div>
        <p className="section-note">No physically valid points in this range.</p>
      </div>
    );
  }
  const yLo = Math.min(0, ...all), yHi = Math.max(...all) * 1.08;
  const x = (m) => PAD.l + ((m - MACH_MIN) / (MACH_MAX - MACH_MIN)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b);

  const path = (arr) => {
    let d = "", pen = false;
    arr.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"} ${x(xs[i]).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const lastIdx = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && Number.isFinite(arr[i])) return i; return -1; };

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xs.forEach((m, i) => { if (Math.abs(x(m) - px) < Math.abs(x(xs[best]) - px)) best = i; });
    setHover(best);
  }

  return (
    <div className="sweep-chart-card">
      <div className="sweep-chart-title">{title} <small>({unit})</small></div>
      <div className="two-series-legend">
        {SERIES.map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{s.label} only</span>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
          aria-label={`${title} versus flight Mach, turbojet and ramjet`}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {niceTicks(yLo, yHi).map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmt(t, decimals)}</text>
            </g>
          ))}
          {[0, 1, 2, 3, 4, 5].map((m) => (
            <text key={m} x={x(m)} y={H - PAD.b + 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{m}</text>
          ))}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">Flight Mach</text>

          <line x1={x(switchMach)} x2={x(switchMach)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-muted)" strokeDasharray="4 3" />
          <text x={x(switchMach) + 4} y={PAD.t + 10} fontSize="10" fill="var(--text-muted)">switch M {fmt(switchMach, 1)}</text>
          <line x1={x(currentMach)} x2={x(currentMach)} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeWidth="1.5" opacity="0.6" />

          {SERIES.map((s) => {
            const li = lastIdx(values[s.key]);
            return (
              <g key={s.key}>
                <path d={path(values[s.key])} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {li >= 0 && (
                  <text x={x(xs[li]) + 6} y={y(values[s.key][li]) + 4} fontSize="10.5" fill="var(--text)">{s.label}</text>
                )}
              </g>
            );
          })}

          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(xs[hover])} x2={x(xs[hover])} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-muted)" strokeWidth="1" />
              {SERIES.map((s) => {
                const v = values[s.key][hover];
                return v !== null && Number.isFinite(v)
                  ? <circle key={s.key} cx={x(xs[hover])} cy={y(v)} r="4" fill={s.color} stroke="var(--bg-panel)" strokeWidth="2" />
                  : null;
              })}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="two-series-tooltip" style={{ left: `${(x(xs[hover]) / W) * 100}%` }}>
            <strong>Mach {fmt(xs[hover], 2)}</strong>
            {SERIES.map((s) => (
              <span key={s.key}><i style={{ background: s.color }} />{s.label}: {fmt(values[s.key][hover], decimals)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The turboramjet's defining chart: the same design forced to run as a
 * pure turbojet and as a pure ramjet at every flight Mach from 0 to 5.
 * Where the curves cross is the natural place to switch modes — the
 * source treats the switch Mach as a design choice, not a formula.
 */
export default function TurboramjetMachSweep({ config }) {
  const data = useMemo(() => {
    const xs = linspace(MACH_MIN, MACH_MAX, POINTS);
    const out = { xs, tsfc: { tj: [], rj: [] }, sp: { tj: [], rj: [] } };
    for (const m of xs) {
      for (const [key, mode] of [["tj", "turbojet"], ["rj", "ramjet"]]) {
        try {
          const p = solveTurboramjet({ ...config, mode, mach_flight: m }).performance;
          out.sp[key].push(p.specific_thrust);
          out.tsfc[key].push(p.specific_thrust > 0 ? tsfcPerHour(p.tsfc) : null);
        } catch {
          out.sp[key].push(null);
          out.tsfc[key].push(null);
        }
      }
    }
    // First Mach where the ramjet burns less fuel per newton than the turbojet.
    let cross = null;
    xs.forEach((m, i) => {
      const a = out.tsfc.tj[i], b = out.tsfc.rj[i];
      if (cross === null && b !== null && (a === null || b < a) && m > 0) cross = m;
    });
    out.cross = cross;
    return out;
  }, [config]);

  return (
    <ExpandableSection
      title="Turbojet vs ramjet across flight Mach"
      summary="Your design run as a pure turbojet and as a pure ramjet at every flight speed from Mach 0 to 5. Where the curves cross is where switching modes pays off. Expand to view."
    >
      <p className="section-note">
        The turbojet makes thrust from standstill but its fuel use climbs with speed, and past roughly
        Mach 3.5 the compressor overheats the air (the line ends). The ramjet can&rsquo;t run at all at low
        speed, then gets steadily better.{" "}
        {data.cross !== null
          ? <>For this design the ramjet first burns less fuel per newton at about <strong>Mach {fmt(data.cross, 2)}</strong>; your switch Mach is {fmt(config.mach_switch, 1)}.</>
          : <>For this design the ramjet never overtakes the turbojet on fuel use in this range.</>}{" "}
        The purple line marks your current flight Mach.
      </p>
      <div className="sweep-charts two-series-charts">
        <TwoSeriesChart title="TSFC (lower is better)" unit="kg/(N·h)" decimals={2}
          xs={data.xs} values={data.tsfc} switchMach={config.mach_switch} currentMach={config.mach_flight} />
        <TwoSeriesChart title="Specific thrust" unit="N·s/kg" decimals={0}
          xs={data.xs} values={data.sp} switchMach={config.mach_switch} currentMach={config.mach_flight} />
      </div>
      <details className="two-series-table">
        <summary>Show the numbers as a table</summary>
        <div className="table-scroll">
          <table className="station-table">
            <thead>
              <tr><th>Mach</th><th>TSFC turbojet</th><th>TSFC ramjet</th><th>Sp. thrust turbojet</th><th>Sp. thrust ramjet</th></tr>
            </thead>
            <tbody>
              {data.xs.map((m, i) => (
                <tr key={m}>
                  <td>{fmt(m, 2)}</td>
                  <td>{fmt(data.tsfc.tj[i], 3)}</td>
                  <td>{fmt(data.tsfc.rj[i], 3)}</td>
                  <td>{fmt(data.sp.tj[i], 0)}</td>
                  <td>{fmt(data.sp.rj[i], 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </ExpandableSection>
  );
}
