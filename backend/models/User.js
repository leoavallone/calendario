import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  workDays: {"monday": Boolean, "tuesday": Boolean, "wednesday": Boolean, "thursday": Boolean, "friday": Boolean, "saturday": Boolean, "sunday": Boolean},
  workSchedule: {"start": String, "end": String},
  workSchedules: {
    sunday: { start: String, end: String },
    monday: { start: String, end: String },
    tuesday: { start: String, end: String },
    wednesday: { start: String, end: String },
    thursday: { start: String, end: String },
    friday: { start: String, end: String },
    saturday: { start: String, end: String },
  },
  interval: Number,
  blockedDates: { type: [String], default: [] },
  extraWorkDates: { type: [String], default: [] },
  blockedSlots: {
    type: [{
      date: String,
      time: String,
    }],
    default: [],
  },
  password: { type: String, required: false },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  organizationId: { type: String, index: true },
  commissionRate: { type: Number, default: 0, min: 0, max: 100 },
  role: { type: String, enum: ['owner', 'barber'], default: 'barber' }
});

export const User = mongoose.model("User", UserSchema);
