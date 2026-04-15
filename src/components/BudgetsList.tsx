import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Budget, Device, Client, BudgetItem, Ticket, ServiceType, Project } from "../types";
import { ReceiptText, Plus, Trash2, Edit2, FileDown, MessageCircle, ArrowLeft, ChevronRight, Calculator, X, CheckCircle, Clock, AlertTriangle, Briefcase, Folder } from "lucide-react";
import { Modal } from "./Modal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBase64ImageFromUrl } from "../lib/utils";

export function BudgetsList({ 
  appMode,
  initialDeviceId 
}: { 
  appMode: "workshop" | "project",
  initialDeviceId?: string 
}) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [showForm, setShowForm] = useState(!!initialDeviceId);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [budgetToApprove, setBudgetToApprove] = useState<Budget | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    Promise.all([api.getBudgets(), api.getDevices(), api.getClients(), api.getProjects()]).then(([buds, devs, clis, projs]) => {
      setBudgets(buds);
      setDevices(devs);
      setProjects(projs);
      const clientMap = clis.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      setClients(clientMap);
    });
  }, []);

  const handleBudgetSaved = (budget: Budget) => {
    if (editingBudget) {
      setBudgets(budgets.map(b => b.id === budget.id ? budget : b));
      setEditingBudget(null);
    } else {
      setBudgets([...budgets, budget]);
      setShowForm(false);
    }
  };

  const confirmDelete = async () => {
    if (budgetToDelete) {
      await api.deleteBudget(budgetToDelete);
      setBudgets(budgets.filter(b => b.id !== budgetToDelete));
      setBudgetToDelete(null);
    }
  };

  const generatePDF = async (budget: Budget) => {
    const device = devices.find(d => d.id === budget.deviceId);
    const client = clients[budget.clientId];
    
    const doc = new jsPDF();

    // Add Logo
    try {
      const logoBase64 = await getBase64ImageFromUrl("/data/logo.png");
      doc.addImage(logoBase64, "PNG", 20, 10, 15, 15);
    } catch (error) {
      console.warn("Could not load logo for PDF", error);
    }
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text("GeekyFix Workshop", 105, 20, { align: "center" });
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("PRESUPUESTO", 105, 30, { align: "center" });
    
    // Client & Device Info
    doc.setFontSize(10);
    doc.text(`Fecha: ${budget.date}`, 150, 45);
    doc.text(`Presupuesto #: ${budget.id.substring(0, 8)}`, 150, 50);
    
    doc.setFontSize(12);
    doc.text("CLIENTE:", 20, 45);
    doc.setFontSize(10);
    doc.text(`${client?.firstName} ${client?.lastName}`, 20, 52);
    doc.text(`WhatsApp: ${client?.whatsapp || "N/A"}`, 20, 57);
    
    doc.setFontSize(12);
    doc.text(budget.type === 'device' ? "EQUIPO:" : (budget.type === 'project' ? "PROYECTO:" : "SERVICIO:"), 20, 70);
    doc.setFontSize(10);
    if (budget.type === 'device') {
      doc.text(`${device?.brand || "N/A"} ${device?.model || ""}`, 20, 77);
      doc.text(`Tipo: ${device?.deviceType === "Otro" ? device?.deviceTypeOther : (device?.deviceType || "N/A")}`, 20, 82);
    } else if (budget.type === 'project') {
      const project = projects.find(p => p.id === budget.projectId);
      doc.text(project?.name || "N/A", 20, 77);
    } else {
      doc.text(budget.type === 'support' ? "Soporte Técnico" : "Servicio General", 20, 77);
    }
    
    // Table
    const tableData = budget.items.map(item => [
      item.title,
      item.description,
      item.quantity.toString(),
      `$${item.amount.toLocaleString()}`,
      `$${(item.amount * item.quantity).toLocaleString()}`
    ]);
    
    autoTable(doc, {
      startY: 90,
      head: [["Título", "Descripción", "Cant.", "Precio Unit.", "Subtotal"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] },
      foot: [["", "", "", "TOTAL", `$${budget.total.toLocaleString()}`]],
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: "bold" }
    });
    
    // Notes
    if (budget.notes) {
      const finalY = (doc as any).lastAutoTable.finalY || 150;
      doc.setFontSize(12);
      doc.text("NOTAS:", 20, finalY + 15);
      doc.setFontSize(10);
      doc.text(budget.notes, 20, finalY + 22, { maxWidth: 170 });
    }
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Gracias por confiar en GeekyFix Workshop", 105, 280, { align: "center" });
    
    doc.save(`Presupuesto_${client?.lastName}_${budget.id.substring(0, 8)}.pdf`);
  };

  const shareWhatsApp = (budget: Budget) => {
    const client = clients[budget.clientId];
    const device = devices.find(d => d.id === budget.deviceId);
    if (!client || !client.whatsapp) return;

    let message = `Hola *${client.firstName}*, te envío el presupuesto para tu *${device?.brand} ${device?.model}*.\n\n`;
    message += `*Detalle:*`;
    budget.items.forEach(item => {
      message += `\n- ${item.title}: $${(item.amount * item.quantity).toLocaleString()}`;
    });
    message += `\n\n*TOTAL:* $${budget.total.toLocaleString()}`;
    message += `\n\n¡Quedamos a la espera de tu confirmación!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${client.whatsapp.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };
  
  const handleApproveBudget = async (budget: Budget) => {
    setIsApproving(true);
    try {
      // 1. Update budget status
      const updatedBudget = await api.updateBudget(budget.id, { ...budget, status: 'approved' });
      setBudgets(budgets.map(b => b.id === budget.id ? updatedBudget : b));
      
      // 2. Create ticket or service task based on budget type
      if (budget.type === 'device' && budget.deviceId) {
        const formData = new FormData();
        formData.append("description", `Presupuesto aprobado #${budget.id.substring(0, 8)}`);
        
        const resolutionItems = budget.items.map(item => ({
          task: `${item.title} (${item.quantity}x)`,
          amount: item.amount * item.quantity
        }));
        
        formData.append("resolutionItems", JSON.stringify(resolutionItems));
        formData.append("isCompleted", "false");
        
        await api.addTicket(budget.deviceId, formData);
      } else if (budget.type === 'support' || budget.type === 'service') {
        // Create a service task for support/service budgets
        await api.createServiceTask({
          clientId: budget.clientId,
          date: new Date().toISOString().split('T')[0],
          description: `Presupuesto aprobado #${budget.id.substring(0, 8)}: ${budget.items.map(i => i.title).join(', ')}`,
          duration: "Pendiente",
          amount: budget.total,
          isCompleted: false
        });
      }
      
      setBudgetToApprove(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error approving budget", error);
    } finally {
      setIsApproving(false);
    }
  };

  const filteredBudgets = budgets.filter(budget => {
    return appMode === 'workshop' 
      ? (budget.type !== 'project' && (budget.type as string) !== 'projects') 
      : (budget.type === 'project' || (budget.type as string) === 'projects');
  });

  const selectedBudget = budgets.find(b => b.id === selectedBudgetId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {selectedBudgetId && (
            <button 
              onClick={() => setSelectedBudgetId(null)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-xl font-semibold">
            {selectedBudgetId ? "Detalle de Presupuesto" : "Presupuestos"}
          </h2>
        </div>
        {!showForm && !editingBudget && !selectedBudgetId && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white p-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nuevo Presupuesto</span>
          </button>
        )}
      </div>

      {(showForm || editingBudget) && (
        <BudgetForm
          appMode={appMode}
          initialData={editingBudget || undefined}
          devices={devices}
          projects={projects}
          clients={Object.fromEntries(
            Object.entries(clients).filter(([_, c]) => {
              const client = c as Client;
              return appMode === 'workshop' ? (client.type === 'workshop' || !client.type) : ((client.type as string) === 'project' || (client.type as string) === 'projects');
            })
          ) as Record<string, Client>}
          onSuccess={handleBudgetSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingBudget(null);
          }}
        />
      )}

      {!showForm && !editingBudget && !selectedBudgetId && (
        <div className="grid gap-3">
          {filteredBudgets.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No hay presupuestos registrados.</p>
          )}
          {filteredBudgets.map((budget) => {
            const device = devices.find(d => d.id === budget.deviceId);
            const client = clients[budget.clientId];
            return (
              <div 
                key={budget.id} 
                onClick={() => setSelectedBudgetId(budget.id)}
                className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-bold">#{budget.id.substring(0, 8)}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">• {budget.date}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${budget.type === 'device' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : budget.type === 'support' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : budget.type === 'project' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                        {budget.type === 'device' ? 'Equipo' : budget.type === 'support' ? 'Soporte' : budget.type === 'project' ? 'Proyecto' : 'Servicio'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {budget.type === 'device' ? `${device?.brand} ${device?.model}` : (budget.type === 'project' ? projects.find(p => p.id === budget.projectId)?.name : (budget.type === 'support' ? 'Soporte Técnico' : 'Servicio General'))}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Cliente: <span className="text-blue-600 dark:text-blue-400 font-medium">{client?.firstName} {client?.lastName}</span>
                      </p>
                      {budget.status === 'approved' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded uppercase">
                          <CheckCircle size={10} /> Aprobado
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-2">
                      ${budget.total.toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedBudget && !showForm && !editingBudget && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-start mb-6 bg-gray-50 dark:bg-gray-900 -mx-4 -mt-4 p-4 rounded-t-xl border-b border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-xl flex items-center gap-2">
                Presupuesto #{selectedBudget.id.substring(0, 8)}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedBudget.type === 'device' ? 'bg-blue-100 text-blue-700' : selectedBudget.type === 'support' ? 'bg-amber-100 text-amber-700' : selectedBudget.type === 'project' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>
                  {selectedBudget.type === 'device' ? 'Equipo' : selectedBudget.type === 'support' ? 'Soporte' : selectedBudget.type === 'project' ? 'Proyecto' : 'Servicio'}
                </span>
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {selectedBudget.date}
              </p>
              <div className="mt-2">
                {selectedBudget.status === 'approved' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle size={14} /> PRESUPUESTO APROBADO
                  </span>
                ) : selectedBudget.status === 'rejected' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <X size={14} /> RECHAZADO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <Clock size={14} /> PENDIENTE DE APROBACIÓN
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingBudget(selectedBudget)} className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 p-2 rounded-lg shadow-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <Edit2 size={16} />
              </button>
              <button onClick={() => setBudgetToDelete(selectedBudget.id)} className="bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 p-2 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-1">Cliente</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {clients[selectedBudget.clientId]?.firstName} {clients[selectedBudget.clientId]?.lastName}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">{clients[selectedBudget.clientId]?.whatsapp}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Equipo</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {devices.find(d => d.id === selectedBudget.deviceId)?.brand} {devices.find(d => d.id === selectedBudget.deviceId)?.model}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left">Detalle</th>
                  <th className="px-4 py-3 text-center w-20">Cant.</th>
                  <th className="px-4 py-3 text-right w-32">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {selectedBudget.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 font-medium">
                      ${(item.amount * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-right font-bold text-gray-700 dark:text-gray-300">TOTAL</td>
                  <td className="px-4 py-4 text-right font-bold text-blue-700 dark:text-blue-300 text-lg">
                    ${selectedBudget.total.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selectedBudget.notes && (
            <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
              <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase mb-1">Notas</p>
              <p className="text-sm text-gray-800 dark:text-gray-200">{selectedBudget.notes}</p>
            </div>
          )}

          <div className="flex gap-3">
            {selectedBudget.status !== 'approved' && (
              <button 
                onClick={() => setBudgetToApprove(selectedBudget)}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-md"
              >
                <CheckCircle size={20} /> Aprobar
              </button>
            )}
            {selectedBudget.status === 'pending' && (
              <button 
                onClick={() => {
                  const updated = { ...selectedBudget, status: 'rejected' as const };
                  api.updateBudget(selectedBudget.id, updated).then(res => {
                    setBudgets(budgets.map(b => b.id === selectedBudget.id ? res : b));
                  });
                }}
                className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-800"
              >
                <X size={20} /> Rechazar
              </button>
            )}
            <button 
              onClick={() => generatePDF(selectedBudget)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <FileDown size={20} /> Exportar PDF
            </button>
          </div>
          <div className="mt-3">
            <button 
              onClick={() => shareWhatsApp(selectedBudget)}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
            >
              <MessageCircle size={20} /> Enviar WhatsApp
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={!!budgetToDelete} onClose={() => setBudgetToDelete(null)} title="Eliminar Presupuesto">
        <div className="p-2">
          <p className="text-gray-700 dark:text-gray-300">¿Estás seguro de que deseas eliminar este presupuesto? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setBudgetToDelete(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancelar
            </button>
            <button onClick={confirmDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!budgetToApprove} onClose={() => setBudgetToApprove(null)} title="Aprobar Presupuesto">
        <div className="p-2">
          <p className="text-gray-700 dark:text-gray-300">¿Deseas aprobar este presupuesto? Se creará una tarea automáticamente en el equipo asociado.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setBudgetToApprove(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancelar
            </button>
            <button 
              onClick={() => budgetToApprove && handleApproveBudget(budgetToApprove)} 
              disabled={isApproving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isApproving ? "Procesando..." : "Confirmar Aprobación"}
            </button>
          </div>
        </div>
      </Modal>

      {showSuccess && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
          <CheckCircle size={20} />
          <span className="font-bold">¡Presupuesto aprobado con éxito!</span>
        </div>
      )}
    </div>
  );
}

function BudgetForm({
  appMode,
  initialData,
  devices,
  projects,
  clients,
  onSuccess,
  onCancel,
}: {
  appMode: "workshop" | "project";
  initialData?: Budget;
  devices: Device[];
  projects: Project[];
  clients: Record<string, Client>;
  onSuccess: (b: Budget) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<'device' | 'support' | 'service' | 'project'>(
    initialData?.type || (appMode === 'project' ? 'project' : 'device')
  );
  const [deviceId, setDeviceId] = useState(initialData?.deviceId || "");
  const [projectId, setProjectId] = useState(initialData?.projectId || "");
  const [clientId, setClientId] = useState(initialData?.clientId || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<BudgetItem[]>(initialData?.items || [{ title: "", description: "", quantity: 1, amount: 0 }]);
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  useEffect(() => {
    api.getServiceTypes().then(setServiceTypes);
  }, []);

  // If projectId changes and type is project, update clientId
  useEffect(() => {
    if (type === 'project' && projectId) {
      const project = projects.find(p => p.id === projectId);
      if (project) setClientId(project.clientId);
    }
  }, [projectId, type, projects]);

  const addItem = () => setItems([...items, { title: "", description: "", quantity: 1, amount: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSelectService = (idx: number, serviceId: string) => {
    const service = serviceTypes.find(s => s.id === serviceId);
    if (service) {
      updateItem(idx, "title", service.name);
      updateItem(idx, "amount", service.defaultPrice);
    }
  };
  const updateItem = (idx: number, field: keyof BudgetItem, value: any) => {
    const newItems = [...items];
    if (field === "quantity") newItems[idx][field] = parseInt(value) || 0;
    else if (field === "amount") newItems[idx][field] = parseFloat(value) || 0;
    else newItems[idx][field] = value;
    setItems(newItems);
  };

  const total = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'device' && !deviceId) return;
    if (type !== 'device' && !clientId) return;
    
    setIsSubmitting(true);
    const budgetData: Partial<Budget> = {
      type,
      deviceId: type === 'device' ? deviceId : undefined,
      projectId: type === 'project' ? projectId : undefined,
      clientId: type === 'device' ? (devices.find(d => d.id === deviceId)?.clientId || clientId) : (type === 'project' ? (projects.find(p => p.id === projectId)?.clientId || clientId) : clientId),
      date,
      items,
      total,
      notes,
      status: initialData?.status || 'pending'
    };

    try {
      let saved;
      if (initialData) {
        saved = await api.updateBudget(initialData.id, budgetData);
      } else {
        saved = await api.createBudget(budgetData);
      }
      onSuccess(saved);
    } catch (error) {
      console.error("Error saving budget", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
      <h3 className="font-semibold text-lg border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
        {initialData ? "Editar Presupuesto" : "Nuevo Presupuesto"}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Clasificación del Presupuesto</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setType('device')}
              className={`p-2 text-[10px] rounded-lg border transition-all ${type === 'device' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}
            >
              Equipo
            </button>
            <button
              type="button"
              onClick={() => setType('project')}
              className={`p-2 text-[10px] rounded-lg border transition-all ${type === 'project' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
            >
              Proyecto
            </button>
            <button
              type="button"
              onClick={() => setType('support')}
              className={`p-2 text-[10px] rounded-lg border transition-all ${type === 'support' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-amber-400'}`}
            >
              Soporte
            </button>
            <button
              type="button"
              onClick={() => setType('service')}
              className={`p-2 text-[10px] rounded-lg border transition-all ${type === 'service' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-purple-400'}`}
            >
              Servicio
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {type === 'device' ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Equipo / Cliente</label>
              <select
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                required
              >
                <option value="">Seleccionar equipo...</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.brand} {d.model} - {clients[d.clientId]?.firstName} {clients[d.clientId]?.lastName}
                  </option>
                ))}
              </select>
            </div>
          ) : type === 'project' ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto / Cliente</label>
              <select
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="">Seleccionar proyecto...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {clients[p.clientId]?.firstName} {clients[p.clientId]?.lastName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <select
                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="">Seleccionar cliente...</option>
                {Object.values(clients).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
            <input
              type="date"
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ítems del presupuesto</label>
          <button type="button" onClick={addItem} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-bold">
            <Plus size={14} /> Agregar ítem
          </button>
        </div>
        
        {items.map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Ítem #{idx + 1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(idx)} className="text-red-500 p-1">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative z-10">
                <input
                  type="text"
                  placeholder="Título (ej. Cambio de pantalla)"
                  className="w-full p-2 pr-10 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  value={item.title}
                  onChange={(e) => updateItem(idx, "title", e.target.value)}
                  required
                />
                {serviceTypes.length > 0 && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 group/services">
                    <button type="button" className="text-purple-500 hover:text-purple-700 p-1">
                      <Briefcase size={16} />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 hidden group-hover/services:block max-h-48 overflow-y-auto">
                      <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Servicios Rápidos</p>
                      </div>
                      {serviceTypes.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectService(idx, s.id)}
                          className="w-full text-left px-3 py-2.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/20 flex justify-between items-center transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                        >
                          <span className="font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{s.name}</span>
                          <span className="font-bold text-purple-600 dark:text-purple-400 shrink-0">${s.defaultPrice.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Cant."
                  className="w-20 p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  required
                />
                <div className="flex-1 relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    placeholder="Monto"
                    className="w-full p-2 pl-5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
                    value={item.amount || ""}
                    onChange={(e) => updateItem(idx, "amount", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            <textarea
              placeholder="Descripción detallada..."
              className="w-full p-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600"
              rows={2}
              value={item.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
            ></textarea>
          </div>
        ))}
      </div>

      <div className="flex justify-end items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
          <Calculator size={18} />
          <span className="text-sm font-bold uppercase">Total Estimado:</span>
        </div>
        <span className="text-xl font-black text-blue-700 dark:text-blue-300">${total.toLocaleString()}</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notas adicionales</label>
        <textarea
          className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Validez del presupuesto, tiempo estimado, etc..."
        ></textarea>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
          Cancelar
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50 font-bold"
        >
          {isSubmitting ? "Guardando..." : (initialData ? "Actualizar Presupuesto" : "Guardar Presupuesto")}
        </button>
      </div>
    </form>
  );
}
