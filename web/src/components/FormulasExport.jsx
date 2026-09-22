import { downloadFormulasReport } from "../utils/formulasReport.js";

/**
 * "Download formulas" export — every formula this engine's physics
 * actually uses (intake, compressor(s)/fan, combustor, turbine(s),
 * nozzle(s), overall performance), as a standalone HTML file you can
 * open, print, or save as a PDF from your browser — same no-backend,
 * no-PDF-library pattern as ReportExport.jsx's numeric results export.
 * Content lives in utils/formulaReference.js, one list per engine.
 */
export default function FormulasExport({ engineType }) {
  return (
    <div className="report-export">
      <p className="section-note">
        Download every formula this engine uses&mdash;intake,
        compressor(s), combustor, turbine(s), nozzle(s), and overall
        performance&mdash;as a standalone HTML file you can open, print,
        or save as a PDF from your browser.
      </p>
      <button
        type="button"
        className="reset-button"
        onClick={() => downloadFormulasReport(engineType)}
      >
        Download formulas (HTML / print to PDF)
      </button>
    </div>
  );
}
