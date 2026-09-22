import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  StageBars, RadialWheel, FanBlades, FlowStreak, FlowMarquee, HousingFlange,
  InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * A live, clickable schematic of the engine being configured, drawn as a
 * half cutaway — the classic engineering convention for showing what's
 * inside a symmetric object: a solid riveted casing over the top half, an
 * axis-of-symmetry centerline, and the internal components exposed in the
 * "opened" lower half, with spinning compressor/turbine blades, a
 * multi-strand flow duct (cool near-white streaks warming to red as they
 * travel), and a flame that flickers in the combustor.
 *
 * Click any part — or a station marker — to pop up its values spelled
 * out in plain English next to it (see `partDetails`/`stationDetails`),
 * and use "Expand" to open the same live diagram larger in an overlay.
 * Purely illustrative: every number and color shown is derived directly
 * from `result` (see physics/engine.js); nothing here feeds back into
 * the solver.
 */

const VBOX_W = 920;
const VBOX_H = 200;
const CENTERLINE_Y = 100;
// Extra dead space reserved on each side of the viewBox purely so a
// station readout or part card centered (via translateX(-50%)) on a
// near-edge element has room to render without clipping against the
// scroll container's edge.
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 14;

const SECTION = {
  intake: { x0: 40, x1: 160 },
  compressor: { x0: 172, x1: 350 },
  combustor: { x0: 362, x1: 470 },
  turbine: { x0: 482, x1: 650 },
  nozzle: { x0: 662, x1: 860 },
};

// `seq` is this station's position in simple flow order (1st through the
// engine to 6th) — shown alongside the traditional textbook `key` so
// stations read as an obvious sequence even though the keys themselves
// jump from 5 to 9. That jump is intentional, not a typo: it's the
// standard gas-turbine station numbering (Cohen, Rogers & Saravanamuttoo,
// "Gas Turbine Theory"), which reserves stations 6, 7, and 8 for an
// afterburner/reheat section this model doesn't include. Renumbering the
// underlying keys would ripple through the physics modules, tests, and
// every other chart that indexes `stations["a"|"2"|"3"|"4"|"5"|"9"]`, for
// no functional benefit — so this is a display-only fix.
const STATIONS = [
  { key: "a", x: 20, name: "Freestream", seq: 1 },
  { key: "2", x: SECTION.intake.x1, name: "Intake exit", seq: 2 },
  { key: "3", x: SECTION.compressor.x1, name: "Compressor exit", seq: 3 },
  { key: "4", x: SECTION.combustor.x1, name: "Combustor exit", seq: 4 },
  { key: "5", x: SECTION.turbine.x1, name: "Turbine exit", seq: 5 },
  { key: "9", x: SECTION.nozzle.x1, name: "Nozzle exit", seq: 6 },
];

