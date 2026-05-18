import express from "express";
import bcrypt from "bcryptjs";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { User } from "../models/User.js";
import { createUserSchema } from "../schemas/userSchema.js";
import { DAY_KEYS, TIME_RE, timeToMinutes } from "../utils/schedule.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";

const getUserOrganizationId = (user) => user?.organizationId || String(user?._id || "");

const getAuthenticatedUser = async (req) => {
  const user = await User.findById(req.userId).select("-password -passwordResetToken -passwordResetExpires");
  if (!user) return null;

  if (!user.organizationId) {
    user.organizationId = String(user._id);
    await user.save();
  }

  return user;
};

export const createUserRouter = (io) => {
  const router = express.Router();

  router.get("/users", verifyToken, async (req, res) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const organizationId = getUserOrganizationId(authUser);
      const users = await User.find({ organizationId }).select("-password -passwordResetToken -passwordResetExpires");
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

      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const { email, password } = req.body;
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ error: "Usuário já existe com esse email" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        ...req.body,
        password: hashedPassword,
        organizationId: getUserOrganizationId(authUser),
      });

      return res.status(201).json(sanitizeUser(user));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  router.post("/users/link-existing", verifyToken, async (req, res) => {
    try {
      if (req.userRole !== "owner") {
        return res.status(403).json({ error: "Apenas donos podem vincular usuários" });
      }

      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email obrigatório" });

      const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const organizationId = getUserOrganizationId(authUser);
      const userOrganizationId = getUserOrganizationId(user);
      const ownsOnlySelf = userOrganizationId === String(user._id) && user.role !== "owner";
      if (user.organizationId && userOrganizationId !== organizationId && !ownsOnlySelf) {
        return res.status(409).json({ error: "Usuário já pertence a outra organização" });
      }

      user.organizationId = organizationId;
      await user.save();

      io.emit("refreshData");
      return res.json(sanitizeUser(user));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao vincular usuário" });
    }
  });

  router.put("/users/:id/commission", verifyToken, async (req, res) => {
    try {
      if (req.userRole !== "owner") {
        return res.status(403).json({ error: "Apenas donos podem alterar comissão" });
      }

      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const targetUser = await User.findById(req.params.id).select("-password -passwordResetToken -passwordResetExpires");
      if (!targetUser) return res.status(404).json({ error: "Usuário não encontrado" });
      if (getUserOrganizationId(targetUser) !== getUserOrganizationId(authUser)) {
        return res.status(403).json({ error: "Usuário fora da sua organização" });
      }

      const commissionRate = Number(req.body.commissionRate);
      if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
        return res.status(400).json({ error: "Percentual de comissão inválido" });
      }

      targetUser.commissionRate = commissionRate;
      await targetUser.save();

      io.emit("refreshData");
      return res.json(sanitizeUser(targetUser));
    } catch (err) {
      return res.status(500).json({ error: "Erro ao atualizar comissão" });
    }
  });

  router.put("/users/:id/work-days", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { blockedDates, extraWorkDates, blockedSlots, workDays, workSchedule, workSchedules, interval } = req.body;

      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const targetUser = await User.findById(id).select("-password -passwordResetToken -passwordResetExpires");
      if (!targetUser) return res.status(404).json({ error: "Usuário não encontrado" });
      if (getUserOrganizationId(targetUser) !== getUserOrganizationId(authUser)) {
        return res.status(403).json({ error: "Usuário fora da sua organização" });
      }

      const update = {};
      if (blockedDates !== undefined) update.blockedDates = blockedDates;
      if (extraWorkDates !== undefined) update.extraWorkDates = extraWorkDates;
      if (blockedSlots !== undefined) {
        if (!Array.isArray(blockedSlots)) {
          return res.status(400).json({ error: "Horários bloqueados inválidos" });
        }

        const invalidSlot = blockedSlots.some((slot) => (
          !slot?.date ||
          !slot?.time ||
          !/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ||
          !TIME_RE.test(slot.time)
        ));
        if (invalidSlot) {
          return res.status(400).json({ error: "Horários bloqueados inválidos" });
        }

        update.blockedSlots = blockedSlots;
      }
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
      if (workSchedules !== undefined) {
        if (!workSchedules || typeof workSchedules !== "object") {
          return res.status(400).json({ error: "Horários por dia inválidos" });
        }

        const normalizedSchedules = {};
        for (const day of DAY_KEYS) {
          const schedule = workSchedules[day];
          if (!schedule?.start || !schedule?.end) {
            return res.status(400).json({ error: "Horários por dia inválidos" });
          }
          if (!TIME_RE.test(schedule.start) || !TIME_RE.test(schedule.end)) {
            return res.status(400).json({ error: "Horários por dia inválidos" });
          }
          if (timeToMinutes(schedule.start) >= timeToMinutes(schedule.end)) {
            return res.status(400).json({ error: "O horário final deve ser maior que o inicial" });
          }
          normalizedSchedules[day] = { start: schedule.start, end: schedule.end };
        }

        update.workSchedules = normalizedSchedules;
      }
      if (interval !== undefined) {
        const intervalNumber = Number(interval);
        if (!Number.isFinite(intervalNumber) || intervalNumber <= 0) {
          return res.status(400).json({ error: "Intervalo inválido" });
        }
        update.interval = intervalNumber;
      }

      const user = await User.findByIdAndUpdate(id, update, { new: true }).select("-password -passwordResetToken -passwordResetExpires");
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      io.emit("refreshData");
      return res.json(user);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao atualizar dias de trabalho" });
    }
  });

  return router;
};
