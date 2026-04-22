import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { z } from "zod";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./db.js";
import { verifyToken } from "./middlewares/auth.js";
import { Appointment } from "./models/Appointments.js";
import { validate } from "./middlewares/validate.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./schemas/AppointmentSchema.js";
import { User } from "./models/User.js";
import { createUserSchema } from "./schemas/userSchema.js";
import { Transaction } from "./models/Transaction.js";
import { createTransactionSchema } from "./schemas/TransactionSchema.js";
import { FixedExpense } from "./models/FixedExpense.js";
import { createFixedExpenseSchema } from "./schemas/FixedExpenseSchema.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
await connectDB();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});
app.get("/cadastro", (req, res) => {
  res.sendFile(path.join(__dirname, "cadastro.html"));
});

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
app.get("/api/availability", verifyToken, async (req, res) => {
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

app.get("/api/appointments", verifyToken, async (req, res) => {
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
  verifyToken,
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
  verifyToken,
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

app.delete("/api/appointments/:id", verifyToken, async (req, res) => {
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


// USUÁRIOS E AUTH
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Credenciais inválidas" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || "roqia_secret_key", { expiresIn: "7d" });

    // Remove password from response
    const userObj = user.toObject();
    delete userObj.password;

    res.json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.post("/api/auth/register", validate(createUserSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Usuário já existe com esse email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userPayload = { ...req.body, password: hashedPassword };
    
    // Default system fallback setup
    if(!userPayload.workSchedule) userPayload.workSchedule = {start: "09:00", end: "18:00"};
    if(!userPayload.interval) userPayload.interval = 30;

    const user = await User.create(userPayload);
    const userObj = user.toObject();
    delete userObj.password;

    return res.status(201).json(userObj);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

app.get("/api/users", verifyToken, async (req, res) => {
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

app.put("/api/users/:id/work-days", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { blockedDates, extraWorkDates } = req.body;
    
    const update = {};
    if (blockedDates !== undefined) update.blockedDates = blockedDates;
    if (extraWorkDates !== undefined) update.extraWorkDates = extraWorkDates;

    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    io.emit("refreshData");
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao atualizar dias de trabalho" });
  }
});

// TRANSAÇÕES FINANCEIRAS
app.get("/api/transactions", verifyToken, async (req, res) => {
  try {
    const { userId, month, year } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }
    
    let transactions = await Transaction.find({ userId }).sort({ date: -1, createdAt: -1 });

    if (month && year) {
      const fixed = await FixedExpense.find({ userId });
      for (const fx of fixed) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(fx.dayOfMonth).padStart(2, '0')}`;
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        
        const exists = transactions.some(t => t.fixedExpenseId && t.fixedExpenseId === String(fx._id) && t.date.startsWith(prefix));

        if (!exists) {
          const newTx = new Transaction({
            userId,
            type: "expense",
            amount: fx.amount,
            description: fx.description,
            date: dateStr,
            fixedExpenseId: String(fx._id)
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

app.post(
  "/api/transactions",
  verifyToken,
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

app.delete("/api/transactions/:id", verifyToken, async (req, res) => {
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

app.put(
  "/api/transactions/:id",
  verifyToken,
  validate(createTransactionSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const transaction = await Transaction.findByIdAndUpdate(
        id,
        req.body,
        { new: true }
      );

      if (!transaction) {
        return res.status(404).json({ error: "Transação não encontrada" });
      }

      io.emit("refreshData");

      return res.json(transaction);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao atualizar transação" });
    }
  }
);

// CUSTOS FIXOS
app.get("/api/fixed-expenses", verifyToken, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId obrigatório" });
    const expenses = await FixedExpense.find({ userId });
    return res.json(expenses);
  } catch (err) { return res.status(500).json({ error: "Erro" }); }
});

app.post("/api/fixed-expenses", verifyToken, validate(createFixedExpenseSchema), async (req, res) => {
  try {
    const fx = new FixedExpense(req.body);
    await fx.save();
    io.emit("refreshData");
    return res.status(201).json(fx);
  } catch (err) { return res.status(500).json({ error: "Erro" }); }
});

app.delete("/api/fixed-expenses/:id", verifyToken, async (req, res) => {
  try {
    const fx = await FixedExpense.findByIdAndDelete(req.params.id);
    if (!fx) return res.status(404).json({ error: "Não encontrado" });
    io.emit("refreshData");
    return res.json({ message: "Removido com sucesso" });
  } catch (err) { return res.status(500).json({ error: "Erro" }); }
});



server.listen(PORT, () => {
  console.log(`Servidor rodando em ${PORT} com WebSockets habilitado`);
});