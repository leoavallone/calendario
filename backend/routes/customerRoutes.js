import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { Appointment } from "../models/Appointments.js";
import { Customer } from "../models/Customer.js";
import { User } from "../models/User.js";

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

const normalizePhone = (phone = "") => String(phone).replace(/\D/g, "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createCustomerRouter = () => {
  const router = express.Router();

  router.get("/customers", verifyToken, async (req, res) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const { search } = req.query;
      const query = { organizationId: getUserOrganizationId(authUser) };
      const normalizedPhone = normalizePhone(search);
      if (search) {
        query.$or = [
          { name: new RegExp(escapeRegex(String(search)), "i") },
          { phone: new RegExp(escapeRegex(String(search)), "i") },
        ];
        if (normalizedPhone) query.$or.push({ phoneNormalized: normalizedPhone });
      }

      const customers = await Customer.find(query).sort({ lastAppointmentAt: -1, name: 1 });
      return res.json(customers);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar clientes" });
    }
  });

  router.get("/customers/report", verifyToken, async (req, res) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const year = String(req.query.year || new Date().getFullYear());
      if (!/^\d{4}$/.test(year)) {
        return res.status(400).json({ error: "year deve estar no formato YYYY" });
      }

      const organizationId = getUserOrganizationId(authUser);
      const teamUsers = await User.find({ organizationId }).select("_id");
      const userIds = teamUsers.map((user) => String(user._id));
      const appointments = await Appointment.find({
        userId: { $in: userIds },
        date: { $regex: `^${year}-` },
      });

      const customerIds = [...new Set(appointments.map((appointment) => appointment.customerId).filter(Boolean))];
      const customers = await Customer.find({ _id: { $in: customerIds }, organizationId });
      const customersById = new Map(customers.map((customer) => [String(customer._id), customer]));
      const byCustomer = new Map();

      for (const appointment of appointments) {
        const key = appointment.customerId || appointment.phoneNormalized || appointment.phone || appointment.title;
        if (!key) continue;

        const current = byCustomer.get(key) || {
          customerId: appointment.customerId || null,
          name: appointment.customerName || appointment.title,
          phone: appointment.phone || null,
          phoneNormalized: appointment.phoneNormalized || null,
          totalAppointments: 0,
          firstAppointmentDate: appointment.date,
          lastAppointmentDate: appointment.date,
          professionals: {},
        };

        const customer = appointment.customerId ? customersById.get(String(appointment.customerId)) : null;
        if (customer) {
          current.name = customer.name || current.name;
          current.phone = customer.phone || current.phone;
          current.phoneNormalized = customer.phoneNormalized || current.phoneNormalized;
        }

        current.totalAppointments += 1;
        if (appointment.date < current.firstAppointmentDate) current.firstAppointmentDate = appointment.date;
        if (appointment.date > current.lastAppointmentDate) current.lastAppointmentDate = appointment.date;
        current.professionals[appointment.userId] = (current.professionals[appointment.userId] || 0) + 1;
        byCustomer.set(key, current);
      }

      const ranking = [...byCustomer.values()]
        .sort((a, b) => b.totalAppointments - a.totalAppointments || a.name.localeCompare(b.name));

      return res.json({ year, count: ranking.length, customers: ranking });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao gerar relatório de clientes" });
    }
  });

  router.get("/customers/:id/appointments", verifyToken, async (req, res) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) return res.status(404).json({ error: "Usuário não encontrado" });

      const organizationId = getUserOrganizationId(authUser);
      const customer = await Customer.findOne({ _id: req.params.id, organizationId });
      if (!customer) return res.status(404).json({ error: "Cliente não encontrado" });

      const appointments = await Appointment.find({ customerId: String(customer._id) }).sort({ date: -1, time: -1 });
      return res.json({ customer, appointments });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar histórico do cliente" });
    }
  });

  return router;
};
