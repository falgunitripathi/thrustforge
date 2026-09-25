/**
 * Client-side report export — beyond CSV. Assembles a complete,
 * self-contained, print-styled HTML document (config, assumptions,
 * performance, station and stage tables) and hands it to the browser as
 * a download, the same throwaway-object-URL pattern as csv.js. No
 * backend, no PDF library: opening the downloaded file in any browser
 * and using its own "Print -> Save as PDF" gives a PDF if one is wanted.
 */

import { fmt, fmtKPa, tsfcPerHour } from "./format.js";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const STATION_ORDER = ["a", "2", "3", "4", "5", "9"];
const STATION_LABELS = {
  a: "a — freestream", "2": "2 — compressor inlet", "3": "3 — compressor exit",
  "4": "4 — combustor exit (TIT)", "5": "5 — turbine exit", "9": "9 — nozzle exit",
};

function stationRows(stations) {
  return STATION_ORDER.filter((k) => stations[k]).map((k) => {
    const st = stations[k];
    return `<tr><td>${esc(STATION_LABELS[k] || k)}</td><td>${fmt(st.T0, 1)}</td><td>${fmtKPa(st.p0, 1)}</td>` +
      `<td>${fmt(st.T, 1)}</td><td>${fmtKPa(st.p, 1)}</td><td>${fmt(st.M, 3)}</td><td>${fmt(st.V, 1)}</td>` +
      `<td>${fmt(st.rho, 3)}</td><td>${fmt(st.h / 1000, 1)}</td><td>${fmt(st.h0 / 1000, 1)}</td></tr>`;
  }).join("\n");
}

function stageRows(stages, kind) {
  const isCompressor = kind === "compressor";
  const ratioKey = isCompressor ? "pi_stage" : "pr_stage";
  return stages.map((stage, i) => {
    const ratio = stage[ratioKey];
    const displayRatio = isCompressor ? ratio : (ratio ? 1.0 / ratio : null);
    return `<tr><td>${i + 1}</td><td>${fmt(stage.T01_in, 1)}</td><td>${fmt(stage.T01_out, 1)}</td>` +
      `<td>${fmt(stage.dT0, 1)}</td><td>${fmt(displayRatio, 3)}</td></tr>`;
  }).join("\n");
}

function describeCompressor(cfg) {
  return cfg.compressor_type === "axial"
    ? `Axial, ${cfg.n_compressor_stages} stage(s), target π_c = ${fmt(cfg.pi_c, 2)}`
    : `Centrifugal, blade tip speed U2 = ${fmt(cfg.centrifugal_U2, 0)} m/s`;
}

function describeTurbine(cfg) {
  return `${cfg.turbine_type === "axial" ? "Axial" : "Radial"}, ${cfg.n_turbine_stages} stage(s)`;
}

function describeNozzle(cfg) {
  return cfg.nozzle_type === "convergent"
    ? "Convergent"
    : `Convergent-divergent, design exit Mach = ${fmt(cfg.nozzle_exit_mach_design, 2)}`;
}

