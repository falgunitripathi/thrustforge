import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FlowStreak, FlowMarquee, InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured scramjet — same half-
 * cutaway convention as every other engine's diagram, but with NO
 * rotating machinery at all: no compressor, no turbine, no shaft, no
 * spinning glyphs. That absence is the scramjet's defining feature — a
 * long converging intake ramp does all the compression via the vehicle's
 * own speed, fuel is injected into a combustor whose flow is still
 * SUPERSONIC, and a diverging nozzle expands it back to ambient.
 * Stations follow the source (reference/scramjet.md §2): 1 = intake
 * inlet, 2 = combustor entrance, 3 = combustor exit, 4 = nozzle exit.
 */

const VBOX_W = 920;
const VBOX_H = 200;
const CENTERLINE_Y = 100;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 14;

const SECTION = {
  intake: { x0: 40, x1: 400 },
  combustor: { x0: 400, x1: 620 },
  nozzle: { x0: 620, x1: 880 },
};

// Internal duct half-height at each section boundary (drawn mirrored
// about the centerline, clipped to the lower half like the other
// diagrams' component shapes): converging intake, near-constant
// combustor, diverging nozzle.
const DUCT_H = { inlet: 62, combIn: 26, combOut: 30, exit: 64 };

const STATIONS = [
  { key: "1", x: SECTION.intake.x0, name: "Freestream / intake inlet", seq: 1 },
  { key: "2", x: SECTION.combustor.x0, name: "Combustor entrance", seq: 2 },
  { key: "3", x: SECTION.combustor.x1, name: "Combustor exit", seq: 3 },
  { key: "4", x: SECTION.nozzle.x1, name: "Nozzle exit", seq: 4 },
];
const TOTAL_STEPS = STATIONS.length;

