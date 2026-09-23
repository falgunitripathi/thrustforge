import { fmt } from "../utils/format.js";

/**
 * Per-stage table shared by the compressor and turbine stage-stacks
 * (Ref §4.2 compressor stacking, §6.1 turbine stacking). `kind` selects
 * whether the ratio column reads as a pressure-ratio rise (compressor,
 * pi_stage >= 1) or an expansion ratio (turbine, pr_stage <= 1, shown
 * inverted as "expansion ratio" >= 1 to match how it's conventionally
 * quoted).
 *
 * A single-stage radial turbine's synthetic stage entry (built directly
 * in engine.js, not by stackAxialTurbine) omits the relative-pressure
 * bookkeeping fields — rendered as "—" rather than crashing.
 */
export default function StageTable({ stages, kind }) {
  const isCompressor = kind === "compressor";
  const ratioKey = isCompressor ? "pi_stage" : "pr_stage";
  const inRelKey = isCompressor ? "p01_in_rel" : "p_in_rel";
  const outRelKey = isCompressor ? "p01_out_rel" : "p_out_rel";

  return (
    <div className="table-scroll">
      <table className="stage-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th title="This stage's inlet stagnation temperature — the previous stage's T0 out (or the overall compressor/turbine inlet, for stage 1).">T0 in (K)</th>
            <th title="T0 in ± this stage's ΔT0 (compressor: +; turbine: −) — becomes the next stage's T0 in.">T0 out (K)</th>
            <th title={
              isCompressor
                ? "Nominal per-stage temperature rise = (overall ΔT0 from step 1) / n_stages, except the last stage, which is back-solved to close the target overall pressure ratio exactly."
: "Nominal per-stage temperature drop = (overall ΔT0 from the shaft power balance) / n_stages, except the last stage, which is back-solved to close the overall expansion exactly."
            }>ΔT0 (K)</th>
            <th title={
              isCompressor
                ? "π_stage = (1 + η_st·ΔT0/T0,in)^(γ_c/(γ_c−1)), using this stage's own inlet T0 in the denominator."
: "p_out/p_in = [1 − ΔT0/(η_tt·T0,in)]^(γ_h/(γ_h−1)), using this stage's own inlet T0 in the denominator — shown here inverted (1/ratio) as the conventional ≥1 expansion ratio."
            }>{isCompressor ? "Stage π" : "Expansion ratio"}</th>
            <th title="This stage's inlet stagnation pressure relative to the compressor/turbine's own inlet (=1.0) — the running product of every prior stage's own ratio.">p0 in (rel.)</th>
            <th title="p0 in (rel.) × this stage's own ratio — becomes the next stage's p0 in (rel.).">p0 out (rel.)</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage, i) => {
            const ratio = stage[ratioKey];
            const displayRatio = isCompressor ? ratio : (ratio ? 1.0 / ratio : null);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{fmt(stage.T01_in, 1)}</td>
                <td>{fmt(stage.T01_out, 1)}</td>
                <td>{fmt(stage.dT0, 1)}</td>
                <td>{fmt(displayRatio, 3)}</td>
                <td>{stage[inRelKey] !== undefined ? fmt(stage[inRelKey], 3) : "—"}</td>
                <td>{stage[outRelKey] !== undefined ? fmt(stage[outRelKey], 3) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
