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

// Google Authentication & Integration Routes
app.get("/api/google/status", async (req, res) => {
  try {
    const db = await readDb();
    res.json(db.googleAuth || { connected: false });
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el estado de Google" });
  }
});

app.get("/api/google/auth-url", async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : req.protocol;
    const redirectUri = `${protocol}://${req.headers.host}/auth/google/callback`;

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/tasks'
    ];

    if (!clientId) {
      // Sandbox fallback route
      const sandboxUrl = `${protocol}://${req.headers.host}/auth/google/callback`;
      return res.json({ url: sandboxUrl });
    }

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&access_type=offline&prompt=consent`;
    res.json({ url: oauthUrl });
  } catch (error) {
    res.status(500).json({ error: "No se pudo construir la URL de autenticación" });
  }
});

app.post("/api/google/disconnect", async (req, res) => {
  try {
    const db = await readDb();
    db.googleAuth = { connected: false };
    await writeDb(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "No se pudo desconectar Google" });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #FFF5F5;">
          <div style="background: white; padding: 24px; border-radius: 12px; border: 1px solid #FEB2B2; max-width: 400px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #E53E3E; margin-top: 0;">Error de Autenticación</h2>
            <p style="color: #4A5568; font-size: 14px;">${error}</p>
            <button onclick="window.close()" style="background: #E53E3E; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Cerrar Ventana</button>
          </div>
        </body>
      </html>
    `);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : req.protocol;
  const redirectUri = `${protocol}://${req.headers.host}/auth/google/callback`;

  if (!clientId || !clientSecret) {
    try {
      const db = await readDb();
      db.googleAuth = {
        connected: true,
        email: "demo@geekyfix.com",
        name: "Usuario Demo GeekyFix",
        scopes: ["profile", "email"],
        isSandbox: true,
        authenticatedAt: new Date().toISOString()
      };
      await writeDb(db);
    } catch (dbErr) {
      console.error("Error setting sandbox google session:", dbErr);
    }

    return res.send(`
      <html lang="es">
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #F0FFF4; margin: 0;">
          <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #C6F6D5; max-width: 450px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
            <div style="font-size: 48px; margin-bottom: 16px;">🌱</div>
            <h2 style="color: #38A169; margin-top: 0; font-size: 20px;">¡Modo Pruebas Activado!</h2>
            <p style="color: #4A5568; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              Has iniciado la autenticación de Google en el <strong>Modo Sandbox</strong>. Como las variables de entorno de Google no están configuradas en AI Studio, hemos simulado la vinculación exitosamente con una cuenta de demostración para que puedas testear el sistema localmente.
            </p>
            <div style="background: #EDF2F7; padding: 12px; border-radius: 8px; margin-bottom: 24px; text-align: left; font-size: 11px; font-family: monospace; color: #4A5568;">
              <strong>Variables no configuradas aún:</strong><br/>
              - GOOGLE_CLIENT_ID<br/>
              - GOOGLE_CLIENT_SECRET
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 2500);
              }
            </script>
            <p style="font-size: 12px; color: #718096; margin-bottom: 0;">Esta ventana se cerrará automáticamente...</p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const tokenRes = await globalThis.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    
    const profileRes = await globalThis.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`
      }
    });

    let profileData: any = {};
    if (profileRes.ok) {
      profileData = await profileRes.json();
    }

    const db = await readDb();
    db.googleAuth = {
      connected: true,
      email: profileData.email || "conectado@gmail.com",
      name: profileData.name || "Usuario Google",
      picture: profileData.picture || "",
      isSandbox: false,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      scopes: tokenData.scope ? tokenData.scope.split(' ') : ["profile", "email"],
      authenticatedAt: new Date().toISOString()
    };
    
    await writeDb(db);

    return res.send(`
      <html lang="es">
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #F0FFF4; margin: 0;">
          <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #C6F6D5; max-width: 450px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h2 style="color: #38A169; margin-top: 0; font-size: 20px;">¡Autenticación Exitosa!</h2>
            <p style="color: #4A5568; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              Tu cuenta de Google (<strong>${profileData.email || ""}</strong>) ha sido vinculada correctamente con GeekyFix. El asistente ya puede interactuar con ella si es necesario.
            </p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 2500);
              }
            </script>
            <p style="font-size: 12px; color: #718096; margin-bottom: 0;">Esta ventana se cerrará automáticamente...</p>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Error exchanging token:", err);
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #FFF5F5;">
          <div style="background: white; padding: 24px; border-radius: 12px; border: 1px solid #FEB2B2; max-width: 400px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #E53E3E; margin-top: 0;">Falla en Intercambio de Token</h2>
            <p style="color: #4A5568; font-size: 14px; line-height: 1.4;">${err.message || 'Error desconocido'}</p>
            <button onclick="window.close()" style="background: #E53E3E; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 12px;">Cerrar Ventana</button>
          </div>
        </body>
      </html>
    `);
  }
});

