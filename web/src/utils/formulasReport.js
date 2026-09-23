/**
 * "Download formulas" export — a standalone, print-styled HTML document
 * listing every formula this engine's physics actually uses (intake,
 * compressor(s)/fan, combustor, turbine(s), nozzle(s), overall
 * performance), grouped by component, with plain-English notes. Same
 * "no backend, no PDF library — open/print/save-as-PDF" pattern as
 * report.js's numeric results export.
 *
 * Content lives in formulaReference.js; this module only renders it.
 */

import { stripCitations } from "./citations.js";
import { ENGINE_FORMULAS, SYMBOL_GLOSSARY, GAS_PROPERTY_CONSTANTS, DEFAULT_VALUE_CONSTANTS } from "./formulaReference.js";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Same symbol/subscript conventions as utils/formulaText.jsx, reimplemented
// here as a plain HTML-string builder (that module returns React nodes,
// which this static-HTML export can't use directly).
const GREEK = {
  eta: "&eta;", gamma: "&gamma;", beta: "&beta;", lambda: "&lambda;", pi: "&pi;",
  alpha: "&alpha;", delta: "&delta;", Delta: "&Delta;", sigma: "&sigma;",
  phi: "&phi;", theta: "&theta;", omega: "&omega;", Omega: "&Omega;",
  mu: "&mu;", rho: "&rho;",
};
const GREEK_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(GREEK).join("|")})(?![A-Za-z])`, "g");

function replaceSymbols(s) {
  return s
    .replace(/([A-Za-z])([0-9]{1,3})(?![0-9])/g, (_m, letter, digits) => `${letter}_{${digits}}`)
    .replace(GREEK_RE, (m) => GREEK[m])
    .replace(/(?<![A-Za-z])mdot(?![A-Za-z])/g, "&#7745;")
    .replace(/\*/g, "&middot;")
    .replace(/>=/g, "&ge;")
    .replace(/<=/g, "&le;")
    .replace(/\^/g, "^"); // handled by the tokenizer below, left as-is here
}

/** Renders one formula string to an HTML string with real <sub>/<sup>. */
function formulaToHtml(raw) {
  const s = replaceSymbols(esc(raw));
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "_" || ch === "^") {
      i += 1;
      let content = "";
      if (s[i] === "{") {
        const end = s.indexOf("}", i);
        if (end !== -1) { content = s.slice(i + 1, end); i = end + 1; }
        else { content = s.slice(i + 1); i = s.length; }
      } else if (s[i] === "(") {
        let depth = 0, j = i;
        for (; j < s.length; j += 1) {
          if (s[j] === "(") depth += 1;
          else if (s[j] === ")") { depth -= 1; if (depth === 0) { j += 1; break; } }
        }
        content = s.slice(i, j);
        i = j;
      } else {
        const m = /^[A-Za-z0-9]+/.exec(s.slice(i));
        if (m) { content = m[0]; i += m[0].length; } else { content = ch; }
      }
      out += ch === "_" ? `<sub>${content}</sub>` : `<sup>${content}</sup>`;
    } else {
      let j = i;
      while (j < s.length && s[j] !== "_" && s[j] !== "^") j += 1;
      out += s.slice(i, j);
      i = j;
    }
  }
  return out;
}

function glossaryRows(items) {
  return items.map((item) => `
    <div class="glossary-item">
      <p class="glossary-symbol">${formulaToHtml(item.symbol)}${item.value ? ` <span class="glossary-value">= ${esc(item.value)}</span>` : ""}</p>
      <p class="glossary-meaning">${esc(stripCitations(item.meaning))}</p>
    </div>
  `).join("\n");
}

/** Builds the full standalone formulas-reference HTML document for one engine. */
export function buildFormulasReportHtml(engineType) {
  const engine = ENGINE_FORMULAS[engineType];
  if (!engine) throw new Error(`buildFormulasReportHtml: unknown engine type ${engineType}`);
  const generated = new Date().toLocaleString();

  const sectionsHtml = engine.sections.map((section) => `
