import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./db.js";
import { createAppointmentRouter } from "./routes/appointmentRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createCustomerRouter } from "./routes/customerRoutes.js";
import { createFixedExpenseRouter } from "./routes/fixedExpenseRoutes.js";
import { createPageRouter } from "./routes/pageRoutes.js";
import { createTransactionRouter } from "./routes/transactionRoutes.js";
import { createUserRouter } from "./routes/userRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

await connectDB();

io.on("connection", () => {
  console.log("Cliente conectado ao WebSocket");
});

app.use("/", createPageRouter(__dirname));
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", createAuthRouter());
app.use("/api", createAppointmentRouter(io));
app.use("/api", createCustomerRouter());
app.use("/api", createUserRouter(io));
app.use("/api", createTransactionRouter(io));
app.use("/api", createFixedExpenseRouter(io));

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint não encontrado" });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em ${PORT} com WebSockets habilitado`);
});
