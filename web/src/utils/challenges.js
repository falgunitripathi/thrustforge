/**
 * "Try this" challenges — small goals, each checked live against the
 * solved engine, that push students to discover one idea by changing
 * inputs themselves. Every goal was checked to be reachable within the
 * form's own input limits.
 *
 * `engine` is the engine type the challenge runs on (plus `layout` for a
 * turbofan); `start` is laid over that engine's defaults when the
 * challenge is started; `check(result, config, solve)` says whether it's
 * met; `readout(result, config, solve)` is the live progress line.
 */
import { fmt, tsfcPerHour } from "./format.js";

const sp = (r) => r.performance.specific_thrust;
const tsfc = (r) => tsfcPerHour(r.performance.tsfc);

export const CHALLENGES = [
  {
    id: "hotter",
    engine: "turbojet",
    title: "Hotter is stronger",
    goal: "Get the turbojet's specific thrust above 850 N·s/kg at cruise — without lighting the afterburner.",
    hint: "Specific thrust is thrust per kg/s of air. What sets how much energy each kilogram of air can pick up in the combustor? Look at the combustor section. Then watch what happens to TSFC.",
    start: { altitude_m: 10000, mach_flight: 0.8, n_compressor_stages: 8 },
    check: (r, c) => !c.afterburner_on && sp(r) > 850,
    readout: (r, c) => `Specific thrust ${fmt(sp(r), 0)} N·s/kg${c.afterburner_on ? " — but the afterburner is on" : ""}`,
  },
  {
    id: "sipper",
    engine: "turbofan",
    layout: "unmixed",
    title: "Airliner fuel sipper",
    goal: "Get a turbofan's TSFC below 0.075 kg/(N·h) while cruising at 9 km or higher and Mach 0.75 or faster.",
    hint: "Two things cut fuel use: a more efficient core (overall pressure ratio) and moving more air more slowly (bypass ratio). Try the fan section and the HPC pressure ratio.",
    start: { altitude_m: 10000, mach_flight: 0.8 },
    check: (r, c) => c.altitude_m >= 9000 && c.mach_flight >= 0.75 && tsfc(r) < 0.075,
    readout: (r, c) => `TSFC ${fmt(tsfc(r), 4)} kg/(N·h) at ${fmt(c.altitude_m / 1000, 1)} km, Mach ${fmt(c.mach_flight, 2)}`,
  },
  {
    id: "reheat",
    engine: "turbojet",
    title: "Light it up",
    goal: "With the afterburner lit, make at least 1.6× the thrust the same engine makes with it off.",
    hint: "Turn the afterburner on in the configuration panel. It adds the most when there's lots of unburnt oxygen and cool gas leaving the turbine — so what could you change in the main combustor?",
    start: { altitude_m: 10000, mach_flight: 0.8, n_compressor_stages: 8, afterburner_on: true },
    check: (r, c, solve) => c.afterburner_on && r.performance.thrust >= 1.6 * solve({ ...c, afterburner_on: false }).performance.thrust,
    readout: (r, c, solve) => {
      if (!c.afterburner_on) return "The afterburner is off — turn it on first";
      const dry = solve({ ...c, afterburner_on: false }).performance.thrust;
      return `Thrust is ${fmt(r.performance.thrust / dry, 2)}× the unlit engine's`;
    },
  },
  {
    id: "blackbird",
    engine: "turbojet",
    title: "Blackbird speed",
    goal: "Make the single-spool turbojet produce thrust at Mach 3 or faster.",
    hint: "At Mach 3 the intake alone squeezes the air about 30 times and heats it to over 600 K. A big compressor on top of that leaves the turbine no room to work. What should happen to π_c?",
    start: { altitude_m: 11000, mach_flight: 3, n_compressor_stages: 8 },
    check: (r, c) => c.mach_flight >= 3 && sp(r) > 0,
    readout: (r, c) => `Mach ${fmt(c.mach_flight, 2)}: specific thrust ${fmt(sp(r), 0)} N·s/kg`,
  },
  {
    id: "ramjet-sweet",
    engine: "ramjet",
    title: "Find the ramjet's sweet spot",
    goal: "Get the ramjet's TSFC below 0.212 kg/(N·h).",
    hint: "A ramjet has no compressor, so flight speed is its only compression — but too fast and the air arrives too hot to add much fuel. Open 'Performance across flight Mach' for a clue, then try the combustor temperature too.",
    start: {},
    check: (r) => tsfc(r) < 0.212,
    readout: (r, c) => `TSFC ${fmt(tsfc(r), 4)} kg/(N·h) at Mach ${fmt(c.mach_flight, 2)}, T04 ${fmt(c.T04, 0)} K`,
  },
  {
    id: "hypersonic",
    engine: "scramjet",
    title: "Hypersonic push",
    goal: "Fly the scramjet at Mach 10 or faster with specific thrust above 400 N·s/kg.",
    hint: "At Mach 10 the air brings enormous momentum with it, so the scramjet has to add a lot of energy just to push forward. Which input sets how much fuel goes in? Watch for thermal choking.",
    start: { mach_flight: 10 },
    check: (r, c) => c.mach_flight >= 10 && sp(r) > 400,
    readout: (r, c) => `Mach ${fmt(c.mach_flight, 1)}: specific thrust ${fmt(sp(r), 0)} N·s/kg`,
  },
  {
    id: "blackhawk",
    engine: "turboshaft",
    title: "Power a Black Hawk",
    goal: "Deliver at least 1,400 kW of shaft power from no more than 4.5 kg/s of air — about what a GE T700 does.",
    hint: "With the airflow capped, each kilogram of air has to give more work. Two inputs set that: the compressor pressure ratio and the turbine inlet temperature.",
    start: { mdot_a: 4.5, pi_c: 8, T04: 1300 },
    check: (r, c) => c.mdot_a <= 4.5 && r.performance.Pload_W >= 1.4e6,
    readout: (r, c) => `${fmt(r.performance.Pload_W / 1e3, 0)} kW from ${fmt(c.mdot_a, 2)} kg/s of air`,
  },
];
