import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { validate } from "../middlewares/validate.js";
import { User } from "../models/User.js";
import { createUserSchema } from "../schemas/userSchema.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";

const RESET_PASSWORD_SCHEMA = z.object({
  email: z.string().email(),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

export const createAuthRouter = () => {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: "Credenciais inválidas" });

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || "roqia_secret_key",
        { expiresIn: "7d" }
      );

      return res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  });

  router.post("/register", validate(createUserSchema), async (req, res) => {
    try {
      const { email, password } = req.body;
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ error: "Usuário já existe com esse email" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userPayload = { ...req.body, password: hashedPassword, role: "barber" };

      if (!userPayload.workSchedule) userPayload.workSchedule = { start: "09:00", end: "18:00" };
      if (!userPayload.interval) userPayload.interval = 30;

      const user = await User.create(userPayload);
      return res.status(201).json(sanitizeUser(user));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  router.post("/reset-password", async (req, res) => {
    try {
      const { email, password } = RESET_PASSWORD_SCHEMA.parse(req.body);

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      user.password = await bcrypt.hash(password, 10);
      await user.save();

      return res.json({ message: "Senha redefinida com sucesso" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Informe um email válido e uma senha com pelo menos 4 caracteres",
        });
      }
      return res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  return router;
};
