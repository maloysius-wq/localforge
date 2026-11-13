export interface ContextRingProps {
  used: number | null;
  capacity: number;
  kind?: "prompt" | "total";
}
export function ContextRing({ used, capacity, kind = "prompt" }: ContextRingProps) {
  const known = used !== null && capacity > 0 && Number.isFinite(used);
  const ratio = known ? Math.min(1, Math.max(0, used / capacity)) : 0;
  const percent = known ? Math.round(ratio * 100) : null;
  const circumference = 2 * Math.PI * 17;
  const title = known
    ? (kind === "total" ? "Last turn: prompt + generated output" : "Last request: tokenized prompt")
      + " · " + used.toLocaleString() + " of " + capacity.toLocaleString() + " tokens"
    : "Context usage unavailable until the next model request";
  return <div className="context-ring-wrap" title={title} aria-label={title} role="status">
    <svg className="context-ring" width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle className="context-ring-track" cx="23" cy="23" r="17" fill="none" strokeWidth="4"/>
      <circle className={percent !== null && percent >= 90 ? "context-ring-fill high" : percent !== null && percent >= 75 ? "context-ring-fill near" : "context-ring-fill"}
        cx="23" cy="23" r="17" fill="none" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)}
        transform="rotate(-90 23 23)"/>
      <text x="23" y="26" textAnchor="middle" className="context-ring-percent">{percent === null ? "?" : percent + "%"}</text>
    </svg>
    <span className="context-ring-copy"><strong>Context</strong><small>{known
      ? used.toLocaleString() + " / " + capacity.toLocaleString() + " tokens"
      : "Not measured yet"}</small></span>
  </div>;
}
