# Ramjet — Formula Reference

Sources:
- **Primary**: NPTEL "Introduction to Airbreathing Propulsion" (Prof. Ashoke De,
  IIT Kanpur), Lectures 25-26, "Performance/Cycle Analysis: Ramjet"
  (`reference_extraction/nptel_ramjet_scramjet.txt`, PDF pp.258-273). Cited
  below as **NPTEL p.NNN**.
- **Secondary/validation**: V. Ganesan, *Gas Turbines*, 3rd ed. (Tata
  McGraw-Hill), §7.3 "The Ramjet Engine"
  (`reference_extraction/ganesan_ramjet_pulsejet.txt`, pp.217-220). Cited
  below as **Ganesan 3e p.NNN, §7.3**.

All descriptive text below is paraphrased in this project's own words; only
the equations are transcribed verbatim from the sources (equations are not
copyrightable expression, and precision matters for a simulator).

## 1. How it works, and how it differs from the turbojet

A ramjet has no compressor and no turbine. All of the pressure rise needed
for combustion comes from decelerating ("ramming") the incoming
high-speed air through a duct — first a supersonic diffuser section that
uses shock structures to slow supersonic flow down towards Mach ~1, then a
subsonic diffuser section that continues the deceleration/pressure-rise
down to a low subsonic Mach number suitable for stable combustion (Ganesan
gives ~M 0.2 as the practical ceiling — see §3 below). Fuel is injected
and burned at roughly constant stagnation pressure (same Brayton-cycle
idea as a turbojet, minus the mechanical compression/expansion stages),
and the hot gas is then expanded back down through a nozzle to produce
thrust from the momentum increase of the flow.

Because there is no rotating machinery, a ramjet:
- produces **zero static thrust** — it cannot start from rest and must be
  accelerated to a useful speed by an external booster (rocket, aircraft
  carry, etc.) (NPTEL p.258; Ganesan 3e p.219, §7.3.3);
- can tolerate much higher combustor temperatures than a turbojet, since
  there is no turbine blade material limit to protect (Ganesan 3e p.219-220,
  §7.3.3: ~2000°C allowable vs. ~900°C in turbojets);
- has performance that is intrinsically tied to flight Mach number (ram
  pressure ratio is a direct function of M), rather than to a
  independently-set spool speed/pressure ratio as in a turbojet.

## 2. Formulas

### 2.1 Intake / diffuser (combined supersonic + subsonic sections, treated as one module, station A = capture, B = diffuser/compressor-face exit)

Isentropic efficiency of the intake:

```
eta_I = (T0BS - TA) / (T0B - TA)
```
where `T0BS` is the stagnation temperature that would result from an
isentropic (loss-free) compression to the same exit pressure, `T0B` is the
actual exit stagnation temperature, and `TA` is the freestream static
temperature. (NPTEL p.260-261)

Since the process is adiabatic with no work exchange, stagnation
temperature does not change with intake losses:
```
T0B / TA = T0A / TA = 1 + (gamma_a - 1)/2 * Ma^2
```
(`Ma` = flight/capture Mach number, `gamma_a` = cold-air ratio of specific
heats.) (NPTEL p.260-261)

Actual stagnation pressure recovery (loss folded into the isentropic
exponent via `eta_I`):
```
p0B / pA = (1 + eta_I * (gamma_a - 1)/2 * Ma^2) ^ (gamma_a/(gamma_a - 1))
```
(NPTEL p.261) — note this is the *same style* of efficiency convention
already used as the primary convention in this project's turbojet
`intake.py` (`intake_exit_state`), not Ganesan's linear-interpolation
convention (see judgment-call note in §4).

### 2.2 Combustor (station A = inlet, B = outlet)

Pressure loss:
```
p0B = p0A - dp_b
```
Energy balance (mixed cold/hot specific heats):
```
T0B = (mdot_a * Cpc * T0A + mdot_f * eta_b * QHV) / (Cph * (mdot_a + mdot_f))
```
where `mdot_a`/`mdot_f` are air/fuel mass flow rates, `Cpc`/`Cph` are
cold-/hot-side specific heats, `eta_b` is combustion (burner) efficiency,
and `QHV` is the fuel heating value. (NPTEL p.262)

### 2.3 Nozzle (station A = inlet, B = exit), unchoked

