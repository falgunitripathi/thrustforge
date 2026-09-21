import FieldInfoLabel from "./FieldInfoLabel.jsx";

/** Reusable labeled select input, controlled. */
export default function SelectField({ label, value, onChange, options, hint }) {
  return (
    <label className="field">
      <FieldInfoLabel label={label} hint={hint} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
