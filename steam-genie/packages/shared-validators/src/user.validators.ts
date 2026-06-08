import { z } from 'zod';

export const createUserSchema = z.object({
  dni: z
    .string()
    .min(1)
    .max(20)
    .regex(/^\d+$/, 'DNI must contain only digits'),
  fullName: z.string().min(1).max(200),
  birthDate: z.string().datetime().optional(),
  primaryRole: z.enum(['admin', 'manager', 'cleaner', 'client', 'provider']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
