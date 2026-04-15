import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Device, Client, Ticket } from "../types";
import { Smartphone, Calendar, AlertCircle, FileText, Upload, Camera, X, Edit2, Trash2, ClipboardPlus, CheckCircle2, Plus, Cpu, MessageCircle, ArrowLeft, ChevronRight, ChevronLeft, Clock, Check, ReceiptText, Filter, Search, ChevronDown } from "lucide-react";
import { Modal } from "./Modal";

export type DeviceFilterStatus = 'all' | 'pending' | 'completed' | 'no-tickets';

export function DevicesList({ 
  clientId, 
  initialDeviceId, 
  initialFilter = 'all',
  onFilterChange,
  onNavigateToClient,
  onNavigateToBudget
}: { 
  clientId?: string, 
  initialDeviceId?: string,
  initialFilter?: DeviceFilterStatus,
  onFilterChange?: (filter: DeviceFilterStatus) => void,
  onNavigateToClient?: (clientId: string) => void,
  onNavigateToBudget?: (deviceId: string) => void
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(initialDeviceId || null);
  const [showForm, setShowForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [selectedMsinfo, setSelectedMsinfo] = useState<{key: string, value: string}[] | null>(null);
  const [selectedDxdiag, setSelectedDxdiag] = useState<{key: string, value: string}[] | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [activePhotoList, setActivePhotoList] = useState<string[]>([]);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);
  const [ticketDevice, setTicketDevice] = useState<Device | null>(null);
  const [editingTicket, setEditingTicket] = useState<{device: Device, ticket: Ticket} | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<{deviceId: string, ticketId: string} | null>(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<{device: Device, ticket: Ticket} | null>(null);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilterStatus>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    Promise.all([api.getDevices(), api.getClients()]).then(([devs, clis]) => {
      setDevices(devs);
      const clientMap = clis.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      setClients(clientMap);
    });
  }, []);

  useEffect(() => {
    setSelectedDeviceId(initialDeviceId || null);
  }, [clientId, initialDeviceId]);

  const handleFilterToggle = () => {
    const newFilter = deviceFilter === 'all' ? 'pending' : 'all';
    setDeviceFilter(newFilter);
    if (onFilterChange) onFilterChange(newFilter);
  };

  const filteredDevices = devices.filter((d) => {
    if (clientId && d.clientId !== clientId) return false;
    
    // Status Filter
    if (deviceFilter === 'pending') {
      if (!d.tickets || d.tickets.length === 0 || !d.tickets.some(t => !t.isCompleted)) return false;
    } else if (deviceFilter === 'completed') {
      if (!d.tickets || d.tickets.length === 0 || d.tickets.some(t => !t.isCompleted)) return false;
    } else if (deviceFilter === 'no-tickets') {
      if (d.tickets && d.tickets.length > 0) return false;
    }

    // Search Query (Type, Brand, Model, CPU, RAM)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const type = (d.deviceType === "Otro" ? d.deviceTypeOther : d.deviceType) || "";
      const brand = d.brand || "";
      const model = d.model || "";
      
      // Hardware details search
      const hardwareMatch = d.hardwareDetails?.some(h => 
        h.key.toLowerCase().includes(q) || h.value.toLowerCase().includes(q)
      );
      const legacyHardwareMatch = d.hardware?.toLowerCase().includes(q);

      const matches = 
        type.toLowerCase().includes(q) ||
        brand.toLowerCase().includes(q) ||
        model.toLowerCase().includes(q) ||
        hardwareMatch ||
        legacyHardwareMatch;

      if (!matches) return false;
    }

    return true;
  });
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const handleDeviceSaved = (device: Device) => {
    if (editingDevice) {
      setDevices(devices.map(d => d.id === device.id ? device : d));
      setEditingDevice(null);
    } else {
      setDevices([...devices, device]);
      setShowForm(false);
    }
  };

  const confirmDelete = async () => {
    if (deviceToDelete) {
      await api.deleteDevice(deviceToDelete);
      setDevices(devices.filter(d => d.id !== deviceToDelete));
      setDeviceToDelete(null);
    }
  };

  const confirmDeleteTicket = async () => {
    if (ticketToDelete) {
      const updatedDevice = await api.deleteTicket(ticketToDelete.deviceId, ticketToDelete.ticketId);
      setDevices(devices.map(d => d.id === updatedDevice.id ? updatedDevice : d));
      setTicketToDelete(null);
    }
  };

  const handleDeletePhoto = async (photoUrl: string) => {
    if (!selectedDevice) return;
    
    const updatedPhotos = selectedDevice.photos.filter(p => p !== photoUrl);
    const formData = new FormData();
    formData.append("existingPhotos", JSON.stringify(updatedPhotos));
    
    try {
      const updated = await api.updateDevice(selectedDevice.id, formData);
      setDevices(devices.map(d => d.id === updated.id ? updated : d));
      setSelectedPhoto(null);
    } catch (error) {
      console.error("Error deleting photo", error);
    }
  };

  const sendWhatsAppNotification = (device: Device, ticket: Ticket) => {
    const client = clients[device.clientId];
    if (!client || !client.whatsapp) return;

    let itemsDetail = "";
    let total = 0;

    if (ticket.resolutionItems && ticket.resolutionItems.length > 0) {
      itemsDetail = "\n\n*Detalle de tareas:*";
      ticket.resolutionItems.forEach(item => {
        itemsDetail += `\n- ${item.task}: $${item.amount.toLocaleString()}`;
        total += item.amount;
      });
      itemsDetail += `\n\n*TOTAL:* $${total.toLocaleString()}`;
    }

    const message = `Hola *${client.firstName}*, te informamos que tu equipo *${device.brand} ${device.model}* está listo.\n\n*Motivo del servicio:* ${ticket.description}${itemsDetail}\n\n¡Puedes pasar a retirarlo cuando gustes!`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${client.whatsapp.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {selectedDeviceId && (
            <button 
              onClick={() => setSelectedDeviceId(null)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-xl font-semibold">
            {selectedDeviceId ? "Detalle del Equipo" : "Equipos"}
          </h2>
        </div>
        {!showForm && !editingDevice && !selectedDeviceId && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white p-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
            title="Ingresar Equipo"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Ingresar Equipo</span>
          </button>
        )}
      </div>

      {!showForm && !editingDevice && !selectedDeviceId && (
        <div className="flex flex-col gap-3 w-full">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por tipo, marca, modelo, cpu, ram..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              <select
                value={deviceFilter}
                onChange={(e) => {
                  const val = e.target.value as DeviceFilterStatus;
                  setDeviceFilter(val);
                  if (onFilterChange) onFilterChange(val);
                }}
                className="pl-10 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none cursor-pointer transition-all min-w-[160px]"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="completed">Completados</option>
                <option value="no-tickets">Sin tickets</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            </div>
          </div>
        </div>
      )}

      {(showForm || editingDevice) && (
        <DeviceForm
          initialData={editingDevice || undefined}
          preselectedClientId={clientId}
          clients={Object.values(clients)}
          onSuccess={handleDeviceSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingDevice(null);
          }}
        />
      )}

      {/* List View */}
      {!showForm && !editingDevice && !selectedDeviceId && (
        <div className="grid gap-3">
          {filteredDevices.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-center py-8">No hay equipos registrados.</p>
          )}
          {filteredDevices.map((device) => {
            const client = clients[device.clientId];
            const lastTicket = device.tickets && device.tickets.length > 0 
              ? [...device.tickets].sort((a, b) => b.date.localeCompare(a.date))[0] 
              : null;

            return (
              <div 
                key={device.id} 
                onClick={() => setSelectedDeviceId(device.id)}
                className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        device.deviceType === 'Celular' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                        device.deviceType === 'PC' || device.deviceType === 'Laptop' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {device.deviceType === "Otro" ? device.deviceTypeOther : device.deviceType}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Calendar size={10} /> {device.entryDate}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {device.brand} {device.model || "Modelo no especificado"}
                    </h3>
                    
                    <div className="mt-2 space-y-1">
                      {!clientId && client && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                          <MessageCircle size={14} className="text-blue-500" />
                          <span>{client.firstName} {client.lastName}</span>
                        </div>
                      )}
                      
                      {lastTicket ? (
                        <div className="flex items-center gap-1.5">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            lastTicket.isCompleted 
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-800' 
                              : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-800'
                          }`}>
                            {lastTicket.isCompleted ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                            {lastTicket.isCompleted ? 'Completado' : 'Pendiente'}
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                            Último ticket: {lastTicket.date}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                          Sin tickets registrados
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail View */}
      {!showForm && !editingDevice && selectedDevice && (
        <div key={selectedDevice.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-start mb-4 bg-gray-50 dark:bg-gray-900 -mx-4 -mt-4 p-4 rounded-t-xl border-b border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-xl">
                {selectedDevice.brand} {selectedDevice.model || "Modelo no especificado"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                Tipo: {selectedDevice.deviceType === "Otro" ? selectedDevice.deviceTypeOther : selectedDevice.deviceType}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 dark:text-gray-500 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 flex items-center gap-1 shadow-sm">
                <Calendar size={12} /> Ingreso: {selectedDevice.entryDate}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setEditingDevice(selectedDevice)} className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 p-2 rounded-lg shadow-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => setDeviceToDelete(selectedDevice.id)} className="bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 p-2 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
          
          {!clientId && clients[selectedDevice.clientId] && (
            <div 
              onClick={() => onNavigateToClient?.(selectedDevice.clientId)}
              className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-800 dark:text-blue-300 font-bold group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors">
                    Cliente: {clients[selectedDevice.clientId].firstName} {clients[selectedDevice.clientId].lastName}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    WhatsApp: {clients[selectedDevice.clientId].whatsapp}
                  </p>
                </div>
                <ChevronRight size={18} className="text-blue-400 dark:text-blue-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 space-y-4">
            {selectedDevice.hardwareDetails && selectedDevice.hardwareDetails.length > 0 ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                  <Cpu size={14} className="text-gray-600 dark:text-gray-400 dark:text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Especificaciones Técnicas</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {selectedDevice.hardwareDetails.map((item, idx) => (
                    <div key={idx} className="flex px-3 py-2 text-sm">
                      <span className="w-1/3 font-medium text-gray-600 dark:text-gray-400 dark:text-gray-500">{item.key}</span>
                      <span className="w-2/3 text-gray-800 dark:text-gray-200">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              selectedDevice.hardware && (
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 uppercase">Hardware</p>
                  <p className="text-gray-800 dark:text-gray-200">{selectedDevice.hardware}</p>
                </div>
              )
            )}

            {selectedDevice.problem && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-800">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase mb-0.5">Problema Inicial</p>
                  <p className="text-sm">{selectedDevice.problem}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            {selectedDevice.msinfo && selectedDevice.msinfo.length > 0 && (
              <button
                onClick={() => setSelectedMsinfo(selectedDevice.msinfo!)}
                className="flex-1 text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 hover:underline bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg justify-center border border-blue-100 dark:border-blue-800"
              >
                <FileText size={14} /> msinfo32
              </button>
            )}

            {selectedDevice.dxdiag && selectedDevice.dxdiag.length > 0 && (
              <button
                onClick={() => setSelectedDxdiag(selectedDevice.dxdiag!)}
                className="flex-1 text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 hover:underline bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg justify-center border border-blue-100 dark:border-blue-800"
              >
                <FileText size={14} /> DxDiag
              </button>
            )}
          </div>

          {selectedDevice.photos && selectedDevice.photos.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase mb-3">Galería de fotos ({selectedDevice.photos.length})</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {selectedDevice.photos.map((photo, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => {
                      setSelectedPhoto(photo);
                      setActivePhotoList(selectedDevice.photos!);
                    }}
                    className="aspect-square relative group overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
                  >
                    <img src={photo} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <Camera size={20} className="text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h4 className="text-lg font-bold text-gray-800 dark:text-gray-200">Tickets</h4>
                <button 
                  onClick={() => setTicketFilter(ticketFilter === 'pending' ? 'all' : 'pending')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all border ${
                    ticketFilter === 'pending'
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  <Clock size={12} />
                  {ticketFilter === 'pending' ? 'Solo Pendientes' : 'Ver Pendientes'}
                </button>
              </div>
              <button 
                onClick={() => setTicketDevice(selectedDevice)} 
                className="bg-blue-600 text-white p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm hover:bg-blue-700 transition-colors"
                title="Nuevo Ticket"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Nuevo Ticket</span>
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
              <button 
                onClick={() => setTicketFilter('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${ticketFilter === 'all' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
              >
                Todos ({selectedDevice.tickets?.length || 0})
              </button>
              <button 
                onClick={() => setTicketFilter('pending')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${ticketFilter === 'pending' ? 'bg-white dark:bg-gray-800 text-yellow-600 dark:text-yellow-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
              >
                Pendientes ({selectedDevice.tickets?.filter(t => !t.isCompleted).length || 0})
              </button>
              <button 
                onClick={() => setTicketFilter('completed')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${ticketFilter === 'completed' ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
              >
                Completados ({selectedDevice.tickets?.filter(t => t.isCompleted).length || 0})
              </button>
            </div>

            {ticketFilter === 'completed' && selectedDevice.tickets && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Resumen de Completados</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {selectedDevice.tickets.filter(t => t.isCompleted).length} Tickets Finalizados
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Total Recaudado</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    ${selectedDevice.tickets
                      .filter(t => t.isCompleted)
                      .reduce((sum, t) => sum + (t.resolutionItems?.reduce((s, item) => s + item.amount, 0) || 0), 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {selectedDevice.tickets && selectedDevice.tickets.length > 0 ? (
              <div className="space-y-8">
                {Object.entries(
                  selectedDevice.tickets
                    .filter(t => ticketFilter === 'all' ? true : (ticketFilter === 'completed' ? t.isCompleted : !t.isCompleted))
                    .reduce((acc, t) => {
                      const date = t.date;
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(t);
                      return acc;
                    }, {} as Record<string, Ticket[]>)
                )
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .map(([date, groupTickets]: [string, Ticket[]]) => {
                  const groupTotal = groupTickets
                    .filter(t => t.isCompleted)
                    .reduce((sum, t) => sum + (t.resolutionItems?.reduce((s, item) => s + item.amount, 0) || 0), 0);

                  return (
                    <div key={date} className="space-y-4">
                      <div className="flex justify-between items-center px-1 border-b border-gray-100 dark:border-gray-800 pb-2">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
                          <h5 className="text-sm font-bold text-gray-700 dark:text-gray-300">{date}</h5>
                        </div>
                        {groupTotal > 0 && (
                          <span className="text-xs font-bold text-green-600 dark:text-green-400">
                            Subtotal: ${groupTotal.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="space-y-4">
                        {groupTickets.map(ticket => (
                          <div 
                            key={ticket.id} 
                            onClick={() => setSelectedTicketDetail({device: selectedDevice, ticket})}
                            className={`bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl border shadow-sm transition-all cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 group/ticket ${ticket.isCompleted ? 'border-green-100 dark:border-green-900/30' : 'border-yellow-100 dark:border-yellow-900/30'}`}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const updatedTicket = { ...ticket, isCompleted: !ticket.isCompleted };
                                  const formData = new FormData();
                                  formData.append("isCompleted", String(!ticket.isCompleted));
                                  // We need to send all fields or the server might wipe them if not handled correctly
                                  // But our server implementation for updateTicket uses req.body and req.files
                                  // Let's check server.ts updateTicket implementation
                                  await api.updateTicket(selectedDevice.id, ticket.id, formData);
                                  // Update local state
                                  const updatedDevices = devices.map(d => {
                                    if (d.id === selectedDevice.id) {
                                      return {
                                        ...d,
                                        tickets: d.tickets.map(t => t.id === ticket.id ? { ...t, isCompleted: !t.isCompleted } : t)
                                      };
                                    }
                                    return d;
                                  });
                                  setDevices(updatedDevices);
                                }}
                                className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${ticket.isCompleted ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'}`}
                              >
                                {ticket.isCompleted && <Check size={14} strokeWidth={3} />}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <p className={`text-sm font-medium truncate ${ticket.isCompleted ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {ticket.description}
                                  </p>
                                  {ticket.isCompleted && (
                                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 shrink-0">
                                      ${(ticket.resolutionItems?.reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${ticket.isCompleted ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
                                    {ticket.isCompleted ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                    {ticket.isCompleted ? "Completado" : "Pendiente"}
                                  </span>
                                  {ticket.photos && ticket.photos.length > 0 && (
                                    <span className="text-[9px] text-gray-400 flex items-center gap-1">
                                      <Smartphone size={10} /> {ticket.photos.length} fotos
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-1 opacity-0 group-hover/ticket:opacity-100 transition-opacity shrink-0">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingTicket({device: selectedDevice, ticket}); }} 
                                  className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded-md transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setTicketToDelete({deviceId: selectedDevice.id, ticketId: ticket.id}); }} 
                                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-md transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                <ClipboardPlus size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">No hay tickets registrados para este equipo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal 
        isOpen={!!selectedTicketDetail} 
        onClose={() => setSelectedTicketDetail(null)} 
        title="Detalle del Ticket"
      >
        {selectedTicketDetail && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 -mx-4 -mt-4 p-4 rounded-t-xl border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ticket = selectedTicketDetail.ticket;
                    const formData = new FormData();
                    formData.append("isCompleted", String(!ticket.isCompleted));
                    await api.updateTicket(selectedTicketDetail.device.id, ticket.id, formData);
                    
                    const updatedDevices = devices.map(d => {
                      if (d.id === selectedTicketDetail.device.id) {
                        return {
                          ...d,
                          tickets: d.tickets.map(t => t.id === ticket.id ? { ...t, isCompleted: !t.isCompleted } : t)
                        };
                      }
                      return d;
                    });
                    setDevices(updatedDevices);
                    setSelectedTicketDetail({ ...selectedTicketDetail, ticket: { ...ticket, isCompleted: !ticket.isCompleted } });
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${selectedTicketDetail.ticket.isCompleted ? 'bg-green-600 text-white shadow-lg shadow-green-500/20' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'}`}
                >
                  {selectedTicketDetail.ticket.isCompleted ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                  {selectedTicketDetail.ticket.isCompleted ? "Completado" : "Marcar como Completado"}
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Calendar size={12} /> {selectedTicketDetail.ticket.date}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditingTicket({device: selectedTicketDetail.device, ticket: selectedTicketDetail.ticket});
                    setSelectedTicketDetail(null);
                  }} 
                  className="p-2 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-800 shadow-sm hover:bg-blue-50 transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => {
                    setTicketToDelete({deviceId: selectedTicketDetail.device.id, ticketId: selectedTicketDetail.ticket.id});
                    setSelectedTicketDetail(null);
                  }} 
                  className="p-2 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-lg border border-red-100 dark:border-red-800 shadow-sm hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Problema / Motivo</h4>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                  <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{selectedTicketDetail.ticket.description}</p>
                </div>
              </section>

              {(selectedTicketDetail.ticket.resolution || (selectedTicketDetail.ticket.resolutionItems && selectedTicketDetail.ticket.resolutionItems.length > 0)) && (
                <section>
                  <h4 className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-2">Resolución / Trabajo realizado</h4>
                  <div className="bg-green-50/50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900/30 space-y-4">
                    {selectedTicketDetail.ticket.resolutionItems && selectedTicketDetail.ticket.resolutionItems.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 shadow-sm">
                        <table className="w-full text-sm">
                          <thead className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-bold">
                            <tr>
                              <th className="px-4 py-3 text-left">Tarea</th>
                              <th className="px-4 py-3 text-right w-32">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-50 dark:divide-green-900/20">
                            {selectedTicketDetail.ticket.resolutionItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.task}</td>
                                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 font-bold">${item.amount.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800">
                            <tr>
                              <td className="px-4 py-3 font-bold text-green-800 dark:text-green-300">TOTAL</td>
                              <td className="px-4 py-3 text-right font-black text-blue-700 dark:text-blue-300 text-lg">
                                ${selectedTicketDetail.ticket.resolutionItems.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                    {selectedTicketDetail.ticket.resolution && (
                      <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{selectedTicketDetail.ticket.resolution}</p>
                    )}
                  </div>
                </section>
              )}

              {selectedTicketDetail.ticket.photos && selectedTicketDetail.ticket.photos.length > 0 && (
                <section>
                  <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Fotos del ticket ({selectedTicketDetail.ticket.photos.length})</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedTicketDetail.ticket.photos.map((photo, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => {
                          setSelectedPhoto(photo);
                          setActivePhotoList(selectedTicketDetail.ticket.photos!);
                        }}
                        className="aspect-video relative group overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 hover:ring-4 hover:ring-blue-500/20 transition-all"
                      >
                        <img src={photo} alt={`Foto ticket ${idx + 1}`} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="text-white" size={24} />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
              <button 
                onClick={() => setSelectedTicketDetail(null)}
                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!selectedMsinfo} onClose={() => setSelectedMsinfo(null)} title="Reporte msinfo32">
        {selectedMsinfo && (
          <table className="w-full text-sm text-left">
            <tbody>
              {selectedMsinfo.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300 w-1/3 align-top">{item.key}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400 dark:text-gray-500 break-words">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal isOpen={!!selectedDxdiag} onClose={() => setSelectedDxdiag(null)} title="Reporte DxDiag">
        {selectedDxdiag && (
          <table className="w-full text-sm text-left">
            <tbody>
              {selectedDxdiag.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300 w-1/3 align-top">{item.key}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400 dark:text-gray-500 break-words">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal isOpen={!!selectedPhoto} onClose={() => { setSelectedPhoto(null); setActivePhotoList([]); }} title="Visualización de Imagen">
        {selectedPhoto && (
          <div className="space-y-4">
            <div className="relative group">
              <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 min-h-[300px]">
                <img 
                  src={selectedPhoto} 
                  alt="Foto" 
                  className="max-w-full max-h-[65vh] object-contain animate-in zoom-in-95 duration-300"
                />
              </div>
              
              {activePhotoList.length > 1 && (
                <>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = activePhotoList.indexOf(selectedPhoto);
                      const prevIdx = (idx - 1 + activePhotoList.length) % activePhotoList.length;
                      setSelectedPhoto(activePhotoList[prevIdx]);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = activePhotoList.indexOf(selectedPhoto);
                      const nextIdx = (idx + 1) % activePhotoList.length;
                      setSelectedPhoto(activePhotoList[nextIdx]);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">
                  Foto {(activePhotoList.indexOf(selectedPhoto) || 0) + 1} de {activePhotoList.length}
                </span>
                <a 
                  href={selectedPhoto} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Ver en tamaño completo
                </a>
              </div>
              <button
                onClick={() => setPhotoToDelete(selectedPhoto)}
                className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!photoToDelete} onClose={() => setPhotoToDelete(null)} title="Confirmar Eliminación">
        <div className="p-2">
          <p className="text-gray-700 dark:text-gray-300">¿Estás seguro de que deseas eliminar esta foto? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setPhotoToDelete(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancelar
            </button>
            <button 
              onClick={() => {
                if (photoToDelete) {
                  handleDeletePhoto(photoToDelete);
                  setPhotoToDelete(null);
                }
              }} 
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deviceToDelete} onClose={() => setDeviceToDelete(null)} title="Eliminar Equipo">
        <div className="p-2">
          <p className="text-gray-700 dark:text-gray-300">¿Estás seguro de que deseas eliminar este equipo? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setDeviceToDelete(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancelar
            </button>
            <button onClick={confirmDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!ticketToDelete} onClose={() => setTicketToDelete(null)} title="Eliminar Ticket">
        <div className="p-2">
          <p className="text-gray-700 dark:text-gray-300">¿Estás seguro de que deseas eliminar este ticket de servicio? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setTicketToDelete(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancelar
            </button>
            <button onClick={confirmDeleteTicket} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      {(ticketDevice || editingTicket) && (
        <TicketFormModal
          device={ticketDevice || editingTicket!.device}
          initialData={editingTicket?.ticket}
          onClose={() => {
            setTicketDevice(null);
            setEditingTicket(null);
          }}
          onSuccess={(updatedDevice) => {
            setDevices(devices.map(d => d.id === updatedDevice.id ? updatedDevice : d));
            setTicketDevice(null);
            setEditingTicket(null);
          }}
          onNavigateToBudget={onNavigateToBudget}
        />
      )}
    </div>
  );
}

function DeviceForm({
  initialData,
  preselectedClientId,
  clients,
  onSuccess,
  onCancel,
}: {
  initialData?: Device;
  preselectedClientId?: string;
  clients: Client[];
  onSuccess: (d: Device) => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState(initialData?.clientId || preselectedClientId || "");
  const [brand, setBrand] = useState(initialData?.brand || "");
  const [model, setModel] = useState(initialData?.model || "");
  const [deviceType, setDeviceType] = useState(initialData?.deviceType || "Celular");
  const [deviceTypeOther, setDeviceTypeOther] = useState(initialData?.deviceTypeOther || "");
  const [hardware, setHardware] = useState(initialData?.hardware || "");
  const [hardwareDetails, setHardwareDetails] = useState<{key: string, value: string}[]>(
    initialData?.hardwareDetails && initialData.hardwareDetails.length > 0 
      ? initialData.hardwareDetails 
      : [
          { key: "CPU", value: "" },
          { key: "RAM", value: "" },
          { key: "Disco", value: "" },
          { key: "Capacidad", value: "" }
        ]
  );
  const [problem, setProblem] = useState(initialData?.problem || "");
  const [entryDate, setEntryDate] = useState(initialData?.entryDate || new Date().toISOString().split('T')[0]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initialData?.photos || []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [msinfoData, setMsinfoData] = useState<{ key: string; value: string }[] | null>(initialData?.msinfo || null);
  const [dxdiagData, setDxdiagData] = useState<{ key: string; value: string }[] | null>(initialData?.dxdiag || null);
  const [showMsinfoModal, setShowMsinfoModal] = useState(false);
  const [showDxdiagModal, setShowDxdiagModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const removeNewPhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = (index: number) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHardwareChange = (index: number, field: 'key' | 'value', val: string) => {
    const newDetails = [...hardwareDetails];
    newDetails[index][field] = val;
    setHardwareDetails(newDetails);
  };

  const addHardwareRow = () => {
    setHardwareDetails([...hardwareDetails, { key: "", value: "" }]);
  };

  const removeHardwareRow = (index: number) => {
    setHardwareDetails(hardwareDetails.filter((_, i) => i !== index));
  };

  const handleMsinfoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsParsing(true);
    setErrorMsg("");
    try {
      const parsed = await api.parseMsinfo(file);
      setMsinfoData(parsed);
      
      const modelItem = parsed.find(item => item.key.toLowerCase().includes("modelo del sistema"));
      if (modelItem && !model) setModel(modelItem.value);

      const brandItem = parsed.find(item => item.key.toLowerCase().includes("fabricante del sistema"));
      if (brandItem && !brand) setBrand(brandItem.value);

      const cpuItem = parsed.find(item => item.key.toLowerCase().includes("procesador"));
      const ramItem = parsed.find(item => item.key.toLowerCase().includes("memoria física (ram) instalada") || item.key.toLowerCase().includes("memoria ram"));
      
      if (cpuItem || ramItem) {
        setHardwareDetails(prev => {
          const newDetails = [...prev];
          if (cpuItem) {
            const cpuIndex = newDetails.findIndex(d => d.key.toLowerCase() === "cpu");
            if (cpuIndex >= 0) newDetails[cpuIndex].value = cpuItem.value;
            else newDetails.push({ key: "CPU", value: cpuItem.value });
          }
          if (ramItem) {
            const ramIndex = newDetails.findIndex(d => d.key.toLowerCase() === "ram");
            if (ramIndex >= 0) newDetails[ramIndex].value = ramItem.value;
            else newDetails.push({ key: "RAM", value: ramItem.value });
          }
          return newDetails;
        });
      }

    } catch (error) {
      console.error("Failed to parse msinfo", error);
      setErrorMsg("Error al procesar el archivo msinfo32.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDxdiagUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsParsing(true);
    setErrorMsg("");
    try {
      const parsed = await api.parseDxdiag(file);
      setDxdiagData(parsed);
      
      const modelItem = parsed.find(item => item.key.toLowerCase() === "system model");
      if (modelItem && !model) setModel(modelItem.value);

      const brandItem = parsed.find(item => item.key.toLowerCase() === "system manufacturer");
      if (brandItem && !brand) setBrand(brandItem.value);

      const cpuItem = parsed.find(item => item.key.toLowerCase() === "processor");
      const ramItem = parsed.find(item => item.key.toLowerCase() === "memory");
      const gpuItem = parsed.find(item => item.key.toLowerCase() === "card name");
      const diskItem = parsed.find(item => item.key.toLowerCase() === "disk model");
      
      if (cpuItem || ramItem || gpuItem || diskItem) {
        setHardwareDetails(prev => {
          const newDetails = [...prev];
          if (cpuItem) {
            const idx = newDetails.findIndex(d => d.key.toLowerCase() === "cpu");
            if (idx >= 0) newDetails[idx].value = cpuItem.value;
            else newDetails.push({ key: "CPU", value: cpuItem.value });
          }
          if (ramItem) {
            const idx = newDetails.findIndex(d => d.key.toLowerCase() === "ram");
            if (idx >= 0) newDetails[idx].value = ramItem.value;
            else newDetails.push({ key: "RAM", value: ramItem.value });
          }
          if (gpuItem) {
            const idx = newDetails.findIndex(d => d.key.toLowerCase() === "gpu" || d.key.toLowerCase() === "video");
            if (idx >= 0) newDetails[idx].value = gpuItem.value;
            else newDetails.push({ key: "GPU", value: gpuItem.value });
          }
          if (diskItem) {
            const idx = newDetails.findIndex(d => d.key.toLowerCase() === "disco");
            if (idx >= 0) newDetails[idx].value = diskItem.value;
            else newDetails.push({ key: "Disco", value: diskItem.value });
          }
          return newDetails;
        });
      }

    } catch (error) {
      console.error("Failed to parse dxdiag", error);
      setErrorMsg("Error al procesar el archivo dxdiag.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData();
    formData.append("clientId", clientId);
    formData.append("brand", brand);
    formData.append("model", model);
    formData.append("deviceType", deviceType);
    if (deviceType === "Otro") {
      formData.append("deviceTypeOther", deviceTypeOther);
    }
    formData.append("hardware", hardware);
    
    const validHardwareDetails = hardwareDetails.filter(h => h.key.trim() !== "" || h.value.trim() !== "");
    formData.append("hardwareDetails", JSON.stringify(validHardwareDetails));
    
    formData.append("problem", problem);
    formData.append("entryDate", entryDate);
    
    formData.append("existingPhotos", JSON.stringify(existingPhotos));

    photos.forEach((photo) => {
      formData.append("photos", photo);
    });

    if (msinfoData) {
      formData.append("msinfo", JSON.stringify(msinfoData));
    }

    if (dxdiagData) {
      formData.append("dxdiag", JSON.stringify(dxdiagData));
    }

    try {
      let savedDevice;
      if (initialData) {
        savedDevice = await api.updateDevice(initialData.id, formData);
      } else {
        savedDevice = await api.createDevice(formData);
      }
      onSuccess(savedDevice);
    } catch (error) {
      console.error("Error saving device", error);
      setErrorMsg("Error al guardar el equipo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
      <h3 className="font-semibold text-lg border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
        {initialData ? "Editar Equipo" : "Nuevo Equipo"}
      </h3>

      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {!preselectedClientId && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
          <select
            className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Seleccionar cliente (opcional)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de equipo</label>
          <select
            className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
          >
            <option value="Celular">Celular</option>
            <option value="Tablet">Tablet</option>
            <option value="PC">PC</option>
            <option value="Laptop">Laptop</option>
            <option value="Otro">Otro...</option>
          </select>
        </div>
        {deviceType === "Otro" && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Detallar tipo</label>
            <input
              type="text"
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
              value={deviceTypeOther}
              onChange={(e) => setDeviceTypeOther(e.target.value)}
              placeholder="Ej: Consola"
            />
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Marca</label>
          <input
            type="text"
            className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Modelo</label>
          <input
            type="text"
            className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Especificaciones Técnicas</label>
          <button type="button" onClick={addHardwareRow} className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
            <Plus size={12} /> Agregar fila
          </button>
        </div>
        
        <div className="space-y-2">
          {hardwareDetails.map((item, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Componente (ej. CPU)"
                className="w-1/3 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                value={item.key}
                onChange={(e) => handleHardwareChange(index, 'key', e.target.value)}
              />
              <input
                type="text"
                placeholder="Detalle (ej. Intel i5)"
                className="flex-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                value={item.value}
                onChange={(e) => handleHardwareChange(index, 'value', e.target.value)}
              />
              <button 
                type="button" 
                onClick={() => removeHardwareRow(index)}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        
        {/* Legacy hardware field for backward compatibility, only show if it has content and no details exist */}
        {hardware && hardwareDetails.length === 0 && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">Notas de hardware (Legado)</label>
            <textarea
              className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              rows={2}
              value={hardware}
              onChange={(e) => setHardware(e.target.value)}
            ></textarea>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button 
          type="button" 
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-200 dark:border-blue-800 w-full justify-center"
        >
          <Upload size={16} />
          Importar datos (msinfo32 / DxDiag)
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Problema reportado</label>
        <textarea
          className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          rows={3}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        ></textarea>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de ingreso</label>
        <input
          type="date"
          className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Fotos del equipo</label>
        <div className="flex gap-2 mb-3">
          <label className="flex-1 cursor-pointer bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-center gap-2 transition-colors">
            <Upload size={16} /> Subir Foto
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handlePhotoAdd}
            />
          </label>
          <label className="flex-1 cursor-pointer bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-center gap-2 transition-colors">
            <Camera size={16} /> Tomar Foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoAdd}
            />
          </label>
        </div>
        
        {(existingPhotos.length > 0 || photos.length > 0) && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {existingPhotos.map((photoUrl, idx) => (
              <div key={`ext-${idx}`} className="relative shrink-0">
                <img 
                  src={photoUrl} 
                  alt={`Existing ${idx}`} 
                  className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" 
                />
                <button
                  type="button"
                  onClick={() => removeExistingPhoto(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.map((photo, idx) => (
              <div key={`new-${idx}`} className="relative shrink-0">
                <img 
                  src={URL.createObjectURL(photo)} 
                  alt={`New ${idx}`} 
                  className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" 
                />
                <button
                  type="button"
                  onClick={() => removeNewPhoto(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">
          Cancelar
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting || isParsing}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          {isSubmitting ? "Guardando..." : (initialData ? "Actualizar Equipo" : "Guardar Equipo")}
        </button>
      </div>
    </form>

    <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Importar datos de hardware">
      <div className="p-4 space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Selecciona un archivo .txt exportado de msinfo32 o DxDiag para cargar automáticamente las especificaciones del equipo.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center text-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              <FileText size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">msinfo32</h4>
              <p className="text-xs text-gray-500 mt-1">Información del sistema de Windows</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors">
                <Upload size={16} /> {isParsing ? "Procesando..." : (msinfoData ? "Reemplazar archivo" : "Subir archivo .txt")}
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    handleMsinfoUpload(e);
                    if (!isParsing) setShowImportModal(false);
                  }}
                  disabled={isParsing}
                />
              </label>
              {msinfoData && (
                <button 
                  type="button" 
                  onClick={() => {
                    setShowImportModal(false);
                    setShowMsinfoModal(true);
                  }} 
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Ver datos cargados
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center text-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
              <Cpu size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">DxDiag</h4>
              <p className="text-xs text-gray-500 mt-1">Herramienta de diagnóstico de DirectX</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <label className="cursor-pointer bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2 transition-colors">
                <Upload size={16} /> {isParsing ? "Procesando..." : (dxdiagData ? "Reemplazar archivo" : "Subir archivo .txt")}
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    handleDxdiagUpload(e);
                    if (!isParsing) setShowImportModal(false);
                  }}
                  disabled={isParsing}
                />
              </label>
              {dxdiagData && (
                <button 
                  type="button" 
                  onClick={() => {
                    setShowImportModal(false);
                    setShowDxdiagModal(true);
                  }} 
                  className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
                >
                  Ver datos cargados
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button 
            type="button" 
            onClick={() => setShowImportModal(false)}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>

    <Modal isOpen={showMsinfoModal} onClose={() => setShowMsinfoModal(false)} title="Copiar datos de msinfo32">
      {msinfoData && (
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-4">
            Haz clic en el botón <Plus size={14} className="inline text-blue-600 dark:text-blue-400" /> para copiar un dato a la tabla de Especificaciones Técnicas.
          </p>
          <table className="w-full text-sm text-left">
            <tbody>
              {msinfoData.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="py-2 pr-2 font-medium text-gray-700 dark:text-gray-300 w-1/3 align-top">{item.key}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400 dark:text-gray-500 break-words pr-2">{item.value}</td>
                  <td className="py-2 pl-2 text-right w-10">
                    <button 
                      type="button"
                      onClick={() => {
                        setHardwareDetails(prev => [...prev, { key: item.key, value: item.value }]);
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 p-1.5 rounded-md transition-colors"
                      title="Copiar a especificaciones"
                    >
                      <Plus size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>

    <Modal isOpen={showDxdiagModal} onClose={() => setShowDxdiagModal(false)} title="Copiar datos de DxDiag">
      {dxdiagData && (
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-4">
            Haz clic en el botón <Plus size={14} className="inline text-blue-600 dark:text-blue-400" /> para copiar un dato a la tabla de Especificaciones Técnicas.
          </p>
          <table className="w-full text-sm text-left">
            <tbody>
              {dxdiagData.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="py-2 pr-2 font-medium text-gray-700 dark:text-gray-300 w-1/3 align-top">{item.key}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400 dark:text-gray-500 break-words pr-2">{item.value}</td>
                  <td className="py-2 pl-2 text-right w-10">
                    <button 
                      type="button"
                      onClick={() => {
                        setHardwareDetails(prev => [...prev, { key: item.key, value: item.value }]);
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 p-1.5 rounded-md transition-colors"
                      title="Copiar a especificaciones"
                    >
                      <Plus size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
    </>
  );
}

function TicketFormModal({ 
  device, 
  initialData, 
  onClose, 
  onSuccess,
  onNavigateToBudget
}: { 
  device: Device, 
  initialData?: import("../types").Ticket, 
  onClose: () => void, 
  onSuccess: (d: Device) => void,
  onNavigateToBudget?: (deviceId: string) => void
}) {
  const [description, setDescription] = useState(initialData?.description || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [resolution, setResolution] = useState(initialData?.resolution || "");
  const [resolutionItems, setResolutionItems] = useState<{ task: string; amount: number }[]>(
    initialData?.resolutionItems || []
  );
  const [isCompleted, setIsCompleted] = useState(initialData?.isCompleted || false);
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initialData?.photos || []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const removeNewPhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = (index: number) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const addResolutionItem = () => setResolutionItems([...resolutionItems, { task: "", amount: 0 }]);
  const removeResolutionItem = (index: number) => setResolutionItems(resolutionItems.filter((_, i) => i !== index));
  const updateResolutionItem = (index: number, field: "task" | "amount", value: any) => {
    const newItems = [...resolutionItems];
    if (field === "amount") {
      newItems[index][field] = parseFloat(value) || 0;
    } else {
      newItems[index][field] = value;
    }
    setResolutionItems(newItems);
  };

  const totalAmount = resolutionItems.reduce((sum, item) => sum + item.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("description", description);
    formData.append("date", date);
    formData.append("resolution", resolution);
    formData.append("resolutionItems", JSON.stringify(resolutionItems));
    formData.append("isCompleted", isCompleted.toString());
    formData.append("existingPhotos", JSON.stringify(existingPhotos));
    photos.forEach(p => formData.append("photos", p));

    try {
      let updatedDevice;
      if (initialData) {
        updatedDevice = await api.updateTicket(device.id, initialData.id, formData);
      } else {
        updatedDevice = await api.addTicket(device.id, formData);
      }
      onSuccess(updatedDevice);
    } catch (error) {
      console.error("Error saving ticket", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={initialData ? `Editar Ticket - ${device.brand} ${device.model}` : `Nuevo Ticket - ${device.brand} ${device.model}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de creación</label>
            <input
              type="date"
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo del servicio / Problema</label>
          <textarea
            className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalla por qué ingresa el equipo..."
          ></textarea>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Resolución / Qué se hizo</label>
            <button
              type="button"
              onClick={addResolutionItem}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-300 flex items-center gap-1 font-medium"
            >
              <Plus size={12} /> Agregar tarea
            </button>
          </div>
          
          <div className="space-y-2 mb-3">
            {resolutionItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <input
                  type="text"
                  placeholder="Tarea realizada..."
                  className="flex-1 p-1.5 text-xs rounded border border-gray-300 dark:border-gray-600"
                  value={item.task}
                  onChange={(e) => updateResolutionItem(idx, "task", e.target.value)}
                />
                <div className="w-24 relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs">$</span>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full p-1.5 pl-5 text-xs rounded border border-gray-300 dark:border-gray-600"
                    value={item.amount || ""}
                    onChange={(e) => updateResolutionItem(idx, "amount", e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeResolutionItem(idx)}
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {resolutionItems.length > 0 && (
            <div className="flex justify-end mb-3 px-2">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                Total: <span className="text-blue-600 dark:text-blue-400">${totalAmount.toLocaleString()}</span>
              </p>
            </div>
          )}

          <textarea
            className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
            rows={2}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Notas adicionales sobre la resolución..."
          ></textarea>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <input
            type="checkbox"
            id="isCompleted"
            checked={isCompleted}
            onChange={(e) => setIsCompleted(e.target.checked)}
            className="w-4 h-4 text-blue-600 dark:text-blue-400 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
          />
          <label htmlFor="isCompleted" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            Marcar tarea como completada
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fotos del problema / resolución</label>
          <div className="flex gap-2 mb-3">
            <label className="flex-1 cursor-pointer bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center gap-2 transition-colors">
              <Upload size={16} /> Subir Foto
              <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoAdd} />
            </label>
            <label className="flex-1 cursor-pointer bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center gap-2 transition-colors">
              <Camera size={16} /> Tomar Foto
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoAdd} />
            </label>
          </div>
          
          {(existingPhotos.length > 0 || photos.length > 0) && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {existingPhotos.map((photoUrl, idx) => (
                <div key={`ext-${idx}`} className="relative shrink-0">
                  <img src={photoUrl} alt={`Existing ${idx}`} className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                  <button type="button" onClick={() => removeExistingPhoto(idx)} className="absolute -top-2 -right-2 bg-red-50 dark:bg-red-900/200 text-white rounded-full p-1 shadow-sm hover:bg-red-600">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.map((photo, idx) => (
                <div key={`new-${idx}`} className="relative shrink-0">
                  <img src={URL.createObjectURL(photo)} alt={`New ${idx}`} className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                  <button type="button" onClick={() => removeNewPhoto(idx)} className="absolute -top-2 -right-2 bg-red-50 dark:bg-red-900/200 text-white rounded-full p-1 shadow-sm hover:bg-red-600">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
          {onNavigateToBudget && (
            <button 
              type="button" 
              onClick={() => onNavigateToBudget(device.id)}
              className="px-4 py-2 text-sm bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 flex items-center gap-2 font-bold transition-colors"
            >
              <ReceiptText size={16} />
              Crear Presupuesto
            </button>
          )}
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50 font-bold">
            {isSubmitting ? "Guardando..." : "Guardar Ticket"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