// Helper to refresh Google OAuth access token automatically
async function getFreshGoogleAccessToken(db: any) {
  if (!db.googleAuth || !db.googleAuth.connected) {
    throw new Error("Google no está conectado");
  }

  if (db.googleAuth.isSandbox) {
    return "sandbox-access-token";
  }

  const { accessToken, refreshToken, expiresAt } = db.googleAuth;
  
  // If token is still valid (with 1 min buffer), return it
  if (expiresAt && expiresAt > Date.now() + 60000) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error("No hay token de actualización disponible. Por favor vuelva a autenticar.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Fallback if environment is not fully configured
    return accessToken;
  }

  // Exchange refresh token for new access token
  const tokenRes = await globalThis.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Falla al refrescar token de Google:", errText);
    throw new Error("No se pudo renovar la sesión de Google. Por favor vuelva a autenticar.");
  }

  const tokenData = await tokenRes.json();
  db.googleAuth.accessToken = tokenData.access_token;
  if (tokenData.expires_in) {
    db.googleAuth.expiresAt = Date.now() + (tokenData.expires_in * 1000);
  } else {
    db.googleAuth.expiresAt = Date.now() + 3600000;
  }

  await writeDb(db);
  return tokenData.access_token;
}

// Helper to get or create secondary "GeekyFix" Google Calendar
async function getOrCreateGeekyFixCalendar(token: string, db: any) {
  if (db.googleAuth?.calendarId) {
    return db.googleAuth.calendarId;
  }

  const preferredCalendarId = "49dd6a183075509fa8990acf8862a6f0273f77815459416ef8aab0128abd231c@group.calendar.google.com";

  try {
    // Attempt to access/verify the preferred calendar ID
    const verifyRes = await globalThis.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(preferredCalendarId)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (verifyRes.ok) {
      if (!db.googleAuth) {
        db.googleAuth = {};
      }
      db.googleAuth.calendarId = preferredCalendarId;
      await writeDb(db);
      return preferredCalendarId;
    }
  } catch (err) {
    console.warn("Could not access preferred calendar ID, attempting fallback lookup:", err);
  }

  try {
    // 1. List calendar list to find "GeekyFix"
    const listRes = await globalThis.fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Error listing calendars:", errText);
      throw new Error(`Google Calendar List Error: ${errText}`);
    }

    const listData = await listRes.json();
    const existingCal = listData.items?.find((cal: any) => cal.summary === "GeekyFix" || cal.summary === "geekyfix");

    if (existingCal) {
      db.googleAuth.calendarId = existingCal.id;
      await writeDb(db);
      return existingCal.id;
    }

    // 2. Not found, create it
    const createRes = await globalThis.fetch("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: "GeekyFix",
        description: "Calendario de servicios y proyectos para GeekyFix"
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Error creating calendar:", errText);
      throw new Error(`Google Calendar Creation Error: ${errText}`);
    }

    const createData = await createRes.json();
    db.googleAuth.calendarId = createData.id;
    await writeDb(db);
    return createData.id;
  } catch (err: any) {
    console.error("Helper getOrCreateGeekyFixCalendar exception:", err);
    throw err;
  }
}

