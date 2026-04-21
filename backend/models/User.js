import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  workDays: {"monday": Boolean, "tuesday": Boolean, "wednesday": Boolean, "thursday": Boolean, "friday": Boolean, "saturday": Boolean, "sunday": Boolean},
  workSchedule: {"start": String, "end": String},
  interval: Number,
  blockedDates: { type: [String], default: [] },
  extraWorkDates: { type: [String], default: [] },
  password: { type: String, required: false },
  role: { type: String, enum: ['owner', 'barber'], default: 'barber' }
});

export const User = mongoose.model("User", UserSchema);