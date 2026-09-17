# Turboramjet / TBCC — Reference Extraction

Source: *Introduction to Airbreathing Propulsion*, Prof. Ashoke De, IIT
Kanpur (NPTEL). Extracted (pdftotext) from
`reference_extraction/nptel_turbofan_turboramjet.txt`. Page numbers are
the printed page numbers visible in the extracted text; lecture numbers
are given where the transcript prints a nearby lecture header (Lectures
32-34 cover this engine; the header for Lecture 34 is the last line of
the extracted file, with no further content captured). All narrative
explanation below is paraphrased in my own words — only the equations are
transcribed verbatim, per this project's `Ref: §N` / `Ref: NPTEL p.NNN`
citation convention.

## 1. How a turboramjet differs from the existing turbojet

A plain turbojet (already modeled in `aeropropsim/*.py`) has one fixed
thermodynamic cycle across its whole flight envelope. A **turboramjet**
(more generally, a **Turbine-Based Combined Cycle**, TBCC) is a hybrid
propulsion system that runs two different engine cycles sharing (fully
or partly) the same airframe installation, switching between them as
flight Mach number increases:

- At **low-to-moderate Mach number**, a conventional turbojet (or
  turbofan, in the "TFRJ" family) provides thrust, exactly like the
  existing single-spool engine in this codebase, optionally with an
  afterburner for extra acceleration.
- At **high supersonic-to-hypersonic Mach number**, the turbomachinery
  is throttled back or shut down and a **ramjet** (or scramjet, or
  dual-mode/dual-combustion ramjet, depending on the family) takes over
  — a ramjet needs no rotating compressor because the intake's own ram
  compression at high Mach is already sufficient, and a
  turbomachine's rotating blades would be a liability (structural/
  thermal limits) at those speeds and pressure ratios.

The reason for the hybrid is that turbojets are efficient and can
produce static/low-speed thrust (needed for takeoff, which a ramjet
cannot do at all — a ramjet produces zero thrust at zero forward speed
since it has no compressor), while ramjets/scramjets become far more
efficient than a turbomachine at high supersonic/hypersonic speeds. The
source frames this switchover point (turbojet-to-ramjet handoff Mach
number) as one of the key design/optimization decisions for the whole
combined-cycle engine, alongside more conventional performance
parameters like specific thrust and TSFC (p.343).

## 2. TBCC configurations and family names

Two installation philosophies, per the source (p.334-336):

- **Wrap-around**: the ram-based flowpath is packaged around/alongside
  the turbine-based flowpath (SR-71 given as the classic example).
- **Over-under**: the turbine-based cycle and ram-based cycle are
  stacked one above the other, either with fully separate intakes/
  nozzles for each, or with a shared intake and/or shared nozzle. The
  source further subdivides this by airframe integration: fuselage-,
  wing-, or tail-mounted installation.

Six named combined-cycle families, built from {turbojet, turbofan} x
{ramjet, scramjet, dual-combustion ramjet}: **TJRJ, TJSJ, TJDJ, TFRJ,
TFSJ, TFDJ** (p.330-331). This reference focuses on the turbojet-based
wrap-around and over-under cases the source actually works through
(TJRJ-style); the turbofan-based families are the same idea with the
turbojet leg replaced by a turbofan cycle (§1-9 of `turbofan.md`) and are
not separately derived in the source.

## 3. Wrap-around turboramjet — cycle stations and mode lines

Station path (as sketched in the source, p.337): **a** (freestream) → 2
(intake exit) → 3 (compressor exit) → 4 (combustor exit) → 5 (turbine
exit) → 6 (afterburner exit, "06AB") → 7 (nozzle exit) when running as a
turbojet; separately, **a** → 8 (ramjet intake exit) → 9 (ramjet
combustor exit) → 10 (ramjet nozzle exit) when running as a ramjet. The
source's own T-s diagram distinguishes three operating lines by line
style: dotted = turbojet with afterburner off, solid = turbojet with
afterburner on, dash-dot = pure ramjet operation.

