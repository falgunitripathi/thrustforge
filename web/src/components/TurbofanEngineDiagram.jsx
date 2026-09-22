import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FanBlades, FlowStreak, FlowMarquee, HousingFlange,
  InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured turbofan — same half-
 * cutaway convention as the other engines' diagrams, but with TWO flow
 * paths: the core (hot) stream along the main centerline (fan -> LPC ->
 * HPC -> combustor -> HPT -> LPT -> hot nozzle, exactly like the
 * turbojet), and the bypass (cold) stream as a separate duct running
 * above it from the fan straight to its own cold nozzle — this is the
 * two-spool UNMIXED variant (aeropropsim/turbofan.py), so the two
 * streams never rejoin.
 */

const VBOX_W = 1000;
const VBOX_H = 260;
const CORE_Y = 150;
const BYPASS_Y = 55;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const CORE_FLOW_Y = CORE_Y + 14;
const BYPASS_FLOW_Y = BYPASS_Y;

// The fan is widened relative to the other components (a real turbofan's
// fan disc is visibly the largest-diameter rotating part) — this also
// buys the fan-exit station (10) more horizontal room away from the
// fan/LPC-inlet station (2) right next to it, so their labels don't
// crowd each other.
const SECTION = {
  intake: { x0: 40, x1: 150 },
  fan: { x0: 162, x1: 262 },
  lpc: { x0: 274, x1: 352 },
  hpc: { x0: 364, x1: 462 },
  combustor: { x0: 474, x1: 552 },
  hpt: { x0: 564, x1: 622 },
  lpt: { x0: 634, x1: 692 },
  hotNozzle: { x0: 704, x1: 840 },
  coldNozzle: { x0: 704, x1: 840 },
};

const CORE_STATIONS = [
  { key: "a", x: 20, name: "Freestream", seq: 1 },
  { key: "2", x: SECTION.intake.x1, name: "Fan/LPC inlet", seq: 2 },
  { key: "3", x: SECTION.lpc.x1, name: "LPC exit", seq: 4 },
  { key: "4", x: SECTION.hpc.x1, name: "HPC exit", seq: 5 },
  { key: "5", x: SECTION.combustor.x1, name: "Combustor exit", seq: 6 },
  { key: "6", x: SECTION.hpt.x1, name: "HPT exit", seq: 7 },
  { key: "7", x: SECTION.lpt.x1, name: "LPT exit", seq: 8 },
  { key: "9", x: SECTION.hotNozzle.x1, name: "Hot nozzle exit", seq: 9 },
];
const BYPASS_STATIONS = [
  { key: "10", x: SECTION.fan.x1, name: "Fan exit", seq: 3 },
  // Offset left of the hot nozzle's own marker (SECTION.hotNozzle.x1) —
  // the cold and hot nozzles share the same x-range in this simplified
  // side view (drawn at different heights), so using the same marker
  // x for both would stack their readout cards exactly on top of each
  // other, making both unreadable.
  // Placed past the hot nozzle's own marker rather than before it — the
  // gap between the LPT (station 7) and the hot nozzle (station 9) is
  // too tight for a third label to fit there without colliding with one
  // side or the other.
  { key: "11", x: SECTION.coldNozzle.x1 + 70, name: "Cold nozzle exit", seq: 10 },
];
const ALL_STATIONS = [...CORE_STATIONS, ...BYPASS_STATIONS].sort((a, b) => a.seq - b.seq);
const TOTAL_STEPS = ALL_STATIONS.length;

