import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const reportSchema = z.object({
  reportedUserId: z.string().min(1, 'Reported user ID is required'),
  reason: z.enum([
    'nudity_or_sexual_content',
    'harassment_or_hate_speech',
    'violence_or_threats',
    'spam_or_bot',
    'underage_user',
    'other',
  ]),
  notes: z.string().max(500).optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
