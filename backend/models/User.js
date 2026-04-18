import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  workDays: {"monday": Boolean, "tuesday": Boolean, "wednesday": Boolean, "thursday": Boolean, "friday": Boolean, "saturday": Boolean, "sunday": Boolean},
  workSchedule: {"start": String, "end": String},
  interval: Number
});

export const User = mongoose.model("User", UserSchema);