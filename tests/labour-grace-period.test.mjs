import test from 'node:test';
import assert from 'node:assert/strict';

// Evaluates labour employee status according to the 3-day retention rule
function evaluateLabourStatus(record, currentTime = Date.now()) {
  const name = String(record?.data?.name ?? '').trim();
  if (!name) return null;

  const isClosed = Boolean(record.data.is_closed);
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  let daysSinceClosed = undefined;
  let shouldShow = true;
  let canUnclose = false;

  if (isClosed) {
    const closedAtTime = record.data.closed_at
      ? new Date(String(record.data.closed_at)).getTime()
      : currentTime;
    const diffMs = currentTime - closedAtTime;
    daysSinceClosed = Math.max(0, diffMs / (24 * 60 * 60 * 1000));

    if (diffMs <= THREE_DAYS_MS) {
      shouldShow = true;
      canUnclose = true;
    } else {
      shouldShow = false;
      canUnclose = false;
    }
  }

  return {
    name,
    is_closed: isClosed,
    closed_at: record.data.closed_at ?? null,
    daysSinceClosed,
    shouldShow,
    canUnclose,
  };
}

test('Active labour employee is shown and cannot be unclosed', () => {
  const record = {
    id: 'emp-1',
    data: {
      name: 'RAMESH KUMAR',
      father_name: 'SURESH',
      work_location: 'Foundry',
      supervisor: 'Joginder',
      is_closed: false,
      closed_at: null,
    },
  };
  const status = evaluateLabourStatus(record);
  assert.ok(status);
  assert.strictEqual(status.shouldShow, true);
  assert.strictEqual(status.canUnclose, false);
  assert.strictEqual(status.is_closed, false);
});










test('Employee closed 1 day ago remains visible for 3 days and can be unclosed', () => {
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const record = {
    id: 'emp-2',
    data: {
      name: 'CHANDKESHWAR',
      is_closed: true,
      closed_at: new Date(now - ONE_DAY_MS).toISOString(),
    },
  };
  const status = evaluateLabourStatus(record, now);
  assert.ok(status);
  assert.strictEqual(status.shouldShow, true);
  assert.strictEqual(status.canUnclose, true);
  assert.strictEqual(status.is_closed, true);
});

test('Employee closed 4 days ago is automatically hidden from list and cannot be unclosed', () => {
  const now = Date.now();
  const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
  const record = {
    id: 'emp-3',
    data: {
      name: 'EXPIRED EMPLOYEE',
      is_closed: true,
      closed_at: new Date(now - FOUR_DAYS_MS).toISOString(),
    },
  };
  const status = evaluateLabourStatus(record, now);
  assert.ok(status);
  assert.strictEqual(status.shouldShow, false, 'Should be hidden after 3 days');
  assert.strictEqual(status.canUnclose, false);
});
