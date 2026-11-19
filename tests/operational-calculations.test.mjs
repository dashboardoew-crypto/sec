import test from 'node:test';
import assert from 'node:assert/strict';

// Minutes between two HH:mm strings
const minutesBetween = (from, to) => {
  if (typeof from !== 'string' || typeof to !== 'string') return undefined;
  const parse = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
  };
  const fromMinutes = parse(from);
  const toMinutes = parse(to);
  if (fromMinutes === undefined || toMinutes === undefined) return undefined;
  return toMinutes >= fromMinutes
    ? toMinutes - fromMinutes
    : 24 * 60 - fromMinutes + toMinutes; // midnight rollover
};

// Derived values generator mirroring applyDerivedValues in operations.ts
const calculateDerivedFields = (slug, data) => {
  const result = { ...data };

  // 1. Vehicle kilometers
  const initialReading = Number(data.initial_reading);
  const finalReading = Number(data.final_reading);
  if (Number.isFinite(initialReading) && Number.isFinite(finalReading)) {
    result.total_km_run = finalReading - initialReading;
    result.total_km_car_run = finalReading - initialReading;
  }

  // 2. Fork lifter reading
  if (slug === 'fork-lifter') {
    const initial = Number(data.initial_meter_reading);
    const final = Number(data.final_meter_reading);
    if (Number.isFinite(initial) && Number.isFinite(final)) {
      result.today_total_reading = Math.round((final - initial) * 100) / 100;
    }
  }

  // 3. Transit durations between units
  const unit12 = minutesBetween(data.out_time_from_unit_1, data.in_time_in_unit_2);
  const unit21 = minutesBetween(data.out_time_from_unit_2, data.in_time_in_unit_1);
  if (unit12 !== undefined) result.time_taken_to_travel_from_unit1_to_2 = `${Math.floor(unit12 / 60)}h ${unit12 % 60}m`;
  if (unit21 !== undefined) result.time_taken_to_travel_from_unit_2_to_1 = `${Math.floor(unit21 / 60)}h ${unit21 % 60}m`;

  // 4. Standard in/out time durations
  const durationPairs = [
    ['in_time', 'out_time'],
    ['key_out', 'key_returned'],
    ['morning_in', 'morning_out'],
  ];
  for (const [from, to] of durationPairs) {
    if (data[from] && data[to]) {
      const dur = minutesBetween(data[from], data[to]);
      if (dur !== undefined) {
        result.time_duration = `${Math.floor(dur / 60)}h ${dur % 60}m`;
        result.total_hours = `${Math.floor(dur / 60)}h ${dur % 60}m`;
      }
    }
  }

  return result;
};

test('Vehicle total KM calculates correctly from meter readings', () => {
  const data = {
    initial_reading: '10250',
    final_reading: '10310',
  };
  const derived = calculateDerivedFields('outgoing-vehicles', data);
  assert.strictEqual(derived.total_km_run, 60);
  assert.strictEqual(derived.total_km_car_run, 60);
});

test('Fork lifter daily reading calculates accurately', () => {
  const data = {
    initial_meter_reading: '124.5',
    final_meter_reading: '128.8',
  };
  const derived = calculateDerivedFields('fork-lifter', data);
  assert.strictEqual(derived.today_total_reading, 4.3);
});

test('Travel time between Unit 1 and Unit 2 calculates accurately', () => {
  const data = {
    out_time_from_unit_1: '09:15',
    in_time_in_unit_2: '09:45',
  };
  const derived = calculateDerivedFields('outgoing-vehicles', data);
  assert.strictEqual(derived.time_taken_to_travel_from_unit1_to_2, '0h 30m');
});

test('Time duration handles same-day intervals and midnight rollovers', () => {
  assert.strictEqual(minutesBetween('08:00', '16:30'), 510); // 8.5 hours
  assert.strictEqual(minutesBetween('23:00', '01:30'), 150); // 2.5 hours over midnight
});
