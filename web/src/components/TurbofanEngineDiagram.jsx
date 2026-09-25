import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtKPa } from "../utils/format.js";
import { stationHeatColor } from "../utils/heatColor.js";
import {
  FanBlades, FlowStreak, FlowMarquee, HousingFlange,
  InspectToolbar, Clickable, StationReadout, PartCard, StationTrendChart,
  AfterburnerToggle,
} from "./engineDiagramParts.jsx";

/**
 * Live, clickable half-cutaway of the configured turbofan, drawn for its
 * layout (aeropropsim/turbofan.py):
 *   unmixed     — core stream on the centreline, bypass duct outside it
 *                 running from the fan to its own cold nozzle;
 *   geared      — the same, with a reduction gearbox between fan and LP shaft;
 *   three_spool — three turbines (HPT, IPT, LPT) and an IPC in place of the LPC;
 *   mixed       — the bypass duct feeds a mixer behind the LPT, then (with the
 *                 optional afterburner) ONE nozzle.
 * Both streams sit in the open lower half: core near the axis, bypass duct
 * further out, the fan spanning both.
 */

const VBOX_W = 1000;
const VBOX_H = 280;
const CORE_Y = 140;                 // axis
const CORE_FLOW_Y = CORE_Y + 16;
const SPLIT_Y = CORE_Y + 52;        // core cowl / bypass inner wall
const OUTER_Y = CORE_Y + 90;        // nacelle outer wall
const BYPASS_FLOW_Y = CORE_Y + 71;
const MARGIN = 60;
const TOTAL_W = VBOX_W + MARGIN * 2;
const FLOW_LANE_OFFSETS = [-4, 0, 4];
const STREAKS_PER_LANE = 3;

const LAYOUT_TITLE = {
  unmixed: "two-spool, unmixed",
  geared: "geared",
  three_spool: "three-spool",
  mixed: "mixed-flow",
};

/** Section x-ranges, stations and part buttons for one layout. */
function geometry(layout, ab) {
  const S = {
    intake: { x0: 40, x1: 150 },
    fan: { x0: 162, x1: 262 },
    lpc: { x0: 274, x1: 352 },
    hpc: { x0: 364, x1: 462 },
    combustor: { x0: 474, x1: 552 },
    hpt: { x0: 564, x1: 622 },
    lpt: { x0: 634, x1: 692 },
  };
  if (layout === "geared") {
    S.fan = { x0: 162, x1: 250 };
    S.gearbox = { x0: 254, x1: 290 };
    S.lpc = { x0: 296, x1: 352 };
  }
  if (layout === "three_spool") {
    S.hpt = { x0: 564, x1: 610 };
    S.ipt = { x0: 616, x1: 662 };
    S.lpt = { x0: 668, x1: 714 };
  }
  const coreEnd = S.lpt.x1 + 12;
  if (layout === "mixed") {
    S.mixer = { x0: coreEnd, x1: coreEnd + 50 };
    let x = S.mixer.x1;
    if (ab) { S.afterburner = { x0: x, x1: x + 60 }; x += 60; }
    S.hotNozzle = { x0: x, x1: 880 };
  } else {
    let x = coreEnd;
    if (ab) { S.afterburner = { x0: x, x1: x + 76 }; x += 76; }
    S.hotNozzle = { x0: x, x1: 850 };
    S.coldNozzle = { x0: coreEnd, x1: 850 };
  }

  const three = layout === "three_spool";
  const mixed = layout === "mixed";
  const st = (key, x, name, bypass = false) => ({ key, x, name, bypass });
  const list = [
    st("a", 20, "Freestream"),
    st("2", S.intake.x1, three ? "Fan inlet" : "Fan/LPC inlet"),
    st("10", S.fan.x1, "Fan exit", true),
    st("3", S.lpc.x1, three ? "IPC exit" : "LPC exit"),
    st("4", S.hpc.x1, "HPC exit"),
    st("5", S.combustor.x1, "Combustor exit"),
    st("6", S.hpt.x1, "HPT exit"),
    st("7", three ? S.ipt.x1 : S.lpt.x1, three ? "IPT exit" : "LPT exit"),
  ];
  if (three) list.push(st("8", S.lpt.x1, "LPT exit"));
  if (mixed) list.push(st("8", S.mixer.x1, "Mixer exit"));
  if (ab && !mixed) list.push(st("8", S.afterburner.x1, "Afterburner exit"));
  if (ab && mixed) list.push(st("11", S.afterburner.x1, "Afterburner exit"));
  list.push(st("9", S.hotNozzle.x1, mixed ? "Nozzle exit" : "Hot nozzle exit"));
  if (!mixed) list.push(st("11", S.coldNozzle.x1 + 70, "Cold nozzle exit", true));
  const stations = list.map((s, i) => ({ ...s, seq: i + 1 }));

  const parts = [
    { kind: "intake", label: "Intake" },
    { kind: "fan", label: "Fan" },
    ...(layout === "geared" ? [{ kind: "gearbox", label: "Gearbox" }] : []),
    { kind: "lpc", label: three ? "IPC" : "LPC" },
    { kind: "hpc", label: "HPC" },
    { kind: "combustor", label: "Combustor" },
    { kind: "hpt", label: "HPT" },
    ...(three ? [{ kind: "ipt", label: "IPT" }] : []),
    { kind: "lpt", label: "LPT" },
    ...(mixed ? [{ kind: "mixer", label: "Mixer" }] : []),
    ...(ab ? [{ kind: "afterburner", label: "Afterburner" }] : []),
    { kind: "hotNozzle", label: mixed ? "Nozzle" : "Hot nozzle" },
    ...(!mixed ? [{ kind: "coldNozzle", label: "Cold nozzle" }] : []),
  ];
  return { S, stations, parts, three, mixed };
}

