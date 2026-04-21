import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  
  if (!token) {
    return res.status(403).json({ error: "Nenhum token fornecido" });
  }

  // format "Bearer <token>"
  const tokenParts = token.split(" ");
  if (tokenParts.length !== 2) {
    return res.status(401).json({ error: "Token inválido" });
  }

  jwt.verify(tokenParts[1], process.env.JWT_SECRET || "roqia_secret_key", (err, decoded) => {
    if (err) return res.status(401).json({ error: "Não autorizado!" });
    
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  });
};
