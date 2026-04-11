import { z } from 'zod';

export const callUploadSchema = z.object({
    phone_number: z.string().min(1, 'Phone number is required'),
    classification: z.enum(['INBOUND', 'OUTBOUND']).optional().default('OUTBOUND'),
    duration: z.number({ coerce: true }).optional(),
});

export const callSubmitSchema = z.object({
    edited_data: z.object({
        intent: z.string().optional(),
        role: z.string().optional(),
        propertyType: z.string().optional(),
        bhk: z.string().optional(),
        location: z.string().optional(),
        budgetMin: z.number({ coerce: true }).optional(),
        budgetMax: z.number({ coerce: true }).optional(),
        urgency: z.string().optional(),
        followUpDate: z.string().optional(),
        summary: z.string().optional(),
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
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().min(1, 'Phone number is required'),
    email: z.string().email().optional().or(z.literal('')),
    companyName: z.string().max(200).optional(),
});

export const closeDealSchema = z.object({
    dealValue: z.number({ coerce: true }).positive('Deal value must be positive'),
});