/** Builds the full standalone report HTML for one solved (config, result). */
export function buildReportHtml(config, result) {
  const { performance, nozzle, compressor, turbine, stations } = result;
  const tsfcHr = tsfcPerHour(performance.tsfc);
  const generated = new Date().toLocaleString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ThrustForge engine report</title>
<style>
  :root {
    --text: #4a4458; --text-h: #241f30; --text-muted: #857c93;
    --border: #e8e1f2; --accent: #8a7cf5; --bg-panel: #ffffff; --code-bg: #f1eefb;
  }
  * { box-sizing: border-box; }
  body {
    font: 15px/1.5 "Inter", system-ui, "Segoe UI", Roboto, sans-serif;
    color: var(--text); background: #f8f5fb; margin: 0; padding: 40px 48px;
  }
  h1, h2 { font-family: "Manrope", "Inter", sans-serif; color: var(--text-h); }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 28px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .subtitle { color: var(--text-muted); margin: 0 0 24px; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 8px; }
  th, td { border: 1px solid var(--border); padding: 5px 9px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { background: var(--code-bg); color: var(--text-muted); font-weight: 600; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .perf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 8px; }
  .perf-cell { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--bg-panel); }
  .perf-cell .label { display: block; font-size: 11px; color: var(--text-muted); }
  .perf-cell .value { display: block; font-size: 16px; font-weight: 700; color: var(--text-h); }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .note { color: var(--text-muted); font-size: 12px; }
  .print-button {
    border: 1px solid var(--accent); color: var(--accent); background: #fff;
    border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; margin-bottom: 20px;
  }
  @media print { .print-button { display: none; } body { background: #fff; padding: 0 24px; } }
</style>
</head>
<body>
<button class="print-button" onclick="window.print()">Print / Save as PDF</button>
<h1>ThrustForge — Engine Performance Report</h1>
<p class="subtitle">Generated ${esc(generated)} &middot; single-spool turbojet, single design point &middot; all physics computed client-side</p>

<h2>Configuration</h2>
<div class="grid-2">
<table>
  <tr><th>Flight condition</th><td></td></tr>
  <tr><td>Altitude</td><td>${fmt(config.altitude_m, 0)} m</td></tr>
  <tr><td>Flight Mach number</td><td>${fmt(config.mach_flight, 2)}</td></tr>
  <tr><td>Compressor</td><td>${esc(describeCompressor(config))}</td></tr>
  <tr><td>Turbine inlet temperature (TIT)</td><td>${fmt(config.T04, 0)} K</td></tr>
  <tr><td>Turbine</td><td>${esc(describeTurbine(config))}</td></tr>
  <tr><td>Afterburner</td><td>${config.afterburner_on ? `lit, T06 = ${fmt(config.T06_ab, 0)} K, Δp ${fmt(config.delta_p_ab_pct * 100, 1)}%` : "off"}</td></tr>
  <tr><td>Nozzle</td><td>${esc(describeNozzle(config))}</td></tr>
  <tr><td>Air mass flow rate</td><td>${fmt(config.mdot_a, 2)} kg/s</td></tr>
</table>
<table>
  <tr><th>Efficiencies &amp; design values</th><td></td></tr>
  <tr><td>Intake η_d</td><td>${fmt(config.eta_d, 3)}</td></tr>
  <tr><td>Compressor stage η_c</td><td>${fmt(config.eta_c_stage, 3)}</td></tr>
  <tr><td>Combustor η_b</td><td>${fmt(config.eta_b, 3)}</td></tr>
  <tr><td>Combustor Δp loss</td><td>${fmt(config.delta_p_cc_pct * 100, 1)}%</td></tr>
  <tr><td>Fuel heating value Q_R</td><td>${fmt(config.Q_R / 1e6, 1)} MJ/kg</td></tr>
  <tr><td>Shaft power fraction λ</td><td>${fmt(config.lambda_shaft, 3)}</td></tr>
  <tr><td>Mechanical η_m</td><td>${fmt(config.eta_m, 3)}</td></tr>
  <tr><td>Turbine stage η_tt</td><td>${fmt(config.eta_tt_stage, 3)}</td></tr>
  <tr><td>Nozzle η_N</td><td>${fmt(config.eta_N, 3)}</td></tr>
</table>
</div>

<h2>Overall performance</h2>
<div class="perf-grid">
  <div class="perf-cell"><span class="label">Thrust</span><span class="value">${fmt(performance.thrust, 1)} N</span></div>
  <div class="perf-cell"><span class="label">Specific thrust</span><span class="value">${fmt(performance.specific_thrust, 2)} N&middot;s/kg</span></div>
  <div class="perf-cell"><span class="label">TSFC</span><span class="value">${fmt(tsfcHr, 3)} kg/(N&middot;h)</span></div>
  <div class="perf-cell"><span class="label">Fuel-air ratio f</span><span class="value">${fmt(performance.f, 4)}</span></div>
  ${performance.f_ab > 0 ? `<div class="perf-cell"><span class="label">Afterburner fuel f_ab</span><span class="value">${fmt(performance.f_ab, 4)}</span></div>` : ""}
  <div class="perf-cell"><span class="label">Thermal efficiency</span><span class="value">${performance.eta_thermal !== null ? fmt(performance.eta_thermal * 100, 1) + "%" : "—"}</span></div>
  <div class="perf-cell"><span class="label">Propulsive efficiency</span><span class="value">${performance.eta_propulsive !== null ? fmt(performance.eta_propulsive * 100, 1) + "%" : "—"}</span></div>
  <div class="perf-cell"><span class="label">Overall efficiency</span><span class="value">${performance.eta_overall !== null ? fmt(performance.eta_overall * 100, 1) + "%" : "—"}</span></div>
  <div class="perf-cell"><span class="label">Nozzle</span><span class="value">${nozzle.choked ? "Choked" : "Unchoked"}</span></div>
</div>

<h2>Station analysis</h2>
<table>
  <thead><tr><th>Station</th><th>T0 (K)</th><th>p0 (kPa)</th><th>T (K)</th><th>p (kPa)</th><th>M</th><th>V (m/s)</th><th>ρ (kg/m³)</th><th>h (kJ/kg)</th><th>h0 (kJ/kg)</th></tr></thead>
  <tbody>${stationRows(stations)}</tbody>
</table>

<div class="grid-2">
  <div>
    <h2>Compressor stages (${esc(compressor.type)})</h2>
    <table>
      <thead><tr><th>Stage</th><th>T0 in (K)</th><th>T0 out (K)</th><th>ΔT0 (K)</th><th>Stage π</th></tr></thead>
      <tbody>${stageRows(compressor.stages, "compressor")}</tbody>
    </table>
    <p class="note">Overall π_c achieved: ${fmt(compressor.pi_actual, 3)}</p>
  </div>
  <div>
    <h2>Turbine stages (${esc(turbine.type)})</h2>
    <table>
      <thead><tr><th>Stage</th><th>T0 in (K)</th><th>T0 out (K)</th><th>ΔT0 (K)</th><th>Expansion ratio</th></tr></thead>
      <tbody>${stageRows(turbine.stages, "turbine")}</tbody>
    </table>
    <p class="note">Overall expansion ratio achieved: ${fmt(1.0 / turbine.pr_actual, 3)}</p>
  </div>
</div>

<h2>Assumptions</h2>
<ul>
  <li>Single design point, single-spool turbojet with an optional afterburner (no bypass stream).</li>
  <li>Ideal-gas, calorically-perfect cold and hot sections with distinct constant γ/Cp on each side of the combustor (no continuous gas-property variation with temperature).</li>
  <li>Combustor fuel-air ratio uses this project's full energy-balance formula by default (see the in-app Validation panel for how this compares with a common textbook's simplified linear estimate).</li>
  <li>Choked-nozzle exit temperature uses the eta_N-independent rigorous formula by default (an alternate, textbook-matching convention is documented and used only for that validation check).</li>
  <li>A radial turbine is modeled single-stage only.</li>
  <li>Atmosphere model is valid up to 11 km (troposphere only).</li>
</ul>

<p class="note">Generated by ThrustForge — all physics runs in your browser.</p>
</body>
</html>`;
}

/** Builds the report and hands it to the browser as a download. */
export function downloadReport(config, result) {
  const html = buildReportHtml(config, result);
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "thrustforge-report.html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
