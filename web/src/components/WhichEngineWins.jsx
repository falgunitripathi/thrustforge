import { useMemo, useState } from "react";
import ExpandableSection from "./ExpandableSection.jsx";
import { ENGINES, engineConfig, headline } from "../utils/engineRegistry.js";
import { fmt } from "../utils/format.js";

const M_MAX = 8;
const STEP = 0.1;
const Y_MIN = 0.02; // kg/(N·h) — log axis limits
const Y_MAX = 1.2;
const Y_TICKS = [0.02, 0.05, 0.1, 0.2, 0.5, 1];

const WIDTH = 640;
const HEIGHT = 300;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 30;
const BAND_H = 18;

// One colour per engine, plus a direct label on every line, so colour is
// never the only way to tell them apart.
const COLORS = {
  turbojet: "#2a78d6", turbojet2: "#6aa7ea", turboprop: "#1baf7a",
  turbofan_unmixed: "#8a7cf5", turbofan_mixed: "#b36be0", turbofan_geared: "#5b4fd1",
  turbofan_three_spool: "#c49bff", propfan: "#2aa198", turboramjet: "#c9a227",
  ramjet: "#eb6834", scramjet: "#d6457a",
};
const SHORT = {
  turbojet: "Turbojet", turbojet2: "Two-spool TJ", turboprop: "Turboprop",
  turbofan_unmixed: "Turbofan", turbofan_mixed: "Mixed TF", turbofan_geared: "Geared TF",
  turbofan_three_spool: "3-spool TF", propfan: "Propfan", turboramjet: "Turboramjet",
  ramjet: "Ramjet", scramjet: "Scramjet",
};
const DEFAULT_ON = ["turbojet", "turboprop", "turbofan_unmixed", "propfan", "ramjet", "scramjet"];
const ALTITUDES = [0, 5000, 10000, 11000];
const THRUST_ENGINES = ENGINES.filter((e) => e.thrust !== false);

function sweep(entry, base, altitude) {
  const pts = [];
  const lo = Math.ceil(entry.machMin / STEP - 1e-9);
  const hi = Math.floor(Math.min(entry.machMax, M_MAX) / STEP + 1e-9);
  for (let i = lo; i <= hi; i++) {
    const m = +(i * STEP).toFixed(2);
    let y = null;
    try {
      const h = headline(entry.solve({ ...base, altitude_m: altitude, mach_flight: m }));
      if (h.tsfc !== null) y = h.tsfc * 3600;
    } catch {
      y = null;
    }
    pts.push([m, y]);
  }
  return pts;
}