// Upper-half vehicle silhouette: sharp forebody nose, cowl tapering in
// over the intake ramp, a thin combustor wall, then flaring out over the
// diverging nozzle.
const CASING_TOP = [
  [4, -8], [40, -70], [160, -60], [280, -48], [400, -36], [510, -38],
  [620, -42], [750, -60], [880, -74], [892, -64],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CENTERLINE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CENTERLINE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CENTERLINE_Y}`,
  `L ${CASING_TOP[0][0]} ${CENTERLINE_Y}`,
  "Z",
].join(" ");
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

const FLOW_X0 = STATIONS[0].x - 20;
const FLOW_X1 = STATIONS[STATIONS.length - 1].x;
const FLOW_LANE_OFFSETS = [-6, -2, 2, 6];
const STREAKS_PER_LANE = 3;

const INJECTOR_XS = [420, 448, 476];

const PART_BUTTONS = [
  { kind: "intake", label: "Intake" },
  { kind: "combustor", label: "Combustor" },
  { kind: "nozzle", label: "Nozzle" },
];

function partDetails(kind, result, config) {
  const { intake, combustor, nozzle, performance, stations } = result;
  switch (kind) {
    case "intake":
      return {
        title: "Intake (ramp compression — no compressor)",
        rows: [
          ["Flight Mach M1 → combustor-entrance Mach M2", `${fmt(stations["1"].M, 2)} → ${fmt(intake.M2, 2)} (still supersonic)`],
          ["Static temperature T1 → T2", `${fmt(stations["1"].T, 1)} K → ${fmt(intake.T2, 1)} K`],
          ["Static pressure p1 → p2", `${fmtKPa(stations["1"].p, 1)} kPa → ${fmtKPa(intake.p2, 1)} kPa`],
          ["Stagnation temperature T02", `${fmt(intake.T02, 1)} K`],
          ["Area ratio A2/A1", fmt(intake.A2_over_A1, 3)],
          ["Intake efficiency η_I (you set this)", fmt(config.eta_I, 3)],
          ["MIL-E-5007D recovery p02/p01 (reference only, not used)", fmt(intake.recovery_mil_e_5007d, 3)],
        ],
      };
    case "combustor":
      return {
        title: "Combustor (supersonic combustion)",
        rows: [
          ["Fuel-air ratio f (you set this)", fmt(combustor.f, 4)],
          ["Stagnation temperature T02 → T03", `${fmt(intake.T02, 1)} K → ${fmt(combustor.T03, 1)} K`],
          ["Temperature ratio T03/T02", fmt(combustor.T03_over_T02, 4)],
          ["Mach M2 → M3", `${fmt(intake.M2, 3)} → ${fmt(combustor.M3, 3)} (still supersonic)`],
          ["Static pressure p2 → p3", `${fmtKPa(intake.p2, 1)} kPa → ${fmtKPa(combustor.p3, 1)} kPa`],
          ["Static temperature T3", `${fmt(combustor.T3, 1)} K`],
        ],
      };
    case "nozzle":
      return {
        title: "Nozzle (diverging, fully expanded)",
        rows: [
          ["Static pressure p3 → p4", `${fmtKPa(combustor.p3, 1)} kPa → ${fmtKPa(nozzle.p4, 2)} kPa (= ambient)`],
          ["Static temperature T3 → T4", `${fmt(combustor.T3, 1)} K → ${fmt(nozzle.T4, 1)} K`],
          ["Exit velocity V4", `${fmt(nozzle.V4, 1)} m/s`],
          ["Flight velocity V1 (for comparison)", `${fmt(stations["1"].V, 1)} m/s`],
          ["Exit Mach", fmt(stations["4"].M, 3)],
          ["Nozzle efficiency η_N (you set this)", fmt(config.eta_N, 3)],
          ["Thrust", `${fmt(performance.thrust, 1)} N`],
        ],
      };
    default:
      return null;
  }
}

function stationDetails(key, name, seq, st) {
  return {
    title: `Step ${seq} — Station ${key} — ${name}`,
    rows: [
      ["Flow regime", st.M > 1 ? "Supersonic (M > 1)" : "Subsonic (M < 1)"],
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

function ductPolygon(x0, h0, x1, h1) {
  return `${x0},${CENTERLINE_Y - h0} ${x1},${CENTERLINE_Y - h1} ${x1},${CENTERLINE_Y + h1} ${x0},${CENTERLINE_Y + h0}`;
}

function Diagram({ config, result, idSuffix }) {
  const { stations } = result;
  const [selected, setSelected] = useState(null);

  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const nozzleMid = (SECTION.nozzle.x0 + SECTION.nozzle.x1) / 2;
  const PART_MIDPOINTS = { intake: intakeMid, combustor: combustorMid, nozzle: nozzleMid };

  // Static temperature drives the heat colour here (stagnation T0 is
  // flat across the intake and nozzle — adiabatic — so it would show
  // only a single step at the combustor). Static T shows the ram heating
  // in the intake, the burn, and the nozzle's expansion cooling.
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
        aria-label="Half-cutaway schematic of the configured scramjet: a long converging intake ramp, a supersonic combustor with fuel injectors, and a diverging nozzle — no compressor or turbine. Click any part for its values."
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

        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {CASING_RIVETS.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CENTERLINE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        <line x1="4" y1={CENTERLINE_Y} x2={SECTION.nozzle.x1 + 20} y2={CENTERLINE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("intake", intakeMid)} label="Intake — click for values">
            <rect x={SECTION.intake.x0} y={CENTERLINE_Y - 66} width={SECTION.intake.x1 - SECTION.intake.x0} height="132" fill="transparent" />
            <polygon points={ductPolygon(SECTION.intake.x0, DUCT_H.inlet, SECTION.intake.x1, DUCT_H.combIn)} className="ed-intake" />
            {/* Oblique shock train off the ramp — the intake compresses
                the air by turning it through shocks, not with blades. */}
            {[0, 1, 2].map((i) => {
              const x0 = SECTION.intake.x0 + 20 + i * 100;
              return (
                <line
                  key={i}
                  x1={x0}
                  y1={CENTERLINE_Y + DUCT_H.inlet - i * 11}
                  x2={x0 + 90}
                  y2={CENTERLINE_Y}
                  stroke="var(--text-muted)"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  opacity="0.7"
                />
              );
            })}
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", combustorMid)} label="Combustor — click for values">
            <rect x={SECTION.combustor.x0} y={CENTERLINE_Y - 40} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="80" fill="transparent" />
            <polygon points={ductPolygon(SECTION.combustor.x0, DUCT_H.combIn, SECTION.combustor.x1, DUCT_H.combOut)} className="ed-combustor" />
            {/* Fuel injectors: wall-mounted struts spraying into the
                supersonic stream. */}
            {INJECTOR_XS.map((x) => (
              <g key={x}>
                <line x1={x} y1={CENTERLINE_Y + DUCT_H.combIn + 1} x2={x + 6} y2={CENTERLINE_Y + 17} stroke="var(--ed-flame)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={x + 10} cy={CENTERLINE_Y + 14} r="1.6" fill="var(--ed-flame)" />
                <circle cx={x + 15} cy={CENTERLINE_Y + 12} r="1.2" fill="var(--ed-flame)" />
              </g>
            ))}
            <path
              d={`M ${SECTION.combustor.x0 + 90} ${CENTERLINE_Y + 18}
                  q 12 -14 24 0 q 12 -18 24 0 q 12 -14 24 0 q 12 -10 24 0`}
              className="ed-flame"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("nozzle", nozzleMid)} label="Nozzle — click for values">
            <rect x={SECTION.nozzle.x0} y={CENTERLINE_Y - 66} width={SECTION.nozzle.x1 - SECTION.nozzle.x0} height="132" fill="transparent" />
            <polygon points={ductPolygon(SECTION.nozzle.x0, DUCT_H.combOut, SECTION.nozzle.x1, DUCT_H.exit)} className="ed-nozzle" />
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
            oblique shocks compress the air — no compressor
          </text>
          <text x={combustorMid} y={CENTERLINE_Y + 50} textAnchor="middle" style={labelStyle} pointerEvents="none">
            supersonic combustion: M {fmt(stations["2"].M, 2)} → {fmt(stations["3"].M, 2)}
          </text>
          <text x={nozzleMid} y={CENTERLINE_Y + 86} textAnchor="middle" style={labelStyle} pointerEvents="none">
            expands to ambient — no turbine
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
            seqTotal={TOTAL_STEPS}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            // Every pair of adjacent stations is >= 220 viewBox units
            // (= px, since the svg renders at TOTAL_W) apart, wider than
            // any of these labels, so a single row is enough — no
            // stagger needed (checked with the overlap script in the
            // browser).
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
        Notice what&rsquo;s missing: there&rsquo;s no compressor, no turbine,
        and nothing spins. The long intake ramp squeezes the air using
        nothing but the vehicle&rsquo;s own speed (Mach{" "}
        {fmt(stations["1"].M, 1)} here), the combustor burns fuel in air
        that is <strong>still supersonic</strong> (Mach{" "}
        {fmt(stations["2"].M, 2)} in, {fmt(stations["3"].M, 2)} out), and
        the diverging nozzle expands the hot gas back to ambient pressure.
        The flow colour follows static temperature.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1&rdquo; through
        &ldquo;Step {TOTAL_STEPS}&rdquo; in simple flow order — the
        source&rsquo;s own four stations (1 = intake inlet, 2 = combustor
        entrance, 3 = combustor exit, 4 = nozzle exit). There&rsquo;s no
        separate freestream &ldquo;a&rdquo; station: station 1 is the
        free air at the intake lip.
      </p>
      </div>
    </div>
  );
}

export default function ScramjetEngineDiagram({ config, result }) {
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
        <Diagram config={config} result={result} idSuffix="sj-inline" />
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
              <Diagram config={config} result={result} idSuffix="sj-modal" />
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
                title="Mach number across stations (stays above 1)"
                stations={STATIONS}
                values={STATIONS.map((s) => result.stations[s.key].M)}
                unit="Mach"
                color="#8a7cf5"
                decimals={2}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
