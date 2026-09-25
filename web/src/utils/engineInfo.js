/**
 * One short "what is this engine?" card per engine tab: what it is, where
 * it's used (real, well-documented examples only) and its speed range.
 * `tagline` is the one-liner shown when hovering the engine's tab.
 */
export const ENGINE_INFO = {
  turbojet: {
    icon: "✈️",
    name: "Turbojet",
    tagline: "The original jet engine: all the air goes through the core.",
    what: "Every bit of air it swallows is compressed, burned with fuel, run through a turbine (which powers the compressor) and blasted out of the nozzle as a fast, hot jet. Simple and powerful, but thirsty at low speed.",
    usedIn: [
      "Rolls-Royce/Snecma Olympus 593 — Concorde",
      "General Electric J79 — F-4 Phantom II",
      "Pratt & Whitney J57 — early Boeing 707, B-52",
    ],
    speed: "Best from about Mach 0.8 up to 3",
  },
  turboprop: {
    icon: "🛩️",
    name: "Turboprop",
    tagline: "A gas turbine that spins a propeller through a gearbox.",
    what: "Most of the turbine's work goes down a shaft, through a reduction gearbox, to a propeller that moves a big mass of air slowly. That is very fuel-efficient at low speed; a small leftover jet adds a little thrust.",
    usedIn: [
      "Allison T56 — Lockheed C-130 Hercules",
      "Pratt & Whitney Canada PW100 — ATR 72, Dash 8",
      "Europrop TP400 — Airbus A400M",
    ],
    speed: "About Mach 0.3 to 0.7 (propeller tips go supersonic above that)",
  },
  turboshaft: {
    icon: "🚁",
    name: "Turboshaft",
    tagline: "All the useful output is shaft power, not thrust.",
    what: "A free power turbine extracts almost all the gas energy as shaft power to drive a rotor, a gearbox, a pump or a generator. The exhaust is left slow on purpose; its thrust is negligible.",
    usedIn: [
      "General Electric T700 — UH-60 Black Hawk, AH-64 Apache",
      "Honeywell AGT1500 — M1 Abrams tank",
      "LM2500 (from the CF6) — warships and power stations",
    ],
    speed: "Helicopters, tanks, ships and power plants — slow or stationary",
  },
  turbofan: {
    icon: "🛫",
    name: "Turbofan",
    tagline: "A turbojet core plus a big fan that bypasses most of the air.",
    what: "A large fan pushes extra air around the core (the bypass stream). Moving more air more slowly gives the same thrust for far less fuel — which is why every modern airliner uses one. Low-bypass versions with afterburners power fighters.",
    usedIn: [
      "CFM International CFM56 — Airbus A320, Boeing 737",
      "General Electric GE90 — Boeing 777",
      "Pratt & Whitney F100 (low bypass) — F-15, F-16",
    ],
    speed: "Airliners cruise near Mach 0.8; fighter versions reach about Mach 2",
  },
  propfan: {
    icon: "🌀",
    name: "Propfan (open rotor)",
    tagline: "Big unducted fan blades: between a turboprop and a turbofan.",
    what: "Swept, many-bladed open rotors (often two, spinning in opposite directions) with no duct around them. They promise turboprop-like fuel economy at near-jet speeds, at the cost of noise — so they have mostly flown as test engines.",
    usedIn: [
      "Progress D-27 — Antonov An-70",
      "General Electric GE36 UDF — flight-tested in the 1980s",
      "CFM RISE open-rotor programme — in development",
    ],
    speed: "Designed for about Mach 0.7 to 0.8",
  },
  turboramjet: {
    icon: "🚀",
    name: "Turboramjet",
    tagline: "A turbojet for take-off, a ramjet for very high speed.",
    what: "A combined-cycle engine: below the switch Mach it runs as a turbojet (it can take off on its own), above it the intake air bypasses the turbomachinery and the engine works as a ramjet, which is far better at Mach 3 and beyond.",
    usedIn: [
      "Pratt & Whitney J58 — SR-71 Blackbird (often described as a turboramjet)",
      "Lockheed Martin SR-72 — planned hypersonic aircraft",
    ],
    speed: "From standstill to about Mach 4",
  },
  ramjet: {
    icon: "🎯",
    name: "Ramjet",
    tagline: "No compressor, no turbine: speed alone squeezes the air.",
    what: "The intake slows the incoming supersonic air, which compresses it; fuel burns in the slow air and the nozzle turns it into a jet. With no moving parts it can't start from rest, so a rocket or aircraft must boost it to speed first.",
    usedIn: [
      "BrahMos — supersonic cruise missile (liquid-fuel ramjet)",
      "Bristol Thor — Bloodhound surface-to-air missile",
      "Marquardt RJ43 — Lockheed D-21 reconnaissance drone",
    ],
    speed: "Works from about Mach 1.5, best around Mach 2 to 5",
  },
  scramjet: {
    icon: "☄️",
    name: "Scramjet",
    tagline: "A ramjet whose combustor flow stays supersonic.",
    what: "At hypersonic speed, slowing the air all the way to subsonic would heat it too much, so a scramjet (supersonic-combustion ramjet) burns its fuel in air that is still moving faster than sound — in the few milliseconds it spends in the combustor.",
    usedIn: [
      "NASA X-43A — Mach 9.6 in 2004",
      "Boeing X-51A Waverider — Mach 5.1",
      "DRDO HSTDV (India) — Mach 6 flight in 2020",
    ],
    speed: "About Mach 5 and above",
  },
};
