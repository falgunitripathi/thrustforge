# ThrustForge

A single-spool, single-design-point turbojet performance solver, plus an
interactive website (`web/`) that lets you choose an engine configuration
— flight condition, compressor architecture, turbine architecture, TIT —
and see the whole cycle solve live, in the browser.

**Try it:** the site is a static, server-free build (see "The web app"
below for why), so once deployed it always works when someone clicks the
link — no backend to keep alive.

*(Naming note: the project and website are called ThrustForge; the Python
engineering package inside — `aeropropsim/` — kept its original name,
since that's internal plumbing rather than anything a visitor sees.)*

## Repository layout

```
aeropropsim/    Phase 1 Python engineering core (this README's main subject)
tests/          pytest suite for the Python core (69 tests)
examples/       a runnable Python worked example
web/            Phase 2: the interactive site — Vite + React, physics
                ported to JS (web/src/physics/), Python↔JS parity harness
                (web/scripts/parity_check.mjs)
```

## The web app

`web/` is a static site (Vite + React) with the entire physics engine
faithfully ported to JavaScript, module-by-module, at
`web/src/physics/*.js` — one file per Python module, same formulas, same
`Ref: §N` citations, same documented judgment calls. This was a
deliberate architecture choice over a Python backend + web frontend: a
static site can be hosted for free on GitHub Pages with no server to
maintain, so a link sent to an admissions reviewer (or anyone else) just
works. The tradeoff, accepted explicitly, is that the JS and Python
implementations must be kept from drifting apart — see "Keeping Python
and JS in sync" below.

### Run it locally

```bash
cd web
npm install
npm run dev
```

### Build for deployment

```bash
cd web
npm run build   # outputs web/dist/, ready for any static host
```

A GitHub Actions workflow (`.github/workflows/deploy-web.yml`) builds and
deploys `web/` to GitHub Pages automatically on push to `main` — enable
Pages (Settings → Pages → Source: GitHub Actions) once the repo is on
GitHub.

### Keeping Python and JS in sync

`web/scripts/parity_check.mjs` runs a battery of engine configurations
(different flight conditions, compressor/turbine architectures, stage
counts) through both `aeropropsim.engine.solve_engine` (Python,
via `scripts/dump_engine_result.py`) and `solveEngine` (JS, via
`web/scripts/dump_engine_result.mjs`), then diffs every intermediate and
final number to a tight relative tolerance (1e-9). Run it from `web/`:

```bash
npm run parity
```

This is the guard against the two implementations silently disagreeing —
run it after touching either `aeropropsim/*.py` or `web/src/physics/*.js`.
The JS port has also been independently checked against Ganesan's Worked
Example 7.5 (the same external validation described below for the Python
core), reproducing his published thrust and sfc to the same small
rounding-propagation gap already documented there — not just parity with
Python's own possible bugs.

## Phase 1 Engineering Core

The Python package below (`aeropropsim/`) is the original, independently
validated computational core.

Every formula in this codebase is transcribed from, and cites, a specific
section of the compiled **AeroPropSim Formula Reference** (published as a
claude.ai artifact, and delivered separately as a PDF), which was itself
extracted section-by-section from *Introduction to Airbreathing
Propulsion* (Prof. Ashoke De, IIT Kanpur, NPTEL). Look for `Ref: §N` in a
function's docstring to trace any number back to its source section.

## Install

```bash
pip install -e ".[dev]"
```

## Run the tests

```bash
pytest -q
```

69 tests, all passing as of this writing — including 12 that validate
against an independently published worked example (see "Validation
status" below), not just internal consistency.

## Run the worked example

```bash
python3 examples/design_point_example.py
```

## Package layout

```
aeropropsim/
  constants.py     §0, §10  gas properties (cold/hot section) + design-value defaults
  atmosphere.py    §1       ISA troposphere, freestream stagnation state
  gasstate.py      §2, §2.1 isentropic relations, Station (station-state recipe)
  intake.py        §3       intake pressure recovery
  compressor.py    §4       axial (+ stage-stacking) and centrifugal compressor
  combustor.py     §5       fuel-air ratio energy balance
  turbine.py       §6       axial (+ stage-stacking) and radial turbine
  matching.py      §7       compressor-turbine shaft power balance
  nozzle.py        §8       choking check, exit velocity, C-D geometry
  performance.py   §9       thrust, TSFC, efficiencies, Breguet range
  engine.py        §11      orchestrator — wires all of the above in the
                            recommended single-design-point solve order
tests/                      one file per module, plus test_engine_smoke.py
                            for full-cycle, cross-module checks
examples/
  design_point_example.py   a runnable worked example
```

`engine.solve_engine(EngineConfig(...))` runs the whole §11 solve order —
atmosphere → intake → compressor stage-stack → combustor → shaft-balance
→ turbine stage-stack → nozzle → performance — and returns an
`EngineResult` with every intermediate dict plus a `stations` table
(`Station` objects at a, 2, 3, 4, 5, 9) ready to back a "Station
Analysis" or "Stage Analysis" UI view directly.

## Validation status — read this before trusting absolute numbers

**External validation is now in place.** `tests/test_validation_ganesan_example_7_5.py`
reproduces Worked Example 7.5 (pp.258-261) from V. Ganesan, *Gas Turbines*,
3rd ed. (Tata McGraw Hill) — a complete, independently published,
single-spool turbojet design point with every input given and a published
final answer (thrust = 6745.17 N, sfc = 0.140 kg/(N·h)). The test runs
this project's own component functions (not hand-reproduced arithmetic)
against Ganesan's given inputs and checks every intermediate station value
and the final thrust/sfc against his published numbers. All 12 checks
pass. This closes the gap flagged in earlier drafts of this README — the
NPTEL source material this project is primarily built from is a
lecture-note transcript with no fully worked numerical example in it
(only the stoichiometric methane fuel-air-ratio number in §5), so an
independent textbook was needed to check absolute output numbers, not just
internal consistency.

Reconciling the two sources surfaced real, worthwhile findings rather than
a clean pass-through — this is exactly what external validation is for:

- **A genuine simplification difference, not a bug, in intake modelling.**
  Ganesan defines diffuser/ram efficiency as a linear interpolation of
  actual vs. ideal pressure rise (his Eq. 7.18/7.24); this project's
  primary (IIT Kanpur) reference instead scales the Mach-number term
  inside the isentropic exponent. The two do not reduce to each other
  algebraically for eta<1 (confirmed numerically). Both are legitimate,
  named conventions in the gas-turbine literature — `intake.py` now
  implements both, clearly labelled, with `engine.solve_engine` still
  defaulting to the primary reference's convention.
- **A subtle, resolved question about choked-nozzle exit temperature.**
  Reproducing Ganesan's own choked-nozzle numbers required his specific
  formula for exit temperature, which folds nozzle efficiency directly
  into a temperature term. Working through the physics (first law: an
  adiabatic, no-shaft-work nozzle conserves stagnation enthalpy exactly,
  with or without friction; at M=1, T/T0=2/(gamma+1) follows purely from
  the definition of Mach number) shows this project's *original* formula
  (independent of nozzle efficiency) is the more defensible general
  default — Ganesan's convention looks like a common textbook shortcut
  that coincides with the rigorous result only at eta_N=1. Both are now
  in `nozzle.py`: `choked_exit_temperature` (the default, kept
  eta_N-independent on purpose) and `choked_exit_temperature_ganesan_convention`
  (used only to reproduce his published example). See that function's
  docstring for the full derivation.
- **A quantified ~11% gap between two legitimate combustor formulas.**
  Ganesan's worked example uses the common simplified linear fuel-flow
  estimate (mdot_f = mdot_a·Cpg·(TIT−T_compexit)/QR, valid for f≪1); this
  project's `combustor.fuel_air_ratio` uses the more complete energy
  balance. For this operating point they differ by about 11% — real,
  measured, and now documented, not asymptotically negligible the way the
  "f≪1" framing might suggest.

This is a meaningfully stronger validation bar than internal consistency
alone: a wrong formula would need to fail either the closure/round-trip
checks below *or* reproduce a published book's numbers by coincidence,
which is a high bar to clear by accident. The remaining internal-
consistency checks (still valuable — they catch classes of bug an
external example doesn't happen to exercise) are:

- **Stage-stacking closure**: the product of all per-stage pressure
  ratios exactly reproduces the target overall pressure ratio, for both
  compressor and turbine (`test_compressor_stacking.py`,
  `test_turbine_stacking.py`).
- **Energy-conservation closure**: after solving the combustor's f and
  the shaft balance's T05, plugging the results back into the *raw*
  conservation laws they were derived from confirms energy actually
  balances (`test_combustor_and_matching.py`).
- **Station-state round-tripping**: building a station forward from
  (T0,p0,V) and then backward from its own resulting static state
  reproduces the same (T0,p0) (`test_gasstate.py`).
- **Choking-boundary behavior**: the choked-nozzle exit is exactly sonic
  by construction; the choked/unchoked decision matches direct pressure
  comparison (`test_nozzle.py`).
- **Cross-module identities in the full engine**: e.g. the turbine
  stage-stack's actual overall expansion ratio matches the shaft
  balance's required ratio exactly; the two independent formulas for
  overall efficiency agree to the expected order (`test_engine_smoke.py`).

One more published example (ideally at a different flight condition and
compressor architecture — e.g. from Saravanamuttoo/Rogers/Cohen's *Gas
Turbine Theory* or Mattingly's *Elements of Gas Turbine Propulsion*) would
further reduce the odds of a coincidental match, but the current state is
no longer "internal consistency only."

## Known simplifications and judgment calls

These are the specific places where either the source's own transcript
was ambiguous, or a design choice had to be made that isn't spelled out
formula-by-formula in the reference. Each is also flagged with a comment
at its exact location in the code.

1. **Stage-stacking subscript** (`compressor.py`, `turbine.py`): the
   source's own stacking procedure text has a subscript that, read
   literally, would put a stage's *own exit* temperature in the
   denominator of its *own* pressure-ratio formula — inconsistent with
   the unambiguous base per-stage formula earlier in the same section
   (which uses the stage's *inlet* temperature). This codebase uses the
   inlet-temperature reading throughout, as the physically standard and
   internally consistent choice.
2. **Shaft-balance closed form** (`matching.py`): the source gives two
   forms for T05/T04 — a simple energy balance, and a second "closed
   form" that additionally carries eta_c and eta_t in the denominator.
   Only the simple, first-principles energy balance is wired into the
   solver; the second form is kept as a documented citation only, since
   its exact derivation/assumption set could not be independently
   re-derived from the extracted transcript.
3. **Unsourced numeric defaults** (`constants.py` `DEFAULTS`): a few
   values the solver needs have no explicit number anywhere in the
   extracted source — combustor pressure-loss fraction (5%, conventional
   placeholder), aviation kerosene heating value (43 MJ/kg, standard
   published Jet-A LHV), and axial-turbine per-stage total-to-total
   efficiency (0.90, conventional literature value; the source only gives
   a number, >0.7, for the *radial* turbine). Every one of these is
   labelled "NOT IN SOURCE" in `constants.py` and is a natural first
   candidate to expose as an editable slider in the eventual UI rather
   than a hidden constant.
4. **eta_0 = eta_th·eta_p vs. eta_0 = T·V/(mdot_f·Q_R)** (§9): these two
   formulas are algebraically identical only in the f→0 limit, not
   exactly — worked out and documented in
   `test_engine_smoke.py::test_overall_efficiency_identity_holds_to_O_f_...`.
   This mirrors the source's own note (§5) that f≪1 is the standard
   simplifying assumption behind the general thrust equation.
5. **Stratosphere (z > 11 km)**: `atmosphere.isa_troposphere` deliberately
   raises rather than silently extrapolating — the source gives the
   *shape* of the exact hydrostatic stratosphere relation but not the
   specific reference constants needed to anchor it numerically within
   the extracted transcript. Flagged as a Phase 2 extension.
6. **Radial turbines are single-stage only** — enforced by
   `engine.solve_engine` (raises `ValueError` for `n_turbine_stages != 1`
   with `turbine_type="radial"`), per the source's own design guidance
   (§6.2) that multi-staging a radial turbine is impractical.
7. **Two intake-efficiency conventions** (`intake.py`) and **two choked-
   nozzle-exit-temperature conventions** (`nozzle.py`) — both pairs found
   while validating against Ganesan's *Gas Turbines* (see "Validation
   status" above for the full reasoning). Neither pair is a bug; each
   module's docstring explains why the default was chosen and where the
   alternate, book-matching convention lives.
8. **Turbine T05 comes from the shaft power balance only; p05 comes from
   stage-stacking that fixed temperature drop, so stage count and
   axial/radial choice DO genuinely feed back into it** (`engine.py`, see
   its own "Architecture note"). This used to be a documented
   simplification — `matching.turbine_pressure_ratio` computed the
   overall p05/p04 directly from the energy balance treating the whole
   expansion as a single equivalent stage, and `n_turbine_stages` only
   redrew the per-stage station table around that already-fixed number —
   but it's now fixed: `turbine.stack_axial_turbine_from_temperature_drop`
   takes the shaft-balance-fixed temperature drop (T04-T05) as its
   independent variable and produces the actual overall pressure ratio as
   an *output* of splitting that drop across `n_turbine_stages` real
   stages (each computed forward from its own running inlet temperature,
   no back-solving to hit an external target). This is the turbine-side
   mirror of the compressor's stage-stacking, now running in its natural
   direction: for the compressor, overall pressure ratio is the
   independent user input and stage count changes the temperature rise
   needed to reach it (a real "preheat factor" effect); for the turbine,
   T04 and T05 are fixed by the user's TIT and the shaft balance, and
   stage count instead changes the *pressure* ratio for that *same*,
   fixed temperature drop — the real multi-stage "reheat factor" effect
   that was previously left unmodelled. Quantified for the default
   configuration (T04=1400 K, T05≈1117.5 K, eta_tt=0.90) and confirmed by
   `tests/test_turbine_stacking.py`'s
   `test_from_temperature_drop_pr_actual_rises_with_stage_count`: the
   actual stage-by-stage p05/p04 comes out about +0.7% (2 stages) to
   +1.2% (8 stages) higher than the old single-equivalent-stage value,
   which now visibly (if modestly) raises thrust and lowers TSFC as
   `n_turbine_stages` increases — see
   `test_turbine_stage_count_now_genuinely_affects_thrust` in
   `tests/test_engine_smoke.py`. At `n_turbine_stages=1` (the axial
   default, and the only value radial allows) the new function is
   algebraically identical to the old one, so the shipped default
   configuration and the radial path are numerically unaffected by this
   fix — confirmed by `test_single_stage_axial_matches_radial_exactly`
   and by `stack_axial_turbine_from_temperature_drop`'s own docstring. The
   old single-equivalent-stage function, `matching.turbine_pressure_ratio`,
   is kept (still exactly right at n=1) for the Ganesan textbook
   validation in `ValidationPanel.jsx`, which is single-stage.

## Not yet implemented (by design — later phases)

- Off-design / component-map matching (§7's "Phase 3 extension" in the
  reference) — this core solves one design point per call; sweeping
  altitude/Mach/throttle against fixed hardware needs turbine and
  compressor maps, explicitly out of v1 scope.
- Afterburner (stations 6/6A) — not modelled, matching the reference's
  own scope note.
- Velocity-triangle-level detail (blade angles, hub-tip ratios, diffusion
  factor, etc.) — `degree_of_reaction_axial`,
  `loading_flow_reaction_coefficients` and friends exist as standalone
  utility functions (useful for a future "Thermodynamics"/blade-design
  tab) but are not wired into `engine.solve_engine`, which only needs
  stage count + target pressure ratio/TIT to produce the full station
  table.
- Conical vs. bell C-D nozzle profile — `nozzle.py` implements the
  conical sizing formulas; a bell contour is noted in the source as a
  qualitative fact only (no closed form), so it's left as a future UI
  toggle on the same epsilon rather than a fabricated formula.
