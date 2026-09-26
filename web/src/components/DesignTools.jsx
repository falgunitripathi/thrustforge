import ParameterSweep from "./ParameterSweep.jsx";
import ConfigCompare from "./ConfigCompare.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import { ENGINE_BY_KEY, engineKey } from "../utils/engineRegistry.js";
import { ENGINE_TOOLS } from "../utils/engineTools.js";

/**
 * The turbojet's parameter sweep and saved-designs table, for every
 * other engine: same components, fed each engine's own solver, sweepable
 * inputs and key-input columns (utils/engineTools.js).
 */
export default function DesignTools({ engineType, config, savedConfigs, onSave, onRemove }) {
  const tools = ENGINE_TOOLS[engineType];
  if (!tools) return null;
  const key = engineKey(engineType, config);
  const params = tools.params(config);

  return (
    <>
      <ParameterSweep
        key={key}
        config={config}
        solve={ENGINE_BY_KEY[key].solve}
        params={params}
        defaultParam={params[2]?.key}
        power={tools.power}
      />
      <ExpandableSection
        title="Saved configurations"
        summary="Snapshot this engine's current design and results, then compare several side by side. Saved here in your browser, so they're still here next time you open ThrustForge."
      >
        <ConfigCompare
          savedConfigs={savedConfigs}
          onSave={onSave}
          onRemove={onRemove}
          columns={tools.columns}
          power={tools.power}
        />
      </ExpandableSection>
    </>
  );
}
