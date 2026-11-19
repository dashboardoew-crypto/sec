import test from 'node:test';
import assert from 'node:assert/strict';

// Helper functions mirroring date-utils logic
const normalizeDateParts = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const dmy4 = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy4) return { year: Number(dmy4[3]), month: Number(dmy4[2]), day: Number(dmy4[1]) };

  const dmy2 = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (dmy2) {
    const rawYear = Number(dmy2[3]);
    const year = rawYear < 50 ? 2000 + rawYear : 1900 + rawYear;
    return { year, month: Number(dmy2[2]), day: Number(dmy2[1]) };
  }
  return null;
};

const formatDate = (value) => {
  if (!value) return '—';
  const parts = normalizeDateParts(value);
  if (!parts) return String(value).trim() || '—';
  const { year, month, day } = parts;
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).padStart(4, '0')}`;
};

const toInputDate = (value) => {
  if (!value) return '';
  const parts = normalizeDateParts(value);
  if (!parts) return typeof value === 'string' ? value.trim() : '';
  const { year, month, day } = parts;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const timeToMinutes = (val) => {
  if (typeof val !== 'string') return undefined;
  const [h, m] = val.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

const overtimeMinutesFor = (minutes) => {
  return minutes < 300
    ? Math.max(minutes, 0)
    : minutes < 480
      ? minutes - 300
      : Math.max(minutes - 480, 0);
};

test('normalizeDateParts correctly parses ISO and DMY dates', () => {
  assert.deepStrictEqual(normalizeDateParts('2026-11-18'), { year: 2026, month: 11, day: 18 });
  assert.deepStrictEqual(normalizeDateParts('18-11-2026'), { year: 2026, month: 11, day: 18 });
  assert.deepStrictEqual(normalizeDateParts('18/11/2026'), { year: 2026, month: 11, day: 18 });
  assert.deepStrictEqual(normalizeDateParts('18/11/26'), { year: 2026, month: 11, day: 18 });
  assert.strictEqual(normalizeDateParts(''), null);
  assert.strictEqual(normalizeDateParts(null), null);
});

test('formatDate converts dates to DD-MM-YYYY format', () => {
  assert.strictEqual(formatDate('2026-11-18'), '18-11-2026');
  assert.strictEqual(formatDate('2026-05-02'), '02-05-2026');
  assert.strictEqual(formatDate(''), '—');
});

test('toInputDate converts dates to standard YYYY-MM-DD format for date inputs', () => {
  assert.strictEqual(toInputDate('18-11-2026'), '2026-11-18');
  assert.strictEqual(toInputDate('02/05/2026'), '2026-05-02');
  assert.strictEqual(toInputDate('2026-11-18'), '2026-11-18');
});

test('timeToMinutes converts HH:mm to minutes from midnight', () => {
  assert.strictEqual(timeToMinutes('00:00'), 0);
  assert.strictEqual(timeToMinutes('09:30'), 570);
  assert.strictEqual(timeToMinutes('18:45'), 1125);
  assert.strictEqual(timeToMinutes('invalid'), undefined);
  assert.strictEqual(timeToMinutes(null), undefined);
});

test('formatDuration formats minutes into human-readable duration strings', () => {
  assert.strictEqual(formatDuration(0), '0m');
  assert.strictEqual(formatDuration(45), '45m');
  assert.strictEqual(formatDuration(60), '1h');
  assert.strictEqual(formatDuration(150), '2h 30m');
  assert.strictEqual(formatDuration(-10), '0m');
});

test('overtimeMinutesFor computes overtime accurately against shift thresholds', () => {
  assert.strictEqual(overtimeMinutesFor(200), 200); // partial shift below 300
  assert.strictEqual(overtimeMinutesFor(300), 0);   // exactly 5 hours
  assert.strictEqual(overtimeMinutesFor(360), 60);  // 6 hours (1 hour above half-day)
  assert.strictEqual(overtimeMinutesFor(480), 0);   // exactly 8 hours standard shift
  assert.strictEqual(overtimeMinutesFor(540), 60);  // 9 hours (1 hour overtime)
});
