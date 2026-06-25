import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import unzipper from "unzipper";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const webauthnChallenges: Record<string, string> = {}; // { userId: challenge }
const webauthnUser = {
  id: "admin-user", // Since we only have one user role (admin)
  username: "admin",
};

const app = express();
const PORT = 3000;
const DATA_DIR = process.env.DATA_PATH || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/data", express.static(DATA_DIR));

// HTTPS Redirection middleware
app.use((req, res, next) => {
  const host = req.headers.host || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.startsWith("192.168.") || host.startsWith("10.");
  
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "http" && !isLocal) {
    return res.redirect(`https://${host}${req.url}`);
  }
  next();
});

// Ensure db and uploads exist
async function initDb() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
  try {
    await fs.access(DB_FILE);
    const data = await fs.readFile(DB_FILE, "utf-8");
    const db = JSON.parse(data);
    if (!db.tools) {
      db.tools = [];
    }
    if (!db.budgets) {
      db.budgets = [];
    }
    if (!db.serviceTypes) {
      db.serviceTypes = [];
    }
    if (!db.serviceTasks) {
      db.serviceTasks = [];
    }
    if (!db.projects) {
      db.projects = [];
    }
    if (!db.settings) {
      db.settings = {};
    }
    if (!db.transactions) {
      db.transactions = [];
    }
    if (!db.passkeys) {
      db.passkeys = [];
    }
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ clients: [], devices: [], tools: [], budgets: [], serviceTypes: [], serviceTasks: [], projects: [], settings: {}, transactions: [], passkeys: [] }));
  }
}
// upload middleware
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Backups and temp files should not go into UPLOADS_DIR 
    // because that directory is wiped during a restore operation.
    if (file.fieldname === "backup" || file.fieldname === "msinfo" || file.fieldname === "dxdiag") {
      cb(null, DATA_DIR);
    } else {
      cb(null, UPLOADS_DIR);
    }
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage });

const LOG_FILE = path.join(DATA_DIR, "api_logs.txt");

async function logApi(message: string) {
  const timestamp = new Date().toISOString();
  try {
    await fs.appendFile(LOG_FILE, `${timestamp} - ${message}\n`);
  } catch (e) {
    console.error("Failed to write to log file", e);
  }
}

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  
  // Capture the original end function
  const oldEnd = res.end;
  // @ts-ignore
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const contentType = res.get('Content-Type');
    logApi(`${method} ${url} - Status: ${res.statusCode} - Type: ${contentType} - Duration: ${duration}ms`);
    // @ts-ignore
    return oldEnd.apply(res, arguments);
  };
  
  next();
});

app.get("/api/logs", async (req, res) => {
  try {
    const logs = await fs.readFile(LOG_FILE, "utf-8");
    res.type("text/plain").send(logs);
  } catch {
    res.status(404).send("No logs found");
  }
});

async function readDb() {
  const data = await fs.readFile(DB_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeDb(data: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// API Routes
app.post("/api/login", async (req, res) => {
  const { password } = req.body;
  const db = await readDb();
  const currentPassword = db.settings?.password || process.env.APP_PASSWORD || "admin";
  
  if (password === currentPassword) {
    res.json({ success: true, token: currentPassword });
  } else {
    res.status(401).json({ error: "Contraseña incorrecta" });
  }
});

app.use("/api", async (req, res, next) => {
  if (req.path === "/login" || req.path === "/health" || req.path === "/debug" || req.path === "/webauthn/auth-options" || req.path === "/webauthn/auth-verify") {
    return next();
  }
  
  const appToken = req.headers['x-app-token'] as string | undefined;
  const tokenQuery = req.query.token as string | undefined;
  
  const token = appToken || tokenQuery;
  
  try {
    const db = await readDb();
    const currentPassword = db.settings?.password || process.env.APP_PASSWORD || "admin";
    
    if (!token || token !== currentPassword) {
      return res.status(401).json({ error: "No autorizado" });
    }
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/settings/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = await readDb();
  const storedPassword = db.settings?.password || process.env.APP_PASSWORD || "admin";
  
  if (currentPassword !== storedPassword) {
    return res.status(401).json({ error: "La contraseña actual es incorrecta" });
  }
  
  if (!db.settings) {
    db.settings = {};
  }
  db.settings.password = newPassword;
  await writeDb(db);
  
  res.json({ success: true, token: newPassword });
});

app.get("/api/settings", async (req, res) => {
  const db = await readDb();
  // Don't expose password
  const { password, ...safeSettings } = db.settings || {};
  res.json(safeSettings);
});

app.put("/api/settings", async (req, res) => {
  const db = await readDb();
  if (!db.settings) db.settings = {};
  
  // We keep password as is, and update everything else
  const password = db.settings.password;
  db.settings = { ...db.settings, ...req.body, password };
  
  await writeDb(db);
  
  const { password: _, ...safeSettings } = db.settings;
  res.json(safeSettings);
});

app.get("/api/debug", (req, res) => {
  const routes: string[] = [];
  // @ts-ignore
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push(`${Object.keys(handler.route.methods).join(', ').toUpperCase()} ${handler.route.path}`);
        }
      });
    }
  });
  res.json({
    node_env: process.env.NODE_ENV,
    cwd: process.cwd(),
    data_dir: DATA_DIR,
    db_file: DB_FILE,
    routes
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/webauthn/register-options", async (req, res) => {
  const rpName = "GeekyFix";
  const rpID = req.headers.origin ? new URL(req.headers.origin).hostname : req.hostname;
  
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(webauthnUser.id)),
    userName: webauthnUser.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  webauthnChallenges[webauthnUser.id] = options.challenge;
  res.json(options);
});

