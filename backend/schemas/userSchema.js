import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  workDays: z.object({
    monday: z.boolean(),
    tuesday: z.boolean(),
    wednesday: z.boolean(),
    thursday: z.boolean(),
    friday: z.boolean(),
    saturday: z.boolean(),
    sunday: z.boolean(),
  }),
  workSchedule: z.object({
    start: z.string(),
    end: z.string(),
  }),
  interval: z.number().optional(),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
  role: z.enum(['owner', 'barber']).default('barber')
});