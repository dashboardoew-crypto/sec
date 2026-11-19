import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const passwordHash = (password) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
};

const verifyPassword = (password, stored) => {
  const [algorithm, salt, encodedHash] = String(stored ?? '').split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

test('Password hashing generates valid salted scrypt hash format', () => {
  const hash = passwordHash('admin123');
  assert.ok(hash.startsWith('scrypt$'), 'Must start with scrypt$');
  const parts = hash.split('$');
  assert.strictEqual(parts.length, 3, 'Must contain algorithm, salt, and hash');
  assert.strictEqual(parts[1].length, 32, 'Salt must be 16 bytes hex (32 characters)');
  assert.strictEqual(parts[2].length, 128, 'Hash must be 64 bytes hex (128 characters)');
});

test('Password verification succeeds with correct password and fails with incorrect password', () => {
  const plain = 'SecretSecurePassword2026!';
  const hash = passwordHash(plain);

  assert.strictEqual(verifyPassword(plain, hash), true, 'Correct password must verify');
  assert.strictEqual(verifyPassword('WrongPassword', hash), false, 'Incorrect password must fail');
  assert.strictEqual(verifyPassword('', hash), false, 'Empty password must fail');
  assert.strictEqual(verifyPassword(plain, 'malformed_hash'), false, 'Corrupted hash must fail cleanly');
});