app.post("/api/webauthn/register-verify", async (req, res) => {
  const rpID = req.headers.origin ? new URL(req.headers.origin).hostname : req.hostname;
  const expectedChallenge = webauthnChallenges[webauthnUser.id];
  const expectedOrigin = req.headers.origin || `https://${req.hostname}`;
  
  if (!expectedChallenge) return res.status(400).json({ error: "Missing challenge" });
  
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    });
    
    if (verification.verified && verification.registrationInfo) {
      const db = await readDb();
      if (!db.passkeys) db.passkeys = [];
      const { credential } = verification.registrationInfo;
      const newPasskey = {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports || [],
      };
      
      db.passkeys.push(newPasskey);
      await writeDb(db);
      
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: "No verificado" });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/webauthn/auth-options", async (req, res) => {
  const rpID = req.headers.origin ? new URL(req.headers.origin).hostname : req.hostname;
  const db = await readDb();
  
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });
  
  webauthnChallenges["auth"] = options.challenge;
  res.json(options);
});

app.post("/api/webauthn/auth-verify", async (req, res) => {
  const rpID = req.headers.origin ? new URL(req.headers.origin).hostname : req.hostname;
  const expectedChallenge = webauthnChallenges["auth"];
  const expectedOrigin = req.headers.origin || `https://${req.hostname}`;
  const db = await readDb();
  
  if (!expectedChallenge) return res.status(400).json({ error: "Missing challenge" });
  
  const reqIdBase64URL = req.body.id;
  const passkey = (db.passkeys || []).find((pk: any) => pk.id === reqIdBase64URL);
  
  if (!passkey) return res.status(400).json({ error: "Credencial no encontrada" });
  
  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });
    
    if (verification.verified) {
      passkey.counter = verification.authenticationInfo.newCounter;
      await writeDb(db);
      
      const currentPassword = db.settings?.password || process.env.APP_PASSWORD || "admin";
      res.json({ verified: true, token: currentPassword });
    } else {
      res.status(400).json({ error: "No verificado" });
    }
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/parse-msinfo", upload.single("msinfo"), async (req, res) => {
  console.log("POST /api/parse-msinfo requested");
  if (!req.file) {
    console.log("No file uploaded for msinfo");
    return res.status(400).json({ error: "No file uploaded" });
  }
  try {
    const buffer = await fs.readFile(req.file.path);
    let content = buffer.toString('utf-8');
    // msinfo32 exports are often UTF-16LE
    if (content.includes('\u0000')) {
      content = buffer.toString('utf16le');
    }

    // Delete file immediately to save space
    await fs.unlink(req.file.path);

    const startIndex = content.indexOf("Nombre del sistema");
    const endIndex = content.indexOf("[Recursos de hardware]");

    let section = content;
    if (startIndex !== -1 && endIndex !== -1) {
      section = content.substring(startIndex, endIndex);
    } else if (startIndex !== -1) {
      section = content.substring(startIndex);
    } else if (endIndex !== -1) {
      section = content.substring(0, endIndex);
    }

    const lines = section.split(/\r?\n/);
    const parsedData = [];
    for (const line of lines) {
      if (!line.trim() || line.startsWith('[')) continue;
      
      const parts = line.split('\t');
      if (parts.length >= 2) {
        parsedData.push({ key: parts[0].trim(), value: parts.slice(1).join(' ').trim() });
      } else {
        const spaceParts = line.split(/ {2,}/);
        if (spaceParts.length >= 2) {
          parsedData.push({ key: spaceParts[0].trim(), value: spaceParts.slice(1).join(' ').trim() });
        }
      }
    }

    res.json({ data: parsedData });
  } catch (error) {
    console.error("Error in /api/parse-msinfo:", error);
    res.status(500).json({ error: "Failed to parse file" });
  }
});

