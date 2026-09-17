# Turboprop — Formula Reference

Primary source: NPTEL "Introduction to Airbreathing Propulsion" (Prof. Ashoke
De, IIT Kanpur), Lecture 34, "Performance/Cycle Analysis: Turboprop"
(`reference_extraction/nptel_turboprop_turboshaft_propfan.txt`, printed
pages 345-356). Secondary/cross-check source: V. Ganesan, *Gas Turbines*,
3rd ed., §7.5 "The Turboprop Engine" (`reference_extraction/ganesan_turboprop.txt`,
printed pp.224-227) — the same secondary textbook already used to validate
the turbojet core (see this repo's README, "Validation status").

Citations below follow this codebase's existing convention (see
`aeropropsim/performance.py` docstrings): `Ref: NPTEL p.NNN` or
`Ref: Ganesan 3e p.NNN, §7.5`.

## 1. How it works, and how it differs from the plain turbojet

A turboprop is built from the same gas-generator core as the turbojet
already modelled here (intake -> compressor -> combustor -> turbine), but
the turbine is sized to extract far more energy than a turbojet's turbine
does. Most of that extra turbine work does not go into accelerating the
exhaust jet — it goes into a shaft that (through a reduction gearbox,
since the gas-turbine shaft spins far faster than a propeller can
efficiently use) drives a propeller. The propeller does most of the
propulsive work; only a small leftover expansion is left for the exhaust
nozzle to turn into direct jet thrust. Both NPTEL and Ganesan describe the
same split: on the order of 80-90% of the available turbine-and-nozzle
enthalpy drop is consumed by the turbine (shaft power), leaving roughly
10-20% for the nozzle, and that fraction shifts toward the nozzle as
flight speed increases.

Architecturally, the source describes single-spool (one turbine drives
both compressor and propeller), twin-spool (a gas-generator spool plus a
separate free/power turbine dedicated to the propeller), and three-spool
turboprop layouts; this reference captures the single-spool and twin-spool
(free-turbine) cycle formulas, since that is what the source works
through in full.

Compared to the turbojet already in this codebase, the key new physics to
model is: (a) splitting the turbine's ideal enthalpy drop between
"shaft/propeller" and "nozzle" fractions via a split parameter (called
`alpha` below), (b) converting shaft power into propeller thrust through
propeller and gearbox efficiencies, (c) adding that propeller thrust to
the residual nozzle thrust, and (d) reporting performance in equivalent
shaft-power terms (ESHP/TESHP) and an equivalent SFC, rather than pure
thrust and TSFC.

## 2. Formulas

### 2.1 Common setup

Flight speed:

    U = Ma * sqrt(gamma * R * Ta)

— Ma: flight Mach number, gamma/R: gas properties, Ta: ambient static
temperature. Ref: NPTEL p.346.

Intake and compressor stagnation states (T02/p02, T03/p03) follow the same
isentropic-efficiency relations already implemented for the turbojet
(`intake.py`, `compressor.py`); the source explicitly says this part is
unchanged. Ref: NPTEL p.346.

Compressor specific work:

    delta_hc = Cpc * (T03 - T02)

— Cpc: cold-side specific heat, T02/T03: compressor inlet/outlet
stagnation temperature. Ref: NPTEL p.346.

### 2.2 Single-spool turboprop — turbine/nozzle power split

The turbine's total ideal (isentropic) enthalpy drop, `delta_h`, is split
into a shaft/propeller fraction `alpha` and a nozzle fraction `(1 - alpha)`:

    delta_h = Cpt * T04 * [1 - (pa / p04)^((gamma_h - 1)/gamma_h)]

    alpha * delta_h        = delta_h_ts   (ideal turbine share)
    (1 - alpha) * delta_h  = delta_h_ns   (ideal nozzle share)

— Cpt: turbine-side specific heat, T04/p04: turbine inlet stagnation
state, pa: ambient static pressure, gamma_h: hot-side ratio of specific
heats (the source states gamma_t = gamma_h = gamma_n, i.e. one hot-gas
gamma is used throughout turbine + nozzle). `eta_t` is turbine isentropic
efficiency and `eta_N` is nozzle isentropic efficiency. Ref: NPTEL
p.347-348.