// Helper to get or create secondary "GeekyFix" Google Tasks List
async function getOrCreateGeekyFixTaskList(token: string, db: any) {
  if (db.googleAuth?.taskListId) {
    return db.googleAuth.taskListId;
  }

  try {
    const listRes = await globalThis.fetch("https://www.googleapis.com/tasks/v1/users/@me/lists", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Error listing task lists:", errText);
      throw new Error(`Google Tasks List Error: ${errText}`);
    }

    const listData = await listRes.json();
    const existingList = listData.items?.find((list: any) => list.title === "GeekyFix" || list.title === "geekyfix");

    if (existingList) {
      if (!db.googleAuth) {
        db.googleAuth = {};
      }
      db.googleAuth.taskListId = existingList.id;
      await writeDb(db);
      return existingList.id;
    }

    // List not found, create "GeekyFix"
    const createRes = await globalThis.fetch("https://www.googleapis.com/tasks/v1/users/@me/lists", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "GeekyFix"
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Error creating Google Tasks list:", errText);
      throw new Error(`Google Tasks list creation error: ${errText}`);
    }

    const createData = await createRes.json();
    if (!db.googleAuth) {
      db.googleAuth = {};
    }
    db.googleAuth.taskListId = createData.id;
    await writeDb(db);
    return createData.id;
  } catch (err: any) {
    console.error("Helper getOrCreateGeekyFixTaskList exception:", err);
    throw err;
  }
}

// Create task in Google Tasks "GeekyFix" list from a local ServiceTask
async function createGoogleTaskFromLocal(localTask: any, db: any) {
  if (!db.googleAuth || !db.googleAuth.connected || db.googleAuth.isSandbox) {
    return null;
  }

  try {
    const token = await getFreshGoogleAccessToken(db);
    const tasklistId = await getOrCreateGeekyFixTaskList(token, db);

    let clientName = "Cliente Desconocido";
    if (localTask.clientId) {
      const cli = db.clients?.find((c: any) => c.id === localTask.clientId);
      if (cli) {
        clientName = `${cli.firstName} ${cli.lastName}`;
      }
    }

    const taskObj: any = {
      title: `🔧 GeekyFix: ${localTask.description.split('\n')[0] || "Servicio"}`,
      notes: `Detalle del Servicio:\nCliente: ${clientName}\nTiempo empleado: ${localTask.duration || "N/A"}\nMonto cobrado: $${localTask.amount || 0}\n\nDescripción:\n${localTask.description}`,
      status: localTask.isCompleted ? "completed" : "needsAction"
    };

    if (localTask.date) {
      const parsedDate = new Date(localTask.date);
      taskObj.due = parsedDate.toISOString();
    }

    const createTaskRes = await globalThis.fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(taskObj)
    });

    if (createTaskRes.ok) {
      const taskData = await createTaskRes.json();
      return taskData.id;
    } else {
      const errText = await createTaskRes.text();
      console.error("Failed to create task on Google Tasks:", errText);
    }
  } catch (err) {
    console.error("Failed to create task on Google Tasks exception:", err);
  }
  return null;
}

