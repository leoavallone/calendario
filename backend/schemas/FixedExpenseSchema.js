import { z } from "zod";

export const createFixedExpenseSchema = z.object({
  userId: z.string(),
  description: z.string().min(2, "Descrição deve ter no mínimo 2 caracteres"),
  amount: z.number().positive("Valor deve ser positivo"),
  dayOfMonth: z.number().min(1).max(31),
});
