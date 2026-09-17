# Propfan — Formula Reference

Primary source: NPTEL "Introduction to Airbreathing Propulsion" (Prof.
Ashoke De, IIT Kanpur), Lecture 35, "Performance/Cycle Analysis: Turboshaft
and Propfan" (`reference_extraction/nptel_turboprop_turboshaft_propfan.txt`,
printed pages 359-370). This is the only extracted source covering
propfans — Ganesan's *Gas Turbines* excerpt used elsewhere in this
project only covers §7.5 (turboprop), so there is no secondary source to
cross-check propfan-specific numbers against.

Citations follow the existing convention: `Ref: NPTEL p.NNN`.

## 1. How it works, and how it differs from the plain turbojet (and from the turboprop)

A propfan (also called an unducted fan/UDF, open rotor/OR, or ultra-high-
bypass/UHB turbofan in the source) is presented as a deliberate hybrid of
the turboprop and turbofan concepts, aiming for turbofan-like propulsive
efficiency at higher flight speeds than a classic turboprop can reach
efficiently. Like a turboprop, it uses a gas-generator turbine (through a
single-stage reduction gearbox) to drive an unshielded/unducted propeller
rather than producing most of its thrust through a jet nozzle. Unlike a
classic turboprop's propeller, the propfan's rotor has many more,
shorter, highly twisted/swept blades — closer in character to a turbofan
fan stage — which is what lets it stay efficient at the higher tip Mach
numbers associated with cruise speeds beyond a conventional turboprop's
comfortable range. The source states the blade count sits between a
turboprop's propeller and a turbofan's fan, and that the design intent
is explicitly "turbofan performance with turboprop fuel economy."

Two layout families are described: tractor (puller, fan mounted forward,
either single-rotation or contra-rotating) and pusher (fan mounted aft,
always contra-rotating, driven by a free turbine, historically favored
for cabin-noise reasons since the engine sits behind the pressure
bulkhead). The most common historical arrangement combines a two-spool
gas generator with an aft-mounted gearbox driving a pusher fan that
produces the majority of the thrust; three-spool unducted layouts are
also described, and it is the three-spool layout for which the source
works through a full, explicit cycle analysis.