// Update task in Google Tasks "GeekyFix" list from a local ServiceTask
async function updateGoogleTaskFromLocal(localTask: any, db: any) {
  if (!db.googleAuth || !db.googleAuth.connected || db.googleAuth.isSandbox) {
    return;
  }

  try {
    const token = await getFreshGoogleAccessToken(db);
    const tasklistId = await getOrCreateGeekyFixTaskList(token, db);

    if (!localTask.googleTaskId) {
      // Create it since it has no ID linked yet
      const taskId = await createGoogleTaskFromLocal(localTask, db);
      if (taskId) {
        localTask.googleTaskId = taskId;
      }
      return;
    }

    let clientName = "Cliente Desconocido";
    if (localTask.clientId) {
      const cli = db.clients?.find((c: any) => c.id === localTask.clientId);
      if (cli) {
        clientName = `${cli.firstName} ${cli.lastName}`;
      }
    }

    const taskObj: any = {
      title: `🔧 GeekyFix: ${localTask.description.split('\n')[0] || "Servicio"}`,
      notes: `Detalle del Servicio:\nCliente: ${clientName}\nTiempo empleado: ${localTask.duration || "N/A"}\nMonto cobrado: $${localTask.amount || 0}\n\nDescripción:\n${localTask.description}`,
      status: localTask.isCompleted ? "completed" : "needsAction"
    };

    if (localTask.date) {
      const parsedDate = new Date(localTask.date);
      taskObj.due = parsedDate.toISOString();
    }

    const updateTaskRes = await globalThis.fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${encodeURIComponent(localTask.googleTaskId)}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(taskObj)
    });

    if (!updateTaskRes.ok) {
      const errText = await updateTaskRes.text();
      console.error("Failed to update task on Google Tasks:", errText);
    }
  } catch (err) {
    console.error("Failed to update task on Google Tasks exception:", err);
  }
}

// Delete task from Google Tasks "GeekyFix" list
async function deleteGoogleTask(googleTaskId: string, db: any) {
  if (!db.googleAuth || !db.googleAuth.connected || db.googleAuth.isSandbox || !googleTaskId) {
    return;
  }

  try {
    const token = await getFreshGoogleAccessToken(db);
    const tasklistId = await getOrCreateGeekyFixTaskList(token, db);

    const deleteRes = await globalThis.fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${encodeURIComponent(googleTaskId)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error("Failed to delete task from Google Tasks:", errText);
    }
  } catch (err) {
    console.error("Error deleting Google Task:", err);
  }
}

