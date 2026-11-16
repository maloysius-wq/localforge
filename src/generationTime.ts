/** Render elapsed response time without rounding up or relying on model token counts. */
export function formatGenerationDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
  return `${minutes}:${seconds}`;
}
