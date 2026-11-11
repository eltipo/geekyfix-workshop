# Cliente de Diagnóstico para Windows 10/11 en GeekyFix Workshop

Plan para implementar una solución portable e independiente (.exe y script) para Windows 10 y 11 que permite ejecutar un diagnóstico profundo en la PC del cliente y subir automáticamente los resultados a la ficha del equipo en GeekyFix para análisis con Gemini AI.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> El usuario confirmó que la herramienta deseada es un **aplicativo portable independiente (.exe)**, que se descargará y vinculará directamente desde la **ficha de cada equipo**, y que recolectará de forma integral:
> - Hardware (CPU, RAM, Placa Madre, GPU) y estado SMART de discos.
> - Pantallazos azules (BSOD, minidumps) y registros críticos del Visor de Eventos.
> - Estado de batería (diseño, capacidad actual, ciclos), temperaturas y adaptadores de red.
> - Programas en inicio, antivirus activo y controladores (drivers) con errores en Administrador de Dispositivos.

- **Formato del Cliente**: Aplicación portable `.exe` (compilada con Go o PowerShell compilado mediante `PS2EXE`/script empaquetado) que no requiere instalación previa ni dependencias externas.
- **Mecanismo de Ejecución y Descarga**: Desde la ficha del equipo en GeekyFix (`/devices`), el técnico tendrá un botón **"Generar Diagnóstico Windows"** que descarga el ejecutable preconfigurado o un comando directo de 1 línea con el ID del equipo.
- **Envío Seguro**: El cliente enviará el informe JSON estructurado directamente a un nuevo endpoint en el backend (`/api/devices/:id/diagnostic-report`), que guardará el diagnóstico y activará el asistente Gemini AI para generar un resumen técnico inmediato con sugerencias de reparación.

---

## 1. Overview & Core Concept

### ¿Qué hace el cliente de diagnóstico?
1. El técnico ingresa una PC de cliente a GeekyFix (o abre una ficha existente).
2. En la ficha del equipo, presiona **"Descargar Cliente de Diagnóstico (.exe)"** o copia un comando rápido PowerShell `irm ... | iex` que descarga el ejecutable portable.
3. El técnico (o el cliente en su casa) ejecuta el archivo `.exe` con 1 clic (solicita elevación UAC estándar de Windows para acceder a SMART y EventLog).
4. El ejecutable corre pruebas pasivas durante 15 a 30 segundos:
   - Inspecciona componentes vía WMI / CIM / PowerShell API de Windows.
   - Analiza la salud SMART de los discos (revisa sectores reasignados, advertencias y temperatura).
   - Extrae eventos críticos de Kernel-Power, errores WHEA y BSOD recientes (`System` event log + `C:\Windows\Minidump`).
   - Revisa el informe de batería (conteo de ciclos, degradación porcentual frente a capacidad de fábrica).
   - Identifica dispositivos con código de error en el Administrador de Dispositivos (código 43, 28, etc.).
   - Lista antivirus activo (Windows Defender / terceros) y programas pesados en el inicio.
5. Sube el paquete de diagnóstico vía HTTPS al servidor GeekyFix vinculado al ID del equipo.
6. En GeekyFix, la ficha del equipo muestra una pestaña **"Diagnóstico en Vivo"** con semáforos de salud (Verde/Amarillo/Rojo), desglose técnico y botón de **"Analizar con GeekyFix AI"** para redactar presupuesto o plan de reparación.

---

