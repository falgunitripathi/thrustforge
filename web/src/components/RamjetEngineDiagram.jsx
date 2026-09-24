import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FlowStreak, FlowMarquee, InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured ramjet — same half-cutaway
 * convention as every other engine's diagram, with no rotating machinery:
 * a centre-body spike and its shocks slow the air, a widening subsonic
 * diffuser slows it further, flame holders keep the flame lit in the
 * combustor, and the nozzle is drawn to match the chosen type
 * (convergent-divergent or convergent only). Stations a, 2, 4, 9 follow
 * the turbojet's numbering with 3 and 5 absent.
 */

const VBOX_W = 920;
const VBOX_H = 200;
const CENTERLINE_Y = 100;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 22;

const SECTION = {
  intake: { x0: 40, x1: 340 },
  combustor: { x0: 340, x1: 600 },
  nozzle: { x0: 600, x1: 880 },
};
const THROAT_X = 710;

// Internal duct half-heights (flow passage, mirrored about the centerline
// and clipped to the lower half like the other diagrams).
const DUCT_H = { lip: 44, diffExit: 60, throat: 36, exitCD: 62, exitConv: 38 };
const SPIKE = { tipX: -12, shoulderX: 90, shoulderH: 14, endX: 300 };

const STATIONS = [
  { key: "a", x: SECTION.intake.x0, name: "Freestream", seq: 1 },
  { key: "2", x: SECTION.combustor.x0, name: "Diffuser exit / combustor inlet", seq: 2 },
  { key: "4", x: SECTION.nozzle.x0, name: "Combustor exit / nozzle inlet", seq: 3 },
  { key: "9", x: SECTION.nozzle.x1, name: "Nozzle exit", seq: 4 },
];
const TOTAL_STEPS = STATIONS.length;

function casingPath(expanded) {
  const top = [
    [SECTION.intake.x0 - 2, -46], [150, -58], [SECTION.intake.x1, -70], [SECTION.nozzle.x0, -70],
    ...(expanded
      ? [[THROAT_X, -54], [SECTION.nozzle.x1, -72], [SECTION.nozzle.x1 + 10, -64]]
      : [[SECTION.nozzle.x1, -48], [SECTION.nozzle.x1 + 10, -42]]),
  ];
  const path = [
    `M ${top[0][0]} ${CENTERLINE_Y + top[0][1]}`,
    ...top.slice(1).map(([x, dy]) => `L ${x} ${CENTERLINE_Y + dy}`),
    `L ${top[top.length - 1][0]} ${CENTERLINE_Y}`,
    `L ${top[0][0]} ${CENTERLINE_Y}`,
    "Z",
  ].join(" ");
  return { path, rivets: top.filter((_, i) => i > 0 && i < top.length - 1) };
}

const FLOW_X0 = SPIKE.tipX - 20;
const FLOW_X1 = STATIONS[STATIONS.length - 1].x;
const FLOW_LANE_OFFSETS = [-5, -2, 2, 5];
const STREAKS_PER_LANE = 3;

const FLAMEHOLDER_X = 384;
const FLAMEHOLDER_YS = [18, 42];

const PART_BUTTONS = [
  { kind: "intake", label: "Intake / diffuser" },
  { kind: "combustor", label: "Combustor" },
  { kind: "nozzle", label: "Nozzle" },
];

function partDetails(kind, result, config) {
  const { atmosphere, intake, combustor, nozzle, performance } = result;
  switch (kind) {
    case "intake":
      return {
        title: "Intake / diffuser (ram compression — no compressor)",
        rows: [
          ["Flight Mach M (you set this)", fmt(config.mach_flight, 2)],
          ["Flight speed V", `${fmt(atmosphere.V_flight, 1)} m/s`],
          ["Ambient pressure p_a → diffuser exit p02", `${fmtKPa(atmosphere.p_a, 1)} kPa → ${fmtKPa(intake.p02, 1)} kPa`],
          ["Ram pressure ratio p02/p_a", fmt(intake.ram_pressure_ratio, 2)],
          ["Pressure recovery r_d = p02/p0a", fmt(intake.r_d, 3)],
          ["Stagnation temperature T0a = T02", `${fmt(intake.T02, 1)} K (unchanged: no work done)`],
          ["Intake efficiency η_d (you set this)", fmt(config.eta_d, 3)],
        ],
      };
    case "combustor":
      return {
        title: "Combustor (subsonic, with flame holders)",
        rows: [
          ["Temperature T02 → T04", `${fmt(intake.T02, 1)} K → ${fmt(combustor.T04, 1)} K`],
          ["Fuel-air ratio f", fmt(combustor.f, 4)],
          ["Stagnation pressure p02 → p04", `${fmtKPa(intake.p02, 1)} kPa → ${fmtKPa(combustor.p04, 1)} kPa`],
          ["Pressure kept r_c = p04/p02", fmt(combustor.r_c, 3)],
          ["Combustor efficiency η_b (you set this)", fmt(config.eta_b, 3)],
        ],
      };
    case "nozzle":
      return {
        title: config.nozzle_type === "expanded"
          ? "Nozzle (convergent-divergent, fully expanded)"
          : `Nozzle (convergent only${nozzle.choked ? ", choked" : ""})`,
        rows: [
          ["Pressure p04 → exit p9", `${fmtKPa(combustor.p04, 1)} kPa → ${fmtKPa(nozzle.p_exit, 1)} kPa${nozzle.choked ? "" : " (= ambient)"}`],
          ["Exit static temperature T9", `${fmt(nozzle.T_exit, 1)} K`],
          ["Exit velocity V9", `${fmt(nozzle.V_exit, 1)} m/s`],
          ["Flight velocity V (for comparison)", `${fmt(atmosphere.V_flight, 1)} m/s`],
          ["Exit Mach", fmt(nozzle.M_exit, 3)],
          ["Pressure thrust per kg/s of air", `${fmt(performance.pressure_thrust, 1)} N·s/kg`],
          ["Thrust", `${fmt(performance.thrust, 1)} N`],
        ],
      };
    default:
      return null;
  }
}

