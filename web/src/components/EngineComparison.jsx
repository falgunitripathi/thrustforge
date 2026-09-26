import { useMemo, useState } from "react";
import ExpandableSection from "./ExpandableSection.jsx";
import { ENGINES, ENGINE_BY_KEY, engineConfig, headline } from "../utils/engineRegistry.js";
import { explainError } from "../utils/errorText.js";
import { fmt, tsfcPerHour } from "../utils/format.js";

// A sensible first opponent for each engine — the comparison students
// usually ask about.
const DEFAULT_RIVAL = {
  turbojet: "turbofan_unmixed", turbojet2: "turbojet", turboprop: "turbofan_unmixed",
  turboshaft: "turboprop", turbofan_unmixed: "turbojet", turbofan_mixed: "turbofan_unmixed",
  turbofan_geared: "turbofan_unmixed", turbofan_three_spool: "turbofan_unmixed", propfan: "turbofan_unmixed",
  turboramjet: "ramjet", ramjet: "scramjet", scramjet: "ramjet",
};

function solveSafely(entry, config) {
  try {
    const result = entry.solve(config);
    return { result, numbers: headline(result), error: null };
  } catch (err) {
    const msg = err.message || String(err);
    return { result: null, numbers: null, error: explainError(msg) || msg.replace(/^solve\w+:\s*/, "") };
  }
}

const ROWS = [
  { id: "thrust", label: "Thrust", unit: "kN", get: (n) => (n.thrust === null ? null : n.thrust / 1e3), digits: 2 },
  { id: "power", label: "Shaft power", unit: "kW", get: (n) => (n.power === null ? null : n.power / 1e3), digits: 0 },
  { id: "specificThrust", label: "Specific thrust", unit: "N·s/kg", get: (n) => n.specificThrust, digits: 0, better: "high" },
  { id: "tsfc", label: "TSFC", unit: "kg/(N·h)", get: (n) => tsfcPerHour(n.tsfc), digits: 3, better: "low" },
  { id: "sfc", label: "Power-specific fuel use", unit: "kg/kWh", get: (n) => n.sfc, digits: 3, better: "low" },
  { id: "f", label: "Fuel-air ratio", unit: "", get: (n) => n.f, digits: 4 },
  { id: "etaO", label: "Overall efficiency", unit: "%", get: (n) => (n.etaO === null ? null : n.etaO * 100), digits: 1, better: "high" },
];

/**
 * Engine vs engine: the open engine next to any other, re-solved at the
 * same flight condition. Each engine keeps its own settings (the ones
 * set on its tab, or its defaults if that tab hasn't been touched).
 */