```
eta_N = (T0A - T0B) / (T0A - TBS)

TB = T0A * [1 - eta_N * (1 - (pB/p0A)^((gamma_m - 1)/gamma_m))]

VB = sqrt(2 * Cpm * (T0A - T0B))
```
`Cpm` is the (mixed combustion-product) specific heat, `gamma_m` its
ratio of specific heats. `TBS` is the ideal (isentropic) exit static
temperature for the same pressure ratio. (NPTEL p.264)

### 2.4 Nozzle, choked (convergent nozzle, exit Mach = 1)

```
T0A / Tcr = (gamma_m + 1) / 2

eta_N = (T0A - Tcr) / (T0A - TBS)
      = [1 - 2/(gamma_m + 1)] / [1 - (pcr/p0A)^((gamma_m - 1)/gamma_m)]

p0A / pcr = 1 / [1 - (1/eta_N) * (gamma_m - 1)/(gamma_m + 1)] ^ (gamma_m/(gamma_m - 1))
```
`Tcr`, `pcr` are the critical (sonic-throat) static temperature/pressure.
(NPTEL p.264-265)

### 2.5 Complete engine — ideal cycle (stations: a = ambient/capture,
2 = diffuser exit, 4 = combustor exit, e/6 = nozzle exit; nozzle assumed
fully expanded, `pe = pa`)

No work or heat exchange in intake/nozzle, so stagnation pressure and
temperature are each constant across them:
```
p0a = p02 = p04 = p06      T0a = T02      T04 = T06
```
Static/stagnation temperature ratios:
```
T0a/Ta = 1 + (gamma_a - 1)/2 * M^2 = T02/Ta

T0e/Te = T06/T6 = 1 + (gamma6 - 1)/2 * Me^2 = T04/Te
```
Static/stagnation pressure ratios:
```
p0a/pa = (1 + (gamma_a - 1)/2 * M^2) ^ (gamma_a/(gamma_a - 1))

p06/p6 = (1 + (gamma6 - 1)/2 * Me^2) ^ (gamma6/(gamma6 - 1))
```
Since the nozzle is fully expanded and stagnation pressure is conserved
through the ideal cycle, `p06/pe = p0a/pa`, which forces:
```
Me = M
```
(inlet and exit Mach numbers are equal in the ideal cycle — but exit
*velocity* is not equal to flight velocity, since static temperature
changes). (NPTEL p.266-268)

Exit velocity (constant gamma, R through the engine):
```
ue = sqrt(Te/Ta) * u = sqrt(T04/T0a) * u = sqrt(T04/T02) * u
```
(`u` = flight speed.) (NPTEL p.267-268)

### 2.6 Fuel-air ratio (ideal cycle, energy balance)

```
mdot_a * h02 + mdot_f * QR = (mdot_a + mdot_f) * h04

f = [(Cp4*T04)/(Cp2*T0a) - 1] / [QR/(Cp2*T0a) - (Cp4*T04)/(Cp2*T0a)]
```
Simplified for constant gamma and R through the engine (single Cp):
```
f = Cp * (T04 - T0a) / (QR - Cp * T0a)
```
(NPTEL p.268)

### 2.7 Ideal thrust and TSFC

```
T = mdot_a * (1 + f) * ue - mdot_a * u

T/mdot_a = (1 + f)*ue - u

T/mdot_a = M * sqrt(gamma*R*Ta) * [(1+f) * sqrt(T04/Ta) * 1/sqrt(1 + (gamma-1)/2*M^2) - 1]

TSFC = mdot_f / T = f / (T/mdot_a)
```
(NPTEL p.268-269)

### 2.8 Real cycle — component stagnation pressure ratios

```
r_d = p02/p0a     (diffuser)
r_c = p04/p02     (combustor)
r_n = p06/p04     (nozzle)

overall pressure ratio = p06/p0a = r_d * r_c * r_n
```
(NPTEL p.270)

### 2.9 Real cycle — exit Mach number

Starting from the same static/stagnation pressure relations as the ideal
cycle but *without* assuming `p06=p0a`, and substituting the component
pressure ratios above:
```
Me^2 = 2/(gamma-1) * [(p06/p6)^((gamma-1)/gamma) - 1]

Me^2 = 2/(gamma-1) * [(1 + (gamma-1)/2*M^2) * (r_d*r_c*r_n * pa/pe)^((gamma-1)/gamma) - 1]
```
Defining
```
m = (1 + (gamma-1)/2*M^2) * (r_d*r_c*r_n * pa/pe)^((gamma-1)/gamma)
```
gives the compact form
```
Me^2 = 2/(gamma-1) * (m - 1)
```
Sanity check given in the source: if `r_d = r_c = r_n = 1` and `pe = pa`
(the lossless, fully-expanded case), `m` reduces to `1 + (gamma-1)/2*Me^2`,
i.e. `Me = M` — recovering the ideal-cycle result of §2.5. (NPTEL p.270-271)

