import { z } from "zod";

export const createTransactionSchema = z.object({
  userId: z.string(),
  type: z.enum(["income", "expense"], { errorMap: () => ({ message: "Tipo deve ser 'income' ou 'expense'" }) }),
  amount: z.number().positive("Valor deve ser positivo"),
  description: z.string().min(2, "Descrição deve ter no mínimo 2 caracteres"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
});