Relative to the turbojet already modelled in this codebase, the
additional physics needed is essentially the same class of split (some
of the turbine's energy goes to a fan rather than a jet) as the
turboprop, but the fan here is treated as an unducted compressor stage
with its own pressure ratio and isentropic efficiency (`piUDF`, `etaUDF`)
rather than folded into a single "propeller efficiency" number the way
the turboprop section does — i.e. the propfan is modelled more like an
extra, unshrouded fan/compressor stage bolted onto the back of the
engine and driven by its own free turbine, with thrust computed from
that fan's own inlet/outlet velocity change plus the leftover hot-nozzle
thrust.

## 2. Formulas

The source works through a complete three-spool propfan cycle (stations:
intake `a/2`, IPC `2->3`, HPC `3->4`, combustor `4->5`, HPT `5->6`, IPT
`6->7`, unducted fan `2->10->11->12`, free turbine `7->8`, hot nozzle
`8->9`). Up through the IPT this is the same style of multi-spool
gas-generator analysis already used for the turbojet/turboprop; the fan
and free-turbine/nozzle stages are propfan-specific and reproduced in
full below.

### 2.1 Intake and gas generator (IPC / HPC / combustor / HPT / IPT)

    a = sqrt(gamma * R * Ta)
    M = U / a

— U: flight speed, a: ambient speed of sound. Ref: NPTEL p.365.

Intermediate-pressure compressor (2 -> 3):

    p03 = p02 * piIPC
    T03 = T02 * [1 + (piIPC^((gamma_c - 1)/gamma_c) - 1) / etaIPC]

Ref: NPTEL p.365-366.

High-pressure compressor (3 -> 4):

    p04 = p03 * piHPC
    T04 = T03 * [1 + (piHPC^((gamma_c - 1)/gamma_c) - 1) / etaHPC]

Ref: NPTEL p.366.

Combustion chamber (4 -> 5):

    p05 = p04 * (1 - delta_pcc)
    f = (1 - b) * (Cpcc*T05 - Cpc*T04) / (eta_b*QR - Cpcc*T05)

— delta_pcc: combustor fractional pressure loss, eta_b: combustor
efficiency, QR: fuel heating value. Ref: NPTEL p.366.

High-pressure turbine (5 -> 6), energy balance against the HPC (the
source notes shaft/mechanical efficiency is taken as 100% here):

    Cpc*(T04 - T03) = (1 + f - b) * Cph * (T05 - T06)
    T06 = T05 - Cpc / [(1 + f - b)*Cph] * (T04 - T03)

    p06/p05 = [1 - (1/etaHPT)*(1 - T06/T05)]^(gamma_h/(gamma_h - 1))

Ref: NPTEL p.366-367.

Intermediate-pressure turbine (6 -> 7), energy balance against the IPC:

    T07 = T06 - Cpc / [(1 + f)*Cph] * (T03 - T02)

    p07/p06 = [1 - (1/etaIPT)*(1 - T07/T06)]^(gamma_h/(gamma_h - 1))

Ref: NPTEL p.367. (Note: this IPT balance uses `(1+f)` rather than the
`(1+f-b)` used one line earlier for the HPT — see judgment-call note #1.)

### 2.2 Unducted fan (UDF)

Station 10 is set equal to the intake's station 2 condition (`T010 = T02`):

    p010 = pa * (1 + (gamma_c - 1)/2 * M^2)^(gamma_c/(gamma_c - 1))
    p011 = p010 * piUDF
    T011 = T010 * [1 + (piUDF^((gamma_c - 1)/gamma_c) - 1) / etaUDF]

— piUDF, etaUDF: the unducted fan's own pressure ratio and isentropic
efficiency, treated exactly like a compressor stage. Ref: NPTEL p.367-368.

Fan exhaust temperature (full expansion back to ambient) and exit
velocity:

    T12 / T011 = (pa / p011)^((gamma_c - 1)/gamma_c)
    (ue)_UDF = sqrt(2 * Cpc * (T011 - T12))

Ref: NPTEL p.368.

### 2.3 Free turbine and hot nozzle

    T07 / T9s = (p07 / pa)^((gamma_h - 1)/gamma_h)

Free-turbine temperature drop, split by a fraction `alpha` of the ideal
drop to ambient (same alpha-split pattern as the turboprop's free
turbine):

    T07 - T08 = eta_ft * (T07 - T08s) = eta_ft * alpha * (T07 - T9s)

    p07 / p08 = (T07 / T08s)^(gamma_h/(gamma_h - 1))

Ref: NPTEL p.368-369.

Hot nozzle exit velocity and nozzle thrust:

    (ue)_n = sqrt(2 * Cph * eta_n * (T08 - T9s))
    Tn = mdot * [(1 + f) * (ue)_n - u]

Ref: NPTEL p.369. (Nozzle thrust here uses `(1+f)`, not `(1+f-b)` as
elsewhere in this same source — see judgment-call note #1.)

### 2.4 Fan power balance and total thrust

Energy balance splitting the free turbine's output between the fan and
(implicitly) any other load, via a fraction `beta`:

    beta * Cpc * (T011 - T010) = (eta_m)_UDF * (1 + f) * Cph * (T07 - T08)

— (eta_m)_UDF: mechanical efficiency between the free turbine and the
unducted fan. Solve this for `beta`. Ref: NPTEL p.369.

Fan thrust, total thrust, and fan shaft power:

    T_UDF = beta * mdot * [(ue)_UDF - u]
    T_total = T_UDF + Tn
    P_UDF = U * T_UDF

Ref: NPTEL p.369.

### 2.5 Propulsive efficiency

    eta_P = (T * U) / (T*U + 0.5*mdot*[(u_inf - u)^2 + beta*(u_UDF - u)^2])

— this is a Froude-type propulsive-efficiency definition extended to
cover two separate exhaust streams (hot-nozzle jet and fan-driven flow),
analogous to the turbofan bypass-stream propulsive efficiency formula.
Ref: NPTEL p.370. (Symbol `T` here is presumably `T_total` from §2.4 —
see judgment-call note #2.)

## 3. Typical/design values

- Single-rotation propfan propulsive efficiency: ~80%; contra-rotating
  propfan propulsive efficiency: up to ~90% ("propeller fan engines have
  the best known propulsion efficiency"). Ref: NPTEL p.363.
- Effective bypass ratio: ~25 (same order as the turboprop's equivalent
  bypass-ratio framing). Ref: NPTEL p.363-364.
- Blade tip speed: supersonic (stated qualitatively, no numeric Mach
  value given for tip speed itself). Ref: NPTEL p.363-364.
- Design/cruise Mach number: the source gives a garbled figure
  ("0.7687" as extracted — see judgment-call note #3); read in context
  as roughly Mach 0.7-0.8, i.e. above a classic turboprop's efficient
  range and approaching turbofan cruise speeds. Ref: NPTEL p.363-364.
- Typical cruising altitude: ~11,000 (units not given in the extracted
  text, presumably meters, i.e. ~36,000 ft, a normal high-subsonic
  cruise altitude — see judgment-call note #3). Ref: NPTEL p.363-364.
- Contra-rotating tractor example blade counts: forward rotor 8 blades,
  rear rotor 6 blades (specific historical example, not a general design
  rule). Ref: NPTEL p.362.
- Technology-improvement rate context (not propfan-specific physics, but
  given as a benchmark): conventional turbofans were noted as improving
  roughly 1%/year on average, i.e. ~11% more efficient over a decade —
  cited by the source as one of the competing-technology pressures
  propfans face. Ref: NPTEL p.364.

## 4. Judgment calls / ambiguities to resolve before implementation

1. **Inconsistent `(1+f-b)` vs. `(1+f)` mass-flow-ratio factor across
   the propfan cycle.** The HPT balance uses `(1+f-b)`, the IPT balance
   and the fan energy balance both use `(1+f)` (dropping the bleed
   term), and the nozzle-thrust formula also uses `(1+f)`. This is
   either an intentional simplification once past the HPT (e.g. treating
   bleed as fully extracted upstream of the IPT) or, more likely given
   how consistently `(1+f-b)` is used everywhere else in this same
   lecture series (turboprop, turboshaft), an inconsistent transcription.
   Recommend using `(1+f-b)` uniformly for implementation, consistent
   with the rest of this project's turbojet/turboprop/turboshaft
   treatment, and flagging the source's own inconsistency in code
   comments rather than silently picking one without a note.
2. **Propulsive-efficiency formula's `T` is ambiguous.** §2.5's `eta_P`
   formula uses bare `T`, immediately after `T_total` was defined in the
   preceding paragraph — almost certainly intended to be `T_total`, but
   written unqualified. Also, `u_UDF` in the denominator (fan-side
   "relative velocity" term) is not the same symbol as `(ue)_UDF` (fan
   exit velocity) defined earlier — these may be the same quantity under
   two spellings, or `u_UDF` may specifically mean the fan's mean
   effective jet velocity as used in a Froude-efficiency term (which
   conventionally uses (exit velocity + freestream)/2 rather than exit
   velocity alone). Recommend implementing with `T_total` and treating
   `u_UDF` as equal to `(ue)_UDF` unless/until a clearer source is found,
   with both substitutions flagged in code.
3. **Numeric OCR garbling for Mach number and altitude units.** The
   design Mach number is extracted as the implausible five-significant-
   figure value "0.7687" directly following text that reads more like a
   qualitative comparison table row (number of blades, diameter, power,
   etc.) than a precise design point — likely a genuine number mangled
   by column-alignment loss in the PDF-to-text extraction (a comparison
   table's columns collapsing into a single text line). Similarly,
   "cruising altitude is 11,000" has no units attached in the extracted
   text. Neither number should be trusted precisely; treat both as
   rough qualitative context (typical high-subsonic cruise Mach and
   altitude) rather than exact source-verified design constants, and do
   not hard-code them as authoritative defaults the way, e.g., the
   turbojet's sourced constants are.
4. **No explicit combined single formula for total thrust in terms of
   the alpha-split**, unlike the turboprop section. The propfan's `alpha`
   (free-turbine split fraction) appears in the free-turbine temperature-
   drop equation (§2.3) but there is no propfan-specific "alpha_opt for
   maximum thrust" derivation analogous to the turboprop's — the source
   moves straight to the beta-based fan/turbine energy balance instead.
   This suggests alpha here is fixed by hardware/design choice rather
   than solved for as a free optimization variable at each operating
   point, which is a different modelling posture from the turboprop's
   free-turbine treatment — worth deciding explicitly before
   implementation (i.e. is alpha a solver input/design parameter for
   propfan, unlike the turboprop where it's optimized).
5. **Fan modelled as an unducted compressor stage, not a "propeller
   efficiency."** Unlike the turboprop's `eta_Pr` (a single lumped
   propeller efficiency multiplying shaft power), the propfan section
   never introduces a propeller-efficiency-style term for the fan itself
   — fan thrust here falls out purely from the fan's own pressure ratio/
   temperature rise and exit velocity (§2.2, §2.4), with `eta_P` (§2.5)
   as an overall propulsive efficiency computed after the fact, not a
   per-component efficiency fed into the thrust calculation. This is
   worth calling out explicitly since it means a propfan implementation
   cannot simply reuse the turboprop's `eta_Pr`-based thrust formula —
   it needs the fan treated as its own turbomachinery stage with its own
   pressure ratio/efficiency inputs.