## 2. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                   PC con Windows 10 / 11                    │
│                                                             │
│   GeekyFixDiag.exe (Portable / Standalone)                  │
│   ├── WMI / CIM Collectors (CPU, RAM, Placa, GPU)           │
│   ├── Storage & SMART Inspector (Get-PhysicalDisk, Smart)   │
│   ├── EventLog & BSOD Analyzer (Kernel-Power, Bugcheck)     │
│   ├── Battery & Thermal Report (Win32_Battery, PowerCfg)    │
│   └── Network & Startup Engine                              │
│                                                             │
│                HTTP POST JSON + Logs                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    GeekyFix Server                          │
│                                                             │
│   POST /api/devices/:id/diagnostic-report                   │
│   GET  /api/devices/:id/diagnostic-agent (Genera el .exe/ps)│
│                                                             │
│   ├── Almacena en db.json (device.diagnosticReport)         │
│   └── Pasa contexto a Gemini AI (POST /api/diagnose/:id)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 GeekyFix Web Interface                      │
│                                                             │
│   Pestaña "Diagnóstico Hardware & Sistema" en DevicesList   │
│   ├── Semáforos de Salud: Discos, Batería, BSOD, Drivers    │
│   ├── Visor Interactivo de Alertas y Eventos Críticos       │
│   └── Botón "Generar Presupuesto con estos hallazgos"       │
└─────────────────────────────────────────────────────────────┘
```

### Estructura de Datos del Diagnóstico (`DiagnosticReport`)

```typescript
export interface DiagnosticReport {
  timestamp: string;
  os: {
    caption: string; // ej. Windows 11 Pro 23H2
    build: string;
    architecture: string;
    uptime: string;
    installDate: string;
  };
  hardware: {
    cpu: { name: string; cores: number; threads: number; maxClock: number; currentUsage: number };
    ram: { totalGB: number; freeGB: number; usedPercent: number; speedMHz: number; slotsUsed: string };
    motherboard: { manufacturer: string; product: string; serialNumber: string; biosVersion: string };
    gpu: { name: string; driverVersion: string; vramGB?: number }[];
  };
  storage: {
    model: string;
    sizeGB: number;
    mediaType: string; // SSD / NVMe / HDD
    healthStatus: "Healthy" | "Warning" | "Unhealthy" | "Unknown";
    temperatureC?: number;
    smartAlerts?: string[];
    partitions: { driveLetter: string; freeGB: number; totalGB: number; percentFree: number }[];
  }[];
  battery?: {
    present: boolean;
    designedCapacityMWh?: number;
    fullChargeCapacityMWh?: number;
    healthPercent?: number;
    cycleCount?: number;
    status: string;
  };
  bsodAndCrashes: {
    date: string;
    eventID: number;
    source: string;
    message: string;
    bugcheckCode?: string;
  }[];
  driversWithIssues: {
    name: string;
    hardwareID: string;
    statusCode: number;
    statusDescription: string;
  }[];
  securityAndStartup: {
    antivirus: string[];
    firewallEnabled: boolean;
    startupApps: { name: string; command: string }[];
  };
  network: {
    name: string;
    ipAddress: string;
    macAddress: string;
    status: string;
  }[];
}
```

---

## 3. User Experience & Visual Design

### Flujo en la interfaz de GeekyFix:
1. **Acceso desde la ficha del equipo**:
   - En el detalle de cada equipo (`DevicesList.tsx`), junto a los botones de *msinfo32* y *DxDiag*, se añade un botón destacado:
     `[ Diagnóstico Windows 10/11 ]`.
2. **Modal de Generación y Descarga**:
   - Muestra 2 opciones para el taller:
     - **Opción A (Recomendada para taller)**: Botón de descarga de `GeekyFixDiag-EQUIPO-[ID].exe` o script `.bat`/`.cmd` empaquetado que ya lleva incrustada la URL del servidor y el Token/ID del equipo.
     - **Opción B (Para clientes a distancia)**: Comando rápido para pegar en PowerShell (`Win + X -> Terminal/PowerShell`):
       ```powershell
       irm https://tudominio/diag/ID_EQUIPO | iex
       ```
3. **Pestaña de Resultados en el Equipo**:
   - Si el equipo ya tiene diagnóstico recibido, se visualiza en tarjetas organizadas sin saturación visual (siguiendo *SaaS & Dashboard Guidelines*):
     - **Salud General**: Banner sobrio con conteo de alertas (por ej. `1 disco en riesgo`, `3 BSODs en los últimos 7 días`, `Batería al 68% de vida útil`).
     - **Discos y SMART**: Grilla con barras de espacio y etiqueta de estado de salud.
     - **Historial de Fallos y BSODs**: Lista de eventos con fecha exacta y código de parada.
     - **Integración con Gemini AI**: Un botón directo `"Consultar a GeekyFix AI sobre este reporte"` que transfiere todos los datos del reporte al chat técnico para que la IA proponga presupuesto y solución paso a paso.

---

## 4. Key Implementation Steps

1. **Backend (`server.ts`)**:
   - Endpoint `GET /api/devices/:id/diagnostic-script`: Genera dinámicamente el script PowerShell de auditoría de Windows configurado con el endpoint de retorno y el token de autorización.
   - Endpoint `POST /api/devices/:id/diagnostic-report`: Valida y almacena el JSON de diagnóstico en el registro del equipo dentro de `db.json`.
   - Endpoint `GET /api/download-diag-client`: Provee el ejecutable/script portable para correr en Windows.
   - Actualización del contexto de Gemini AI en `/api/diagnose/:id` para que lea automáticamente el nuevo bloque `diagnosticReport`.

2. **Herramienta Portable para Windows**:
   - Script PowerShell de diagnóstico de alto rendimiento (`GeekyFixAudit.ps1`):
     - Usa `Get-CimInstance Win32_DiskDrive`, `Get-PhysicalDisk`, `Get-StorageReliabilityCounter` para SMART.
     - Lee eventos de `System` con ProviderName `Microsoft-Windows-Kernel-Power`, `BugCheck`, `WHEA-Logger`.
     - Ejecuta `Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 }` para drivers con problemas.
     - Genera y lee el informe de batería mediante `powercfg /batteryreport /xml`.
     - Serializa a JSON y hace `Invoke-RestMethod` con una barra de progreso nativa en consola.
   - Generación del `.exe` portable mediante envoltorio ejecutable nativo o lanzador `.cmd`/`.exe` para máxima compatibilidad con Windows 10 y 11 sin firmas complejas.

3. **Frontend (`DevicesList.tsx` y `DeviceChatbot.tsx`)**:
   - Incorporación del botón de descarga y modal de instrucciones en la ficha del equipo.
   - Vista de desglose del reporte de diagnóstico con diseño profesional (batería, SMART, BSODs, componentes).
   - Inyección automática de los hallazgos en el chatbot de diagnóstico para presupuestación asistida.
