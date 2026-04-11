import { z } from 'zod';

export const loginSchema = z.object({
    phone: z.string().min(10, 'Phone number is required'),
    password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['super_boss', 'manager', 'employee']),
    reports_to_id: z.string().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const setupSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
    phone: z.string().min(10, 'Phone number required'),
});

export const resetPasswordOtpSchema = z.object({
    phone: z.string().min(10, 'Phone number required'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const setupPasswordSchema = z.object({
    token: z.string().min(1, 'Setup token is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});
