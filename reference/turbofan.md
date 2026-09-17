# Turbofan — Reference Extraction

Source: *Introduction to Airbreathing Propulsion*, Prof. Ashoke De, IIT
Kanpur (NPTEL). Extracted (pdftotext) from
`reference_extraction/nptel_turbofan_turboramjet.txt`. Page numbers below
are the printed page numbers visible in that extracted text (footer
numerals, e.g. "308"); lecture numbers are given where the transcript
itself prints a lecture header nearby, and left unlabeled otherwise. All
narrative explanation below is paraphrased in my own words — only the
equations themselves are transcribed verbatim from the source, per the
project's usual `Ref: §N` / `Ref: NPTEL p.NNN` citation convention (see
`aeropropsim/performance.py`, `aeropropsim/nozzle.py`).

This document does not modify or replace the existing turbojet reference
(`aeropropsim/*.py`, §0-§11) — it's new material to support a future
turbofan implementation.

## 1. How a turbofan differs from the existing turbojet

The turbojet already in this codebase pushes 100% of the intake air
through the core: compressor, combustor, turbine, nozzle. A turbofan adds
a fan at the front, driven by an extra turbine stage (or an extra spool),
and splits the incoming air into two streams downstream of the fan:

- a **core (hot) stream** that goes through the compressor(s), combustor,
  turbine(s) — exactly like the turbojet — then out a hot nozzle, and
- a **bypass (cold) stream** that skips the combustor entirely and goes
  straight from the fan to its own nozzle (or, in a mixed-flow design,
  rejoins the hot stream downstream of the turbine before a shared
  nozzle).

The fraction of air sent around the core rather than through it is the
**bypass ratio**. Because the bypass stream is accelerated only modestly
(by the fan) rather than being heated and expanded through the whole
core, a turbofan trades some of the turbojet's raw specific thrust for
much better propulsive efficiency at subsonic cruise speeds — the classic
"more thrust per unit of fuel, less thrust per unit of frontal area"
trade that makes turbofans the standard for both airliners (high bypass)
and many military engines (low bypass, often with afterburning).

The source's own classification (p.307): forward-fan vs. aft-fan;
mixed-flow vs. unmixed-flow (with short-duct/long-duct sub-variants for
unmixed); single/two/three-spool; geared vs. direct-drive; high-bypass
vs. low-bypass, the latter with or without an afterburner. This reference
covers the two-spool unmixed baseline, the two-spool mixed-flow variant
(with and without afterburner), the geared turbofan, and the three-spool
unmixed variant, in that order — matching the source's own progression.

## 2. Bypass ratio

```
BETA = BPR = mdot_cold / mdot_hot = mdot_fan / mdot_core
```
`mdot_cold` (= `mdot_fan`) is the air mass flow that bypasses the core;
`mdot_hot` (= `mdot_core`) is the air mass flow that goes through the
core. Ref: NPTEL p.307-308.

## 3. Two-spool unmixed turbofan — station-by-station cycle

Station numbering used by the source for this layout: a (freestream), 2
(fan/LPC inlet), 10 (fan exit / cold-stream stagnation state), 3 (LPC
exit), 4 (HPC exit), 5 (combustor exit / HPT inlet), 6 (HPT exit / LPT
inlet), 7 (LPT exit), 8 (jet-pipe exit / hot-nozzle inlet), 9 (hot-nozzle
exit), 11 (cold/fan-nozzle exit). Layout: fan + LPC on the low-pressure
spool, driven by the LPT; HPC on the high-pressure spool, driven by the
HPT. Ref: NPTEL p.308.

Intake analysis is identical to the turbojet's (already covered by
`aeropropsim/intake.py`, §3) and is not repeated in the source.

**Fan:**
```
p010 = p02 * pi_f
T010 = T02 * [1 + (pi_f^((gamma-1)/gamma) - 1) / eta_f]
```
`pi_f` = fan pressure ratio, `eta_f` = fan (polytropic/isentropic, as
used elsewhere for compressors) efficiency. Ref: NPTEL p.308-309.

**LPC (booster):**
```
p03 = p010 * pi_LPC
T03 = T010 * [1 + (pi_LPC^((gamma-1)/gamma) - 1) / eta_LPC]
```
Ref: NPTEL p.309.

**HPC:**
```
p04 = p03 * pi_HPC
T04 = T03 * [1 + (pi_HPC^((gamma-1)/gamma) - 1) / eta_HPC]
```
Ref: NPTEL p.309.

