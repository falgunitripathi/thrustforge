import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Settings that only exist for one turbofan layout (the layout itself is
 * picked with the variant buttons at the top of the page): the geared
 * fan's gearbox, the three-spool engine's IP turbine, the mixed-flow
 * engine's mixer. Nothing to show for the plain unmixed layout.
 */
export default function TurbofanLayoutSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  const layout = config.layout;
  if (layout !== "geared" && layout !== "three_spool" && layout !== "mixed") return null;
  const title = { geared: "Gearbox", three_spool: "IP spool", mixed: "Mixer" }[layout];

  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {title}
        </button>
      </legend>
      {open && layout === "geared" && (
        <NumberField
          label="Gearbox efficiency η_gb"
          value={config.eta_gb}
          onChange={(v) => onChange({ eta_gb: v })}
          min={0.9}
          max={1.0}
          step={0.005}
          hint="η_gb = share of the LP turbine's work that gets through the reduction gearbox to the fan and LPC. (1+β)·Cp_c·(T010−T02) + Cp_c·(T03−T010) = η_gb·λ·η_m·(1+f)·Cp_h·(T06−T07). The gearbox lets the big fan turn slowly while the LP turbine spins fast — as in the Pratt & Whitney PW1000G on the A320neo. Real gearboxes pass about 99% of the power."
        />
      )}
      {open && layout === "three_spool" && (
        <>
          <NumberField
            label="IP turbine efficiency η_IPT"
            value={config.eta_IPT}
            onChange={(v) => onChange({ eta_IPT: v })}
            min={0.5}
            max={1.0}
            step={0.01}
            hint="η_IPT = isentropic efficiency of the intermediate-pressure turbine, which drives the IP compressor on its own shaft: Cp_c·(T03−T010) = λ·η_m·(1+f)·Cp_h·(T06−T07). Three shafts let the fan, IPC and HPC each spin at their best speed, as in the Rolls-Royce RB211 and Trent."
          />
          <NumberField
            label="IP spool mechanical efficiency η_m3"
            value={config.eta_m3}
            onChange={(v) => onChange({ eta_m3: v })}
            min={0.9}
            max={1.0}
            step={0.005}
            hint="Fraction of the IP turbine's work that reaches the IP compressor through its shaft."
          />
        </>
      )}
      {open && layout === "mixed" && (
        <>
          <NumberField
            label="Mixing pressure ratio r_m"
            value={config.r_mix}
            onChange={(v) => onChange({ r_mix: v })}
            min={0.9}
            max={1.0}
            step={0.005}
            hint="p08 = r_m·p07 — mixing the two streams isn't loss-free; the source gives about 0.98."
          />
          <NumberField
            label="Bypass duct pressure loss"
            value={config.delta_p_duct}
            onChange={(v) => onChange({ delta_p_duct: v })}
            min={0}
            max={0.1}
            step={0.005}
            hint="fraction — p03′ = p010·(1 − Δp). The bypass air loses a little pressure in the duct before it reaches the mixer; the source's baseline assumes none."
          />
        </>
      )}
    </fieldset>
  );
}