app.post("/api/parse-dxdiag", upload.single("dxdiag"), async (req, res) => {
  console.log("POST /api/parse-dxdiag requested");
  if (!req.file) {
    console.log("No file uploaded for dxdiag");
    return res.status(400).json({ error: "No file uploaded" });
  }
  try {
    const buffer = await fs.readFile(req.file.path);
    let content = buffer.toString('utf-8');
    if (content.includes('\u0000')) {
      content = buffer.toString('utf16le');
    }
    await fs.unlink(req.file.path);

    const lines = content.split(/\r?\n/);
    const parsedData: { key: string; value: string }[] = [];
    
    const keysToExtract = [
      "System Manufacturer",
      "System Model",
      "BIOS",
      "Processor",
      "Memory",
      "Operating System",
      "Machine name",
      "Machine Id",
      "Card name"
    ];

    let inDiskSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes("Disk & DVD/CD-ROM Drives")) {
        inDiskSection = true;
        continue;
      }
      
      if (inDiskSection && trimmed.startsWith("------------------")) {
        // End of disk section if we hit another header
      }

      for (const key of keysToExtract) {
        if (trimmed.startsWith(key + ":")) {
          const value = trimmed.substring(key.length + 1).trim();
          parsedData.push({ key, value });
        }
      }

      if (trimmed.startsWith("Model:")) {
        const value = trimmed.substring(6).trim();
        parsedData.push({ key: inDiskSection ? "Disk Model" : "Model", value });
      }
    }

    res.json({ data: parsedData });
  } catch (error) {
    console.error("Error in /api/parse-dxdiag:", error);
    res.status(500).json({ error: "Failed to parse file" });
  }
});

// Tools API
app.get("/api/tools", async (req, res) => {
  console.log("GET /api/tools requested");
  const db = await readDb();
  res.json(db.tools || []);
});

app.post("/api/tools", upload.single("file"), async (req, res, next) => {
  try {
    const db = await readDb();
    const file = req.file as Express.Multer.File;
    
    const newTool: any = {
      id: uuidv4(),
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      url: req.body.url,
    };

    if (file) {
      newTool.url = `/uploads/${file.filename}`;
      newTool.fileName = file.originalname;
    }

    if (!db.tools) db.tools = [];
    db.tools.push(newTool);
    await writeDb(db);
    res.json(newTool);
  } catch (error) {
    next(error);
  }
});