// Bidirectional Google Tasks <-> Local Database Synchronizer
async function syncGoogleTasks(db: any) {
  if (!db.googleAuth || !db.googleAuth.connected) {
    return false;
  }

  // Sandbox simulation: create virtual test tasks if missing
  if (db.googleAuth.isSandbox) {
    if (!db.serviceTasks) {
      db.serviceTasks = [];
    }
    const hasSandboxTask = db.serviceTasks.some((t: any) => t.googleTaskId && t.googleTaskId.startsWith("sandbox-gtask"));
    if (!hasSandboxTask) {
      db.serviceTasks.push({
        id: "sandbox-local-gtask-1",
        clientId: "",
        date: new Date().toISOString().split('T')[0],
        description: "🔧 GeekyFix (Sandbox): Cambiar Pantalla iPhone 13",
        duration: "1h 30m",
        amount: 8500,
        isCompleted: false,
        googleTaskId: "sandbox-gtask-1"
      });
      db.serviceTasks.push({
        id: "sandbox-local-gtask-2",
        clientId: "",
        date: new Date().toISOString().split('T')[0],
        description: "🔧 GeekyFix (Sandbox): Limpieza Física PS5",
        duration: "1h",
        amount: 5000,
        isCompleted: true,
        googleTaskId: "sandbox-gtask-2"
      });
      await writeDb(db);
    }
    return true;
  }

  try {
    const token = await getFreshGoogleAccessToken(db);
    const tasklistId = await getOrCreateGeekyFixTaskList(token, db);

    // Fetch all Google Tasks (completed + active)
    const listsRes = await globalThis.fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks?showCompleted=true&showHidden=true&maxResults=100`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!listsRes.ok) {
      const errText = await listsRes.text();
      console.error("Error fetching tasks list from Google:", errText);
      return false;
    }

    const tasksData = await listsRes.json();
    const googleTasksList: any[] = tasksData.items || [];
    const googleTaskMap = new Map<string, any>(googleTasksList.map((t: any) => [t.id, t]));

    let dbChanged = false;
    if (!db.serviceTasks) {
      db.serviceTasks = [];
    }

    // 1. Sync local tasks to Google Tasks (or update statuses)
    for (let i = 0; i < db.serviceTasks.length; i++) {
      const localTask = db.serviceTasks[i];
      if (localTask.googleTaskId) {
        const matchingGTask = googleTaskMap.get(localTask.googleTaskId);
        if (matchingGTask) {
          const gTaskIsCompleted = matchingGTask.status === "completed";
          if (localTask.isCompleted !== gTaskIsCompleted) {
            localTask.isCompleted = gTaskIsCompleted;
            dbChanged = true;
          }
        }
      } else {
        // Create new Google task from local task
        try {
          const taskId = await createGoogleTaskFromLocal(localTask, db);
          if (taskId) {
            localTask.googleTaskId = taskId;
            dbChanged = true;
          }
        } catch (postErr) {
          console.error("Failed to automatically create Google Task:", postErr);
        }
      }
    }

    // 2. Sync Google Tasks that are missing locally (vice versa import)
    const localGoogleTaskIds = new Set(db.serviceTasks.map((t: any) => t.googleTaskId).filter(Boolean));
    for (const gTask of googleTasksList) {
      if (!localGoogleTaskIds.has(gTask.id)) {
        const isCompleted = gTask.status === "completed";
        const title = gTask.title || "Tarea Importada de Google Tasks";
        
        let cleanDescription = title;
        if (title.startsWith("🔧 GeekyFix:")) {
          cleanDescription = title.replace("🔧 GeekyFix:", "").trim();
        }

        let taskDate = new Date().toISOString().split('T')[0];
        if (gTask.due) {
          taskDate = gTask.due.split('T')[0];
        }

        db.serviceTasks.push({
          id: uuidv4(),
          clientId: "",
          date: taskDate,
          description: gTask.notes ? `${cleanDescription}\n\n[Google Tasks]: ${gTask.notes}` : cleanDescription,
          duration: "1h",
          amount: 0,
          isCompleted: isCompleted,
          googleTaskId: gTask.id
        });
        dbChanged = true;
      }
    }

    if (dbChanged) {
      await writeDb(db);
    }
    return true;
  } catch (error) {
    console.error("syncGoogleTasks internal error:", error);
    return false;
  }
}

// Fetch events from the GeekyFix Google Calendar
app.get("/api/google/calendar/events", async (req, res) => {
  try {
    const db = await readDb();
    if (!db.googleAuth || !db.googleAuth.connected) {
      return res.json({ connected: false, events: [] });
    }

    if (db.googleAuth.isSandbox) {
      return res.json({
        connected: true,
        isSandbox: true,
        events: [
          {
            id: "sandbox-event-1",
            summary: "🔧 GeekyFix: Reparación Laptop HP",
            description: "Modo Sandbox: Servicio de ejemplo",
            start: { dateTime: new Date().toISOString() },
            end: { dateTime: new Date(Date.now() + 3600000).toISOString() }
          }
        ]
      });
    }

    const token = await getFreshGoogleAccessToken(db);
    const calendarId = await getOrCreateGeekyFixCalendar(token, db);

    const eventsRes = await globalThis.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&singleEvents=true`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!eventsRes.ok) {
      const errText = await eventsRes.text();
      throw new Error(`Google Calendar Events API Error: ${errText}`);
    }

    const eventsData = await eventsRes.json();
    res.json({ connected: true, events: eventsData.items || [] });
  } catch (error: any) {
    console.error("Error fetching Google Calendar events:", error);
    res.status(500).json({ error: error.message || "No se pudieron obtener los eventos de Google Calendar" });
  }
});

