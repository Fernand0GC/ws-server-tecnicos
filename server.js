import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const port = process.env.PORT || 8080;
const app = express();
app.use(express.json());

const server = app.listen(port, () => {
  console.log(`🚀 Servidor HTTP y WS corriendo en puerto ${port}`);
});

const wss = new WebSocketServer({ server });
const conexiones = new Map();

wss.on("connection", (ws, req) => {
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    const tecnicoId = data.employee.id;
    conexiones.set(tecnicoId, ws);
    console.log(`🟢 Técnico conectado: ${tecnicoId}`);

    ws.on("close", () => {
      conexiones.delete(tecnicoId);
      console.log(`🔴 Técnico desconectado: ${tecnicoId}`);
    });
  } catch {
    console.log("❌ Token inválido, cerrando conexión");
    ws.close();
  }
});

app.post("/notificar", async (req, res) => {
  const { tecnico_id, mensaje, tipo = "info", es_global = false } = req.body;

  await sql`
    INSERT INTO notificaciones (tecnico_id, mensaje, tipo, es_global)
    VALUES (${tecnico_id}, ${mensaje}, ${tipo}, ${es_global});
  `;

  const payload = { mensaje, tipo, fecha: new Date().toISOString() };

  if (es_global) {
    conexiones.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    });
  } else {
    const ws = conexiones.get(tecnico_id);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  res.json({ ok: true });
});

app.get("/", (_, res) => res.send("✅ WebSocket server funcionando."));