### 2.10 Real cycle — exit velocity

Assuming negligible heat loss through the engine (`T06 = T04`):
```
T06/T6 = T04/Te = 1 + (gamma-1)/2*Me^2 = m

ue = Me * sqrt(gamma*R*Te) = sqrt(2*gamma*R*T04*(m-1) / ((gamma-1)*m))
```
(NPTEL p.271-272)

### 2.11 Real cycle — fuel-air ratio and specific thrust

```
f = (Cp4*T04 - Cp2*T0a) / (eta_b*QR - Cp4*T04)

T/mdot_a = [(1+f)*ue - u] + (Ae/mdot_a)*(pe - pa)

T/mdot_a = (1+f) * sqrt(2*gamma*R*T04*(m-1) / ((gamma-1)*m)) - M*sqrt(gamma*R*Ta)
           + (pe*Ae/mdot_a) * (1 - pa/pe)
```
(NPTEL p.271-272)

### 2.12 Ganesan's ideal-cycle Mach-matching relation (cross-check)

Ganesan's much shorter treatment (stations 1=diffuser inlet, 2=diffuser
exit, 3=combustor exit/nozzle inlet, 4=nozzle exit) gives the intake and
nozzle stagnation-pressure relations:
```
p02/p1 = (1 + (gamma-1)/2*Mi^2) ^ (gamma/(gamma-1))
p03/p4 = (1 + (gamma-1)/2*Mj^2) ^ (gamma/(gamma-1))
```
(`Mi`, `Mj` = inlet/exhaust Mach number.) Since the ideal cycle holds
stagnation pressure constant (`p02 = p03`), these force `Mi = Mj`, and
since `c = M*sqrt(gamma*R*T)`:
```
cj = ci * sqrt(T4/T1)                                    (Ganesan Eq. 7.1)
```
This is algebraically consistent with NPTEL's `Me = M` ideal-cycle result
in §2.5 (both say inlet and exit Mach numbers match in the ideal cycle) —
a useful independent confirmation of that specific relation. (Ganesan 3e
p.218-219, §7.3.1)

## 3. Typical/design-value defaults found in the source

- Ram compression from **M~3 at diffuser inlet to ~M0.3** at the
  combustion chamber can give a pressure ratio **>30**; practical designs
  achieve ram pressure ratios of about **8-10** (shock/friction losses
  take most of the theoretical rise away). (Ganesan 3e p.217, §7.3)
- Combustion-chamber entry Mach should not exceed about **0.2** for
  stable combustion (flame blow-out risk above this). (Ganesan 3e
  p.217-218, §7.3)
- Combustion temperature typically **1500-2000 K**. (Ganesan 3e p.217,
  §7.3)
- Maximum allowable cycle temperature **~2000°C**, vs. **~900°C** for a
  turbojet (no turbine to protect). (Ganesan 3e p.219-220, §7.3.3)
- Typical air-fuel ratio **~13:1** at that higher allowable temperature.
  (Ganesan 3e p.219-220, §7.3.3)
- Best efficiency / most common design range: flight Mach **2-5**
  (NPTEL says "around Mach 3" for best subsonic-to-supersonic balance);
  cruise speeds **~2400-6000 km/h**. (Ganesan 3e p.220, §7.3; NPTEL p.258)
- No numeric default is given anywhere in either source for diffuser
  efficiency `eta_I`, nozzle efficiency `eta_N`, or burner efficiency
  `eta_b` for the ramjet specifically (unlike the turbojet material,
  which gives `eta_d ~ 0.70-0.90`) — these would need to be carried over
  from the turbojet's `constants.py` defaults or sourced elsewhere if
  the simulator needs a numeric default.

## 4. Judgment calls, ambiguities, and things to resolve before coding

1. **Station-numbering inconsistency inside the NPTEL material itself.**
   The isolated-module derivations (intake, combustor, nozzle) use
   generic station labels A/B for each module. The "complete engine"
   section switches to a numbered scheme `a, 1, 2, 3, 4, 6` (with **no
   station "5"** ever defined) and then further mixes in `e` for the
   nozzle exit interchangeably with `6`. Before implementing, this
   project should pick one consistent station-numbering convention (the
   turbojet code uses `a, 2, 3, 4, 5, 9`) and explicitly map the source's
   inconsistent labels onto it.
