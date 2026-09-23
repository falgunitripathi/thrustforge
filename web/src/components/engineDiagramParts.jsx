import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { fmt } from "../utils/format.js";
import { resolveLabelOffsets } from "../utils/labelPlacement.js";

/**
 * Shared visual building blocks for the engine cutaway diagrams
 * (EngineDiagram.jsx for the turbojet, TurbopropEngineDiagram.jsx for the
 * turboprop) — pulled out so both engines' diagrams look and behave like
 * the same family of drawing rather than two independently-styled ones.
 * Nothing here is engine-specific; each diagram supplies its own station
 * list, section layout, and click-detail content.
 */

/** Axial stage bars — count capped visually at 6 so a 12-stage compressor doesn't overplot. */
export function StageBars({ x0, x1, count, growUp, className, centerlineY }) {
  const n = Math.max(1, Math.min(Math.round(count) || 1, 6));
  const w = (x1 - x0) / n;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const frac = (i + 1) / n;
    const h = growUp ? 34 + frac * 52 : 86 - frac * 52;
    const x = x0 + i * w;
    bars.push(
      <rect
        key={i}
        x={x + 3}
        y={centerlineY - h / 2}
        width={Math.max(w - 6, 4)}
        height={h}
        rx="3"
        className={className}
        opacity={0.5 + 0.5 * frac}
      />
    );
  }
  return <>{bars}</>;
}

/** A radial-wheel glyph for centrifugal compressors / radial turbines — its spokes spin continuously. */
export function RadialWheel({ cx, cy, r, className, dur = "2s" }) {
  const spokes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spokes.push(
      <line key={i} x1={0} y1={0} x2={Math.cos(a) * (r - 6)} y2={Math.sin(a) * (r - 6)} className="ed-spoke" />
    );
  }
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r} className={className} />
      <g>
        {spokes}
        <circle r={r * 0.22} className="ed-hub" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
      </g>
    </g>
  );
}

/** A small spinning pinwheel of blades, layered over the axial stage bars as a "moving parts" cue. */
export function FanBlades({ cx, cy, r, count = 8, className, dur = "2.2s" }) {
  const blades = [];
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i;
    blades.push(
      <path
        key={i}
        d={`M 0 ${-r * 0.16} L ${r * 0.82} ${-r * 0.34} L ${r} 0 L ${r * 0.82} ${r * 0.34} L 0 ${r * 0.16} Z`}
        transform={`rotate(${angle})`}
        className={className}
      />
    );
  }
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g>
        {blades}
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
      </g>
      <circle r={r * 0.2} className="ed-fan-hub" />
    </g>
  );
}

/**
 * A wide-bladed propeller glyph (2-4 broad blades, unlike the narrower
 * many-blade turbine/compressor fan) — for the turboprop's propeller,
 * mounted ahead of the intake rather than inside the gas-path.
 */
export function PropellerBlades({ cx, cy, r, count = 4, className, dur = "1.1s" }) {
  const blades = [];
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i;
    blades.push(
      <path
        key={i}
        d={`M 0 ${-r * 0.08} C ${r * 0.3} ${-r * 0.5}, ${r * 0.75} ${-r * 0.62}, ${r} ${-r * 0.1}
            C ${r * 0.78} ${r * 0.1}, ${r * 0.3} ${r * 0.1}, 0 ${r * 0.08} Z`}
        transform={`rotate(${angle})`}
        className={className}
      />
    );
  }
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g>
        {blades}
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={dur} repeatCount="indefinite" />
      </g>
      <circle r={r * 0.16} className="ed-fan-hub" />
    </g>
  );
}

/** One flowing streak, riding a lane start to end, its color animating white (cool) to red (hot) in step with its own travel. */
export function FlowStreak({ y, index, count, x0, x1 }) {
  const dur = 2.6;
  const delay = (index / count) * -dur;
  return (
    <line x1="-30" y1="0" x2="0" y2="0" className="ed-flow-streak">
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={`M ${x0} ${y} L ${x1} ${y}`} />
      <animate attributeName="stroke" values="#ffffff;#ffd479;#ff6f61" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </line>
  );
}

/**
 * A continuously-scrolling marquee of stripes laid over each flow lane, on
 * top of the individual streaks — the whole duct visibly conveys motion
 * end to end rather than relying on the eye to track a few thin streaks.
 */
export function FlowMarquee({ idSuffix }) {
  return (
    <pattern id={`ed-flow-marquee-${idSuffix}`} patternUnits="userSpaceOnUse" width="16" height="8" patternTransform="translate(0 0)">
      <rect width="16" height="8" fill="transparent" />
      <rect x="0" y="0" width="8" height="8" fill="#ffffff" opacity="0.55" />
      <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="16 0" dur="0.6s" repeatCount="indefinite" />
    </pattern>
  );
}

/**
 * A machined-looking housing outline with a ring of bolts along its top
 * and bottom edge — layered behind the spinning compressor/turbine glyph
 * so that section reads as an actual bolted casing, not a bare shape.
 */
