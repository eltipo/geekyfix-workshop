import React, { useState } from "react";
import { Lock, LogIn, AlertCircle, Fingerprint } from "lucide-react";
import { api } from "../api";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem("app_token", data.token);
        onLogin(data.token);
      } else {
        setError(data.error || "Contraseña incorrecta");
      }
    } catch (err) {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      setError("");
      
      if (!browserSupportsWebAuthn()) {
        setError("Tu navegador o dispositivo no soporta biometría (WebAuthn).");
        return;
      }

      if (!window.isSecureContext) {
        setError("El inicio de sesión biométrico requiere una conexión segura (HTTPS).");
        return;
      }

      setLoading(true);
      const options = await api.getWebauthnAuthOptions();
      const authResp = await startAuthentication(options);
      const verificationResp = await api.verifyWebauthnAuth(authResp);
      
      if (verificationResp.verified && verificationResp.token) {
        localStorage.setItem("app_token", verificationResp.token);
        onLogin(verificationResp.token);
      } else {
        setError("Autenticación biométrica falló");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes("publickey-credentials-get") || err.message.includes("is not allowed by Permissions Policy"))) {
        setError("La biometría requiere abrir la app en una nueva pestaña (haz clic en el ícono de la esquina superior derecha).");
      } else if (err.name === "NotAllowedError") {
        setError("La operación fue cancelada o el tiempo de espera expiró.");
      } else {
        setError(err.message || "Error al iniciar con biometría. ¿Está configurado el dispositivo?");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">GeekyFix Secure</h1>
          <p className="text-blue-100 mt-2 text-sm">Ingresa tu contraseña para acceder al sistema</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Acceder <LogIn size={18} />
              </>
            )}
          </button>

          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative bg-white px-4 text-sm text-gray-500">O</div>
          </div>

          <button
            type="button"
            onClick={handleBiometricAuth}
            disabled={loading}
            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold py-3 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-3 transition-colors active:scale-95 shadow-sm"
          >
            <Fingerprint size={20} className="text-blue-600" />
            Ingresar con Biometría (Face ID / Huella)
          </button>
        </form>
      </div>
    </div>
  );
}