app.put("/api/tools/:id", upload.single("file"), async (req, res) => {
  const db = await readDb();
  const index = db.tools.findIndex((t: any) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Tool not found" });
  
  const file = req.file as Express.Multer.File;
  const updatedTool = { ...db.tools[index], ...req.body };

  if (file) {
    updatedTool.url = `/uploads/${file.filename}`;
    updatedTool.fileName = file.originalname;
  }

  db.tools[index] = updatedTool;
  await writeDb(db);
  res.json(updatedTool);
});

app.delete("/api/tools/:id", async (req, res) => {
  const db = await readDb();
  if (!db.tools) db.tools = [];
  db.tools = db.tools.filter((t: any) => t.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

app.get("/api/clients", async (req, res) => {
  const db = await readDb();
  res.json(db.clients);
});

app.post("/api/clients", async (req, res) => {
  const db = await readDb();
  const newClient = { id: uuidv4(), ...req.body };
  db.clients.push(newClient);
  await writeDb(db);
  res.json(newClient);
});

app.put("/api/clients/:id", async (req, res) => {
  const db = await readDb();
  const index = db.clients.findIndex((c: any) => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.clients[index] = { ...db.clients[index], ...req.body };
  await writeDb(db);
  res.json(db.clients[index]);
});

app.delete("/api/clients/:id", async (req, res) => {
  const db = await readDb();
  const index = db.clients.findIndex((c: any) => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.clients.splice(index, 1);
  await writeDb(db);
  res.status(204).send();
});

app.get("/api/devices", async (req, res) => {
  const db = await readDb();
  res.json(db.devices);
});

app.post("/api/devices", upload.array("photos"), async (req, res, next) => {
  try {
    const db = await readDb();
    const files = req.files as Express.Multer.File[];
    const photoUrls = files ? files.map((f) => `/uploads/${f.filename}`) : [];
    
    const newDevice: any = {
      id: uuidv4(),
      ...req.body,
      photos: photoUrls,
      entryDate: req.body.entryDate || new Date().toISOString().split('T')[0],
    };

    if (req.body.msinfo) {
      try {
        newDevice.msinfo = JSON.parse(req.body.msinfo);
      } catch (e) {
        console.error("Failed to parse msinfo JSON", e);
      }
    }

    if (req.body.dxdiag) {
      try {
        newDevice.dxdiag = JSON.parse(req.body.dxdiag);
      } catch (e) {
        console.error("Failed to parse dxdiag JSON", e);
      }
    }

    if (req.body.hardwareDetails) {
      try {
        newDevice.hardwareDetails = JSON.parse(req.body.hardwareDetails);
      } catch (e) {
        console.error("Failed to parse hardwareDetails JSON", e);
      }
    }
    
    db.devices.push(newDevice);
    await writeDb(db);
    res.json(newDevice);
  } catch (error) {
    next(error);
  }
});

app.put("/api/devices/:id", upload.array("photos"), async (req, res) => {
  const db = await readDb();
  const index = db.devices.findIndex((d: any) => d.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  const files = req.files as Express.Multer.File[];
  const newPhotoUrls = files ? files.map((f) => `/uploads/${f.filename}`) : [];
  
  let existingPhotos = [];
  if (req.body.existingPhotos) {
    try {
      existingPhotos = JSON.parse(req.body.existingPhotos);
    } catch (e) {
      existingPhotos = Array.isArray(req.body.existingPhotos) ? req.body.existingPhotos : [req.body.existingPhotos];
    }
  }

  const updatedDevice = {
    ...db.devices[index],
    ...req.body,
    photos: [...existingPhotos, ...newPhotoUrls],
  };

  if (req.body.msinfo) {
    try {
      updatedDevice.msinfo = JSON.parse(req.body.msinfo);
    } catch (e) {
      console.error("Failed to parse msinfo JSON", e);
    }
  }

  if (req.body.dxdiag) {
    try {
      updatedDevice.dxdiag = JSON.parse(req.body.dxdiag);
    } catch (e) {
      console.error("Failed to parse dxdiag JSON", e);
    }
  }

  if (req.body.hardwareDetails) {
    try {
      updatedDevice.hardwareDetails = JSON.parse(req.body.hardwareDetails);
    } catch (e) {
      console.error("Failed to parse hardwareDetails JSON", e);
    }
  }
  
  db.devices[index] = updatedDevice;
  await writeDb(db);
  res.json(updatedDevice);
});

app.delete("/api/devices/:id", async (req, res) => {
  const db = await readDb();
  const index = db.devices.findIndex((d: any) => d.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  db.devices.splice(index, 1);
  await writeDb(db);
  res.json({ success: true });
});

app.post("/api/devices/:id/diagnose", async (req, res, next) => {
  try {
    const { messages } = req.body;
    const db = await readDb();
    const device = db.devices.find((d: any) => d.id === req.params.id);
    if (!device) return res.status(404).json({ error: "Equipo no encontrado" });

    // Find the client for extra context if needed
    const client = db.clients.find((c: any) => c.id === device.clientId);

    // Build details about the device
    const clientName = client ? `${client.firstName} ${client.lastName}` : "No especificado";
    const specs = device.hardwareDetails ? device.hardwareDetails.map((h: any) => `${h.key}: ${h.value}`).join(", ") : (device.hardware || "No especificado");
    
    let contextText = `=== DETALLES DEL EQUIPO ===
Marca: ${device.brand}
Modelo: ${device.model || "No especificado"}
Tipo: ${device.deviceType === "Otro" ? device.deviceTypeOther : device.deviceType}
Cliente: ${clientName}
Especificaciones del hardware: ${specs}
Problema inicial reportado: ${device.problem || "No especificado"}\n\n`;

    // Add tickets context (reports, tasks, resolutions)
    if (device.tickets && device.tickets.length > 0) {
      contextText += `=== TICKETS / TAREAS Y REPORTES REGISTRADOS ===\n`;
      device.tickets.forEach((t: any, idx: number) => {
        contextText += `Ticket #${idx + 1}:
  Fecha: ${t.date}
  Estado: ${t.isCompleted ? "Completado" : "Pendiente"}
  Descripción / Tarea: ${t.description}`;
        if (t.resolution) {
          contextText += `\n  Resolución: ${t.resolution}`;
        }
        if (t.resolutionItems && t.resolutionItems.length > 0) {
          contextText += `\n  Tareas de resolución realizadas:\n` + t.resolutionItems.map((item: any) => `    - ${item.task} (Monto: $${item.amount})`).join("\n");
        }
        contextText += `\n\n`;
      });
    } else {
      contextText += `No hay tickets registrados aún para este equipo.\n\n`;
    }

    contextText += `Usa la información anterior y las imágenes cargadas para diagnosticar problemas, responder preguntas técnicas, y sugerir procedimientos de reparación o pasos a seguir de forma directa y profesional.`;

    // Process and load images to include
    const allPhotos: string[] = [];
    if (device.photos && Array.isArray(device.photos)) {
      allPhotos.push(...device.photos);
    }
    if (device.tickets && Array.isArray(device.tickets)) {
      device.tickets.forEach((t: any) => {
        if (t.photos && Array.isArray(t.photos)) {
          allPhotos.push(...t.photos);
        }
      });
    }

    // Deduplicate and take top 3 photos to keep payload optimal and prevent 503 Service Unavailable errors due to massive payloads
    const uniquePhotos = Array.from(new Set(allPhotos)).slice(0, 3);
    const imageParts: any[] = [];

    // Read unique local files
    for (const photoUrl of uniquePhotos) {
      const filename = path.basename(photoUrl);
      const localPath = path.join(UPLOADS_DIR, filename);
      try {
        await fs.access(localPath);
        const data = await fs.readFile(localPath);
        const base64Data = data.toString("base64");
        
        let mimeType = "image/jpeg";
        if (filename.toLowerCase().endsWith(".png")) mimeType = "image/png";
        else if (filename.toLowerCase().endsWith(".gif")) mimeType = "image/gif";
        else if (filename.toLowerCase().endsWith(".webp")) mimeType = "image/webp";

        imageParts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      } catch (err) {
        console.error(`No se pudo leer la imagen local ${localPath}:`, err);
      }
    }

    // Format chat messages into Gemini API contents structure
    // We insert our context details and the rich media into the FIRST user message
    // so Gemini is grounded correctly from the beginning.
    const contents: any[] = [];

    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((msg: any, idx: number) => {
        const parts: any[] = [];
        
        if (idx === 0 && msg.role === 'user') {
          // Add grounding context text and all pictures to the initial user prompt
          parts.push({ text: `Aquí tienes la información sobre el equipo y su historial:\n${contextText}\n\nPregunta inicial del usuario: ${msg.content}` });
          imageParts.forEach((part) => parts.push(part));
        } else {
          parts.push({ text: msg.content });
        }

        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        });
      });
    } else {
      // Fallback if messages array is empty
      const parts: any[] = [{ text: `Hola, por favor asísteme con este equipo.\n${contextText}` }];
      imageParts.forEach((part) => parts.push(part));
      contents.push({
        role: "user",
        parts
      });
    }

    // Now call Gemini model!
    const apiKey = db.settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ 
        error: "La clave API de Gemini no está configurada. Por favor, añádela en la sección de Configuración del sistema." 
      });
    }

    // Initialize GoogleGenAI client
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Try multiple candidate models sequentially with exponential backoff in case of rate limits or high demand (503 errors)
    const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
    let lastError: any = null;
    let responseText = "";

    const systemInstruction = "Eres GeekyFix AI, un asistente de diagnóstico técnico experto en hardware, electrónica y software. Ayudas a los técnicos del taller a resolver problemas de computadoras, celulares, consolas y otros equipos. Analiza el problema, las especificaciones técnicas del equipo, los reportes o tareas de servicio pendientes, y las fotos del perfil del equipo (que pueden mostrar daños físicos, placas lógicas, o pantallas de error). Da respuestas en español, claras, profesionales, estructuradas y con consejos prácticos y lógicos paso a paso para diagnosticar, resolver problemas y completar los tickets. Ofrece soluciones muy detalladas electrónicas o de micro-soldadura donde amerite.";

    for (const modelName of modelsToTry) {
      let delay = 300; // start with 300ms delay
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Intentando generar contenido con ${modelName} (intento ${attempt}/3)`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction
            }
          });
          
          if (response && response.text) {
            responseText = response.text;
            console.log(`Éxito con el modelo ${modelName} en el intento ${attempt}`);
            break;
          }
        } catch (error: any) {
          console.error(`Error con modelo ${modelName} en intento ${attempt}:`, error);
          lastError = error;
          
          // Check if it's a non-transient error (like PERMISSION_DENIED or API_KEY_INVALID)
          const status = error.status || (error.error && error.error.status);
          const code = error.code || (error.error && error.error.code);
          const isTransient = status === "UNAVAILABLE" || code === 503 || status === "RESOURCE_EXHAUSTED" || code === 429 || String(error).includes("503") || String(error).includes("429");
          
          if (!isTransient) {
            // Non-transient error, break retry loop to try next model
            break;
          }

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // exponential increase
          }
        }
      }

      if (responseText) {
        break; // Stop trying other models since we succeeded
      }
    }

    if (!responseText) {
      throw lastError || new Error("No se pudo obtener respuesta de ningún modelo de Gemini tras múltiples intentos.");
    }

    res.json({ text: responseText });
  } catch (error: any) {
    console.error("Error in diagnostics assistant endpoint:", error);
    res.status(500).json({ error: error.message || "Error al procesar la solicitud con Gemini" });
  }
});

app.post("/api/devices/:id/tickets", upload.array("photos"), async (req, res, next) => {
  try {
    const db = await readDb();
    const index = db.devices.findIndex((d: any) => d.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Not found" });

    const files = req.files as Express.Multer.File[];
    const photoUrls = files ? files.map((f) => `/uploads/${f.filename}`) : [];

    const newTicket = {
      id: uuidv4(),
      date: new Date().toISOString().split('T')[0],
      description: req.body.description || "",
      resolution: req.body.resolution || "",
      resolutionItems: req.body.resolutionItems ? JSON.parse(req.body.resolutionItems) : [],
      isCompleted: req.body.isCompleted === 'true',
      photos: photoUrls,
    };

    if (!db.devices[index].tickets) {
      db.devices[index].tickets = [];
    }
    db.devices[index].tickets.push(newTicket);

    await writeDb(db);
    res.json(db.devices[index]);
  } catch (error) {
    next(error);
  }
});

app.put("/api/devices/:deviceId/tickets/:ticketId", upload.array("photos"), async (req, res, next) => {
  try {
    const db = await readDb();
    const deviceIndex = db.devices.findIndex((d: any) => d.id === req.params.deviceId);
    if (deviceIndex === -1) return res.status(404).json({ error: "Device not found" });

    const ticketIndex = db.devices[deviceIndex].tickets?.findIndex((t: any) => t.id === req.params.ticketId);
    if (ticketIndex === undefined || ticketIndex === -1) return res.status(404).json({ error: "Ticket not found" });

    const files = req.files as Express.Multer.File[];
    const newPhotoUrls = files ? files.map((f) => `/uploads/${f.filename}`) : [];
    
    let existingPhotos = [];
    if (req.body.existingPhotos) {
      try {
        existingPhotos = JSON.parse(req.body.existingPhotos);
      } catch (e) {
        existingPhotos = Array.isArray(req.body.existingPhotos) ? req.body.existingPhotos : [req.body.existingPhotos];
      }
    }

    const updatedTicket = {
      ...db.devices[deviceIndex].tickets[ticketIndex],
      description: req.body.description || "",
      resolution: req.body.resolution || "",
      resolutionItems: req.body.resolutionItems ? JSON.parse(req.body.resolutionItems) : [],
      isCompleted: req.body.isCompleted === 'true',
      photos: [...existingPhotos, ...newPhotoUrls],
    };

    db.devices[deviceIndex].tickets[ticketIndex] = updatedTicket;
    await writeDb(db);
    res.json(db.devices[deviceIndex]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/devices/:deviceId/tickets/:ticketId", async (req, res) => {
  const db = await readDb();
  const deviceIndex = db.devices.findIndex((d: any) => d.id === req.params.deviceId);
  if (deviceIndex === -1) return res.status(404).json({ error: "Device not found" });

  const ticketIndex = db.devices[deviceIndex].tickets?.findIndex((t: any) => t.id === req.params.ticketId);
  if (ticketIndex === undefined || ticketIndex === -1) return res.status(404).json({ error: "Ticket not found" });

  db.devices[deviceIndex].tickets.splice(ticketIndex, 1);
  await writeDb(db);
  res.json(db.devices[deviceIndex]);
});

app.get("/api/budgets", async (req, res) => {
  const db = await readDb();
  res.json(db.budgets || []);
});

app.post("/api/budgets", async (req, res) => {
  const db = await readDb();
  if (!db.budgets) db.budgets = [];
  const newBudget = { id: uuidv4(), ...req.body };
  db.budgets.push(newBudget);
  await writeDb(db);
  res.json(newBudget);
});

app.put("/api/budgets/:id", async (req, res) => {
  const db = await readDb();
  const index = db.budgets.findIndex((b: any) => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.budgets[index] = { ...db.budgets[index], ...req.body };
  await writeDb(db);
  res.json(db.budgets[index]);
});

app.delete("/api/budgets/:id", async (req, res) => {
  const db = await readDb();
  const index = db.budgets.findIndex((b: any) => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.budgets.splice(index, 1);
  await writeDb(db);
  res.status(204).send();
});

// Service Types API
app.get("/api/service-types", async (req, res) => {
  const db = await readDb();
  res.json(db.serviceTypes || []);
});

app.post("/api/service-types", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTypes) db.serviceTypes = [];
  const newServiceType = { id: uuidv4(), ...req.body };
  db.serviceTypes.push(newServiceType);
  await writeDb(db);
  res.json(newServiceType);
});

app.put("/api/service-types/:id", async (req, res) => {
  const db = await readDb();
  const index = db.serviceTypes.findIndex((s: any) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.serviceTypes[index] = { ...db.serviceTypes[index], ...req.body };
  await writeDb(db);
  res.json(db.serviceTypes[index]);
});

app.delete("/api/service-types/:id", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTypes) db.serviceTypes = [];
  db.serviceTypes = db.serviceTypes.filter((s: any) => s.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

// Service Tasks API
app.get("/api/service-tasks", async (req, res) => {
  const db = await readDb();
  res.json(db.serviceTasks || []);
});

app.post("/api/service-tasks", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTasks) db.serviceTasks = [];
  const newTask = { id: uuidv4(), ...req.body };
  db.serviceTasks.push(newTask);
  await writeDb(db);
  res.json(newTask);
});

app.put("/api/service-tasks/:id", async (req, res) => {
  const db = await readDb();
  const index = db.serviceTasks.findIndex((t: any) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  db.serviceTasks[index] = { ...db.serviceTasks[index], ...req.body };
  await writeDb(db);
  res.json(db.serviceTasks[index]);
});

app.delete("/api/service-tasks/:id", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTasks) db.serviceTasks = [];
  db.serviceTasks = db.serviceTasks.filter((t: any) => t.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

// Projects API
app.get("/api/projects", async (req, res) => {
  const db = await readDb();
  res.json(db.projects || []);
});

app.post("/api/projects", async (req, res) => {
  const db = await readDb();
  if (!db.projects) db.projects = [];
  const newProject = { 
    id: uuidv4(), 
    ...req.body,
    documents: [] 
  };
  db.projects.push(newProject);
  await writeDb(db);
  res.json(newProject);
});

app.put("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const index = db.projects.findIndex((p: any) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  const currentProject = db.projects[index];
  const newNotes = req.body.notes;

  if (newNotes !== undefined && newNotes !== currentProject.notes) {
    if (!currentProject.noteHistory) {
      currentProject.noteHistory = [];
    }
    // Only save to history if there was an actual previous note that isn't empty
    if (currentProject.notes && currentProject.notes.trim() !== "") {
      currentProject.noteHistory.push({
        date: new Date().toISOString(),
        notes: currentProject.notes,
        author: "Usuario"
      });
    }
    // Also, if someone passed their own noteHistory in req.body, we ignore it to prevent overriding our push
    delete req.body.noteHistory;
  }

  db.projects[index] = { ...currentProject, ...req.body };
  await writeDb(db);
  res.json(db.projects[index]);
});

app.delete("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  db.projects = db.projects.filter((p: any) => p.id !== req.params.id);
  await writeDb(db);
  res.status(204).send();
});

app.post("/api/projects/:id/documents", upload.array("files"), async (req, res, next) => {
  try {
    const db = await readDb();
    const index = db.projects.findIndex((p: any) => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Not found" });

    const project = db.projects[index];
    const projectFolderName = (project.name || "unnamed").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const projectDir = path.join(UPLOADS_DIR, "projects", projectFolderName);

    await fs.mkdir(projectDir, { recursive: true });

    const files = req.files as Express.Multer.File[];
    const newDocs = [];

    if (files) {
      for (const file of files) {
        const newPath = path.join(projectDir, file.filename);
        await fs.rename(file.path, newPath);
        newDocs.push({
          id: uuidv4(),
          name: file.originalname,
          url: `/uploads/projects/${projectFolderName}/${file.filename}`,
          type: file.mimetype.startsWith('image/') ? 'image' : 'file',
          date: new Date().toISOString().split('T')[0]
        });
      }
    }

    // Handle links if provided
    if (req.body.links) {
      try {
        const links = JSON.parse(req.body.links);
        for (const link of links) {
          newDocs.push({
            id: uuidv4(),
            name: link.name,
            url: link.url,
            type: 'link',
            date: new Date().toISOString().split('T')[0]
          });
        }
      } catch (e) {
        console.error("Error parsing links", e);
      }
    }

    project.documents.push(...newDocs);
    await writeDb(db);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions", async (req, res) => {
  const db = await readDb();
  res.json(db.transactions || []);
});

app.get("/api/receivables", async (req, res) => {
  const db = await readDb();
  res.json(db.receivables || []);
});

app.post("/api/receivables", async (req, res) => {
  const db = await readDb();
  const rec = { ...req.body, id: uuidv4() };
  if (!db.receivables) db.receivables = [];
  db.receivables.push(rec);
  await writeDb(db);
  res.json(rec);
});

app.put("/api/receivables/:id", async (req, res) => {
  const db = await readDb();
  if (!db.receivables) db.receivables = [];
  const idx = db.receivables.findIndex((r: any) => r.id === req.params.id);
  if (idx !== -1) {
    db.receivables[idx] = { ...db.receivables[idx], ...req.body };
    await writeDb(db);
    res.json(db.receivables[idx]);
  } else {
    res.status(404).json({ error: "Receivable not found" });
  }
});

app.delete("/api/receivables/:id", async (req, res) => {
  const db = await readDb();
  if (!db.receivables) db.receivables = [];
  db.receivables = db.receivables.filter((r: any) => r.id !== req.params.id);
  await writeDb(db);
  res.json({ success: true });
});

app.post("/api/transactions", async (req, res) => {
  const db = await readDb();
  const tx = { ...req.body, id: uuidv4() };
  if (!db.transactions) db.transactions = [];
  db.transactions.push(tx);
  await writeDb(db);
  res.json(tx);
});

app.put("/api/transactions/:id", async (req, res) => {
  const db = await readDb();
  if (!db.transactions) db.transactions = [];
  const idx = db.transactions.findIndex((t: any) => t.id === req.params.id);
  if (idx !== -1) {
    db.transactions[idx] = { ...db.transactions[idx], ...req.body };
    await writeDb(db);
    res.json(db.transactions[idx]);
  } else {
    res.status(404).json({ error: "Transaction not found" });
  }
});

app.get("/api/hidden-transactions", async (req, res) => {
  const db = await readDb();
  res.json(db.hiddenTransactions || []);
});

app.post("/api/hidden-transactions/:id", async (req, res) => {
  const db = await readDb();
  if (!db.hiddenTransactions) db.hiddenTransactions = [];
  if (!db.hiddenTransactions.includes(req.params.id)) {
    db.hiddenTransactions.push(req.params.id);
  }
  await writeDb(db);
  res.json({ success: true });
});

app.delete("/api/transactions/:id", async (req, res) => {
  const db = await readDb();
  if (!db.transactions) db.transactions = [];
  db.transactions = db.transactions.filter((t: any) => t.id !== req.params.id);
  await writeDb(db);
  res.json({ success: true });
});

// Backup & Restore API
app.get("/api/backup", async (req, res) => {
  console.log("GET /api/backup requested");
  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment(`geekyfix_backup_${new Date().toISOString().split('T')[0]}.zip`);
    
    archive.pipe(res);
    
    // Add the database file
    archive.file(DB_FILE, { name: 'db.json' });
    
    // Add the uploads directory
    archive.directory(UPLOADS_DIR, 'uploads');
    
    await archive.finalize();
  } catch (error) {
    console.error("Backup failed:", error);
    res.status(500).json({ error: "Backup failed" });
  }
});

app.post("/api/restore", upload.single("backup"), async (req, res) => {
  console.log("POST /api/restore requested");
  if (!req.file) {
    return res.status(400).json({ error: "No backup file uploaded" });
  }

  try {
    const zipPath = req.file.path;
    console.log(`Processing backup file at: ${zipPath}`);
    
    // Create a temporary directory for extraction
    const tempDir = path.join(DATA_DIR, "temp_restore_" + uuidv4());
    console.log(`Creating temp directory: ${tempDir}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Extract the zip
    console.log("Starting extraction...");
    await createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: tempDir }))
      .promise();
    console.log("Extraction completed.");

    // Validate extracted content
    const extractedDbPath = path.join(tempDir, 'db.json');
    const extractedUploadsDir = path.join(tempDir, 'uploads');

    try {
      await fs.access(extractedDbPath);
      console.log("db.json found in backup.");
    } catch {
      console.error("db.json NOT found in backup.");
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.unlink(zipPath);
      return res.status(400).json({ error: "Respaldo inválido: falta el archivo db.json" });
    }

    // Replace current data
    console.log("Replacing db.json...");
    await fs.copyFile(extractedDbPath, DB_FILE);

    // 2. Replace uploads directory
    console.log("Replacing uploads directory...");
    try {
      await fs.rm(UPLOADS_DIR, { recursive: true, force: true });
      console.log("Old uploads directory removed.");
    } catch (e) {
      console.log("Uploads dir didn't exist or couldn't be removed, ignoring.");
    }
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    
    try {
      await fs.access(extractedUploadsDir);
      console.log("Uploads directory found in backup, moving files...");
      // Move files from extracted uploads to real uploads
      const files = await fs.readdir(extractedUploadsDir);
      for (const file of files) {
        await fs.rename(path.join(extractedUploadsDir, file), path.join(UPLOADS_DIR, file));
      }
      console.log(`${files.length} files moved to uploads.`);
    } catch (e) {
      console.log("No uploads in backup or error moving them.");
    }

    // Cleanup
    console.log("Cleaning up temp files...");
    await fs.rm(tempDir, { recursive: true, force: true });
    try {
      await fs.access(zipPath);
      await fs.unlink(zipPath);
    } catch (e) {
      console.log("Zip file already removed or inaccessible, skipping unlink.");
    }

    console.log("Restore successful.");
    res.json({ success: true, message: "Restauración completada con éxito. Por favor, recarga la página." });
  } catch (error) {
    console.error("Restore failed with error:", error);
    res.status(500).json({ error: "Error interno al restaurar los datos." });
  }
});

