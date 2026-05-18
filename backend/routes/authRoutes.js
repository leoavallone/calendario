import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { z } from "zod";
import { validate } from "../middlewares/validate.js";
import { User } from "../models/User.js";
import { createUserSchema } from "../schemas/userSchema.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";

const FORGOT_PASSWORD_SCHEMA = z.object({
  email: z.string().email(),
});

const RESET_PASSWORD_SCHEMA = z.object({
  token: z.string().min(20, "Token inválido"),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

const CHANGE_PASSWORD_SCHEMA = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1, "Senha atual obrigatória"),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

const RESET_TOKEN_TTL_MINUTES = 30;

const hashResetToken = (token) => crypto
  .createHash("sha256")
  .update(token)
  .digest("hex");

const getAppBaseUrl = (req) => (
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_URL ||
  `${req.protocol}://${req.get("host")}`
).replace(/\/$/, "");

const sendResetPasswordEmail = async ({ to, resetUrl }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESET_PASSWORD_FROM || process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Serviço de email não configurado");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Redefinição de senha - OneFlow",
      html: `
        <p>Recebemos uma solicitação para redefinir sua senha no OneFlow.</p>
        <p>Use o link abaixo para criar uma nova senha. Ele expira em ${RESET_TOKEN_TTL_MINUTES} minutos.</p>
        <p><a href="${resetUrl}">Redefinir senha</a></p>
        <p>Se você não solicitou essa alteração, ignore este email.</p>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao enviar email: ${text}`);
  }
};

export const createAuthRouter = () => {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: "Credenciais inválidas" });

      if (!user.organizationId) {
        user.organizationId = String(user._id);
        await user.save();
      }

      const token = jwt.sign(
        { id: user._id, role: user.role, organizationId: user.organizationId },
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
      user.organizationId = String(user._id);
      await user.save();

      return res.status(201).json(sanitizeUser(user));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  router.post("/forgot-password", async (req, res) => {
    try {
      const { email } = FORGOT_PASSWORD_SCHEMA.parse(req.body);

      const user = await User.findOne({ email });
      const genericMessage = "Se esse email existir, enviaremos instruções para redefinir a senha.";
      if (!user) return res.json({ message: genericMessage });

      const resetToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetToken = hashResetToken(resetToken);
      user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await user.save();

      const resetUrl = `${getAppBaseUrl(req)}/recuperar-senha?token=${resetToken}`;
      await sendResetPasswordEmail({ to: user.email, resetUrl });

      return res.json({ message: genericMessage });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Informe um email válido" });
      }
      console.error(err);
      return res.status(500).json({ error: "Erro ao solicitar redefinição de senha" });
    }
  });

  router.post("/reset-password", async (req, res) => {
    try {
      const { token, password } = RESET_PASSWORD_SCHEMA.parse(req.body);
      const passwordResetToken = hashResetToken(token);

      const user = await User.findOne({
        passwordResetToken,
        passwordResetExpires: { $gt: new Date() },
      });
      if (!user) return res.status(400).json({ error: "Token inválido ou expirado" });

      user.password = await bcrypt.hash(password, 10);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      return res.json({ message: "Senha redefinida com sucesso" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Informe um token válido e uma nova senha com pelo menos 4 caracteres",
        });
      }
      return res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  router.post("/change-password", async (req, res) => {
    try {
      const { email, currentPassword, password } = CHANGE_PASSWORD_SCHEMA.parse(req.body);

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(401).json({ error: "Senha atual inválida" });

      user.password = await bcrypt.hash(password, 10);
      await user.save();

      return res.json({ message: "Senha redefinida com sucesso" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Informe um email válido, a senha atual e uma nova senha com pelo menos 4 caracteres",
        });
      }
      return res.status(500).json({ error: "Erro ao redefinir senha" });
    }
  });

  return router;
};