<h2>${esc(section.section)}</h2>
<div class="formula-list">
${section.entries.map((entry) => `
  <div class="formula-item">
    <p class="formula-item-label">${esc(entry.label)}</p>
    <p class="formula-item-formula">${formulaToHtml(stripCitations(entry.formula))}</p>
    ${entry.note ? `<p class="formula-item-note">${esc(stripCitations(entry.note))}</p>` : ""}
  </div>
`).join("\n")}
</div>
`).join("\n");

  const sidebarHtml = `
<aside class="sidebar">
  <h2>Symbols &amp; notation</h2>
  <div class="glossary-list">${glossaryRows(SYMBOL_GLOSSARY)}</div>

  <h2>Gas-property constants</h2>
  <p class="section-intro">Fixed physical constants every engine's physics uses by default (configurable in the Engine quality section).</p>
  <div class="glossary-list">${glossaryRows(GAS_PROPERTY_CONSTANTS)}</div>

  <h2>Default design values</h2>
  <p class="section-intro">Starting values for the efficiencies/design constants above &mdash; each is a real number you can change in the Engine quality section, not a fixed physical constant.</p>
  <div class="glossary-list">${glossaryRows(DEFAULT_VALUE_CONSTANTS)}</div>
</aside>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ThrustForge — ${esc(engine.name)} formula reference</title>
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
  h2 { font-size: 17px; margin: 30px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .subtitle { color: var(--text-muted); margin: 0 0 24px; font-size: 13px; }
  .page-layout { display: flex; gap: 32px; align-items: flex-start; }
  .main-column { flex: 1; min-width: 0; }
  .sidebar {
    flex: 0 0 300px; position: sticky; top: 20px;
    border-left: 1px solid var(--border); padding-left: 24px;
  }
  .sidebar h2:first-child { margin-top: 0; }
  .section-intro { color: var(--text-muted); font-size: 12px; margin: -6px 0 10px; }
  .glossary-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
  .glossary-item {
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
    background: var(--bg-panel);
  }
  .glossary-symbol {
    margin: 0 0 3px; font-family: "Georgia", "Cambria", serif; font-size: 14px;
    font-weight: 700; color: #4a3e78;
  }
  .glossary-symbol sub, .glossary-symbol sup { font-size: 0.7em; }
  .glossary-value { font-weight: 400; color: var(--text-muted); font-family: "Inter", sans-serif; }
  .glossary-meaning { margin: 0; font-size: 12px; line-height: 1.45; color: var(--text); }
  .formula-list { display: flex; flex-direction: column; gap: 14px; }
  .formula-item {
    border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px;
    background: var(--bg-panel);
  }
  .formula-item-label { margin: 0 0 6px; font-weight: 700; color: var(--text-h); font-size: 13.5px; }
  .formula-item-formula {
    margin: 0 0 6px; font-family: "Georgia", "Cambria", serif; font-size: 16px;
    color: #2a2620; background: #fbfaf7; border: 1px solid #e4e0d6; border-radius: 8px;
    padding: 10px 12px;
  }
  .formula-item-formula sub, .formula-item-formula sup { font-size: 0.65em; }
  .formula-item-note { margin: 0; font-size: 12.5px; color: var(--text-muted); }
  .print-button {
    border: 1px solid var(--accent); color: var(--accent); background: #fff;
    border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; margin-bottom: 20px;
  }
  @media print {
    .print-button { display: none; }
    body { background: #fff; padding: 0 24px; }
    .page-layout { flex-direction: column; }
    .sidebar { position: static; border-left: none; border-top: 1px solid var(--border); padding-left: 0; padding-top: 16px; flex-basis: auto; }
  }
</style>
</head>
<body>
<button class="print-button" onclick="window.print()">Print / Save as PDF</button>
<h1>ThrustForge — ${esc(engine.name)} Formula Reference</h1>
<p class="subtitle">Generated ${esc(generated)} &middot; every formula this engine's physics actually uses, grouped by component</p>
<div class="page-layout">
  <div class="main-column">
${sectionsHtml}
  </div>
  ${sidebarHtml}
</div>
<p class="subtitle">Generated by ThrustForge. Symbols follow this project's own notation (e.g. T04 = stagnation temperature at station 4).</p>
</body>
</html>`;
}

/** Builds the formulas report and hands it to the browser as a download. */
export function downloadFormulasReport(engineType) {
  const html = buildFormulasReportHtml(engineType);
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thrustforge-${engineType}-formulas.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