2. **Two, seemingly unreconciled, diffuser-loss treatments.** The
   isolated intake-module derivation defines an efficiency `eta_I` used
   inside an isentropic-exponent formula for `p0B/pA` (§2.1 above). The
   "real cycle" treatment of the *complete engine* instead just defines
   `r_d = p02/p0a` as an already-known/measured stagnation-pressure
   ratio (§2.8), without showing the algebraic link back to `eta_I`. A
   judgment call is needed on whether `r_d` should be *computed from*
   `eta_I` via the §2.1 formula, or treated as an independent input
   (e.g., a typical value chosen directly) — the source does not say
   which was intended.
3. **This mirrors the turbojet README's flagged "two intake-efficiency
   conventions."** If this project's turbojet `intake.py` conventions
   are reused for consistency, note that Ganesan's ramjet section does
   *not* give a ram-efficiency (linear-interpolation) formula the way his
   turbojet Eq. 7.18/7.24 did — Ganesan's ramjet section 7.3 is far more
   qualitative and does not offer an independent numeric convention to
   cross-validate against for the ramjet intake specifically.
4. **No fully worked numerical example for the ramjet in either source.**
   Unlike the turbojet (which had Ganesan's Worked Example 7.5 for full
   external validation), Ganesan's §7.3 on ramjets contains descriptive
   text, qualitative charts (Fig. 7.3, unlabeled axes/values), and only
   one closed-form relation (Eq. 7.1, a Mach-matching identity, not a
   full numeric worked point). This is a **larger validation gap** than
   the turbojet had at the same stage — internal-consistency tests (e.g.
   ideal-cycle `Me=M` check, energy-balance closure) will be possible,
   but there is currently no external published numeric example to
   validate absolute thrust/TSFC numbers against for the ramjet. A third
   source (e.g. Mattingly's *Elements of Gas Turbine Propulsion*, which
   has full ramjet worked examples) would be needed to close this gap.
5. **`QR` vs `QHV`/`eta_b` naming inconsistency inside NPTEL itself.**
   The ideal-cycle fuel-air-ratio derivation (§2.6) uses `QR` with no
   burner efficiency term at all (i.e., 100% combustion efficiency
   assumed for the *ideal* cycle), while the combustor-module derivation
   (§2.2) and the real-cycle fuel-air ratio (§2.11) both use `eta_b*QHV`.
   This is consistent with normal ideal/real cycle framing (efficiencies
   are 1 in the ideal case) but is worth calling out since the symbol
   changes name (`QR` vs `QHV`) between sections, not just its
   efficiency multiplier.

## Verification + rebuild plan (2026-09-23)

The ramjet was built once and removed (commit dc0b229; code identical in 239399f
and dc0b229^). Re-checked that code and this file against
`reference_extraction/nptel_ramjet_scramjet.txt` (raw) and
`reference_extraction/ganesan_ramjet_pulsejet.txt`.

### The old code

- Implements a real cycle by chaining per-component relations (§2.1-2.4),
  reusing the turbojet helpers with compressor/turbine skipped; ideal cycle is
  the special case with every efficiency = 1. Checked: with losses off and an
  expanded nozzle, exit Mach = flight Mach and specific thrust matches the NPTEL
  p.269 closed form at M 1.5/2.5/3.5 — worth adding as a test.
- Every formula matches this file (intake recovery ref 67/raw 219-222, T02 = T0a
  ref 59/raw 210-212, fuel-air ratio ref 222/raw 602-604, combustor loss,
  choked-nozzle relations ref 104/109 raw 327-352, expanded-nozzle velocity,
  thrust/specific thrust/TSFC ref 224/172).