Per-station process description (paraphrased):
- a→2: intake compression, isentropic efficiency `eta_d`.
- 2→3: compressor, isentropic efficiency `eta_c`.
- 3→4: combustor, constant-pressure heat addition with a pressure loss
  `delta_p_cc` and combustor efficiency.
- 4→5: turbine expansion, isentropic efficiency `eta_t`.
- 5→6: afterburner, second heat addition, pressure loss `delta_p_ab`,
  efficiency `eta_ab`.
- 6→7: nozzle expansion, isentropic efficiency `eta_n`.

The source notes the detailed per-station pressure/temperature equations
for each of these processes are "already done in detail" — i.e. they are
the same intake/compressor/combustor/turbine/afterburner-nozzle formulas
already used for the plain turbojet (`aeropropsim/*.py` §1-§8), just
relabeled onto these station numbers; it does not re-derive them.
Ref: NPTEL p.337.

## 4. Turbojet-mode performance (within the turboramjet)

```
(T/mdot_a)_TJ = (1 + f - fab) * V7 - V
```
**As transcribed, the source uses a minus sign in front of `fab` here**,
which contradicts every other thrust formula in this same source and in
the existing turbojet material (which consistently use `1+f+fab`,
mirroring the physical fact that afterburner fuel adds mass flow to the
exhaust). Treat this as a likely OCR/transcription error and default to
`(1 + f + fab)*V7 - V` — see Ambiguities item 1. Ref: NPTEL p.337-338.

```
(TSFC)_TJ = (f + fab) / (T/mdot_a)_TJ

eta_p = (T/mdot_a)*V / [ (T/mdot_a)*V + (V7-V)^2/2 * (1+f+fab) ]

eta_th = [ (T/mdot_a)*V + (V7-V)^2/2 * (1+f+fab) ] / [ Q_HV * (f+fab) ]

eta_o = eta_p * eta_th
```
Ref: NPTEL p.338.

Note this is structurally identical to the generic dual-spool efficiency
block quoted in `turbofan.md` §4 (single-stream form) — reused here for
the turbojet leg of the combined cycle. Also note the source's own
formula for `(T/mdot_a)_TJ` above lacks the pressure-thrust term
`A9*(p9-p_a)/mdot_a` that appears in essentially every other thrust
formula in this corpus (including the very similar single-spool/dual-
spool formulas). This may be an intentional simplification (assume a
fully-expanded nozzle, `p9=p_a`) for this combined-cycle analysis, or
simply dropped in the transcript — flagged in Ambiguities item 2.

## 5. Ramjet-mode performance (within the turboramjet)

When operating as a pure ramjet, only intake (a→8, pressure recovery
`r_d`), combustor (8→9, pressure loss `delta_p_cc`), and nozzle (9→10,
isentropic efficiency `eta_n`) are active — the compressor/turbine are
bypassed or shut down. Ref: NPTEL p.338-339.