const CASING_TOP = [
  [4, -30], [40, -70], [150, -78], [262, -95], [352, -100], [392, -80],
  [462, -75], [502, -92], [552, -80], [602, -75], [662, -95], [692, -70],
  [742, -64], [900, -50],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CORE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CORE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CORE_Y}`,
  `L ${CASING_TOP[0][0]} ${CORE_Y}`,
  "Z",
].join(" ");
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

const CORE_FLOW_X0 = CORE_STATIONS[0].x;
const CORE_FLOW_X1 = CORE_STATIONS[CORE_STATIONS.length - 1].x;
const BYPASS_FLOW_X0 = SECTION.fan.x1;
const BYPASS_FLOW_X1 = SECTION.coldNozzle.x1;
const FLOW_LANE_OFFSETS = [-4, 0, 4];
const STREAKS_PER_LANE = 3;

const PART_BUTTONS = [
  { kind: "intake", label: "Intake" },
  { kind: "fan", label: "Fan" },
  { kind: "lpc", label: "LPC" },
  { kind: "hpc", label: "HPC" },
  { kind: "combustor", label: "Combustor" },
  { kind: "hpt", label: "HPT" },
  { kind: "lpt", label: "LPT" },
  { kind: "hotNozzle", label: "Hot nozzle" },
  { kind: "coldNozzle", label: "Cold nozzle" },
];

function partDetails(kind, result) {
  const { fan, lpc, hpc, combustor, hpt, lpt, hot_nozzle, cold_nozzle, performance, stations } = result;
  switch (kind) {
    case "intake":
      return { title: "Intake", rows: [
        ["Inlet stagnation temperature", `${fmt(stations.a.T0, 1)} K`],
        ["Exit stagnation temperature", `${fmt(stations["2"].T0, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(stations["2"].p0, 1)} kPa`],
      ] };
    case "fan":
      return { title: "Fan", rows: [
        ["Pressure ratio (you set this)", fmt(fan.pi_f, 3)],
        ["Exit stagnation temperature", `${fmt(fan.T010, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(fan.p010, 1)} kPa`],
        ["Feeds", "both the core (LPC) and the bypass duct, split by β"],
      ] };
    case "lpc":
      return { title: "LPC — Low-Pressure Compressor (booster)", rows: [
        ["Pressure ratio (you set this)", fmt(lpc.pi_LPC, 3)],
        ["Exit stagnation temperature", `${fmt(lpc.T03, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(lpc.p03, 1)} kPa`],
      ] };
    case "hpc":
      return { title: "HPC — High-Pressure Compressor", rows: [
        ["Pressure ratio (you set this)", fmt(hpc.pi_HPC, 3)],
        ["Exit stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpc.p04, 1)} kPa`],
        ["Overall core π (fan·LPC·HPC)", fmt(fan.pi_f * lpc.pi_LPC * hpc.pi_HPC, 2)],
      ] };
    case "combustor":
      return { title: "Combustor", rows: [
        ["Inlet stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation temperature (TIT — turbine inlet temperature)", `${fmt(combustor.T05, 1)} K`],
        ["Fuel-air ratio", fmt(combustor.f, 4)],
      ] };
    case "hpt":
      return { title: "HPT — High-Pressure Turbine (drives HPC only)", rows: [
        ["Inlet stagnation temperature", `${fmt(combustor.T05, 1)} K`],
        ["Exit stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpt.p06, 1)} kPa`],
      ] };
    case "lpt":
      return { title: "LPT — Low-Pressure Turbine (drives fan + LPC)", rows: [
        ["Inlet stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation temperature", `${fmt(lpt.T07, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(lpt.p07, 1)} kPa`],
      ] };
    case "hotNozzle":
      return { title: "Hot nozzle (core stream)", rows: [
        ["Status", hot_nozzle.choked ? "Choked" : "Unchoked (fully expanded)"],
        ["Exit velocity", `${fmt(hot_nozzle.V_exit, 1)} m/s`],
        ["Stream thrust", `${fmt(performance.thrust_hot, 1)} N`],
      ] };
    case "coldNozzle":
      return { title: "Cold nozzle (bypass stream)", rows: [
        ["Status", cold_nozzle.choked ? "Choked" : "Unchoked (fully expanded)"],
        ["Exit velocity", `${fmt(cold_nozzle.V_exit, 1)} m/s`],
        ["Stream thrust", `${fmt(performance.thrust_cold, 1)} N`],
        ["Bypass ratio β (you set this)", fmt(performance.beta, 2)],
      ] };
    default:
      return null;
  }
}

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
  const { stations } = result;
  const [selected, setSelected] = useState(null);

  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const fanMid = (SECTION.fan.x0 + SECTION.fan.x1) / 2;
  const lpcMid = (SECTION.lpc.x0 + SECTION.lpc.x1) / 2;
  const hpcMid = (SECTION.hpc.x0 + SECTION.hpc.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const hptMid = (SECTION.hpt.x0 + SECTION.hpt.x1) / 2;
  const lptMid = (SECTION.lpt.x0 + SECTION.lpt.x1) / 2;
  const hotNozzleMid = (SECTION.hotNozzle.x0 + SECTION.hotNozzle.x1) / 2;
  const coldNozzleMid = (SECTION.coldNozzle.x0 + SECTION.coldNozzle.x1) / 2;
  const PART_MIDPOINTS = {
    intake: intakeMid, fan: fanMid, lpc: lpcMid, hpc: hpcMid,
    combustor: combustorMid, hpt: hptMid, lpt: lptMid,
    hotNozzle: hotNozzleMid, coldNozzle: coldNozzleMid,
  };

  const coreTValues = CORE_STATIONS.map((s) => stations[s.key].T0);
  const tMin = Math.min(...coreTValues, stations["10"].T0, stations["11"].T0);
  const tMax = Math.max(...coreTValues, stations["10"].T0, stations["11"].T0);
  const coreGradientStops = CORE_STATIONS.map((s) => {
    const offset = ((s.x - CORE_FLOW_X0) / (CORE_FLOW_X1 - CORE_FLOW_X0)) * 100;
    return <stop key={s.key} offset={`${offset}%`} stopColor={stationHeatColor(stations[s.key].T0, tMin, tMax)} />;
  });
  const bypassGradientStops = [
    <stop key="10" offset="0%" stopColor={stationHeatColor(stations["10"].T0, tMin, tMax)} />,
    <stop key="11" offset="100%" stopColor={stationHeatColor(stations["11"].T0, tMin, tMax)} />,
  ];

  function selectPart(kind, xMid, yMid = CORE_Y) {
    const details = partDetails(kind, result);
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
        aria-label="Half-cutaway schematic of the configured turbofan, showing the core (hot) stream through the compressors, combustor, turbines and hot nozzle, and the bypass (cold) duct from the fan straight to its own cold nozzle. Click any part for its values."
      >
        <defs>
          <linearGradient id={`ed-heat-core-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={CORE_FLOW_X0} y1={CORE_FLOW_Y} x2={CORE_FLOW_X1} y2={CORE_FLOW_Y}>
            {coreGradientStops}
          </linearGradient>
          <linearGradient id={`ed-heat-bypass-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={BYPASS_FLOW_X0} y1={BYPASS_FLOW_Y} x2={BYPASS_FLOW_X1} y2={BYPASS_FLOW_Y}>
            {bypassGradientStops}
          </linearGradient>
          <linearGradient id={`ed-metal-casing-${idSuffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbfcfe" />
            <stop offset="42%" stopColor="#e6e9f2" />
            <stop offset="55%" stopColor="#ced2e2" />
            <stop offset="100%" stopColor="#eef0f7" />
          </linearGradient>
          <clipPath id={`ed-lower-half-${idSuffix}`}>
            <rect x={-800} y={CORE_Y} width="2000" height="400" />
          </clipPath>
          <FlowMarquee idSuffix={idSuffix} />
        </defs>

        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {CASING_RIVETS.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CORE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        <line x1="4" y1={CORE_Y} x2={SECTION.hotNozzle.x1 + 90} y2={CORE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          <Clickable onSelect={() => selectPart("intake", intakeMid)} label="Intake — click for values">
            <rect x={SECTION.intake.x0} y={CORE_Y - 40} width={SECTION.intake.x1 - SECTION.intake.x0} height="80" fill="transparent" />
            <polygon
              points={`${SECTION.intake.x0},${CORE_Y - 34} ${SECTION.intake.x1},${CORE_Y - 20} ${SECTION.intake.x1},${CORE_Y + 20} ${SECTION.intake.x0},${CORE_Y + 34}`}
              className="ed-intake"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("fan", fanMid)} label="Fan — click for values">
            <rect x={SECTION.fan.x0 - 10} y={BYPASS_Y - 20} width={SECTION.fan.x1 - SECTION.fan.x0 + 20} height={CORE_Y - BYPASS_Y + 60} fill="transparent" />
            <HousingFlange x0={SECTION.fan.x0} x1={SECTION.fan.x1} yTop={BYPASS_Y - 14} yBot={CORE_Y + 50} boltCount={4} />
            <FanBlades cx={fanMid} cy={CORE_Y} r={30} count={10} className="ed-fan-compressor" dur="1.6s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("lpc", lpcMid)} label="LPC — click for values">
            <rect x={SECTION.lpc.x0} y={CORE_Y - 44} width={SECTION.lpc.x1 - SECTION.lpc.x0} height="88" fill="transparent" />
            <HousingFlange x0={SECTION.lpc.x0} x1={SECTION.lpc.x1} yTop={CORE_Y - 44} yBot={CORE_Y + 44} boltCount={4} />
            <FanBlades cx={lpcMid} cy={CORE_Y} r={18} count={8} className="ed-fan-compressor" dur="1.9s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("hpc", hpcMid)} label="HPC — click for values">
            <rect x={SECTION.hpc.x0} y={CORE_Y - 50} width={SECTION.hpc.x1 - SECTION.hpc.x0} height="100" fill="transparent" />
            <HousingFlange x0={SECTION.hpc.x0} x1={SECTION.hpc.x1} yTop={CORE_Y - 50} yBot={CORE_Y + 50} boltCount={6} />
            <FanBlades cx={hpcMid} cy={CORE_Y} r={22} count={10} className="ed-fan-compressor" dur="1.5s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", combustorMid)} label="Combustor — click for values">
            <rect x={SECTION.combustor.x0} y={CORE_Y - 50} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="100" fill="transparent" />
            <rect x={SECTION.combustor.x0} y={CORE_Y - 40} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="80" rx="12" className="ed-combustor" />
            <path
              d={`M ${SECTION.combustor.x0 + 12} ${CORE_Y + 16}
                  q 7 -25 14 0 q 7 -34 14 0 q 7 -25 14 0 q 7 -16 13 0`}
              className="ed-flame"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("hpt", hptMid)} label="HPT — click for values">
            <rect x={SECTION.hpt.x0} y={CORE_Y - 44} width={SECTION.hpt.x1 - SECTION.hpt.x0} height="88" fill="transparent" />
            <HousingFlange x0={SECTION.hpt.x0} x1={SECTION.hpt.x1} yTop={CORE_Y - 44} yBot={CORE_Y + 44} boltCount={4} />
            <FanBlades cx={hptMid} cy={CORE_Y} r={17} count={8} className="ed-fan-turbine" dur="1.2s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("lpt", lptMid)} label="LPT — click for values">
            <rect x={SECTION.lpt.x0} y={CORE_Y - 44} width={SECTION.lpt.x1 - SECTION.lpt.x0} height="88" fill="transparent" />
            <HousingFlange x0={SECTION.lpt.x0} x1={SECTION.lpt.x1} yTop={CORE_Y - 44} yBot={CORE_Y + 44} boltCount={4} />
            <FanBlades cx={lptMid} cy={CORE_Y} r={17} count={8} className="ed-fan-turbine" dur="1.4s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("hotNozzle", hotNozzleMid)} label="Hot nozzle — click for values">
            <rect x={SECTION.hotNozzle.x0} y={CORE_Y - 30} width={SECTION.hotNozzle.x1 - SECTION.hotNozzle.x0} height="60" fill="transparent" />
            <polygon
              points={`${SECTION.hotNozzle.x0},${CORE_Y - 20} ${SECTION.hotNozzle.x1},${CORE_Y - 9} ${SECTION.hotNozzle.x1},${CORE_Y + 9} ${SECTION.hotNozzle.x0},${CORE_Y + 20}`}
              className="ed-nozzle"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("coldNozzle", coldNozzleMid, BYPASS_Y)} label="Cold nozzle — click for values">
            <rect x={SECTION.coldNozzle.x0} y={BYPASS_Y - 16} width={SECTION.coldNozzle.x1 - SECTION.coldNozzle.x0} height="32" fill="transparent" />
            <polygon
              points={`${SECTION.coldNozzle.x0},${BYPASS_Y - 10} ${SECTION.coldNozzle.x1},${BYPASS_Y - 5} ${SECTION.coldNozzle.x1},${BYPASS_Y + 5} ${SECTION.coldNozzle.x0},${BYPASS_Y + 10}`}
              className="ed-nozzle"
            />
          </Clickable>

          {/* Bypass (cold) duct flow — from the fan straight to the cold
              nozzle, never rejoining the core (unmixed variant). */}
          {FLOW_LANE_OFFSETS.slice(0, 2).map((dy, i) => (
            <line key={`bp-${i}`} x1={BYPASS_FLOW_X0} y1={BYPASS_FLOW_Y + dy} x2={BYPASS_FLOW_X1} y2={BYPASS_FLOW_Y + dy} className="ed-flow-lane" stroke={`url(#ed-heat-bypass-${idSuffix})`} opacity={0.6} />
          ))}
          {FLOW_LANE_OFFSETS.slice(0, 2).flatMap((dy, laneIdx) =>
            Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
              <FlowStreak key={`bp-streak-${laneIdx}-${j}`} y={BYPASS_FLOW_Y + dy} index={laneIdx * STREAKS_PER_LANE + j} count={2 * STREAKS_PER_LANE} x0={BYPASS_FLOW_X0} x1={BYPASS_FLOW_X1} />
            ))
          )}

          {/* Core (hot) duct flow — intake through hot nozzle. */}
          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line key={i} x1={CORE_FLOW_X0} y1={CORE_FLOW_Y + dy} x2={CORE_FLOW_X1} y2={CORE_FLOW_Y + dy} className="ed-flow-lane" stroke={`url(#ed-heat-core-${idSuffix})`} opacity={0.65} />
          ))}
          {FLOW_LANE_OFFSETS.map((dy, i) => (
            <line key={`marquee-${i}`} x1={CORE_FLOW_X0} y1={CORE_FLOW_Y + dy} x2={CORE_FLOW_X1} y2={CORE_FLOW_Y + dy} className="ed-flow-marquee" stroke={`url(#ed-flow-marquee-${idSuffix})`} />
          ))}
          {FLOW_LANE_OFFSETS.flatMap((dy, laneIdx) =>
            Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
              <FlowStreak key={`${laneIdx}-${j}`} y={CORE_FLOW_Y + dy} index={laneIdx * STREAKS_PER_LANE + j} count={FLOW_LANE_OFFSETS.length * STREAKS_PER_LANE} x0={CORE_FLOW_X0} x1={CORE_FLOW_X1} />
            ))
          )}
        </g>

        {ALL_STATIONS.map((s) => {
          const yMid = BYPASS_STATIONS.includes(s) ? BYPASS_Y : CORE_Y;
          return (
            <line key={s.key} x1={s.x} y1={yMid - 30} x2={s.x} y2={CORE_Y + 58} className="ed-guide" />
          );
        })}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        {ALL_STATIONS.map((s, i) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            seqTotal={TOTAL_STEPS}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            // Ten stations sharing this diagram's width means several
            // sit close enough together that their labels would collide
            // on one row — alternating each one's vertical offset (the
            // same fix a crowded chart axis would use) keeps every
            // label readable without needing more horizontal room.
            top={i % 2 === 1 ? 62 : 0}
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or
        station marker, to see its numbers spelled out in plain English.
        The bypass (cold) duct runs from the fan straight to its own
        cold nozzle without ever rejoining the core — this is the
        unmixed variant. The core (hot) stream runs the full turbojet-
        style path: LPC, HPC, combustor, HPT, LPT, hot nozzle.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1 of {TOTAL_STEPS}&rdquo; through
        &ldquo;Step {TOTAL_STEPS} of {TOTAL_STEPS}&rdquo; in simple flow
        order, interleaving both streams by where they physically sit —
        station 10 (fan exit) comes right after station 2, and station
        11 (cold nozzle exit) comes last, alongside station 9.
      </p>
      </div>
    </div>
  );
}

export default function TurbofanEngineDiagram({ config, result }) {
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
        <Diagram config={config} result={result} idSuffix="tf-inline" />
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
              <Diagram config={config} result={result} idSuffix="tf-modal" />
            </div>

            <div className="ed-trends">
              <StationTrendChart
                title="Stagnation temperature across stations"
                stations={ALL_STATIONS}
                values={ALL_STATIONS.map((s) => result.stations[s.key].T0)}
                unit="K"
                color="#ff6f61"
                decimals={0}
              />
              <StationTrendChart
                title="Stagnation pressure across stations"
                stations={ALL_STATIONS}
                values={ALL_STATIONS.map((s) => result.stations[s.key].p0 / 1000)}
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
