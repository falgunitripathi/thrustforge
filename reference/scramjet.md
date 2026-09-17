# Scramjet — Formula Reference

Source: **NPTEL** "Introduction to Airbreathing Propulsion" (Prof. Ashoke
De, IIT Kanpur), Lecture 27, "Performance/Cycle Analysis: ... Scramjet
Engines" (`reference_extraction/nptel_ramjet_scramjet.txt`, PDF
pp.275-283). Cited below as **NPTEL p.NNN**.

No scramjet material was found in the Ganesan textbook extract — his
`ganesan_ramjet_pulsejet.txt` covers only §7.3 (ramjet) and §7.4 (pulse
jet); scramjets are not discussed there at all. There is therefore **no
secondary/cross-check source** for the scramjet in the material extracted
so far.

All descriptive text below is paraphrased in this project's own words;
only the equations are transcribed verbatim from the source.

## 1. How it works, and how it differs from a ramjet/turbojet

A scramjet ("supersonic combustion ramjet") shares the ramjet's basic
layout — intake, combustor, nozzle, no rotating machinery, compression
achieved entirely by ram effect — but instead of decelerating the
incoming air down to a low subsonic Mach number before burning it (as a
ramjet does), a scramjet only partially decelerates the flow and keeps it
**supersonic all the way through the combustor**. This avoids the large
stagnation-pressure losses that would come from taking hypersonic air all
the way down to subsonic speed, but it means fuel must be injected, mixed,
and burned in a flow moving at supersonic speed — the mixture only has a
few milliseconds of residence time in the combustor, which is the central
engineering challenge of the concept. (NPTEL p.275-276)

Because the flow never truly stagnates, scramjets:
- need no rocket or turbomachinery-derived static thrust device but still
  cannot produce useful thrust from a standstill — they must be
  accelerated to roughly **Mach 5** (or boosted through Mach 2-3 by a
  turbojet/turbofan and then handed off to a ramjet or rocket) before
  they can operate at all (NPTEL p.276-277);
- are conceptually the high-speed continuation of the ramjet concept —
  a **dual-mode ramjet/scramjet** transitions from subsonic-combustion
  (ramjet) operation at lower speed to supersonic-combustion (scramjet)
  operation at higher speed, using an added "isolator" duct between the
  intake and the combustion chamber (NPTEL p.281-282).

## 2. Formulas

Stations used in the source: **1** = intake inlet (start of compression),
**2** = combustor entrance, **3** = combustor exit / nozzle entrance,
**4** = nozzle exit; **x**, **y** are auxiliary "ideal/isentropic
reference" static points used only inside the intake's and nozzle's own
efficiency definitions.

### 2.1 Intake

Isentropic efficiency:
```
eta_I = (Tx - T1) / (T2 - T1)
```
(NPTEL p.277)

Area ratio across the compression (from mass-continuity + isentropic
relations, cold-gas gamma `gamma_c`):
```
A2/A1 = (M1/M2) * [(1 + 0.5*(gamma_c-1)*M1^2) / (1 + 0.5*(gamma_c-1)*M2^2)] ^ ((gamma_c+1)/(2*(gamma_c-1)))
```
(NPTEL p.277-278)

Static temperature and pressure at the combustor entrance:
```
T2 = T1 * (1 + 0.5*(gamma_c-1)*M1^2) / (1 + 0.5*(gamma_c-1)*M2^2)

p2 = p1 * (1 + eta_I*(T2/T1 - 1)) ^ (gamma_c/(gamma_c-1))
```
(NPTEL p.278)

Inlet total-pressure recovery, modeled with the MIL-E-5007D military
specification correlation (a function of freestream Mach number `M1`
alone):
```
p02/p01 = 1                              for 0 < M1 < 1
p02/p01 = 1 - 0.776*(M1 - 1)^1.5         for 1 < M1 < 5
p02/p01 = 800 / (M1^4 + 935)             for M1 > 5
```
(NPTEL p.278)

### 2.2 Combustor

Stagnation temperature at the combustor exit (energy balance, cold-side
inflow heated by fuel):
```
T03 = [mdot_f * eta_b * QHV / (Cph*(mdot_a + mdot_f))]
      + [mdot_a * Cpc * T2 / (Cph*(mdot_a + mdot_f))] * (1 + 0.5*(gamma_c-1)*M2^2)
```
(NPTEL p.278-279)

