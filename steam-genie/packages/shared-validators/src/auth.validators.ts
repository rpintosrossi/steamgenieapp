import { z } from 'zod';

export const loginSchema = z.object({
  dni: z
    .string()
    .min(1, 'DNI is required')
    .max(20, 'DNI too long')
    .regex(/^\d+$/, 'DNI must contain only digits'),
  password: z.string().min(1, 'Password is required').max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
