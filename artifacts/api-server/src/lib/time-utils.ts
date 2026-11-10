/**
 * Shared time & duration calculation utilities across report generators
 */

export const parseTimeMinutes = (val: unknown): number | undefined => {
  if (typeof val !== "string" && typeof val !== "number") return undefined;
  const str = String(val).trim();
  if (!str) return undefined;

  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }
  return undefined;
};

export const formatDuration = (totalMinutes: number): string => {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const parseNum = (val: unknown): number => {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").trim();
    const parsed = parseFloat(cleaned);
    return !isNaN(parsed) ? parsed : 0;
  }
  return 0;
};
