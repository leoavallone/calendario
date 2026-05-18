import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { Appointment } from "../models/Appointments.js";
import { User } from "../models/User.js";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../schemas/AppointmentSchema.js";
import { generateTimeSlots, getWorkScheduleForDate, isSlotBlockedForUser, isWorkDayForUser } from "../utils/schedule.js";

const normalizePhone = (phone = "") => String(phone).replace(/\D/g, "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const phoneToLooseRegex = (phoneNormalized) => phoneNormalized
  .split("")
  .map(escapeRegex)
  .join("\\D*");

const extractPhoneFromText = (text = "") => {
  const matches = String(text).match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
  return normalizePhone(matches[0] || "");
};

const applyPhoneMetadata = (appointment) => {
  const phoneNormalized = normalizePhone(appointment.phone) || extractPhoneFromText(appointment.description);
  if (phoneNormalized) {
    appointment.phoneNormalized = phoneNormalized;
  } else {
    delete appointment.phoneNormalized;
  }
  return appointment;
};

const applyPhoneMetadataForUpdate = (appointment) => {
  if (!Object.prototype.hasOwnProperty.call(appointment, "phone") &&
      !Object.prototype.hasOwnProperty.call(appointment, "description")) {
    return appointment;
  }
  return applyPhoneMetadata(appointment);
};

const buildPhoneQuery = (phone) => {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return null;

  const loosePhoneRegex = new RegExp(phoneToLooseRegex(phoneNormalized), "i");
  return {
    $or: [
      { phoneNormalized },
      { phone: loosePhoneRegex },
      { description: loosePhoneRegex },
    ],
  };
};

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

export const createAppointmentRouter = (io) => {
  const router = express.Router();

  router.get("/availability", verifyToken, async (req, res) => {
    try {
      const { date, userId } = req.query;

      const user = await ensureUserInOrganization(req, res, userId);
      if (!user) return;

      const appointments = await Appointment.find({ date, userId });
      const workSchedule = getWorkScheduleForDate(user, date);
      const allSlots = workSchedule && isWorkDayForUser(user, date)
        ? generateTimeSlots(workSchedule, user.interval)
        : [];
      const bookedTimes = appointments.map((a) => a.time);
      const blockedTimes = (user.blockedSlots || [])
        .filter((slot) => slot.date === date)
        .map((slot) => slot.time);
      const freeSlots = allSlots.filter((t) => !bookedTimes.includes(t) && !blockedTimes.includes(t));

      return res.json({ date, allSlots, bookedTimes, blockedTimes, freeSlots });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao buscar disponibilidade" });
    }
  });

  router.get("/appointments", verifyToken, async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId obrigatório" });
      const user = await ensureUserInOrganization(req, res, userId);
      if (!user) return;

      const appointments = await Appointment.find({ userId });
      return res.json(appointments);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar agendamentos" });
    }
  });

  router.get("/appointments/by-phone", verifyToken, async (req, res) => {
    try {
      const { phone, userId } = req.query;
      const phoneQuery = buildPhoneQuery(phone);
      if (!phoneQuery) return res.status(400).json({ error: "phone obrigatório" });

      const query = { ...phoneQuery };
      if (userId) {
        const user = await ensureUserInOrganization(req, res, userId);
        if (!user) return;
        query.userId = userId;
      } else {
        const authUser = await getAuthenticatedUser(req);
        if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });
        const teamUsers = await User.find({ organizationId: getUserOrganizationId(authUser) }).select("_id");
        query.userId = { $in: teamUsers.map((user) => String(user._id)) };
      }

      const appointments = await Appointment.find(query).sort({ date: 1, time: 1, createdAt: 1 });
      return res.json(appointments);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar agendamentos por telefone" });
    }
  });

  router.post(
    "/appointments",
    verifyToken,
    validate(createAppointmentSchema),
    async (req, res) => {
      try {
        const { date, time } = req.body;
        const user = await ensureUserInOrganization(req, res, req.body.userId);
        if (!user) return;
        if (isSlotBlockedForUser(user, date, time)) {
          return res.status(400).json({ error: "Horário está bloqueado" });
        }

        const exists = await Appointment.findOne({ date, time, userId: req.body.userId });

        if (exists) return res.status(400).json({ error: "Horário já está ocupado" });

        const appointment = new Appointment(applyPhoneMetadata(req.body));
        await appointment.save();

        io.emit("refreshData");
        return res.status(201).json(appointment);
      } catch (err) {
        return res.status(500).json({ error: "Erro ao criar agendamento" });
      }
    }
  );

  router.put(
    "/appointments/:id",
    verifyToken,
    validate(updateAppointmentSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        const currentAppointment = await Appointment.findById(id);
        if (!currentAppointment) return res.status(404).json({ error: "Agendamento não encontrado" });
        const currentUser = await ensureUserInOrganization(req, res, currentAppointment.userId);
        if (!currentUser) return;

        const nextUserId = req.body.userId || currentAppointment.userId;
        const nextDate = req.body.date || currentAppointment.date;
        const nextTime = req.body.time || currentAppointment.time;
        const user = await ensureUserInOrganization(req, res, nextUserId);
        if (!user) return;

        const changedSlot = String(nextUserId) !== String(currentAppointment.userId) ||
          nextDate !== currentAppointment.date ||
          nextTime !== currentAppointment.time;
        if (changedSlot) {
          if (isSlotBlockedForUser(user, nextDate, nextTime)) {
            return res.status(400).json({ error: "Horário está bloqueado" });
          }

          const exists = await Appointment.findOne({
            _id: { $ne: id },
            userId: nextUserId,
            date: nextDate,
            time: nextTime,
          });
          if (exists) return res.status(400).json({ error: "Horário já está ocupado" });
        }

        const appointment = await Appointment.findByIdAndUpdate(id, applyPhoneMetadataForUpdate(req.body), { new: true });

        io.emit("refreshData");
        return res.json(appointment);
      } catch (err) {
        return res.status(500).json({ error: "Erro ao atualizar" });
      }
    }
  );

  const cancelAppointment = async (req, res) => {
    try {
      const params = { ...req.query, ...req.body };
      const { appointmentId, phone, userId, date, time } = params;
      const query = {};

      if (appointmentId) {
        query._id = appointmentId;
        const phoneQuery = buildPhoneQuery(phone);
        if (phoneQuery) Object.assign(query, phoneQuery);
      } else {
        const phoneQuery = buildPhoneQuery(phone);
        if (!phoneQuery) {
          return res.status(400).json({ error: "appointmentId ou phone obrigatório" });
        }
        Object.assign(query, phoneQuery);
      }

      if (userId) query.userId = userId;
      if (date) query.date = date;
      if (time) query.time = time;

      if (userId) {
        const user = await ensureUserInOrganization(req, res, userId);
        if (!user) return;
      } else {
        const authUser = await getAuthenticatedUser(req);
        if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });
        const teamUsers = await User.find({ organizationId: getUserOrganizationId(authUser) }).select("_id");
        query.userId = { $in: teamUsers.map((user) => String(user._id)) };
      }

      const matches = await Appointment.find(query).sort({ date: 1, time: 1, createdAt: 1 });
      if (!matches.length) return res.status(404).json({ error: "Agendamento não encontrado" });

      if (matches.length > 1) {
        return res.status(409).json({
          error: "Mais de um agendamento encontrado. Informe appointmentId, date ou time para cancelar.",
          appointments: matches,
        });
      }

      await Appointment.findByIdAndDelete(matches[0]._id);

      io.emit("refreshData");
      return res.json({ message: "Agendamento cancelado com sucesso", appointment: matches[0] });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao cancelar agendamento" });
    }
  };

  router.post("/appointments/cancel", verifyToken, cancelAppointment);
  router.delete("/appointments/cancel", verifyToken, cancelAppointment);

  router.delete("/appointments/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId obrigatório" });
      const user = await ensureUserInOrganization(req, res, userId);
      if (!user) return;

      const appointment = await Appointment.findOneAndDelete({ _id: id, userId });

      if (!appointment) return res.status(404).json({ error: "Agendamento não encontrado" });

      io.emit("refreshData");
      return res.json({ message: "Agendamento deletado com sucesso" });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao deletar" });
    }
  });

  return router;
};
