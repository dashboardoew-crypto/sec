import test from 'node:test';
import assert from 'node:assert/strict';

// Entry edit window rules
const editWindowForRole = (role) => {
  if (role === 'admin' || role === 'hr') return null; // unlimited
  if (role === 'manager') return 7;
  if (role === 'security') return 3;
  return undefined;
};

// Validates whether record date is acceptable for creation
const isEntryDate = (selectedDateStr, role, todayStr = '2026-11-18') => {
  if (!selectedDateStr) return false;
  const today = new Date(`${todayStr}T00:00:00Z`);
  const target = new Date(`${selectedDateStr}T00:00:00Z`);
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000);

  // Future dates strictly disallowed
  if (diffDays < 0) return false;

  const windowDays = editWindowForRole(role);
  if (windowDays === null) return true; // admin/hr
  if (windowDays === undefined) return false;

  return diffDays <= windowDays;
};

// Module access rules
const canAccessModule = (role, module) => {
  if (!role) return false;
  if (role === 'admin') return true;
  if (role === 'manager') return true;
  if (role === 'hr') return module === 'hr' || module === 'master';
  if (role === 'security') return module === 'security' || module === 'main-gate';
  return false;
};

test('Security role can add records up to 3 days prior, but not future dates or >3 days prior', () => {
  const today = '2026-11-18';
  assert.strictEqual(isEntryDate('2026-11-18', 'security', today), true, 'Today allowed');
  assert.strictEqual(isEntryDate('2026-11-17', 'security', today), true, 'Yesterday allowed');
  assert.strictEqual(isEntryDate('2026-11-15', 'security', today), true, '3 days ago allowed');
  assert.strictEqual(isEntryDate('2026-11-14', 'security', today), false, '4 days ago blocked');
  assert.strictEqual(isEntryDate('2026-11-19', 'security', today), false, 'Tomorrow blocked');
});

test('Manager role can add records up to 7 days prior, but not future dates or >7 days prior', () => {
  const today = '2026-11-18';
  assert.strictEqual(isEntryDate('2026-11-18', 'manager', today), true, 'Today allowed');
  assert.strictEqual(isEntryDate('2026-11-11', 'manager', today), true, '7 days ago allowed');
  assert.strictEqual(isEntryDate('2026-11-10', 'manager', today), false, '8 days ago blocked');
  assert.strictEqual(isEntryDate('2026-11-20', 'manager', today), false, 'Future blocked');
});

test('Admin and HR roles can enter past dates without limit, but cannot enter future dates', () => {
  const today = '2026-11-18';
  assert.strictEqual(isEntryDate('2026-01-01', 'admin', today), true, 'Past allowed for admin');
  assert.strictEqual(isEntryDate('2026-01-01', 'hr', today), true, 'Past allowed for hr');
  assert.strictEqual(isEntryDate('2026-11-19', 'admin', today), false, 'Future blocked for admin');
});

test('canAccessModule enforces role boundaries correctly', () => {
  assert.strictEqual(canAccessModule('security', 'security'), true);
  assert.strictEqual(canAccessModule('security', 'main-gate'), true);
  assert.strictEqual(canAccessModule('security', 'hr'), false);
  assert.strictEqual(canAccessModule('security', 'master'), false);

  assert.strictEqual(canAccessModule('admin', 'security'), true);
  assert.strictEqual(canAccessModule('admin', 'master'), true);
  assert.strictEqual(canAccessModule('admin', 'hr'), true);
});