// 1. Google Calendar Integration - Create Event
app.post("/api/google/calendar/create", async (req, res) => {
  try {
    const { title, description, date, time, durationMinutes, location } = req.body;
    const db = await readDb();
    
    if (db.googleAuth?.isSandbox) {
      return res.json({ success: true, message: "Evento guardado (Modo Sandbox)", simulated: true });
    }

    const token = await getFreshGoogleAccessToken(db);
    const calendarId = await getOrCreateGeekyFixCalendar(token, db);

    let startDateTime = `${date}T${time || "09:00"}:00`;
    const duration = durationMinutes ? parseInt(durationMinutes) : 60;
    const startDateObj = new Date(startDateTime);
    const endDateObj = new Date(startDateObj.getTime() + duration * 60000);

    const event = {
      summary: title,
      description: description,
      location: location || "",
      start: {
        dateTime: startDateObj.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires"
      },
      end: {
        dateTime: endDateObj.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires"
      },
      reminders: {
        useDefault: true
      }
    };

    const calendarRes = await globalThis.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    });

    if (!calendarRes.ok) {
      const errText = await calendarRes.text();
      throw new Error(`Google Calendar API Error: ${errText}`);
    }

    const eventData = await calendarRes.json();
    res.json({ success: true, eventId: eventData.id });
  } catch (error: any) {
    console.error("Error creating Google Calendar event:", error);
    res.status(500).json({ error: error.message || "No se pudo crear el evento en Google Calendar" });
  }
});

// 2. Google Tasks Integration - Create Task
app.post("/api/google/tasks/create", async (req, res) => {
  try {
    const { title, notes, dueDate } = req.body;
    const db = await readDb();

    if (db.googleAuth?.isSandbox) {
      return res.json({ success: true, message: "Tarea creada (Modo Sandbox)", simulated: true });
    }

    const token = await getFreshGoogleAccessToken(db);
    const tasklistId = await getOrCreateGeekyFixTaskList(token, db);

    const taskObj: any = {
      title: title,
      notes: notes || ""
    };

    if (dueDate) {
      const parsedDate = new Date(dueDate);
      taskObj.due = parsedDate.toISOString();
    }

    const createTaskRes = await globalThis.fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(taskObj)
    });

    if (!createTaskRes.ok) {
      const errText = await createTaskRes.text();
      throw new Error(`Google Tasks Create Task Error: ${errText}`);
    }

    const taskData = await createTaskRes.json();
    res.json({ success: true, taskId: taskData.id });
  } catch (error: any) {
    console.error("Error creating Google Task:", error);
    res.status(500).json({ error: error.message || "No se pudo crear la tarea en Google Tasks" });
  }
});

