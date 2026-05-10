import React, { useState, useEffect, useMemo } from "react";
import { api } from "../api";
import { Transaction, Project, Budget, ServiceTask, Device, Receivable, Client } from "../types";
import { Coins, Plus, Trash2, Edit2, TrendingUp, TrendingDown, Wallet, X, Filter, Lock, Repeat, CreditCard, ChevronDown, ChevronUp, CheckCircle, Clock, FileText, Download } from "lucide-react";
import { Modal } from "./Modal";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBase64ImageFromUrl } from "../lib/utils";

export function FinanceList({ appMode }: { appMode: "workshop" | "project" }) {
  const [activeTab, setActiveTab] = useState<"cashflow" | "receivables" | "subscriptions">("cashflow");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isRecModalOpen, setIsRecModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editingRec, setEditingRec] = useState<Receivable | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'tx', tx: Transaction } | { type: 'rec', id: string } | null>(null);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");

  // Filters for Cashflow
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [txFormData, setTxFormData] = useState<Partial<Transaction>>({
    type: "income",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    description: "",
    category: "general",
  });

  const [recFormData, setRecFormData] = useState<Partial<Receivable>>({
    type: "one-time",
    title: "",
    totalAmount: 0,
    paidAmount: 0,
    startDate: new Date().toISOString().split("T")[0],
    status: "pending",
  });

  useEffect(() => {
    fetchData();
  }, [appMode]);

  const fetchData = async () => {
    try {
      const [txData, recData, projData, budgData, taskData, deviceData, hiddenTxData, clientsData] = await Promise.all([
        api.getTransactions(),
        api.getReceivables(),
        api.getProjects(),
        api.getBudgets(),
        api.getServiceTasks(),
        api.getDevices(),
        api.getHiddenTransactions(),
        api.getClients()
      ]);
      
      const autoTransactions: Transaction[] = [];
      
      // Auto-incomes from completed Service Tasks
      taskData.filter(t => t.isCompleted && t.amount > 0).forEach(t => {
        const autoId = `auto-task-${t.id}`;
        if (!hiddenTxData.includes(autoId)) {
          autoTransactions.push({
            id: autoId,
            type: 'income',
            amount: t.amount,
            date: t.date,
            description: `Cobro por tarea: ${t.description.substring(0, 30)}...`,
            category: t.projectId ? 'project' : 'general', 
            referenceId: t.projectId || t.id,
            isAuto: true,
            createdAt: t.date,
          });
        }
      });

      // Auto-incomes from completed Tickets in Devices
      deviceData.forEach(d => {
        if (d.tickets) {
          d.tickets.filter(t => t.isCompleted).forEach(t => {
            const amount = t.resolutionItems?.reduce((sum, ri) => sum + ri.amount, 0) || 0;
            if (amount > 0) {
              const autoId = `auto-ticket-${t.id}`;
              if (!hiddenTxData.includes(autoId)) {
                autoTransactions.push({
                  id: autoId,
                  type: 'income',
                  amount: amount,
                  date: t.date,
                  description: `Cobro por ticket (Taller): ${t.description.substring(0, 30)}...`,
                  category: 'workshop',
                  referenceId: d.id,
                  isAuto: true,
                  createdAt: t.date,
                });
              }
            }
          });
        }
      });

      setTransactions([...txData, ...autoTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setReceivables(recData.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
      setProjects(projData);
      setBudgets(budgData);
      setTasks(taskData);
      setDevices(deviceData);
      setClients(clientsData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTx) {
        await api.updateTransaction(editingTx.id, txFormData);
      } else {
        await api.createTransaction({
          ...txFormData,
          createdAt: new Date().toISOString(),
        });
      }
      setIsTxModalOpen(false);
      setEditingTx(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRec = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = {
        ...recFormData,
        referenceId: selectedBudgetIds.join(',')
      };

      if (editingRec) {
        await api.updateReceivable(editingRec.id, dataToSave);
      } else {
        await api.createReceivable(dataToSave);
      }
      setIsRecModalOpen(false);
      setEditingRec(null);
      setSelectedBudgetIds([]);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTx = (tx: Transaction) => {
    setItemToDelete({ type: 'tx', tx });
  };

  const handleDeleteRec = (id: string) => {
    setItemToDelete({ type: 'rec', id });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'tx') {
      if (itemToDelete.tx.isAuto) {
        await api.hideAutoTransaction(itemToDelete.tx.id);
      } else {
        await api.deleteTransaction(itemToDelete.tx.id);
      }
    } else if (itemToDelete.type === 'rec') {
      await api.deleteReceivable(itemToDelete.id);
    }
    setItemToDelete(null);
    fetchData();
  };

  const openNewTxModal = () => {
    setTxFormData({
      type: "income",
      amount: 0,
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "general",
    });
    setEditingTx(null);
    setIsTxModalOpen(true);
  };

  const openEditTxModal = (tx: Transaction) => {
    setTxFormData(tx);
    setEditingTx(tx);
    setIsTxModalOpen(true);
  };
  
  const openNewRecModal = (type: "one-time" | "installment" | "subscription") => {
    setRecFormData({
      type,
      title: "",
      totalAmount: 0,
      paidAmount: 0,
      startDate: new Date().toISOString().split("T")[0],
      status: "pending",
      period: type === "subscription" ? "monthly" : undefined,
      referenceType: appMode === "project" ? "project" : "workshop"
    });
    setEditingRec(null);
    setSelectedBudgetIds([]);
    setClientSearch("");
    setIsRecModalOpen(true);
  };

  const openEditRecModal = (rec: Receivable) => {
    setRecFormData(rec);
    setEditingRec(rec);
    setSelectedBudgetIds(rec.referenceId ? rec.referenceId.split(',') : []);
    setClientSearch("");
    setIsRecModalOpen(true);
  };

  // Calcular balance y totales
  const filteredTxs = transactions.filter(tx => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterCategory !== "all" && tx.category !== filterCategory) return false;
    return true;
  });

  const totalIncomes = filteredTxs.filter(t => t.type === "income").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalExpenses = filteredTxs.filter(t => t.type === "expense").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const balance = totalIncomes - totalExpenses;

  const monthlyData = useMemo(() => {
    const data: Record<string, { month: string; valueIncome: number; valueExpense: number }> = {};
    
    [...filteredTxs].forEach(tx => {
       if(!tx.date) return;
       const monthStr = tx.date.substring(0, 7); // e.g. 2026-05
       if(!data[monthStr]) {
          const [year, m] = monthStr.split('-');
          const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          data[monthStr] = {
             month: `${monthNames[parseInt(m) - 1]} ${year}`,
             valueIncome: 0,
             valueExpense: 0
          };
       }
       if(tx.type === 'income') data[monthStr].valueIncome += Number(tx.amount) || 0;
       else data[monthStr].valueExpense += Number(tx.amount) || 0;
    });

    return Object.keys(data).sort().map(k => data[k]);
  }, [filteredTxs]);

  const getReferenceName = (tx: Transaction) => {
    if (tx.category === "project" && tx.referenceId) {
      return projects.find(p => p.id === tx.referenceId)?.name || "Proyecto desconocido";
    }
    if (tx.category === "budget" && tx.referenceId) {
      return budgets.find(b => b.id === tx.referenceId)?.title || "Presupuesto desconocido";
    }
    if (tx.category === "task" && tx.referenceId) {
      return tasks.find(t => t.id === tx.referenceId)?.description || "Tarea desconocida";
    }
    if (tx.category === "workshop" && tx.referenceId) {
      const device = devices.find(d => d.id === tx.referenceId);
      return device ? `${device.brand} ${device.model}` : "Equipo desconocido";
    }
    return "General";
  };

  const handleDownloadPDF = async (sub: Receivable) => {
    const doc = new jsPDF();
    const client = clients.find(c => c.id === sub.clientId);
    const clientName = client ? `${client.firstName} ${client.lastName}` : "Cliente Desconocido";
    
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
    doc.text("GeekyFix Workshop", 105, 25, { align: "center" });

    // Add title
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235); // bg-blue-600
    const title = sub.type === 'subscription' ? "Comprobante de Suscripción" : 
                  "Comprobante de Pago"; // Removed 'Factura'
    doc.text(title, 105, 45, { align: "center" });
    
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 55, 190, 55);
    
    // Add Client Info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`Cliente: ${clientName}`, 20, 65);
    if (client?.email) doc.text(`Email: ${client.email}`, 20, 71);
    if (client?.phone) doc.text(`Teléfono: ${client.phone}`, 20, 77);
    
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, 140, 65);
    
    // Details Table
    const bodyRows = [
      ["Concepto", sub.title],
      ["Tipo", sub.type === 'subscription' ? 'Suscripción' : sub.type === 'one-time' ? 'Pago Único' : 'Financiado'],
    ];

    if (sub.type === 'subscription') {
      bodyRows.push(["Período", sub.period === 'monthly' ? 'Mensual' : sub.period === 'weekly' ? 'Semanal' : 'Anual']);
      bodyRows.push(["Monto del Abono", `$${sub.totalAmount.toLocaleString('es-AR')}`]);
    } else {
      bodyRows.push(["Monto Total", `$${sub.totalAmount.toLocaleString('es-AR')}`]);
      bodyRows.push(["Monto Pagado", `$${sub.paidAmount.toLocaleString('es-AR')}`]);
      bodyRows.push(["Monto Pendiente", `$${(sub.totalAmount - sub.paidAmount).toLocaleString('es-AR')}`]);
    }

    bodyRows.push(["Fecha de Inicio", new Date(sub.startDate).toLocaleDateString('es-AR')]);
    bodyRows.push(["Estado", sub.status === 'active' || sub.status === 'completed' ? 'ACTIVO / PAGADO' : 'PENDIENTE']);

    autoTable(doc, {
      startY: 85,
      head: [["Detalle", "Información"]],
      body: bodyRows,
      headStyles: { fillColor: [37, 99, 235] },
      theme: 'striped'
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 160;
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Este es un comprobante generado por GeekyFix Workshop System.", 105, 280, { align: "center" });
    doc.text("GeekyFix Workshop - Ignacio Abril", 105, 285, { align: "center" });
    
    const fileNameSuffix = sub.type === 'subscription' ? 'suscripcion' : 'comprobante';
    doc.save(`${fileNameSuffix}_${clientName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="space-y-6 flex flex-col h-full relative">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Coins size={28} className="text-green-600 dark:text-green-500" />
            Finanzas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Control pagos, facturación y suscripciones
          </p>
        </div>

        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 w-full md:w-fit overflow-x-auto">
          <button 
            onClick={() => setActiveTab('cashflow')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${activeTab === 'cashflow' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            <Wallet size={18} /> Flujo de Caja
          </button>
          <button 
            onClick={() => setActiveTab('receivables')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${activeTab === 'receivables' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            <CreditCard size={18} /> Cuentas por Cobrar
          </button>
          <button 
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${activeTab === 'subscriptions' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            <Repeat size={18} /> Suscripciones
          </button>
        </div>
      </div>

      {activeTab === 'cashflow' && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hidden sm:flex">
             <div />
             <button
              onClick={openNewTxModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm w-full sm:w-auto justify-center"
            >
              <Plus size={18} /> Nuevo Registro
            </button>
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-3">
                <TrendingUp size={24} />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">Ingresos (Pdo)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">${totalIncomes.toLocaleString('es-AR')}</p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-3">
                <TrendingDown size={24} />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">Egresos (Pdo)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">${totalExpenses.toLocaleString('es-AR')}</p>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-md text-white flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-white/20 text-white rounded-full flex items-center justify-center mb-3">
                <Wallet size={24} />
              </div>
              <p className="text-sm font-semibold text-indigo-100 uppercase tracking-widest text-center">Balance del Período</p>
              <p className="text-3xl font-bold mt-1">${balance.toLocaleString('es-AR')}</p>
            </div>
          </div>

          {/* Chart */}
          {monthlyData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-gray-700" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', backgroundColor: 'var(--tw-prose-bg, white)' }}
                    formatter={(value: number, name: string) => [`$${value.toLocaleString('es-AR')}`, name]}
                    labelStyle={{ color: '#374151', fontWeight: 'bold' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  {filterType !== 'expense' && <Bar dataKey="valueIncome" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />}
                  {filterType !== 'income' && <Bar dataKey="valueExpense" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="relative flex-1">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select 
                value={filterType} 
                onChange={e => setFilterType(e.target.value as "all" | "income" | "expense")}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border-none rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos los Tipos</option>
                <option value="income">Solo Ingresos</option>
                <option value="expense">Solo Egresos</option>
              </select>
            </div>
            <div className="relative flex-1">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select 
                value={filterCategory} 
                onChange={e => setFilterCategory(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border-none rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las Categorías</option>
                <option value="general">General</option>
                <option value="project">Proyectos</option>
                <option value="budget">Presupuestos</option>
                <option value="task">Tareas</option>
                <option value="workshop">Taller</option>
              </select>
            </div>
          </div>

          {/* Transactions List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-[80px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                    <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                    <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categoría</th>
                    <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Monto</th>
                    <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredTxs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">No hay registros que coincidan.</td>
                    </tr>
                  ) : (
                    filteredTxs.map((tx: Transaction) => (
                      <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="p-4 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {new Date(tx.date).toLocaleDateString('es-AR')}
                        </td>
                        <td className="p-4">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{tx.description}</p>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium inline-block">
                            {tx.category === 'project' ? "Proyecto" : tx.category === 'budget' ? "Presupuesto" : tx.category === 'task' ? "Tarea" : tx.category === "workshop" ? "Taller" : "General"}
                            {tx.referenceId && (
                              <span className="ml-1 opacity-70">
                                (
                                {tx.category === 'project' ? (
                                  <a href={`#projects/${tx.referenceId}`} className="hover:text-blue-500 hover:underline">{getReferenceName(tx)}</a>
                                ) : tx.category === 'workshop' ? (
                                  <a href={`#devices/${tx.referenceId}`} className="hover:text-blue-500 hover:underline">{getReferenceName(tx)}</a>
                                ) : tx.category === 'budget' ? (
                                  <a href={`#budgets/${tx.referenceId}`} className="hover:text-blue-500 hover:underline">{getReferenceName(tx)}</a>
                                ) : (
                                  getReferenceName(tx)
                                )}
                                )
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <span className={`font-bold ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {tx.type === 'income' ? '+' : '-'}${Number(tx.amount).toLocaleString('es-AR')}
                          </span>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <div className="flex justify-center gap-2">
                            {tx.isAuto ? (
                              <>
                                <div className="p-1.5 text-gray-400 cursor-not-allowed" title="No puedes editar el monto de un registro automático. Tienes que editarlo en su lugar de origen.">
                                  <Lock size={16} />
                                </div>
                                <button onClick={() => handleDeleteTx(tx)} title="Ocultar de Finanzas" className="p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg">
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => openEditTxModal(tx)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDeleteTx(tx)} className="p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg">
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'receivables' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-[80px]">
          <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCard size={18} className="text-blue-500" />
              Cuentas por Cobrar & Planes de Pago
            </h3>
            <div className="flex gap-2">
              <button onClick={() => openNewRecModal('one-time')} className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors">
                <Plus size={16} /> Factura
              </button>
              <button onClick={() => openNewRecModal('installment')} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors">
                <Plus size={16} /> Plan en Cuotas
              </button>
            </div>
          </div>
          <div className="p-0">
            {receivables.filter(r => r.type !== 'subscription').length === 0 ? (
              <p className="p-8 text-center text-gray-500">No hay cuentas por cobrar registradas.</p>
            ) : (
              <div className="grid gap-3 p-4">
                {receivables.filter(r => r.type !== 'subscription').map(rec => (
                   <div key={rec.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {rec.status === 'completed' ? <CheckCircle size={16} className="text-green-500" /> : <Clock size={16} className="text-amber-500" />}
                          <h4 className="font-bold text-gray-900 dark:text-gray-100">{rec.title}</h4>
                          <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded font-semibold">
                            {rec.type === 'one-time' ? 'Un solo pago' : 'Cuotas'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cliente: {clients.find(c => c.id === rec.clientId)?.firstName} {clients.find(c => c.id === rec.clientId)?.lastName || 'Desconocido'} | Inicio: {new Date(rec.startDate).toLocaleDateString('es-AR')}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                        <div className="text-right">
                          <p className="text-xs text-gray-500 uppercase font-semibold">Monto Acumulado / Total</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            <span className={rec.paidAmount >= rec.totalAmount ? "text-green-600" : "text-amber-600"}>${rec.paidAmount.toLocaleString('es-AR')}</span> 
                            <span className="text-gray-400 mx-1">/</span> 
                            ${rec.totalAmount.toLocaleString('es-AR')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => handleDownloadPDF(rec)} className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 rounded block transition-colors" title="Descargar PDF">
                             <FileText size={16} />
                           </button>
                           <button onClick={() => openEditRecModal(rec)} className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 rounded block text-sm font-semibold transition-colors">Editar</button>
                           <button onClick={() => handleDeleteRec(rec.id)} className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 rounded block text-sm font-semibold transition-colors"><Trash2 size={16}/></button>
                        </div>
                      </div>
                   </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-[80px]">
          <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Repeat size={18} className="text-purple-500" />
              Suscripciones y Abonos Mensuales
            </h3>
            <button onClick={() => openNewRecModal('subscription')} className="px-3 py-1.5 bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors">
              <Plus size={16} /> Nueva Suscripción
            </button>
          </div>
          <div className="p-0">
            {receivables.filter(r => r.type === 'subscription').length === 0 ? (
              <p className="p-8 text-center text-gray-500">No hay suscripciones registradas.</p>
            ) : (
              <div className="grid gap-3 p-4">
                {receivables.filter(r => r.type === 'subscription').map(sub => (
                   <div key={sub.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${sub.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                          <h4 className="font-bold text-gray-900 dark:text-gray-100">{sub.title}</h4>
                          <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded font-semibold uppercase tracking-wider">
                            {sub.period === 'monthly' ? 'Mensual' : sub.period === 'weekly' ? 'Semanal' : 'Anual'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cliente: {clients.find(c => c.id === sub.clientId)?.firstName} {clients.find(c => c.id === sub.clientId)?.lastName || 'Desconocido'}</p>
                      </div>
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="text-right flex-1 sm:flex-none">
                          <p className="text-xs text-gray-500 uppercase font-semibold">Valor</p>
                          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">${sub.totalAmount.toLocaleString('es-AR')}</p>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => handleDownloadPDF(sub)} className="p-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 rounded block transition-colors" title="Descargar PDF">
                             <FileText size={16} />
                           </button>
                           <button onClick={() => openEditRecModal(sub)} className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 rounded block text-sm font-semibold transition-colors">Editar</button>
                           <button onClick={() => handleDeleteRec(sub.id)} className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 rounded block text-sm font-semibold transition-colors"><Trash2 size={16}/></button>
                        </div>
                      </div>
                   </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isTxModalOpen && (
        <Modal isOpen={isTxModalOpen} onClose={() => setIsTxModalOpen(false)} title={editingTx ? "Editar Registro Financiero" : "Alta de Ingreso/Egreso"}>
          <form onSubmit={handleSaveTx} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo de Movimiento</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setTxFormData({...txFormData, type: 'income'})}
                    className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${txFormData.type === 'income' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    <TrendingUp size={16} /> Ingreso
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTxFormData({...txFormData, type: 'expense'})}
                    className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${txFormData.type === 'expense' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    <TrendingDown size={16} /> Egreso
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={txFormData.category}
                  onChange={e => setTxFormData({...txFormData, category: e.target.value as any, referenceId: undefined})}
                >
                  <option value="general">General u Otros</option>
                  <option value="project">Asociado a Proyecto</option>
                  <option value="budget">Asociado a Presupuesto</option>
                  <option value="task">Asociado a Tarea</option>
                </select>
              </div>
            </div>

            {txFormData.category === 'project' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Proyecto</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={txFormData.referenceId || ""}
                  onChange={e => setTxFormData({...txFormData, referenceId: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {txFormData.category === 'budget' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Presupuesto</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={txFormData.referenceId || ""}
                  onChange={e => setTxFormData({...txFormData, referenceId: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {budgets.map(b => <option key={b.id} value={b.id}>{b.title || `Presupuesto del ${new Date(b.date).toLocaleDateString()}`}</option>)}
                </select>
              </div>
            )}

            {txFormData.category === 'task' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Tarea</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={txFormData.referenceId || ""}
                  onChange={e => setTxFormData({...txFormData, referenceId: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.description || `Tarea del ${new Date(t.date).toLocaleDateString()}`}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Descripción / Detalle</label>
              <input 
                type="text" 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                value={txFormData.description}
                onChange={e => setTxFormData({...txFormData, description: e.target.value})}
                placeholder="Ej. Compra de materiales, Pago de cliente..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Monto ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={txFormData.amount || ''}
                  onChange={e => setTxFormData({...txFormData, amount: parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input 
                  type="date" 
                  required 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  value={txFormData.date}
                  onChange={e => setTxFormData({...txFormData, date: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setIsTxModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors"
              >
                {editingTx ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isRecModalOpen && (
        <Modal isOpen={isRecModalOpen} onClose={() => setIsRecModalOpen(false)} title={editingRec ? "Editar Acuerdo/Cuenta" : "Nuevo Acuerdo de Pago / Suscripción"}>
          <form onSubmit={handleSaveRec} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Origen / Tipo de Trabajo</label>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    setRecFormData({...recFormData, referenceType: 'project', clientId: undefined});
                    setSelectedBudgetIds([]);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${recFormData.referenceType === 'project' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                >
                  Proyecto
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setRecFormData({...recFormData, referenceType: 'workshop', clientId: undefined});
                    setSelectedBudgetIds([]);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${recFormData.referenceType === 'workshop' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                >
                  Taller / Workshop
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <div className="relative mb-2">
                <input 
                  type="text"
                  placeholder="Buscar cliente..."
                  className="w-full px-4 py-2 text-sm rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 outline-none"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
              </div>
              <select 
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                value={recFormData.clientId || ""}
                onChange={e => {
                  setRecFormData({...recFormData, clientId: e.target.value});
                  setSelectedBudgetIds([]);
                }}
                required
              >
                <option value="">-- Seleccionar --</option>
                {clients
                  .filter(c => {
                    // Type filter
                    if (recFormData.referenceType === 'project') {
                      if (!projects.some(p => p.clientId === c.id)) return false;
                    } else if (recFormData.referenceType === 'workshop') {
                      if (!devices.some(d => d.clientId === c.id)) return false;
                    }
                    
                    // Search filter
                    if (clientSearch) {
                      const search = clientSearch.toLowerCase();
                      return (c.firstName + " " + c.lastName).toLowerCase().includes(search) ||
                             (c.email || "").toLowerCase().includes(search);
                    }
                    
                    return true;
                  })
                  .map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
              {clients.length > 0 && clients.filter(c => {
                  if (recFormData.referenceType === 'project') return projects.some(p => p.clientId === c.id);
                  if (recFormData.referenceType === 'workshop') return devices.some(d => d.clientId === c.id);
                  return true;
                }).length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No hay clientes con {recFormData.referenceType === 'project' ? 'proyectos' : 'equipos'} activos.</p>
              )}
            </div>

            {recFormData.clientId && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Presupuestos Asociados (Opcional)</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                  {budgets.filter(b => b.clientId === recFormData.clientId && (recFormData.referenceType === 'project' ? b.projectId : b.deviceId)).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No se encontraron presupuestos del tipo seleccionado para este cliente.</p>
                  ) : (
                    budgets
                      .filter(b => b.clientId === recFormData.clientId && (recFormData.referenceType === 'project' ? b.projectId : b.deviceId))
                      .map(b => (
                        <label key={b.id} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                          <input 
                            type="checkbox"
                            checked={selectedBudgetIds.includes(b.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked 
                                ? [...selectedBudgetIds, b.id]
                                : selectedBudgetIds.filter(id => id !== b.id);
                              setSelectedBudgetIds(newIds);
                              
                              const selectedBuds = budgets.filter(bud => newIds.includes(bud.id));
                              const total = selectedBuds.reduce((sum, bud) => sum + (bud.total || 0), 0);
                              const titles = selectedBuds
                                .map(bud => bud.title || `Presupuesto ${new Date(bud.date).toLocaleDateString()}`)
                                .join(", ");

                              setRecFormData(prev => ({
                                ...prev,
                                totalAmount: newIds.length > 0 ? total : prev.totalAmount,
                                title: newIds.length > 0 ? titles : prev.title
                              }));
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{b.title || "Presupuesto sin título"}</p>
                            <p className="text-xs text-gray-500">${b.total.toLocaleString('es-AR')} - {new Date(b.date).toLocaleDateString()}</p>
                          </div>
                        </label>
                      ))
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{recFormData.type === 'subscription' ? 'Nombre de Suscripción' : 'Concepto de Factura/Cuotas'}</label>
              <input 
                type="text" 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                value={recFormData.title}
                onChange={e => setRecFormData({...recFormData, title: e.target.value})}
                placeholder={recFormData.type === 'subscription' ? "Abono Mantenimiento IT" : "Proyecto Web XYZ"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {recFormData.type === 'subscription' ? 'Valor por Período ($)' : 'Monto Total ($)'}
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600 dark:text-blue-400"
                  value={recFormData.totalAmount || ''}
                  onChange={e => setRecFormData({...recFormData, totalAmount: parseFloat(e.target.value)})}
                />
              </div>
              {recFormData.type !== 'subscription' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Monto Cobrado Hasta Ahora ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-green-600 dark:text-green-400"
                    value={recFormData.paidAmount || ''}
                    onChange={e => setRecFormData({...recFormData, paidAmount: parseFloat(e.target.value)})}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fecha de Inicio / Venta</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={recFormData.startDate}
                    onChange={e => setRecFormData({...recFormData, startDate: e.target.value})}
                  />
               </div>
               {recFormData.type === 'subscription' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Período de Facturación</label>
                    <select 
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      value={recFormData.period || "monthly"}
                      onChange={e => setRecFormData({...recFormData, period: e.target.value as any})}
                    >
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
               )}
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <select 
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                value={recFormData.status || "pending"}
                onChange={e => setRecFormData({...recFormData, status: e.target.value as any})}
              >
                {recFormData.type === 'subscription' ? (
                  <>
                    <option value="active">Activa</option>
                    <option value="cancelled">Cancelada / Pausada</option>
                  </>
                ) : (
                  <>
                    <option value="pending">Pendiente de Pago</option>
                    <option value="completed">Pagado Completo</option>
                  </>
                )}
              </select>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button 
                type="button" 
                onClick={() => setIsRecModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors"
              >
                {editingRec ? "Actualizar" : "Guardar Acuerdo"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={!!itemToDelete} 
        onClose={() => setItemToDelete(null)} 
        title="Eliminar Registro"
      >
        <div className="p-4">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
            <Trash2 size={24} />
            <p className="font-semibold">¿Estás seguro de eliminar este registro?</p>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={() => setItemToDelete(null)} 
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-bold"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmDelete} 
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm font-bold"
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
