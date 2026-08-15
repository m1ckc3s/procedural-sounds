export const APP_VERSION = "0.1.1";
export const LAST_UPDATED = "2026-08-15";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Hand-bumped on push, never derived from build time: it marks the last push to main rather
// than the last redeploy, and a build-time date would also differ between the server render
// and the client render.
export function lastUpdatedLabel(): string {
  const [y, m, d] = LAST_UPDATED.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
