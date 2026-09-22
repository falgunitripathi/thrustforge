import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  StageBars, RadialWheel, FanBlades, FlowStreak, FlowMarquee,
  HousingFlange, InspectToolbar, Clickable, StationReadout, PartStepReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured turboshaft — same half-
 * cutaway convention as the turbojet's EngineDiagram.jsx, with the
 * nozzle replaced by an output shaft driving a load (a helicopter
 * rotor, generator, marine propulsor, ...). There is no residual jet at
 * all here — the turbine expands fully to ambient, so the gas-path flow
 * (heat-mapped streamlines) ends at the turbine, not at a nozzle exit.
 */

const VBOX_W = 920;
const VBOX_H = 200;
const CENTERLINE_Y = 100;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_Y = CENTERLINE_Y + 14;

const SECTION = {
  intake: { x0: 40, x1: 160 },
  compressor: { x0: 172, x1: 350 },
  combustor: { x0: 362, x1: 470 },
  turbine: { x0: 482, x1: 650 },
  load: { x0: 700, x1: 830 },
};

const STATIONS = [
  { key: "a", x: 20, name: "Freestream", seq: 1 },
  { key: "2", x: SECTION.intake.x1, name: "Intake exit", seq: 2 },
  { key: "3", x: SECTION.compressor.x1, name: "Compressor exit", seq: 3 },
  { key: "4", x: SECTION.combustor.x1, name: "Combustor exit", seq: 4 },
  { key: "5", x: SECTION.turbine.x1, name: "Turbine exit (= exhaust, fully expanded)", seq: 5 },
];
// The Load is the final step (rendered separately below, as a
// PartStepReadout rather than a flow-station StationReadout, since it
// has no T0/p0 — it's a mechanical output, not part of the gas path).
const LOAD_SEQ = STATIONS.length + 1;
const TOTAL_STEPS = LOAD_SEQ;

const CASING_TOP = [
  [4, -14], [40, -44], [160, -50], [220, -64], [300, -72], [350, -58],
  [400, -52], [440, -66], [470, -56], [520, -52], [590, -70], [650, -50],
  [690, -42],
];
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
  { kind: "intake", label: "Intake" },
  { kind: "compressor", label: "Compressor" },
  { kind: "combustor", label: "Combustor" },
  { kind: "turbine", label: "Turbine" },
  { kind: "load", label: "Load" },
];

function partDetails(kind, result, config) {
  const { compressor, combustor, turbine, shaft, stations } = result;
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
          ["Specific work Wc", `${fmt(shaft.Wc / 1000, 1)} kJ/kg`],
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
          ["Exit pressure", `${fmtKPa(stations["5"].p0, 1)} kPa (= ambient — full expansion)`],
          ["Specific work Wt", `${fmt(shaft.Wt / 1000, 1)} kJ/kg`],
          ...(turbine.type === "radial"
            ? [
                ["Spouting velocity (calculated)", `${fmt(turbine.V0_spouting, 1)} m/s`],
                ["Blade tip speed (calculated)", `${fmt(turbine.U2_sized, 1)} m/s`],
              ]
            : []),
        ],
      };
    case "load":
      return {
        title: "Load (via output shaft)",
        rows: [
          ["Shaft power (before load losses)", `${fmt(shaft.Wshaft / 1000, 1)} kJ/kg`],
          ["Load-drive mechanical efficiency (you set this)", fmt(config.eta_m, 3)],
          ["Load power delivered", `${fmt(shaft.Pload_W / 1000, 1)} kW`],
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
  const { stations, compressor, turbine, shaft } = result;
  const [selected, setSelected] = useState(null);

  const isAxialCompressor = config.compressor_type === "axial";
  const isAxialTurbine = config.turbine_type === "axial";

  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const compressorMid = (SECTION.compressor.x0 + SECTION.compressor.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const turbineMid = (SECTION.turbine.x0 + SECTION.turbine.x1) / 2;
  const loadMid = (SECTION.load.x0 + SECTION.load.x1) / 2;
  const PART_MIDPOINTS = { intake: intakeMid, compressor: compressorMid, combustor: combustorMid, turbine: turbineMid, load: loadMid };

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
        aria-label="Half-cutaway schematic of the configured turboshaft, showing the gas path from intake to turbine exit, and the output shaft driving a load. Click any part for its values."
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

        {/* Output shaft — runs from the turbine hub back to the load,
            where a nozzle would sit on the turbojet/turboprop. */}
        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <line x1={turbineMid} y1={CENTERLINE_Y} x2={SECTION.load.x1} y2={CENTERLINE_Y} className="ed-shaft" />
        </g>

        <line x1="4" y1={CENTERLINE_Y} x2={SECTION.load.x1 + 20} y2={CENTERLINE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
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
              d={`M ${SECTION.combustor.x0 + 18} ${CENTERLINE_Y + 18}
                  q 9 -30 18 0 q 9 -42 18 0 q 9 -30 18 0 q 9 -20 17 0`}
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

          <Clickable onSelect={() => selectPart("load", loadMid)} label="Load — click for values">
            <rect x={SECTION.load.x0 - 10} y={CENTERLINE_Y - 46} width={SECTION.load.x1 - SECTION.load.x0 + 20} height="92" fill="transparent" />
            <rect x={SECTION.load.x0} y={CENTERLINE_Y - 34} width={SECTION.load.x1 - SECTION.load.x0} height="68" rx="8" className="ed-gearbox" />
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
        {STATIONS.map((s, i) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            seqTotal={TOTAL_STEPS}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            // The turbine-exit station and the Load marker right after it
            // sit close enough together (both long labels) that they'd
            // otherwise collide — alternate every marker's row, same
            // convention used by every other engine's diagram.
            top={i % 2 === 1 ? 62 : 0}
            onSelect={() => selectStation(s)}
          />
        ))}
        <PartStepReadout
          name="Load"
          seq={LOAD_SEQ}
          seqTotal={TOTAL_STEPS}
          value1={shaft.Pload_W / 1000}
          unit1="kW delivered"
          leftPct={((loadMid + MARGIN) / TOTAL_W) * 100}
          top={STATIONS.length % 2 === 1 ? 62 : 0}
          onSelect={() => selectPartByKind("load")}
        />
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or
        station marker, to see its numbers spelled out in plain English.
        There's no nozzle here: the turbine expands all the way to
        ambient pressure, and every bit of that work drives the output
        shaft into the Load instead of a jet. Compressor: {compressor.type}.
        Turbine: {turbine.type}.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1&rdquo; through
        &ldquo;Step {TOTAL_STEPS}&rdquo; in simple flow
        order — five flow stations (a, 2, 3, 4, 5, one fewer than the
        turbojet's six since there's no nozzle/station 9), then the Load
        itself as the final step (no T0/p0, since it's a mechanical
        output, not part of the gas path).
      </p>
      </div>
    </div>
  );
}

export default function TurboshaftEngineDiagram({ config, result }) {
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