**Combustor** (same energy-balance form as the turbojet's, §5):
```
p05 = p04 - delta_p_cc                      (absolute form)
p05 = p04 * (1 - delta_p_cc_pct)            (percentage form)

f = [ (Cph/Cpc)*(T05/T04) - 1 ] / [ (eta_b*Q_R)/(Cpc*T04) - (Cph/Cpc)*(T05/T04) ]
```
Ref: NPTEL p.309.

**HPT** (drives the HPC only):
```
W_HPC = lambda1 * eta_m1 * W_HPT
=> mdot_a*Cpc*(T04-T03) = lambda1*mdot_a*(1+f)*eta_m1*Cph*(T05-T06)
=> T06/T05 = 1 - [Cpc/Cph * T03] / [lambda1*(1+f)*eta_m1*T05] * [(T04/T03) - 1]

p06 = p05 * (1 - (T05-T06)/(eta_HPT*T05))^(gamma_h/(gamma_h-1))
```
`eta_m1` = HPC-spool mechanical efficiency; `lambda1` = fraction of HPT
work absorbed by the HPC (source calls it a "conversion factor" without
further definition — see Ambiguities, item 1). Ref: NPTEL p.309-310.

**LPT** (drives fan + LPC together):
```
W_Fan + W_LPC = lambda2 * eta_m2 * W_LPT

beta*mdot_a*Cpc*(T010-T02) + mdot_a*Cpc*(T03-T02) = lambda2*eta_m2*[mdot_a*(1+f)*Cph*(T06-T07)]

=> (1+beta)*mdot_a*Cpc*(T010-T02) + mdot_a*Cpc*(T03-T010) = lambda2*eta_m2*[mdot_a*(1+f)*Cph*(T06-T07)]

=> T07 = T06 - Cpc/(lambda2*eta_m2*(1+f)*Cph) * [ (1+beta)*(T010-T02) + (T03-T010) ]

p07 = p06 * (1 - (T06-T07)/(eta_LPT*T06))^(gamma_h/(gamma_h-1))
```
Ref: NPTEL p.310.

**Compressor bleed variant** — if air is bled from the HPC at bleed
ratio `b = mdot_b/mdot_a`, at a bleed station with pressure `p03b`:
```
mdot_a*Cpc*(T03b-T03) + mdot_a*(1-b)*Cpc*(T04-T03b) = lambda1*eta_m1*[mdot_a*(1+f-b)*Cph*(T05-T06)]
```
and correspondingly the LPT balance becomes
```
(1+beta)*mdot_a*Cpc*(T010-T02) + mdot_a*Cpc*(T03-T010) = lambda2*eta_m2*[mdot_a*(1+f-b)*Cph*(T06-T07)]
```
i.e. the bled-off mass no longer contributes to turbine work downstream
of the bleed point. Ref: NPTEL p.310-311.

**Jet-pipe pressure loss:**
```
p08 = p07 * (1 - delta_p_jetpipe),   T08 = T07
```
Ref: NPTEL p.311-312.

**Hot nozzle** (choking check, same structural form as `nozzle.py`'s
`critical_pressure`):
```
p08/p_c = 1 / [1 - (1/eta_n1)*(gamma_h-1)/(gamma_h+1)]^(gamma_h/(gamma_h-1))
```
ideal case (`eta_n1 = 1`) reduces to
```
p08/p_c = [(gamma_h+1)/2]^(gamma_h/(gamma_h-1))
```
If `p_c > p_a`, the nozzle is choked: `p9 = p_c`, `T9 = T_c`, with
```
T08/T9 = (gamma_h+1)/2
V9 = sqrt(gamma_h * R * T9)
```
If unchoked, `p9 = p_a` and
```
V9 = sqrt( 2*Cph*eta_nt*T08 * [1 - (p_a/p08)^((gamma_h-1)/gamma_h)] )
```
The overall nozzle pressure ratio is obtained as a telescoping product of
every station pressure ratio from ambient up to the nozzle inlet:
```
p08/p_a = (p08/p07)*(p07/p06)*(p06/p05)*(p05/p04)*(p04/p03)*(p03/p010)*(p010/p02)*(p02/p0a)*(p0a/p_a)
```
Ref: NPTEL p.311-312.

**Cold (fan) nozzle** — same structure, cold-side properties:
```
p010/p_c = 1 / [1 - (1/eta_fn)*(gamma_c-1)/(gamma_c+1)]^(gamma_c/(gamma_c-1))
```
ideal (`eta_fn=1`): `p010/p_c = [(gamma_c+1)/2]^(gamma_c/(gamma_c-1))`.
Choked (`p_c > p_a`): `p11=p_c`, `T11=T_c`,
`T010/T11 = (gamma_c+1)/2`, `V11 = sqrt(gamma_c*R*T11)`.
Unchoked (`p11=p_a`):
```
V11 = sqrt( 2*Cpc*eta_fn*T010 * [1 - (p_a/p010)^((gamma_c-1)/gamma_c)] )
```
```
p010/p_a = (p010/p02)*(p02/p_a)
```
Ref: NPTEL p.312-313.

**Thrust (two streams, unmixed):**
```
T/mdot_a = (1+f)*V9 + beta*V11 - U*(1+beta) + (1/mdot_a)*[A11*(p11-p_a) + A9*(p9-p_a)]
```
equivalently
```
T/mdot_a = (1+f)*V9 + beta*(V11-U) - U + (1/mdot_a)*[A11*(p11-p_a) + A9*(p9-p_a)]
```
`U` = flight speed (called `V` elsewhere in the corpus — the source
switches notation here; both mean freestream velocity). Ref: NPTEL
p.313-314.

**Specific thrust per unit total (fan + core) airflow, and TSFC:**
```
T/mdot_at = T/(mdot_h+mdot_c) = T/(mdot_a*(1+beta))
          = (1+f)/(1+beta) * V9 + beta/(1+beta) * V11 - U
            + 1/(mdot_a*(1+beta)) * [A11*(p11-p_a) + A9*(p9-p_a)]

TSFC = mdot_f/T = f / (T/mdot_a)
```
Ref: NPTEL p.314.

## 4. Generic dual-spool efficiency formulas (pre-bypass, given just
   before the turbofan material)

