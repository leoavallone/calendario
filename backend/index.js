import express from "express";
import cors from "cors";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { z } from "zod";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./db.js";
import { Appointment } from "./models/Appointments.js";
import { validate } from "./middlewares/validate.js";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./schemas/AppointmentSchema.js";
import { User } from "./models/User.js";
import { createUserSchema } from "./schemas/userSchema.js";
import { Transaction } from "./models/Transaction.js";
import { createTransactionSchema } from "./schemas/TransactionSchema.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
await connectDB();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
  console.log('Cliente conectado ao WebSocket');
});
const PORT = process.env.PORT || 3000;

// Gera slots a partir do objeto workSchedule { start: "HH:MM", end: "HH:MM" }
const generateTimeSlots = (workSchedule, interval = 30) => {
  const { start, end } = workSchedule;
  const [startH, startM] = start.split(":").map(Number);
  const [endH,   endM]   = end.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin   = endH   * 60 + endM;
  const slots = [];
  for (let m = startMin; m < endMin; m += interval) {
    const h   = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    slots.push(`${h}:${min}`);
  }
  return slots;
};

// AGENDAMENTOS
app.get("/api/availability", async (req, res) => {
  try {
    const { date, userId } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const appointments = await Appointment.find({ date });
        console.log(appointments);
    const allSlots = user.workSchedule
      ? generateTimeSlots(user.workSchedule, user.interval)
      : [];
    const bookedTimes = appointments.map((a) => a.time);
    const freeSlots   = allSlots.filter((t) => !bookedTimes.includes(t));

    return res.json({
      date,
      allSlots,
      bookedTimes,
      freeSlots,
    });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ error: "Erro ao buscar disponibilidade" });
  }
});

app.get("/api/appointments", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId obrigatório" });
    }
    const appointments = await Appointment.find({ userId });
    return res.json(appointments);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao buscar agendamentos" });
  }
});

app.post(
  "/api/appointments",
  validate(createAppointmentSchema),
  async (req, res) => {
    try {
      const { date, time } = req.body;

      // evitar conflito de horário
      const exists = await Appointment.findOne({ date, time });

      if (exists) {
        return res.status(400).json({
          error: "Horário já está ocupado",
        });
      }

      const appointment = new Appointment(req.body);
      await appointment.save();

      io.emit("refreshData");

      return res.status(201).json(appointment);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao criar agendamento" });
    }
  }
);

app.put(
  "/api/appointments/:id",
  validate(updateAppointmentSchema),
  async (req, res) => {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findByIdAndUpdate(
        id,
        req.body,
        { new: true }
      );

      if (!appointment) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      io.emit("refreshData");

      return res.json(appointment);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao atualizar" });
    }
  }
);

app.delete("/api/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const appointment = await Appointment.findOneAndDelete({ _id: id, userId });

    if (!appointment) {
      return res.status(404).json({ error: "Agendamento não encontrado" });
    }

    io.emit("refreshData");

    return res.json({ message: "Agendamento deletado com sucesso" });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao deletar" });
  }
});


// USUÁRIOS
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();

    return res.json(users);
  } catch (err) {
    return res.status(500).json({
      error: "Erro ao buscar usuários",
    });
  }
});

app.post("/api/users", validate(createUserSchema), async (req, res) => {
  try {
    const { email } = req.body;

    // evitar duplicidade
    const exists = await User.findOne({ email });
    console.log(req.body);
    if (exists) {
      return res.status(400).json({
        error: "Usuário já existe com esse email",
      });
    }

    const user = await User.create(req.body);

    return res.status(201).json(user);
  } catch (err) {
    return res.status(500).json({
      error: "Erro ao criar usuário",
    });
  }
});

// TRANSAÇÕES FINANCEIRAS
app.get("/api/transactions", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }
    const transactions = await Transaction.find({ userId }).sort({ date: -1, createdAt: -1 });
    return res.json(transactions);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao buscar transações" });
  }
});

app.post(
  "/api/transactions",
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

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findByIdAndDelete(id);
    if (!transaction) {
      return res.status(404).json({ error: "Transação não encontrada" });
    }

    io.emit("refreshData");

    return res.json({ message: "Transação removida com sucesso" });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao deletar transação" });
  }
});



server.listen(PORT, () => {
  console.log(`Servidor rodando em ${PORT} com WebSockets habilitado`);
});