Temperature-ratio / Mach relation across the combustor (`gamma_h` = hot
gas ratio of specific heats):
```
T03/T02 = (M3^2/M2^2) * [(1 + gamma_c*M2^2)/(1 + gamma_h*M3^2)]^2
          * [(1 + 0.5*(gamma_h-1)*M3^2) / (1 + 0.5*(gamma_c-1)*M2^2)]
```
Pressure and static temperature at the combustor exit:
```
p3 = p2 * (1 + gamma_c*M2^2) / (1 + gamma_c*M3^2)

T3 = T03 / (1 + 0.5*(gamma_h-1)*M3^2)
```
(NPTEL p.279)

### 2.3 Nozzle

Isentropic efficiency:
```
eta_N = (T3 - T4) / (T3 - Ty)
```
Exit temperature and velocity:
```
T4 = T3 - T3*eta_N*(1 - (p2/p3)^((gamma_n-1)/gamma_n))

V4 = sqrt(2 * Cph * (T03 - T4))
```
(NPTEL p.279) — **note the pressure ratio inside the `T4` formula is
transcribed exactly as given in the source, `(p2/p3)`, even though a
nozzle expansion from station 3 to station 4 would be expected to use
`(p4/p3)`; see judgment-call note in §4.

### 2.4 Performance

Thrust:
```
T = (mdot_a + mdot_f)*V4 - mdot_a*V1

T/mdot_a = (1 + f)*V4 - V1
```
TSFC:
```
TSFC = mdot_f / T = f / (T/mdot_a)
```
(NPTEL p.279-280)

Propulsive efficiency:
```
eta_P = T*V1 / delta_KE
      = [2*V1*(mdot_a + mdot_f)*V4 - 2*mdot_a*V1^2] / [mdot_a*(1+f)*V4^2 - mdot_a*V1^2]
```
which the source rewrites as
```
eta_P = [2*V1*(mdot_a+mdot_f)*V4 - 2*V1^2] / [(1+f)*V4^2 - V1^2]
```
and, for `f << 1`, simplifies to the familiar
```
eta_P = 2*V1 / (V1 + V4)
```
(NPTEL p.280)

Thermal efficiency:
```
eta_th = delta_KE / Q_added
       = [mdot_a*((1+f)*V4^2 - V1^2)] / [2*mdot_f*eta_cc*QHV]
       = [(1+f)*V4^2 - V1^2] / [2*f*eta_cc*QHV]
```
and, for `f << 1`:
```
eta_th = (V4^2 - V1^2) / (2*f*eta_cc*QHV)
```
(NPTEL p.280-281)

Overall efficiency:
```
eta_o = eta_P * eta_th
```
Specific impulse:
```
Isp = T / (mdot * g)
```
(NPTEL p.281) — the source does not specify whether `mdot` here is fuel
flow or total (air+fuel) flow; see judgment-call note in §4.

## 3. Typical/design-value defaults found in the source

- Full-scale, long-duration flight testing is stated to require flight
  speeds **above Mach 6**; only limited ground-facility testing is
  possible below that. (NPTEL p.276)
- A horizontal-takeoff scramjet needs boosting to roughly **Mach 5**
  before it can produce useful thrust, or alternatively a staged boost
  through **Mach 2-3** by turbojet/turbofan followed by a ramjet or
  rocket stage up to scramjet takeover speed. (NPTEL p.276-277)
- The one flight-tested example cited (Boeing X-51A, 2013) reached **Mach
  5.1**, launched from a B-52 and accelerated by a detachable rocket
  booster. (NPTEL p.276) — historical context, not a design parameter.
- No numeric defaults are given anywhere in the source for `eta_I`,
  `eta_N`, `eta_b`/`eta_cc`, or `QHV` specific to the scramjet — these
  would need to be carried over from elsewhere (e.g. the turbojet/ramjet
  defaults) or sourced independently if the simulator needs numbers.

## 4. Judgment calls, ambiguities, and things to resolve before coding