Given immediately before the turbofan section, for a generic dual-spool
engine with optional afterburner (`f_ab=0` without AB):
```
T/mdot_a = [(1+f+f_ab)*V9 - V] + (A9/mdot_a)*(p9-p_a)

TSFC = (mdot_f+mdot_fab)/T = (f+f_ab) / { [(1+f+f_ab)*V9-V] + (A9/mdot_a)*(p9-p_a) }

eta_p = T*V / ( T*V + (1/2)*mdot_e*(Ve-V)^2 )

eta_th = ( T*V + (1/2)*mdot_e*(Ve-V)^2 ) / (mdot_f*Q_R)

eta_o = eta_p * eta_th
```
`mdot_e` and `Ve` are the (single-stream) exit mass flow and velocity.
Ref: NPTEL p.305-306. **This form is single-stream** — see Ambiguities
item 4 below for why it doesn't obviously extend to the two-stream
bypass case without a judgment call.

## 5. Mixed-flow turbofan (two-spool)

Here the cold (bypass) and hot (core) streams are combined upstream of a
single shared nozzle. Station numbering: a, 2, 10 (fan exit / duct
inlet), 3 (LPC exit) branches to 3' (duct exit, about to mix) and
continues 4 (HPC exit), 5 (combustor exit), 6 (HPT exit), 7 (LPT exit,
about to mix), 8 (mixed-stream state), 9 (nozzle exit). Ref: NPTEL
p.316.

**Mixing compatibility conditions** — the analysis requires equal static
pressure and equal velocity where the two streams meet:
```
p3' = p7        (equal static pressure at mixing)
V3' = V7        (equal velocity at mixing)
```
With no pressure loss in the bypass duct and no pressure loss during
mixing itself:
```
p03' = p07 = p08
```
If the fan duct has losses:
```
p03' = p010 - delta_p_fan_duct
```
The source explicitly notes no pressure drop is assumed during the
mixing process itself (separately from any duct loss upstream of it).
Ref: NPTEL p.316-317.

**LP spool energy balance** (fan + LPC driven by LPT):
```
(1+beta)*mdot_a*Cpc*(T010-T02) + mdot_a*Cpc*(T03-T010) = lambda1*eta_m1*[mdot_a*(1+f)*Cph*(T06-T07)]
```
**HP spool energy balance** (HPC driven by HPT):
```
mdot_a*Cpc*(T04-T03) = lambda2*eta_m2*[mdot_a*(1+f)*Cph*(T05-T06)]
```
Ref: NPTEL p.317.

