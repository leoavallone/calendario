import express from "express";
import path from "path";

export const createPageRouter = (publicDir) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  router.get("/login", (req, res) => {
    res.sendFile(path.join(publicDir, "login.html"));
  });

  router.get("/cadastro", (req, res) => {
    res.sendFile(path.join(publicDir, "cadastro.html"));
  });

  router.get("/recuperar-senha", (req, res) => {
    res.sendFile(path.join(publicDir, "recuperar-senha.html"));
  });

  router.get("/finance", (req, res) => {
    res.sendFile(path.join(publicDir, "finance.html"));
  });

  router.get("/clientes", (req, res) => {
    res.sendFile(path.join(publicDir, "clientes.html"));
  });

  return router;
};
