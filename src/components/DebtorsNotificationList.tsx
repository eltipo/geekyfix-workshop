import React, { useState, useMemo, useEffect } from "react";
import { Client, Receivable } from "../types";
import { 
  MessageSquare, User, DollarSign, AlertTriangle, Clock, Search, 
  ChevronDown, ChevronUp, Copy, Check, Calendar, RefreshCw, Send, 
  Info, Phone, Mail, ExternalLink, HelpCircle, Edit3, ShieldAlert,
  CheckCheck, UserCheck, AlertCircle
} from "lucide-react";

interface DebtItem {
  type: 'one-time' | 'installment' | 'subscription';
  title: string;
  totalAmount: number;
  paidAmount?: number;
  dueDate?: string;
  amountOwed: number;
  receivableId: string;
  installmentId?: string;
  status?: string;
}

interface ClientDebtor {
  client: Client;
  debts: DebtItem[];
  totalOwed: number;
  overdueOwed: number;
  hasOverdue: boolean;
  oldestDueDate?: string;
}

interface DebtorsNotificationListProps {
  clients: Client[];
  receivables: Receivable[];
  onRefresh: () => void;
}

export function DebtorsNotificationList({ clients, receivables, onRefresh }: DebtorsNotificationListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "overdue" | "subscription" | "one-time">("all");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  
  // Notification templates
  const [selectedTemplate, setSelectedTemplate] = useState<"friendly" | "due" | "critical" | "detailed">("friendly");
  const [customMessages, setCustomMessages] = useState<{ [clientId: string]: string }>({});
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);
  const [lastNotified, setLastNotified] = useState<{ [clientId: string]: string }>({});
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // Get current date string in local terms (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Load last notified dates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gfix_debtors_last_notified");
      if (stored) {
        setLastNotified(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Error reading notifications history:", e);
    }
  }, []);

  // Helper to save notification date
  const recordNotification = (clientId: string, type: string) => {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    const updated = { ...lastNotified, [clientId]: `${dateStr} (${type})` };
    setLastNotified(updated);
    try {
      localStorage.setItem("gfix_debtors_last_notified", JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving notification to localStorage:", e);
    }
  };

  // Process receivables and build debtors list
  const debtors: ClientDebtor[] = useMemo(() => {
    const list: ClientDebtor[] = [];

    clients.forEach(client => {
      const clientReceivables = receivables.filter(r => r.clientId === client.id);
      const debts: DebtItem[] = [];

      clientReceivables.forEach(r => {
        // Skip completed or cancelled receivables
        if (r.status === 'completed' || r.status === 'cancelled') return;

        if (r.type === 'one-time') {
          const amountOwed = r.totalAmount - r.paidAmount;
          if (amountOwed > 0 && r.dueDate && r.dueDate < todayStr) {
            debts.push({
              type: r.type,
              title: r.title,
              totalAmount: r.totalAmount,
              paidAmount: r.paidAmount,
              dueDate: r.dueDate,
              amountOwed,
              receivableId: r.id,
              status: r.status
            });
          }
        } 
        else if (r.type === 'installment' || r.type === 'subscription') {
          if (r.installments && r.installments.length > 0) {
            const unpaidInsts = r.installments.filter(inst => !inst.isPaid && inst.dueDate && inst.dueDate < todayStr);
            unpaidInsts.forEach(inst => {
              debts.push({
                type: r.type,
                title: `${r.title} (Cuota ${inst.number})`,
                totalAmount: inst.amount,
                dueDate: inst.dueDate,
                amountOwed: inst.amount,
                receivableId: r.id,
                installmentId: inst.id,
                status: inst.status || 'pending'
              });
            });
          } else {
            // Fallback if no installments are set but there's a pending amount
            const amountOwed = r.totalAmount - r.paidAmount;
            if (amountOwed > 0 && r.dueDate && r.dueDate < todayStr) {
              debts.push({
                type: r.type,
                title: r.title,
                totalAmount: r.totalAmount,
                paidAmount: r.paidAmount,
                dueDate: r.dueDate,
                amountOwed,
                receivableId: r.id,
                status: r.status
              });
            }
          }
        }
      });

      if (debts.length > 0) {
        const totalOwed = debts.reduce((sum, d) => sum + d.amountOwed, 0);
        
        // Calculate overdue amount
        const overdueDebts = debts.filter(d => d.dueDate && d.dueDate < todayStr);
        const overdueOwed = overdueDebts.reduce((sum, d) => sum + d.amountOwed, 0);
        const hasOverdue = overdueDebts.length > 0;

        // Find oldest due date
        const dueDates = debts.map(d => d.dueDate).filter(Boolean) as string[];
        const oldestDueDate = dueDates.length > 0 ? dueDates.sort()[0] : undefined;

        list.push({
          client,
          debts,
          totalOwed,
          overdueOwed,
          hasOverdue,
          oldestDueDate
        });
      }
    });

    // Sort debtors: those with overdue debts first, then by total amount owed descending
    return list.sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1;
      if (!a.hasOverdue && b.hasOverdue) return 1;
      return b.totalOwed - a.totalOwed;
    });
  }, [clients, receivables, todayStr]);

  // Overall metrics
  const metrics = useMemo(() => {
    const totalActiveDebt = receivables.reduce((sum, r) => {
      if (r.status === 'completed' || r.status === 'cancelled') return sum;
      if (r.type === 'one-time') {
        return sum + (r.totalAmount - r.paidAmount);
      } else {
        if (r.installments && r.installments.length > 0) {
          return sum + r.installments.filter(i => !i.isPaid).reduce((s, i) => s + i.amount, 0);
        } else {
          return sum + (r.totalAmount - r.paidAmount);
        }
      }
    }, 0);

    const totalOverdueDebt = debtors.reduce((sum, d) => sum + d.overdueOwed, 0);
    const uniqueDebtorCount = debtors.length;
    const overdueClientCount = debtors.filter(d => d.hasOverdue).length;

    return {
      totalActiveDebt,
      totalOverdueDebt,
      uniqueDebtorCount,
      overdueClientCount
    };
  }, [debtors, receivables]);

  // Filter and search debtors list
  const filteredDebtors = useMemo(() => {
    return debtors.filter(d => {
      // 1. Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchName = `${d.client.firstName} ${d.client.lastName}`.toLowerCase().includes(searchLower);
      const matchPhone = d.client.whatsapp && d.client.whatsapp.includes(searchTerm);
      const matchEmail = d.client.email && d.client.email.toLowerCase().includes(searchLower);
      const matchDebts = d.debts.some(debt => debt.title.toLowerCase().includes(searchLower));
      
      if (searchTerm && !matchName && !matchPhone && !matchEmail && !matchDebts) {
        return false;
      }

      // 2. Type filter
      if (filterType === "overdue") {
        return d.hasOverdue;
      }
      if (filterType === "subscription") {
        return d.debts.some(debt => debt.type === "subscription");
      }
      if (filterType === "one-time") {
        return d.debts.some(debt => debt.type === "one-time" || debt.type === "installment");
      }

      return true;
    });
  }, [debtors, searchTerm, filterType]);

  // Format date for visual representation
  const formatDateVisual = (dateStr?: string) => {
    if (!dateStr) return "Sin fecha";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Calculate days overdue
  const getDaysOverdue = (dueDateStr?: string) => {
    if (!dueDateStr) return 0;
    const due = new Date(dueDateStr + "T12:00:00");
    const today = new Date(todayStr + "T12:00:00");
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Get pre-formatted text template based on selected option
  const generateMessageText = (debtor: ClientDebtor, templateKey: "friendly" | "due" | "critical" | "detailed") => {
    const { client, debts, totalOwed } = debtor;
    
    // Generate debt detail bullets
    const bulletList = debts.map(d => {
      const dueLabel = d.dueDate ? ` (Vence: ${formatDateVisual(d.dueDate)})` : "";
      return `• *${d.title}*: $${d.amountOwed.toLocaleString('es-AR')}${dueLabel}`;
    }).join("\n");

    switch (templateKey) {
      case "friendly":
        return `Hola *${client.firstName}*, ¿cómo estás? 😊\n\nTe escribimos para recordarte que tienes un saldo pendiente de *$${totalOwed.toLocaleString('es-AR')}* correspondiente a los siguientes conceptos:\n\n${bulletList}\n\n¿Podrías confirmarnos cuándo te quedaría cómodo realizar el pago? Quedamos a tu entera disposición ante cualquier duda. ¡Muchas gracias y que tengas un excelente día! 👋`;
      
      case "due":
        return `Estimado/a *${client.firstName} ${client.lastName}*,\n\nEsperamos que te encuentres muy bien. Te contactamos para recordarte que el pago de *$${totalOwed.toLocaleString('es-AR')}* se encuentra vencido. El detalle de los conceptos pendientes es el siguiente:\n\n${bulletList}\n\nTe solicitamos por favor realizar la transferencia o el pago a la brevedad para poder registrarlo y mantener tu cuenta al día.\n\n*Datos para Transferencia:* (Por favor responder a este mensaje para solicitar el CBU/Alias)\n\nSi ya realizaste el pago, te pedimos disculpas y te solicitamos enviarnos el comprobante de transferencia por esta vía. ¡Muchas gracias por tu colaboración!`;

      case "critical":
        return `⚠️ *AVISO DE DEUDA PENDIENTE*\n\nHola *${client.firstName}*, nos comunicamos urgentemente debido a que registramos un saldo vencido acumulado por un total de *$${totalOwed.toLocaleString('es-AR')}*.\n\n*Detalle de Deudas Vencidas:*\n${bulletList}\n\nTe recordamos que el retraso en los pagos puede ocasionar inconvenientes o cargos adicionales. Rogamos realizar el pago a la brevedad y enviarnos el comprobante correspondiente para regularizar la cuenta.\n\nQuedamos a la espera de tu respuesta. Saludos cordiales.`;

      case "detailed":
        return `📋 *ESTADO DE CUENTA DETALLADO*\n\nHola *${client.firstName} ${client.lastName}*, te enviamos el resumen de tu cuenta corriente actual a la fecha:\n\n*Saldo Total Pendiente:* $${totalOwed.toLocaleString('es-AR')}\n\n*Desglose de Conceptos:*\n${bulletList}\n\n*Métodos de Pago Disponibles:*\n• Transferencia Bancaria (Solicitar datos)\n• Efectivo / Débito en el local\n\nUna vez realizado el abono, te agradecemos nos envíes una captura del comprobante indicando tu nombre para poder imputar el pago correctamente.\n\n¡Cualquier consulta no dudes en escribirnos! Muchas gracias.`;
      
      default:
        return "";
    }
  };

  // Initialize or update the customizable message state whenever client expand or template changes
  useEffect(() => {
    if (expandedClientId) {
      const debtor = debtors.find(d => d.client.id === expandedClientId);
      if (debtor) {
        // Reset message edit mode upon switching clients
        setIsEditingMessage(false);
        const generated = generateMessageText(debtor, selectedTemplate);
        setCustomMessages(prev => ({
          ...prev,
          [expandedClientId]: generated
        }));
      }
    }
  }, [expandedClientId, selectedTemplate, debtors]);

  const handleTemplateChange = (templateKey: "friendly" | "due" | "critical" | "detailed") => {
    setSelectedTemplate(templateKey);
    if (expandedClientId) {
      const debtor = debtors.find(d => d.client.id === expandedClientId);
      if (debtor) {
        setCustomMessages(prev => ({
          ...prev,
          [expandedClientId]: generateMessageText(debtor, templateKey)
        }));
      }
    }
  };

  const handleCopyMessage = (clientId: string) => {
    const message = customMessages[clientId];
    if (!message) return;
    
    navigator.clipboard.writeText(message);
    setCopiedClientId(clientId);
    setTimeout(() => setCopiedClientId(null), 2000);
  };

  const handleSendWhatsApp = (debtor: ClientDebtor) => {
    const client = debtor.client;
    if (!client.whatsapp) {
      alert("El cliente no tiene un número de WhatsApp configurado.");
      return;
    }

    const message = customMessages[client.id] || generateMessageText(debtor, selectedTemplate);
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = client.whatsapp.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    
    // Record visual status
    recordNotification(client.id, selectedTemplate === 'friendly' ? 'Recordatorio' : selectedTemplate === 'due' ? 'Vencimiento' : selectedTemplate === 'critical' ? 'Aviso Crítico' : 'Detallado');
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
  };

  const handleManualNotificationLog = (clientId: string) => {
    recordNotification(clientId, 'Manual / Otro medio');
  };

  return (
    <div className="space-y-6">
      
      {/* Premium Statistics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center gap-4 transition-all hover:scale-[1.01]">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
            <DollarSign size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Deuda Total Activa</p>
            <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">${metrics.totalActiveDebt.toLocaleString('es-AR')}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center gap-4 transition-all hover:scale-[1.01]">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Deuda Vencida</p>
            <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">${metrics.totalOverdueDebt.toLocaleString('es-AR')}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center gap-4 transition-all hover:scale-[1.01]">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-xs">
            <User size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Clientes Deudores</p>
            <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">{metrics.uniqueDebtorCount}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center gap-4 transition-all hover:scale-[1.01]">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
            <Clock size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Clientes Vencidos</p>
            <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">{metrics.overdueClientCount}</p>
          </div>
        </div>

      </div>

      {/* Modern Info Banner */}
      <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-4 flex gap-3.5 text-sm">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Info size={16} />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-blue-900 dark:text-blue-300">Asistente Inteligente de Cobranzas</p>
          <p className="text-xs text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
            Este panel analiza en tiempo real las cuentas por cobrar, abonos y cuotas para identificar automáticamente clientes con **saldos ya vencidos**. Las fechas futuras quedan excluidas para evitar avisos innecesarios.
          </p>
        </div>
      </div>

      {/* Filters & Search Control Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col lg:flex-row gap-4 justify-between items-center">
        
        {/* Modernized Search Box */}
        <div className="relative w-full lg:w-96 shrink-0">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400 dark:text-gray-500">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            placeholder="Buscar por cliente, teléfono, mail o concepto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Action / Filter Badges */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center justify-start lg:justify-end">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === "all" 
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm" 
                : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
            }`}
          >
            Todos ({debtors.length})
          </button>
          
          <button
            onClick={() => setFilterType("overdue")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filterType === "overdue" 
                ? "bg-red-600 text-white shadow-sm" 
                : "bg-red-50/60 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/30"
            }`}
          >
            <AlertCircle size={13} />
            Solo Vencidos ({debtors.filter(d => d.hasOverdue).length})
          </button>
          
          <button
            onClick={() => setFilterType("subscription")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === "subscription" 
                ? "bg-purple-600 text-white shadow-sm" 
                : "bg-purple-50/60 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100/60"
            }`}
          >
            Suscripciones/Abonos
          </button>
          
          <button
            onClick={() => setFilterType("one-time")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === "one-time" 
                ? "bg-amber-600 text-white shadow-sm" 
                : "bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100/60"
            }`}
          >
            Únicos o Cuotas
          </button>

          <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

          <button
            onClick={onRefresh}
            title="Sincronizar y Refrescar Datos"
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

      </div>

      {/* Grid Headers for desktop to ensure PERFECT alignment */}
      <div className="hidden lg:grid grid-cols-12 px-6 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700/80 mb-2">
        <div className="col-span-4">Cliente / Estado</div>
        <div className="col-span-3">Contacto Directo</div>
        <div className="col-span-2">Retraso / Antigüedad</div>
        <div className="col-span-2 text-right">Monto Impago</div>
        <div className="col-span-1 text-center">Acción</div>
      </div>

      {/* Debtors List */}
      <div className="space-y-4">
        {filteredDebtors.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <UserCheck size={22} />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">¡Al día! Todo ordenado</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              No se encontraron clientes con deudas pendientes vencidas según los filtros seleccionados.
            </p>
          </div>
        ) : (
          filteredDebtors.map(debtor => {
            const isExpanded = expandedClientId === debtor.client.id;
            const hasPhone = !!debtor.client.whatsapp;
            const notificationHistory = lastNotified[debtor.client.id];
            const daysOverdueMax = debtor.oldestDueDate ? getDaysOverdue(debtor.oldestDueDate) : 0;

            return (
              <div 
                key={debtor.client.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl border transition-all duration-300 overflow-hidden shadow-xs ${
                  isExpanded 
                    ? "border-blue-400 dark:border-blue-500 ring-4 ring-blue-500/5 dark:ring-blue-500/10 shadow-md" 
                    : debtor.hasOverdue 
                      ? "border-red-100 dark:border-red-900/30 hover:border-red-300/60 hover:shadow-xs" 
                      : "border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-xs"
                }`}
              >
                {/* Header Card (Structured 12-column Grid for perfect vertical alignment) */}
                <div 
                  className="px-6 py-4 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-4 lg:gap-0 cursor-pointer select-none hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                  onClick={() => setExpandedClientId(isExpanded ? null : debtor.client.id)}
                >
                  
                  {/* Col 1: Profile (Name & Badges) */}
                  <div className="col-span-4 flex items-center gap-4 lg:pr-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 font-bold text-sm shadow-sm ${
                      debtor.hasOverdue ? "bg-red-500" : "bg-amber-500"
                    }`}>
                      {debtor.client.firstName[0]}{debtor.client.lastName[0]}
                    </div>
                    
                    <div className="min-w-0">
                      <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
                        {debtor.client.firstName} {debtor.client.lastName}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {debtor.hasOverdue ? (
                          <span className="text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            Vencido
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-1.5">
                            Pendiente
                          </span>
                        )}

                        {notificationHistory && (
                          <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            Avisado: {notificationHistory.split(' (')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Col 2: Contact Direct (WhatsApp / Email) */}
                  <div className="col-span-3 text-sm space-y-1 lg:pr-4">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Phone size={14} className="text-gray-400 shrink-0" />
                      <span className={hasPhone ? "font-medium" : "text-gray-400 italic"}>
                        {debtor.client.whatsapp || "No configurado"}
                      </span>
                    </div>
                    {debtor.client.email && (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 truncate">
                        <Mail size={14} className="shrink-0" />
                        <span className="truncate text-xs">{debtor.client.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Col 3: Overdue details (Days & oldest due date) */}
                  <div className="col-span-2 text-sm space-y-1 lg:pr-4">
                    {debtor.oldestDueDate ? (
                      <>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <Calendar size={14} className="text-gray-400 shrink-0" />
                          <span className="text-xs font-medium">{formatDateVisual(debtor.oldestDueDate)}</span>
                        </div>
                        {debtor.hasOverdue && (
                          <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-0.5">
                            {daysOverdueMax} días de atraso
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs italic">Sin vencimiento</span>
                    )}
                  </div>

                  {/* Col 4: Outstanding amounts */}
                  <div className="col-span-2 text-left lg:text-right flex flex-col lg:justify-center items-start lg:items-end">
                    <span className="text-xs font-medium text-gray-500 lg:hidden mb-1">Saldo Pendiente</span>
                    <p className="text-[15px] font-bold text-gray-900 dark:text-white">
                      ${debtor.totalOwed.toLocaleString('es-AR')}
                    </p>
                    {debtor.hasOverdue && debtor.overdueOwed !== debtor.totalOwed && (
                      <p className="text-xs text-red-500 font-medium mt-0.5">
                        Vencido: ${debtor.overdueOwed.toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>

                  {/* Col 5: Expand Arrow */}
                  <div className="col-span-1 hidden lg:flex justify-center items-center">
                    <div className={`p-1.5 rounded-full transition-colors ${isExpanded ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-600 dark:bg-gray-800 dark:group-hover:bg-gray-700'}`}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/30 dark:bg-gray-900/30 p-6 space-y-6">
                    
                    {/* Grid Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      
                      {/* Left: Outstanding list & history */}
                      <div className="lg:col-span-5 space-y-5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] uppercase font-extrabold text-gray-400 dark:text-gray-500 tracking-wider flex items-center gap-1.5">
                            <Calendar size={13} /> Conceptos Vencidos Impagos
                          </h5>
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                            {debtor.debts.length} {debtor.debts.length === 1 ? 'Concepto' : 'Conceptos'}
                          </span>
                        </div>

                        {/* List of concept cards */}
                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                          {debtor.debts.map((debt, idx) => {
                            const isOverdue = debt.dueDate && debt.dueDate < todayStr;
                            const daysOverdue = getDaysOverdue(debt.dueDate);

                            return (
                              <div 
                                key={`${debt.receivableId}-${debt.installmentId || idx}`}
                                className="bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/80 shadow-2xs flex justify-between items-center gap-4 hover:border-gray-200 transition-colors"
                              >
                                <div className="space-y-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-snug truncate">
                                    {debt.title}
                                  </p>
                                  
                                  <div className="flex flex-wrap gap-2 items-center text-[10px]">
                                    {debt.dueDate ? (
                                      <span className={`flex items-center gap-1 font-semibold ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
                                        <Clock size={11} /> Vencimiento: {formatDateVisual(debt.dueDate)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">Sin vencimiento</span>
                                    )}

                                    {isOverdue && (
                                      <span className="bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 font-extrabold px-1.5 py-0.2 rounded-md">
                                        hace {daysOverdue} d
                                      </span>
                                    )}

                                    <span className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.2 rounded-md font-bold uppercase text-[9px] tracking-wider">
                                      {debt.type === 'subscription' ? 'Abono' : debt.type === 'installment' ? 'Cuota' : 'Único'}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <p className="text-sm font-black text-gray-950 dark:text-white">
                                    ${debt.amountOwed.toLocaleString('es-AR')}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* History Log section */}
                        <div className="bg-white dark:bg-gray-800 p-4.5 rounded-2xl border border-gray-100 dark:border-gray-700/80 space-y-3 shadow-2xs">
                          <p className="text-[11px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">Historial de contacto</p>
                          
                          <div className="text-xs space-y-2">
                            {notificationHistory ? (
                              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5"></span>
                                <p>
                                  Última notificación enviada:<br />
                                  <strong className="text-gray-800 dark:text-white">{notificationHistory}</strong>
                                </p>
                              </div>
                            ) : (
                              <p className="text-gray-400 dark:text-gray-500 italic">No hay registros de contacto previos para este cliente.</p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-gray-50 dark:border-gray-700">
                            <button
                              type="button"
                              onClick={() => handleManualNotificationLog(debtor.client.id)}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                            >
                              <CheckCheck size={13} /> Marcar como notificado por otro medio
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Right: WhatsApp Customization Panel with mockup */}
                      <div className="lg:col-span-7 space-y-5 lg:border-l lg:border-gray-100 lg:dark:border-gray-700/80 lg:pl-6">
                        
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] uppercase font-extrabold text-gray-400 dark:text-gray-500 tracking-wider flex items-center gap-1.5">
                            <MessageSquare size={13} className="text-green-500" /> Generador de Mensaje
                          </h5>
                          
                          {hasPhone && (
                            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Listo para enviar
                            </span>
                          )}
                        </div>

                        {!hasPhone ? (
                          <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 p-6 rounded-2xl text-center space-y-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                              <ShieldAlert size={20} />
                            </div>
                            <p className="text-xs font-bold text-red-700 dark:text-red-400">Sin número de contacto registrado</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed">
                              Este cliente no tiene asignado un número de WhatsApp. Por favor, agregue su número celular en la solapa de Clientes para habilitar las notificaciones.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-5">
                            
                            {/* Premium Template Cards Selector */}
                            <div className="space-y-2">
                              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estilo del Mensaje</label>
                              <div className="grid grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleTemplateChange("friendly")}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    selectedTemplate === "friendly"
                                      ? "bg-green-50/70 dark:bg-green-950/20 border-green-400 text-green-800 dark:text-green-400 ring-2 ring-green-500/10"
                                      : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="font-bold text-xs flex items-center gap-1">
                                    <span>😊</span> Amistoso
                                  </div>
                                  <span className="block text-[9px] text-gray-400 mt-0.5 font-normal leading-normal">Tono educado y respetuoso</span>
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => handleTemplateChange("due")}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    selectedTemplate === "due"
                                      ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-400 text-amber-800 dark:text-amber-400 ring-2 ring-amber-500/10"
                                      : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="font-bold text-xs flex items-center gap-1">
                                    <span>📅</span> Vencimiento
                                  </div>
                                  <span className="block text-[9px] text-gray-400 mt-0.5 font-normal leading-normal">Formal, solicita regularizar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTemplateChange("critical")}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    selectedTemplate === "critical"
                                      ? "bg-red-50/70 dark:bg-red-950/20 border-red-400 text-red-800 dark:text-red-400 ring-2 ring-red-500/10"
                                      : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="font-bold text-xs flex items-center gap-1">
                                    <span>⚠️</span> Deuda Crítica
                                  </div>
                                  <span className="block text-[9px] text-gray-400 mt-0.5 font-normal leading-normal">Urgente, aviso de suspensión</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTemplateChange("detailed")}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    selectedTemplate === "detailed"
                                      ? "bg-blue-50/70 dark:bg-blue-950/20 border-blue-400 text-blue-800 dark:text-blue-400 ring-2 ring-blue-500/10"
                                      : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="font-bold text-xs flex items-center gap-1">
                                    <span>📋</span> Estado de Cuenta
                                  </div>
                                  <span className="block text-[9px] text-gray-400 mt-0.5 font-normal leading-normal">Detalle completo de saldos</span>
                                </button>
                              </div>
                            </div>

                            {/* GORGEOUS WHATSAPP CHAT MOCKUP PREVIEW */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vista Previa de WhatsApp</label>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingMessage(!isEditingMessage)}
                                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                >
                                  <Edit3 size={13} />
                                  {isEditingMessage ? "Listo (Ver Mockup)" : "Editar Texto"}
                                </button>
                              </div>

                              {isEditingMessage ? (
                                <textarea
                                  className="w-full h-56 p-3.5 border border-blue-400 dark:border-blue-500 rounded-2xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-mono focus:ring-4 focus:ring-blue-500/10 focus:outline-none leading-relaxed transition-all"
                                  value={customMessages[debtor.client.id] || ""}
                                  onChange={(e) => {
                                    setCustomMessages(prev => ({
                                      ...prev,
                                      [debtor.client.id]: e.target.value
                                    }));
                                  }}
                                  placeholder="Escribe tu mensaje personalizado..."
                                />
                              ) : (
                                <div className="border border-emerald-100/70 dark:border-emerald-950/40 rounded-2xl overflow-hidden bg-[#efeae2] dark:bg-gray-900 shadow-xs">
                                  
                                  {/* Chat Header Mockup */}
                                  <div className="bg-[#075e54] dark:bg-emerald-900 px-4 py-2.5 text-white flex items-center justify-between shadow-xs">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-full bg-emerald-700/60 dark:bg-emerald-800/80 flex items-center justify-center font-bold text-xs border border-white/20">
                                        {debtor.client.firstName[0]}{debtor.client.lastName[0]}
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold leading-tight">{debtor.client.firstName} {debtor.client.lastName}</p>
                                        <span className="text-[9px] text-emerald-100/95 flex items-center gap-1 mt-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> en línea
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-emerald-100 bg-[#128c7e] px-2 py-0.5 rounded-md">
                                      Chat Oficial
                                    </span>
                                  </div>
                                  
                                  {/* Chat Bubble Canvas with typical whatsapp background pattern simulated */}
                                  <div className="p-4 bg-[radial-gradient(#ffffff_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-[#efeae2] dark:bg-gray-950 min-h-[160px] flex flex-col justify-end">
                                    
                                    {/* Green Sender Chat Bubble */}
                                    <div className="self-end bg-[#d9fdd3] dark:bg-emerald-950 text-gray-800 dark:text-gray-100 p-3 rounded-2xl rounded-tr-none shadow-sm text-xs max-w-[90%] relative whitespace-pre-wrap leading-relaxed border border-[#d1f4cc]/70 dark:border-emerald-900/40 font-sans shadow-2xs">
                                      {/* Parse simple WhatsApp markdown lookalikes (*bold*) for premium rendering */}
                                      {customMessages[debtor.client.id] ? (
                                        customMessages[debtor.client.id].split('\n').map((line, i) => (
                                          <p key={i} className="min-h-[1em]">
                                            {line.split('*').map((chunk, j) => j % 2 === 1 ? <strong key={j} className="font-extrabold text-gray-950 dark:text-white">{chunk}</strong> : chunk)}
                                          </p>
                                        ))
                                      ) : (
                                        <p className="text-gray-400 italic">No se ha podido procesar la plantilla.</p>
                                      )}
                                      
                                      <div className="flex items-center justify-end gap-1 text-[9px] text-gray-400 dark:text-emerald-300/80 mt-2 font-sans text-right select-none">
                                        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        <CheckCheck size={12} className="text-blue-500" />
                                      </div>
                                    </div>

                                  </div>
                                  
                                </div>
                              )}
                            </div>

                            {/* Row of quick premium actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-1">
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(debtor.client.id)}
                                className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-xs"
                              >
                                {copiedClientId === debtor.client.id ? (
                                  <>
                                    <Check size={15} className="text-green-500 stroke-[2.5]" /> ¡Copiado con Éxito!
                                  </>
                                ) : (
                                  <>
                                    <Copy size={15} /> Copiar Texto Completo
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSendWhatsApp(debtor)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm hover:shadow-md transition-all scale-[1.01] hover:scale-[1.02]"
                              >
                                <Send size={15} /> Enviar Mensaje a WhatsApp
                              </button>
                            </div>

                            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center italic leading-normal">
                              Al presionar &quot;Enviar Mensaje a WhatsApp&quot; se abrirá la aplicación con el texto pre-cargado.
                            </p>

                          </div>
                        )}

                      </div>

                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
