import { z } from 'zod';
import { CATEGORIES } from '@/domain/diagnosis/schema';
import { FEEDBACK_REASONS } from '@/domain/diagnosis/types';
import { isValidDateInput } from '@/utils/format';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximum ${max} characters`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const diagnosisDetailsFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, 'Describe the problem in at least 10 characters')
    .max(2000, 'Description is too long'),
  brand: optionalTrimmed(80),
  model: optionalTrimmed(80),
  errorCode: optionalTrimmed(40),
  ageYears: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (/^\d{1,3}$/.test(value) && Number(value) <= 100), {
      message: 'Enter an age between 0 and 100',
    })
    .transform((value) => (value ? Number(value) : null)),
});

export type DiagnosisDetailsForm = z.input<typeof diagnosisDetailsFormSchema>;
export type DiagnosisDetailsValues = z.output<typeof diagnosisDetailsFormSchema>;

export const diagnosisCategorySchema = z.enum(CATEGORIES);

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Enter your name').max(80),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const maintenanceFormSchema = z.object({
  itemDescription: z.string().trim().min(2, 'Describe the item').max(160),
  taskDescription: z.string().trim().min(3, 'Describe the task').max(500),
  frequency: z.enum(['once', 'weekly', 'monthly', 'quarterly', 'biannual', 'yearly']),
  nextDueDate: z.string().refine(isValidDateInput, 'Use the format YYYY-MM-DD'),
  reminderEnabled: z.boolean(),
  notes: optionalTrimmed(1000),
});

export type MaintenanceFormValues = z.input<typeof maintenanceFormSchema>;

export const quoteFormSchema = z.object({
  label: z.string().trim().min(2, 'Give this quote a name').max(120),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
      message: 'Enter a valid amount',
    })
    .transform(Number),
  type: z.enum(['repair', 'replacement']),
  includesParts: z.boolean(),
  includesLabor: z.boolean(),
  notes: optionalTrimmed(500),
});

export const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reason: z.enum(FEEDBACK_REASONS).nullable(),
  comment: optionalTrimmed(1000),
});

export const supportFormSchema = z.object({
  category: z.enum(['bug', 'diagnosis', 'privacy', 'billing', 'other']),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : null)),
  message: z.string().trim().min(10, 'Describe your request in at least 10 characters').max(2000),
});

export const diagnosisDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Add a short description')
  .max(300);