// Share PDF API
app.post("/api/share-pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + 7); // 1 week

  const shareId = uuidv4();
  const fileUrl = `/uploads/${req.file.filename}`;
  
  const db = await readDb();
  if (!db.sharedFiles) db.sharedFiles = [];
  db.sharedFiles.push({
    id: shareId,
    url: fileUrl,
    expireAt: expireAt.toISOString()
  });
  await writeDb(db);

  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const publicUrl = `${protocol}://${host}/shared/${shareId}`;

  res.json({ success: true, url: publicUrl });
});

app.get("/shared/:id", async (req, res) => {
  try {
    const db = await readDb();
    const sharedFile = (db.sharedFiles || []).find((f: any) => f.id === req.params.id);
    
    if (!sharedFile) {
      return res.status(404).send("Documento no encontrado o ha expirado.");
    }

    if (new Date() > new Date(sharedFile.expireAt)) {
      return res.status(404).send("Este documento ha expirado (su validez es de 1 semana).");
    }

    const filename = sharedFile.url.replace('/uploads/', '');
    const filePath = path.join(UPLOADS_DIR, filename);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).send("Error al cargar el documento.");
  }
});

// Catch-all for unmatched API routes
app.all("/api/*", (req, res) => {
  console.log(`Unmatched API route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: "API route not found",
    method: req.method,
    url: req.originalUrl
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Handler:", err);
  res.status(err.status || 500).json({ 
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

async function startServer() {
  try {
    await initDb();

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      logApi(`Server started on port ${PORT}`);
    });
  } catch (err: any) {
    console.error("Failed to start server:", err);
    await fs.appendFile(LOG_FILE, `${new Date().toISOString()} - FATAL ERROR: ${err.message}\n${err.stack}\n`);
  }
}

startServer();