Nozzle exit velocity (from the nozzle's actual share of the drop):

    ue = sqrt(2 * eta_N * (1 - alpha) * delta_h)

Ref: NPTEL p.348.

Actual turbine specific work (from the turbine's actual share):

    delta_ht = eta_t * alpha * delta_h

Ref: NPTEL p.349.

Shaft power delivered past the compressor's own draw:

    Wshaft = eta_mt * (1 + f - b) * delta_ht - delta_hc / eta_mc

— eta_mt: turbine mechanical efficiency, eta_mc: compressor mechanical
efficiency, f = mdot_f/mdot_a (fuel-air ratio), b = mdot_b/mdot_a (bleed
ratio, i.e. bled mass flow over inducted air mass flow). Ref: NPTEL
p.349.

Propeller thrust:

    Tpr = mdot_a * eta_Pr * eta_g * Wshaft / U

expandable, substituting Wshaft, into:

    Tpr = (mdot_a * eta_Pr * eta_g / U) * [(1 + f - b) * eta_mt * eta_t * alpha * delta_h - delta_hc/eta_mc]

— eta_Pr: propeller efficiency, eta_g: gearbox (reduction-gear)
efficiency. Ref: NPTEL p.349.

Nozzle thrust:

    Tn = [(1 + f - b) * ue - u]

Total thrust:

    Ttotal = Tpr + Tn

Ref: NPTEL p.349. (See judgment-call note #1 below — the nozzle-thrust
line as transcribed omits the mass-flow factor that every other
nozzle-thrust formula in this source carries.)

Optimum split for maximum total thrust (found by setting
d(Ttotal)/d(alpha) = 0, at fixed U and delta_h):

    alpha_opt = 1 - [U^2 / (2 * delta_h)] * [eta_N / (eta_Pr^2 * eta_g^2 * eta_mt^2 * eta_t^2)]

and the corresponding optimal nozzle exit velocity:

    ue(at alpha_opt) = U * eta_N / (eta_Pr * eta_g * eta_mt * eta_t)

Ref: NPTEL p.349-350.

### 2.3 Twin-spool (free-turbine) turboprop

Gas-generator energy balance (turbine drives only the compressor here):

    eta_mt * delta_ht = delta_hc / eta_mc
    delta_ht = Cpt * (T04 - T05) * (1 + f - b)

Solving for the gas-generator turbine exit temperature:

    T05 = T04 - Cpc*(T03 - T02) / [Cpt * eta_mt * eta_mc * (1 + f - b)]

and the corresponding pressure:

    p05 = p04 * [1 - (T04 - T05)/(eta_t * T04)]^(gamma_t/(gamma_t - 1))

Ref: NPTEL p.350. (This is structurally the same "T05 closed form"
pattern already flagged as judgment call #2 for the turbojet's
`matching.py` in this repo's README — see judgment-call note #2 below.)

Free (power) turbine specific work:

    delta_ht(free) = Cp_ft * (1 + f - b) * (T05 - T06)

— Cp_ft: specific heat across the free turbine. Ref: NPTEL p.350-351.

Free-turbine ideal enthalpy drop (full expansion assumed to ambient,
p7 = pa):

    delta_h = Cpt * T05 * [1 - (p7/p05)^((gamma_t - 1)/gamma_t)]

split the same way as the single-spool case:

    alpha * delta_h = delta_h_fts   (ideal free-turbine share)

with actual free-turbine work:

    delta_ht_actual = eta_ft * delta_h_fts

— eta_ft: free (power) turbine isentropic efficiency. Ref: NPTEL p.351.

Propeller thrust (twin-spool):

    Tpr = (mdot_a * eta_pr * eta_g / U) * [(1 + f - b) * eta_mft * eta_ft * alpha * delta_h]

— eta_mft: free-turbine mechanical efficiency. Ref: NPTEL p.352.

Nozzle thrust:

    Tn = mdot_a * [(1 + f - b) * Ue - U]

Total thrust:

    T = Tpr + Tn

and, per unit mass flow:

    T/mdot_a / U = (eta_pr*eta_g/U) * [(1+f-b)*eta_mft*eta_ft*alpha*delta_h] + [(1+f-b) * sqrt(2*(1-alpha)*eta_n*delta_h) * Ue - U]

(the second bracketed term as transcribed is dimensionally odd — see
judgment-call note #3). Ref: NPTEL p.352.

Optimum split for max thrust:

    alpha_opt = 1 - [U^2 / (2 * delta_h)] * [eta_N / (eta_Pr^2 * eta_g^2 * eta_mft^2 * eta_ft^2)]

    ue(at alpha_opt) = U * eta_N / (eta_Pr * eta_g * eta_mft * eta_ft)

Ref: NPTEL p.353.

### 2.4 Equivalent power definitions

Static/ground-test condition — total equivalent horsepower, "t.e.h.s.",
during take-off/bench testing:

    (t.e.h.s.)_takeoff = shp + jet_thrust(lb) / 2.6

    TEP(kW)_takeoff = sp(kW) + jet_thrust(N) / 28.5

with static thrust:

    T = mdot_a * (1 + f - b) * Ue

— shp/sp: shaft horsepower (imperial/SI), jet_thrust: the residual
nozzle thrust measured on the test stand. The 2.6 (lb thrust per shp) and
28.5 (N thrust per kW) figures are empirical unit-conversion constants
tied to a nominal propeller efficiency at zero forward speed, not
fundamental physics — see judgment-call note #4. Ref: NPTEL p.353-354.

In-flight equivalent shaft horsepower:

    e.s.h.p = s.h.p + T*U / (constant * eta_Pr)

with in-flight (non-static) thrust:

    T = mdot_a * [(1 + f - b)*Ue - U]

— `constant` depends on the unit system in use (e.g. differs for knots
vs. mph inputs; not given numerically in the source). Ref: NPTEL p.354.

### 2.5 Fuel consumption

General TSFC definition (same form as the turbojet):

    TSFC = mdot_f / T

Ref: NPTEL p.354.

Turboprop-specific "equivalent specific fuel consumption" (ESFC), defined
against equivalent shaft horsepower rather than thrust:

    ESFC = mdot_f / e.s.h.p   (typical value ~0.27236 kg fuel per kW-hr)

Ref: NPTEL p.354. (Unit phrasing in the source is garbled — see
judgment-call note #5.)

### 2.6 Turbofan-analogy thrust decomposition

The source draws an explicit analogy between a turboprop and a
high-bypass-ratio turbofan, treating the propeller as an unducted fan
with an effective bypass ratio >= 25:

    T = mdot_o * [u1 - u0] + mdot_a * [(1 + f - b)*ue - u]

— mdot_o: mass flow through the propeller ("bypass" stream), mdot_a:
mass flow through the engine core, u1/u0: propeller inlet/outlet
velocities. The first term is propeller thrust (momentum rise across the
propeller disc); the second is the familiar core/jet thrust term.
Ref: NPTEL p.355.

For direct comparison, the equivalent turbofan thrust and specific
thrust:

    (T)_TF = mdot_a * [beta*u1 - (1+f-b)*ue - (1+beta)*u0]

    (T)_TF / mdot_a = [beta*u1 - (1+f-b)*ue - (1+beta)*u0]

— beta: bypass ratio. Ref: NPTEL p.355-356.

### 2.7 Cross-check formula (Ganesan, secondary source)

Ganesan's optimum-power-split formulation (his Eq. 7.2), same physical
idea as the NPTEL alpha-split above but different symbol set:

    Total thrust = Nozzle thrust + Propeller thrust
                 = mdot_a*(cj - ci) + mdot_a*ci
                 = mdot_a*[sqrt(2*delta_hnoz*eta_noz) - ci] + sqrt(eta_T*delta_hT*eta_tr)

— delta_hnoz: nozzle enthalpy drop, delta_hT: turbine enthalpy drop,
eta_tr: transmission efficiency of the propeller and reduction gear
(Ganesan's combined analogue of NPTEL's eta_Pr*eta_g), eta_T: turbine
efficiency, eta_noz: nozzle efficiency, mdot_a: mass flow through the
turbine. Ref: Ganesan 3e p.225-226, §7.5, Eq. 7.2. (See judgment-call
note #6 — `ci`, the propeller-side velocity term, is not clearly defined
in the extracted text.)

## 3. Typical/design values

- Propeller efficiency (eta_Pr): "typical propeller efficiency is around
  80%." Ref: NPTEL p.354.
- Fraction of enthalpy drop sent to turbine vs. nozzle: turbine ~80-90%,
  nozzle ~10-20% (jet thrust contribution similarly ~10-20% "depending
  upon the flight velocity" per Ganesan). Ref: NPTEL p.347 (concept);
  Ganesan 3e p.224-225, §7.5.1.
- Equivalent propeller bypass ratio: >= 25 (used for the turbofan
  analogy). Ref: NPTEL p.354-355.
- Typical ESFC: ~0.27236 kg fuel per kW-hr (unit phrasing ambiguous —
  see note #5). Ref: NPTEL p.354.
- Static thrust-to-shp conversion constants: 2.6 lb thrust per shp;
  28.5 N thrust per kW. Ref: NPTEL p.353-354.
- Practical turboprop speed envelope: economical up to about 800 km/h.
  Ref: Ganesan 3e p.226, §7.5.2.

## 4. Judgment calls / ambiguities to resolve before implementation

1. **Missing mass-flow factor in single-spool `Tn`.** The single-spool
   nozzle-thrust line is transcribed as `Tn = [(1+f-b)*ue - u]`, with no
   `mdot_a` multiplier — inconsistent with every other nozzle-thrust
   formula in this same lecture (twin-spool `Tn`, turbofan-analogy `T`,
   propfan `Tn`), which all carry an explicit mass-flow factor. This
   reads as a transcription/OCR drop rather than an intentional
   per-unit-mass-flow form (`Tpr` in the same equation is not per-unit-
   mass either). Recommend implementing with the `mdot_a` factor
   included, consistent with the rest of the source and with this
   project's turbojet `nozzle`/`performance` treatment.
2. **T05 "closed form" pattern recurs here.** The twin-spool
   `p05 = p04*[1-(T04-T05)/(eta_t*T04)]^(gamma_t/(gamma_t-1))` line
   is the same style of derived/closed-form relation already flagged in
   this repo's README (judgment call #2, `matching.py`) for the plain
   turbojet, where a second form carrying `eta_t` in the denominator
   could not be independently re-derived from the transcript. The same
   caution applies here: worth cross-checking against the simple energy
   balance before wiring it into a solver as the sole path.
3. **Dimensionally odd combined per-mass-flow thrust equation
   (twin-spool, p.352).** The line
   `T/mdot/U = eta_pr*eta_g/U*[...] + [(1+f-b)*sqrt(2*(1-alpha)*eta_n*delta_h)*Ue - U]`
   does not parse cleanly — it appears to conflate the `Tpr/mdot_a`
   term (correctly divided by U) with a `Tn` term that should not carry
   an extra `Ue -` multiplication artifact. This looks like an OCR
   merge of two adjacent lines/equations. Recommend treating `Tpr` and
   `Tn` as computed separately (formulas above) and summing, rather than
   trying to reproduce this single merged line literally.
4. **Empirical static-thrust-to-power constants (2.6 lb/shp, 28.5
   N/kW).** These are unsourced beyond "so now these constants can be
   depending on the unit," i.e. the lecture does not derive them from
   first principles; they are industry rule-of-thumb conversions
   assuming a nominal static propeller efficiency. Treat as a
   configurable/documented constant, not a physical law, the same way
   this project already flags unsourced numeric defaults in
   `constants.py`.
5. **Garbled ESFC units ("kg fuel per kilowatt horsepower").** "Kilowatt"
   and "horsepower" are two different unit systems; the source phrase
   conflates them. The numeric value (0.27236) most plausibly matches kg
   per kW-hr (a very close analogue of TSFC's kg per N-s, scaled to
   power rather than thrust) — recommend treating it as kg/(kW-hr) and
   flagging the ambiguity in code, the same way this project documents
   other "NOT IN SOURCE" or ambiguous-unit constants.
6. **Ganesan's `ci` term is undefined in the extracted excerpt.** Eq. 7.2
   introduces `cj` (nozzle jet velocity, clearly `sqrt(2*delta_hnoz*eta_noz)`)
   and `ci`, which appears both subtracted from `cj` and added back,
   algebraically collapsing to `mdot_a*cj` unless `ci` on each side of
   the equation means something different (most likely: `ci` on the LHS
   is a "core" or "induced" velocity contribution and the RHS restates it
   via `sqrt(eta_T*delta_hT*eta_tr)`, an effective propeller-side
   velocity). The extracted page range does not include a diagram or
   further text defining `ci` unambiguously. This is a secondary/cross-
   check source only — recommend relying on the NPTEL alpha-split
   formulation as the implementation source of truth and using Ganesan's
   Eq. 7.2 only for a qualitative/order-of-magnitude cross-check, the
   same "primary vs. secondary" split already used for the turbojet.
7. **Single-spool vs. twin-spool `alpha_opt` and `ue` formulas are
   structurally identical modulo which turbine's efficiency terms
   appear** (`eta_mt, eta_t` vs. `eta_mft, eta_ft`) — this is expected
   and not an ambiguity, but worth stating explicitly so an
   implementation can share one function parametrized by "driving
   turbine efficiency terms" rather than duplicating logic.
