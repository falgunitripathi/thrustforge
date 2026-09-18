# Turboshaft — Formula Reference

Primary source: NPTEL "Introduction to Airbreathing Propulsion" (Prof.
Ashoke De, IIT Kanpur), Lecture 35, "Performance/Cycle Analysis: Turboshaft
and Propfan" (`reference_extraction/nptel_turboprop_turboshaft_propfan.txt`,
printed pages 356-359). No turboshaft-specific material was found in the
Ganesan secondary source used for the turbojet/turboprop cross-checks
(`reference_extraction/ganesan_turboprop.txt` covers only §7.5, the
turboprop); there is currently no independent secondary source for this
engine type in the extracted material.

Citations follow the existing convention: `Ref: NPTEL p.NNN`.

## 1. How it works, and how it differs from the plain turbojet

A turboshaft is a gas turbine optimized to deliver shaft power, with
essentially none of the turbine's output enthalpy drop left over for jet
thrust — this is its core distinction from both the turbojet already
modelled here and the turboprop, which deliberately keeps a residual
nozzle thrust term. The source structures a turboshaft as two sections:
a gas generator (compressor, combustor, and enough turbine to drive that
compressor) and a power section (an additional — usually free — turbine,
plus a gear-reduction system, feeding an output shaft). That output shaft
drives an external load — the source's example is a helicopter rotor,
but the same structure applies to any shaft-power application (APUs,
marine/industrial gas turbines, etc.).

Because there is no meaningful thrust output, turboshaft performance is
reported in shaft power delivered to the load (and specific fuel
consumption referenced to that power) rather than in thrust/TSFC terms.
The cycle math up through the gas generator (intake, compressor,
combustor, gas-generator turbine) is identical in form to what this
project already implements for the turbojet; the only new pieces are (a)
the load-shaft power balance, replacing the nozzle/thrust calculation
entirely, and (b) mechanical losses between the free turbine and the
actual load (e.g. rotor friction).

The source covers both single-spool (one turbine drives compressor and
load together) and twin-spool (separate gas-generator turbine and free
power turbine, the free turbine driving the load exclusively) turboshaft
layouts.

## 2. Formulas

### 2.1 Single-spool turboshaft

Shaft power available past the compressor's own draw (turbine drives both
compressor and load, full expansion assumed in the turbine):

    Wshaft = (1 + f - b) * eta_mt * Wt - Wc / eta_mc

— Wt: turbine specific work, Wc: compressor specific work, f: fuel-air
ratio, b: bleed ratio, eta_mt: turbine mechanical efficiency, eta_mc:
compressor mechanical efficiency. Ref: NPTEL p.358.

**`Wt` itself is not spelled out as its own formula in this lecture** —
the source only says "assuming full expansion in the turbine" (p.358)
before writing `Wshaft` directly in terms of it. Cross-referencing
against this project's own turboprop implementation (aeropropsim/
turboprop.py), a single-spool turboshaft is exactly the turboprop's
single-spool alpha-split model with **alpha = 1.0** (ALL of the ideal
enthalpy drop from p04 to ambient goes to the shaft; none held back for
a nozzle, since a turboshaft has no separate jet thrust at all):

    Wt_ideal = Cp_h * T04 * [1 - (pa/p04)^((gamma_h-1)/gamma_h)]
    Wt       = eta_t * Wt_ideal

