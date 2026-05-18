import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String },
    phone: { type: String },
    phoneNormalized: { type: String, required: true, index: true },
    email: { type: String },
    notes: { type: String },
    firstAppointmentAt: { type: String },
    lastAppointmentAt: { type: String },
    totalAppointments: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CustomerSchema.index({ organizationId: 1, phoneNormalized: 1 }, { unique: true });

export const Customer = mongoose.model("Customer", CustomerSchema);
