import ExpandableSection from "./ExpandableSection.jsx";
import { fmt } from "../utils/format.js";

const CURRENT_VALUE_ROWS = [
  { label: "Intake / diffuser efficiency η_d", key: "eta_d", digits: 3 },
  { label: "Compressor stage efficiency η_c", key: "eta_c_stage", digits: 3 },
  { label: "Combustor efficiency η_b", key: "eta_b", digits: 3 },
  { label: "Combustor pressure-loss fraction", key: "delta_p_cc_pct", digits: 3 },
  { label: "Fuel heating value Q_R (MJ/kg)", key: "Q_R", digits: 1, scale: 1e-6 },
  { label: "Shaft power fraction λ", key: "lambda_shaft", digits: 3 },
  { label: "Mechanical efficiency η_m", key: "eta_m", digits: 3 },
  { label: "Turbine stage efficiency η_tt", key: "eta_tt_stage", digits: 3 },
  { label: "Nozzle efficiency η_N", key: "eta_N", digits: 3 },
  { label: "Cold-section γ_c", key: "gamma_c", digits: 3 },
  { label: "Cold-section Cp_c (J/(kg·K))", key: "cp_c", digits: 0 },
  { label: "Hot-section γ_h", key: "gamma_h", digits: 3 },
  { label: "Hot-section Cp_h (J/(kg·K))", key: "cp_h", digits: 0 },
];

/**
 * In-app assumptions panel: the efficiency/gas-property values behind the
 * results above, reflecting the *current* configuration (including any
 * Advanced overrides). The full narrative list of modeling simplifications
 * and judgment calls lives in the repository README rather than here, to
 * keep this panel to just the numbers a reader actually needs at a glance.
 */
export default function AssumptionsPanel({ config }) {
  return (
    <ExpandableSection
      title="Assumptions"
      summary="The efficiency and gas-property values behind the results above, right now. Expand for the full table."
    >
      <p className="section-note">
        The efficiency and gas-property values behind the results above,
        right now (editable in the Engine quality section of the form on the
        left).
      </p>
      <div className="table-scroll">
        <table className="assumptions-table">
          <thead>
            <tr><th>Quantity</th><th>Current value</th></tr>
          </thead>
          <tbody>
            {CURRENT_VALUE_ROWS.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{fmt(config[row.key] * (row.scale || 1), row.digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ExpandableSection>
  );
}