function stationDetails(key, name, seq, st) {
  const slow = key === "2" || key === "4";
  return {
    title: `Step ${seq} — Station ${key} — ${name}`,
    rows: [
      ["Flow regime", slow ? "Slow subsonic (treated as nearly at rest)" : st.M > 1 ? "Supersonic (M > 1)" : "Subsonic (M < 1)"],
      ["Stagnation temperature", `${fmt(st.T0, 1)} K`],
      ["Stagnation pressure", `${fmtKPa(st.p0, 1)} kPa`],
      ["Static temperature", `${fmt(st.T, 1)} K`],
      ["Static pressure", `${fmtKPa(st.p, 1)} kPa`],
      ["Mach number", fmt(st.M, 3)],
      ["Velocity", `${fmt(st.V, 1)} m/s`],
      ["Density", `${fmt(st.rho, 3)} kg/m³`],
      ["Static enthalpy", `${fmt(st.h / 1000, 1)} kJ/kg`],
      ["Stagnation enthalpy", `${fmt(st.h0 / 1000, 1)} kJ/kg`],
    ],
  };
}

/** [[x, halfHeight], ...] along the duct -> polygon mirrored about the centerline. */
function ductPolygon(pts) {
  const upper = pts.map(([x, h]) => `${x},${CENTERLINE_Y - h}`);
  const lower = [...pts].reverse().map(([x, h]) => `${x},${CENTERLINE_Y + h}`);
  return [...upper, ...lower].join(" ");
}

