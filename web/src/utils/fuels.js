/**
 * Fuel catalogue for the Fuel section / Compare-fuels table. Choosing a
 * fuel only sets Q_R (its lower heating value) — the one fuel property
 * every engine's physics already takes as an input. Hot-gas gamma/Cp are
 * left at the standard values: changing them per fuel needs a combustion-
 * chemistry calculation the source material doesn't cover.
 *
 * None of these numbers are in the project's textbooks. Q_R values are
 * published lower (net) heating values: Jet A / Jet A-1 from their
 * standard property table; JP-4, JP-5, JP-7, JP-8 are the military-spec
 * MINIMUM net heat of combustion (MIL-DTL-5624, MIL-DTL-83133, JP-7
 * spec); pure compounds from standard LHV tables at 25 °C. f_stoich is
 * the stoichiometric fuel-air ratio from the combustion equation with air
 * at 23.14% O2 by mass (kerosene-type fuels via a C12H23 surrogate, so
 * approximate).
 */

const GAS_TURBINES = ["turbojet", "turboprop", "turboshaft", "turbofan", "propfan"];
const ALL = [...GAS_TURBINES, "scramjet"];

export const FUELS = [
  {
    id: "kerosene", name: "Kerosene (generic) — default", Q_R: 43.0e6, f_stoich: 0.0682, engines: ALL,
    note: "The project's default: a generic aviation kerosene. Jet A/Jet A-1 are specific grades of this.",
  },
  {
    id: "jet-a", name: "Jet A", Q_R: 43.02e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "Standard airliner fuel in the USA.",
  },
  {
    id: "jet-a1", name: "Jet A-1", Q_R: 43.15e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "Standard airliner fuel worldwide — like Jet A with a lower freezing point.",
  },
  {
    id: "jp-8", name: "JP-8 (military)", Q_R: 42.8e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "NATO military fuel — Jet A-1 plus anti-icing and corrosion additives. Value is the spec minimum.",
  },
  {
    id: "jp-5", name: "JP-5 (navy)", Q_R: 42.6e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "High flash point, so it's safe to store on aircraft carriers. Value is the spec minimum.",
  },
  {
    id: "jp-4", name: "JP-4 (old wide-cut)", Q_R: 42.8e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "Older USAF kerosene-gasoline blend, replaced by JP-8. Value is the spec minimum.",
  },
  {
    id: "ts-1", name: "TS-1 (Russian)", Q_R: 43.2e6, f_stoich: 0.0682, engines: GAS_TURBINES,
    note: "The Russian/CIS standard jet fuel.",
  },
  {
    id: "jp-7", name: "JP-7 (SR-71 / X-51A)", Q_R: 43.5e6, f_stoich: 0.0682, engines: ["turbojet", "scramjet"],
    note: "Very heat-stable fuel made for the SR-71 Blackbird's J58 turbojet; later used by the X-51A scramjet. Value is the spec minimum.",
  },
  {
    id: "saf", name: "SAF (HEFA biofuel)", Q_R: 43.6e6, f_stoich: 0.0667, engines: GAS_TURBINES,
    note: "Sustainable aviation fuel made from waste oils. Roughly 1–2% more energy per kg than fossil jet fuel (approximate value).",
  },
  {
    id: "jp-10", name: "JP-10 (missile fuel)", Q_R: 43.0e6, f_stoich: 0.0704, engines: ["turbojet", "turbofan", "scramjet"],
    note: "Dense synthetic fuel (C10H16) used by cruise missiles like the Tomahawk.",
  },
  {
    id: "methane", name: "Methane / LNG", Q_R: 50.009e6, f_stoich: 0.0578, engines: GAS_TURBINES,
    note: "Liquefied natural gas. Flown experimentally in the Tupolev Tu-155.",
  },
  {
    id: "ethylene", name: "Ethylene", Q_R: 47.195e6, f_stoich: 0.0675, engines: ["scramjet"],
    note: "Common scramjet test fuel — it ignites fast, which matters when air passes the combustor in milliseconds.",
  },
  {
    id: "hydrogen", name: "Hydrogen", Q_R: 120.971e6, f_stoich: 0.0289, engines: ALL,
    note: "Nearly 3x the energy per kg of kerosene. Fuel of the X-43A scramjet and of planned zero-carbon airliners.",
  },
];

export function fuelsForEngine(engineType) {
  return FUELS.filter((f) => f.engines.includes(engineType));
}

/**
 * The fuel currently selected for this engine, or null for a custom Q_R.
 * `config.fuel_id` (set by the Fuel section) disambiguates fuels sharing
 * a Q_R, e.g. JP-4 and JP-8 at the 42.8 MJ/kg spec minimum; it only counts
 * while Q_R still matches, so a reset or a shared link (which carries Q_R
 * but not fuel_id) falls back to the first fuel with that Q_R.
 */
export function selectedFuel(engineType, config) {
  const fuels = fuelsForEngine(engineType);
  if (config.fuel_id === "custom") return null;
  const byId = fuels.find((f) => f.id === config.fuel_id);
  if (byId && byId.Q_R === config.Q_R) return byId;
  return fuels.find((f) => f.Q_R === config.Q_R) || null;
}
