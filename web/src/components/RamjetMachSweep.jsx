import { useMemo } from "react";
import { solveRamjet } from "../physics/ramjet.js";
import SweepChart from "./SweepChart.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import { tsfcPerHour, fmt } from "../utils/format.js";
import { linspace } from "../utils/sweepParams.js";

const MACH_MIN = 0.5;
const MACH_MAX = 6.0;
const POINTS = 23;

/**
 * Re-solves the current ramjet at every flight Mach from 0.5 to 6 — the
 * one chart that shows why ramjets exist: useless at low speed, best
 * around Mach 3, fading again as ram heating eats into the combustor's
 * temperature rise.
 */
export default function RamjetMachSweep({ config }) {
  const { xs, spThrust, tsfc, etaO, bestIdx } = useMemo(() => {
    const machs = linspace(MACH_MIN, MACH_MAX, POINTS);
    const st = [], sf = [], eo = [];
    for (const m of machs) {
      try {
        const p = solveRamjet({ ...config, mach_flight: m }).performance;
        const ok = p.specific_thrust > 0;
        st.push(p.specific_thrust);
        sf.push(ok ? tsfcPerHour(p.tsfc) : null);
        eo.push(ok ? p.eta_overall * 100 : null);
      } catch {
        st.push(null); sf.push(null); eo.push(null);
      }
    }
    let best = -1;
    sf.forEach((v, i) => { if (v !== null && (best < 0 || v < sf[best])) best = i; });
    return { xs: machs, spThrust: st, tsfc: sf, etaO: eo, bestIdx: best };
  }, [config]);

  return (
    <ExpandableSection
      title="Performance across flight Mach"
      summary="Your ramjet re-solved at every flight speed from Mach 0.5 to 6, with all your other settings kept. Shows why ramjets are boosted to supersonic speed before they're switched on. Expand to view."
    >
      <p className="section-note">
        Each point is your current design flown at a different Mach number. At low speed the intake barely
        compresses the air, so fuel is wasted; as speed rises the ram compression improves the cycle.
        {bestIdx >= 0 && <> Fuel use is lowest near <strong>Mach {fmt(xs[bestIdx], 1)}</strong> for this design.</>}{" "}
        At very high Mach the incoming air is already so hot that little fuel can be added before reaching
        T04, and thrust falls away. Gaps mean the engine can&rsquo;t run there.
      </p>
      <div className="sweep-charts">
        <SweepChart title="Specific thrust" xValues={xs} yValues={spThrust} unit="N·s/kg"
          color="#2a78d6" decimals={0} xUnit="Mach" xDecimals={1} />
        <SweepChart title="TSFC" xValues={xs} yValues={tsfc} unit="kg/(N·h)"
          color="#eb6834" decimals={3} xUnit="Mach" xDecimals={1} bestIndex={bestIdx >= 0 ? bestIdx : null} />
        <SweepChart title="Overall efficiency" xValues={xs} yValues={etaO} unit="%"
          color="#1baf7a" decimals={1} xUnit="Mach" xDecimals={1} />
      </div>
    </ExpandableSection>
  );
}
