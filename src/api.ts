import { Client, Device, Tool, Budget, ServiceType, ServiceTask, Project } from "./types";

const originalFetch = window.fetch.bind(window);
const localFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem("app_token");
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("X-App-Token", token);
  }
  const response = await originalFetch(input, { ...init, headers });
  if (response.status === 401) {
    window.dispatchEvent(new Event("unauthorized"));
    // Return a promise that never resolves so the caller doesn't throw errors while the app redirects to login
    return new Promise(() => {});
  }
  return response;
};

// Aliasing for ease of not renaming everything
const fetch = localFetch;

export const api = {
  getClients: async (): Promise<Client[]> => {
    const res = await fetch("/api/clients");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET /api/clients failed (${res.status}): ${text.substring(0, 100)}`);
    }
    const resClone = res.clone();
    try {
      return await res.json();
    } catch (e) {
      const text = await resClone.text();
      throw new Error(`GET /api/clients invalid JSON: ${text.substring(0, 100)}`);
    }
  },
  createClient: async (client: Partial<Client>): Promise<Client> => {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    return res.json();
  },
  updateClient: async (id: string, client: Partial<Client>): Promise<Client> => {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    return res.json();
  },
  // WebAuthn
  getWebauthnRegisterOptions: async () => {
    const res = await fetch("/api/webauthn/register-options");
    if(!res.ok) throw new Error("Error getting register options");
    return res.json();
  },
  verifyWebauthnRegister: async (body: any) => {
    const res = await fetch("/api/webauthn/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if(!res.ok) throw new Error("Error verifing register");
    return res.json();
  },
  getWebauthnAuthOptions: async () => {
    const res = await fetch("/api/webauthn/auth-options");
    if(!res.ok) throw new Error("Error getting auth options");
    return res.json();
  },
  verifyWebauthnAuth: async (body: any) => {
    const res = await fetch("/api/webauthn/auth-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if(!res.ok) throw new Error("Error verifing auth");
    return res.json();
  },
  deleteClient: async (id: string): Promise<void> => {
    await fetch(`/api/clients/${id}`, {
      method: "DELETE",
    });
  },
  getDevices: async (): Promise<Device[]> => {
    const res = await fetch("/api/devices");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET /api/devices failed (${res.status}): ${text.substring(0, 100)}`);
    }
    const resClone = res.clone();
    try {
      return await res.json();
    } catch (e) {
      const text = await resClone.text();
      throw new Error(`GET /api/devices invalid JSON: ${text.substring(0, 100)}`);
    }
  },
  createDevice: async (formData: FormData): Promise<Device> => {
    const res = await fetch("/api/devices", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create device (${res.status}): ${text.substring(0, 100)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 100)}`);
    }
  },
  updateDevice: async (id: string, formData: FormData): Promise<Device> => {
    const res = await fetch(`/api/devices/${id}`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to update device (${res.status}): ${text.substring(0, 100)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 100)}`);
    }
  },
  deleteDevice: async (id: string): Promise<void> => {
    await fetch(`/api/devices/${id}`, {
      method: "DELETE",
    });
  },
  addTicket: async (deviceId: string, formData: FormData): Promise<Device> => {
    const res = await fetch(`/api/devices/${deviceId}/tickets`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to add ticket (${res.status}): ${text.substring(0, 100)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 100)}`);
    }
  },
  updateTicket: async (deviceId: string, ticketId: string, formData: FormData): Promise<Device> => {
    const res = await fetch(`/api/devices/${deviceId}/tickets/${ticketId}`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to update ticket (${res.status}): ${text.substring(0, 100)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 100)}`);
    }
  },
  deleteTicket: async (deviceId: string, ticketId: string): Promise<Device> => {
    const res = await fetch(`/api/devices/${deviceId}/tickets/${ticketId}`, {
      method: "DELETE",
    });
    return res.json();
  },
  getTools: async (): Promise<Tool[]> => {
    const res = await fetch("/api/tools");
    return res.json();
  },
  createTool: async (formData: FormData): Promise<Tool> => {
    const res = await fetch("/api/tools", {
      method: "POST",
      body: formData,
    });
    return res.json();
  },
  updateTool: async (id: string, formData: FormData): Promise<Tool> => {
    const res = await fetch(`/api/tools/${id}`, {
      method: "PUT",
      body: formData,
    });
    return res.json();
  },
  deleteTool: async (id: string): Promise<void> => {
    await fetch(`/api/tools/${id}`, {
      method: "DELETE",
    });
  },
  getBudgets: async (): Promise<Budget[]> => {
    const res = await fetch("/api/budgets");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET /api/budgets failed (${res.status}): ${text.substring(0, 100)}`);
    }
    const resClone = res.clone();
    try {
      return await res.json();
    } catch (e) {
      const text = await resClone.text();
      throw new Error(`GET /api/budgets invalid JSON: ${text.substring(0, 100)}`);
    }
  },
  createBudget: async (budget: Partial<Budget>): Promise<Budget> => {
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(budget),
    });
    return res.json();
  },
  updateBudget: async (id: string, budget: Partial<Budget>): Promise<Budget> => {
    const res = await fetch(`/api/budgets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(budget),
    });
    return res.json();
  },
  deleteBudget: async (id: string): Promise<void> => {
    await fetch(`/api/budgets/${id}`, {
      method: "DELETE",
    });
  },
  getServiceTypes: async (): Promise<ServiceType[]> => {
    const res = await fetch("/api/service-types");
    return res.json();
  },
  createServiceType: async (serviceType: Partial<ServiceType>): Promise<ServiceType> => {
    const res = await fetch("/api/service-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceType),
    });
    return res.json();
  },
  updateServiceType: async (id: string, serviceType: Partial<ServiceType>): Promise<ServiceType> => {
    const res = await fetch(`/api/service-types/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceType),
    });
    return res.json();
  },
  deleteServiceType: async (id: string): Promise<void> => {
    await fetch(`/api/service-types/${id}`, {
      method: "DELETE",
    });
  },
  getServiceTasks: async (): Promise<ServiceTask[]> => {
    const res = await fetch("/api/service-tasks");
    return res.json();
  },
  createServiceTask: async (task: Partial<ServiceTask>): Promise<ServiceTask> => {
    const res = await fetch("/api/service-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    return res.json();
  },
  updateServiceTask: async (id: string, task: Partial<ServiceTask>): Promise<ServiceTask> => {
    const res = await fetch(`/api/service-tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    return res.json();
  },
  deleteServiceTask: async (id: string): Promise<void> => {
    await fetch(`/api/service-tasks/${id}`, {
      method: "DELETE",
    });
  },
  getReceivables: async (): Promise<any[]> => {
    const res = await fetch("/api/receivables");
    return res.json();
  },
  createReceivable: async (rec: any): Promise<any> => {
    const res = await fetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });
    return res.json();
  },
  updateReceivable: async (id: string, rec: any): Promise<any> => {
    const res = await fetch(`/api/receivables/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });
    return res.json();
  },
  deleteReceivable: async (id: string): Promise<void> => {
    await fetch(`/api/receivables/${id}`, {
      method: "DELETE",
    });
  },
  getTransactions: async (): Promise<any[]> => {
    const res = await fetch("/api/transactions");
    return res.json();
  },
  getHiddenTransactions: async (): Promise<string[]> => {
    const res = await fetch("/api/hidden-transactions");
    return res.json();
  },
  hideAutoTransaction: async (id: string): Promise<any> => {
    const res = await fetch(`/api/hidden-transactions/${id}`, { method: 'POST' });
    return res.json();
  },
  createTransaction: async (tx: any): Promise<any> => {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });
    return res.json();
  },
  updateTransaction: async (id: string, tx: any): Promise<any> => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });
    return res.json();
  },
  deleteTransaction: async (id: string): Promise<void> => {
    await fetch(`/api/transactions/${id}`, {
      method: "DELETE",
    });
  },
  changePassword: async (currentPassword: string, newPassword: string): Promise<{ success: boolean; token?: string }> => {
    const res = await fetch("/api/settings/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Error al cambiar contraseña");
    }
    return data;
  },
  backupData: async (): Promise<void> => {
    const token = localStorage.getItem("app_token");
    window.location.href = `/api/backup${token ? `?token=${token}` : ''}`;
  },
  restoreData: async (file: File): Promise<{ success: boolean; message: string }> => {
    const formData = new FormData();
    formData.append("backup", file);
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        body: formData,
      });
      
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (!res.ok) {
          return { success: false, message: json.error || `Error ${res.status}` };
        }
        return json;
      } catch (e) {
        if (!res.ok) {
          return { success: false, message: `Error del servidor (${res.status}): ${text.substring(0, 100)}` };
        }
        return { success: false, message: "Respuesta del servidor no válida." };
      }
    } catch (error) {
      console.error("Network error during restore:", error);
      return { success: false, message: "Error de red al intentar restaurar." };
    }
  },
  parseMsinfo: async (file: File): Promise<{ key: string; value: string }[]> => {
    const formData = new FormData();
    formData.append("msinfo", file);
    const res = await fetch("/api/parse-msinfo", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    return json.data;
  },
  parseDxdiag: async (file: File): Promise<{ key: string; value: string }[]> => {
    const formData = new FormData();
    formData.append("dxdiag", file);
    const res = await fetch("/api/parse-dxdiag", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    return json.data;
  },
  getProjects: async (): Promise<Project[]> => {
    const res = await fetch("/api/projects");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET /api/projects failed (${res.status}): ${text.substring(0, 100)}`);
    }
    const resClone = res.clone();
    try {
      return await res.json();
    } catch (e) {
      const text = await resClone.text();
      throw new Error(`GET /api/projects invalid JSON: ${text.substring(0, 100)}`);
    }
  },
  createProject: async (project: Partial<Project>): Promise<Project> => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    return res.json();
  },
  updateProject: async (id: string, project: Partial<Project>): Promise<Project> => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    return res.json();
  },
  deleteProject: async (id: string): Promise<void> => {
    await fetch(`/api/projects/${id}`, {
      method: "DELETE",
    });
  },
  uploadProjectDocuments: async (projectId: string, formData: FormData): Promise<Project> => {
    const res = await fetch(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to upload documents (${res.status}): ${text.substring(0, 100)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 100)}`);
    }
  },
};
