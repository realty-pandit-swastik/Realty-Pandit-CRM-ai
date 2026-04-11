import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, setupSchema } from '../validators/auth.validator';
import { contactSchema, newsletterSchema, scheduleVisitSchema, postPropertySchema } from '../validators/public.validator';
import { callSubmitSchema, agentLoginOtpSchema } from '../validators/calls.validator';

describe('Auth Validators', () => {
    describe('loginSchema', () => {
        it('accepts valid login', () => {
            const result = loginSchema.safeParse({ email: 'test@example.com', password: 'pass123' });
            expect(result.success).toBe(true);
        });

        it('rejects missing email', () => {
            const result = loginSchema.safeParse({ password: 'pass123' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid email', () => {
            const result = loginSchema.safeParse({ email: 'not-an-email', password: 'pass123' });
            expect(result.success).toBe(false);
        });

        it('rejects empty password', () => {
            const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
            expect(result.success).toBe(false);
        });
    });

    describe('registerSchema', () => {
        it('accepts valid registration', () => {
            const result = registerSchema.safeParse({
                name: 'John Doe', email: 'john@example.com',
                password: 'secure123', role: 'employee'
            });
            expect(result.success).toBe(true);
        });

        it('rejects invalid role', () => {
            const result = registerSchema.safeParse({
                name: 'John Doe', email: 'john@example.com',
                password: 'secure123', role: 'admin'
            });
            expect(result.success).toBe(false);
        });

        it('rejects short password', () => {
            const result = registerSchema.safeParse({
                name: 'John Doe', email: 'john@example.com',
                password: '123', role: 'employee'
            });
            expect(result.success).toBe(false);
        });
    });

    describe('setupSchema', () => {
        it('accepts valid setup', () => {
            const result = setupSchema.safeParse({
                name: 'Admin', email: 'admin@example.com', password: 'admin123'
            });
            expect(result.success).toBe(true);
        });
    });
});

describe('Public Validators', () => {
    describe('contactSchema', () => {
        it('accepts valid contact', () => {
            const result = contactSchema.safeParse({ name: 'Raj', phone: '+919876543210' });
            expect(result.success).toBe(true);
        });

        it('rejects invalid phone', () => {
            const result = contactSchema.safeParse({ name: 'Raj', phone: '123' });
            expect(result.success).toBe(false);
        });

        it('accepts with optional fields', () => {
            const result = contactSchema.safeParse({
                name: 'Raj', phone: '+919876543210',
                email: 'raj@test.com', message: 'Hello', intent: 'buy'
            });
            expect(result.success).toBe(true);
        });
    });

    describe('newsletterSchema', () => {
        it('accepts valid email', () => {
            const result = newsletterSchema.safeParse({ email: 'test@example.com' });
            expect(result.success).toBe(true);
        });

        it('rejects invalid email', () => {
            const result = newsletterSchema.safeParse({ email: 'not-email' });
            expect(result.success).toBe(false);
        });
    });

    describe('scheduleVisitSchema', () => {
        it('accepts valid visit', () => {
            const result = scheduleVisitSchema.safeParse({
                property_id: 'prop-123', name: 'Priya', phone: '+919876543210'
            });
            expect(result.success).toBe(true);
        });

        it('rejects missing property_id', () => {
            const result = scheduleVisitSchema.safeParse({ name: 'Priya', phone: '+919876543210' });
            expect(result.success).toBe(false);
        });
    });

    describe('postPropertySchema', () => {
        it('accepts valid property', () => {
            const result = postPropertySchema.safeParse({
                intent: 'sell', location: 'Noida Sector 150',
                price: 5000000, phone: '+919876543210'
            });
            expect(result.success).toBe(true);
        });

        it('coerces string price to number', () => {
            const result = postPropertySchema.safeParse({
                intent: 'sell', location: 'Noida', price: '50', phone: '+919876543210'
            });
            expect(result.success).toBe(true);
            if (result.success) expect(result.data.price).toBe(50);
        });

        it('rejects negative price', () => {
            const result = postPropertySchema.safeParse({
                intent: 'sell', location: 'Noida', price: -100, phone: '+919876543210'
            });
            expect(result.success).toBe(false);
        });
    });
});

describe('Call Validators', () => {
    describe('callSubmitSchema', () => {
        it('accepts empty body', () => {
            const result = callSubmitSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('accepts with edited_data', () => {
            const result = callSubmitSchema.safeParse({
                edited_data: { intent: 'BUY', location: 'Noida', budgetMin: 5000000 }
            });
            expect(result.success).toBe(true);
        });
    });

    describe('agentLoginOtpSchema', () => {
        it('accepts valid phone', () => {
            const result = agentLoginOtpSchema.safeParse({ phone: '+919876543210' });
            expect(result.success).toBe(true);
        });

        it('rejects empty phone', () => {
            const result = agentLoginOtpSchema.safeParse({ phone: '' });
            expect(result.success).toBe(false);
        });
    });
});
