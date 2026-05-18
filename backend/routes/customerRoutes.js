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

const extractPhoneFromText = (text = "") => {
  const matches = String(text).match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
  return normalizePhone(matches[0] || "");
};

const extractCustomerNameFromAppointment = (appointment) => {
  if (appointment.customerName) return appointment.customerName;

  const description = String(appointment.description || "");
  const clientMatch = description.match(/Cliente:\s*([^|;\n]+)/i);
  if (clientMatch?.[1]) return clientMatch[1].trim();

  const title = String(appointment.title || "");
  if (title.includes(" - ")) return title.split(" - ").slice(1).join(" - ").trim();
  return title.trim() || "Cliente sem nome";
};

const getAppointmentPhone = (appointment) => (
  appointment.phoneNormalized ||
  normalizePhone(appointment.phone) ||
  extractPhoneFromText(appointment.description)
);

const getTeamUserIds = async (organizationId) => {
  const teamUsers = await User.find({ organizationId }).select("_id");
  return teamUsers.map((user) => String(user._id));
};

const buildLegacyCustomerRows = async ({ organizationId, search, year }) => {
  const normalizedSearch = normalizePhone(search);
  const textSearch = String(search || "").trim();
  const userIds = await getTeamUserIds(organizationId);
  const query = { userId: { $in: userIds } };
  if (year) query.date = { $regex: `^${year}-` };

  const appointments = await Appointment.find(query);
  const byPhone = new Map();

  for (const appointment of appointments) {
    const phoneNormalized = getAppointmentPhone(appointment);
    if (!phoneNormalized) continue;

    const name = extractCustomerNameFromAppointment(appointment);
    const haystack = `${name} ${appointment.title || ""} ${appointment.description || ""} ${phoneNormalized}`.toLowerCase();
    if (textSearch && !haystack.includes(textSearch.toLowerCase()) && phoneNormalized !== normalizedSearch) {
      continue;
    }

    const current = byPhone.get(phoneNormalized) || {
      _id: `legacy-${phoneNormalized}`,
      customerId: null,
      name,
      phone: appointment.phone || phoneNormalized,
      phoneNormalized,
      totalAppointments: 0,
      firstAppointmentAt: `${appointment.date} ${appointment.time}`,
      lastAppointmentAt: `${appointment.date} ${appointment.time}`,
      firstAppointmentDate: appointment.date,
      lastAppointmentDate: appointment.date,
      professionals: {},
    };

    current.totalAppointments += 1;
    if (!current.name || current.name === appointment.title) current.name = name;
    const appointmentDateTime = `${appointment.date} ${appointment.time}`;
    if (appointmentDateTime < current.firstAppointmentAt) {
      current.firstAppointmentAt = appointmentDateTime;
      current.firstAppointmentDate = appointment.date;
    }
    if (appointmentDateTime > current.lastAppointmentAt) {
      current.lastAppointmentAt = appointmentDateTime;
      current.lastAppointmentDate = appointment.date;
    }
    current.professionals[appointment.userId] = (current.professionals[appointment.userId] || 0) + 1;
    byPhone.set(phoneNormalized, current);
  }

  return [...byPhone.values()];
};

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
      const legacyCustomers = await buildLegacyCustomerRows({
        organizationId: getUserOrganizationId(authUser),
        search,
      });
      const customersByPhone = new Map(customers.map((customer) => [customer.phoneNormalized, customer.toObject()]));

      for (const legacyCustomer of legacyCustomers) {
        const existing = customersByPhone.get(legacyCustomer.phoneNormalized);
        if (existing) {
          existing.totalAppointments = Math.max(existing.totalAppointments || 0, legacyCustomer.totalAppointments);
          existing.firstAppointmentAt = existing.firstAppointmentAt || legacyCustomer.firstAppointmentAt;
          existing.lastAppointmentAt = existing.lastAppointmentAt || legacyCustomer.lastAppointmentAt;
          existing.phone = existing.phone || legacyCustomer.phone;
          existing.name = existing.name || legacyCustomer.name;
        } else {
          customersByPhone.set(legacyCustomer.phoneNormalized, legacyCustomer);
        }
      }

      const mergedCustomers = [...customersByPhone.values()]
        .sort((a, b) => String(b.lastAppointmentAt || "").localeCompare(String(a.lastAppointmentAt || "")) || String(a.name || "").localeCompare(String(b.name || "")));
      return res.json(mergedCustomers);
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
      const userIds = await getTeamUserIds(organizationId);
      const appointments = await Appointment.find({
        userId: { $in: userIds },
        date: { $regex: `^${year}-` },
      });

      const customerIds = [...new Set(appointments.map((appointment) => appointment.customerId).filter(Boolean))];
      const customers = await Customer.find({ _id: { $in: customerIds }, organizationId });
      const customersById = new Map(customers.map((customer) => [String(customer._id), customer]));
      const byCustomer = new Map();

      for (const appointment of appointments) {
        const phoneNormalized = getAppointmentPhone(appointment);
        const key = phoneNormalized || appointment.customerId || appointment.title;
        if (!key) continue;

        const current = byCustomer.get(key) || {
          customerId: appointment.customerId || null,
          name: extractCustomerNameFromAppointment(appointment),
          phone: appointment.phone || phoneNormalized || null,
          phoneNormalized: phoneNormalized || null,
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

      for (const legacyCustomer of await buildLegacyCustomerRows({ organizationId, year })) {
        if (byCustomer.has(legacyCustomer.phoneNormalized)) continue;
        byCustomer.set(legacyCustomer.phoneNormalized, legacyCustomer);
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
