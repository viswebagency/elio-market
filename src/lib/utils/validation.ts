/**
 * Shared Zod validation schemas.
 */

import { z } from 'zod';

/** Email schema */
export const emailSchema = z.string().email('Email non valida');

/** Password schema */
export const passwordSchema = z
  .string()
  .min(8, 'Almeno 8 caratteri')
  .regex(/[A-Z]/, 'Almeno una lettera maiuscola')
  .regex(/[a-z]/, 'Almeno una lettera minuscola')
  .regex(/[0-9]/, 'Almeno un numero')
  .regex(/[^A-Za-z0-9]/, 'Almeno un carattere speciale');

/** Strategy name schema */
export const strategyNameSchema = z
  .string()
  .min(3, 'Almeno 3 caratteri')
  .max(50, 'Massimo 50 caratteri');

/** Symbol schema (area prefix + id) */
export const symbolSchema = z
  .string()
  .regex(/^(PM|BF|STK|FX|CRY):/, 'Formato simbolo non valido');

/** Amount schema (positive number) */
export const positiveAmountSchema = z
  .number()
  .positive('Deve essere un numero positivo');

/** Percentage schema (0-100) */
export const percentageSchema = z
  .number()
  .min(0, 'Minimo 0%')
  .max(100, 'Massimo 100%');

/** Market area schema */
export const marketAreaSchema = z.enum([
  'prediction',
  'exchange_betting',
  'stocks',
  'forex',
  'crypto',
]);

/** Onboarding step 1 schema */
export const onboardingStep1Schema = z.object({
  displayName: z.string().min(2).max(50),
  country: z.string().length(2),
  currency: z.enum(['EUR', 'USD', 'GBP', 'USDC', 'USDT']),
});

/** Onboarding step 3 schema */
export const onboardingStep3Schema = z.object({
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']),
  initialCapital: positiveAmountSchema,
  maxAcceptableLoss: percentageSchema,
});

/** Trade creation schema */
export const createTradeSchema = z.object({
  symbol: symbolSchema,
  direction: z.enum(['long', 'short']),
  orderType: z.enum(['market', 'limit', 'stop', 'stop_limit']),
  size: positiveAmountSchema,
  limitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});