- **Blocking physics problem: convergent-only nozzle.** Above ~Mach 1.5 it always
  chokes, so V_exit sticks near 768 m/s. At 11 km, T04 = 1800 K: M2.5 gives
  eta_P 0.98 / eta_th 0.02; M3 eta_P 1.07 / eta_th -0.05; M4 eta_P 1.21 /
  eta_th -0.31; M >= 5 errors in the TSFC helper — the efficiency formulas
  ignore the pressure-thrust term. With the nozzle fully expanded to ambient
  (the ideal-cycle assumption, raw 407-409, and the same lecturer's "nozzle is
  fully expanded so that is p e is pa", nptel.txt 8647-8649), results are
  sensible: specific thrust ~640 at M2.5, TSFC lowest near M3-3.5
  (~0.21 kg/(N·h)), eta_P 0.72 at M2.5 / 0.84 at M4, eta_th 0.37 / 0.52.
- eta_th uses Q_R without eta_b, like the turbojet (performance.py); the
  scramjet includes eta_b. Not in this file — a project convention; keep it
  consistent deliberately.
- Atmosphere is 0-11 km only (same limitation as the scramjet).

### Errors in this file (the code is unaffected)

1. Line ~159, ideal-cycle simplified f: copies raw 467-469's denominator
   `QR - Cp*T0a`; the source's own general form (raw 463-465) reduces to
   `QR - Cp*T04`. Raw is an algebra slip (~3% low at M2.5); the code is correct.
2. Lines ~91/95, nozzle efficiency and exit velocity: written with exit TOTAL
   temperature T0B, verbatim raw 310-312/320. Must be exit STATIC TB — for an
   adiabatic nozzle T0B = T0A, so the velocity formula as written gives zero.
   The code uses static.
3. Raw 314-317 nozzle exit-temperature exponent reads as gamma_m/(gamma_m-1) in
   the OCR stacking; this file writes (gamma_m-1)/gamma_m, which is physically
   correct and matches the same lecture's choked form (raw 334-337) — a silent
   correction, now noted.
4. Line ~206 lossless check: "m reduces to 1+(g-1)/2*Me^2" (raw 577-578) must be
   M^2, not Me^2, for Me = M to follow.
5. Line ~320, judgment call #5: the real-cycle f uses eta_b·Q_R (raw 604 and this
   file's own line 222), not "eta_b·QHV" — same quantity, notation only.

### Judgment calls

1. Station numbering: raw 367-369 does name a station 5 ("4 to 5 or rather 4 to
   complete 6"), so "no station 5 ever defined" is inaccurate. Ganesan disagrees
   with itself (lines 16-22 use 1-5; §7.3.1 lines 80-88 use 1-4). Keep the old
   code's a, 2, 4, 9 (turbojet convention); station 2 collapses raw 1-3
   (terminal shock + fuel injection).
2. r_d: compute it. Raw 229-230 has the intake taking eta_d and M and outputting
   the pressure ratio; real-cycle r_d = p02/p0a (raw 513-517) is derived. Show it.
3. Ganesan has no ram-efficiency formula — confirmed (lines 1-243).
4. No worked numerical example in either source — confirmed; use the ideal-limit
   NPTEL p.269 match as a test instead.
5. Q_R vs QHV: same heating value (raw 254 QHV; raw 462/604 Q_R).

### Rebuild plan

- Restore `aeropropsim/ramjet.py`, `web/src/physics/ramjet.js`,
  `tests/test_ramjet.py`, both dump scripts, and the parity battery from dc0b229^.
- Fix 1: nozzle default = fully expanded to ambient (C-D); keep convergent/choked
  as an option to show the pressure-thrust penalty (Ganesan 59-65).
- Fix 2: up-front `solve_ramjet:` validation like the scramjet's — M below the
  self-start level (p04 must exceed p_a; Ganesan 66-69), T04 <= T02 (currently
  gives a silently negative f around M >= 6.3 at T04 = 1800 K), specific thrust
  <= 0 -> TSFC NaN like the scramjet. Add a ramjet branch to App's error banner.
- Fix 3: fuel UI — add "ramjet" to fuels.js engine lists, and to FuelComparison
  SOLVERS/METRICS with its own note (T04-driven, no turbine).
- Fix 4: update test_ramjet.py (station set, error messages, add the ideal-limit
  test).
- Do NOT reuse the scramjet's MIL-E-5007D middle branch as the source prints it
  (1-0.776(M-1)^1.5 goes negative above M~2.2); fixed 2026-09-23 to the published
  1-0.075(M-1)^1.35, which meets the M>5 branch at M=5.
- UI inputs: flight Mach ~0.5-6 (default 2.5-3; Ganesan 73-75 best 2-5),
  altitude 0-11 km (default 11 km); combustor T04-driven 1200-2273 K (Ganesan
  ~2000 °C max), default 1800 K, show f and φ with a rich-burning warning
  (Ganesan 223-225); eta_d 0.80 (NOT IN SOURCE), show p02/p_a and r_d; eta_N
  0.95. Stations a, 2, 4, 9 via StationTable's existing stationOrder/labels props
  (no StationTable change needed). Optional: display-only combustor-inlet Mach
  (~0.2, Ganesan 56-58) for station 2 statics, and an ideal-vs-real toggle
  (NPTEL §2.5 vs §2.8-2.11, p.272 plots).
