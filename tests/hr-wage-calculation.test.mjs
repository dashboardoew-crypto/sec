import test from 'node:test';
import assert from 'node:assert/strict';

const formatTotalDays = (minutes) => {
  if (minutes < 300) return 0;
  if (minutes < 480) return 0.5;
  return 1.0;
};

const calculateTotalPay = ({
  attendedMinutes = 0,
  wagesPerDay = 500,
  overtimeHours = 0,
  overtimeRate = 70,
}) => {
  const daysMultiplier = formatTotalDays(attendedMinutes);
  const regularWage = Math.round(wagesPerDay * daysMultiplier);
  const overtimeWage = Math.round(overtimeHours * overtimeRate);
  return {
    daysMultiplier,
    regularWage,
    overtimeWage,
    totalPay: regularWage + overtimeWage,
  };
};

test('Full-day attendance (8+ hours / 480m+) calculates full daily wage', () => {
  const pay = calculateTotalPay({
    attendedMinutes: 480, // exactly 8h
    wagesPerDay: 600,
    overtimeHours: 0,
  });
  assert.strictEqual(pay.daysMultiplier, 1.0);
  assert.strictEqual(pay.regularWage, 600);
  assert.strictEqual(pay.totalPay, 600);
});

test('Half-day attendance (5h-7h59m / 300-479m) calculates 0.5 daily wage', () => {
  const pay = calculateTotalPay({
    attendedMinutes: 360, // 6 hours
    wagesPerDay: 600,
    overtimeHours: 0,
  });
  assert.strictEqual(pay.daysMultiplier, 0.5);
  assert.strictEqual(pay.regularWage, 300);
  assert.strictEqual(pay.totalPay, 300);
});

test('Under 5 hours (< 300m) attendance calculates 0 days wage', () => {
  const pay = calculateTotalPay({
    attendedMinutes: 240, // 4 hours
    wagesPerDay: 600,
    overtimeHours: 0,
  });
  assert.strictEqual(pay.daysMultiplier, 0);
  assert.strictEqual(pay.regularWage, 0);
  assert.strictEqual(pay.totalPay, 0);
});

test('Combines regular wage with overtime hours compensation', () => {
  const pay = calculateTotalPay({
    attendedMinutes: 480, // full day
    wagesPerDay: 500,
    overtimeHours: 2.5,
    overtimeRate: 80,
  });
  assert.strictEqual(pay.regularWage, 500);
  assert.strictEqual(pay.overtimeWage, 200); // 2.5 * 80
  assert.strictEqual(pay.totalPay, 700);
});
