import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FanBlades, FlowStreak, FlowMarquee, HousingFlange,
  InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable schematic of the configured propfan — same half-
 * cutaway convention as the other engines' diagrams, but with a layout
 * that is neither the turbofan's two-PARALLEL-ducts shape nor a plain
 * single-spool line: it's a linear three-spool gas generator (IPC ->
 * HPC -> combustor -> HPT -> IPT -> free turbine -> hot nozzle), drawn
 * like the turboshaft's/turboprop's single core, PLUS an unducted fan
 * bolted on at the very front, sized directly off the freestream (not
 * the core's own intake) — aeropropsim/propfan.py's module docstring.
 *
 * Visual distinction from the turbofan's fan: no HousingFlange/duct
 * around it and it sits OUTSIDE the main casing outline entirely (the
 * casing here only wraps the ducted core, intake through hot nozzle) —
 * an open rotor in the freestream, per reference/propfan.md §1/§5
 * ("closer in character to a turbofan fan stage" in blade style, but
 * explicitly NOT ducted/shrouded the way a turbofan's fan is).
 *
 * Step-numbering choice (documented here since it isn't obvious): the
 * fan's own three stations (10 fan inlet, 11 fan exit, 12 fan exhaust)
 * are numbered as steps 2-4, immediately after the freestream (step 1)
 * and before the core's own intake-exit station (step 5) — even though
 * the fan's shaft power is actually solved LAST (from the free
 * turbine's own energy balance, station 7->8). This follows the same
 * convention the turbofan diagram already uses: step order tracks
 * physical/spatial position (front to back), not causal/power-flow
 * order — the turbofan's own fan-exit station (10) is numbered right
 * after station 2 for exactly this reason. Since the propfan's fan
 * sits even further forward (ahead of the core's intake, not beside
 * it), its stations get the earliest slots after the freestream itself.
 */

const VBOX_W = 1000;
const VBOX_H = 240;
const CORE_Y = 130;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const CORE_FLOW_Y = CORE_Y + 14;
const FAN_FLOW_Y = CORE_Y;

const SECTION = {
  fan: { x0: 16, x1: 108 },
  intake: { x0: 168, x1: 250 },
  ipc: { x0: 262, x1: 330 },
  hpc: { x0: 342, x1: 410 },
  combustor: { x0: 422, x1: 500 },
  hpt: { x0: 512, x1: 566 },
  ipt: { x0: 578, x1: 632 },
  freeTurbine: { x0: 644, x1: 700 },
  hotNozzle: { x0: 712, x1: 850 },
};

// Fan stations sit ahead of, and physically separate from, the ducted
// core's own ordering — see the module docstring's step-numbering note.
const FAN_STATIONS = [
  { key: "10", x: SECTION.fan.x0 + 18, name: "Fan inlet (= freestream)", seq: 2 },
  { key: "11", x: SECTION.fan.x1, name: "Fan exit", seq: 3 },
  { key: "12", x: SECTION.fan.x1 + 38, name: "Fan exhaust (fully expanded)", seq: 4 },
];
const CORE_STATIONS = [
  { key: "a", x: 4, name: "Freestream", seq: 1 },
  { key: "2", x: SECTION.intake.x1, name: "Intake exit / IPC inlet", seq: 5 },
  { key: "3", x: SECTION.ipc.x1, name: "IPC exit", seq: 6 },
  { key: "4", x: SECTION.hpc.x1, name: "HPC exit", seq: 7 },
  { key: "5", x: SECTION.combustor.x1, name: "Combustor exit", seq: 8 },
  { key: "6", x: SECTION.hpt.x1, name: "HPT exit", seq: 9 },
  { key: "7", x: SECTION.ipt.x1, name: "IPT exit", seq: 10 },
  { key: "8", x: SECTION.freeTurbine.x1, name: "Free turbine exit", seq: 11 },
  { key: "9", x: SECTION.hotNozzle.x1, name: "Hot nozzle exit", seq: 12 },
];
const ALL_STATIONS = [...CORE_STATIONS, ...FAN_STATIONS].sort((a, b) => a.seq - b.seq);
const TOTAL_STEPS = ALL_STATIONS.length;

// Casing wraps the ducted core ONLY — intake through hot nozzle. The fan
// deliberately sits outside/ahead of this outline (unducted).
const CASING_TOP = [
  [SECTION.intake.x0 - 8, -46], [SECTION.intake.x1, -58], [SECTION.ipc.x1, -68],
  [SECTION.hpc.x0, -60], [SECTION.hpc.x1, -70], [SECTION.combustor.x0, -60],
  [SECTION.combustor.x1, -70], [SECTION.hpt.x1, -62], [SECTION.ipt.x1, -66],
  [SECTION.freeTurbine.x1, -56], [SECTION.hotNozzle.x1 - 60, -46],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CORE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CORE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CORE_Y}`,
  `L ${CASING_TOP[0][0]} ${CORE_Y}`,
  "Z",
].join(" ");
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

const CORE_FLOW_X0 = SECTION.intake.x0;
const CORE_FLOW_X1 = SECTION.hotNozzle.x1;
const FAN_FLOW_X0 = FAN_STATIONS[0].x;
const FAN_FLOW_X1 = FAN_STATIONS[FAN_STATIONS.length - 1].x;
const FLOW_LANE_OFFSETS = [-4, 0, 4];
const STREAKS_PER_LANE = 3;

const PART_BUTTONS = [
  { kind: "fan", label: "Fan (UDF)" },
  { kind: "intake", label: "Intake" },
  { kind: "ipc", label: "IPC" },
  { kind: "hpc", label: "HPC" },
  { kind: "combustor", label: "Combustor" },
  { kind: "hpt", label: "HPT" },
  { kind: "ipt", label: "IPT" },
  { kind: "freeTurbine", label: "Free turbine" },
  { kind: "hotNozzle", label: "Hot nozzle" },
];

function partDetails(kind, result, config) {
  const { fan, ipc, hpc, combustor, hpt, ipt, free_turbine, hot_nozzle, performance, stations } = result;
  switch (kind) {
    case "fan":
      return { title: "Unducted fan (UDF)", rows: [
        ["Pressure ratio (you set this)", fmt(config.pi_UDF, 3)],
        ["Exit stagnation temperature", `${fmt(fan.T011, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(fan.p011, 1)} kPa`],
        ["Fan exhaust velocity (ue)_UDF", `${fmt(fan.ue_UDF, 1)} m/s`],
        ["Power split β (solved, not configured)", fmt(fan.beta, 3)],
        ["Shaft power delivered to fan", `${fmt(fan.P_UDF_W / 1000, 1)} kW`],
        ["Fan thrust", `${fmt(performance.thrust_fan, 1)} N`],
        ["Feeds", "sized directly off the freestream — no intake diffuser ahead of it, unducted"],
      ] };
    case "intake":
      return { title: "Intake (core stream only)", rows: [
        ["Inlet stagnation temperature", `${fmt(stations.a.T0, 1)} K`],
        ["Exit stagnation temperature", `${fmt(stations["2"].T0, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(stations["2"].p0, 1)} kPa`],
      ] };
    case "ipc":
      return { title: "IPC (intermediate-pressure compressor)", rows: [
        ["Pressure ratio (you set this)", fmt(ipc.pi_IPC, 3)],
        ["Exit stagnation temperature", `${fmt(ipc.T03, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(ipc.p03, 1)} kPa`],
      ] };
    case "hpc":
      return { title: "HPC (high-pressure compressor)", rows: [
        ["Pressure ratio (you set this)", fmt(hpc.pi_HPC, 3)],
        ["Exit stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpc.p04, 1)} kPa`],
        ["Overall core π (IPC·HPC)", fmt(ipc.pi_IPC * hpc.pi_HPC, 2)],
      ] };
    case "combustor":
      return { title: "Combustor", rows: [
        ["Inlet stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation temperature (TIT)", `${fmt(combustor.T05, 1)} K`],
        ["Fuel-air ratio", fmt(combustor.f, 4)],
      ] };
    case "hpt":
      return { title: "HPT (drives HPC only)", rows: [
        ["Inlet stagnation temperature", `${fmt(combustor.T05, 1)} K`],
        ["Exit stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpt.p06, 1)} kPa`],
        ["Note", "bare energy balance — no lambda/eta_m term (source states 100% shaft mechanical efficiency here)"],
      ] };
    case "ipt":
      return { title: "IPT (drives IPC only)", rows: [
        ["Inlet stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation temperature", `${fmt(ipt.T07, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(ipt.p07, 1)} kPa`],
      ] };
    case "freeTurbine":
      return { title: "Free (power) turbine", rows: [
        ["Inlet stagnation temperature", `${fmt(ipt.T07, 1)} K`],
        ["Exit stagnation temperature", `${fmt(free_turbine.T08, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(free_turbine.p08, 1)} kPa`],
        ["Power split α (you set this)", fmt(config.alpha, 3)],
        ["Drives", "the unducted fan (via η_m,UDF) and the residual hot-nozzle jet"],
      ] };
    case "hotNozzle":
      return { title: "Hot nozzle (gas-generator residual)", rows: [
        ["Status", hot_nozzle.choked ? "Choked" : "Unchoked (fully expanded)"],
        ["Exit velocity", `${fmt(hot_nozzle.V_exit, 1)} m/s`],
        ["Stream thrust", `${fmt(performance.thrust_nozzle, 1)} N`],
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

  const fanMid = (SECTION.fan.x0 + SECTION.fan.x1) / 2;
  const intakeMid = (SECTION.intake.x0 + SECTION.intake.x1) / 2;
  const ipcMid = (SECTION.ipc.x0 + SECTION.ipc.x1) / 2;
  const hpcMid = (SECTION.hpc.x0 + SECTION.hpc.x1) / 2;
  const combustorMid = (SECTION.combustor.x0 + SECTION.combustor.x1) / 2;
  const hptMid = (SECTION.hpt.x0 + SECTION.hpt.x1) / 2;
  const iptMid = (SECTION.ipt.x0 + SECTION.ipt.x1) / 2;
  const ftMid = (SECTION.freeTurbine.x0 + SECTION.freeTurbine.x1) / 2;
  const hotNozzleMid = (SECTION.hotNozzle.x0 + SECTION.hotNozzle.x1) / 2;
  const PART_MIDPOINTS = {
    fan: fanMid, intake: intakeMid, ipc: ipcMid, hpc: hpcMid,
    combustor: combustorMid, hpt: hptMid, ipt: iptMid,
    freeTurbine: ftMid, hotNozzle: hotNozzleMid,
  };

  const coreTValues = CORE_STATIONS.map((s) => stations[s.key].T0);
  const tMin = Math.min(...coreTValues, stations["10"].T0, stations["11"].T0, stations["12"].T0);
  const tMax = Math.max(...coreTValues, stations["10"].T0, stations["11"].T0, stations["12"].T0);
  const coreGradientStops = CORE_STATIONS.filter((s) => s.key !== "a").map((s) => {
    const offset = ((s.x - CORE_FLOW_X0) / (CORE_FLOW_X1 - CORE_FLOW_X0)) * 100;
    return <stop key={s.key} offset={`${Math.max(0, Math.min(100, offset))}%`} stopColor={stationHeatColor(stations[s.key].T0, tMin, tMax)} />;
  });
  const fanGradientStops = FAN_STATIONS.map((s) => {
    const offset = ((s.x - FAN_FLOW_X0) / (FAN_FLOW_X1 - FAN_FLOW_X0)) * 100;
    return <stop key={s.key} offset={`${offset}%`} stopColor={stationHeatColor(stations[s.key].T0, tMin, tMax)} />;
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
        aria-label="Half-cutaway schematic of the configured propfan, showing an open, unducted fan at the front sized directly off the freestream, and a linear gas generator (IPC, HPC, combustor, HPT, IPT, free turbine, hot nozzle) behind it. Click any part for its values."
      >
        <defs>
          <linearGradient id={`ed-heat-core-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={CORE_FLOW_X0} y1={CORE_FLOW_Y} x2={CORE_FLOW_X1} y2={CORE_FLOW_Y}>
            {coreGradientStops}
          </linearGradient>
          <linearGradient id={`ed-heat-fan-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={FAN_FLOW_X0} y1={FAN_FLOW_Y} x2={FAN_FLOW_X1} y2={FAN_FLOW_Y}>
            {fanGradientStops}
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

        {/* Casing wraps the ducted core only (intake through hot nozzle) —
            the fan deliberately sits outside it, unducted. */}
        <path d={CASING_PATH} className="ed-casing" fill={`url(#ed-metal-casing-${idSuffix})`} />
        {CASING_RIVETS.map(([x, dy], i) => (
          <circle key={i} cx={x} cy={CORE_Y + dy * 0.6} r="1.7" className="ed-rivet" />
        ))}

        <line x1="-4" y1={CORE_Y} x2={SECTION.hotNozzle.x1 + 40} y2={CORE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          {/* Unducted fan — an open rotor in the freestream, no
              HousingFlange/duct around it (unlike the turbofan's fan),
              just a thin open-framework ring to suggest a mount without
              a shroud. */}
          <Clickable onSelect={() => selectPart("fan", fanMid)} label="Unducted fan — click for values">
            <rect x={SECTION.fan.x0 - 12} y={CORE_Y - 66} width={SECTION.fan.x1 - SECTION.fan.x0 + 24} height="132" fill="transparent" />
            <circle cx={fanMid} cy={CORE_Y} r="48" className="ed-fan-open-ring" />
            <line x1={fanMid} y1={CORE_Y - 48} x2={fanMid} y2={CORE_Y + 48} className="ed-fan-open-strut" />
            <line x1={fanMid - 42} y1={CORE_Y - 24} x2={fanMid + 42} y2={CORE_Y + 24} className="ed-fan-open-strut" />
            <FanBlades cx={fanMid} cy={CORE_Y} r={44} count={12} className="ed-fan-compressor" dur="1.1s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("intake", intakeMid)} label="Intake — click for values">
            <rect x={SECTION.intake.x0} y={CORE_Y - 40} width={SECTION.intake.x1 - SECTION.intake.x0} height="80" fill="transparent" />
            <polygon
              points={`${SECTION.intake.x0},${CORE_Y - 34} ${SECTION.intake.x1},${CORE_Y - 20} ${SECTION.intake.x1},${CORE_Y + 20} ${SECTION.intake.x0},${CORE_Y + 34}`}
              className="ed-intake"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("ipc", ipcMid)} label="IPC — click for values">
            <rect x={SECTION.ipc.x0} y={CORE_Y - 44} width={SECTION.ipc.x1 - SECTION.ipc.x0} height="88" fill="transparent" />
            <HousingFlange x0={SECTION.ipc.x0} x1={SECTION.ipc.x1} yTop={CORE_Y - 44} yBot={CORE_Y + 44} boltCount={4} />
            <FanBlades cx={ipcMid} cy={CORE_Y} r={18} count={8} className="ed-fan-compressor" dur="1.9s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("hpc", hpcMid)} label="HPC — click for values">
            <rect x={SECTION.hpc.x0} y={CORE_Y - 48} width={SECTION.hpc.x1 - SECTION.hpc.x0} height="96" fill="transparent" />
            <HousingFlange x0={SECTION.hpc.x0} x1={SECTION.hpc.x1} yTop={CORE_Y - 48} yBot={CORE_Y + 48} boltCount={5} />
            <FanBlades cx={hpcMid} cy={CORE_Y} r={20} count={10} className="ed-fan-compressor" dur="1.5s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("combustor", combustorMid)} label="Combustor — click for values">
            <rect x={SECTION.combustor.x0} y={CORE_Y - 48} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="96" fill="transparent" />
            <rect x={SECTION.combustor.x0} y={CORE_Y - 38} width={SECTION.combustor.x1 - SECTION.combustor.x0} height="76" rx="12" className="ed-combustor" />
            <path
              d={`M ${SECTION.combustor.x0 + 10} ${CORE_Y + 14}
                  q 6 -22 12 0 q 6 -30 12 0 q 6 -22 12 0 q 6 -14 11 0`}
              className="ed-flame"
            />
          </Clickable>

          <Clickable onSelect={() => selectPart("hpt", hptMid)} label="HPT — click for values">
            <rect x={SECTION.hpt.x0} y={CORE_Y - 42} width={SECTION.hpt.x1 - SECTION.hpt.x0} height="84" fill="transparent" />
            <HousingFlange x0={SECTION.hpt.x0} x1={SECTION.hpt.x1} yTop={CORE_Y - 42} yBot={CORE_Y + 42} boltCount={4} />
            <FanBlades cx={hptMid} cy={CORE_Y} r={16} count={8} className="ed-fan-turbine" dur="1.2s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("ipt", iptMid)} label="IPT — click for values">
            <rect x={SECTION.ipt.x0} y={CORE_Y - 42} width={SECTION.ipt.x1 - SECTION.ipt.x0} height="84" fill="transparent" />
            <HousingFlange x0={SECTION.ipt.x0} x1={SECTION.ipt.x1} yTop={CORE_Y - 42} yBot={CORE_Y + 42} boltCount={4} />
            <FanBlades cx={iptMid} cy={CORE_Y} r={16} count={8} className="ed-fan-turbine" dur="1.4s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("freeTurbine", ftMid)} label="Free turbine — click for values">
            <rect x={SECTION.freeTurbine.x0} y={CORE_Y - 40} width={SECTION.freeTurbine.x1 - SECTION.freeTurbine.x0} height="80" fill="transparent" />
            <HousingFlange x0={SECTION.freeTurbine.x0} x1={SECTION.freeTurbine.x1} yTop={CORE_Y - 40} yBot={CORE_Y + 40} boltCount={3} />
            <FanBlades cx={ftMid} cy={CORE_Y} r={15} count={8} className="ed-fan-turbine" dur="1.7s" />
          </Clickable>

          <Clickable onSelect={() => selectPart("hotNozzle", hotNozzleMid)} label="Hot nozzle — click for values">
            <rect x={SECTION.hotNozzle.x0} y={CORE_Y - 30} width={SECTION.hotNozzle.x1 - SECTION.hotNozzle.x0} height="60" fill="transparent" />
            <polygon
              points={`${SECTION.hotNozzle.x0},${CORE_Y - 20} ${SECTION.hotNozzle.x1},${CORE_Y - 9} ${SECTION.hotNozzle.x1},${CORE_Y + 9} ${SECTION.hotNozzle.x0},${CORE_Y + 20}`}
              className="ed-nozzle"
            />
          </Clickable>

          {/* Fan's own short flow path — freestream into the fan disc,
              out to its own fully-expanded exhaust. Not part of the
              ducted core. */}
          {FLOW_LANE_OFFSETS.slice(0, 2).map((dy, i) => (
            <line key={`fan-${i}`} x1={FAN_FLOW_X0} y1={FAN_FLOW_Y + dy} x2={FAN_FLOW_X1} y2={FAN_FLOW_Y + dy} className="ed-flow-lane" stroke={`url(#ed-heat-fan-${idSuffix})`} opacity={0.6} />
          ))}
          {FLOW_LANE_OFFSETS.slice(0, 2).flatMap((dy, laneIdx) =>
            Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
              <FlowStreak key={`fan-streak-${laneIdx}-${j}`} y={FAN_FLOW_Y + dy} index={laneIdx * STREAKS_PER_LANE + j} count={2 * STREAKS_PER_LANE} x0={FAN_FLOW_X0} x1={FAN_FLOW_X1} />
            ))
          )}

          {/* Core (gas-generator + free-turbine + hot-nozzle) flow. */}
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

        {ALL_STATIONS.map((s) => (
          <line key={s.key} x1={s.x} y1={CORE_Y - 70} x2={s.x} y2={CORE_Y + 58} className="ed-guide" />
        ))}
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
            // Twelve stations sharing this diagram's width means several
            // sit close enough together (especially the fan's own three,
            // clustered at the front) that their labels would collide on
            // one row — alternating each one's vertical offset keeps
            // every label readable without needing more horizontal room.
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
        The unducted fan sits at the very front, open to the freestream
        (no surrounding duct — that&rsquo;s the propfan&rsquo;s defining
        difference from a turbofan). Behind it, the core runs a full
        three-spool gas generator (IPC, HPC, combustor, HPT, IPT), then a
        free (power) turbine that drives the fan through a power split β,
        with any residual expansion exhausting through its own hot
        nozzle.
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1 of {TOTAL_STEPS}&rdquo; through
        &ldquo;Step {TOTAL_STEPS} of {TOTAL_STEPS}&rdquo; in simple flow
        order, by PHYSICAL position front-to-back — the fan&rsquo;s own
        three stations (10, 11, 12) come right after the freestream
        (station a), since the fan sits ahead of the core&rsquo;s own
        intake, even though the fan&rsquo;s shaft power is only solved
        much later, from the free turbine&rsquo;s own energy balance.
      </p>
      </div>
    </div>
  );
}

export default function PropfanEngineDiagram({ config, result }) {
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
        <Diagram config={config} result={result} idSuffix="pf-inline" />
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
              <Diagram config={config} result={result} idSuffix="pf-modal" />
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