// The upper-half casing silhouette, as (x, yOffsetFromCenterline) control
// points — bulging out around the compressor and turbine, tapering at
// the intake nose and nozzle exit. Deliberately angular, matching the
// schematic style of the intake/nozzle wedges rather than a photoreal
// render.
const CASING_TOP = [
  [4, -14], [40, -44], [160, -50], [220, -64], [300, -72], [350, -58],
  [400, -52], [440, -66], [470, -56], [520, -52], [590, -70], [650, -50],
  [700, -46], [800, -40], [860, -34],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CENTERLINE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CENTERLINE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CENTERLINE_Y}`,
  `L ${CASING_TOP[0][0]} ${CENTERLINE_Y}`,
  "Z",
].join(" ");
// A handful of rivets along the casing's outer skin — purely decorative,
// picked from every other control point so they read as a seam of
// fasteners rather than a repeating pattern.
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

const FLOW_X0 = STATIONS[0].x;
const FLOW_X1 = STATIONS[STATIONS.length - 1].x;
// Several thin lanes instead of one thick duct — reads as an actual
// bundle of flow streamlines rather than a single fat pipe.
const FLOW_LANE_OFFSETS = [-6, -2, 2, 6];
// Three overlapping streaks per lane (rather than two) means a new one is
// always entering as the last one exits — no dead gap where the flow
// looks like it has stopped moving.
const STREAKS_PER_LANE = 3;

// Part buttons — an explicit, always-visible way to inspect a component,
// so nobody has to land a click on the small SVG shape itself.
const PART_BUTTONS = [
  { kind: "intake", label: "Intake" },
  { kind: "compressor", label: "Compressor" },
  { kind: "combustor", label: "Combustor" },
  { kind: "turbine", label: "Turbine" },
  { kind: "nozzle", label: "Nozzle" },
];

/** Plain-English value list for a clicked engine part (not a station marker). */
function partDetails(kind, result, config) {
  const { compressor, combustor, turbine, nozzle, stations } = result;
  switch (kind) {
    case "intake":
      return {
        title: "Intake",
        rows: [
          ["Inlet stagnation temperature", `${fmt(stations.a.T0, 1)} K`],
          ["Exit stagnation temperature", `${fmt(stations["2"].T0, 1)} K`],
          ["Exit stagnation pressure", `${fmtKPa(stations["2"].p0, 1)} kPa`],
        ],
      };
    case "compressor":
      return {
        title: `Compressor (${compressor.type})`,
        rows: [
          ["Inlet stagnation temperature", `${fmt(stations["2"].T0, 1)} K`],
          ["Exit stagnation temperature", `${fmt(stations["3"].T0, 1)} K`],
          ["Pressure ratio achieved", fmt(compressor.pi_actual, 3)],
          ["Stages", String(compressor.stages.length)],
          ...(compressor.type === "centrifugal"
            ? [["Blade tip speed U2 (you set this)", `${fmt(config.centrifugal_U2, 0)} m/s`]]
            : []),
        ],
      };
    case "combustor":
      return {
        title: "Combustor",
        rows: [
          ["Inlet stagnation temperature", `${fmt(stations["3"].T0, 1)} K`],
          ["Exit stagnation temperature (TIT)", `${fmt(stations["4"].T0, 1)} K`],
          ["Fuel-air ratio", fmt(combustor.f, 4)],
        ],
      };
    case "turbine":
      return {
        title: `Turbine (${turbine.type})`,
        rows: [
          ["Inlet stagnation temperature", `${fmt(stations["4"].T0, 1)} K`],
          ["Exit stagnation temperature", `${fmt(stations["5"].T0, 1)} K`],
          ["Expansion ratio achieved", fmt(1.0 / turbine.pr_actual, 3)],
          ...(turbine.type === "radial"
            ? [
                ["Spouting velocity (calculated)", `${fmt(turbine.V0_spouting, 1)} m/s`],
                ["Blade tip speed (calculated)", `${fmt(turbine.U2_sized, 1)} m/s`],
              ]
            : []),
        ],
      };
    case "nozzle":
      return {
        title: "Nozzle",
        rows: [
          ["Status", nozzle.choked ? "Choked" : "Unchoked (fully expanded)"],
          ["Exit temperature", `${fmt(nozzle.T_exit, 1)} K`],
          ["Exit pressure", `${fmtKPa(nozzle.p_exit, 1)} kPa`],
          ["Exit velocity", `${fmt(nozzle.V_exit, 1)} m/s`],
        ],
      };
    default:
      return null;
  }
}

/** Plain-English value list for a clicked station marker — the full row, spelled out. */
function stationDetails(key, name, seq, st) {
  return {
    title: `Step ${seq} — Station ${key} — ${name}`,
    rows: [
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

/** The actual diagram — rendered once inline, and again (with its own ids and its own click state) inside the expanded overlay. */
function Diagram({ config, result, idSuffix }) {
  const { stations, compressor, turbine } = result;
  const [selected, setSelected] = useState(null);

  const isAxialCompressor = config.compressor_type === "axial";
  const isAxialTurbine = config.turbine_type === "axial";
  const isConvDi = config.nozzle_type === "conv-di";

  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const compressorMid = (SECTION.compressor.x0 + SECTION.compressor.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const turbineMid = (SECTION.turbine.x0 + SECTION.turbine.x1) / 2;
  const nozzleMid = (SECTION.nozzle.x0 + SECTION.nozzle.x1) / 2;
  const PART_MIDPOINTS = {
    intake: intakeMid,
    compressor: compressorMid,
    combustor: combustorMid,
    turbine: turbineMid,
    nozzle: nozzleMid,
  };

  const tValues = STATIONS.map((s) => stations[s.key].T0);
  const tMin = Math.min(...tValues);
  const tMax = Math.max(...tValues);
  const gradientStops = STATIONS.map((s) => {
    const offset = ((s.x - FLOW_X0) / (FLOW_X1 - FLOW_X0)) * 100;
    const color = stationHeatColor(stations[s.key].T0, tMin, tMax);
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
        aria-label="Half-cutaway schematic of the configured engine, showing the internal flow path from intake to nozzle. Click any part for its values."
      >
        <defs>
          <linearGradient
            id={`ed-heat-flow-${idSuffix}`}
            gradientUnits="userSpaceOnUse"
            x1={FLOW_X0}
            y1={FLOW_Y}
            x2={FLOW_X1}
            y2={FLOW_Y}
          >
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

        {/* Solid upper-half casing — the "closed" side of the cutaway */}
        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {CASING_RIVETS.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CENTERLINE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        {/* Axis-of-symmetry centerline (dash-dot, the standard cutaway convention) */}
        <line x1="4" y1={CENTERLINE_Y} x2="900" y2={CENTERLINE_Y} className="ed-axis" />

        {/* Internal components — exposed in the "opened" lower half only */}
        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("intake", (SECTION.intake.x0 + SECTION.intake.x1) / 2)} label="Intake — click for values">
            <rect
              x={SECTION.intake.x0}
              y={CENTERLINE_Y - 40}
              width={SECTION.intake.x1 - SECTION.intake.x0}
              height="80"
              fill="transparent"
            />
            <polygon
              points={`${SECTION.intake.x0},${CENTERLINE_Y - 34} ${SECTION.intake.x1},${CENTERLINE_Y - 20} ${SECTION.intake.x1},${CENTERLINE_Y + 20} ${SECTION.intake.x0},${CENTERLINE_Y + 34}`}
              className="ed-intake"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("compressor", compressorMid)} label="Compressor — click for values">
            <rect
              x={SECTION.compressor.x0}
              y={CENTERLINE_Y - 56}
              width={SECTION.compressor.x1 - SECTION.compressor.x0}
              height="112"
              fill="transparent"
            />
            <HousingFlange
              x0={SECTION.compressor.x0}
              x1={SECTION.compressor.x1}
              yTop={CENTERLINE_Y - 56}
              yBot={CENTERLINE_Y + 56}
              boltCount={6}
            />
            {isAxialCompressor ? (
              <>
                <StageBars
                  x0={SECTION.compressor.x0}
                  x1={SECTION.compressor.x1}
                  count={config.n_compressor_stages}
                  growUp
                  className="ed-compressor"
                  centerlineY={CENTERLINE_Y}
                />
                <FanBlades cx={compressorMid} cy={CENTERLINE_Y} r={22} className="ed-fan-compressor" dur="2s" />
              </>
            ) : (
              <RadialWheel cx={compressorMid} cy={CENTERLINE_Y} r={44} className="ed-compressor" dur="2.4s" />
            )}
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", (SECTION.combustor.x0 + SECTION.combustor.x1) / 2)} label="Combustor — click for values">
            <rect
              x={SECTION.combustor.x0}
              y={CENTERLINE_Y - 56}
              width={SECTION.combustor.x1 - SECTION.combustor.x0}
              height="112"
              fill="transparent"
            />
            <rect
              x={SECTION.combustor.x0}
              y={CENTERLINE_Y - 46}
              width={SECTION.combustor.x1 - SECTION.combustor.x0}
              height="92"
              rx="14"
              className="ed-combustor"
            />
            <path
              d={`M ${SECTION.combustor.x0 + 18} ${CENTERLINE_Y + 18}
                  q 9 -30 18 0 q 9 -42 18 0 q 9 -30 18 0 q 9 -20 17 0`}
              className="ed-flame"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("turbine", turbineMid)} label="Turbine — click for values">
            <rect
              x={SECTION.turbine.x0}
              y={CENTERLINE_Y - 56}
              width={SECTION.turbine.x1 - SECTION.turbine.x0}
              height="112"
              fill="transparent"
            />
            <HousingFlange
              x0={SECTION.turbine.x0}
              x1={SECTION.turbine.x1}
              yTop={CENTERLINE_Y - 56}
              yBot={CENTERLINE_Y + 56}
              boltCount={5}
            />
            {isAxialTurbine ? (
              <>
                <StageBars
                  x0={SECTION.turbine.x0}
                  x1={SECTION.turbine.x1}
                  count={config.n_turbine_stages}
                  growUp={false}
                  className="ed-turbine"
                  centerlineY={CENTERLINE_Y}
                />
                <FanBlades cx={turbineMid} cy={CENTERLINE_Y} r={20} className="ed-fan-turbine" dur="1.5s" />
              </>
            ) : (
              <RadialWheel cx={turbineMid} cy={CENTERLINE_Y} r={40} className="ed-turbine" dur="1.3s" />
            )}
          </Clickable>

          <Clickable onSelect={() => selectPart("nozzle", nozzleMid)} label="Nozzle — click for values">
            <rect
              x={SECTION.nozzle.x0}
              y={CENTERLINE_Y - 40}
              width={SECTION.nozzle.x1 - SECTION.nozzle.x0}
              height="80"
              fill="transparent"
            />
            {isConvDi ? (
              <polygon
                points={`${SECTION.nozzle.x0},${CENTERLINE_Y - 30} ${nozzleMid},${CENTERLINE_Y - 7} ${SECTION.nozzle.x1},${CENTERLINE_Y - 20} ${SECTION.nozzle.x1},${CENTERLINE_Y + 20} ${nozzleMid},${CENTERLINE_Y + 7} ${SECTION.nozzle.x0},${CENTERLINE_Y + 30}`}
                className="ed-nozzle"
              />
            ) : (
              <polygon
                points={`${SECTION.nozzle.x0},${CENTERLINE_Y - 30} ${SECTION.nozzle.x1},${CENTERLINE_Y - 12} ${SECTION.nozzle.x1},${CENTERLINE_Y + 12} ${SECTION.nozzle.x0},${CENTERLINE_Y + 30}`}
                className="ed-nozzle"
              />
            )}
          </Clickable>

          {/* Heat-mapped flow — several thin streamlines, not one thick pipe */}
          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line
              key={i}
              x1={FLOW_X0}
              y1={FLOW_Y + dy}
              x2={FLOW_X1}
              y2={FLOW_Y + dy}
              className="ed-flow-lane"
              stroke={`url(#ed-heat-flow-${idSuffix})`}
              opacity={i === 1 || i === 2 ? 0.65 : 0.35}
            />
          ))}
          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line
              key={`marquee-${i}`}
              x1={FLOW_X0}
              y1={FLOW_Y + dy}
              x2={FLOW_X1}
              y2={FLOW_Y + dy}
              className="ed-flow-marquee"
              stroke={`url(#ed-flow-marquee-${idSuffix})`}
            />
          ))}
          {FLOW_LANE_OFFSETS.flatMap((dy, laneIdx) =>
            Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
              <FlowStreak
                key={`${laneIdx}-${j}`}
                y={FLOW_Y + dy}
                index={laneIdx * STREAKS_PER_LANE + j}
                count={FLOW_LANE_OFFSETS.length * STREAKS_PER_LANE}
                x0={FLOW_X0}
                x1={FLOW_X1}
              />
            ))
          )}
        </g>

        {STATIONS.map((s) => (
          <line
            key={s.key}
            x1={s.x}
            y1={CENTERLINE_Y - 58}
            x2={s.x}
            y2={CENTERLINE_Y + 58}
            className="ed-guide"
          />
        ))}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        {STATIONS.map((s) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            seqTotal={STATIONS.length}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or
        station marker, to see its numbers spelled out in plain English.
        Flow runs left to right: near-white and cool at the intake, warming
        to red through the compressor and combustor, cooling back down
        through the turbine and nozzle. Compressor: {compressor.type}.
        Turbine: {turbine.type}.
      </p>
      <p className="section-note">
        Each station marker shows &ldquo;Step 1&rdquo; through
        &ldquo;Step 6&rdquo; in simple flow order. The St. a/2/3/4/5/9
        labels underneath are the standard gas-turbine station numbers from
        the textbook this project is built from (Cohen, Rogers &amp;
        Saravanamuttoo) — they intentionally skip 6, 7, and 8, which that
        convention reserves for an afterburner/reheat section this model
        doesn&rsquo;t include, so 5 is followed by 9 rather than 6.
      </p>
      </div>
    </div>
  );
}

export default function EngineDiagram({ config, result }) {
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
        <Diagram config={config} result={result} idSuffix="inline" />
      </div>

      {expanded && createPortal(
        // Portaled to <body> — see InfoModal.jsx for why an in-place
        // "full-viewport" overlay isn't safe from a stacking-context
        // ancestor trapping it behind a later sibling.
        <div
          className="ed-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="ed-modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button
              type="button"
              ref={closeButtonRef}
              className="ed-modal-close"
              onClick={closeModal}
              aria-label="Close expanded diagram"
            >
              ×
            </button>
            <div className="engine-diagram-toolbar">
              <span className="engine-diagram-title" id={titleId}>Live engine cutaway</span>
            </div>
            <div className="engine-diagram-scroll-big">
              <Diagram config={config} result={result} idSuffix="modal" />
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
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
