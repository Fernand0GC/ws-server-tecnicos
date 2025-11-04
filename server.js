import WebSocket, { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

const conexiones = new Map();

wss.on("connection", async (ws, req) => {
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    const tecnicoId = data.employee.id;
    conexiones.set(tecnicoId, ws);
    console.log("🟢 Técnico conectado:", tecnicoId);

    ws.on("close", () => conexiones.delete(tecnicoId));

  } catch (e) {
    ws.close();
  }
});

console.log(`🚀 Servidor WebSocket escuchando en puerto ${port}`);