function Chart({ configs, useMine, altitude, visible }) {
  const series = useMemo(
    () => THRUST_ENGINES.map((e) => ({
      entry: e,
      pts: sweep(e, useMine ? engineConfig(e, configs) : engineConfig(e, null), altitude),
    })),
    [configs, useMine, altitude],
  );
  const shown = series.filter((s) => visible.includes(s.entry.key));

  // The lowest-TSFC visible engine at each Mach, merged into speed bands.
  const bands = [];
  for (let i = 0; i <= Math.round(M_MAX / STEP); i++) {
    const m = +(i * STEP).toFixed(2);
    let best = null;
    for (const s of shown) {
      const p = s.pts.find(([x]) => x === m);
      if (p && p[1] !== null && (best === null || p[1] < best.y)) best = { key: s.entry.key, y: p[1] };
    }
    const key = best?.key ?? null;
    const last = bands[bands.length - 1];
    if (last && last.key === key) last.to = m;
    else bands.push({ key, from: m, to: m });
  }

  const plotW = WIDTH - PAD_L - PAD_R;
  const px = (m) => PAD_L + (m / M_MAX) * plotW;
  const logLo = Math.log10(Y_MIN), logHi = Math.log10(Y_MAX);
  const py = (y) => PAD_T + (1 - (Math.log10(y) - logLo) / (logHi - logLo)) * (HEIGHT - PAD_T - PAD_B);
  const inRange = (y) => y !== null && y >= Y_MIN && y <= Y_MAX;

  const paths = shown.map((s) => {
    const segs = [];
    let cur = [];
    for (const [m, y] of s.pts) {
      if (inRange(y)) cur.push([m, y]);
      else if (cur.length) { segs.push(cur); cur = []; }
    }
    if (cur.length) segs.push(cur);
    const lastSeg = segs[segs.length - 1];
    return { ...s, segs, end: lastSeg?.[lastSeg.length - 1] };
  });

  const bandText = bands.filter((b) => b.key).map((b) => (
    `Mach ${b.from === b.to ? fmt(b.from, 1) : `${fmt(b.from, 1)}–${fmt(b.to, 1)}`}: ${SHORT[b.key].toLowerCase()}`
  ));

  return (
    <>
      <svg className="wins-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT + BAND_H + 26}`} role="img"
        aria-label={`TSFC against flight Mach for ${shown.length} engines. Lowest fuel use: ${bandText.join("; ")}.`}>
        {Y_TICKS.map((t) => (
          <g key={t}>
            <line className="sweep-chart-gridline" x1={PAD_L} x2={WIDTH - PAD_R} y1={py(t)} y2={py(t)} />
            <text className="sweep-chart-tick" x={PAD_L - 6} y={py(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {Array.from({ length: M_MAX + 1 }, (_, m) => (
          <text key={m} className="sweep-chart-tick" x={px(m)} y={HEIGHT - PAD_B + 15} textAnchor="middle">{m}</text>
        ))}
        <text className="sweep-chart-tick" x={PAD_L + plotW / 2} y={HEIGHT - 2} textAnchor="middle">Flight Mach number</text>
        <line className="sweep-chart-axis" x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={HEIGHT - PAD_B} />
        <line className="sweep-chart-axis" x1={PAD_L} x2={WIDTH - PAD_R} y1={HEIGHT - PAD_B} y2={HEIGHT - PAD_B} />

        {paths.map((s) => s.segs.map((seg, i) => (
          <path key={`${s.entry.key}${i}`} className="wins-line" stroke={COLORS[s.entry.key]}
            d={seg.map(([m, y], j) => `${j ? "L" : "M"}${px(m).toFixed(1)},${py(y).toFixed(1)}`).join(" ")}>
            <title>{s.entry.label}</title>
          </path>
        )))}
        {paths.map((s) => s.end && (
          <text key={`l${s.entry.key}`} className="wins-label" x={px(s.end[0]) + 4} y={py(s.end[1]) - 5}
            fill={COLORS[s.entry.key]} textAnchor={s.end[0] > M_MAX - 1 ? "end" : "start"}>
            {SHORT[s.entry.key]}
          </text>
        ))}

        <text className="sweep-chart-tick" x={PAD_L} y={HEIGHT + 10}>Lowest fuel use at each speed</text>
        {bands.map((b) => b.key && (
          <rect key={`b${b.from}`} x={px(b.from - STEP / 2 < 0 ? 0 : b.from - STEP / 2)} y={HEIGHT + 14}
            width={Math.max(px(Math.min(b.to + STEP / 2, M_MAX)) - px(Math.max(b.from - STEP / 2, 0)), 1)}
            height={BAND_H} fill={COLORS[b.key]} rx={3}>
            <title>{`Mach ${fmt(b.from, 1)}–${fmt(b.to, 1)}: ${SHORT[b.key]}`}</title>
          </rect>
        ))}
        {bands.map((b) => b.key && px(b.to) - px(b.from) > 46 && (
          <text key={`bt${b.from}`} className="wins-band-label" x={(px(b.from) + px(b.to)) / 2} y={HEIGHT + 14 + BAND_H / 2 + 4} textAnchor="middle">
            {SHORT[b.key]}
          </text>
        ))}
      </svg>
      <p className="section-note wins-bands">
        <strong>Lowest fuel use:</strong> {bandText.length ? bandText.join(" · ") : "none of the selected engines can run at this altitude."}
      </p>
    </>
  );
}

/**
 * "Which engine wins?" — every engine's TSFC across flight Mach on one
 * chart, with the winner at each speed shown as a strip of speed bands.
 */
export default function WhichEngineWins({ configs }) {
  const [visible, setVisible] = useState(DEFAULT_ON);
  const [useMine, setUseMine] = useState(false);
  const [altitude, setAltitude] = useState(10000);
  const toggle = (key) => setVisible((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  return (
    <ExpandableSection
      title="Which engine wins? Fuel use across flight speed"
      summary="Every engine's TSFC from standstill to Mach 8 on one chart, and which one burns the least fuel at each speed — why airliners use turbofans, Concorde a turbojet and hypersonic missiles a scramjet. Expand to view."
    >
      <p className="section-note">
        Each line is one engine re-solved at every flight Mach it can reach, at the altitude below. Lower is
        better: less fuel for each newton of thrust. The coloured strip underneath shows which of the selected
        engines wins at each speed. The fuel-use axis is logarithmic, because TSFC spans more than ten times
        from a propfan to a ramjet.
      </p>
      <div className="vs-controls">
        <label className="field">
          <span className="field-label">Altitude</span>
          <select value={altitude} onChange={(e) => setAltitude(Number(e.target.value))}>
            {ALTITUDES.map((a) => <option key={a} value={a}>{a === 0 ? "Sea level" : `${a / 1000} km`}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Engine settings</span>
          <select value={useMine ? "mine" : "defaults"} onChange={(e) => setUseMine(e.target.value === "mine")}>
            <option value="defaults">Textbook defaults</option>
            <option value="mine">My settings on each tab</option>
          </select>
        </label>
      </div>
      <div className="wins-toggles" role="group" aria-label="Engines shown">
        {THRUST_ENGINES.map((e) => (
          <label key={e.key} className={`wins-toggle${visible.includes(e.key) ? " wins-toggle-on" : ""}`}>
            <input type="checkbox" checked={visible.includes(e.key)} onChange={() => toggle(e.key)} />
            <span className="wins-swatch" style={{ background: COLORS[e.key] }} aria-hidden="true" />
            {e.label}
          </label>
        ))}
      </div>
      <Chart configs={configs} useMine={useMine} altitude={altitude} visible={visible} />
      <p className="section-note">
        Why the winner changes: at low speed, moving a lot of air slowly (propellers, big fans) wastes the
        least energy. Faster, the fan and then the turbine get in the way — the air arriving is already
        compressed and hot from ram — so first the turbojet, then the ramjet (no moving parts at all), and
        above about Mach 5 the scramjet, which keeps the air supersonic through its combustor, take over.
        The turboshaft isn&rsquo;t shown: it makes shaft power, not thrust.
      </p>
    </ExpandableSection>
  );
}
