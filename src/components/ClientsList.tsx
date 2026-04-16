import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Client, Tool } from "../types";
import { UserPlus, Phone, Mail, Edit2, Trash2, X, AlertCircle, MessageCircle, ExternalLink, Share2, Plus, Monitor, Search, SortAsc, SortDesc, MapPin, Download, Upload, FileJson, ChevronRight, Camera, ClipboardList, Copy, Folder, ReceiptText } from "lucide-react";
import { Modal } from "./Modal";

export function ClientsList({ 
  appMode,
  onSelectClient, 
  onSelectClientTasks, 
  initialClientId,
  setCurrentTab,
  setSelectedBudgetId
}: { 
  appMode: "workshop" | "project",
  onSelectClient: (id: string) => void, 
  onSelectClientTasks?: (id: string) => void, 
  initialClientId?: string,
  setCurrentTab: (tab: any) => void,
  setSelectedBudgetId: (id: string | undefined) => void
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<Client | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [mapAddress, setMapAddress] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    api.getClients().then(clis => {
      setClients(clis);
      if (initialClientId) {
        const client = clis.find(c => c.id === initialClientId);
        if (client) setSelectedClientDetail(client);
      }
    });
    api.getTools().then(setTools);
  }, [initialClientId]);

  const filteredClients = clients
    .filter((client) => {
      const matchesMode = appMode === 'workshop' 
        ? (client.type === 'workshop' || !client.type) 
        : ((client.type as string) === 'project' || (client.type as string) === 'projects');
      
      if (!matchesMode) return false;

      const query = searchQuery.toLowerCase();
      return (
        client.firstName.toLowerCase().includes(query) ||
        client.lastName.toLowerCase().includes(query) ||
        (client.email && client.email.toLowerCase().includes(query)) ||
        (client.whatsapp && client.whatsapp.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      if (sortOrder === "asc") return nameA.localeCompare(nameB);
      return nameB.localeCompare(nameA);
    });

  const handleClientSaved = (client: Client) => {
    if (editingClient) {
      setClients(clients.map(c => c.id === client.id ? client : c));
      setEditingClient(null);
      if (selectedClientDetail?.id === client.id) {
        setSelectedClientDetail(client);
      }
    } else {
      setClients([...clients, client]);
      setShowForm(false);
    }
  };

  const handleDeleteClient = async () => {
    if (clientToDelete) {
      await api.deleteClient(clientToDelete.id);
      setClients(clients.filter(c => c.id !== clientToDelete.id));
      setClientToDelete(null);
      setSelectedClientDetail(null);
    }
  };

  const handleShareTool = () => {
    if (!selectedClientDetail || !selectedToolId || !selectedClientDetail.whatsapp) return;
    
    const tool = tools.find(t => t.id === selectedToolId);
    if (!tool) return;

    const baseUrl = window.location.origin;
    const downloadUrl = tool.type === 'file' ? `${baseUrl}${tool.url}` : tool.url;
    
    const message = `Hola ${selectedClientDetail.firstName}, te envío esta herramienta para que descargues: ${tool.name}\n\n${downloadUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${selectedClientDetail.whatsapp.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const handleExportClients = () => {
    const dataStr = JSON.stringify(clients, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `clientes_geekyfix_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleExportCSV = () => {
    const clientsToExport = selectedClientIds.length > 0 
      ? clients.filter(c => selectedClientIds.includes(c.id))
      : clients;

    const headers = ["ID", "Nombre", "Apellido", "WhatsApp", "Email", "Dirección"];
    const csvContent = [
      headers.join(","),
      ...clientsToExport.map(c => [
        c.id,
        `"${(c.firstName || '').replace(/"/g, '""')}"`,
        `"${(c.lastName || '').replace(/"/g, '""')}"`,
        `"${(c.whatsapp || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clientes_geekyfix_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedClientIds.map(id => api.deleteClient(id)));
      setClients(clients.filter(c => !selectedClientIds.includes(c.id)));
      setSelectedClientIds([]);
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting clients:", error);
    }
  };

  const handleCloneClient = async (client: Client) => {
    const isCurrentlyWorkshop = client.type === 'workshop' || !client.type;
    const newType: 'workshop' | 'project' = isCurrentlyWorkshop ? 'project' : 'workshop';
    const { id, ...clientData } = client;
    const clonedClient: Partial<Client> = {
      ...clientData,
      type: newType,
    };
    
    try {
      const newClient = await api.createClient(clonedClient);
      setClients(prev => [...prev, newClient]);
      // Close detail if open
      setSelectedClientDetail(null);
    } catch (error) {
      console.error("Error cloning client:", error);
    }
  };

  const toggleSelectAll = () => {
    if (selectedClientIds.length === filteredClients.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(filteredClients.map(c => c.id));
    }
  };

  const toggleSelectClient = (id: string) => {
    setSelectedClientIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleImportClients = async () => {
    try {
      setIsImporting(true);
      setImportError(null);
      
      let parsedData;
      try {
        parsedData = JSON.parse(importData);
      } catch (e) {
        throw new Error("El formato JSON no es válido.");
      }

      if (!Array.isArray(parsedData)) {
        throw new Error("Los datos deben ser una lista de clientes.");
      }

      // Basic validation and cleaning
      const cleanedData = parsedData.map((c: any) => ({
        firstName: c.firstName || "Sin nombre",
        lastName: c.lastName || "",
        whatsapp: c.whatsapp || "",
        email: c.email || "",
        address: c.address || "",
        photoURL: c.photoURL || "",
        type: c.type || appMode,
        urls: Array.isArray(c.urls) ? c.urls : [],
        customFields: Array.isArray(c.customFields) ? c.customFields : [],
      }));

      // Import one by one
      const importedClients: Client[] = [];
      for (const clientData of cleanedData) {
        const newClient = await api.createClient(clientData);
        importedClients.push(newClient);
      }

      setClients([...clients, ...importedClients]);
      setShowImportModal(false);
      setImportData("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Error desconocido al importar.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportData(content);
    };
    reader.readAsText(file);
  };

  const getInitials = (firstName: string, lastName: string) => {
    const f = firstName?.charAt(0) || "";
    const l = lastName?.charAt(0) || "";
    if (!f && !l) return "?";
    return `${f}${l}`.toUpperCase();
  };

  const getGravatarUrl = (email: string) => {
    if (!email) return null;
    // Simple check for gmail to try and get a profile pic if possible
    // Note: This is a fallback, real Gravatar requires MD5 hash of email
    // For now we'll use a placeholder service that handles email-based avatars
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}&background=random&size=128`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clientes</h2>
          {selectedClientIds.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-xl border border-blue-100 dark:border-blue-800 animate-in fade-in slide-in-from-left-2">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {selectedClientIds.length} seleccionados
              </span>
              <div className="w-px h-4 bg-blue-200 dark:bg-blue-800 mx-1" />
              <button
                onClick={handleExportCSV}
                className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded-lg transition-colors"
                title="Exportar CSV"
              >
                <FileJson size={16} />
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-800/40 rounded-lg transition-colors"
                title="Eliminar Seleccionados"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setSelectedClientIds([])}
                className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Limpiar selección"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!showForm && !editingClient && (
            <>
              <div className="flex bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-1">
                <button
                  onClick={toggleSelectAll}
                  className={`p-2 rounded-lg transition-colors ${selectedClientIds.length === filteredClients.length && filteredClients.length > 0 ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                  title={selectedClientIds.length === filteredClients.length ? "Deseleccionar Todos" : "Seleccionar Todos"}
                >
                  <Plus size={18} className={selectedClientIds.length === filteredClients.length ? "rotate-45 transition-transform" : "transition-transform"} />
                </button>
                <div className="w-px h-6 bg-gray-100 dark:bg-gray-700 my-auto mx-1" />
                <button
                  onClick={handleExportClients}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  title="Exportar Clientes (JSON)"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  title="Importar Clientes"
                >
                  <Upload size={18} />
                </button>
                <div className="w-px h-6 bg-gray-100 dark:bg-gray-700 my-auto mx-1" />
                <button
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  title="Ordenar Alfabéticamente"
                >
                  {sortOrder === "asc" ? <SortAsc size={18} /> : <SortDesc size={18} />}
                </button>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
              >
                <UserPlus size={18} /> 
                <span className="hidden sm:inline">Nuevo Cliente</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!showForm && !editingClient && (
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
      )}

      {(showForm || editingClient) && (
        <ClientForm 
          appMode={appMode}
          initialData={editingClient || undefined}
          onSuccess={handleClientSaved} 
          onCancel={() => {
            setShowForm(false);
            setEditingClient(null);
          }} 
        />
      )}

      <div className="grid gap-4">
        {filteredClients.length === 0 && !showForm && !editingClient && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            {clients.length === 0 ? "No hay clientes registrados." : "No se encontraron clientes."}
          </p>
        )}
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className={`bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border transition-all group relative overflow-hidden ${selectedClientIds.includes(client.id) ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900'}`}
          >
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div 
                onClick={() => setSelectedClientDetail(client)}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-inner shrink-0 cursor-pointer hover:scale-105 transition-transform overflow-hidden"
              >
                {client.photoURL ? (
                  <img src={client.photoURL} alt={client.firstName} className="w-full h-full object-cover" />
                ) : (
                  getInitials(client.firstName, client.lastName)
                )}
              </div>

              {/* Info */}
              <div 
                className="flex-1 cursor-pointer min-w-0"
                onClick={() => setSelectedClientDetail(client)}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {`${client.firstName} ${client.lastName}`.trim() || "Cliente sin nombre"}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {client.whatsapp && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <MessageCircle size={12} className="text-green-500" />
                      <span>{client.whatsapp}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Mail size={12} className="text-blue-500" />
                      <span className="truncate max-w-[150px]">{client.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions - Desktop */}
              <div className="hidden sm:flex items-center gap-1">
                {client.address && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setMapAddress(client.address!); }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                    title="Mapa"
                  >
                    <MapPin size={18} />
                  </button>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); onSelectClient(client.id); }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                  title="Equipos"
                >
                  <Monitor size={18} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingClient(client); }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                  title="Editar"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCloneClient(client); }}
                  className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-colors"
                  title={`Clonar a ${client.type === 'workshop' ? 'Proyectos' : 'Workshop'}`}
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setClientToDelete(client); }}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={18} />
                </button>

                {/* Selection Checkbox - Desktop */}
                <div className="flex items-center px-2 border-l border-gray-100 dark:border-gray-700 ml-1">
                  <input
                    type="checkbox"
                    checked={selectedClientIds.includes(client.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelectClient(client.id); }}
                    className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-all"
                  />
                </div>
              </div>

              {/* Mobile Actions Trigger */}
              <div className="sm:hidden flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedClientIds.includes(client.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelectClient(client.id); }}
                  className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-all"
                />
                <button 
                  onClick={() => setSelectedClientDetail(client)}
                  className="p-2 text-gray-400"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Client Detail Modal */}
      <Modal 
        isOpen={!!selectedClientDetail} 
        onClose={() => setSelectedClientDetail(null)} 
        title="Detalle del Cliente"
      >
        {selectedClientDetail && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center pb-6 border-b border-gray-100 dark:border-gray-700">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-3xl shadow-xl mb-4 overflow-hidden">
                {selectedClientDetail.photoURL ? (
                  <img src={selectedClientDetail.photoURL} alt={selectedClientDetail.firstName} className="w-full h-full object-cover" />
                ) : (
                  getInitials(selectedClientDetail.firstName, selectedClientDetail.lastName)
                )}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {selectedClientDetail.firstName} {selectedClientDetail.lastName}
              </h3>
              <p className="text-xs font-mono text-gray-400 mt-1">ID: {selectedClientDetail.id}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-2 tracking-widest">WhatsApp</span>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                    <MessageCircle size={20} />
                  </div>
                  <span className="font-bold text-gray-700 dark:text-gray-200">{selectedClientDetail.whatsapp || "No registrado"}</span>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-2 tracking-widest">Email</span>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Mail size={20} />
                  </div>
                  <span className="font-bold text-gray-700 dark:text-gray-200 truncate">{selectedClientDetail.email || "No registrado"}</span>
                </div>
              </div>
            </div>

            {selectedClientDetail.address && (
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-2 tracking-widest">Domicilio</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                      <MapPin size={20} />
                    </div>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{selectedClientDetail.address}</span>
                  </div>
                  <button
                    onClick={() => setMapAddress(selectedClientDetail.address!)}
                    className="p-2 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
                  >
                    <MapPin size={20} />
                  </button>
                </div>
              </div>
            )}

            {selectedClientDetail.urls && selectedClientDetail.urls.length > 0 && (
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-widest">Enlaces Guardados</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedClientDetail.urls.map((u, idx) => (
                    <a 
                      key={idx}
                      href={u.url.startsWith('http') ? u.url : `https://${u.url}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                        <ExternalLink size={16} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">{u.label || "Abrir enlace"}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {selectedClientDetail.customFields && selectedClientDetail.customFields.length > 0 && (
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-widest">Datos Personalizados</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedClientDetail.customFields.map((field, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{field.key}</span>
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-bold">{field.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share Tools Section */}
            {selectedClientDetail.whatsapp && tools.length > 0 && (
              <div className="bg-blue-600 p-5 rounded-2xl shadow-lg shadow-blue-500/20 space-y-4">
                <div className="flex items-center gap-2 text-white font-bold">
                  <Share2 size={18} />
                  <span>Compartir Herramienta</span>
                </div>
                <div className="flex gap-2">
                  <select
                    className="flex-1 p-3 rounded-xl border-none text-sm bg-white/10 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/20 backdrop-blur-md"
                    value={selectedToolId}
                    onChange={(e) => setSelectedToolId(e.target.value)}
                  >
                    <option value="" className="text-gray-900">Seleccionar herramienta...</option>
                    {tools.map(tool => (
                      <option key={tool.id} value={tool.id} className="text-gray-900">{tool.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleShareTool}
                    disabled={!selectedToolId}
                    className="bg-white text-blue-600 px-5 py-3 rounded-xl hover:bg-blue-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-bold shadow-lg"
                  >
                    <MessageCircle size={20} />
                    Enviar
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => onSelectClient(selectedClientDetail.id)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {appMode === 'project' ? <Folder size={20} /> : <Monitor size={20} />}
                  {appMode === 'project' ? 'Proyectos' : 'Equipos'}
                </button>
                <button
                  onClick={() => { setSelectedBudgetId(undefined); setCurrentTab("budgets"); }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-purple-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {appMode === 'project' ? <ReceiptText size={20} /> : <ClipboardList size={20} />}
                  {appMode === 'project' ? 'Presupuestos' : 'Tareas'}
                </button>
                {appMode === 'project' && (
                  <button
                    onClick={() => onSelectClientTasks?.(selectedClientDetail.id)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <ClipboardList size={20} />
                    Tareas
                  </button>
                )}
                {selectedClientDetail.whatsapp && (
                  <a
                    href={`https://wa.me/${selectedClientDetail.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={20} />
                    WhatsApp
                  </a>
                )}
              </div>
              <div className="flex flex-row gap-3">
                <button
                  onClick={() => { setEditingClient(selectedClientDetail); setSelectedClientDetail(null); }}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 py-2 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
                  title="Editar Cliente"
                >
                  <Edit2 size={16} />
                  Editar
                </button>
                <button
                  onClick={() => handleCloneClient(selectedClientDetail)}
                  className="flex-1 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-400 py-2 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
                  title={`Clonar a ${selectedClientDetail.type === 'workshop' ? 'Proyectos' : 'Workshop'}`}
                >
                  <Copy size={16} />
                  Clonar
                </button>
                <button
                  onClick={() => { setClientToDelete(selectedClientDetail); setSelectedClientDetail(null); }}
                  className="flex-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-2 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
                  title="Eliminar Cliente"
                >
                  <Trash2 size={16} />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal 
        isOpen={showBulkDeleteConfirm} 
        onClose={() => setShowBulkDeleteConfirm(false)} 
        title="Eliminar Clientes Seleccionados"
      >
        <div className="p-2">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle size={24} />
            <p className="font-semibold">¿Estás seguro de eliminar {selectedClientIds.length} clientes?</p>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
            Esta acción eliminará permanentemente a todos los clientes seleccionados. 
            Esta operación no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={() => setShowBulkDeleteConfirm(false)} 
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancelar
            </button>
            <button 
              onClick={handleBulkDelete} 
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm"
            >
              Eliminar {selectedClientIds.length} Clientes
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={!!clientToDelete} 
        onClose={() => setClientToDelete(null)} 
        title="Eliminar Cliente"
      >
        <div className="p-2">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle size={24} />
            <p className="font-semibold">¿Estás seguro de eliminar este cliente?</p>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
            Esta acción eliminará permanentemente a <strong>{clientToDelete?.firstName} {clientToDelete?.lastName}</strong>. 
            Ten en cuenta que sus equipos asociados no se eliminarán automáticamente pero quedarán sin cliente asignado.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={() => setClientToDelete(null)} 
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancelar
            </button>
            <button 
              onClick={handleDeleteClient} 
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm"
            >
              Eliminar Cliente
            </button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          if (!isImporting) {
            setShowImportModal(false);
            setImportError(null);
            setImportData("");
          }
        }}
        title="Importar Clientes"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Puedes importar clientes pegando un JSON válido o subiendo un archivo .json previamente exportado.
          </p>
          
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-500 uppercase">Subir archivo</label>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-500 uppercase">O pega el contenido JSON aquí</label>
            <textarea
              className="w-full h-40 p-3 text-xs font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='[{"firstName": "Juan", "lastName": "Perez", ...}]'
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
            ></textarea>
          </div>

          {importError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} />
              <span>{importError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => {
                setShowImportModal(false);
                setImportError(null);
                setImportData("");
              }}
              disabled={isImporting}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportClients}
              disabled={isImporting || !importData.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Importando...
                </>
              ) : (
                <>
                  <FileJson size={16} />
                  Procesar Importación
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Map Modal */}
      <Modal
        isOpen={!!mapAddress}
        onClose={() => setMapAddress(null)}
        title="Ubicación"
      >
        <div className="p-2">
          {mapAddress && (
            <iframe
              width="100%"
              height="400"
              style={{ border: 0, borderRadius: '0.5rem' }}
              loading="lazy"
              allowFullScreen
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapAddress)}&output=embed`}
            ></iframe>
          )}
          <div className="flex justify-end mt-4">
            <button 
              onClick={() => setMapAddress(null)} 
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ClientForm({ 
  appMode,
  initialData, 
  onSuccess, 
  onCancel 
}: { 
  appMode: "workshop" | "project";
  initialData?: Client;
  onSuccess: (c: Client) => void; 
  onCancel: () => void 
}) {
  const [formData, setFormData] = useState({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    whatsapp: initialData?.whatsapp || "",
    email: initialData?.email || "",
    address: initialData?.address || "",
    photoURL: initialData?.photoURL || "",
  });

  const handleEmailBlur = () => {
    if (formData.email && !formData.photoURL && formData.email.toLowerCase().endsWith('@gmail.com')) {
      // For Gmail, we can try to use a service that might provide the profile pic
      // Since we don't have a real API for Gmail profile pics without OAuth, 
      // we'll use a placeholder service that looks better than initials
      const avatarUrl = `https://unavatar.io/${formData.email}`;
      setFormData(prev => ({ ...prev, photoURL: avatarUrl }));
    }
  };

  const [urls, setUrls] = useState<{ label: string; url: string }[]>(
    initialData?.urls || ((initialData as any)?.url ? [{ label: (initialData as any).urlLabel || "", url: (initialData as any).url }] : [])
  );

  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>(
    initialData?.customFields || []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { 
      ...formData, 
      urls, 
      customFields,
      type: initialData?.type || appMode
    };
    if (initialData) {
      const updatedClient = await api.updateClient(initialData.id, data);
      onSuccess(updatedClient);
    } else {
      const newClient = await api.createClient(data as Client);
      onSuccess(newClient);
    }
  };

  const addUrl = () => setUrls([...urls, { label: "", url: "" }]);
  const removeUrl = (index: number) => setUrls(urls.filter((_, i) => i !== index));
  const updateUrl = (index: number, field: "label" | "url", value: string) => {
    const newUrls = [...urls];
    newUrls[index][field] = value;
    setUrls(newUrls);
  };

  const addCustomField = () => setCustomFields([...customFields, { key: "", value: "" }]);
  const removeCustomField = (index: number) => setCustomFields(customFields.filter((_, i) => i !== index));
  const updateCustomField = (index: number, field: "key" | "value", value: string) => {
    const newFields = [...customFields];
    newFields[index][field] = value;
    setCustomFields(newFields);
  };

  const predefinedLabels = ["OneNote", "Red Social", "Web", "Carpeta"];

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xl space-y-6 mb-8 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {initialData ? "Editar Cliente" : "Nuevo Cliente"}
        </h3>
        <button type="button" onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
          <X size={20} className="text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre</label>
          <input
            type="text"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="Ej: Juan"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Apellido</label>
          <input
            type="text"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Ej: Pérez"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">WhatsApp</label>
          <div className="relative">
            <MessageCircle size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="tel"
              className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              placeholder="Ej: 54911..."
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Email</label>
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={handleEmailBlur}
              placeholder="Ej: juan@gmail.com"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">URL Foto de Perfil</label>
        <div className="relative">
          <Camera size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            value={formData.photoURL}
            onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
            placeholder="https://... (Se autocompleta con Gmail)"
          />
        </div>
        {formData.photoURL && (
          <div className="mt-2 flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
            <img src={formData.photoURL} alt="Vista previa" className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-500">Vista previa de la foto</span>
            <button 
              type="button" 
              onClick={() => setFormData({ ...formData, photoURL: "" })}
              className="ml-auto text-xs text-red-500 hover:underline"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Domicilio</label>
        <div className="relative">
          <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Ej: Av. Siempre Viva 742"
          />
        </div>
      </div>

      {/* Multiple URLs Section */}
      <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Enlaces / URLs</label>
          <button
            type="button"
            onClick={addUrl}
            className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} /> Agregar Enlace
          </button>
        </div>
        <div className="grid gap-3">
          {urls.map((u, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Etiqueta</label>
                <div className="space-y-2">
                  <select
                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800"
                    value={predefinedLabels.includes(u.label) ? u.label : ""}
                    onChange={(e) => updateUrl(idx, "label", e.target.value)}
                  >
                    <option value="">Personalizado</option>
                    {predefinedLabels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {!predefinedLabels.includes(u.label) && (
                    <input
                      type="text"
                      placeholder="Ej: LinkedIn"
                      className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                      value={u.label}
                      onChange={(e) => updateUrl(idx, "label", e.target.value)}
                    />
                  )}
                </div>
              </div>
              <div className="sm:col-span-7">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  value={u.url}
                  onChange={(e) => updateUrl(idx, "url", e.target.value)}
                />
              </div>
              <div className="sm:col-span-1 flex justify-center sm:pt-6">
                <button
                  type="button"
                  onClick={() => removeUrl(idx)}
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Fields Section */}
      <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Campos Personalizados</label>
          <button
            type="button"
            onClick={addCustomField}
            className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} /> Agregar Campo
          </button>
        </div>
        <div className="grid gap-3">
          {customFields.map((field, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: DNI"
                  className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  value={field.key}
                  onChange={(e) => updateCustomField(idx, "key", e.target.value)}
                />
              </div>
              <div className="sm:col-span-7">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Valor</label>
                <input
                  type="text"
                  placeholder="Valor..."
                  className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  value={field.value}
                  onChange={(e) => updateCustomField(idx, "value", e.target.value)}
                />
              </div>
              <div className="sm:col-span-1 flex justify-center sm:pt-6">
                <button
                  type="button"
                  onClick={() => removeCustomField(idx)}
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
        <button 
          type="button" 
          onClick={onCancel} 
          className="px-6 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          className="px-8 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          {initialData ? "Actualizar Cliente" : "Guardar Cliente"}
        </button>
      </div>
    </form>
  );
}