1. **Likely transcription error in the nozzle exit-temperature formula.**
   `T4 = T3 - T3*eta_N*(1 - (p2/p3)^((gamma_n-1)/gamma_n))` uses the
   ratio `p2/p3` (combustor-entrance to combustor-exit pressure), which
   is physically odd for a formula describing expansion through the
   *nozzle* (station 3 to station 4). The intake's own efficiency formula
   two pages earlier (§2.1, `p2 = p1*(1+eta_I*(T2/T1-1))^(gamma_c/(gamma_c-1))`)
   has a similar *shape*, and it's plausible the lecturer/transcriber
   reused that pattern's symbols by mistake instead of writing `p4/p3`.
   This should be checked against a second source (e.g. Heiser & Pratt,
   or Mattingly) before being wired into code as-is; implementing it
   literally as transcribed vs. substituting `p4/p3` will give different
   numbers, and the source gives no way to disambiguate on its own.
2. **`Isp` mass-flow ambiguity.** `Isp = T/(mdot*g)` does not say whether
   `mdot` is `mdot_f` (the standard "fuel specific impulse" definition
   used for airbreathing/rocket comparison) or `mdot_a`/`(mdot_a+mdot_f)`.
   The conventional definition for airbreathing engines uses fuel flow
   only; recommend defaulting to `mdot_f` unless a second source says
   otherwise, but flag this as an assumption, not a transcribed fact.
3. **`T02` used before it is defined.** The combustor's `T03/T02`
   temperature-ratio formula (§2.2) references `T02`, but the source
   never separately derives a stagnation temperature at station 2 — only
   the static `T2` (§2.1). The natural fill-in via the standard isentropic
   stagnation relation is `T02 = T2*(1 + 0.5*(gamma_c-1)*M2^2)`, which is
   *not* an explicit formula from the source but a standard identity used
   to make the transcript's own combustor formula usable; flagged so it's
   not mistaken for a directly-sourced equation.
4. **Two distinct, seemingly unreconciled, intake-pressure treatments.**
   Section 2.1 gives both (a) an isentropic-efficiency-based static
   pressure formula (`p2` from `eta_I` and the isentropic exponent) and
   (b) a wholly separate empirical MIL-E-5007D correlation for total
   pressure recovery `p02/p01` as a function of `M1` only. The source
   does not explain how the two combine into one consistent diffuser exit
   state (e.g., whether `eta_I` should be *derived from* the MIL-spec
   correlation, or whether the two are alternative/independent options
   the way this project's own turbojet `intake.py` documents two
   different, non-interchangeable ram-efficiency conventions). This is
   the scramjet-side analogue of that same documented turbojet situation
   and should be resolved the same way — implement both, clearly labeled,
   pick one as the default, and do not treat the two `eta`/pressure-ratio
   numbers as interchangeable.
5. **No independent validation source at all.** Unlike the turbojet
   (validated against Ganesan's Worked Example 7.5) and even the ramjet
   (at least cross-checked against Ganesan's qualitative §7.3 and one
   Mach-matching identity), there is **no secondary source in the
   extracted material for the scramjet whatsoever** — Ganesan's book does
   not cover it. Any scramjet implementation will only be checkable via
   internal-consistency tests (energy/momentum closure, `f<<1` limiting
   forms of the efficiency formulas above reducing correctly) until a
   third source with worked scramjet numbers (e.g. Heiser & Pratt,
   *Hypersonic Airbreathing Propulsion*, or Curran & Murthy's AIAA volume)
   is brought in.
6. **No thermodynamic-cycle-level (ideal vs. real) split given**, unlike
   the ramjet material, which explicitly separates an "ideal cycle" and
   a "real cycle" treatment (see `reference/ramjet.md` §2.5-2.11). The
   scramjet section goes directly to the loss-inclusive (`eta_I`,
   `eta_N`, `eta_b`) formulas above with no separate ideal-cycle baseline
   derivation; if an ideal-cycle scramjet mode is wanted for the
   simulator (e.g. for a "textbook ideal" comparison toggle, mirroring
   the ramjet), it would need to be derived by inspection (setting all
   efficiencies to 1 in the formulas above) rather than transcribed
   directly from a source-given ideal-cycle equation set.