export function HousingFlange({ x0, x1, yTop, yBot, boltCount = 6 }) {
  const bolts = [];
  for (let i = 0; i < boltCount; i++) {
    const frac = (i + 0.5) / boltCount;
    const x = x0 + frac * (x1 - x0);
    bolts.push(<circle key={`t-${i}`} cx={x} cy={yTop} r="1.6" className="ed-bolt" />);
    bolts.push(<circle key={`b-${i}`} cx={x} cy={yBot} r="1.6" className="ed-bolt" />);
  }
  return (
    <>
      <rect x={x0} y={yTop} width={x1 - x0} height={yBot - yTop} rx="8" className="ed-housing" />
      {bolts}
    </>
  );
}

/** An explicit row of "Inspect" buttons — one per component. */
export function InspectToolbar({ parts, activeKind, onSelect }) {
  return (
    <div className="ed-inspect-toolbar" role="group" aria-label="Inspect an engine part">
      {parts.map((p) => (
        <button
          key={p.kind}
          type="button"
          className={`ed-inspect-button${activeKind === p.kind ? " is-active" : ""}`}
          onClick={() => onSelect(p.kind)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** An SVG group that's both clickable and keyboard-activatable, for one engine part. */
export function Clickable({ onSelect, label, children }) {
  return (
    <g
      className="ed-clickable"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </g>
  );
}

export function StationReadout({ station, seq, name, T0, p0, leftPct, top = 0, onSelect }) {
  const animT = useAnimatedNumber(T0);
  const animP = useAnimatedNumber(p0 / 1000);
  return (
    <div
      className="station-readout"
      style={{ left: `${leftPct}%`, top }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="station-dot" aria-hidden="true" />
      <div className="station-card">
        <span className="station-tag">Step {seq}</span>
        <span className="station-name">St. {station} — {name}</span>
        <span className="station-num">{fmt(animT, 0)} K</span>
        <span className="station-num station-num-muted">{fmt(animP, 0)} kPa</span>
      </div>
    </div>
  );
}

/**
 * Same visual language as StationReadout, for a numbered step that isn't
 * one of the gas-path flow stations (T0/p0 don't apply) — the
 * turboprop's propeller (a separate air stream, not part of the ducted
 * flow) or the turboshaft's load (mechanical output, not a flow state).
 * Takes two already-formatted value/unit pairs instead of T0/p0.
 */
export function PartStepReadout({
  name, seq, value1, unit1, value2, unit2, leftPct, top = 0, onSelect,
}) {
  const anim1 = useAnimatedNumber(value1);
  const anim2 = useAnimatedNumber(value2);
  return (
    <div
      className="station-readout"
      style={{ left: `${leftPct}%`, top }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="station-dot" aria-hidden="true" />
      <div className="station-card">
        <span className="station-tag">Step {seq}</span>
        <span className="station-name">{name}</span>
        <span className="station-num">{fmt(anim1, 1)} {unit1}</span>
        {unit2 && <span className="station-num station-num-muted">{fmt(anim2, 1)} {unit2}</span>}
      </div>
    </div>
  );
}

/** A small floating card of plain-English values, anchored above the part that was clicked. */
export function PartCard({ details, leftPct, onClose }) {
  if (!details) return null;
  return (
    <div className="ed-part-card" style={{ left: `${leftPct}%` }}>
      <div className="ed-part-card-header">
        <span>{details.title}</span>
        <button type="button" className="ed-part-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="ed-part-card-body">
        {details.rows.map(([label, value]) => (
          <div className="ed-part-card-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A small, single-series line chart of one value across a list of
 * stations — shown only in the expanded view, where there's room for it
 * alongside the enlarged diagram. `stations` is `[{key}, ...]` in flow
 * order; `values` is the matching array of numbers.
 */
export function StationTrendChart({ title, stations, values, unit, color, decimals = 0 }) {
  const w = 280;
  const h = 148;
  const padL = 8;
  const padR = 40;
  const padT = 22;
  const padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = padL + (i / (values.length - 1)) * plotW;
    const y = padT + plotH - ((v - min) / span) * plotH;
    return [x, y];
  });
  const pathD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  const labelText = values.map((v) => fmt(v, decimals));
  const labelOffsets = resolveLabelOffsets(
    points.map(([x, y], i) => ({ x, y, text: labelText[i] })),
    { estCharWidth: 5, estHeight: 11 }
  );

  return (
    <div className="ed-trend-card">
      <p className="ed-trend-title">{title} ({unit})</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="ed-trend-svg"
        role="img"
        aria-label={`${title}: ${stations.map((s, i) => `station ${s.key} ${fmt(values[i], decimals)} ${unit}`).join(", ")}`}
      >
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} className="ed-trend-axis" />
        <line x1={padL} y1={padT} x2={padL + plotW} y2={padT} className="ed-trend-gridline" />
        <path d={pathD} className="ed-trend-line" stroke={color} />
        {points.map(([x, y], i) => {
          const off = labelOffsets[i];
          return (
            <g key={stations[i].key}>
              <circle cx={x} cy={y} r="4" fill={color} className="ed-trend-dot">
                <title>{`St. ${stations[i].key} — ${fmt(values[i], decimals)} ${unit}`}</title>
              </circle>
              <text x={x + off.dx} y={y + off.dy} textAnchor={off.anchor} className="ed-trend-pointlabel">
                {labelText[i]}
              </text>
            </g>
          );
        })}
        {stations.map((s, i) => (
          <text key={s.key} x={points[i][0]} y={h - 4} textAnchor="middle" className="ed-trend-tick">
            {s.key}
          </text>
        ))}
      </svg>
    </div>
  );
}
