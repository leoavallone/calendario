import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { User } from "../models/User.js";
import { createFixedExpenseSchema } from "../schemas/FixedExpenseSchema.js";

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

export const createFixedExpenseRouter = (io) => {
  const router = express.Router();

  router.get("/fixed-expenses", verifyToken, async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId obrigatório" });
      const user = await ensureUserInOrganization(req, res, userId);
      if (!user) return;

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
        const user = await ensureUserInOrganization(req, res, req.body.userId);
        if (!user) return;

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
      const fx = await FixedExpense.findById(req.params.id);
      if (!fx) return res.status(404).json({ error: "Não encontrado" });

      const user = await ensureUserInOrganization(req, res, fx.userId);
      if (!user) return;

      await FixedExpense.findByIdAndDelete(req.params.id);

      io.emit("refreshData");
      return res.json({ message: "Removido com sucesso" });
    } catch (err) {
      return res.status(500).json({ error: "Erro" });
    }
  });

  return router;
};