function Diagram({ config, result, idSuffix }) {
  const { stations, nozzle } = result;
  const [selected, setSelected] = useState(null);
  const expanded = config.nozzle_type === "expanded";
  const casing = casingPath(expanded);

  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const nozzleMid = (SECTION.nozzle.x0 + SECTION.nozzle.x1) / 2;
  const PART_MIDPOINTS = { intake: intakeMid, combustor: combustorMid, nozzle: nozzleMid };

  // Static temperature drives the heat colour: ram heating in the intake,
  // the burn, then the nozzle's expansion cooling.
  const sValues = STATIONS.map((s) => stations[s.key].T);
  const sMin = Math.min(...sValues);
  const sMax = Math.max(...sValues);
  const gradientStops = STATIONS.map((s) => {
    const offset = ((s.x - FLOW_X0) / (FLOW_X1 - FLOW_X0)) * 100;
    const color = stationHeatColor(stations[s.key].T, sMin, sMax);
    return <stop key={s.key} offset={`${offset}%`} stopColor={color} />;
  });

  function selectPart(kind, xMid) {
    const details = partDetails(kind, result, config);
    if (!details) return;
    setSelected({ details, leftPct: ((xMid + MARGIN) / TOTAL_W) * 100, kind });
  }
  function selectPartByKind(kind) {
    selectPart(kind, PART_MIDPOINTS[kind]);
  }
  function selectStation(s) {
    setSelected({
      details: stationDetails(s.key, s.name, s.seq, stations[s.key]),
      leftPct: ((s.x + MARGIN) / TOTAL_W) * 100,
      kind: null,
    });
  }
  function handleWrapperClick(e) {
    if (!selected) return;
    if (
      e.target.closest(".ed-part-card") ||
      e.target.closest(".ed-clickable") ||
      e.target.closest(".station-readout")
    ) {
      return;
    }
    setSelected(null);
  }

  const labelStyle = { fill: "var(--text-muted)", fontSize: 11, fontStyle: "italic" };
  const nozzlePts = expanded
    ? [[SECTION.nozzle.x0, DUCT_H.diffExit], [THROAT_X, DUCT_H.throat], [SECTION.nozzle.x1, DUCT_H.exitCD]]
    : [[SECTION.nozzle.x0, DUCT_H.diffExit], [SECTION.nozzle.x1, DUCT_H.exitConv]];

  return (
    <div className="ed-diagram-wrap">
      <InspectToolbar parts={PART_BUTTONS} activeKind={selected?.kind ?? null} onSelect={selectPartByKind} />
      <div className="engine-diagram-scroll" onClick={handleWrapperClick}>
      <div className="engine-diagram-viewport" style={{ width: TOTAL_W }}>
      <svg
        viewBox={`${-MARGIN} 0 ${TOTAL_W} ${VBOX_H}`}
        className="engine-diagram-svg"
        style={{ width: TOTAL_W }}
        role="img"
        aria-label="Half-cutaway schematic of the configured ramjet: an intake spike and widening diffuser, a combustor with flame holders, and a nozzle — no compressor or turbine. Click any part for its values."
      >
        <defs>
          <linearGradient id={`ed-heat-flow-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={FLOW_X0} y1={FLOW_Y} x2={FLOW_X1} y2={FLOW_Y}>
            {gradientStops}
          </linearGradient>
          <linearGradient id={`ed-metal-casing-${idSuffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbfcfe" />
            <stop offset="42%" stopColor="#e6e9f2" />
            <stop offset="55%" stopColor="#ced2e2" />
            <stop offset="100%" stopColor="#eef0f7" />
          </linearGradient>
          <clipPath id={`ed-lower-half-${idSuffix}`}>
            <rect x={-800} y={CENTERLINE_Y} width="2000" height="400" />
          </clipPath>
          <FlowMarquee idSuffix={idSuffix} />
        </defs>

        <path d={casing.path} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {casing.rivets.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CENTERLINE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        <line x1={SPIKE.tipX} y1={CENTERLINE_Y} x2={SECTION.nozzle.x1 + 20} y2={CENTERLINE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("intake", intakeMid)} label="Intake / diffuser — click for values">
            <rect x={SPIKE.tipX} y={CENTERLINE_Y - 66} width={SECTION.intake.x1 - SPIKE.tipX} height="132" fill="transparent" />
            <polygon points={ductPolygon([[SECTION.intake.x0, DUCT_H.lip], [SECTION.intake.x1, DUCT_H.diffExit]])} className="ed-intake" />
            {/* Centre-body spike: its cone turns the supersonic air through
                an oblique shock, then a normal shock drops it to subsonic. */}
            <polygon
              points={`${SPIKE.tipX},${CENTERLINE_Y} ${SPIKE.shoulderX},${CENTERLINE_Y + SPIKE.shoulderH} ${SPIKE.endX},${CENTERLINE_Y}`}
              className="ed-casing"
              fill={`url(#ed-metal-casing-${idSuffix})`}
            />
            <line x1={SPIKE.tipX} y1={CENTERLINE_Y} x2={SECTION.intake.x0} y2={CENTERLINE_Y + DUCT_H.lip}
              stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
            <line x1={SPIKE.shoulderX + 20} y1={CENTERLINE_Y + SPIKE.shoulderH - 3} x2={SPIKE.shoulderX + 20} y2={CENTERLINE_Y + 48}
              stroke="var(--text-muted)" strokeWidth="1.6" strokeDasharray="3 2" opacity="0.8" />
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", combustorMid)} label="Combustor — click for values">
            <rect x={SECTION.combustor.x0} y={CENTERLINE_Y - 66} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="132" fill="transparent" />
            <polygon points={ductPolygon([[SECTION.combustor.x0, DUCT_H.diffExit], [SECTION.combustor.x1, DUCT_H.diffExit]])} className="ed-combustor" />
            {/* Fuel spray bar, then V-gutter flame holders: they make a
                sheltered eddy where the flame can stay lit. */}
            {[14, 26, 38, 50].map((dy) => (
              <circle key={dy} cx={SECTION.combustor.x0 + 18} cy={CENTERLINE_Y + dy} r="1.6" fill="var(--ed-flame)" />
            ))}
            {FLAMEHOLDER_YS.map((dy) => (
              <path key={dy}
                d={`M ${FLAMEHOLDER_X + 12} ${CENTERLINE_Y + dy - 7} L ${FLAMEHOLDER_X} ${CENTERLINE_Y + dy} L ${FLAMEHOLDER_X + 12} ${CENTERLINE_Y + dy + 7}`}
                fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinejoin="round" />
            ))}
            {FLAMEHOLDER_YS.map((dy) => (
              <path key={`f${dy}`}
                d={`M ${FLAMEHOLDER_X + 16} ${CENTERLINE_Y + dy} q 14 -10 28 0 q 14 -12 28 0 q 14 -9 28 0 q 14 -7 28 0`}
                className="ed-flame" />
            ))}
          </Clickable>

          <Clickable onSelect={() => selectPart("nozzle", nozzleMid)} label="Nozzle — click for values">
            <rect x={SECTION.nozzle.x0} y={CENTERLINE_Y - 76} width={SECTION.nozzle.x1 - SECTION.nozzle.x0} height="152" fill="transparent" />
            <polygon points={ductPolygon(nozzlePts)} className="ed-nozzle" />
          </Clickable>

          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line key={i} x1={FLOW_X0} y1={FLOW_Y + dy} x2={FLOW_X1} y2={FLOW_Y + dy} className="ed-flow-lane" stroke={`url(#ed-heat-flow-${idSuffix})`} opacity={i === 1 || i === 2 ? 0.65 : 0.35} />
          ))}
          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line key={`marquee-${i}`} x1={FLOW_X0} y1={FLOW_Y + dy} x2={FLOW_X1} y2={FLOW_Y + dy} className="ed-flow-marquee" stroke={`url(#ed-flow-marquee-${idSuffix})`} />
          ))}
          {FLOW_LANE_OFFSETS.flatMap((dy, laneIdx) =>
            Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
              <FlowStreak key={`${laneIdx}-${j}`} y={FLOW_Y + dy} index={laneIdx * STREAKS_PER_LANE + j} count={FLOW_LANE_OFFSETS.length * STREAKS_PER_LANE} x0={FLOW_X0} x1={FLOW_X1} />
            ))
          )}

          <text x={intakeMid} y={CENTERLINE_Y + 86} textAnchor="middle" style={labelStyle} pointerEvents="none">
            shocks + widening duct slow the air — no compressor
          </text>
          <text x={combustorMid} y={CENTERLINE_Y + 76} textAnchor="middle" style={labelStyle} pointerEvents="none">
            flame holders: {fmt(stations["2"].T0, 0)} K → {fmt(stations["4"].T0, 0)} K
          </text>
          <text x={nozzleMid} y={CENTERLINE_Y + 86} textAnchor="middle" style={labelStyle} pointerEvents="none">
            {nozzle.choked ? "choked at Mach 1 — no turbine" : "expands to ambient — no turbine"}
          </text>
        </g>

        {STATIONS.map((s) => (
          <line key={s.key} x1={s.x} y1={CENTERLINE_Y - 74} x2={s.x} y2={CENTERLINE_Y + 70} className="ed-guide" />
        ))}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        {STATIONS.map((s) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            // Adjacent stations are >= 260 px apart — one row is enough.
            top={0}
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or
        station marker, to see its numbers spelled out in plain English.
        Nothing spins: the spike&rsquo;s shock waves and the widening duct
        squeeze the air using only the vehicle&rsquo;s speed (Mach{" "}
        {fmt(config.mach_flight, 1)} here, a {fmt(result.intake.ram_pressure_ratio, 1)}× pressure
        rise), flame holders keep the fire lit in slow-moving air, and the
        nozzle turns the hot, high-pressure gas into a fast jet. The flow
        colour follows static temperature.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1&rdquo; through &ldquo;Step {TOTAL_STEPS}&rdquo; in flow
        order. The station numbers (a, 2, 4, 9) match the turbojet&rsquo;s — 3 and 5 are missing
        because there&rsquo;s no compressor or turbine.
      </p>
      </div>
    </div>
  );
}

