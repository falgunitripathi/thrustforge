import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FlowStreak, FlowMarquee, InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured turboramjet, drawn as an
 * over-under installation: the ramjet duct on top, the turbojet below,
 * sharing one intake with a flap that closes off whichever leg is idle.
 * (Wrap-around and over-under are the same maths here — the two legs are
 * independent parallel flows, aeropropsim/turboramjet.py judgment call 3.)
 * Unlike the other diagrams this one is a full cutaway of both ducts, not
 * a half-section, since the two flow paths sit one above the other.
 * Stations follow the source: turbojet a, 2-7; ramjet 8, 9, 10.
 */

const VBOX_W = 920;
const VBOX_H = 240;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;

const RJ_Y = 62;       // ramjet duct centreline
const TJ_Y = 168;      // turbojet centreline
const SPLIT_Y = 112;   // splitter wall between the two ducts
const INLET_X = 30;
const SPLIT_X = 110;

const TJ = {
  intake: { x0: INLET_X, x1: 150 },
  compressor: { x0: 150, x1: 320 },
  combustor: { x0: 320, x1: 460 },
  turbine: { x0: 460, x1: 590 },
  afterburner: { x0: 590, x1: 730 },
  nozzle: { x0: 730, x1: 880 },
};
const RJ = {
  intake: { x0: INLET_X, x1: 150 },
  combustor: { x0: 150, x1: 590 },
  nozzle: { x0: 590, x1: 880 },
};

const TJ_STATIONS = [
  { key: "2", x: 150, name: "Intake exit" },
  { key: "3", x: 320, name: "Compressor exit" },
  { key: "4", x: 460, name: "Combustor exit" },
  { key: "5", x: 590, name: "Turbine exit" },
  { key: "6", x: 730, name: "Afterburner exit" },
  { key: "7", x: 880, name: "Nozzle exit" },
];
const RJ_STATIONS = [
  { key: "8", x: 150, name: "Ram intake exit" },
  { key: "9", x: 590, name: "Ram combustor exit" },
  { key: "10", x: 880, name: "Ram nozzle exit" },
];
const A_STATION = { key: "a", x: INLET_X, name: "Freestream" };

const LANES = [-4, 0, 4];
const STREAKS_PER_LANE = 3;

function activeStations(result) {
  const list = [A_STATION];
  if (result.turbojet) list.push(...TJ_STATIONS);
  if (result.ramjet) list.push(...RJ_STATIONS);
  return list.map((s, i) => ({ ...s, seq: i + 1 }));
}

const PART_BUTTONS_TJ = [
  { kind: "tj-intake", label: "Intake" },
  { kind: "tj-compressor", label: "Compressor" },
  { kind: "tj-combustor", label: "Combustor" },
  { kind: "tj-turbine", label: "Turbine" },
  { kind: "tj-afterburner", label: "Afterburner" },
  { kind: "tj-nozzle", label: "TJ nozzle" },
];
const PART_BUTTONS_RJ = [
  { kind: "rj-combustor", label: "Ramjet combustor" },
  { kind: "rj-nozzle", label: "Ramjet nozzle" },
];
const PART_MID = {
  "tj-intake": (TJ.intake.x0 + TJ.intake.x1) / 2,
  "tj-compressor": (TJ.compressor.x0 + TJ.compressor.x1) / 2,
  "tj-combustor": (TJ.combustor.x0 + TJ.combustor.x1) / 2,
  "tj-turbine": (TJ.turbine.x0 + TJ.turbine.x1) / 2,
  "tj-afterburner": (TJ.afterburner.x0 + TJ.afterburner.x1) / 2,
  "tj-nozzle": (TJ.nozzle.x0 + TJ.nozzle.x1) / 2,
  "rj-combustor": (RJ.combustor.x0 + RJ.combustor.x1) / 2,
  "rj-nozzle": (RJ.nozzle.x0 + RJ.nozzle.x1) / 2,
};

