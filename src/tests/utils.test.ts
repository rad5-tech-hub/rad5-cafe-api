import { describe, it, expect } from 'bun:test';
import { generateReference, calculateProfit, paginate, sanitizeUserData } from '../utils/helpers';
import { validateEmail, validatePhoneNumber, validatePin, validatePassword, validateAmount } from '../utils/validators';

describe('Helper Utilities', () => {
  describe('generateReference', () => {
    it('should generate a reference string', () => {
      const ref = generateReference('TXN');
      expect(ref).toBeTruthy();
      expect(ref.startsWith('TXN-')).toBe(true);
    });

    it('should generate unique references', () => {
      const ref1 = generateReference();
      const ref2 = generateReference();
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('calculateProfit', () => {
    it('should calculate profit correctly', () => {
      expect(calculateProfit(100, 150)).toBe(50);
    });

    it('should return negative for loss', () => {
      expect(calculateProfit(150, 100)).toBe(-50);
    });

    it('should return zero for break-even', () => {
      expect(calculateProfit(100, 100)).toBe(0);
    });
  });

  describe('paginate', () => {
    it('should return default values for no input', () => {
      const result = paginate();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should respect maximum limit', () => {
      const result = paginate(1, 200);
      expect(result.limit).toBe(100);
    });

    it('should handle page 0 gracefully', () => {
      const result = paginate(0, 10);
      expect(result.page).toBe(1);
    });
  });

  describe('sanitizeUserData', () => {
    it('should remove password and pin fields', () => {
      const data = { name: 'Test', password: 'secret', pin: '1234', email: 'test@test.com' };
      const sanitized = sanitizeUserData(data);
      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).not.toHaveProperty('pin');
      expect(sanitized).toHaveProperty('name');
      expect(sanitized).toHaveProperty('email');
    });
  });
});

describe('Validators', () => {
  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('not-an-email')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should accept valid phone numbers', () => {
      expect(validatePhoneNumber('+2348012345678')).toBe(true);
      expect(validatePhoneNumber('08012345678')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhoneNumber('123')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });
  });

  describe('validatePin', () => {
    it('should accept 4-digit PIN', () => {
      expect(validatePin('1234')).toBe(true);
      expect(validatePin('0000')).toBe(true);
    });

    it('should reject non-4-digit PIN', () => {
      expect(validatePin('12345')).toBe(false);
      expect(validatePin('abc')).toBe(false);
      expect(validatePin('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should accept strong passwords', () => {
      const result = validatePassword('StrongP1ss');
      expect(result.valid).toBe(true);
    });

    it('should reject short passwords', () => {
      const result = validatePassword('Ab1');
      expect(result.valid).toBe(false);
    });

    it('should reject passwords without uppercase', () => {
      const result = validatePassword('weakpass1');
      expect(result.valid).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      const result = validatePassword('WeakPass');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should accept positive amounts', () => {
      expect(validateAmount(100)).toBe(true);
      expect(validateAmount(0.01)).toBe(true);
    });

    it('should reject zero and negative amounts', () => {
      expect(validateAmount(0)).toBe(false);
      expect(validateAmount(-100)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(validateAmount(NaN)).toBe(false);
      expect(validateAmount(Infinity)).toBe(false);
    });
  });
});
