import mongoose from "mongoose";

const FixedExpenseSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
  },
  { timestamps: true }
);

export const FixedExpense = mongoose.model("FixedExpense", FixedExpenseSchema);