function partDetails(kind, result) {
  const { config, fan, lpc, hpc, combustor, hpt, ipt, lpt, mixer, hot_nozzle, cold_nozzle, performance, stations } = result;
  const layout = config.layout;
  const three = layout === "three_spool";
  const mixed = layout === "mixed";
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
        ["Bypass ratio β", mixed ? `${fmt(performance.beta, 3)} (solved: the mixer needs equal pressures)` : fmt(performance.beta, 2)],
      ] };
    case "gearbox":
      return { title: "Reduction gearbox", rows: [
        ["Gearbox efficiency η_gb (you set this)", fmt(config.eta_gb, 3)],
        ["Power it carries, per kg/s of core air", `${fmt(((1 + config.beta) * config.cp_c * (fan.T010 - stations["2"].T0) + config.cp_c * (lpc.T03 - fan.T010)) / 1000, 1)} kW`],
        ["Why", "lets the big fan turn slowly while the LP turbine spins fast, each at its best speed"],
      ] };
    case "lpc":
      return { title: three ? "IPC — Intermediate-Pressure Compressor" : "LPC — Low-Pressure Compressor (booster)", rows: [
        ["Pressure ratio (you set this)", fmt(lpc.pi_LPC, 3)],
        ["Exit stagnation temperature", `${fmt(lpc.T03, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(lpc.p03, 1)} kPa`],
      ] };
    case "hpc":
      return { title: "HPC — High-Pressure Compressor", rows: [
        ["Pressure ratio (you set this)", fmt(hpc.pi_HPC, 3)],
        ["Exit stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpc.p04, 1)} kPa`],
        ["Overall pressure ratio (fan·LPC·HPC)", fmt(fan.pi_f * lpc.pi_LPC * hpc.pi_HPC, 2)],
      ] };
    case "combustor":
      return { title: "Combustor", rows: [
        ["Inlet stagnation temperature", `${fmt(hpc.T04, 1)} K`],
        ["Exit stagnation temperature (TIT)", `${fmt(combustor.T05, 1)} K`],
        ["Fuel-air ratio", fmt(combustor.f, 4)],
      ] };
    case "hpt":
      return { title: "HPT — High-Pressure Turbine (drives the HPC)", rows: [
        ["Inlet stagnation temperature", `${fmt(combustor.T05, 1)} K`],
        ["Exit stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(hpt.p06, 1)} kPa`],
      ] };
    case "ipt":
      return { title: "IPT — Intermediate-Pressure Turbine (drives the IPC)", rows: [
        ["Inlet stagnation temperature", `${fmt(hpt.T06, 1)} K`],
        ["Exit stagnation temperature", `${fmt(ipt.T07, 1)} K`],
        ["Exit stagnation pressure", `${fmtKPa(ipt.p07, 1)} kPa`],
      ] };
    case "lpt":
      return three
        ? { title: "LPT — Low-Pressure Turbine (drives the fan alone)", rows: [
            ["Inlet stagnation temperature", `${fmt(ipt.T07, 1)} K`],
            ["Exit stagnation temperature", `${fmt(lpt.T08, 1)} K`],
            ["Exit stagnation pressure", `${fmtKPa(lpt.p08, 1)} kPa`],
          ] }
        : { title: `LPT — Low-Pressure Turbine (drives the fan + LPC${layout === "geared" ? ", through the gearbox" : ""})`, rows: [
            ["Inlet stagnation temperature", `${fmt(hpt.T06, 1)} K`],
            ["Exit stagnation temperature", `${fmt(lpt.T07, 1)} K`],
            ["Exit stagnation pressure", `${fmtKPa(lpt.p07, 1)} kPa`],
          ] };
    case "mixer":
      return { title: "Mixer (bypass air meets the core gas)", rows: [
        ["Bypass ratio β (solved)", fmt(mixer.beta, 3)],
        ["Pressures meeting: p03′ = p07", `${fmtKPa(mixer.p03p, 1)} kPa = ${fmtKPa(lpt.p07, 1)} kPa`],
        ["Temperatures mixing: T03′ + T07 → T08", `${fmt(mixer.T03p, 0)} K + ${fmt(lpt.T07, 0)} K → ${fmt(mixer.T08, 0)} K`],
        ["Mixed-gas γ8 / Cp8", `${fmt(mixer.gamma8, 3)} / ${fmt(mixer.cp8, 0)} J/(kg·K)`],
        ["Mixing pressure ratio r_m (you set this)", fmt(config.r_mix, 3)],
      ] };
    case "afterburner": {
      const ab = result.afterburner;
      return mixed
        ? { title: "Afterburner (after the mixer, lit)", rows: [
            ["Temperature T08 → T011", `${fmt(ab.T08, 1)} K → ${fmt(ab.T011, 1)} K`],
            ["Extra fuel per kg of mixed gas f_ab", fmt(ab.fab, 4)],
            ["Pressure p08 → p011", `${fmtKPa(ab.p08, 1)} kPa → ${fmtKPa(ab.p011, 1)} kPa`],
          ] }
        : { title: "Afterburner (core stream, lit)", rows: [
            ["Temperature T07 → T08", `${fmt(ab.T07, 1)} K → ${fmt(ab.T08, 1)} K`],
            ["Extra fuel-air ratio f_ab", fmt(ab.fab, 4)],
            ["Total fuel-air ratio f + f_ab", fmt(performance.f_total, 4)],
            ["Pressure p07 → p08", `${fmtKPa(ab.p07, 1)} kPa → ${fmtKPa(ab.p08, 1)} kPa`],
          ] };
    }
    case "hotNozzle":
      return { title: mixed ? "Nozzle (mixed stream)" : "Hot nozzle (core stream)", rows: [
        ["Status", hot_nozzle.choked ? "Choked" : "Unchoked (fully expanded)"],
        ["Exit velocity", `${fmt(hot_nozzle.V_exit, 1)} m/s`],
        ["Thrust", `${fmt(performance.thrust_hot, 1)} N`],
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
      ["Static enthalpy", `${fmt(st.h / 1000, 1)} kJ/kg`],
      ["Stagnation enthalpy", `${fmt(st.h0 / 1000, 1)} kJ/kg`],
    ],
  };
}

const CASING_TOP = [
  [4, -30], [40, -70], [150, -78], [262, -95], [352, -100], [392, -80],
  [462, -75], [502, -92], [552, -80], [602, -75], [662, -95], [714, -70],
  [760, -64], [880, -50],
];
const CASING_PATH = [
  `M ${CASING_TOP[0][0]} ${CORE_Y + CASING_TOP[0][1]}`,
  ...CASING_TOP.slice(1).map(([x, dy]) => `L ${x} ${CORE_Y + dy}`),
  `L ${CASING_TOP[CASING_TOP.length - 1][0]} ${CORE_Y}`,
  `L ${CASING_TOP[0][0]} ${CORE_Y}`,
  "Z",
].join(" ");
const CASING_RIVETS = CASING_TOP.filter((_, i) => i > 0 && i < CASING_TOP.length - 1 && i % 2 === 0);

function Lanes({ x0, x1, y, stroke, idSuffix, keyPrefix, streaks = true }) {
  return (
    <>
      {FLOW_LANE_OFFSETS.map((dy, i) => (
        <line key={`${keyPrefix}-l${i}`} x1={x0} y1={y + dy} x2={x1} y2={y + dy} className="ed-flow-lane" stroke={stroke} opacity={0.65} />
      ))}
      {FLOW_LANE_OFFSETS.map((dy, i) => (
        <line key={`${keyPrefix}-m${i}`} x1={x0} y1={y + dy} x2={x1} y2={y + dy} className="ed-flow-marquee" stroke={`url(#ed-flow-marquee-${idSuffix})`} />
      ))}
      {streaks && FLOW_LANE_OFFSETS.flatMap((dy, li) =>
        Array.from({ length: STREAKS_PER_LANE }, (_, j) => (
          <FlowStreak key={`${keyPrefix}-s${li}-${j}`} y={y + dy} index={li * STREAKS_PER_LANE + j} count={FLOW_LANE_OFFSETS.length * STREAKS_PER_LANE} x0={x0} x1={x1} />
        ))
      )}
    </>
  );
}

function Diagram({ config, result, idSuffix }) {
  const { stations } = result;
  const [selected, setSelected] = useState(null);
  const ab = !!result.afterburner?.on;
  const layout = config.layout || "unmixed";
  const { S, stations: STATIONS, parts, three, mixed } = geometry(layout, ab);
  const mid = (sec) => (sec.x0 + sec.x1) / 2;
  const PART_MIDPOINTS = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, mid(v)]));

  const core = STATIONS.filter((s) => !s.bypass);
  const present = STATIONS.map((s) => stations[s.key].T0);
  const tMin = Math.min(...present), tMax = Math.max(...present);
  const coreX0 = core[0].x, coreX1 = core[core.length - 1].x;
  const coreStops = core.map((s) => (
    <stop key={s.key} offset={`${((s.x - coreX0) / (coreX1 - coreX0)) * 100}%`} stopColor={stationHeatColor(stations[s.key].T0, tMin, tMax)} />
  ));
  const bypassEndT = mixed ? stations["10"].T0 : stations["11"].T0;
  const bypassX0 = S.fan.x1;
  const bypassX1 = mixed ? S.mixer.x0 : S.coldNozzle.x1;

  function selectPart(kind) {
    const details = partDetails(kind, result);
    if (!details) return;
    setSelected({ details, leftPct: ((PART_MIDPOINTS[kind] + MARGIN) / TOTAL_W) * 100, kind });
  }
  function selectStation(s) {
    setSelected({ details: stationDetails(s, stations[s.key]), leftPct: ((s.x + MARGIN) / TOTAL_W) * 100, kind: null });
  }
  function handleWrapperClick(e) {
    if (!selected) return;
    if (e.target.closest(".ed-part-card") || e.target.closest(".ed-clickable") || e.target.closest(".station-readout")) return;
    setSelected(null);
  }

  const coreBox = (key, label, top, bottom, blades) => (
    <Clickable onSelect={() => selectPart(key)} label={`${label} — click for values`}>
      <rect x={S[key].x0} y={CORE_Y - top} width={S[key].x1 - S[key].x0} height={top + bottom} fill="transparent" />
      <HousingFlange x0={S[key].x0} x1={S[key].x1} yTop={CORE_Y - top} yBot={CORE_Y + bottom} boltCount={4} />
      {blades}
    </Clickable>
  );
  const splitEnd = mixed ? S.mixer.x0 : S.hotNozzle.x0;

  return (
    <div className="ed-diagram-wrap">
      <InspectToolbar parts={parts} activeKind={selected?.kind ?? null} onSelect={selectPart} />
      <div className="engine-diagram-scroll" onClick={handleWrapperClick}>
      <div className="engine-diagram-viewport" style={{ width: TOTAL_W }}>
      <svg
        viewBox={`${-MARGIN} 0 ${TOTAL_W} ${VBOX_H}`}
        className="engine-diagram-svg"
        style={{ width: TOTAL_W }}
        role="img"
        aria-label={`Half-cutaway schematic of the configured ${LAYOUT_TITLE[layout]} turbofan: the core stream near the axis and the bypass duct outside it, the fan spanning both. Click any part for its values.`}
      >
        <defs>
          <linearGradient id={`ed-heat-core-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={coreX0} y1={CORE_FLOW_Y} x2={coreX1} y2={CORE_FLOW_Y}>
            {coreStops}
          </linearGradient>
          <linearGradient id={`ed-heat-bypass-${idSuffix}`} gradientUnits="userSpaceOnUse" x1={bypassX0} y1={BYPASS_FLOW_Y} x2={bypassX1} y2={BYPASS_FLOW_Y}>
            <stop offset="0%" stopColor={stationHeatColor(stations["10"].T0, tMin, tMax)} />
            <stop offset="100%" stopColor={stationHeatColor(bypassEndT, tMin, tMax)} />
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
        <line x1="4" y1={CORE_Y} x2={S.hotNozzle.x1 + 60} y2={CORE_Y} className="ed-axis" />

        <g clipPath={`url(#ed-lower-half-${idSuffix})`}>
          {/* Nacelle outer wall and the core cowl splitting core from bypass */}
          <line x1={S.intake.x0} y1={OUTER_Y} x2={mixed ? S.mixer.x1 : S.coldNozzle.x1} y2={mixed ? CORE_Y + 56 : OUTER_Y - 10} stroke="var(--ed-casing-line)" strokeWidth="3" />
          <line x1={S.fan.x1} y1={SPLIT_Y} x2={splitEnd} y2={SPLIT_Y} stroke="var(--ed-casing-line)" strokeWidth="2.5" />
          <text x={(S.fan.x1 + splitEnd) / 2} y={OUTER_Y - 4} textAnchor="middle" className="ed-duct-label" pointerEvents="none">
            bypass duct{mixed ? " → mixer" : ""}
          </text>

          <Clickable onSelect={() => selectPart("intake")} label="Intake — click for values">
            <rect x={S.intake.x0} y={CORE_Y} width={S.intake.x1 - S.intake.x0} height={OUTER_Y - CORE_Y} fill="transparent" />
            <polygon points={`${S.intake.x0},${CORE_Y} ${S.intake.x1},${CORE_Y} ${S.intake.x1},${OUTER_Y - 2} ${S.intake.x0},${OUTER_Y}`} className="ed-intake" />
          </Clickable>

          <Clickable onSelect={() => selectPart("fan")} label="Fan — click for values">
            <rect x={S.fan.x0} y={CORE_Y} width={S.fan.x1 - S.fan.x0} height={OUTER_Y - CORE_Y} fill="transparent" />
            <HousingFlange x0={S.fan.x0} x1={S.fan.x1} yTop={CORE_Y - 20} yBot={OUTER_Y} boltCount={4} />
            <FanBlades cx={mid(S.fan)} cy={CORE_Y} r={OUTER_Y - CORE_Y - 6} count={12} className="ed-fan-compressor" dur={layout === "geared" ? "2.6s" : "1.6s"} />
          </Clickable>

          {layout === "geared" && (
            <Clickable onSelect={() => selectPart("gearbox")} label="Gearbox — click for values">
              <rect x={S.gearbox.x0} y={CORE_Y} width={S.gearbox.x1 - S.gearbox.x0} height="40" fill="transparent" />
              <rect x={S.gearbox.x0} y={CORE_Y + 2} width={S.gearbox.x1 - S.gearbox.x0} height="30" rx="5" className="ed-gearbox" />
              <circle cx={S.gearbox.x0 + 11} cy={CORE_Y + 17} r="8" fill="none" stroke="var(--ed-casing-line)" strokeWidth="2" strokeDasharray="2.5 2" />
              <circle cx={S.gearbox.x1 - 10} cy={CORE_Y + 20} r="5" fill="none" stroke="var(--ed-casing-line)" strokeWidth="2" strokeDasharray="2 1.6" />
            </Clickable>
          )}

          {coreBox("lpc", three ? "IPC" : "LPC", 44, 44, <FanBlades cx={mid(S.lpc)} cy={CORE_Y} r={18} count={8} className="ed-fan-compressor" dur="1.9s" />)}
          {coreBox("hpc", "HPC", 48, 48, <FanBlades cx={mid(S.hpc)} cy={CORE_Y} r={22} count={10} className="ed-fan-compressor" dur="1.5s" />)}

          <Clickable onSelect={() => selectPart("combustor")} label="Combustor — click for values">
            <rect x={S.combustor.x0} y={CORE_Y - 48} width={S.combustor.x1 - S.combustor.x0} height="96" fill="transparent" />
            <rect x={S.combustor.x0} y={CORE_Y - 40} width={S.combustor.x1 - S.combustor.x0} height="84" rx="12" className="ed-combustor" />
            <path d={`M ${S.combustor.x0 + 12} ${CORE_Y + 18} q 7 -25 14 0 q 7 -34 14 0 q 7 -25 14 0 q 7 -16 13 0`} className="ed-flame" />
          </Clickable>

          {coreBox("hpt", "HPT", 44, 44, <FanBlades cx={mid(S.hpt)} cy={CORE_Y} r={16} count={8} className="ed-fan-turbine" dur="1.2s" />)}
          {three && coreBox("ipt", "IPT", 44, 44, <FanBlades cx={mid(S.ipt)} cy={CORE_Y} r={16} count={8} className="ed-fan-turbine" dur="1.3s" />)}
          {coreBox("lpt", "LPT", 44, 44, <FanBlades cx={mid(S.lpt)} cy={CORE_Y} r={16} count={8} className="ed-fan-turbine" dur="1.4s" />)}

          {mixed && (
            <Clickable onSelect={() => selectPart("mixer")} label="Mixer — click for values">
              <rect x={S.mixer.x0} y={CORE_Y} width={S.mixer.x1 - S.mixer.x0} height={OUTER_Y - CORE_Y} fill="transparent" />
              <polygon points={`${S.mixer.x0},${CORE_Y} ${S.mixer.x1},${CORE_Y} ${S.mixer.x1},${CORE_Y + 56} ${S.mixer.x0},${OUTER_Y}`} className="ed-intake" />
              {/* Lobed mixer: chutes that fold the bypass air into the core gas */}
              {[0, 1, 2].map((i) => (
                <path key={i} d={`M ${S.mixer.x0 + 4} ${SPLIT_Y - 6 + i * 10} l 20 -10 l 20 10`} fill="none" stroke="var(--text-muted)" strokeWidth="1.6" />
              ))}
            </Clickable>
          )}

          {ab && (
            <Clickable onSelect={() => selectPart("afterburner")} label="Afterburner — click for values">
              <rect x={S.afterburner.x0} y={CORE_Y} width={S.afterburner.x1 - S.afterburner.x0} height="60" fill="transparent" />
              <rect x={S.afterburner.x0} y={CORE_Y - 22} width={S.afterburner.x1 - S.afterburner.x0} height={mixed ? 76 : 44} rx="5" className="ed-combustor" />
              {[6, 14, 22].map((dy) => (
                <circle key={dy} cx={S.afterburner.x0 + 8} cy={CORE_Y + dy} r="1.6" fill="var(--ed-flame)" />
              ))}
              <path d={`M ${S.afterburner.x0 + 16} ${CORE_Y + 18} q 7 -16 14 0 q 7 -20 14 0 q 7 -16 14 0 q 7 -12 14 0`} className="ed-flame" />
            </Clickable>
          )}

          <Clickable onSelect={() => selectPart("hotNozzle")} label={`${mixed ? "Nozzle" : "Hot nozzle"} — click for values`}>
            <rect x={S.hotNozzle.x0} y={CORE_Y} width={S.hotNozzle.x1 - S.hotNozzle.x0} height={mixed ? 60 : 40} fill="transparent" />
            <polygon
              points={mixed
                ? `${S.hotNozzle.x0},${CORE_Y} ${S.hotNozzle.x1},${CORE_Y} ${S.hotNozzle.x1},${CORE_Y + 34} ${S.hotNozzle.x0},${CORE_Y + 56}`
                : `${S.hotNozzle.x0},${CORE_Y} ${S.hotNozzle.x1},${CORE_Y} ${S.hotNozzle.x1},${CORE_Y + 24} ${S.hotNozzle.x0},${CORE_Y + 40}`}
              className="ed-nozzle"
            />
          </Clickable>

          {!mixed && (
            <Clickable onSelect={() => selectPart("coldNozzle")} label="Cold nozzle — click for values">
              <rect x={S.coldNozzle.x0} y={SPLIT_Y} width={S.coldNozzle.x1 - S.coldNozzle.x0} height={OUTER_Y - SPLIT_Y} fill="transparent" />
              <polygon points={`${S.coldNozzle.x0},${SPLIT_Y} ${S.coldNozzle.x1},${SPLIT_Y + 8} ${S.coldNozzle.x1},${OUTER_Y - 10} ${S.coldNozzle.x0},${OUTER_Y}`} className="ed-nozzle" />
            </Clickable>
          )}

          {/* Flow: bypass air in the outer duct, core gas near the axis */}
          <Lanes x0={bypassX0} x1={bypassX1} y={BYPASS_FLOW_Y} stroke={`url(#ed-heat-bypass-${idSuffix})`} idSuffix={idSuffix} keyPrefix="bp" />
          {mixed && FLOW_LANE_OFFSETS.map((dy, i) => (
            <line key={`join-${i}`} x1={S.mixer.x0} y1={BYPASS_FLOW_Y + dy} x2={S.mixer.x1} y2={CORE_FLOW_Y + 14 + dy} className="ed-flow-lane" stroke={`url(#ed-heat-bypass-${idSuffix})`} opacity={0.65} />
          ))}
          <Lanes x0={coreX0} x1={coreX1} y={CORE_FLOW_Y} stroke={`url(#ed-heat-core-${idSuffix})`} idSuffix={idSuffix} keyPrefix="core" />
        </g>

        {STATIONS.map((s) => (
          <line key={s.key} x1={s.x} y1={s.bypass ? SPLIT_Y : CORE_Y - 30} x2={s.x} y2={s.bypass ? OUTER_Y + 6 : SPLIT_Y} className="ed-guide" />
        ))}
      </svg>

      <div className="station-readouts" style={{ width: TOTAL_W }}>
        {STATIONS.map((s, i) => (
          <StationReadout
            key={s.key}
            station={s.key}
            seq={s.seq}
            name={s.name}
            T0={stations[s.key].T0}
            p0={stations[s.key].p0}
            leftPct={((s.x + MARGIN) / TOTAL_W) * 100}
            // Ten-plus stations across this width: alternate rows so
            // neighbouring labels never collide.
            top={i % 2 === 1 ? 70 : 0}
            onSelect={() => selectStation(s)}
          />
        ))}
      </div>

      <PartCard details={selected?.details} leftPct={selected?.leftPct ?? 50} onClose={() => setSelected(null)} />
      </div>

      <p className="section-note">
        A live half-cutaway — use the buttons above, or click any part or station marker, to see its numbers
        spelled out in plain English. The core gas runs near the axis; the bypass air runs in the outer duct,
        pushed by the big fan that spans both.{" "}
        {mixed
          ? "In this mixed-flow layout the bypass air rejoins the core gas in the mixer behind the LP turbine, and everything leaves through one nozzle."
          : three
            ? "This three-spool layout has three shafts: the LP turbine turns the fan alone, the IP turbine the IP compressor, and the HP turbine the HP compressor."
            : layout === "geared"
              ? "In this geared layout a reduction gearbox lets the big fan turn slower than the LP turbine that drives it."
              : "In this unmixed layout the bypass air never rejoins the core: it leaves through its own cold nozzle."}
      </p>
      <p className="section-note">
        Each marker shows &ldquo;Step 1&rdquo; through &ldquo;Step {STATIONS.length}&rdquo; in flow order,
        interleaving both streams by where they physically sit.
      </p>
      </div>
    </div>
  );
}

export default function TurbofanEngineDiagram({ config, result, onToggleAfterburner }) {
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
  const layout = config.layout || "unmixed";
  const canAfterburn = layout === "unmixed" || layout === "mixed";
  const trend = geometry(layout, !!result.afterburner?.on).stations;

  return (
    <>
      <div className="engine-diagram">
        <div className="engine-diagram-toolbar">
          <span className="engine-diagram-title">Live engine cutaway</span>
          {canAfterburn && <AfterburnerToggle config={config} onToggle={onToggleAfterburner} />}
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
                stations={trend}
                values={trend.map((s) => result.stations[s.key].T0)}
                unit="K"
                color="#ff6f61"
                decimals={0}
              />
              <StationTrendChart
                title="Stagnation pressure across stations"
                stations={trend}
                values={trend.map((s) => result.stations[s.key].p0 / 1000)}
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