**Mixing — first-law enthalpy balance** (hot-stream + cold-stream
enthalpy in = mixed-stream enthalpy out):
```
beta*mdot_h*Cpc*T03 + mdot_h*(1+f)*Cph*T07 = mdot_h*(1+f+beta)*Cph*T08

=> beta*Cpc*T03 + (1+f)*Cph*T07 = (1+f+beta)*Cph*T08
```
Ref: NPTEL p.317-318.

**Mass-weighted mixed-gas properties** (a refinement on using a single
Cp/R for station 8):
```
Cp8 = [ (1+f)*Cp7 + beta*Cp3 ] / (1+f+beta)
R8  = [ (1+f)*R7  + beta*R3  ] / (1+f+beta)
gamma8 = Cp8 / (Cp8 - R8)
```
Ref: NPTEL p.318.

**Mixing pressure loss** (real mixing is not lossless):
```
p08 = p07 - delta_p_mixing        or        p08 = rm * p07,   rm < 1
```
`rm` is called the mixing ratio; the source gives a typical value around
**0.98**. Ref: NPTEL p.318-319.

**Mixed-nozzle exit velocity:**
```
unchoked: V9 = sqrt( (2*gamma_c*R*T08)/(gamma_c-1) * [1 - (p_a/p08)^((gamma_c-1)/gamma_c)] )
choked:   V9 = sqrt(gamma_c*R*T9) = sqrt( 2*gamma_c*R*T08/(gamma_c+1) )
```
As transcribed, the source uses cold-side `gamma_c`/`R` here even though
station 9 is the *mixed* stream — see Ambiguities item 2; the mixed-gas
`gamma8`/`R8` derived just above is the more physically consistent
choice for implementation. Ref: NPTEL p.319.

**Thrust and TSFC (mixed, no AB):**
```
T = mdot_a * [ (1+f+beta)*V9 - (1+beta)*U ] + A9*(p9-p_a)

TSFC = mdot_f/T = f / (T/mdot_a)
```
Ref: NPTEL p.319.

## 6. Mixed-flow turbofan with afterburner

Applies to low-bypass military engines (the source's own framing: AB
gives sudden extra acceleration/maneuverability). Here the afterburner
sits **after** the mixing plane (in an unmixed turbofan the AB instead
sits directly after the turbine, before any mixing — there is no mixing
in that layout). Ref: NPTEL p.320-321.

**AB fuel-air ratio and energy balance:**
```
fab = mdot_fab / (mdot_c + mdot_h)

fab = (Cp11*T011 - Cp8*T08) / (eta_ab*Q_HV - Cp11*T011)
```
`T011` (AB exit stagnation temperature) is typically a known design input
(the material-limited maximum temperature the engine is allowed to run
at). Ref: NPTEL p.321-322.

AB pressure loss (as transcribed — see Ambiguities item 3, the source's
own station labeling here looks internally inconsistent):
```
p9A = p0a - delta_p_ab
```
Ref: NPTEL p.322.

**Post-AB nozzle exit velocity** (unchoked form given):
```
V12 = sqrt( 2*Cp11*T011 * [1 - (p_a/p08)^((gamma11-1)/gamma11)] )
```
(As transcribed the pressure ratio uses `p08` rather than the
post-afterburner total pressure `p011`; this looks like the same
station-labeling slip as above — see Ambiguities item 3.) Ref: NPTEL
p.323.

