import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { Transaction } from "../models/Transaction.js";
import { createTransactionSchema } from "../schemas/TransactionSchema.js";

export const createTransactionRouter = (io) => {
  const router = express.Router();

  router.get("/transactions", verifyToken, async (req, res) => {
    try {
      const { userId, month, year } = req.query;
      if (!userId) return res.status(400).json({ error: "userId é obrigatório" });

      let transactions = await Transaction.find({ userId }).sort({ date: -1, createdAt: -1 });

      if (month && year) {
        const fixed = await FixedExpense.find({ userId });
        for (const fx of fixed) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(fx.dayOfMonth).padStart(2, "0")}`;
          const prefix = `${year}-${String(month).padStart(2, "0")}`;
          const exists = transactions.some((t) => (
            t.fixedExpenseId && t.fixedExpenseId === String(fx._id) && t.date.startsWith(prefix)
          ));

          if (!exists) {
            const newTx = new Transaction({
              userId,
              type: "expense",
              amount: fx.amount,
              description: fx.description,
              date: dateStr,
              fixedExpenseId: String(fx._id),
            });
            await newTx.save();
            transactions.push(newTx);
          }
        }

        transactions.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          if (dateB.getTime() !== dateA.getTime()) return dateB.getTime() - dateA.getTime();
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      }

      return res.json(transactions);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar transações" });
    }
  });

  router.post(
    "/transactions",
    verifyToken,
    validate(createTransactionSchema),
    async (req, res) => {
      try {
        const transaction = new Transaction(req.body);
        await transaction.save();

        io.emit("refreshData");
        return res.status(201).json(transaction);
      } catch (err) {
        return res.status(500).json({ error: "Erro ao criar transação" });
      }
    }
  );

  router.put(
    "/transactions/:id",
    verifyToken,
    validate(createTransactionSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        const transaction = await Transaction.findByIdAndUpdate(id, req.body, { new: true });

        if (!transaction) return res.status(404).json({ error: "Transação não encontrada" });

        io.emit("refreshData");
        return res.json(transaction);
      } catch (err) {
        return res.status(500).json({ error: "Erro ao atualizar transação" });
      }
    }
  );

  router.delete("/transactions/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const transaction = await Transaction.findByIdAndDelete(id);
      if (!transaction) return res.status(404).json({ error: "Transação não encontrada" });

      io.emit("refreshData");
      return res.json({ message: "Transação removida com sucesso" });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao deletar transação" });
    }
  });

  return router;
};
