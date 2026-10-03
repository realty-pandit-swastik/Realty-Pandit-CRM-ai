import { z } from 'zod';

export const callUploadSchema = z.object({
    phone_number: z.string().min(1, 'Phone number is required'),
    classification: z.enum(['INBOUND', 'OUTBOUND']).optional().default('OUTBOUND'),
    duration: z.number({ coerce: true }).optional(),
});

export const callSubmitSchema = z.object({
    edited_data: z.object({
        intent: z.enum(['BUY', 'RENT', 'SELL', 'LEASE', 'OTHER']).nullable().optional(),
        role: z.enum(['BUYER', 'TENANT', 'LANDLORD', 'UNKNOWN']).nullable().optional(),
        propertyType: z.string().max(100).nullable().optional(),
        bhk: z.string().max(20).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        budgetMin: z.coerce.number().nonnegative().finite().nullable().optional(),
        budgetMax: z.coerce.number().nonnegative().finite().nullable().optional(),
        urgency: z.string().max(50).optional(),
        followUpDate: z.string().max(20).optional(),
        summary: z.string().max(5000).nullable().optional(),
    }).optional(),
});

export const agentLoginOtpSchema = z.object({
    phone: z.string().min(1, 'Phone number is required'),
});

export const agentVerifyOtpSchema = z.object({
    phone: z.string().min(1, 'Phone number is required'),
    otp: z.string().min(1, 'OTP is required'),
});

export const agentRegisterSchema = z.object({
    // 2026-07-29: hardened after bot spam stored random alphanumeric as name/phone.
    name: z.string().trim().min(2, 'Enter a valid name').max(100)
        .regex(/\p{L}/u, 'Enter a valid name'), // must contain at least one letter (allows Devanagari)
    phone: z.string().trim()
        .regex(/^(?:\+?91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
    email: z.string().email().optional().or(z.literal('')),
    companyName: z.string().max(200).optional(),
    website: z.string().max(0).optional(), // honeypot — real users leave this empty; bots fill it
});

export const closeDealSchema = z.object({
    dealValue: z.number({ coerce: true }).positive('Deal value must be positive'),
});
