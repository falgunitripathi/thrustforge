import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  StageBars, RadialWheel, FanBlades, PropellerBlades, FlowStreak, FlowMarquee,
  HousingFlange, InspectToolbar, Clickable, StationReadout, PartStepReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured turboprop — same half-
 * cutaway convention and interaction model as the turbojet's
 * EngineDiagram.jsx (see that file's own docstring), with a propeller
 * and reduction gearbox added ahead of the intake, connected to the
 * turbine by a drive shaft running back through the core. The gas-path
 * flow (heat-mapped streamlines) only runs intake->nozzle, same six
 * stations as the turbojet (a,2,3,4,5,9) — the propeller moves a much
 * larger, separate stream of ambient air that isn't part of this duct,
 * which is why it isn't drawn with flow streaks of its own.
 */

const VBOX_W = 920;
const VBOX_H = 200;
const CENTERLINE_Y = 100;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 14;

const SECTION = {
  propeller: { x0: 20, x1: 108 },
  gearbox: { x0: 120, x1: 168 },
  intake: { x0: 188, x1: 290 },
  compressor: { x0: 302, x1: 460 },
  combustor: { x0: 472, x1: 560 },
  turbine: { x0: 572, x1: 700 },
  nozzle: { x0: 712, x1: 860 },
};

// Step 1 is the propeller itself (rendered separately below, as a
// PartStepReadout rather than a flow-station StationReadout, since it
// has no T0/p0 — it moves a separate air stream, not this duct's flow).
// Every flow station's own seq is shifted +1 to make room for it.
const PROPELLER_SEQ = 1;
const STATIONS = [
  { key: "a", x: SECTION.intake.x0 - 10, name: "Freestream", seq: 2 },
  { key: "2", x: SECTION.intake.x1, name: "Intake exit", seq: 3 },
  { key: "3", x: SECTION.compressor.x1, name: "Compressor exit", seq: 4 },
  { key: "4", x: SECTION.combustor.x1, name: "Combustor exit", seq: 5 },
  { key: "5", x: SECTION.turbine.x1, name: "Turbine exit", seq: 6 },
  { key: "9", x: SECTION.nozzle.x1, name: "Nozzle exit", seq: 7 },
];
const TOTAL_STEPS = STATIONS.length + 1;

// Same casing silhouette as the turbojet's EngineDiagram, shifted right to
// clear the propeller/gearbox added ahead of the intake.
const CASING_SHIFT = 148;
const CASING_TOP_BASE = [
  [4, -14], [40, -44], [160, -50], [220, -64], [300, -72], [350, -58],
  [400, -52], [440, -66], [470, -56], [520, -52], [590, -70], [650, -50],
  [700, -46], [800, -40], [860, -34],
];
const CASING_TOP = CASING_TOP_BASE.map(([x, dy]) => [x + CASING_SHIFT, dy]);
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CENTERLINE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CENTERLINE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CENTERLINE_Y}`,
  `L ${CASING_TOP[0][0]} ${CENTERLINE_Y}`,
  "Z",
].join(" ");
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

const FLOW_X0 = STATIONS[0].x;
const FLOW_X1 = STATIONS[STATIONS.length - 1].x;
const FLOW_LANE_OFFSETS = [-6, -2, 2, 6];
const STREAKS_PER_LANE = 3;

const PART_BUTTONS = [
  { kind: "propeller", label: "Propeller" },
  { kind: "intake", label: "Intake" },
  { kind: "compressor", label: "Compressor" },
  { kind: "combustor", label: "Combustor" },
  { kind: "turbine", label: "Turbine" },
  { kind: "nozzle", label: "Nozzle" },
];

/** Plain-English value list for a clicked engine part (not a station marker). */
function partDetails(kind, result, config) {
  const { compressor, combustor, turbine, nozzle, propeller, performance, stations } = result;
  switch (kind) {
    case "propeller":
      return {
        title: "Propeller (via reduction gearbox)",
        rows: [
          ["Shaft power delivered", `${fmt(propeller.shaft_power_W / 1000, 1)} kW`],
          ["Power split α (configured)", fmt(performance.alpha, 3)],
          ["Power split α (optimal, this flight condition)", fmt(performance.alpha_opt, 3)],
          ["Propeller thrust", `${fmt(propeller.Tpr, 1)} N`],
          ["Propeller efficiency (you set this)", fmt(config.eta_Pr, 2)],
          ["Gearbox efficiency (you set this)", fmt(config.eta_g, 3)],
        ],
      };
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
          ["Shaft power sent forward to propeller", `${fmt(propeller.shaft_power_W / 1000, 1)} kW`],
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
        title: "Nozzle (residual jet)",
        rows: [
          ["Exit temperature", `${fmt(nozzle.T_exit, 1)} K`],
          ["Exit pressure", `${fmtKPa(nozzle.p_exit, 1)} kPa (fully expanded to ambient)`],
          ["Exit velocity", `${fmt(nozzle.V_exit, 1)} m/s`],
          ["Nozzle thrust", `${fmt(propeller.Tn, 1)} N`],
        ],
      };
    default:
      return null;
  }
}

/** Plain-English value list for a clicked station marker — the full row, spelled out. */
function stationDetails(key, name, seq, st) {
  return {
    title: `Step ${seq} of ${TOTAL_STEPS} — Station ${key} — ${name}`,
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

function Diagram({ config, result, idSuffix }) {
  const { stations, compressor, turbine, propeller } = result;
  const [selected, setSelected] = useState(null);

  const isAxialCompressor = config.compressor_type === "axial";
  const isAxialTurbine = config.turbine_type === "axial";

  const propellerMid = (SECTION.propeller.x0 + SECTION.propeller.x1) / 2;
  const gearboxMid = (SECTION.gearbox.x0 + SECTION.gearbox.x1) / 2;
  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const compressorMid = (SECTION.compressor.x0 + SECTION.compressor.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const turbineMid = (SECTION.turbine.x0 + SECTION.turbine.x1) / 2;
  const nozzleMid = (SECTION.nozzle.x0 + SECTION.nozzle.x1) / 2;
  const PART_MIDPOINTS = {
    propeller: propellerMid, intake: intakeMid, compressor: compressorMid,
    combustor: combustorMid, turbine: turbineMid, nozzle: nozzleMid,
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
      <svg
        viewBox={`${-MARGIN} 0 ${TOTAL_W} ${VBOX_H}`}
        className="engine-diagram-svg"
        style={{ width: TOTAL_W }}
        role="img"
        aria-label="Half-cutaway schematic of the configured turboprop, showing the propeller, reduction gearbox, and internal gas path from intake to nozzle. Click any part for its values."
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

        {/* Solid upper-half casing over intake-through-nozzle */}
        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {CASING_RIVETS.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CENTERLINE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        {/* Drive shaft — runs from the gearbox back through the core to the
            turbine hub, along the same axis of symmetry. Clipped to the
            lower ("opened") half like every other internal, and drawn
            before the gas-path flow so the flow reads on top of it. */}
        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <line x1={SECTION.gearbox.x0} y1={CENTERLINE_Y} x2={turbineMid} y2={CENTERLINE_Y} className="ed-shaft" />
        </g>

        {/* Axis-of-symmetry centerline (dash-dot, the standard cutaway convention) */}
        <line x1="4" y1={CENTERLINE_Y} x2={SECTION.nozzle.x1 + 40} y2={CENTERLINE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("propeller", propellerMid)} label="Propeller — click for values">
            <rect x={SECTION.propeller.x0 - 10} y={CENTERLINE_Y - 90} width={SECTION.propeller.x1 - SECTION.propeller.x0 + 20} height="180" fill="transparent" />
            <PropellerBlades cx={propellerMid} cy={CENTERLINE_Y} r={72} count={4} className="ed-propeller" dur="0.9s" />
            <circle cx={propellerMid} cy={CENTERLINE_Y} r="10" className="ed-propeller-spinner" />
          </Clickable>

          <rect
            x={SECTION.gearbox.x0} y={CENTERLINE_Y - 30}
            width={SECTION.gearbox.x1 - SECTION.gearbox.x0} height="60"
            rx="6" className="ed-gearbox"
          />

          <Clickable onSelect={() => selectPart("intake", intakeMid)} label="Intake — click for values">
            <rect x={SECTION.intake.x0} y={CENTERLINE_Y - 40} width={SECTION.intake.x1 - SECTION.intake.x0} height="80" fill="transparent" />
            <polygon
              points={`${SECTION.intake.x0},${CENTERLINE_Y - 34} ${SECTION.intake.x1},${CENTERLINE_Y - 20} ${SECTION.intake.x1},${CENTERLINE_Y + 20} ${SECTION.intake.x0},${CENTERLINE_Y + 34}`}
              className="ed-intake"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("compressor", compressorMid)} label="Compressor — click for values">
            <rect x={SECTION.compressor.x0} y={CENTERLINE_Y - 56} width={SECTION.compressor.x1 - SECTION.compressor.x0} height="112" fill="transparent" />
            <HousingFlange x0={SECTION.compressor.x0} x1={SECTION.compressor.x1} yTop={CENTERLINE_Y - 56} yBot={CENTERLINE_Y + 56} boltCount={6} />
            {isAxialCompressor ? (
              <>
                <StageBars x0={SECTION.compressor.x0} x1={SECTION.compressor.x1} count={config.n_compressor_stages} growUp className="ed-compressor" centerlineY={CENTERLINE_Y} />
                <FanBlades cx={compressorMid} cy={CENTERLINE_Y} r={22} className="ed-fan-compressor" dur="2s" />
              </>
            ) : (
              <RadialWheel cx={compressorMid} cy={CENTERLINE_Y} r={44} className="ed-compressor" dur="2.4s" />
            )}
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", combustorMid)} label="Combustor — click for values">
            <rect x={SECTION.combustor.x0} y={CENTERLINE_Y - 56} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="112" fill="transparent" />
            <rect x={SECTION.combustor.x0} y={CENTERLINE_Y - 46} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="92" rx="14" className="ed-combustor" />
            <path
              d={`M ${SECTION.combustor.x0 + 14} ${CENTERLINE_Y + 18}
                  q 8 -28 16 0 q 8 -38 16 0 q 8 -28 16 0 q 8 -18 15 0`}
              className="ed-flame"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("turbine", turbineMid)} label="Turbine — click for values">
            <rect x={SECTION.turbine.x0} y={CENTERLINE_Y - 56} width={SECTION.turbine.x1 - SECTION.turbine.x0} height="112" fill="transparent" />
            <HousingFlange x0={SECTION.turbine.x0} x1={SECTION.turbine.x1} yTop={CENTERLINE_Y - 56} yBot={CENTERLINE_Y + 56} boltCount={5} />
            {isAxialTurbine ? (
              <>
                <StageBars x0={SECTION.turbine.x0} x1={SECTION.turbine.x1} count={config.n_turbine_stages} growUp={false} className="ed-turbine" centerlineY={CENTERLINE_Y} />
                <FanBlades cx={turbineMid} cy={CENTERLINE_Y} r={20} className="ed-fan-turbine" dur="1.5s" />
              </>
            ) : (
              <RadialWheel cx={turbineMid} cy={CENTERLINE_Y} r={40} className="ed-turbine" dur="1.3s" />
            )}
          </Clickable>

          <Clickable onSelect={() => selectPart("nozzle", nozzleMid)} label="Nozzle — click for values">
            <rect x={SECTION.nozzle.x0} y={CENTERLINE_Y - 40} width={SECTION.nozzle.x1 - SECTION.nozzle.x0} height="80" fill="transparent" />
            <polygon
              points={`${SECTION.nozzle.x0},${CENTERLINE_Y - 24} ${SECTION.nozzle.x1},${CENTERLINE_Y - 10} ${SECTION.nozzle.x1},${CENTERLINE_Y + 10} ${SECTION.nozzle.x0},${CENTERLINE_Y + 24}`}
              className="ed-nozzle"
            />
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
        </g>

        {STATIONS.map((s) => (
          <line key={s.key} x1={s.x} y1={CENTERLINE_Y - 58} x2={s.x} y2={CENTERLINE_Y + 58} className="ed-guide" />
        ))}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        <PartStepReadout
          name="Propeller"
          seq={PROPELLER_SEQ}
          seqTotal={TOTAL_STEPS}
          value1={propeller.shaft_power_W / 1000}
          unit1="kW shaft power"
          value2={propeller.Tpr}
          unit2="N thrust"
          leftPct={((propellerMid + MARGIN) / TOTAL_W) * 100}
          onSelect={() => selectPartByKind("propeller")}
        />
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
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or
        station marker, to see its numbers spelled out in plain English.
        The propeller and reduction gearbox sit ahead of the intake,
        connected to the turbine by a drive shaft running back through the
        compressor's core. Only the intake-to-nozzle gas path (heat-mapped
        streamlines) is shown as flow — the propeller moves a much larger,
        separate stream of ambient air that isn&rsquo;t part of this duct.
        Compressor: {compressor.type}. Turbine: {turbine.type}.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1 of {TOTAL_STEPS}&rdquo; through
        &ldquo;Step {TOTAL_STEPS} of {TOTAL_STEPS}&rdquo; in simple flow
        order — Step 1 is the propeller itself (no T0/p0, since it moves
        a separate air stream), then the same six flow stations (a, 2,
        3, 4, 5, 9) as the turbojet, since the intake, compressor, and
        combustor are physically identical; only what happens to the
        turbine's energy afterward differs.
      </p>
      </div>
    </div>
  );
}

export default function TurbopropEngineDiagram({ config, result }) {
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
        <Diagram config={config} result={result} idSuffix="tp-inline" />
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
              <Diagram config={config} result={result} idSuffix="tp-modal" />
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
