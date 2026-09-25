import { fmt } from "../utils/format.js";
import { resolveLabelOffsets } from "../utils/labelPlacement.js";

const STATION_ORDER = ["a", "2", "3", "4", "5", "6", "9"];  // 6 only when the afterburner is lit

const WIDTH = 580;
const HEIGHT = 380;
const MARGIN = { top: 24, right: 34, bottom: 52, left: 68 };

/**
 * A simplified P-v (pressure-specific volume) process diagram connecting
 * the key stations a → 2 → 3 → 4 → 5 → 9, using each station's own static
 * pressure and specific volume (v = 1/ρ) — the same station set and the
 * same structural approach as `TsDiagram`, just plotting p vs. v instead
 * of T vs. s. Static (not stagnation) properties are used throughout,
 * since v = 1/ρ is only meaningful for the static state.
 */
export default function PvDiagram({ stations, order = STATION_ORDER }) {
  const points = order
    .filter((key) => stations[key])
    .map((key) => {
      const st = stations[key];
      return { key, v: 1 / st.rho, p: st.p / 1000 };
    });

  if (points.length === 0) return null;

  const vValues = points.map((p) => p.v);
  const pValues = points.map((p) => p.p);
  const vMin = Math.min(...vValues, 0);
  const vMax = Math.max(...vValues, 1);
  const pMin = Math.min(...pValues);
  const pMax = Math.max(...pValues);
  const vPad = (vMax - vMin) * 0.1 || 1;
  const pPad = (pMax - pMin) * 0.1 || 1;

  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = (v) => MARGIN.left + ((v - (vMin - vPad)) / ((vMax + vPad) - (vMin - vPad))) * plotW;
  const yScale = (p) => MARGIN.top + plotH - ((p - (pMin - pPad)) / ((pMax + pPad) - (pMin - pPad))) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.v).toFixed(1)} ${yScale(p.p).toFixed(1)}`)
    .join(" ");

  const dataSummary = points
    .map((p) => `station ${p.key}: ${fmt(p.p, 0)} kPa, v ${fmt(p.v, 3)} m³/kg`)
    .join("; ");

  // Points close together in (v, p) space would otherwise print labels on
  // top of each other — nudge each label to whichever of a few candidate
  // positions doesn't collide with one already placed. See
  // utils/labelPlacement.js.
  const labelText = points.map((p) => `${p.key} (${fmt(p.p, 0)} kPa)`);
  const labelOffsets = resolveLabelOffsets(
    points.map((p, i) => ({ x: xScale(p.v), y: yScale(p.p), text: labelText[i] }))
  );

  return (
    <div className="ts-diagram">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Pressure-specific volume process diagram across stations a through 9. ${dataSummary}.`}
      >
        {/* axes */}
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + plotH} className="ts-axis" />
        <line x1={MARGIN.left} y1={MARGIN.top + plotH} x2={MARGIN.left + plotW} y2={MARGIN.top + plotH} className="ts-axis" />
        <text x={MARGIN.left + plotW / 2} y={HEIGHT - 8} textAnchor="middle" className="ts-axis-label">
          Specific volume v (m³/kg)
        </text>
        <text
          x={16}
          y={MARGIN.top + plotH / 2}
          textAnchor="middle"
          className="ts-axis-label"
          transform={`rotate(-90 16 ${MARGIN.top + plotH / 2})`}
        >
          Static p (kPa)
        </text>

        {/* process line */}
        <path d={pathD} className="ts-path" fill="none" />

        {/* points + labels */}
        {points.map((p, i) => {
          const off = labelOffsets[i];
          return (
            <g key={p.key}>
              <circle cx={xScale(p.v)} cy={yScale(p.p)} r={6} className="ts-point" />
              <text
                x={xScale(p.v) + off.dx}
                y={yScale(p.p) + off.dy}
                textAnchor={off.anchor}
                className="ts-point-label"
              >
                {labelText[i]}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>Pressure-specific volume data (same values as the diagram above)</caption>
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col">Static p (kPa)</th>
            <th scope="col">v (m³/kg)</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.key}</th>
              <td>{fmt(p.p, 0)}</td>
              <td>{fmt(p.v, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
