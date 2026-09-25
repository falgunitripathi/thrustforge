import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FanBlades, FlowStreak, FlowMarquee, HousingFlange, InspectToolbar, Clickable,
  StationReadout, PartCard, StationTrendChart, AfterburnerToggle,
} from "./engineDiagramParts.jsx";

/**
 * Live half-cutaway of the two-spool turbojet: LP compressor + LP turbine
 * on the outer shaft, HP compressor + HP turbine on the inner one, colour-
 * coded so the pairs read at a glance, then the optional afterburner and
 * the nozzle. Stations a, 2-7, 8 (afterburner exit, only when lit), 9.
 */

const VBOX_W = 920;
const VBOX_H = 210;
const CENTERLINE_Y = 100;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 14;
const LANES = [-6, -2, 2, 6];
const STREAKS = 3;
const LP_COLOR = "#2aa198";
const HP_COLOR = "#8a7cf5";

function layout(ab) {
  const S = {
    intake: { x0: 40, x1: 150 },
    lpc: { x0: 160, x1: 270 },
    hpc: { x0: 282, x1: 392 },
    combustor: { x0: 404, x1: 494 },
    hpt: { x0: 506, x1: 576 },
    lpt: { x0: 588, x1: 668 },
  };
  let x = 680;
  if (ab) { S.afterburner = { x0: x, x1: x + 90 }; x += 90; }
  S.nozzle = { x0: x, x1: 870 };
  const list = [
    { key: "a", x: 20, name: "Freestream" },
    { key: "2", x: S.intake.x1, name: "Intake exit" },
    { key: "3", x: S.lpc.x1, name: "LPC exit" },
    { key: "4", x: S.hpc.x1, name: "HPC exit" },
    { key: "5", x: S.combustor.x1, name: "Combustor exit" },
    { key: "6", x: S.hpt.x1, name: "HPT exit" },
    { key: "7", x: S.lpt.x1, name: "LPT exit" },
    ...(ab ? [{ key: "8", x: S.afterburner.x1, name: "Afterburner exit" }] : []),
    { key: "9", x: S.nozzle.x1, name: "Nozzle exit" },
  ].map((s, i) => ({ ...s, seq: i + 1 }));
  const parts = [
    { kind: "intake", label: "Intake" },
    { kind: "lpc", label: "LPC" },
    { kind: "hpc", label: "HPC" },
    { kind: "combustor", label: "Combustor" },
    { kind: "hpt", label: "HPT" },
    { kind: "lpt", label: "LPT" },
    ...(ab ? [{ kind: "afterburner", label: "Afterburner" }] : []),
    { kind: "nozzle", label: "Nozzle" },
  ];
  return { S, stations: list, parts };
}

