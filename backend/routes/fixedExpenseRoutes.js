import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { createFixedExpenseSchema } from "../schemas/FixedExpenseSchema.js";

export const createFixedExpenseRouter = (io) => {
  const router = express.Router();

  router.get("/fixed-expenses", verifyToken, async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId obrigatório" });

      const expenses = await FixedExpense.find({ userId });
      return res.json(expenses);
    } catch (err) {
      return res.status(500).json({ error: "Erro" });
    }
  });

  router.post(
    "/fixed-expenses",
    verifyToken,
    validate(createFixedExpenseSchema),
    async (req, res) => {
      try {
        const fx = new FixedExpense(req.body);
        await fx.save();

        io.emit("refreshData");
        return res.status(201).json(fx);
      } catch (err) {
        return res.status(500).json({ error: "Erro" });
      }
    }
  );

  router.delete("/fixed-expenses/:id", verifyToken, async (req, res) => {
    try {
      const fx = await FixedExpense.findByIdAndDelete(req.params.id);
      if (!fx) return res.status(404).json({ error: "Não encontrado" });

      io.emit("refreshData");
      return res.json({ message: "Removido com sucesso" });
    } catch (err) {
      return res.status(500).json({ error: "Erro" });
    }
  });

  return router;
};
