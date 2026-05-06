import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import unzipper from "unzipper";

const app = express();
const PORT = 3000;
const DATA_DIR = process.env.DATA_PATH || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/data", express.static(DATA_DIR));

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
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ clients: [], devices: [], tools: [], budgets: [], serviceTypes: [], serviceTasks: [], projects: [], settings: {}, transactions: [] }));
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
  const currentPassword = db.settings?.password || process.env.APP_PASSWORD || "geekyfix123";
  
  if (password === currentPassword) {
    res.json({ success: true, token: currentPassword });
  } else {
    res.status(401).json({ error: "Contraseña incorrecta" });
  }
});

app.use("/api", async (req, res, next) => {
  if (req.path === "/login" || req.path === "/health" || req.path === "/debug") {
    return next();
  }
  
  const appToken = req.headers['x-app-token'] as string | undefined;
  const tokenQuery = req.query.token as string | undefined;
  
  const token = appToken || tokenQuery;
  
  try {
    const db = await readDb();
    const currentPassword = db.settings?.password || process.env.APP_PASSWORD || "geekyfix123";
    
    if (!token || token !== currentPassword) {
      console.log(`[AUTH FAILED] Path: ${req.path}, Token received: ${token}, Expected: ${currentPassword}`);
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
  const storedPassword = db.settings?.password || process.env.APP_PASSWORD || "geekyfix123";
  
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
