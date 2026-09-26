/**
 * Shown under the headline numbers when the engine is standing still
 * on the ground (flight Mach 0 at sea level, e.g. a take-off preset): explains why
 * propulsive and overall efficiency read 0% (or "—") rather than letting
 * it look like a bug.
 */
export default function StandstillNote({ config }) {
  // Only for the sea-level ground run it describes (take-off presets).
  if (config.mach_flight !== 0 || config.altitude_m !== 0) return null;
  return (
    <p className="section-note standstill-note">
      <strong>Why propulsive and overall efficiency are 0 here:</strong> the engine is standing still
      (flight Mach 0, like a take-off run at the moment of brake release or a test-bed run). Both efficiencies
      measure <em>useful propulsive power</em>, thrust × flight speed (T·V), and with V = 0 that&rsquo;s zero:
      η<sub>p</sub> = 2V/(V + V<sub>exit</sub>) = 0 and η<sub>0</sub> = T·V/(ṁ<sub>f</sub>·Q<sub>R</sub>) = 0,
      even though the engine is making full thrust. All the fuel&rsquo;s useful energy is going into the
      exhaust jet. Set a flight Mach above 0 in <em>Flight condition</em> to see them.
    </p>
  );
}