```
(T/mdot_a)_RJ = (1 + fR) * V10 - V

(TSFC)_RJ = fR / (T/mdot_a)_RJ

eta_p = (T/mdot_a)*V / [ (T/mdot_a)*V + (V10-V)^2/2 * (1+fR) ]

eta_th = [ (T/mdot_a)*V + (V10-V)^2/2 * (1+fR) ] / (Q_HV * fR)

eta_o = eta_p * eta_th
```
`fR` is the ramjet-mode fuel-air ratio (distinct from the turbojet
mode's `f`). Ref: NPTEL p.339.

## 6. Dual-mode operation (both cycles contributing simultaneously)

```
T = T_TJ + T_RJ

T = (mdot_a)_TJ * [(1+f+fab)*V7 - V] + (mdot_a)_RJ * [(1+fR)*V10 - V]

T = (mdot_a)_TJ*(1+f+fab)*V7 + (mdot_a)_RJ*(1+fR)*V10 - (mdot_a)_total*V

T/mdot_a = T_total / (mdot_a)_total

(mdot_f)_total = (mdot_a)_TJ*(f+fab) + (mdot_a)_RJ*fR

TSFC = (mdot_f)_total / T_total
```
This dual-mode superposition treats the turbojet leg and ramjet leg as
independent parallel airflows whose thrusts simply add — appropriate for
a wrap-around or over-under installation where the two flowpaths are
physically separate ducts, not a single shared flow. Ref: NPTEL
p.339-340.

## 7. Over-under turboramjet — mass-flow split and combined thrust

The over-under configuration is shown with the two flowpaths sharing (or
not) an intake/nozzle; performance is built up from each leg's own
mass-flow accounting, then combined. As transcribed (see Ambiguities
item 3 — this block of the source is itself notably garbled):

```
(mdot_a)_TJ = [(mdot_a)_TJ / mdot_a] * mdot_a + mdot_fcc + mdot_fab

(mdot_a)_RJ = [(mdot_a)_RJ / mdot_a] * mdot_a + mdot_fR
```
```
T = (mdot_a)_TJ * V_TJ + (mdot_a)_RJ * V_RJ - mdot_a * V_F

T/mdot_a = [ (mdot_a)_TJ/mdot_a + (mdot_a)fcc/mdot_a + (mdot_a)fab/mdot_a ] * V_TJ
         + [ (mdot_a)_RJ/mdot_a + mdot_fR/mdot_a ] * V_RJ
         - V_F

TSFC = [ (mdot_a)fcc/mdot_a + (mdot_a)fab/mdot_a + mdot_fR/mdot_a ] / (T/mdot_a)
```
`V_F` appears to be the flight (freestream) velocity (elsewhere `V` or
`U`); `mdot_fcc`, `mdot_fab`, `mdot_fR` are the core-combustor,
afterburner, and ramjet-combustor fuel flows respectively. Ref: NPTEL
p.341-342.

## 8. Design procedure (qualitative, from the source)

The source closes with a summary design procedure for a hybrid/TBCC
engine (paraphrased, p.343):

1. Select the mission/flight envelope.
2. Select cruise altitude (drives fuel economy).
3. From the takeoff/acceleration line, compute required drag force and
   the corresponding Mach number.
4. Size required thrust to exceed drag by a margin (percentage
   specified by the designer).
5. Decide number of engines from the minimum thrust needed across the
   hybrid engine's operating modes.
6. Run performance calculations for each constituent engine (e.g.
   ramjet, turbojet, scramjet) separately.
7. Integrate the constituents and optimize across the whole envelope —
   explicitly including **choosing the Mach number at which the engine
   switches between ramjet and turbojet modes**, alongside more
   conventional targets like specific thrust and TSFC.

No explicit formula or numeric criterion for the switchover Mach number
itself is given anywhere in the source — it is treated as an
optimization output, not a closed-form relation. Ref: NPTEL p.343.

## 9. Illustrative example (not a general design rule)

The source's closing example is the (conceptual/future) Lockheed Martin
SR-72: a turbine engine accelerates the vehicle to about **Mach 3**,
after which a dual-mode ramjet takes over to hypersonic speed; the two
engines share a common inlet and a common nozzle, with variable
inlet/nozzle geometry to match each cycle's requirements. This is
presented purely as a worked conceptual example, not as a generally
applicable switchover Mach number. Ref: NPTEL p.344.

## 10. Typical / design values found in the source

| Quantity | Typical value / range given | Ref |
|---|---|---|
| Turbojet-to-ramjet switchover Mach number | ~3 (SR-72 conceptual example only — not stated as a general rule) | NPTEL p.344 |
| Intake/compressor/turbine/nozzle efficiencies (`eta_d`, `eta_c`, `eta_t`, `eta_n`, `eta_ab`), pressure losses (`delta_p_cc`, `delta_p_ab`) | **No explicit numeric values given** in this material for the turboramjet cycle specifically | NPTEL p.337 |

This is a substantial gap: essentially none of the numeric design
defaults needed to actually run a turboramjet cycle (efficiencies,
pressure losses, mixing/switchover criteria) are given in this
transcript — only the *structure* of the equations and the qualitative
switchover concept. An implementation will need to borrow the turbojet's
existing defaults (`aeropropsim/constants.py`) for the turbojet-mode leg
and general ramjet literature values for the ramjet-mode leg, both
flagged "NOT IN SOURCE" the same way the existing turbojet defaults are.

## 11. Judgment calls / ambiguities to resolve before implementation

1. **Turbojet-mode thrust formula has a minus sign on `fab`**
   (`(1+f-fab)*V7-V`, p.337) where every other afterburning-thrust
   formula in this same source (turbojet dual-spool, mixed turbofan+AB)
   consistently uses `+fab`. Very likely an OCR misread of a `+` as a
   `-` in the extracted PDF text (the two glyphs are a common OCR
   confusion). Recommend implementing with `+fab` for consistency, and
   noting the literal source text for traceability.
2. **Turbojet-mode and ramjet-mode thrust formulas in this section
   (§4, §5 above) omit the pressure-thrust term** `A9*(p9-p_a)/mdot_a`
   that the plain-turbojet and turbofan formulas elsewhere in this
   corpus consistently include. Could be an intentional simplifying
   assumption specific to this combined-cycle treatment (fully expanded
   nozzle assumed for both modes), or simply dropped during lecture
   transcription — unlike item 1, there's no internal contradiction to
   resolve this against, so this is a genuine open question. Recommend
   implementing both forms (with and without the pressure term) the way
   `intake.py`/`nozzle.py` already keep two documented conventions where
   the source is ambiguous, defaulting to the *with pressure term*
   version for consistency with the rest of the codebase's turbojet
   physics.
3. **The over-under mass-flow-split equations (§7 above, p.341-342) are
   the most garbled part of the entire extracted source** — the
   right-hand side of `(mdot_a)_TJ = [(mdot_a)_TJ/mdot_a]*mdot_a + ...`
   is circular as literally written (it defines `(mdot_a)_TJ` partly in
   terms of itself), and the subsequent `T/mdot_a` and `TSFC` lines carry
   the same issue forward. This reads like an OCR/transcription failure
   on inherently hard-to-OCR fraction-heavy slides rather than a
   deliberate formula, and should not be implemented as literally
   transcribed. Recommend treating §6's dual-mode superposition
   (`T = T_TJ + T_RJ`, on a firmer footing) as the reference approach for
   an over-under implementation too, and either sourcing a cleaner
   version of the over-under mass-split relations from a textbook, or
   deriving them from first principles (mass-flow continuity split
   between the two flowpaths) rather than trusting this transcript's
   version verbatim.
4. **No explicit closed-form relation for the switchover Mach number**
   is given anywhere (§8-9 above) — it is described only as an
   optimization output of the overall design procedure, with a single
   illustrative numeric example (Mach ~3, SR-72) that the source itself
   does not claim is general. An implementation will need its own
   switchover criterion (e.g. crossover point where ramjet specific
   thrust/TSFC overtakes turbojet's at the design altitude), which is a
   design decision the source does not make for us.
5. **Wrap-around vs. over-under intake/nozzle sharing is described only
   qualitatively** (shared vs. separate intake and nozzle, p.335-336,
   340-341) with no equations distinguishing the aerodynamic/thermodynamic
   consequences of sharing vs. not sharing — e.g. no formula for how a
   shared nozzle's effective throat area or expansion ratio should be
   apportioned between the two streams when both are operating (dual
   mode). This would need to be modeled from first principles (area/mass
   conservation) rather than lifted from the source.
