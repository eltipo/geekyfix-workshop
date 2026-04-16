import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Budget, Device, Client, BudgetItem, Ticket, ServiceType, Project, BudgetScopeSection, BudgetDirectCost, BudgetProfessionalFee, BudgetTimelineItem } from "../types";
import { ReceiptText, Plus, Trash2, Edit2, FileDown, MessageCircle, ArrowLeft, ChevronRight, Calculator, X, CheckCircle, Clock, AlertTriangle, Briefcase, Folder, Info, List, DollarSign, Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Modal } from "./Modal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBase64ImageFromUrl } from "../lib/utils";

export function BudgetsList({ 
  appMode,
  initialDeviceId,
  initialBudgetId
}: { 
  appMode: "workshop" | "project",
  initialDeviceId?: string,
  initialBudgetId?: string
}) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [showForm, setShowForm] = useState(!!initialDeviceId);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(initialBudgetId || null);
  const [budgetToApprove, setBudgetToApprove] = useState<Budget | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (initialBudgetId) {
      setSelectedBudgetId(initialBudgetId);
    }
  }, [initialBudgetId]);

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
    const project = projects.find(p => p.id === budget.projectId);
    
    const doc = new jsPDF();

    // Add Logo
    try {
      const logoBase64 = await getBase64ImageFromUrl("/data/logo.png");
      doc.addImage(logoBase64, "PNG", 25, 15, 18, 18);
    } catch (error) {
      console.warn("Could not load logo for PDF", error);
    }
    
    // Header
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("GeekyFix - Projects", 105, 25, { align: "center" });

    let currentY = 50;
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    const title = budget.title || (budget.type === 'project' ? `Propuesta de Servicios Digitales: ${project?.name || "Proyecto"}` : "PRESUPUESTO DE SERVICIOS");
    const splitTitle = doc.splitTextToSize(title, 160);
    doc.text(splitTitle, 20, currentY);
    currentY += (splitTitle.length * 10) + 5;
    
    // Metadata Row
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const metadata = `Prestador: Ignacio Abril – GeekyFix  Cliente: ${client?.firstName} ${client?.lastName}  Fecha: ${budget.date}`;
    doc.text(metadata, 20, currentY);
    currentY += 5;
    
    // Decorative line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, currentY, 190, currentY);
    currentY += 15;

    // 1. Resumen
    if (budget.summary) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("1. Resumen del Proyecto", 20, currentY);
      currentY += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const splitSummary = doc.splitTextToSize(budget.summary, 170);
      doc.text(splitSummary, 20, currentY);
      currentY += (splitSummary.length * 5) + 12;
    }

    // 2. Alcance
    if (budget.scope && budget.scope.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("2. Alcance de los Servicios", 20, currentY);
      currentY += 10;
      
      budget.scope.forEach((section) => {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 100, 100);
        doc.text(section.title, 20, currentY);
        currentY += 7;
        
        section.items.forEach(item => {
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          
          // Print Title
          const itemTitle = `\u2022 ${item.title}:`;
          doc.text(itemTitle, 25, currentY);
          
          // Calculate if we need to move to next line for description
          const titleWidth = doc.getTextWidth(itemTitle);
          let descX = 25 + titleWidth + 2;
          
          doc.setFont("helvetica", "normal");
          if (descX > 80) { // If title is long, start description on next line
            currentY += 5;
            descX = 30;
          }
          
          const itemDesc = doc.splitTextToSize(item.description, 190 - descX);
          doc.text(itemDesc, descX, currentY);
          currentY += (itemDesc.length * 5) + 4;
          
          if (currentY > 275) {
            doc.addPage();
            currentY = 20;
          }
        });
        currentY += 5;
      });
      currentY += 10;
    }

    // 3. Propuesta Económica
    doc.addPage();
    currentY = 20;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("3. Propuesta Económica", 20, currentY);
    currentY += 10;

    // Direct Costs Table
    if (budget.directCosts && budget.directCosts.length > 0) {
      doc.setFontSize(11);
      doc.text("Costos Directos (Proveedores)", 20, currentY);
      currentY += 5;
      
      const directCostsData = budget.directCosts.map(c => [c.item, c.detail, `$${c.amount.toLocaleString()}`]);
      const directTotal = budget.directCosts.reduce((s, c) => s + c.amount, 0);
      
      autoTable(doc, {
        startY: currentY,
        head: [["Ítem", "Detalle", "Inversión (ARS)"]],
        body: directCostsData,
        foot: [["Total Costos Directos", "", `$${directTotal.toLocaleString()}`]],
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.1 },
        footStyles: { fillColor: [248, 248, 248], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.1 },
        bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.1 },
        margin: { left: 20, right: 20 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // Professional Fees Table
    if (budget.professionalFees && budget.professionalFees.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Honorarios Profesionales (GeekyFix)", 20, currentY);
      currentY += 5;
      
      const feesData = budget.professionalFees.map(f => [f.item, f.description, f.amount > 0 ? `$${f.amount.toLocaleString()}` : "-"]);
      const feesTotal = budget.professionalFees.reduce((s, f) => s + f.amount, 0);
      
      autoTable(doc, {
        startY: currentY,
        head: [["Ítem", "Descripción", "Inversión (ARS)"]],
        body: feesData,
        foot: [["Total Honorarios", "", `$${feesTotal.toLocaleString()}`]],
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.1 },
        footStyles: { fillColor: [248, 248, 248], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.1 },
        bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.1 },
        margin: { left: 20, right: 20 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // Standard Items Table (if no directCosts or professionalFees)
    if ((!budget.directCosts || budget.directCosts.length === 0) && (!budget.professionalFees || budget.professionalFees.length === 0)) {
       const tableData = budget.items.map(item => [
        item.title,
        item.description,
        item.quantity.toString(),
        `$${item.amount.toLocaleString()}`,
        `$${(item.amount * item.quantity).toLocaleString()}`
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [["Título", "Descripción", "Cant.", "Precio Unit.", "Subtotal"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        foot: [["", "", "", "TOTAL", `$${budget.total.toLocaleString()}`]],
        footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: "bold" },
        margin: { left: 20, right: 20 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Inversión Total: $${budget.total.toLocaleString()} ARS`, 20, currentY);
    currentY += 15;

    // 4. Cronograma
    if (budget.timeline && budget.timeline.length > 0) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setFontSize(14);
      doc.text("4. Cronograma de Entrega", 20, currentY);
      currentY += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      budget.timeline.forEach(t => {
        doc.setFont("helvetica", "bold");
        const rangeText = t.range.endsWith(":") ? t.range : `${t.range}:`;
        doc.text(`\u2022 ${rangeText}`, 25, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(t.activity, 60, currentY);
        currentY += 7;
      });
      currentY += 10;
    }

    // 5. Condiciones Comerciales
    if (budget.paymentTerms || (budget.validityDays && budget.validityDays > 0)) {
       if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("5. Condiciones Comerciales", 20, currentY);
      currentY += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      if (budget.paymentTerms && budget.paymentTerms.length > 0) {
        const termsText = budget.paymentTerms.map(t => `${t.label}: ${t.details}`).join(", ");
        const terms = doc.splitTextToSize(`\u2022 ${termsText}`, 170);
        doc.text(terms, 20, currentY);
        currentY += (terms.length * 5) + 2;
      }
      
      if (budget.validityDays) {
        doc.text(`\u2022 Vigencia: ${budget.validityDays} días corridos.`, 20, currentY);
        currentY += 7;
      }
    }

    // Notes
    if (budget.notes) {
      if (currentY > 250) { doc.addPage(); currentY = 20; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      const notes = doc.splitTextToSize(`Nota: ${budget.notes}`, 170);
      doc.text(notes, 20, currentY);
    }
    
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex justify-between items-start mb-6 bg-gray-50 dark:bg-gray-900 -mx-6 -mt-6 p-6 rounded-t-xl border-b border-gray-100 dark:border-gray-700">
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
            {selectedBudget.type === 'device' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Equipo</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {devices.find(d => d.id === selectedBudget.deviceId)?.brand} {devices.find(d => d.id === selectedBudget.deviceId)?.model}
                </p>
              </div>
            )}
            {selectedBudget.type === 'project' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Proyecto</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {projects.find(p => p.id === selectedBudget.projectId)?.name}
                </p>
              </div>
            )}
          </div>

          {selectedBudget.type === 'project' && selectedBudget.title && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-l-4 border-indigo-600 pl-3 mb-2">{selectedBudget.title}</h4>
              {selectedBudget.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800 italic">
                  "{selectedBudget.summary}"
                </p>
              )}
            </div>
          )}

          {selectedBudget.type === 'project' && selectedBudget.scope && selectedBudget.scope.length > 0 ? (
            <div className="space-y-4 mb-6">
              <h4 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                <List size={16} className="text-indigo-600" /> Alcance del Servicio
              </h4>
              <div className="grid grid-cols-1 gap-4 w-full">
                {selectedBudget.scope.map((section, sIdx) => (
                  <div key={sIdx} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm w-full">
                    <p className="font-bold text-sm text-indigo-600 uppercase mb-3 border-b pb-2">{section.title}</p>
                    <ul className="space-y-3">
                      {section.items.map((item, iIdx) => (
                        <li key={iIdx} className="text-sm">
                          <span className="font-bold text-gray-800 dark:text-gray-200 block">• {item.title}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-4 block">{item.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
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
          )}

          {selectedBudget.type === 'project' && (selectedBudget.directCosts?.length || selectedBudget.professionalFees?.length) && (
            <div className="space-y-4 mb-6">
              <h4 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                <DollarSign size={16} className="text-green-600" /> Propuesta Económica
              </h4>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
                {selectedBudget.directCosts && selectedBudget.directCosts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Costos Directos / Inversión Inicial</p>
                    <div className="space-y-1">
                      {selectedBudget.directCosts.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                          <span><span className="font-bold">{c.item}:</span> {c.detail}</span>
                          <span className="font-bold">${c.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedBudget.professionalFees && selectedBudget.professionalFees.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Honorarios Profesionales</p>
                    <div className="space-y-1">
                      {selectedBudget.professionalFees.map((f, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                          <span><span className="font-bold">{f.item}:</span> {f.description}</span>
                          <span className="font-bold">${f.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t-2 border-indigo-200 dark:border-indigo-800">
                  <span className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase">Inversión Total Proyecto:</span>
                  <span className="text-xl font-black text-indigo-700 dark:text-indigo-400">${selectedBudget.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {selectedBudget.type === 'project' && selectedBudget.timeline && selectedBudget.timeline.length > 0 && (
            <div className="space-y-3 mb-6">
              <h4 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                <CalendarIcon size={16} className="text-blue-600" /> Cronograma y Condiciones
              </h4>
              <div className="space-y-4 w-full">
                <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900 shadow-sm w-full">
                  <p className="text-xs font-bold text-blue-600 uppercase mb-3 border-b border-blue-100 dark:border-blue-900/50 pb-2">Tiempos de Entrega / Cronograma</p>
                  <div className="space-y-3">
                    {selectedBudget.timeline.map((t, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 font-black text-blue-700 dark:text-blue-300 rounded shrink-0 h-fit text-xs">{t.range}</span>
                        <span className="text-gray-700 dark:text-gray-300 leading-tight">{t.activity}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedBudget.paymentTerms && selectedBudget.paymentTerms.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 w-full">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Condiciones Comerciales y de Pago</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                      {selectedBudget.paymentTerms[0].details}
                    </p>
                    {selectedBudget.validityDays && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                        <Clock size={14} className="text-red-500" />
                        <p className="text-xs text-red-500 font-bold uppercase underline decoration-2">Vigencia de la propuesta: {selectedBudget.validityDays} días</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedBudget.notes && (
            <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
              <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase mb-1">Notas Adicionales</p>
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{selectedBudget.notes}</p>
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
  const [activeTab, setActiveTab] = useState<'general' | 'scope' | 'economics' | 'timeline'>('general');
  const [deviceId, setDeviceId] = useState(initialData?.deviceId || "");
  const [projectId, setProjectId] = useState(initialData?.projectId || "");
  const [clientId, setClientId] = useState(initialData?.clientId || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<BudgetItem[]>(initialData?.items || [{ title: "", description: "", quantity: 1, amount: 0 }]);
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  // Elaborated fields
  const [title, setTitle] = useState(initialData?.title || "");
  const [summary, setSummary] = useState(initialData?.summary || "");
  const [scope, setScope] = useState<BudgetScopeSection[]>(initialData?.scope || []);
  const [directCosts, setDirectCosts] = useState<BudgetDirectCost[]>(initialData?.directCosts || []);
  const [professionalFees, setProfessionalFees] = useState<BudgetProfessionalFee[]>(initialData?.professionalFees || []);
  const [timeline, setTimeline] = useState<BudgetTimelineItem[]>(initialData?.timeline || []);
  const [paymentTerms, setPaymentTerms] = useState(initialData?.paymentTerms?.[0]?.details || "");
  const [validityDays, setValidityDays] = useState(initialData?.validityDays || 7);

  useEffect(() => {
    api.getServiceTypes().then(setServiceTypes);
  }, []);

  useEffect(() => {
    if (type === 'project' && projectId) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        setClientId(project.clientId);
        if (!summary) setSummary(project.description);
        if (!title) setTitle(`Propuesta de Servicios Digitales: ${project.name}`);
      }
    }
  }, [projectId, type, projects]);

  const addItem = () => setItems([...items, { title: "", description: "", quantity: 1, amount: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof BudgetItem, value: any) => {
    const newItems = [...items];
    if (field === "quantity") newItems[idx][field] = parseInt(value) || 0;
    else if (field === "amount") newItems[idx][field] = parseFloat(value) || 0;
    else newItems[idx][field] = value;
    setItems(newItems);
  };

  const addScopeSection = () => setScope([...scope, { title: "", items: [{ title: "", description: "" }] }]);
  const removeScopeSection = (sIdx: number) => setScope(scope.filter((_, i) => i !== sIdx));
  const addScopeItem = (sIdx: number) => {
    const newScope = [...scope];
    newScope[sIdx].items.push({ title: "", description: "" });
    setScope(newScope);
  };
  const removeScopeItem = (sIdx: number, iIdx: number) => {
    const newScope = [...scope];
    newScope[sIdx].items = newScope[sIdx].items.filter((_, i) => i !== iIdx);
    setScope(newScope);
  };
  const updateScopeSection = (sIdx: number, title: string) => {
    const newScope = [...scope];
    newScope[sIdx].title = title;
    setScope(newScope);
  };
  const updateScopeItem = (sIdx: number, iIdx: number, field: 'title' | 'description', value: string) => {
    const newScope = [...scope];
    newScope[sIdx].items[iIdx][field] = value;
    setScope(newScope);
  };

  const addDirectCost = () => setDirectCosts([...directCosts, { item: "", detail: "", amount: 0 }]);
  const removeDirectCost = (idx: number) => setDirectCosts(directCosts.filter((_, i) => i !== idx));
  const updateDirectCost = (idx: number, field: keyof BudgetDirectCost, value: any) => {
    const newCosts = [...directCosts];
    if (field === "amount") newCosts[idx][field] = parseFloat(value) || 0;
    else (newCosts[idx] as any)[field] = value;
    setDirectCosts(newCosts);
  };

  const addFee = () => setProfessionalFees([...professionalFees, { item: "", description: "", amount: 0 }]);
  const removeFee = (idx: number) => setProfessionalFees(professionalFees.filter((_, i) => i !== idx));
  const updateFee = (idx: number, field: keyof BudgetProfessionalFee, value: any) => {
    const newFees = [...professionalFees];
    if (field === "amount") newFees[idx][field] = parseFloat(value) || 0;
    else (newFees[idx] as any)[field] = value;
    setProfessionalFees(newFees);
  };

  const addTimeline = () => setTimeline([...timeline, { range: "", activity: "" }]);
  const removeTimeline = (idx: number) => setTimeline(timeline.filter((_, i) => i !== idx));
  const updateTimeline = (idx: number, field: keyof BudgetTimelineItem, value: string) => {
    const newTimeline = [...timeline];
    (newTimeline[idx] as any)[field] = value;
    setTimeline(newTimeline);
  };

  const total = type === 'project' 
    ? (directCosts.reduce((s, c) => s + c.amount, 0) + professionalFees.reduce((s, f) => s + f.amount, 0))
    : items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);

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
      items: type === 'project' ? [] : items,
      total,
      notes,
      status: initialData?.status || 'pending',
      title: type === 'project' ? title : undefined,
      summary: type === 'project' ? summary : undefined,
      scope: type === 'project' ? scope : undefined,
      directCosts: type === 'project' ? directCosts : undefined,
      professionalFees: type === 'project' ? professionalFees : undefined,
      timeline: type === 'project' ? timeline : undefined,
      paymentTerms: type === 'project' ? [{ label: "Forma de Pago", details: paymentTerms }] : undefined,
      validityDays: type === 'project' ? validityDays : undefined,
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

  const handleSelectService = (idx: number, serviceId: string) => {
    const service = serviceTypes.find(s => s.id === serviceId);
    if (service) {
      updateItem(idx, "title", service.name);
      updateItem(idx, "amount", service.defaultPrice);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
        <h3 className="font-semibold text-lg">
          {initialData ? "Editar Presupuesto" : "Nuevo Presupuesto"}
        </h3>
        {type === 'project' && (
          <div className="flex gap-1">
            {(['general', 'scope', 'economics', 'timeline'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-700'}`}
              >
                {tab === 'general' ? 'General' : tab === 'scope' ? 'Alcance' : tab === 'economics' ? 'Costos' : 'Entrega'}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'general' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Clasificación</label>
            <div className="grid grid-cols-4 gap-2">
              {(['device', 'project', 'support', 'service'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`p-2 text-[10px] rounded-lg border transition-all ${type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}
                >
                  {t === 'device' ? 'Equipo' : t === 'project' ? 'Proyecto' : t === 'support' ? 'Soporte' : 'Servicio'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {type === 'device' ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Equipo / Cliente</label>
                <select
                  className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                  value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required
                >
                  <option value="">Seleccionar equipo...</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.brand} {d.model} - {clients[d.clientId]?.firstName} {clients[d.clientId]?.lastName}</option>
                  ))}
                </select>
              </div>
            ) : type === 'project' ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto / Cliente</label>
                <select
                  className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                  value={projectId} onChange={(e) => setProjectId(e.target.value)} required
                >
                  <option value="">Seleccionar proyecto...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} - {clients[p.clientId]?.firstName} {clients[p.clientId]?.lastName}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                <select
                  className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                  value={clientId} onChange={(e) => setClientId(e.target.value)} required
                >
                  <option value="">Seleccionar cliente...</option>
                  {Object.values(clients).map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
              <input type="date" className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>

          {type === 'project' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Título de la Propuesta</label>
                <input type="text" className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Propuesta de Servicios Digitales: Proyecto Footwork" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Resumen del Proyecto</label>
                <textarea className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Objetivos principales de esta etapa..." />
              </div>
            </>
          )}

          {type !== 'project' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ítems</label>
                <button type="button" onClick={addItem} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-bold"><Plus size={14} /> Agregar ítem</button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Ítem #{idx + 1}</span>
                    {items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500"><X size={16} /></button>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <input type="text" placeholder="Título" className="w-full p-2 pr-10 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={item.title} onChange={(e) => updateItem(idx, "title", e.target.value)} required />
                      <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 group/services">
                        <button type="button" className="text-purple-500 hover:text-purple-700 p-1"><Briefcase size={16} /></button>
                        <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 hidden group-hover/services:block max-h-48 overflow-y-auto">
                          {serviceTypes.map(s => (
                            <button key={s.id} type="button" onClick={() => handleSelectService(idx, s.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/20 flex justify-between items-center transition-colors border-b border-gray-50 dark:border-gray-700/50">
                              <span>{s.name}</span><strong>${s.defaultPrice.toLocaleString()}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Cant." className="w-20 p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} required />
                      <div className="flex-1 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input type="number" placeholder="Monto" className="w-full p-2 pl-5 text-sm rounded-lg border border-gray-300 dark:border-gray-600" value={item.amount || ""} onChange={(e) => updateItem(idx, "amount", e.target.value)} required />
                      </div>
                    </div>
                  </div>
                  <textarea placeholder="Descripción detallada..." className="w-full p-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600" rows={2} value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'scope' && type === 'project' && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Alcance de los Servicios</h4>
            <button type="button" onClick={addScopeSection} className="text-xs text-indigo-600 font-bold flex items-center gap-1"><Plus size={14} /> Nueva Sección</button>
          </div>
          {scope.map((section, sIdx) => (
            <div key={sIdx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3 relative">
              <button type="button" onClick={() => removeScopeSection(sIdx)} className="absolute top-2 right-2 text-red-400 hover:text-red-500"><X size={16} /></button>
              <input type="text" placeholder="Título de la Sección (Ej: Infraestructura)" className="w-full p-2 font-bold text-sm bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700" value={section.title} onChange={(e) => updateScopeSection(sIdx, e.target.value)} />
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/30">
                {section.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <input type="text" placeholder="Título del ítem" className="w-full p-1.5 text-xs font-bold border rounded-md" value={item.title} onChange={(e) => updateScopeItem(sIdx, iIdx, 'title', e.target.value)} />
                      <textarea placeholder="Descripción corta" className="w-full p-1.5 text-[10px] border rounded-md" rows={2} value={item.description} onChange={(e) => updateScopeItem(sIdx, iIdx, 'description', e.target.value)} />
                    </div>
                    {section.items.length > 1 && <button type="button" onClick={() => removeScopeItem(sIdx, iIdx)} className="text-red-400 p-1 self-start"><X size={14} /></button>}
                  </div>
                ))}
                <button type="button" onClick={() => addScopeItem(sIdx)} className="text-[10px] text-indigo-500 font-bold flex items-center gap-1 mt-1"><Plus size={12} /> Agregar Ítem al Alcance</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'economics' && type === 'project' && (
        <div className="space-y-6 max-h-[60vh] overflow-y-auto p-1">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Costos Directos (Proveedores)</h4>
              <button type="button" onClick={addDirectCost} className="text-xs text-indigo-600 font-bold flex items-center gap-1"><Plus size={14} /> Agregar Costo</button>
            </div>
            {directCosts.map((cost, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                <input type="text" placeholder="Ítem" className="flex-1 p-1.5 text-xs border rounded-md" value={cost.item} onChange={(e) => updateDirectCost(idx, 'item', e.target.value)} />
                <input type="text" placeholder="Detalle" className="flex-[1.5] p-1.5 text-xs border rounded-md" value={cost.detail} onChange={(e) => updateDirectCost(idx, 'detail', e.target.value)} />
                <input type="number" placeholder="Monto" className="w-24 p-1.5 text-xs border rounded-md" value={cost.amount || ""} onChange={(e) => updateDirectCost(idx, 'amount', e.target.value)} />
                <button type="button" onClick={() => removeDirectCost(idx)} className="text-red-400 p-1.5"><X size={14} /></button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Honorarios Profesionales</h4>
              <button type="button" onClick={addFee} className="text-xs text-indigo-600 font-bold flex items-center gap-1"><Plus size={14} /> Agregar Honorario</button>
            </div>
            {professionalFees.map((fee, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                <input type="text" placeholder="Actividad" className="flex-1 p-1.5 text-xs border rounded-md" value={fee.item} onChange={(e) => updateFee(idx, 'item', e.target.value)} />
                <input type="text" placeholder="Descripción" className="flex-[1.5] p-1.5 text-xs border rounded-md" value={fee.description} onChange={(e) => updateFee(idx, 'description', e.target.value)} />
                <input type="number" placeholder="Monto" className="w-24 p-1.5 text-xs border rounded-md" value={fee.amount || ""} onChange={(e) => updateFee(idx, 'amount', e.target.value)} />
                <button type="button" onClick={() => removeFee(idx)} className="text-red-400 p-1.5"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'timeline' && type === 'project' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Cronograma de Entrega</h4>
              <button type="button" onClick={addTimeline} className="text-xs text-indigo-600 font-bold flex items-center gap-1"><Plus size={14} /> Agregar Hito</button>
            </div>
            {timeline.map((t, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                <input type="text" placeholder="Ej: Días 1-3" className="w-32 p-1.5 text-xs border rounded-md" value={t.range} onChange={(e) => updateTimeline(idx, 'range', e.target.value)} />
                <input type="text" placeholder="Actividad" className="flex-1 p-1.5 text-xs border rounded-md" value={t.activity} onChange={(e) => updateTimeline(idx, 'activity', e.target.value)} />
                <button type="button" onClick={() => removeTimeline(idx)} className="text-red-400 p-1.5"><X size={14} /></button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Forma de Pago</label>
              <textarea placeholder="Ej: 50% adelanto, 50% contra entrega..." className="w-full p-2 text-xs border rounded-md" rows={3} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Vigencia (días)</label>
              <input type="number" className="w-full p-2 text-sm border rounded-md" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
          <Calculator size={18} />
          <span className="text-sm font-bold uppercase">Total Estimado:</span>
        </div>
        <span className="text-xl font-black text-blue-700 dark:text-blue-300">${total.toLocaleString()}</span>
      </div>

      {activeTab === 'general' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notas adicionales</label>
          <textarea className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Comentarios finales..." />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-gray-50 dark:bg-gray-900 z-10">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 font-bold">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95">{isSubmitting ? "Guardando..." : (initialData ? "Actualizar Presupuesto" : "Guardar Presupuesto")}</button>
      </div>
    </form>
  );
}