This is an inference from this project's own prior work, not a
literally-transcribed source formula — flag it as such in code (same
spirit as this project's other documented, reasoned extrapolations, e.g.
the turbojet's `matching.py` judgment calls). Implementation implication
for tomorrow: `solve_turboshaft` (single-spool) can reuse almost all of
`solve_turboprop`'s structure directly, just with alpha hardcoded to 1.0,
no propeller/gearbox/nozzle-thrust terms, and `Wload = eta_m * Wshaft`
(§2.1 below) replacing the propeller-thrust step entirely.

Power delivered to the load, after mechanical losses in the connecting
shaft/drivetrain (e.g. rotor friction losses cited by the source):

    Wload = eta_m * Wshaft

    Pload = mdot_a * Wload

— eta_m: mechanical efficiency of the load-drive path, mdot_a: inducted
air mass flow rate. Ref: NPTEL p.358.

### 2.2 Twin-spool turboshaft (separate free/power turbine)

Gas-generator turbine sized to exactly balance the compressor (same
pattern as the turboprop's twin-spool gas generator):

    (1 + f - b) * eta_mt * Wt = Wc / eta_mc

giving the gas-generator turbine exit temperature:

    T05 = T04 - Cpc*(T03 - T02) / [Cpt * eta_mt * eta_mc * (1 + f - b)]

and pressure:

    p05 = p04 * [1 - (T04 - T05)/(eta_t * T04)]^(gamma_t/(gamma_t - 1))

Ref: NPTEL p.358-359. (Identical in form to the turboprop's twin-spool
gas-generator relations — same closed-form-T05 caution applies, see
judgment-call note #1 in `turboprop.md`.)

Power delivered to the load, assuming the free/power turbine expands
fully to ambient pressure:

    Pload = mdot_a * (1 + f - b) * eta_mc * Cpt * T05 * [1 - (pa/p05)^((gamma_t - 1)/gamma_t)]

— pa: ambient static pressure, gamma_t: hot-side ratio of specific heats.
Ref: NPTEL p.359. (The `eta_mc`, compressor mechanical efficiency,
appearing as a multiplier on load power delivered by a *separate* free
turbine is physically suspicious — see judgment-call note #2 below.)

## 3. Typical/design values

No turboshaft-specific numeric defaults (efficiencies, typical
power-to-weight, etc.) are given anywhere in the extracted transcript —
the lecture states the governing equations and moves on to worked
examples for other engine types. The only usable numbers are the general
component efficiencies already established for the shared gas-generator
components (compressor/turbine isentropic and mechanical efficiencies),
which this project already carries as defaults for the turbojet core in
`constants.py`; nothing turboshaft-specific supersedes those in this
source. Manufacturers named as real-world examples (for context, not
performance data): Pratt & Whitney PT6/PT6A, GE T700/CT7, plus Allison,
Lycoming, and Rolls-Royce. Ref: NPTEL p.357.

## 4. Judgment calls / ambiguities to resolve before implementation

1. **No independent secondary source available.** Unlike the turboprop
   (cross-checked against Ganesan §7.5) and the turbojet (cross-checked
   against Ganesan's Worked Example 7.5), there is no turboshaft-specific
   worked example or alternate textbook derivation in the currently
   extracted material. Before trusting absolute turboshaft numbers the
   same way the README's "Validation status" section describes for the
   turbojet, a second source (e.g. Saravanamuttoo/Rogers/Cohen's *Gas
   Turbine Theory*, which has a dedicated turboshaft/helicopter chapter)
   would be worth extracting, the same way one more turbojet source is
   already flagged as a nice-to-have in this repo's README.
2. **`eta_mc` in the twin-spool `Pload` formula looks like a
   transcription error.** The load power formula multiplies by `eta_mc`
   (compressor mechanical efficiency) rather than a free-turbine/output-
   shaft mechanical efficiency (e.g. `eta_mft` or a generic `eta_m` as
   used in the single-spool case just above it). Physically, power
   delivered by a *free* turbine to an external load should not be
   gated by the *gas generator's compressor* mechanical efficiency —
   those are two independent shafts by construction in a twin-spool
   turboshaft. Recommend treating this as a likely OCR/transcription
   substitution (`eta_mc` for `eta_mft` or `eta_m`) and implementing with
   a free-turbine/output-shaft mechanical efficiency term instead,
   flagged clearly in code as a deviation from the literal transcript
   pending a second source to confirm.
3. **"Load" is left generic.** The source's only concrete example of a
   load is a helicopter rotor (with friction losses folded into
   `eta_m`), but a turboshaft can drive a generator, propeller (in some
   classification schemes overlapping with turboprop), gearbox, or
   marine propulsor. The formulas above are written generically in terms
   of `Wload`/`Pload`; no additional load-specific formula (e.g. rotor
   thrust/torque conversion) is present in the extracted transcript, so
   modelling any specific downstream load (rotor RPM, torque, disc
   loading) is out of scope for this source and would need aviation/
   helicopter-specific references if wanted later.
4. **No thrust or SFC-vs-thrust concept applies.** Unlike the turboprop's
   ESHP/ESFC bridge between shaft power and an equivalent thrust-like
   number, the source gives no turboshaft-specific "equivalent" metric —
   performance is simply `Pload` and (implicitly) `mdot_f / Pload` as a
   power-specific fuel consumption, by direct analogy to the turboprop's
   ESFC, but this exact form is not spelled out for turboshaft in the
   extracted text. Recommend defining `SFC_shaft = mdot_f / Pload` by
   analogy (documented as an inferred, not directly sourced, definition)
   rather than inventing units/constants not present in the source.