**Thrust with AB:**
```
T = mdot_e*V12 - mdot_a*V_inf

mdot_e = mdot_c + mdot_h*(1+f) + mdot_fab
```
rewritten as
```
T = {mdot_c + mdot_h*(1+f)}*(1+fab)*V12 - (mdot_c+mdot_h)*V_inf
```
(The source's intermediate line for `mdot_e` — `mdot_e = {mdot_c +
mdot_h*(1+f)} + (1+fab)` — is dimensionally inconsistent as printed
(adding a mass flow to a dimensionless factor); the two equations that
bracket it make clear the intended relation is the multiplicative one
used in the final thrust rewrite above.) Ref: NPTEL p.323.

## 7. Geared turbofan (GTF)

Concept only, paraphrased: in a conventional low-spool, the fan and LPT
are locked to the same shaft speed even though a fan is aerodynamically
best at low RPM and the rest of the low-pressure spool prefers higher
RPM. A reduction gearbox between the fan and the low-pressure shaft lets
each turn at its own best speed. The source cites this as improving fuel
burn, cutting CO2 (its example: ~3500 tons/aircraft/year) and NOx, with
the Lycoming/Honeywell ALF502R as a real example — these are
qualitative/marketing figures from the lecture, not cycle-analysis
formulas, so I list them only as context. Ref: NPTEL p.325-326.

**Gearbox efficiency** `eta_gb` enters the spool energy balance as an
extra multiplicative factor. Two configurations are given for what the
LPT actually drives:

*Fan + LPT only on the low spool* (fan states 2,3; LPT states 6,7):
```
(1+beta)*mdot_a*Cpc*(T03-T02) = eta_gb*lambda1*eta_m1*[mdot_a*(1+f-b)*Cph*(T06-T07)]
```
*Fan + LPC driven together by LPT through the gearbox:*
```
(1+beta)*mdot_a*Cpc*(T010-T02) + mdot_a*Cpc*(T03-T010) = eta_gb*lambda1*eta_m1*[mdot_a*(1+f)*Cph*(T06-T07)]
```
where `b = mdot_b/mdot_a` is the bleed ratio. Ref: NPTEL p.326.

**HP spool**, bleed taken just downstream of the HPC (before the
combustor):
```
mdot_a*Cpc*(T04-T03) = lambda2*eta_m2*[mdot_a*(1+f-b)*Cph*(T05-T06)]
```
**HP spool**, bleed taken from a station *within* the HPC (pressure
`p03b`):
```
mdot_a*Cpc*(T03b-T03) + mdot_a*Cpc*(1-b)*(T04-T03b) = lambda2*eta_m2*[mdot_a*(1+f-b)*Cph*(T05-T06)]
```
Ref: NPTEL p.326-327. (This is the same "bleed downstream of the
compressor" vs. "bleed from within the compressor" distinction already
present for the turbojet/unmixed-turbofan HPC — see Ambiguities item 1
in the existing README.)

## 8. Three-spool unmixed turbofan

Paraphrased rationale from the source: splitting fan/IP/HP compression
across three independent spools lets each run near its own optimum
speed, giving a shorter engine (fewer stages), potentially higher
efficiency, more rigidity, and lower weight — at the cost of build/
maintenance complexity. Real examples cited: Rolls-Royce RB211 and
Trent. Ref: NPTEL p.327-328.

**Spool 1 (fan + LPT):**
```
(1+beta)*mdot_a*Cpc*(T3-T2) = lambda1*eta_m1*mdot_a*(1+f-b)*Cph*(T08-T09)
```
**Spool 2 (IPC + IPT):**
```
mdot_a*Cpc*(T04-T03) = lambda2*eta_m2*mdot_a*(1+f-b)*Cph*(T07-T08)
```
**Spool 3 (HPC + HPT)**, bleed within the HPC at temperature `T04b`:
```
mdot_a*Cpc*(T04b-T04) + mdot_a*Cpc*(1-b)*(T04-T04b) = lambda3*eta_m3*mdot_a*(1+f-b)*Cph*(T06-T07)
```
The source is explicit that the exact form of these balances shifts
depending on where the bleed is actually taken from — it does not work
the full station-by-station analysis (temperatures/pressures at every
new station) for the three-spool case, saying it "would be pretty
straightforward" by extension of the two-spool procedure above. Ref:
NPTEL p.328-329.

## 9. Typical / design values found in the source

| Quantity | Typical value / range given | Ref |
|---|---|---|
| Mixing pressure ratio `rm` (mixed-flow turbofan) | ~0.98 | NPTEL p.318-319 |
| Bypass ratio, fan pressure ratio, spool/fan/duct efficiencies | **No explicit numeric values or ranges given** — only qualitative "high bypass" vs. "low bypass" categories (p.307, p.321, p.533) | NPTEL p.307, 321 |
| CO2/fuel-burn savings from GTF (marketing figures, not cycle inputs) | "1.4 to 5 million" (currency unspecified) per day industry-wide; ~3500 t CO2/aircraft/year | NPTEL p.325-326 |

This is a real gap relative to the turbojet material: `constants.py`'s
`DEFAULTS` block for the turbojet already has NOTE: "NOT IN SOURCE"
placeholders for a few numbers (combustor pressure loss, kerosene LHV,
turbine stage efficiency); a turbofan implementation will need the same
treatment for bypass ratio, fan pressure ratio, fan efficiency, and
mixing-duct pressure loss, sourced from general gas-turbine literature
rather than this transcript.

## 10. Judgment calls / ambiguities to resolve before implementation

1. **`lambda1`, `lambda2`, `lambda3` are never precisely defined.** The
   source calls them a "conversion factor" for "the percentage of the
   [turbine] which we have developed... to run that" — read in context
   they appear to be the fraction of a turbine's developed work actually
   delivered to its own compressor/fan load (as opposed to windage,
   accessory drives, etc.), similar in spirit to a power off-take
   fraction. This should be treated the same way as the existing
   README's judgment calls: implement with `lambda=1` as the sane
   default (matching how `matching.py` treats the turbojet's simple
   energy balance) unless/until a clearer definition surfaces.
2. **Mixed-nozzle exit-velocity formula uses `gamma_c`/`R` (cold-side)
   rather than the mixed-gas `gamma8`/`R8` derived two paragraphs
   earlier in the same source** (§5 above, p.319 formula vs. p.318
   `gamma8` derivation). Since the whole point of computing `Cp8`,
   `R8`, `gamma8` is to characterize the *mixed* stream, this looks like
   a transcription slip in the lecture material rather than an
   intentional simplification — recommend implementing with `gamma8`/
   `R8` and flagging the literal source formula as an alternate,
   documented convention (mirroring how `intake.py`/`nozzle.py` already
   keep two documented conventions where the source and a validation
   source disagree).
3. **Afterburner-nozzle station labels look inconsistent** in the mixed
   +AB section: `p9A = p0a - delta_p_ab` mixes what should be an
   afterburner-exit total pressure (`p011` in the block-diagram station
   list given two paragraphs earlier: "...finally it goes to nozzle
   where it enters P09 and this is T09... you get T010 V10") with the
   ambient static pressure symbol `p0a`. Likewise the V12 formula's
   pressure ratio uses `p08` (pre-mixing-loss) rather than the
   post-afterburner `p011`. Both read as OCR/transcription slips (a
   subscript `11` misread as `0a`/`08`) rather than a deliberate
   modeling choice. Recommend implementing with the physically
   consistent version: AB total-pressure loss applied to the AB-inlet
   pressure (`p011 = p08 - delta_p_ab`), and nozzle expansion computed
   from `p011`, `T011` down to `p_a`.
4. **No explicit "overall efficiency of a bypass engine" formula is
   given anywhere in this material.** The one `eta_o = eta_p*eta_th`
   triple (propulsive/thermal/overall efficiency) appears only in the
   generic *single-stream* dual-spool section (§4 above, p.305-306),
   before bypass is introduced, and is never revisited for the
   two-stream (fan + core) case even though thrust and TSFC explicitly
   get two-stream formulas. This mirrors the existing README's
   documented pattern of "two formulas that are not always the same
   thing" — for a turbofan, the standard textbook treatment (not in
   this transcript) is to compute propulsive efficiency from the
   *combined* momentum/kinetic-energy balance across both streams
   (effectively substituting the mass-flow-weighted exit
   velocities/flows into the same generic formula), and thermal
   efficiency from total fuel energy in vs. total kinetic energy gain of
   both streams combined — but that combination is a judgment call this
   codebase's implementer will have to make explicitly, the same way
   the README flags judgment calls 1/2/4 for the turbojet.
5. **Two different bleed conventions co-exist for the HPC**, exactly
   paralleling the existing README's item 1 for the turbojet: "bleed
   taken just downstream of the HPC, before the combustor" vs. "bleed
   taken from a station within the HPC." Both appear for the unmixed
   turbofan (p.310-311) and again for the geared turbofan (p.326-327).
   Recommend the same resolution approach as the existing codebase:
   implement both, pick one as default, document the choice at the call
   site.
6. **The generic dual-spool efficiency block (§4) is presented under a
   heading that literally reads "Turbojet (Contd.) Turbofan"** — it is
   unclear whether the source intends these particular formulas
   (`eta_p`, `eta_th`, `eta_o`) to apply only to the pre-bypass dual-spool
   turbojet, or as a general template meant to be revisited later for
   turbofan (which per item 4 above, it never explicitly is). Treated
   here as background/context only, not as a turbofan-specific formula.
7. **Three-spool section does not work a full station-by-station cycle**
   (pressures/temperatures at every station) — only the three spool
   energy balances are given; the rest is explicitly deferred by the
   lecturer as a straightforward extension of the two-spool case. An
   implementation will need to derive the missing per-station equations
   itself (fan/IPC/HPC pressure-ratio equations analogous to §3 above,
   just re-labeled for three spools), not lift them from this material.
