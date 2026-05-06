import React, { useState, useEffect } from "react";
import { api } from "../api";
import { ServiceType } from "../types";
import { Download, Upload, ShieldCheck, AlertTriangle, RefreshCw, Database, HardDrive, History, Plus, Trash2, Edit2, Save, X, Briefcase, Info, ExternalLink, ChevronRight, Lock, Fingerprint } from "lucide-react";
import { Modal } from "./Modal";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export function Settings() {
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isAddingService, setIsAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [newService, setNewService] = useState({ name: "", defaultPrice: 0 });
  const [showAboutModal, setShowAboutModal] = useState(false);
  
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [passwordMsg, setPasswordMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const APP_VERSION = "v1.5.0";
  const CHANGELOG = [
    { version: "v1.5.0", date: "2026-04-16", changes: ["Gestión inteligente de historial (botón atrás móvil)", "Duplicado rápido de presupuestos", "Mejoras críticas en PDF (saltos de página y formato)", "Navegación dinámica entre Clientes/Proyectos"] },
    { version: "v1.4.5", date: "2026-04-13", changes: ["Integración de presupuestos con tickets", "Mejoras en navegación móvil (7 columnas)", "Alineación de botones en configuración"] },
    { version: "v1.4.0", date: "2026-04-12", changes: ["Reporte diario interactivo con modales", "Gestión de tipos de trabajo y precios"] },
    { version: "v1.3.0", date: "2026-04-10", changes: ["Sistema de respaldo y restauración", "Navegación directa entre clientes y equipos"] },
    { version: "v1.2.0", date: "2026-04-05", changes: ["Cajón de aplicaciones (App Drawer)", "Modo oscuro mejorado"] }
  ];

  useEffect(() => {
    api.getServiceTypes().then(setServiceTypes);
  }, []);

  const handleAddService = async () => {
    if (!newService.name) return;
    const created = await api.createServiceType(newService);
    setServiceTypes([...serviceTypes, created]);
    setNewService({ name: "", defaultPrice: 0 });
    setIsAddingService(false);
  };

  const handleUpdateService = async (id: string, data: Partial<ServiceType>) => {
    const updated = await api.updateServiceType(id, data);
    setServiceTypes(serviceTypes.map(s => s.id === id ? updated : s));
    setEditingServiceId(null);
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm("¿Eliminar este tipo de trabajo?")) return;
    await api.deleteServiceType(id);
    setServiceTypes(serviceTypes.filter(s => s.id !== id));
  };

  const handleBackup = async () => {
    try {
      await api.backupData();
    } catch (error) {
      console.error("Backup failed", error);
      setMessage({ type: 'error', text: "Error al generar la copia de seguridad." });
    }
  };

  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleRestoreClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowRestoreConfirm(true);
    e.target.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;

    setShowRestoreConfirm(false);
    setIsRestoring(true);
    setMessage(null);

    try {
      const result = await api.restoreData(pendingFile);
      if (result.success) {
        setMessage({ type: 'success', text: "Datos restaurados con éxito. La página se recargará en breve." });
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setMessage({ type: 'error', text: result.message || "Error al restaurar los datos." });
      }
    } catch (error) {
      console.error("Restore failed", error);
      setMessage({ type: 'error', text: "Error crítico al restaurar los datos." });
    } finally {
      setIsRestoring(false);
      setPendingFile(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordMsg({ type: 'error', text: "Las nuevas contraseñas no coinciden" });
      return;
    }
    if (passwordForm.newPass.length < 6) {
      setPasswordMsg({ type: 'error', text: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }
    
    setIsSubmittingPassword(true);
    try {
      const res = await api.changePassword(passwordForm.current, passwordForm.newPass);
      if (res.success) {
        if (res.token) localStorage.setItem("app_token", res.token);
        setPasswordMsg({ type: 'success', text: "Contraseña actualizada exitosamente" });
        setTimeout(() => {
          setIsChangingPassword(false);
          setPasswordForm({ current: "", newPass: "", confirm: "" });
          setPasswordMsg(null);
        }, 2000);
      }
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || "Error al cambiar la contraseña" });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleRegisterBiometrics = async () => {
    try {
      setMessage(null);
      
      if (!browserSupportsWebAuthn()) {
        setMessage({ type: 'error', text: "Tu navegador o dispositivo no soporta biometría (WebAuthn)." });
        return;
      }

      if (!window.isSecureContext) {
        setMessage({ type: 'error', text: "La configuración de biometría requiere una conexión segura (HTTPS)." });
        return;
      }

      setMessage({ type: 'success', text: "Iniciando configuración de biometría..." });
      const options = await api.getWebauthnRegisterOptions();
      const resp = await startRegistration(options);
      await api.verifyWebauthnRegister(resp);
      setMessage({ type: 'success', text: "¡Dispositivo registrado exitosamente para inicio de sesión biométrico!" });
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes("publickey-credentials-create") || error.message.includes("is not allowed by Permissions Policy"))) {
        setMessage({ type: 'error', text: "Para configurar la biometría, abre la app en una nueva pestaña (ícono superior derecho)." });
      } else if (error.name === "NotAllowedError") {
        setMessage({ type: 'error', text: "La operación de registro fue cancelada." });
      } else {
        setMessage({ type: 'error', text: "No se pudo registrar: " + (error.message || "Error desconocido") });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
          <Database size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración del Sistema</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona tus datos y copias de seguridad</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-100 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' 
            : 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
        }`}>
          {message.type === 'success' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Service Types Management */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl">
              <Briefcase size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tipos de Trabajo y Precios</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Define servicios predeterminados para presupuestos rápidos</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAddingService(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95"
          >
            <Plus size={18} />
            Nuevo Servicio
          </button>
        </div>

        <div className="p-6">
          <div className="grid gap-3">
            {isAddingService && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800 animate-in fade-in slide-in-from-top-2">
                <div className="sm:col-span-7">
                  <input 
                    type="text" 
                    placeholder="Nombre del servicio (ej: Limpieza Física)"
                    className="w-full p-2.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-purple-500/20"
                    value={newService.name}
                    onChange={(e) => setNewService({...newService, name: e.target.value})}
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input 
                      type="number" 
                      placeholder="Precio"
                      className="w-full p-2.5 pl-7 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-purple-500/20"
                      value={newService.defaultPrice || ""}
                      onChange={(e) => setNewService({...newService, defaultPrice: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button onClick={handleAddService} className="flex-1 bg-purple-600 text-white rounded-lg p-2 hover:bg-purple-700 transition-colors">
                    <Save size={18} className="mx-auto" />
                  </button>
                  <button onClick={() => setIsAddingService(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    <X size={18} className="mx-auto" />
                  </button>
                </div>
              </div>
            )}

            {serviceTypes.length === 0 && !isAddingService ? (
              <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                No hay servicios predefinidos. Agrega uno para agilizar tus presupuestos.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {serviceTypes.map(service => (
                  <div key={service.id} className="group bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-900 transition-all">
                    {editingServiceId === service.id ? (
                      <div className="space-y-3">
                        <input 
                          type="text" 
                          className="w-full p-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900 text-sm"
                          value={service.name}
                          onChange={(e) => setServiceTypes(serviceTypes.map(s => s.id === service.id ? {...s, name: e.target.value} : s))}
                        />
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                            <input 
                              type="number" 
                              className="w-full p-2 pl-5 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900 text-sm"
                              value={service.defaultPrice}
                              onChange={(e) => setServiceTypes(serviceTypes.map(s => s.id === service.id ? {...s, defaultPrice: Number(e.target.value)} : s))}
                            />
                          </div>
                          <button onClick={() => handleUpdateService(service.id, service)} className="bg-purple-600 text-white p-2 rounded-lg">
                            <Save size={16} />
                          </button>
                          <button onClick={() => setEditingServiceId(null)} className="bg-gray-200 dark:bg-gray-700 p-2 rounded-lg">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{service.name}</h4>
                          <p className="text-purple-600 dark:text-purple-400 font-black text-lg mt-1">${service.defaultPrice.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingServiceId(service.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteService(service.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl shrink-0">
            <Lock size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Contraseña de Acceso</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Modifica la clave principal de acceso a la aplicación</p>
          </div>
        </div>
        <button 
          onClick={() => setIsChangingPassword(true)} 
          className="mt-4 sm:mt-0 w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          Cambiar Clave
        </button>
      </div>

      {/* Biometry Card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Fingerprint size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Acceso Biométrico (Passkeys)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Registra este dispositivo para iniciar sesión con huella o Face ID</p>
          </div>
        </div>
        <button 
          onClick={handleRegisterBiometrics} 
          className="mt-4 sm:mt-0 w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-bold rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          Configurar Biometría
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl">
              <Download size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Copia de Seguridad</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Descarga todo el sistema en un archivo .zip</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
            Genera un respaldo completo que incluye la base de datos de clientes, equipos, tickets, presupuestos y todas las imágenes cargadas.
          </p>
          <button 
            onClick={handleBackup}
            className="mt-auto w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Download size={18} />
            Descargar Respaldo
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl">
              <Upload size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Restaurar Datos</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Carga un archivo de respaldo previo</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
            Selecciona un archivo .zip generado previamente por este sistema para restaurar toda la información. 
            <span className="text-orange-600 dark:text-orange-400 font-bold block mt-1">⚠️ ¡Atención! Esto borrará los datos actuales.</span>
          </p>
          <label className={`mt-auto w-full py-3 ${isRestoring ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 cursor-pointer'} text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm`}>
            {isRestoring ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Restaurando...
              </>
            ) : (
              <>
                <Upload size={18} />
                Subir y Restaurar
              </>
            )}
            <input 
              type="file" 
              accept=".zip" 
              className="hidden" 
              onChange={handleRestoreClick} 
              disabled={isRestoring}
            />
          </label>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800">
        <div className="flex gap-4">
          <div className="text-blue-600 dark:text-blue-400 shrink-0">
            <ShieldCheck size={32} />
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 dark:text-gray-100">Seguridad de tus datos</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Toda la información se procesa localmente en tu servidor. Al realizar una copia de seguridad, obtienes un archivo comprimido que contiene:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-4">
              <li>Base de datos completa (JSON)</li>
              <li>Fotos de equipos y tickets</li>
              <li>Fotos de perfil de clientes</li>
              <li>Archivos de herramientas cargados</li>
            </ul>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl">
              <Info size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Acerca de GeekyFix Workshop</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Versión del sistema: <span className="font-bold text-blue-600 dark:text-blue-400">{APP_VERSION}</span></p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setShowAboutModal(true)}
              className="flex-1 sm:flex-none px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              Detalles de cambios
            </button>
            <a 
              href="https://geekyfixcba.github.io/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-bold rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center gap-2"
            >
              Sitio Web <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>

      <Modal isOpen={showRestoreConfirm} onClose={() => setShowRestoreConfirm(false)} title="Confirmar Restauración">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 text-orange-600 dark:text-orange-400">
            <AlertTriangle size={24} />
            <h4 className="font-bold">¡Atención! Acción Irreversible</h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            ¿Estás seguro de que deseas restaurar los datos? Esto reemplazará toda la información actual, incluyendo imágenes y archivos cargados.
          </p>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800">
            <p className="text-xs text-orange-700 dark:text-orange-300">
              Archivo seleccionado: <span className="font-mono font-bold">{pendingFile?.name}</span>
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button 
              onClick={() => setShowRestoreConfirm(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmRestore}
              className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors shadow-sm"
            >
              Sí, Restaurar Todo
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} title="Historial de Cambios">
        <div className="space-y-6 p-2">
          {CHANGELOG.map((entry, idx) => (
            <div key={idx} className="relative pl-6 border-l-2 border-blue-100 dark:border-blue-900 last:border-0 pb-6 last:pb-0">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-4 border-white dark:border-gray-800"></div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-gray-900 dark:text-gray-100">{entry.version}</h4>
                <span className="text-xs text-gray-400 dark:text-gray-500">{entry.date}</span>
              </div>
              <ul className="space-y-1">
                {entry.changes.map((change, cIdx) => (
                  <li key={cIdx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                    <span className="text-blue-500 mt-1.5 w-1 h-1 rounded-full shrink-0"></span>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Desarrollado con ❤️ para GeekyFix Workshop</p>
          </div>
        </div>
      </Modal>

      <div className="flex items-center justify-center gap-8 py-4 opacity-30 grayscale">
        <div className="flex flex-col items-center gap-1">
          <HardDrive size={24} />
          <span className="text-[10px] font-bold uppercase">Storage</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <History size={24} />
          <span className="text-[10px] font-bold uppercase">History</span>
        </div>
      </div>

      {isChangingPassword && (
        <Modal 
          isOpen={true} 
          onClose={() => {
            setIsChangingPassword(false);
            setPasswordForm({ current: "", newPass: "", confirm: "" });
            setPasswordMsg(null);
          }} 
          title="Cambiar Contraseña"
        >
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            {passwordMsg && (
              <div className={`p-4 rounded-xl flex items-center gap-3 border text-sm ${
                passwordMsg.type === 'success' 
                  ? 'bg-green-50 border-green-100 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' 
                  : 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
              }`}>
                {passwordMsg.type === 'success' ? <ShieldCheck size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
                <p>{passwordMsg.text}</p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Contraseña Actual</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={passwordForm.current}
                onChange={e => setPasswordForm({...passwordForm, current: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nueva Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={passwordForm.newPass}
                onChange={e => setPasswordForm({...passwordForm, newPass: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Confirmar Nueva Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={passwordForm.confirm}
                onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setIsChangingPassword(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                disabled={isSubmittingPassword}
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSubmittingPassword}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-colors disabled:opacity-70"
              >
                {isSubmittingPassword ? "Guardando..." : "Guardar Clave"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
