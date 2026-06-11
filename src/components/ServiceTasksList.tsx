import React, { useState, useEffect } from "react";
import { api } from "../api";
import { ServiceTask, Client, Budget } from "../types";
import { Plus, Trash2, Edit2, CheckCircle2, Clock, X, MessageCircle, Calendar, DollarSign, Timer, FileText } from "lucide-react";
import { Modal } from "./Modal";

export function ServiceTasksList({ clientId, projectId }: { clientId?: string, projectId?: string }) {
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ServiceTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    Promise.all([api.getServiceTasks(), api.getClients()]).then(([ts, clis]) => {
      setTasks(ts);
      const clientMap = clis.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      setClients(clientMap);
    });
  }, []);

  const handleToggleCompleted = async (e: React.MouseEvent, task: ServiceTask) => {
    e.stopPropagation();
    setIsUpdatingStatus(task.id);
    try {
      const updated = await api.updateServiceTask(task.id, { ...task, isCompleted: !task.isCompleted });
      setTasks(tasks.map(t => t.id === updated.id ? updated : t));
    } catch (error) {
      console.error("Error updating status", error);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleTaskSaved = (task: ServiceTask) => {
    if (editingTask) {
      setTasks(tasks.map(t => t.id === task.id ? task : t));
      setEditingTask(null);
    } else {
      setTasks([...tasks.filter(t => t.id !== task.id), task]);
      setShowForm(false);
    }
  };

  const filteredTasks = tasks
    .filter(t => {
      let match = true;
      if (projectId) match = match && t.projectId === projectId;
      if (clientId) match = match && t.clientId === clientId;
      if (filterType === "pending") match = match && !t.isCompleted;
      if (filterType === "completed") match = match && t.isCompleted;
      return match;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 dark:bg-gray-900/50 p-2 rounded-xl border border-gray-100 dark:border-gray-800 gap-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 pl-2">
          <CheckCircle2 size={18} className="text-blue-500" />
          Tareas Realizadas
        </h2>
        
        <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2">
          <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setFilterType("all")}
              className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-md transition-all ${filterType === "all" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterType("pending")}
              className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-md transition-all ${filterType === "pending" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilterType("completed")}
              className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-md transition-all ${filterType === "completed" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
            >
              Completadas
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus size={14} /> Nueva Tarea
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {filteredTasks.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-6 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-sm">
            No hay tareas registradas.
          </p>
        )}
        {filteredTasks.map((task) => {
          const isExpanded = expandedTaskId === task.id;
          return (
            <div 
              key={task.id} 
              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border transition-all cursor-pointer overflow-hidden ${
                task.isCompleted 
                  ? 'border-gray-100 dark:border-gray-700 opacity-75' 
                  : 'border-blue-100 dark:border-blue-900 shadow-blue-500/5'
              } ${isExpanded ? 'ring-2 ring-blue-500/20' : 'hover:border-blue-300'}`}
            >
              {/* Collapsed State Bar */}
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={(e) => handleToggleCompleted(e, task)}
                  disabled={isUpdatingStatus === task.id}
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                    task.isCompleted 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {isUpdatingStatus === task.id ? (
                    <Clock size={12} className="animate-spin" />
                  ) : (
                    task.isCompleted && <CheckCircle2 size={16} />
                  )}
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium truncate ${task.isCompleted ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                      {task.description}
                    </p>
                    {isExpanded && (
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                        #{task.id.slice(0,4)}
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span>{task.date}</span>
                      <span>•</span>
                      <span>${task.amount.toLocaleString()}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Timer size={10} /> {task.duration}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  {!isExpanded && (
                    <FileText size={16} className="text-gray-300" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Fecha Realizada</p>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Calendar size={14} className="text-blue-500" />
                        {task.date}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Tiempo Empleado</p>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Timer size={14} className="text-purple-500" />
                        {task.duration}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Monto Cobrado</p>
                      <div className="flex items-center gap-2 text-sm font-bold text-green-600 dark:text-green-400">
                        <DollarSign size={14} />
                        ${task.amount.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Detalle del Servicio</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                      {task.description}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setTaskToDelete(task.id); }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingTask(task); }}
                      className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all active:scale-95"
                    >
                      <Edit2 size={14} /> Editar Tarea
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(showForm || editingTask) && (
        <ServiceTaskForm
          initialData={editingTask || undefined}
          clientId={clientId}
          projectId={projectId}
          clients={Object.values(clients)}
          onSuccess={handleTaskSaved}
          onCancel={() => { setShowForm(false); setEditingTask(null); }}
        />
      )}

      {taskToDelete && (
        <Modal isOpen={!!taskToDelete} onClose={() => setTaskToDelete(null)} title="Eliminar Tarea">
          <div className="p-4 text-center">
            <p className="text-gray-600 dark:text-gray-300 mb-6">¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setTaskToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
              <button
                onClick={async () => {
                  await api.deleteServiceTask(taskToDelete);
                  setTasks(tasks.filter(t => t.id !== taskToDelete));
                  setTaskToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ServiceTaskForm({ initialData, clientId, projectId, clients, onSuccess, onCancel }: { initialData?: ServiceTask, clientId?: string, projectId?: string, clients: Client[], onSuccess: (t: ServiceTask) => void, onCancel: () => void }) {
  const [selectedClientId, setSelectedClientId] = useState(clientId || initialData?.clientId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || initialData?.projectId || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(initialData?.description || "");
  const [duration, setDuration] = useState(initialData?.duration || "");
  const [amount, setAmount] = useState(initialData?.amount || 0);
  const [isCompleted, setIsCompleted] = useState(initialData?.isCompleted || false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;
    setIsSubmitting(true);
    try {
      const taskData = { clientId: selectedClientId, projectId: selectedProjectId || undefined, date, description, duration, amount, isCompleted };
      let saved;
      if (initialData) {
        saved = await api.updateServiceTask(initialData.id, taskData);
      } else {
        saved = await api.createServiceTask(taskData);
      }
      onSuccess(saved);
    } catch (error) {
      console.error("Error saving task", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={initialData ? "Editar Tarea" : "Nueva Tarea de Servicio"}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {!clientId && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
            <select
              className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              required
            >
              <option value="">Seleccionar cliente...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
            <input type="date" className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tiempo empleado</label>
            <input type="text" placeholder="ej. 1h 30m" className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800" value={duration} onChange={(e) => setDuration(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción de lo realizado</label>
          <textarea className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 h-24" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Monto Cobrado</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input type="number" className="w-full p-2 pl-7 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} required />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isCompleted" checked={isCompleted} onChange={(e) => setIsCompleted(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <label htmlFor="isCompleted" className="text-sm font-medium text-gray-700 dark:text-gray-300">Marcar como completada</label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? "Guardando..." : "Guardar Tarea"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
