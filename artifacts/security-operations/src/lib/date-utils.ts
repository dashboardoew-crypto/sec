/**
 * Shared Date, Time, and Calculation Utilities for Watchroom Operations ERP
 */

/**
 * Returns YYYY-MM-DD formatted string in Asia/Kolkata (IST) time zone
 */
export const indiaDateKey = (value: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Robust date component parser supporting:
 * - YYYY-MM-DD, YYYY/MM/DD
 * - DD-MM-YYYY, DD/MM/YYYY, D-M-YYYY, D/M/YYYY
 * - DD-MM-YY, DD/MM/YY, D/M/YY (2-digit year)
 */
export const normalizeDateParts = (value: unknown): { year: number; month: number; day: number } | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
  const text = String(value).trim();
  if (!text) return null;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }

  // Day-first: DD-MM-YYYY or DD/MM/YYYY
  const dmy4 = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy4) {
    return { year: Number(dmy4[3]), month: Number(dmy4[2]), day: Number(dmy4[1]) };
  }

  // Day-first 2-digit year: DD-MM-YY or DD/MM/YY (e.g. 5/11/26 -> 2026-11-05)
  const dmy2 = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (dmy2) {
    const rawYear = Number(dmy2[3]);
    const year = rawYear < 50 ? 2000 + rawYear : 1900 + rawYear;
    return { year, month: Number(dmy2[2]), day: Number(dmy2[1]) };
  }

  return null;
};

/**
 * Format a date string to DD-MM-YYYY for display
 */