function partDetails(kind, result, config) {
  const tj = result.turbojet;
  const rj = result.ramjet;
  const { atmosphere } = result;
  const off = (leg) => ({
    title: `${leg} — not running`,
    rows: [["Status", `Idle in ${result.mode_active} mode: the intake flap sends no air this way.`]],
  });
  if (kind === "tj-intake" && !tj) {
    return {
      title: "Intake (shared)",
      rows: [
        ["Flight Mach M", fmt(config.mach_flight, 2)],
        ["Stagnation temperature T08", `${fmt(rj.T08, 1)} K`],
        ["Stagnation pressure p_a → p08", `${fmtKPa(atmosphere.p_a, 1)} kPa → ${fmtKPa(rj.p08, 1)} kPa`],
        ["Pressure recovery r_d", fmt(rj.r_d, 3)],
        ["Air to turbojet / ramjet", `0 / ${fmt(result.performance.mdot_a_ramjet, 2)} kg/s (flap closed on the turbojet)`],
      ],
    };
  }
  if (kind.startsWith("tj-") && !tj) return off("Turbojet leg");
  if (kind.startsWith("rj-") && !rj) return off("Ramjet leg");
  switch (kind) {
    case "tj-intake":
      return {
        title: "Intake (shared)",
        rows: [
          ["Flight Mach M", fmt(config.mach_flight, 2)],
          ["Stagnation temperature T02", `${fmt(tj.T02, 1)} K`],
          ["Stagnation pressure p_a → p02", `${fmtKPa(atmosphere.p_a, 1)} kPa → ${fmtKPa(tj.p02, 1)} kPa`],
          ["Pressure recovery r_d", fmt(tj.r_d, 3)],
          ["Air to turbojet / ramjet", `${fmt(result.performance.mdot_a_turbojet, 2)} / ${fmt(result.performance.mdot_a_ramjet, 2)} kg/s`],
        ],
      };
    case "tj-compressor":
      return {
        title: "Compressor",
        rows: [
          ["Pressure ratio π_c (you set this)", fmt(config.pi_c, 2)],
          ["Temperature T02 → T03", `${fmt(tj.T02, 1)} K → ${fmt(tj.T03, 1)} K`],
          ["Pressure p02 → p03", `${fmtKPa(tj.p02, 1)} kPa → ${fmtKPa(tj.p03, 1)} kPa`],
          ["Work per kg of air", `${fmt(tj.compressor_work / 1000, 1)} kJ/kg`],
        ],
      };
    case "tj-combustor":
      return {
        title: "Combustor",
        rows: [
          ["Temperature T03 → T04", `${fmt(tj.T03, 1)} K → ${fmt(tj.T04, 1)} K`],
          ["Fuel-air ratio f", fmt(tj.f, 4)],
          ["Pressure p03 → p04", `${fmtKPa(tj.p03, 1)} kPa → ${fmtKPa(tj.p04, 1)} kPa`],
        ],
      };
    case "tj-turbine":
      return {
        title: "Turbine (drives the compressor)",
        rows: [
          ["Temperature T04 → T05", `${fmt(tj.T04, 1)} K → ${fmt(tj.T05, 1)} K`],
          ["Pressure p04 → p05", `${fmtKPa(tj.p04, 1)} kPa → ${fmtKPa(tj.p05, 1)} kPa`],
          ["Turbine efficiency η_t (you set this)", fmt(config.eta_t, 3)],
        ],
      };
    case "tj-afterburner":
      return {
        title: config.afterburner_on ? "Afterburner (lit)" : "Afterburner (off)",
        rows: config.afterburner_on
          ? [
              ["Temperature T05 → T06", `${fmt(tj.T05, 1)} K → ${fmt(tj.T06, 1)} K`],
              ["Extra fuel-air ratio f_ab", fmt(tj.fab, 4)],
              ["Pressure p05 → p06", `${fmtKPa(tj.p05, 1)} kPa → ${fmtKPa(tj.p06, 1)} kPa`],
            ]
          : [["Status", "Off — the gas passes straight through (T06 = T05)."]],
      };
    case "tj-nozzle":
      return {
        title: "Turbojet nozzle (fully expanded)",
        rows: [
          ["Exit velocity V7", `${fmt(tj.V7, 1)} m/s`],
          ["Flight velocity V", `${fmt(atmosphere.V_flight, 1)} m/s`],
          ["Exit static temperature T7", `${fmt(tj.T7, 1)} K`],
          ["Turbojet thrust", `${fmt(result.performance.thrust_turbojet, 1)} N`],
        ],
      };
    case "rj-combustor":
      return {
        title: "Ramjet combustor",
        rows: [
          ["Temperature T08 → T09", `${fmt(rj.T08, 1)} K → ${fmt(rj.T09, 1)} K`],
          ["Fuel-air ratio f_R", fmt(rj.f, 4)],
          ["Ram pressure ratio p08/p_a", fmt(rj.ram_pressure_ratio, 2)],
          ["Pressure p08 → p09", `${fmtKPa(rj.p08, 1)} kPa → ${fmtKPa(rj.p09, 1)} kPa`],
        ],
      };
    case "rj-nozzle":
      return {
        title: "Ramjet nozzle (fully expanded)",
        rows: [
          ["Exit velocity V10", `${fmt(rj.V10, 1)} m/s`],
          ["Flight velocity V", `${fmt(atmosphere.V_flight, 1)} m/s`],
          ["Exit Mach", fmt(rj.M10, 2)],
          ["Ramjet thrust", `${fmt(result.performance.thrust_ramjet, 1)} N`],
        ],
      };
    default:
      return null;
  }
}

