import { describe, it, expect } from 'bun:test';
import { hashPin, verifyPin } from '../utils/pin-hash';

describe('PIN Hashing', () => {
  it('should hash a PIN correctly', async () => {
    const pin = '1234';
    const hashed = await hashPin(pin);
    expect(hashed).toBeTruthy();
    expect(hashed).not.toBe(pin);
    expect(hashed.startsWith('$2')).toBe(true);
  });

  it('should verify correct PIN', async () => {
    const pin = '5678';
    const hashed = await hashPin(pin);
    const isValid = await verifyPin(pin, hashed);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect PIN', async () => {
    const pin = '1234';
    const hashed = await hashPin(pin);
    const isValid = await verifyPin('5678', hashed);
    expect(isValid).toBe(false);
  });

  it('should handle different valid 4-digit PINs', async () => {
    const pin = '4829';
    const hashed = await hashPin(pin);
    const isValid = await verifyPin(pin, hashed);
    expect(isValid).toBe(true);
  });
});
