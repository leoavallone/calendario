import express from "express";
import bcrypt from "bcryptjs";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { User } from "../models/User.js";
import { createUserSchema } from "../schemas/userSchema.js";
import { TIME_RE, timeToMinutes } from "../utils/schedule.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";

export const createUserRouter = (io) => {
  const router = express.Router();

  router.get("/users", verifyToken, async (req, res) => {
    try {
      const users = await User.find().select("-password");
      return res.json(users);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar usuários" });
    }
  });

  router.post("/users", verifyToken, validate(createUserSchema), async (req, res) => {
    try {
      if (req.userRole !== "owner") {
        return res.status(403).json({ error: "Apenas donos podem criar usuários por esta rota" });
      }

      const { email, password } = req.body;
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ error: "Usuário já existe com esse email" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({ ...req.body, password: hashedPassword });

      return res.status(201).json(sanitizeUser(user));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  router.put("/users/:id/work-days", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { blockedDates, extraWorkDates, workDays, workSchedule, interval } = req.body;

      const update = {};
      if (blockedDates !== undefined) update.blockedDates = blockedDates;
      if (extraWorkDates !== undefined) update.extraWorkDates = extraWorkDates;
      if (workDays !== undefined) update.workDays = workDays;
      if (workSchedule !== undefined) {
        if (!workSchedule?.start || !workSchedule?.end) {
          return res.status(400).json({ error: "Horário de funcionamento inválido" });
        }
        if (!TIME_RE.test(workSchedule.start) || !TIME_RE.test(workSchedule.end)) {
          return res.status(400).json({ error: "Horário de funcionamento inválido" });
        }
        if (timeToMinutes(workSchedule.start) >= timeToMinutes(workSchedule.end)) {
          return res.status(400).json({ error: "O horário final deve ser maior que o inicial" });
        }
        update.workSchedule = workSchedule;
      }
      if (interval !== undefined) {
        const intervalNumber = Number(interval);
        if (!Number.isFinite(intervalNumber) || intervalNumber <= 0) {
          return res.status(400).json({ error: "Intervalo inválido" });
        }
        update.interval = intervalNumber;
      }

      const user = await User.findByIdAndUpdate(id, update, { new: true }).select("-password");
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      io.emit("refreshData");
      return res.json(user);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao atualizar dias de trabalho" });
    }
  });

  return router;
};