function partDetails(kind, result) {
  const { config, intake, lpc, hpc, combustor, hpt, lpt, afterburner: ab, nozzle, performance, atmosphere } = result;
  switch (kind) {
    case "intake":
      return { title: "Intake", rows: [
        ["Flight speed", `${fmt(atmosphere.V_flight, 1)} m/s`],
        ["Exit stagnation temperature T02", `${fmt(intake.T02, 1)} K`],
        ["Exit stagnation pressure p02", `${fmtKPa(intake.p02, 1)} kPa`],
      ] };
    case "lpc":
      return { title: "LPC — Low-Pressure Compressor (LP spool, outer shaft)", rows: [
        ["Pressure ratio (you set this)", fmt(config.pi_LPC, 2)],
        ["Temperature T02 → T03", `${fmt(intake.T02, 1)} K → ${fmt(lpc.T03, 1)} K`],
        ["Pressure p02 → p03", `${fmtKPa(intake.p02, 1)} kPa → ${fmtKPa(lpc.p03, 1)} kPa`],
        ["Driven by", "the LP turbine, through the outer shaft"],
      ] };
    case "hpc":
      return { title: "HPC — High-Pressure Compressor (HP spool, inner shaft)", rows: [
        ["Pressure ratio (you set this)", fmt(config.pi_HPC, 2)],
        ["Temperature T03 → T04", `${fmt(lpc.T03, 1)} K → ${fmt(hpc.T04, 1)} K`],
        ["Pressure p03 → p04", `${fmtKPa(lpc.p03, 1)} kPa → ${fmtKPa(hpc.p04, 1)} kPa`],
        ["Driven by", "the HP turbine, through the inner shaft"],
      ] };
    case "combustor":
      return { title: "Combustor", rows: [
        ["Temperature T04 → T05", `${fmt(hpc.T04, 1)} K → ${fmt(combustor.T05, 1)} K`],
        ["Fuel-air ratio f", fmt(combustor.f, 4)],
        ["Pressure p04 → p05", `${fmtKPa(hpc.p04, 1)} kPa → ${fmtKPa(combustor.p05, 1)} kPa`],
      ] };
    case "hpt":
      return { title: "HPT — High-Pressure Turbine (drives the HPC)", rows: [
        ["Temperature T05 → T06", `${fmt(combustor.T05, 1)} K → ${fmt(hpt.T06, 1)} K`],
        ["Pressure p05 → p06", `${fmtKPa(combustor.p05, 1)} kPa → ${fmtKPa(hpt.p06, 1)} kPa`],
        ["Work to the HPC, per kg of air", `${fmt(hpt.work / 1000, 1)} kJ/kg`],
      ] };
    case "lpt":
      return { title: "LPT — Low-Pressure Turbine (drives the LPC)", rows: [
        ["Temperature T06 → T07", `${fmt(hpt.T06, 1)} K → ${fmt(lpt.T07, 1)} K`],
        ["Pressure p06 → p07", `${fmtKPa(hpt.p06, 1)} kPa → ${fmtKPa(lpt.p07, 1)} kPa`],
        ["Work to the LPC, per kg of air", `${fmt(lpt.work / 1000, 1)} kJ/kg`],
      ] };
    case "afterburner":
      return { title: "Afterburner (lit)", rows: [
        ["Temperature T07 → T08", `${fmt(ab.T07, 1)} K → ${fmt(ab.T08, 1)} K`],
        ["Extra fuel-air ratio f_ab", fmt(ab.fab, 4)],
        ["Pressure p07 → p08", `${fmtKPa(ab.p07, 1)} kPa → ${fmtKPa(ab.p08, 1)} kPa`],
      ] };
    case "nozzle":
      return { title: `Nozzle (convergent${nozzle.choked ? ", choked" : ""})`, rows: [
        ["Exit velocity V9", `${fmt(nozzle.V_exit, 1)} m/s`],
        ["Exit pressure p9", `${fmtKPa(nozzle.p_exit, 1)} kPa`],
        ["Exit temperature T9", `${fmt(nozzle.T_exit, 1)} K`],
        ["Thrust", `${fmt(performance.thrust, 1)} N`],
      ] };
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

const CASING_TOP = [
  [4, -14], [40, -44], [160, -54], [270, -66], [392, -58], [440, -64],
  [494, -56], [576, -60], [668, -52], [760, -46], [870, -38],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CENTERLINE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CENTERLINE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CENTERLINE_Y}`,
  `L ${CASING_TOP[0][0]} ${CENTERLINE_Y}`,
  "Z",
].join(" ");

function Diagram({ config, result, idSuffix }) {
  const { stations } = result;
  const [selected, setSelected] = useState(null);
  const ab = !!config.afterburner_on;
  const { S, stations: STATIONS, parts } = layout(ab);
  const mid = (k) => (S[k].x0 + S[k].x1) / 2;
  const x0 = STATIONS[0].x, x1 = STATIONS[STATIONS.length - 1].x;
  const Ts = STATIONS.map((s) => stations[s.key].T0);
  const lo = Math.min(...Ts), hi = Math.max(...Ts);

  function selectPart(kind) {
    const details = partDetails(kind, result);
    if (details) setSelected({ details, leftPct: ((mid(kind) + MARGIN) / TOTAL_W) * 100, kind });
  }
  function selectStation(s) {
    setSelected({ details: stationDetails(s, stations[s.key]), leftPct: ((s.x + MARGIN) / TOTAL_W) * 100, kind: null });
  }
  function handleWrapperClick(e) {
    if (!selected) return;
    if (e.target.closest(".ed-part-card") || e.target.closest(".ed-clickable") || e.target.closest(".station-readout")) return;
    setSelected(null);
  }

  const spool = (key, label, color, isTurbine) => (
    <Clickable onSelect={() => selectPart(key)} label={`${label} — click for values`}>
      <rect x={S[key].x0} y={CENTERLINE_Y - 50} width={S[key].x1 - S[key].x0} height="100" fill="transparent" />
      <HousingFlange x0={S[key].x0} x1={S[key].x1} yTop={CENTERLINE_Y - 50} yBot={CENTERLINE_Y + 50} boltCount={4} />
      <FanBlades cx={mid(key)} cy={CENTERLINE_Y} r={isTurbine ? 20 : 24} count={10}
        className={isTurbine ? "ed-fan-turbine" : "ed-fan-compressor"} dur={color === HP_COLOR ? "1.1s" : "1.8s"} />
      <rect x={S[key].x0 + 4} y={CENTERLINE_Y + 42} width={S[key].x1 - S[key].x0 - 8} height="6" rx="3" fill={color} opacity="0.85" />
    </Clickable>
  );

  return (
    <div className="ed-diagram-wrap">
      <InspectToolbar parts={parts} activeKind={selected?.kind ?? null} onSelect={selectPart} />
      <div className="engine-diagram-scroll" onClick={handleWrapperClick}>
      <div className="engine-diagram-viewport" style={{ width: TOTAL_W }}>
      <svg viewBox={`${-MARGIN} 0 ${TOTAL_W} ${VBOX_H}`} className="engine-diagram-svg" style={{ width: TOTAL_W }} role="img"
        aria-label="Half-cutaway of a two-spool turbojet: LP compressor and LP turbine on the outer shaft, HP compressor and HP turbine on the inner shaft, then the nozzle. Click any part for its values.">
        <defs>
          <linearGradient id={`ed-heat-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={x0} y1={FLOW_Y} x2={x1} y2={FLOW_Y}>
            {STATIONS.map((s) => (
              <stop key={s.key} offset={`${((s.x - x0) / (x1 - x0)) * 100}%`} stopColor={stationHeatColor(stations[s.key].T0, lo, hi)} />
            ))}
          </linearGradient>
          <linearGradient id={`ed-metal-${idSuffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbfcfe" />
            <stop offset="42%" stopColor="#e6e9f2" />
            <stop offset="55%" stopColor="#ced2e2" />
            <stop offset="100%" stopColor="#eef0f7" />
          </linearGradient>
          <clipPath id={`ed-lower-${idSuffix}`}>
            <rect x={-800} y={CENTERLINE_Y} width="2000" height="400" />
          </clipPath>
          <FlowMarquee idSuffix={idSuffix} />
        </defs>

        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-${idSuffix})`} />
        <line x1="4" y1={CENTERLINE_Y} x2="900" y2={CENTERLINE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("intake")} label="Intake — click for values">
            <rect x={S.intake.x0} y={CENTERLINE_Y - 40} width={S.intake.x1 - S.intake.x0} height="80" fill="transparent" />
            <polygon points={`${S.intake.x0},${CENTERLINE_Y - 34} ${S.intake.x1},${CENTERLINE_Y - 20} ${S.intake.x1},${CENTERLINE_Y + 20} ${S.intake.x0},${CENTERLINE_Y + 34}`} className="ed-intake" />
          </Clickable>

          {spool("lpc", "LPC", LP_COLOR, false)}
          {spool("hpc", "HPC", HP_COLOR, false)}

          <Clickable onSelect={() => selectPart("combustor")} label="Combustor — click for values">
            <rect x={S.combustor.x0} y={CENTERLINE_Y - 50} width={S.combustor.x1 - S.combustor.x0} height="100" fill="transparent" />
            <rect x={S.combustor.x0} y={CENTERLINE_Y - 44} width={S.combustor.x1 - S.combustor.x0} height="88" rx="12" className="ed-combustor" />
            <path d={`M ${S.combustor.x0 + 14} ${CENTERLINE_Y + 18} q 8 -28 16 0 q 8 -38 16 0 q 8 -28 16 0 q 8 -18 16 0`} className="ed-flame" />
          </Clickable>

          {spool("hpt", "HPT", HP_COLOR, true)}
          {spool("lpt", "LPT", LP_COLOR, true)}

          {/* Two concentric shafts: the HP one (short, inner) and the LP one (long, outer) */}
          <line x1={mid("hpc")} y1={CENTERLINE_Y + 30} x2={mid("hpt")} y2={CENTERLINE_Y + 30} stroke={HP_COLOR} strokeWidth="4" strokeLinecap="round" />
          <line x1={mid("lpc")} y1={CENTERLINE_Y + 36} x2={mid("lpt")} y2={CENTERLINE_Y + 36} stroke={LP_COLOR} strokeWidth="4" strokeLinecap="round" />

          {ab && (
            <Clickable onSelect={() => selectPart("afterburner")} label="Afterburner — click for values">
              <rect x={S.afterburner.x0} y={CENTERLINE_Y - 40} width={S.afterburner.x1 - S.afterburner.x0} height="80" fill="transparent" />
              <rect x={S.afterburner.x0} y={CENTERLINE_Y - 32} width={S.afterburner.x1 - S.afterburner.x0} height="64" rx="6" className="ed-combustor" />
              {[8, 18, 28].map((dy) => (
                <circle key={dy} cx={S.afterburner.x0 + 10} cy={CENTERLINE_Y + dy} r="1.8" fill="var(--ed-flame)" />
              ))}
              <path d={`M ${S.afterburner.x0 + 24} ${CENTERLINE_Y + 20} q 9 -22 18 0 q 9 -28 18 0 q 9 -22 18 0 q 8 -14 16 0`} className="ed-flame" />
            </Clickable>
          )}

          <Clickable onSelect={() => selectPart("nozzle")} label="Nozzle — click for values">
            <rect x={S.nozzle.x0} y={CENTERLINE_Y - 40} width={S.nozzle.x1 - S.nozzle.x0} height="80" fill="transparent" />
            <polygon points={`${S.nozzle.x0},${CENTERLINE_Y - 30} ${S.nozzle.x1},${CENTERLINE_Y - 12} ${S.nozzle.x1},${CENTERLINE_Y + 12} ${S.nozzle.x0},${CENTERLINE_Y + 30}`} className="ed-nozzle" />
          </Clickable>

          {LANES.map((dy, i) => (
            <line key={i} x1={x0} y1={FLOW_Y + dy} x2={x1} y2={FLOW_Y + dy} className="ed-flow-lane" stroke={`url(#ed-heat-${idSuffix})`} opacity={i === 1 || i === 2 ? 0.65 : 0.35} />
          ))}
          {LANES.map((dy, i) => (
            <line key={`m${i}`} x1={x0} y1={FLOW_Y + dy} x2={x1} y2={FLOW_Y + dy} className="ed-flow-marquee" stroke={`url(#ed-flow-marquee-${idSuffix})`} />
          ))}
          {LANES.flatMap((dy, li) => Array.from({ length: STREAKS }, (_, j) => (
            <FlowStreak key={`${li}-${j}`} y={FLOW_Y + dy} index={li * STREAKS + j} count={LANES.length * STREAKS} x0={x0} x1={x1} />
          )))}
        </g>

        {STATIONS.map((s) => (
          <line key={s.key} x1={s.x} y1={CENTERLINE_Y - 60} x2={s.x} y2={CENTERLINE_Y + 56} className="ed-guide" />
        ))}
        <g fontSize="10.5" fontWeight="600">
          <rect x={S.lpc.x0} y={CENTERLINE_Y + 62} width="10" height="5" rx="2" fill={LP_COLOR} />
          <text x={S.lpc.x0 + 14} y={CENTERLINE_Y + 68} fill="var(--text-muted)">LP spool (outer shaft): LPC ↔ LPT</text>
          <rect x={S.combustor.x0 + 30} y={CENTERLINE_Y + 62} width="10" height="5" rx="2" fill={HP_COLOR} />
          <text x={S.combustor.x0 + 44} y={CENTERLINE_Y + 68} fill="var(--text-muted)">HP spool (inner shaft): HPC ↔ HPT</text>
        </g>
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        {STATIONS.map((s, i) => (
          <StationReadout key={s.key} station={s.key} seq={s.seq} name={s.name}
            T0={stations[s.key].T0} p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            top={i % 2 === 1 ? 70 : 0}
            onSelect={() => selectStation(s)} />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or station marker, to see its numbers.
        Two shafts run one inside the other: the LP turbine at the back turns the LP compressor at the front
        (teal), and the HP turbine turns the HP compressor right next to it (purple), each at its own best speed.
        The flow colour follows stagnation temperature.
      </p>
      </div>
    </div>
  );
}

export default function TwinSpoolTurbojetEngineDiagram({ config, result, onToggleAfterburner }) {
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
  const trend = layout(!!config.afterburner_on).stations;

  return (
    <>
      <div className="engine-diagram">
        <div className="engine-diagram-toolbar">
          <span className="engine-diagram-title">Live engine cutaway</span>
          <AfterburnerToggle config={config} onToggle={onToggleAfterburner} />
          <button type="button" ref={triggerRef} className="ed-expand-button" aria-haspopup="dialog" onClick={openModal}>
            ⤢ Expand
          </button>
        </div>
        <Diagram config={config} result={result} idSuffix="ts-inline" />
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
              <Diagram config={config} result={result} idSuffix="ts-modal" />
            </div>
            <div className="ed-trends">
              <StationTrendChart title="Stagnation temperature across stations" stations={trend}
                values={trend.map((s) => result.stations[s.key].T0)} unit="K" color="#ff6f61" decimals={0} />
              <StationTrendChart title="Stagnation pressure across stations" stations={trend}
                values={trend.map((s) => result.stations[s.key].p0 / 1000)} unit="kPa" color="#2a78d6" decimals={0} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