function stationDetails(s, st) {
  return {
    title: `Step ${s.seq} — Station ${s.key} — ${s.name}`,
    rows: [
      ["Stagnation temperature", `${fmt(st.T0, 1)} K`],
      ["Stagnation pressure", `${fmtKPa(st.p0, 1)} kPa`],
      ["Static temperature", `${fmt(st.T, 1)} K`],
      ["Static pressure", `${fmtKPa(st.p, 1)} kPa`],
      ["Mach number", fmt(st.M, 3)],
      ["Velocity", `${fmt(st.V, 1)} m/s`],
      ["Density", `${fmt(st.rho, 3)} kg/m³`],
    ],
  };
}

function box(x0, x1, yc, h0, h1 = h0) {
  return `${x0},${yc - h0} ${x1},${yc - h1} ${x1},${yc + h1} ${x0},${yc + h0}`;
}

/** Heat-coloured flow lanes along one leg, from its own stations' static T. */
function LegFlow({ id, stations, stationList, yc, x0 }) {
  const x1 = stationList[stationList.length - 1].x;
  const Ts = stationList.map((s) => stations[s.key].T);
  const lo = Math.min(...Ts), hi = Math.max(...Ts);
  return (
    <>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x0} y1={yc} x2={x1} y2={yc}>
          {stationList.map((s) => (
            <stop key={s.key} offset={`${((s.x - x0) / (x1 - x0)) * 100}%`} stopColor={stationHeatColor(stations[s.key].T, lo, hi)} />
          ))}
        </linearGradient>
      </defs>
      {LANES.map((dy, i) => (
        <line key={i} x1={x0} y1={yc + dy} x2={x1} y2={yc + dy} className="ed-flow-lane" stroke={`url(#${id})`} opacity={i === 1 ? 0.7 : 0.4} />
      ))}
      {LANES.flatMap((dy, li) =>
        Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
          <FlowStreak key={`${li}-${j}`} y={yc + dy} index={li * STREAKS_PER_LANE + j} count={LANES.length * STREAKS_PER_LANE} x0={x0} x1={x1} />
        ))
      )}
    </>
  );
}

function StageTicks({ x0, x1, yc, h, n, className }) {
  const w = (x1 - x0) / n;
  return Array.from({ length: n }, (_, i) => (
    <rect key={i} x={x0 + i * w + 3} y={yc - h} width={Math.max(w - 6, 3)} height={2 * h} rx="2" className={className} opacity={0.55 + 0.45 * ((i + 1) / n)} />
  ));
}

