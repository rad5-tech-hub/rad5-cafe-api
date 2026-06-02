import bcryptjs from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcryptjs.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(plainPin: string, hashedPin: string): Promise<boolean> {
  return bcryptjs.compare(plainPin, hashedPin);
}
