import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { createTransactionSchema } from "../schemas/TransactionSchema.js";

const getUserOrganizationId = (user) => user?.organizationId || String(user?._id || "");

const getAuthenticatedUser = async (req) => {
  const user = await User.findById(req.userId);
  if (!user) return null;

  if (!user.organizationId) {
    user.organizationId = String(user._id);
    await user.save();
  }

  return user;
};

const ensureUserInOrganization = async (req, res, userId) => {
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return null;
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return null;
  }

  if (getUserOrganizationId(targetUser) !== getUserOrganizationId(authUser)) {
    res.status(403).json({ error: "Usuário fora da sua organização" });
    return null;
  }

  return targetUser;
};

export const createTransactionRouter = (io) => {
  const router = express.Router();

  router.get("/transactions", verifyToken, async (req, res) => {
    try {
      const { userId, month, year } = req.query;
      if (!userId) return res.status(400).json({ error: "userId é obrigatório" });
      const user = await ensureUserInOrganization(req, res, userId);
      if (!user) return;

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
        const user = await ensureUserInOrganization(req, res, req.body.userId);
        if (!user) return;

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
        const currentTransaction = await Transaction.findById(id);
        if (!currentTransaction) return res.status(404).json({ error: "Transação não encontrada" });

        const currentUser = await ensureUserInOrganization(req, res, currentTransaction.userId);
        if (!currentUser) return;

        const nextUser = await ensureUserInOrganization(req, res, req.body.userId);
        if (!nextUser) return;

        const transaction = await Transaction.findByIdAndUpdate(id, req.body, { new: true });

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
      const currentTransaction = await Transaction.findById(id);
      if (!currentTransaction) return res.status(404).json({ error: "Transação não encontrada" });

      const user = await ensureUserInOrganization(req, res, currentTransaction.userId);
      if (!user) return;

      await Transaction.findByIdAndDelete(id);

      io.emit("refreshData");
      return res.json({ message: "Transação removida com sucesso" });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao deletar transação" });
    }
  });

  return router;
};
