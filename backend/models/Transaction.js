import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    date: { type: String, required: true }, // Format YYYY-MM-DD
    fixedExpenseId: { type: String, default: null }
  },
  { timestamps: true }
);

export const Transaction = mongoose.model("Transaction", TransactionSchema);