export default function EngineComparison({ currentKey, configs, result }) {
  const [rivalKey, setRivalKey] = useState(null);
  const [sameFlight, setSameFlight] = useState(true);
  const rival = ENGINE_BY_KEY[rivalKey && rivalKey !== currentKey ? rivalKey : DEFAULT_RIVAL[currentKey]];
  const current = ENGINE_BY_KEY[currentKey];
  const cfg = result.config;

  const rivalSolved = useMemo(() => {
    let rc = engineConfig(rival, configs);
    if (sameFlight) rc = { ...rc, altitude_m: cfg.altitude_m, mach_flight: cfg.mach_flight };
    return { config: rc, ...solveSafely(rival, rc) };
  }, [rival, configs, sameFlight, cfg.altitude_m, cfg.mach_flight]);

  const mine = { config: cfg, result, numbers: headline(result), error: null };
  const cols = [
    { entry: current, ...mine },
    { entry: rival, ...rivalSolved },
  ];
  const rows = ROWS.filter((r) => cols.some((c) => c.numbers && r.get(c.numbers) !== null));

  const outOfRange = sameFlight && (cfg.mach_flight < rival.machMin || cfg.mach_flight > rival.machMax);

  // One-line verdict on fuel use, the number that decides most engine choices.
  let verdict = null;
  const [a, b] = cols.map((c) => (c.numbers ? tsfcPerHour(c.numbers.tsfc) : null));
  if (a !== null && b !== null) {
    const winner = a <= b ? cols[0] : cols[1];
    const loser = a <= b ? cols[1] : cols[0];
    const saving = 1 - Math.min(a, b) / Math.max(a, b);
    verdict = Math.abs(saving) < 0.005
      ? <>Both burn the same fuel per newton of thrust here.</>
      : <>The <strong>{winner.entry.label.toLowerCase()}</strong> burns <strong>{fmt(saving * 100, 0)}% less fuel</strong> per newton of thrust than the {loser.entry.label.toLowerCase()} here.</>;
  } else if (rivalSolved.error) {
    verdict = <>The {rival.label.toLowerCase()} can&rsquo;t run at this condition.</>;
  }

  return (
    <ExpandableSection
      title="Compare with another engine"
      summary="Put this engine next to any other — say a turbojet against a turbofan, or a ramjet against a scramjet — at the same altitude and flight Mach, and see which makes more thrust and which burns less fuel. Expand to view."
    >
      <div className="vs-controls">
        <label className="field">
          <span className="field-label">Compare with</span>
          <select value={rival.key} onChange={(e) => setRivalKey(e.target.value)}>
            {ENGINES.filter((e) => e.key !== currentKey).map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </label>
        <label className="vs-check">
          <input type="checkbox" checked={sameFlight} onChange={(e) => setSameFlight(e.target.checked)} />
          Fly both at this engine&rsquo;s condition ({fmt(cfg.altitude_m / 1000, 1)} km, Mach {fmt(cfg.mach_flight, 2)})
        </label>
      </div>

      <div className="vs-table-wrap">
        <table className="vs-table">
          <thead>
            <tr>
              <th scope="col"></th>
              {cols.map((c, i) => (
                <th scope="col" key={c.entry.key}>{c.entry.label}{i === 0 && <span className="vs-this"> (this one)</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Flight condition</th>
              {cols.map((c) => (
                <td key={c.entry.key}>{fmt(c.config.altitude_m / 1000, 1)} km, M {fmt(c.config.mach_flight, 2)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Air mass flow<span className="preset-unit"> kg/s</span></th>
              {cols.map((c) => <td key={c.entry.key}>{fmt(c.config.mdot_a, 1)}</td>)}
            </tr>
            {rows.map((r) => {
              const vals = cols.map((c) => (c.numbers ? r.get(c.numbers) : null));
              const both = vals.every((v) => v !== null);
              const best = both && r.better ? (r.better === "low" ? Math.min(...vals) : Math.max(...vals)) : null;
              return (
                <tr key={r.id}>
                  <th scope="row">{r.label}{r.unit && <span className="preset-unit"> {r.unit}</span>}</th>
                  {cols.map((c, i) => (
                    <td key={c.entry.key} className={best !== null && vals[i] === best && vals[0] !== vals[1] ? "vs-best" : undefined}>
                      {c.error ? (i === 1 && r === rows[0] ? "Can't run here" : "") : fmt(vals[i], r.digits)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {verdict && <p className="vs-verdict">{verdict}</p>}
      {outOfRange && !rivalSolved.error && (
        <p className="section-note">
          Mach {fmt(cfg.mach_flight, 2)} is outside the {rival.label.toLowerCase()}&rsquo;s usual range
          (Mach {fmt(rival.machMin, 1)}–{fmt(rival.machMax, 1)}), so treat its numbers with care.
        </p>
      )}
      {rivalSolved.error && (
        <p className="section-note">
          <strong>Why the {rival.label.toLowerCase()} can&rsquo;t run:</strong> {rivalSolved.error}
          {outOfRange && <> Its realistic range is Mach {fmt(rival.machMin, 1)}–{fmt(rival.machMax, 1)}.</>}
        </p>
      )}
      <p className="section-note">
        Each engine uses the settings on its own tab (or its defaults if you haven&rsquo;t changed them), so
        the air mass flows usually differ — compare <em>specific thrust</em> and <em>TSFC</em>, which don&rsquo;t
        depend on engine size. For turbofans and propfans the mass flow and specific thrust are per kg of
        core air. Overall efficiency is worked out the same way for both — useful power ÷ fuel power,
        η<sub>o</sub> = T·V/(ṁ<sub>f</sub>·Q<sub>R</sub>) (shaft power ÷ fuel power for a turboshaft) — so it can
        differ slightly from the figure on an engine&rsquo;s own results. Green marks the better value.
      </p>
    </ExpandableSection>
  );
}
