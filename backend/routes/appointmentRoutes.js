import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { Appointment } from "../models/Appointments.js";
import { User } from "../models/User.js";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../schemas/AppointmentSchema.js";
import { generateTimeSlots, isSlotBlockedForUser, isWorkDayForUser } from "../utils/schedule.js";

export const createAppointmentRouter = (io) => {
  const router = express.Router();

  router.get("/availability", verifyToken, async (req, res) => {
    try {
      const { date, userId } = req.query;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const appointments = await Appointment.find({ date, userId });
      const allSlots = user.workSchedule && isWorkDayForUser(user, date)
        ? generateTimeSlots(user.workSchedule, user.interval)
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

      const appointments = await Appointment.find({ userId });
      return res.json(appointments);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar agendamentos" });
    }
  });

  router.post(
    "/appointments",
    verifyToken,
    validate(createAppointmentSchema),
    async (req, res) => {
      try {
        const { date, time } = req.body;
        const user = await User.findById(req.body.userId);
        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
        if (isSlotBlockedForUser(user, date, time)) {
          return res.status(400).json({ error: "Horário está bloqueado" });
        }

        const exists = await Appointment.findOne({ date, time, userId: req.body.userId });

        if (exists) return res.status(400).json({ error: "Horário já está ocupado" });

        const appointment = new Appointment(req.body);
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

        const nextUserId = req.body.userId || currentAppointment.userId;
        const nextDate = req.body.date || currentAppointment.date;
        const nextTime = req.body.time || currentAppointment.time;
        const user = await User.findById(nextUserId);
        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

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

        const appointment = await Appointment.findByIdAndUpdate(id, req.body, { new: true });

        io.emit("refreshData");
        return res.json(appointment);
      } catch (err) {
        return res.status(500).json({ error: "Erro ao atualizar" });
      }
    }
  );

  router.delete("/appointments/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.query;
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