function Diagram({ config, result, idSuffix }) {
  const { stations, turbojet: tj, ramjet: rj } = result;
  const [selected, setSelected] = useState(null);
  const list = activeStations(result);
  const bySeq = Object.fromEntries(list.map((s) => [s.key, s]));

  function selectPart(kind) {
    const details = partDetails(kind, result, config);
    if (!details) return;
    setSelected({ details, leftPct: ((PART_MID[kind] + MARGIN) / TOTAL_W) * 100, kind });
  }
  function selectStation(s) {
    setSelected({ details: stationDetails(s, stations[s.key]), leftPct: ((s.x + MARGIN) / TOTAL_W) * 100, kind: null });
  }
  function handleWrapperClick(e) {
    if (!selected) return;
    if (e.target.closest(".ed-part-card") || e.target.closest(".ed-clickable") || e.target.closest(".station-readout")) return;
    setSelected(null);
  }

  const dim = (on) => ({ opacity: on ? 1 : 0.3 });
  const label = { fill: "var(--text-muted)", fontSize: 11, fontStyle: "italic" };
  const tag = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" };
  // Intake flap: pivots at the splitter's nose to close the idle leg.
  const flapEnd = !tj ? [SPLIT_X + 30, TJ_Y + 36] : !rj ? [SPLIT_X + 30, RJ_Y - 26] : [SPLIT_X + 34, SPLIT_Y];

  const tjRow = (i) => (i % 2 === 0 ? 62 : 0);
  const readouts = list.map((s) => {
    let top = 0;
    if (s.key !== "a") {
      const ti = TJ_STATIONS.findIndex((t) => t.key === s.key);
      if (ti >= 0) top = tjRow(ti);
      else top = tj ? 136 : (s.key === "8" ? 62 : 0);
    }
    return { s, top };
  });

  return (
    <div className="ed-diagram-wrap">
      <InspectToolbar
        parts={[...PART_BUTTONS_TJ, ...PART_BUTTONS_RJ]}
        activeKind={selected?.kind ?? null}
        onSelect={selectPart}
      />
      <div className="engine-diagram-scroll" onClick={handleWrapperClick}>
      <div className="engine-diagram-viewport" style={{ width: TOTAL_W }}>
      <svg
        viewBox={`${-MARGIN} 0 ${TOTAL_W} ${VBOX_H}`}
        className="engine-diagram-svg"
        style={{ width: TOTAL_W }}
        role="img"
        aria-label="Over-under turboramjet: a ramjet duct above a turbojet, sharing one intake with a flap that closes the idle flow path. Click any part for its values."
      >
        <defs><FlowMarquee idSuffix={idSuffix} /></defs>

        {/* Outer nacelle outline and the splitter wall between the legs */}
        <path d={`M ${INLET_X} ${RJ_Y - 34} L 880 ${RJ_Y - 34} M ${INLET_X} ${TJ_Y + 50} L 880 ${TJ_Y + 50}`} stroke="var(--ed-casing-line)" strokeWidth="2" />
        <line x1={SPLIT_X} y1={SPLIT_Y} x2={880} y2={SPLIT_Y} stroke="var(--ed-casing-line)" strokeWidth="3" />

        {/* ---- Ramjet leg (top) ---- */}
        <g style={dim(!!rj)}>
          <text x={INLET_X} y={RJ_Y - 40} style={{ ...tag, fill: rj ? "var(--accent)" : "var(--text-muted)" }}>
            RAMJET {rj ? "— RUNNING" : "— OFF"}
          </text>
          <polygon points={box(SPLIT_X, RJ.combustor.x0, RJ_Y, 24, 28)} className="ed-intake" />
          <Clickable onSelect={() => selectPart("rj-combustor")} label="Ramjet combustor — click for values">
            <polygon points={box(RJ.combustor.x0, RJ.combustor.x1, RJ_Y, 28)} className="ed-combustor" />
            {[-12, 12].map((dy) => (
              <path key={dy} d={`M ${RJ.combustor.x0 + 42} ${RJ_Y + dy - 6} L ${RJ.combustor.x0 + 30} ${RJ_Y + dy} L ${RJ.combustor.x0 + 42} ${RJ_Y + dy + 6}`}
                fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinejoin="round" />
            ))}
            {rj && [-12, 12].map((dy) => (
              <path key={`f${dy}`} d={`M ${RJ.combustor.x0 + 48} ${RJ_Y + dy} q 16 -8 32 0 q 16 -9 32 0 q 16 -7 32 0`} className="ed-flame" />
            ))}
          </Clickable>
          <Clickable onSelect={() => selectPart("rj-nozzle")} label="Ramjet nozzle — click for values">
            <polygon points={`${RJ.nozzle.x0},${RJ_Y - 28} 700,${RJ_Y - 16} ${RJ.nozzle.x1},${RJ_Y - 30} ${RJ.nozzle.x1},${RJ_Y + 30} 700,${RJ_Y + 16} ${RJ.nozzle.x0},${RJ_Y + 28}`} className="ed-nozzle" />
          </Clickable>
          {rj && <LegFlow id={`trj-rj-${idSuffix}`} stations={stations} stationList={[A_STATION, ...RJ_STATIONS]} yc={RJ_Y} x0={INLET_X - 20} />}
          <text x={(RJ.combustor.x0 + RJ.combustor.x1) / 2} y={RJ_Y + 44} textAnchor="middle" style={label} pointerEvents="none">
            {rj ? `no compressor: ram pressure ×${fmt(rj.ram_pressure_ratio, 1)}, burns to ${fmt(rj.T09, 0)} K` : "idle below the switch Mach"}
          </text>
        </g>

        {/* ---- Turbojet leg (bottom) ---- */}
        <g style={dim(!!tj)}>
          <text x={INLET_X} y={TJ_Y + 64} style={{ ...tag, fill: tj ? "var(--accent)" : "var(--text-muted)" }}>
            TURBOJET {tj ? "— RUNNING" : "— OFF"}
          </text>
          <Clickable onSelect={() => selectPart("tj-intake")} label="Intake — click for values">
            <polygon points={box(SPLIT_X, TJ.intake.x1, TJ_Y, 34, 38)} className="ed-intake" />
          </Clickable>
          <Clickable onSelect={() => selectPart("tj-compressor")} label="Compressor — click for values">
            <polygon points={box(TJ.compressor.x0, TJ.compressor.x1, TJ_Y, 38, 26)} className="ed-intake" />
            <StageTicks x0={TJ.compressor.x0} x1={TJ.compressor.x1} yc={TJ_Y} h={24} n={6} className="ed-compressor" />
          </Clickable>
          <Clickable onSelect={() => selectPart("tj-combustor")} label="Combustor — click for values">
            <polygon points={box(TJ.combustor.x0, TJ.combustor.x1, TJ_Y, 30)} className="ed-combustor" />
            {tj && <path d={`M ${TJ.combustor.x0 + 18} ${TJ_Y + 10} q 14 -12 28 0 q 14 -14 28 0 q 14 -12 28 0 q 14 -10 28 0`} className="ed-flame" />}
          </Clickable>
          <Clickable onSelect={() => selectPart("tj-turbine")} label="Turbine — click for values">
            <polygon points={box(TJ.turbine.x0, TJ.turbine.x1, TJ_Y, 28, 36)} className="ed-intake" />
            <StageTicks x0={TJ.turbine.x0} x1={TJ.turbine.x1} yc={TJ_Y} h={28} n={3} className="ed-turbine" />
          </Clickable>
          <line x1={TJ.compressor.x0} y1={TJ_Y} x2={TJ.turbine.x1} y2={TJ_Y} className="ed-shaft" />
          <Clickable onSelect={() => selectPart("tj-afterburner")} label="Afterburner — click for values">
            <polygon points={box(TJ.afterburner.x0, TJ.afterburner.x1, TJ_Y, 36)} className={config.afterburner_on ? "ed-combustor" : "ed-intake"} />
            {[-18, 0, 18].map((dy) => (
              <circle key={dy} cx={TJ.afterburner.x0 + 14} cy={TJ_Y + dy} r="2" fill={config.afterburner_on ? "var(--ed-flame)" : "var(--text-muted)"} />
            ))}
            {tj && config.afterburner_on && [-14, 14].map((dy) => (
              <path key={dy} d={`M ${TJ.afterburner.x0 + 26} ${TJ_Y + dy} q 14 -9 28 0 q 14 -10 28 0 q 14 -8 28 0 q 14 -7 28 0`} className="ed-flame" />
            ))}
          </Clickable>
          <Clickable onSelect={() => selectPart("tj-nozzle")} label="Turbojet nozzle — click for values">
            <polygon points={`${TJ.nozzle.x0},${TJ_Y - 36} 800,${TJ_Y - 24} ${TJ.nozzle.x1},${TJ_Y - 36} ${TJ.nozzle.x1},${TJ_Y + 36} 800,${TJ_Y + 24} ${TJ.nozzle.x0},${TJ_Y + 36}`} className="ed-nozzle" />
          </Clickable>
          {tj && <LegFlow id={`trj-tj-${idSuffix}`} stations={stations} stationList={[A_STATION, ...TJ_STATIONS]} yc={TJ_Y + 12} x0={INLET_X - 20} />}
        </g>

        {/* Intake flap */}
        <line x1={SPLIT_X} y1={SPLIT_Y} x2={flapEnd[0]} y2={flapEnd[1]} stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <circle cx={SPLIT_X} cy={SPLIT_Y} r="4" fill="var(--accent)" />

        {[A_STATION, ...TJ_STATIONS, ...RJ_STATIONS].filter((s) => bySeq[s.key]).map((s) => (
          <line key={s.key} x1={s.x} y1={RJ_Y - 34} x2={s.x} y2={TJ_Y + 50} className="ed-guide" />
        ))}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W, height: tj && rj ? 206 : 140 }}>
        {readouts.map(({ s, top }) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            top={top}
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        One engine, two flow paths. Below the switch Mach the intake flap sends all the air through the
        turbojet (compressor, combustor, turbine, afterburner); at or above it the flap closes the turbojet
        off and the ramjet duct above takes over, since ram compression alone is now enough and the
        turbomachinery would overheat. In &ldquo;Both&rdquo; mode the air is split between them.
        Click any part or station marker for its numbers. The flow colour follows static temperature.
      </p>
      <p className="section-note">
        Station numbers follow the source: turbojet a, 2 to 7; ramjet 8, 9, 10 (station 8 sits at the same
        intake exit as station 2).
      </p>
      </div>
    </div>
  );
}