export default function RamjetEngineDiagram({ config, result }) {
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

  return (
    <>
      <div className="engine-diagram">
        <div className="engine-diagram-toolbar">
          <span className="engine-diagram-title">Live engine cutaway</span>
          <button type="button" ref={triggerRef} className="ed-expand-button" aria-haspopup="dialog" onClick={openModal}>
            ⤢ Expand
          </button>
        </div>
        <Diagram config={config} result={result} idSuffix="rj-inline" />
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
              <Diagram config={config} result={result} idSuffix="rj-modal" />
            </div>

            <div className="ed-trends">
              <StationTrendChart
                title="Stagnation temperature across stations"
                stations={STATIONS}
                values={STATIONS.map((s) => result.stations[s.key].T0)}
                unit="K"
                color="#ff6f61"
                decimals={0}
              />
              <StationTrendChart
                title="Stagnation pressure across stations"
                stations={STATIONS}
                values={STATIONS.map((s) => result.stations[s.key].p0 / 1000)}
                unit="kPa"
                color="#2a78d6"
                decimals={0}
              />
              <StationTrendChart
                title="Static temperature across stations"
                stations={STATIONS}
                values={STATIONS.map((s) => result.stations[s.key].T)}
                unit="K"
                color="#8a7cf5"
                decimals={0}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
