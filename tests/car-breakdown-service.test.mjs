import test from 'node:test';
import assert from 'node:assert/strict';

const calculateServiceDuration = (startDateVal, startTimeVal, endDateVal, endTimeVal) => {
  if (!startTimeVal || !endTimeVal) return undefined;
  const outTime = String(startTimeVal).trim();
  const inTime = String(endTimeVal).trim();
  if (!outTime || !inTime) return undefined;

  const outDate = String(startDateVal ?? '').trim();
  const inDate = String(endDateVal ?? '').trim() || outDate;
  if (!outDate) return undefined;

  const parseToUtc = (dStr, tStr) => {
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
    const [h, min] = tStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return undefined;
    return Date.UTC(y, m - 1, d, h, min, 0, 0);
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

test('Calculates same-day car breakdown service duration', () => {
  const duration = calculateServiceDuration('2026-11-18', '10:00', '2026-11-18', '14:30');
  assert.strictEqual(duration, '4h 30m');
});

test('Calculates multi-day service duration with days and hours', () => {
  const duration = calculateServiceDuration('2026-11-10', '09:00', '2026-11-12', '15:15');
  assert.strictEqual(duration, '2d 6h 15m');
});

test('Returns undefined when return time is pending', () => {
  assert.strictEqual(calculateServiceDuration('2026-11-18', '10:00', '2026-11-18', ''), undefined);
  assert.strictEqual(calculateServiceDuration('2026-11-18', '', '2026-11-18', '14:00'), undefined);
});

test('Returns Invalid time range when return precedes out time on same date', () => {
  const duration = calculateServiceDuration('2026-11-18', '15:00', '2026-11-18', '11:00');
  assert.strictEqual(duration, 'Invalid time range');
});
