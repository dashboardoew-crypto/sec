import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const registersFile = path.resolve('artifacts/api-server/src/data/registers.ts');

test('registers.ts file exists and defines all required registers', () => {
  assert.ok(fs.existsSync(registersFile), 'registers.ts must exist');
  const content = fs.readFileSync(registersFile, 'utf8');

  // Verify camera breakdown register exists
  assert.ok(content.includes('"camera-breakdown"'), 'Must define camera-breakdown register');
  assert.ok(content.includes('camera_location'), 'Must define camera_location field');
  assert.ok(content.includes('issue'), 'Must define issue field');

  // Verify key movement and key master
  assert.ok(content.includes('"key-movement"'), 'Must define key-movement register');
  assert.ok(content.includes('"key-master"'), 'Must define key-master register');

  // Verify labour master and training register
  assert.ok(content.includes('"daily-attendance"'), 'Must define daily-attendance (Training) register');
  assert.ok(content.includes('"labour-master"'), 'Must define labour-master register');
  assert.ok(content.includes('is_closed'), 'Must define is_closed field');
  assert.ok(content.includes('closed_at'), 'Must define closed_at field');
});

test('Backend operations routes define required endpoint handlers', () => {
  const operationsFile = path.resolve('artifacts/api-server/src/routes/operations.ts');
  assert.ok(fs.existsSync(operationsFile), 'operations.ts must exist');
  const content = fs.readFileSync(operationsFile, 'utf8');

  // Labour endpoints
  assert.ok(content.includes('/labour/employees'), 'Must have /labour/employees endpoint');
  assert.ok(content.includes('/labour/employees/:id/toggle-close'), 'Must have toggle-close endpoint');

  // Key location endpoint
  assert.ok(content.includes('/keys/locations'), 'Must have /keys/locations endpoint');
});
