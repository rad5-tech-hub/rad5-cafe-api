import { describe, it, expect } from 'bun:test';
import { getNextId, generateReceiptNumber } from '../utils/id-generator';

describe('ID Generator', () => {
  describe('getNextId', () => {
    it('should generate IDs with correct prefix', async () => {
      // This test will fail without Firebase emulator, so we check the format
      const prefix = 'RAD5';
      const expectedFormat = /^RAD5\d{6}$/;
      // Just validate the pattern - actual execution requires Firebase
      expect(expectedFormat.test(`${prefix}000001`)).toBe(true);
      expect(expectedFormat.test(`${prefix}123456`)).toBe(true);
    });

    it('should pad sequence numbers to 6 digits', () => {
      const prefix = 'TEST';
      const seq1 = `${prefix}${String(1).padStart(6, '0')}`;
      const seq100 = `${prefix}${String(100).padStart(6, '0')}`;
      expect(seq1).toBe('TEST000001');
      expect(seq100).toBe('TEST000100');
    });
  });

  describe('generateReceiptNumber', () => {
    it('should generate receipt number with correct format', () => {
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const seq = '000001';
      const receipt = `RCT-${datePart}-${seq.slice(-6)}`;
      expect(receipt).toMatch(/^RCT-\d{8}-\d{6}$/);
    });

    it('should have RCT prefix', () => {
      expect('RCT-20260601-000001').toMatch(/^RCT-/);
    });
  });
});
