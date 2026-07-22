import { describe, it, expect } from 'vitest';
import { loginSchema, setupSchema, resetRequestSchema, resetConfirmSchema, createUserSchema, updateUserSchema } from '../src/schemas';

describe('Zod Schema Unit Tests', () => {
  describe('loginSchema', () => {
    it('should validate valid email and password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secretpassword' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
      }
    });

    it('should fail on invalid email format', () => {
      const result = loginSchema.safeParse({ email: 'invalid-email', password: 'secretpassword' });
      expect(result.success).toBe(false);
    });

    it('should fail on missing password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('setupSchema', () => {
    it('should validate valid setup payload', () => {
      const result = setupSchema.safeParse({ email: 'admin@ness.br', password: 'password123', name: 'Admin', setupKey: 'setup-123' });
      expect(result.success).toBe(true);
    });

    it('should allow optional setupKey', () => {
      const result = setupSchema.safeParse({ email: 'admin@ness.br', password: 'password123', name: 'Admin' });
      expect(result.success).toBe(true);
    });

    it('should fail on missing name', () => {
      const result = setupSchema.safeParse({ email: 'admin@ness.br', password: 'password123', name: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('resetRequestSchema & resetConfirmSchema', () => {
    it('should validate password reset request', () => {
      const result = resetRequestSchema.safeParse({ email: 'user@domain.com' });
      expect(result.success).toBe(true);
    });

    it('should validate reset confirm with token and new password', () => {
      const result = resetConfirmSchema.safeParse({ token: '123456', newPassword: 'newPassword123' });
      expect(result.success).toBe(true);
    });

    it('should fail reset confirm when token is empty', () => {
      const result = resetConfirmSchema.safeParse({ token: '', newPassword: 'newPassword123' });
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema & updateUserSchema', () => {
    it('should validate complete user creation payload', () => {
      const result = createUserSchema.safeParse({
        email: 'consultant@ness.br',
        password: 'Password123!',
        name: 'Consultor GRC',
        role: 'consultor',
        client_project_id: 'proj_123'
      });
      expect(result.success).toBe(true);
    });

    it('should allow null client_project_id', () => {
      const result = createUserSchema.safeParse({
        email: 'admin@ness.br',
        password: 'Password123!',
        name: 'Admin',
        role: 'platform_admin',
        client_project_id: null
      });
      expect(result.success).toBe(true);
    });

    it('should validate partial user updates', () => {
      const result = updateUserSchema.safeParse({
        name: 'Updated Name',
        role: 'org_admin'
      });
      expect(result.success).toBe(true);
    });
  });
});