// 3. Google Sheets Integration - Export Data
app.post("/api/google/sheets/export", async (req, res) => {
  try {
    const { dataType } = req.body;
    const db = await readDb();

    if (db.googleAuth?.isSandbox) {
      return res.json({ 
        success: true, 
        message: "Planilla exportada (Modo Sandbox)", 
        url: "https://docs.google.com/spreadsheets", 
        simulated: true 
      });
    }

    const token = await getFreshGoogleAccessToken(db);

    const title = `Exportación de GeekyFix - ${new Date().toLocaleDateString('es-AR')}`;
    const createSheetRes = await globalThis.fetch("https://www.googleapis.com/sheets/v4/spreadsheets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        properties: {
          title: title
        }
      })
    });

    if (!createSheetRes.ok) {
      const errText = await createSheetRes.text();
      throw new Error(`Google Sheets Create Error: ${errText}`);
    }

    const sheetData = await createSheetRes.json();
    const spreadsheetId = sheetData.spreadsheetId;
    const spreadsheetUrl = sheetData.spreadsheetUrl;

    const clients = db.clients || [];
    const projects = db.projects || [];
    const budgets = db.budgets || [];
    const transactions = db.transactions || [];

    if (dataType === 'all') {
      const sheetsToAdd = ["Proyectos", "Presupuestos", "Finanzas"];
      const requests: any[] = sheetsToAdd.map(t => ({
        addSheet: {
          properties: {
            title: t
          }
        }
      }));

      requests.unshift({
        updateSheetProperties: {
          properties: {
            sheetId: sheetData.sheets?.[0]?.properties?.sheetId || 0,
            title: "Clientes"
          },
          fields: "title"
        } as any
      });

      const addSheetsRes = await globalThis.fetch(`https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requests })
      });

      if (!addSheetsRes.ok) {
        console.error("Could not add sub-sheets");
      }

      const clientRows = [["ID", "Nombre", "Apellido", "WhatsApp", "Email", "Dirección", "Tipo"]];
      clients.forEach((c: any) => clientRows.push([c.id, c.firstName, c.lastName, c.whatsapp || "", c.email || "", c.address || "", c.type || ""]));

      const projectRows = [["ID", "Nombre Proyecto", "ID Cliente", "Inicio", "Descripción", "Estado"]];
      projects.forEach((p: any) => projectRows.push([p.id, p.name, p.clientId, p.startDate, p.description, p.status]));

      const budgetRows = [["ID", "Cliente", "Fecha", "Detalles Items", "Total", "Estado"]];
      budgets.forEach((b: any) => {
        const itemSummaries = b.items?.map((it: any) => `${it.title} (x${it.quantity}): $${it.amount}`).join("; ");
        const clientName = clients.find((c: any) => c.id === b.clientId);
        const nameStr = clientName ? `${clientName.firstName} ${clientName.lastName}` : b.clientId;
        budgetRows.push([b.id, nameStr, b.date, itemSummaries || "", b.total, b.status || "pending"]);
      });

      const financeRows = [["ID", "Fecha", "Tipo", "Categoría", "Descripción", "Monto"]];
      transactions.forEach((t: any) => financeRows.push([t.id, t.date, t.type, t.category, t.description, t.amount]));

      const populateRes = await globalThis.fetch(`https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [
            { range: "Clientes!A1", values: clientRows },
            { range: "Proyectos!A1", values: projectRows },
            { range: "Presupuestos!A1", values: budgetRows },
            { range: "Finanzas!A1", values: financeRows }
          ]
        })
      });

      if (!populateRes.ok) {
        const populateErr = await populateRes.text();
        throw new Error(`Google Sheets Populate Error: ${populateErr}`);
      }
    } else {
      let rows: any[] = [];
      let sheetName = "Sheet1";
      if (dataType === 'clients') {
        sheetName = "Clientes";
        rows = [["ID", "Nombre", "Apellido", "WhatsApp", "Email", "Dirección", "Tipo"]];
        clients.forEach((c: any) => rows.push([c.id, c.firstName, c.lastName, c.whatsapp || "", c.email || "", c.address || "", c.type || ""]));
      } else if (dataType === 'projects') {
        sheetName = "Proyectos";
        rows = [["ID", "Nombre Proyecto", "ID Cliente", "Inicio", "Descripción", "Estado"]];
        projects.forEach((p: any) => rows.push([p.id, p.name, p.clientId, p.startDate, p.description, p.status]));
      } else if (dataType === 'budgets') {
        sheetName = "Presupuestos";
        rows = [["ID", "Cliente", "Fecha", "Detalles Items", "Total", "Estado"]];
        budgets.forEach((b: any) => {
          const itemSummaries = b.items?.map((it: any) => `${it.title} (x${it.quantity}): $${it.amount}`).join("; ");
          const clientName = clients.find((c: any) => c.id === b.clientId);
          const nameStr = clientName ? `${clientName.firstName} ${clientName.lastName}` : b.clientId;
          rows.push([b.id, nameStr, b.date, itemSummaries || "", b.total, b.status || "pending"]);
        });
      } else if (dataType === 'finance') {
        sheetName = "Finanzas";
        rows = [["ID", "Fecha", "Tipo", "Categoría", "Descripción", "Monto"]];
        transactions.forEach((t: any) => rows.push([t.id, t.date, t.type, t.category, t.description, t.amount]));
      }

      await globalThis.fetch(`https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId: sheetData.sheets?.[0]?.properties?.sheetId || 0,
                title: sheetName
              },
              fields: "title"
            }
          }]
        })
      });

      const populateRes = await globalThis.fetch(`https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [{ range: `${sheetName}!A1`, values: rows }]
        })
      });

      if (!populateRes.ok) {
        const populateErr = await populateRes.text();
        throw new Error(`Google Sheets Single Sheet Populate Error: ${populateErr}`);
      }
    }

    res.json({ success: true, url: spreadsheetUrl, spreadsheetId });
  } catch (error: any) {
    console.error("Error creating Google Sheet:", error);
    res.status(500).json({ error: error.message || "No se pudo exportar a Google Sheets" });
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

    // Deduplicate and take top 10 photos to keep payload optimal
    const uniquePhotos = Array.from(new Set(allPhotos)).slice(0, 10);
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
    // Initialize GoogleGenAI client
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: "Eres GeekyFix AI, un asistente de diagnóstico técnico experto en hardware, electrónica y software. Ayudas a los técnicos del taller a resolver problemas de computadoras, celulares, consolas y otros equipos. Analiza el problema, las especificaciones técnicas del equipo, los reportes o tareas de servicio pendientes, y las fotos del perfil del equipo (que pueden mostrar daños físicos, placas lógicas, o pantallas de error). Da respuestas en español, claras, profesionales, estructuradas y con consejos prácticos y lógicos paso a paso para diagnosticar, resolver problemas y completar los tickets. Ofrece soluciones muy detalladas electrónicas o de micro-soldadura donde amerite."
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error in diagnostics assistant endpoint:", error);
    let errorMessage = "Error al procesar la solicitud con Gemini";
    const errorStr = (error.message || "") + " " + JSON.stringify(error);
    
    if (errorStr.includes("high demand") || errorStr.includes("503") || errorStr.includes("UNAVAILABLE")) {
      errorMessage = "El asistente de IA está experimentando una alta demanda en este momento. Por favor, realiza la pregunta nuevamente en unos segundos.";
    } else if (errorStr.includes("quota") || errorStr.includes("rate limit") || errorStr.includes("Resource has been exhausted") || errorStr.includes("429")) {
      errorMessage = "Se ha alcanzado temporariamente el límite de consultas de la API. Por favor, aguarda un instante y vuelve a intentar.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ error: errorMessage });
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
  try {
    await syncGoogleTasks(db);
  } catch (syncErr) {
    console.error("Failed to sync google tasks on service GET:", syncErr);
  }
  res.json(db.serviceTasks || []);
});