export default function TurboramjetEngineDiagram({ config, result }) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const previouslyFocused = useRef(null);

  function openModal() {
    previouslyFocused.current = document.activeElement;
    setExpanded(true);
  }
  function closeModal() {
    setExpanded(false);
    (previouslyFocused.current || triggerRef.current)?.focus?.();
  }

  useEffect(() => {
    if (!expanded) return undefined;
    closeButtonRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!result) return null;
  const trendLegs = [
    result.turbojet && { title: "Turbojet leg", list: [A_STATION, ...TJ_STATIONS] },
    result.ramjet && { title: "Ramjet leg", list: [A_STATION, ...RJ_STATIONS] },
  ].filter(Boolean);

  return (
    <>
      <div className="engine-diagram">
        <div className="engine-diagram-toolbar">
          <span className="engine-diagram-title">Live engine cutaway</span>
          <button type="button" ref={triggerRef} className="ed-expand-button" aria-haspopup="dialog" onClick={openModal}>
            ⤢ Expand
          </button>
        </div>
        <Diagram config={config} result={result} idSuffix="trj-inline" />
      </div>

      {expanded && createPortal(
        <div className="ed-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="ed-modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" ref={closeButtonRef} className="ed-modal-close" onClick={closeModal} aria-label="Close expanded diagram">
              ×
            </button>
            <div className="engine-diagram-toolbar">
              <span className="engine-diagram-title" id={titleId}>Live engine cutaway</span>
            </div>
            <div className="engine-diagram-scroll-big">
              <Diagram config={config} result={result} idSuffix="trj-modal" />
            </div>
            <div className="ed-trends">
              {trendLegs.flatMap((leg) => [
                <StationTrendChart
                  key={`${leg.title}-T`}
                  title={`${leg.title}: stagnation temperature`}
                  stations={leg.list}
                  values={leg.list.map((s) => result.stations[s.key].T0)}
                  unit="K"
                  color="#ff6f61"
                  decimals={0}
                />,
                <StationTrendChart
                  key={`${leg.title}-p`}
                  title={`${leg.title}: stagnation pressure`}
                  stations={leg.list}
                  values={leg.list.map((s) => result.stations[s.key].p0 / 1000)}
                  unit="kPa"
                  color="#2a78d6"
                  decimals={0}
                />,
              ])}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
