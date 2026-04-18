import { z } from "zod";

export const createAppointmentSchema = z.object({
  userId: z.string(),
  title: z.string().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  description: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  userId: z.string(),
  title: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  description: z.string().optional(),
});