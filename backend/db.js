import mongoose from "mongoose";

export async function connectDB() {
  try {
    await mongoose.connect("mongodb+srv://leonardosavallone_db_user:MO2iWKRVxQW2QIpn@cluster0.iobhuuw.mongodb.net/calendario");
    console.log("MongoDB conectado");
  } catch (err) {
    console.error("Erro ao conectar no MongoDB", err);
  }
}