app.post("/api/service-tasks", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTasks) db.serviceTasks = [];
  const newTask = { id: uuidv4(), ...req.body };
  
  try {
    const googleTaskId = await createGoogleTaskFromLocal(newTask, db);
    if (googleTaskId) {
      newTask.googleTaskId = googleTaskId;
    }
  } catch (err) {
    console.error("Failed to automatically export service task to Google Tasks:", err);
  }

  db.serviceTasks.push(newTask);
  await writeDb(db);
  res.json(newTask);
});

app.put("/api/service-tasks/:id", async (req, res) => {
  const db = await readDb();
  const index = db.serviceTasks.findIndex((t: any) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  
  const updatedTask = { ...db.serviceTasks[index], ...req.body };

  try {
    await updateGoogleTaskFromLocal(updatedTask, db);
  } catch (err) {
    console.error("Failed to update Google Task during PUT:", err);
  }

  db.serviceTasks[index] = updatedTask;
  await writeDb(db);
  res.json(db.serviceTasks[index]);
});

app.delete("/api/service-tasks/:id", async (req, res) => {
  const db = await readDb();
  if (!db.serviceTasks) db.serviceTasks = [];
  
  const taskToDelete = db.serviceTasks.find((t: any) => t.id === req.params.id);
  if (taskToDelete && taskToDelete.googleTaskId) {
    try {
      await deleteGoogleTask(taskToDelete.googleTaskId, db);
    } catch (err) {
      console.error("Failed to delete Google Tasks on deletion:", err);
    }
  }

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