export const formatDate = (value: unknown): string => {
  if (!value) return '—';
  const parts = normalizeDateParts(value);
  if (!parts) return String(value).trim() || '—';
  const { year, month, day } = parts;
  if (![year, month, day].every(Number.isFinite)) return String(value).trim() || '—';
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).padStart(4, '0')}`;
};

/**
 * Convert any date input into YYYY-MM-DD for HTML <input type="date">
 */
export const toInputDate = (value: unknown): string => {
  if (!value) return '';
  const parts = normalizeDateParts(value);
  if (!parts) return typeof value === 'string' ? value.trim() : '';
  const { year, month, day } = parts;
  if (![year, month, day].every(Number.isFinite) || month < 1 || month > 12 || day < 1 || day > 31) {
    return typeof value === 'string' ? value.trim() : '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Bounds for record date inputs:
 * - Admin / HR: any past date up to today (min undefined)
 * - Manager: up to 7 days prior up to today
 * - Security (or default): up to 3 days prior up to today
 * Strictly no future dates allowed.
 */
export const entryDateBounds = (role?: string) => {
  const today = indiaDateKey(new Date());
  const todayStart = new Date(`${today}T00:00:00Z`);
  if (role === 'admin' || role === 'hr') {
    return { min: undefined, max: today };
  }
  const days = role === 'manager' ? 7 : 3;
  return {
    min: new Date(todayStart.getTime() - days * 86_400_000).toISOString().slice(0, 10),
    max: today,
  };
};

/**
 * Parse HH:mm string to minutes from midnight
 */
export const timeToMinutes = (val: unknown): number | undefined => {
  if (typeof val !== 'string') return undefined;
  const [h, m] = val.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined;
};

/**
 * Format minutes to human readable string (e.g. "2h 30m")
 */
export const formatDuration = (minutes: number): string =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/**
 * Format minutes to HH:mm clock duration string
 */
export const formatClockDuration = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Format minutes to signed HH:mm clock duration string
 */
export const formatSignedClockDuration = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

/**
 * Calculate total days for working attendance minutes
 */
export const formatTotalDays = (minutes: number): string => {
  if (minutes < 300) return '0';
  if (minutes < 480) return '0.5';
  return '1';
};

/**
 * Calculate overtime minutes beyond standard shift thresholds
 */
export const overtimeMinutesFor = (minutes: number): number => {
  return minutes < 300
    ? Math.max(minutes, 0)
    : minutes < 480
      ? minutes - 300
      : Math.max(minutes - 480, 0);
};

/**
 * Test whether a value is blank / empty
 */
export const isBlankValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && (value.trim() === '' || value.trim() === '—' || value.trim() === '-'));

/**
 * Test whether a value represents boolean Yes
 */
export const isYes = (value: unknown): boolean =>
  String(value ?? '').trim().toLowerCase() === 'yes';

/**
 * Calculate total service duration in "Xd Xh Xm" or "Xh Xm" given out date/time and in date/time
 */
export const calculateServiceDuration = (
  startDateVal: unknown,
  startTimeVal: unknown,
  endDateVal: unknown,
  endTimeVal: unknown,
): string | undefined => {
  if (!startTimeVal || !endTimeVal) return undefined;
  const outTime = String(startTimeVal).trim();
  const inTime = String(endTimeVal).trim();
  if (!outTime || !inTime) return undefined;

  const outDate = String(startDateVal ?? '').trim();
  const inDate = String(endDateVal ?? '').trim() || outDate;
  if (!outDate) return undefined;

  const parseToUtc = (dStr: string, tStr: string): number | undefined => {
    let y = 0, m = 0, d = 0;
    const isoMatch = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dmyMatch = dStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (isoMatch) {
      y = Number(isoMatch[1]);
      m = Number(isoMatch[2]);
      d = Number(isoMatch[3]);
    } else if (dmyMatch) {
      d = Number(dmyMatch[1]);
      m = Number(dmyMatch[2]);
      y = Number(dmyMatch[3]);
    } else {
      return undefined;
    }
    const tMatch = tStr.match(/^(\d{1,2}):(\d{2})/);
    if (!tMatch) return undefined;
    const hours = Number(tMatch[1]);
    const minutes = Number(tMatch[2]);
    if (![y, m, d, hours, minutes].every(Number.isFinite)) return undefined;
    return Date.UTC(y, m - 1, d, hours, minutes);
  };

  const startUtc = parseToUtc(outDate, outTime);
  const endUtc = parseToUtc(inDate, inTime);
  if (startUtc === undefined || endUtc === undefined) return undefined;

  const diffMs = endUtc - startUtc;
  if (diffMs < 0) return 'Invalid time range';

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const remainderMinutes = totalMinutes % 1440;
  const hours = Math.floor(remainderMinutes / 60);
  const minutes = remainderMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
};

/**
 * Returns current time in Asia/Kolkata (IST) as HH:mm
 */
export const currentIndiaTime = (): string => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

/**
 * Returns all possible key representations of a date string or Date object
 * to ensure bulletproof dictionary indexing and cross-matching across all date formats.
 */
export const getAllDateKeys = (value: unknown): string[] => {
  if (!value) return [];
  const keys = new Set<string>();
  const rawStr = String(value).trim();
  if (rawStr) {
    keys.add(rawStr);
    keys.add(rawStr.toLowerCase());
    if (rawStr.includes('T')) {
      keys.add(rawStr.split('T')[0]);
    }
  }
  const parts = normalizeDateParts(value);
  if (parts) {
    const { year, month, day } = parts;
    const yStr = String(year).padStart(4, '0');
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const y2Str = String(year % 100).padStart(2, '0');

    keys.add(`${yStr}-${mStr}-${dStr}`);
    keys.add(`${yStr}/${mStr}/${dStr}`);
    keys.add(`${dStr}-${mStr}-${yStr}`);
    keys.add(`${dStr}/${mStr}/${yStr}`);
    keys.add(`${day}-${month}-${yStr}`);
    keys.add(`${day}/${month}/${yStr}`);
    keys.add(`${dStr}-${mStr}-${y2Str}`);
    keys.add(`${dStr}/${mStr}/${y2Str}`);
    keys.add(`${day}-${month}-${y2Str}`);
    keys.add(`${day}/${month}/${y2Str}`);
  }
  return Array.from(keys);
};

/**
 * Triggers a browser download of CSV data with proper memory cleanup
 */
export const downloadCsv = (filename: string, rows: (string | number | null | undefined)[][]): void => {
  const csv = rows
    .map((row) => row.map((cell) => JSON.stringify(cell ?? '')).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
