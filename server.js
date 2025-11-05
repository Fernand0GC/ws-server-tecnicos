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
  console.log("📥 Nueva conexión WebSocket recibida");
  
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
  
  console.log("🔑 Token recibido:", token ? "Sí (primeros 20 chars): " + token.substring(0, 20) + "..." : "No");
  
  if (!token) {
    console.log("❌ No se recibió token, cerrando conexión");
    ws.close();
    return;
  }

  try {
    console.log("🔍 Verificando token con JWT_SECRET...");
    const data = jwt.verify(token, process.env.AUTH_SECRET);
    console.log("✅ Token verificado. Payload:", JSON.stringify(data, null, 2));
    
    const tecnicoId = data.empleado_id;
    
    if (!tecnicoId) {
      console.log("❌ No se encontró empleado_id en el token. Estructura del token:", Object.keys(data));
      ws.close();
      return;
    }
    
    conexiones.set(tecnicoId, ws);
    console.log(`🟢 Técnico conectado: ${tecnicoId}`);
    console.log(`📊 Total conexiones activas: ${conexiones.size}`);

    // Enviar mensaje de confirmación
    ws.send(JSON.stringify({ 
      type: "connected", 
      message: "Conectado exitosamente",
      tecnico_id: tecnicoId 
    }));

    ws.on("close", () => {
      conexiones.delete(tecnicoId);
      console.log(`🔴 Técnico desconectado: ${tecnicoId}`);
      console.log(`📊 Total conexiones activas: ${conexiones.size}`);
    });

    ws.on("error", (error) => {
      console.error(`❌ Error en WebSocket de técnico ${tecnicoId}:`, error);
    });

  } catch (error) {
    console.log("❌ Error verificando token:", error.message);
    console.log("❌ Tipo de error:", error.name);
    if (error.name === "JsonWebTokenError") {
      console.log("   → Token inválido o mal formado");
    } else if (error.name === "TokenExpiredError") {
      console.log("   → Token expirado");
    }
    ws.close();
  }
});

app.post("/notificar", async (req, res) => {
  const { tecnico_id, mensaje, tipo = "info", es_global = false } = req.body;

  console.log(`📬 Notificación recibida:`, { tecnico_id, mensaje, tipo, es_global });

  try {
    await sql`
      INSERT INTO notificaciones (tecnico_id, mensaje, tipo, es_global)
      VALUES (${tecnico_id}, ${mensaje}, ${tipo}, ${es_global});
    `;
    console.log("✅ Notificación guardada en BD");
  } catch (error) {
    console.error("❌ Error guardando notificación:", error);
  }

  const payload = { mensaje, tipo, fecha: new Date().toISOString() };

  if (es_global) {
    console.log(`📢 Enviando notificación global a ${conexiones.size} técnicos`);
    let sent = 0;
    conexiones.forEach((ws, id) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        sent++;
      }
    });
    console.log(`✅ Enviado a ${sent} técnicos`);
  } else {
    const ws = conexiones.get(tecnico_id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      console.log(`✅ Notificación enviada a técnico ${tecnico_id}`);
    } else {
      console.log(`⚠️ Técnico ${tecnico_id} no conectado o socket cerrado`);
    }
  }

  res.json({ ok: true });
});

app.get("/", (_, res) => res.send("✅ WebSocket server funcionando."));

// Log de variables de entorno (sin mostrar el secreto completo)
console.log("🔐 JWT_SECRET configurado:", process.env.AUTH_SECRET ? "Sí (primeros 10 chars): " + process.env.AUTH_SECRET.substring(0, 10) + "..." : "❌ NO CONFIGURADO");
console.log("🗄️ DATABASE_URL configurada:", process.env.DATABASE_URL ? "Sí" : "❌ NO");
