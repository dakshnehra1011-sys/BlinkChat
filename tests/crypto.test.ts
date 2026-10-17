import { describe, expect, it } from 'vitest';
import {
  generateRandomToken,
  hashPassword,
  sha256,
  signJWT,
  verifyJWT,
  verifyPassword,
} from '../apps/worker/src/utils/crypto.js';

describe('WebCrypto Utilities Suite', () => {
  const secret = 'super-secret-jwt-signing-key-for-tests-12345';

  describe('Password Hashing (PBKDF2-SHA256)', () => {
    it('hashes and verifies a password correctly', async () => {
      const password = 'mySecretPassword99!';
      const hash = await hashPassword(password);

      expect(hash).toContain('pbkdf2_sha256$100000$');

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('wrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('rejects tampered password hash', async () => {
      const isValid = await verifyPassword('pass', 'pbkdf2_sha256$100000$fake$fake');
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Session Signing & Verification', () => {
    it('signs and verifies a valid JWT payload', async () => {
      const payload = {
        userId: 'usr-456',
        email: 'alice@blinkchat.io',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = await signJWT(payload, secret);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = await verifyJWT(token, secret);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(payload.userId);
      expect(verified?.email).toBe(payload.email);
    });

    it('rejects tokens signed with a different secret', async () => {
      const payload = {
        userId: 'usr-456',
        email: 'alice@blinkchat.io',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = await signJWT(payload, secret);
      const verified = await verifyJWT(token, 'different-wrong-secret');
      expect(verified).toBeNull();
    });

    it('rejects expired tokens', async () => {
      const payload = {
        userId: 'usr-456',
        email: 'alice@blinkchat.io',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const token = await signJWT(payload, secret);
      const verified = await verifyJWT(token, secret);
      expect(verified).toBeNull();
    });

    it('rejects malformed token strings and invalid parts count', async () => {
      expect(await verifyJWT('not-a-token', secret)).toBeNull();
      expect(await verifyJWT('only.two.parts.extra', secret)).toBeNull();
      expect(await verifyJWT('inv@lid.b@se64.sign@ture', secret)).toBeNull();
    });
  });

  describe('Password Hashing Edge Cases', () => {
    it('returns false for malformed password hash string', async () => {
      expect(await verifyPassword('test', 'not_pbkdf2_format')).toBe(false);
      expect(await verifyPassword('test', 'pbkdf2_sha256$baditer$salt$hash')).toBe(false);
    });
  });

  describe('Random Tokens & Hashes', () => {
    it('generates random opaque tokens', () => {
      const token1 = generateRandomToken(32);
      const token2 = generateRandomToken(32);
      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(20);
    });

    it('computes sha256 hash deterministically', async () => {
      const hash1 = await sha256('test-token');
      const hash2 = await sha256('test-token');
      expect(hash1).toBe(hash2);
    });
  });
});
