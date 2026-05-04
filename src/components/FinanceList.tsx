import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Transaction, Project, Budget, ServiceTask } from "../types";
import { Coins, Plus, Trash2, Edit2, TrendingUp, TrendingDown, Wallet, X, Filter } from "lucide-react";
import { Modal } from "./Modal";

export function FinanceList({ appMode }: { appMode: "workshop" | "project" }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [formData, setFormData] = useState<Partial<Transaction>>({
    type: "income",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    description: "",
    category: "general",
  });

  useEffect(() => {
    fetchData();
  }, [appMode]);

  const fetchData = async () => {
    try {
      const [txData, projData, budgData, taskData] = await Promise.all([
        api.getTransactions(),
        api.getProjects(),
        api.getBudgets(),
        api.getServiceTasks()
      ]);
      setTransactions(txData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setProjects(projData);
      setBudgets(budgData);
      setTasks(taskData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTx) {
        await api.updateTransaction(editingTx.id, formData);
      } else {
        await api.createTransaction({
          ...formData,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
      setEditingTx(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Seguro que deseas eliminar este registro?")) {
      await api.deleteTransaction(id);
      fetchData();
    }
  };

  const openNewModal = () => {
    setFormData({
      type: "income",
      amount: 0,
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "general",
    });
    setEditingTx(null);
    setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setFormData(tx);
    setEditingTx(tx);
    setIsModalOpen(true);
  };

  // Calcular balance y totales
  const filteredTxs = transactions.filter(tx => {
    const isAppModeMatch = appMode === "project" ? (tx.category === "project" || tx.category === "general") : (tx.category === "general" || tx.category === "workshop" || tx.category === "task" || tx.category === "budget");
    if (!isAppModeMatch && tx.category !== "general") return false; // Basic filter for general compatibility
    
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterCategory !== "all" && tx.category !== filterCategory) return false;
    return true;
  });

  const totalIncomes = transactions.filter(t => t.type === "income").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalExpenses = transactions.filter(t => t.type === "expense").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const balance = totalIncomes - totalExpenses;

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
    return "General";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Coins size={28} className="text-green-600 dark:text-green-500" />
            Finanzas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Control de ingresos, egresos y balance general.
          </p>
        </div>
        <button
          onClick={openNewModal}
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
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">Ingresos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">${totalIncomes.toLocaleString('es-AR')}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-3">
            <TrendingDown size={24} />
          </div>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">Egresos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">${totalExpenses.toLocaleString('es-AR')}</p>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-md text-white flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-white/20 text-white rounded-full flex items-center justify-center mb-3">
            <Wallet size={24} />
          </div>
          <p className="text-sm font-semibold text-indigo-100 uppercase tracking-widest text-center">Balance Total</p>
          <p className="text-3xl font-bold mt-1">${balance.toLocaleString('es-AR')}</p>
        </div>
      </div>

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
          </select>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
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
                filteredTxs.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-4 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">
                      {new Date(tx.date).toLocaleDateString('es-AR')}
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{tx.description}</p>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium inline-block">
                        {tx.category === 'project' ? "Proyecto" : tx.category === 'budget' ? "Presupuesto" : tx.category === 'task' ? "Tarea" : "General"}
                        {tx.referenceId && <span className="ml-1 opacity-70">({getReferenceName(tx)})</span>}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <span className={`font-bold ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {tx.type === 'income' ? '+' : '-'}${Number(tx.amount).toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEditModal(tx)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(tx.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTx ? "Editar Registro" : "Nuevo Registro Financiero"}>
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo de Movimiento</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, type: 'income'})}
                    className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${formData.type === 'income' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    <TrendingUp size={16} /> Ingreso
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, type: 'expense'})}
                    className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors border ${formData.type === 'expense' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    <TrendingDown size={16} /> Egreso
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value, referenceId: undefined})}
                >
                  <option value="general">General u Otros</option>
                  <option value="project">Asociado a Proyecto</option>
                  <option value="budget">Asociado a Presupuesto</option>
                  <option value="task">Asociado a Tarea</option>
                </select>
              </div>
            </div>

            {formData.category === 'project' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Proyecto</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={formData.referenceId || ""}
                  onChange={e => setFormData({...formData, referenceId: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {formData.category === 'budget' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Presupuesto</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={formData.referenceId || ""}
                  onChange={e => setFormData({...formData, referenceId: e.target.value})}
                  required
                >
                  <option value="">-- Seleccionar --</option>
                  {budgets.map(b => <option key={b.id} value={b.id}>{b.title || `Presupuesto del ${new Date(b.date).toLocaleDateString()}`}</option>)}
                </select>
              </div>
            )}

            {formData.category === 'task' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Seleccionar Tarea</label>
                <select 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  value={formData.referenceId || ""}
                  onChange={e => setFormData({...formData, referenceId: e.target.value})}
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
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
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
                  value={formData.amount || ''}
                  onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input 
                  type="date" 
                  required 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
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
    </div>
  );
}
