import React, { useState, useEffect } from "react";
import { api } from "../api";
import { ServiceTask, Client, Budget } from "../types";
import { Plus, Trash2, Edit2, CheckCircle2, Clock, X, MessageCircle, Calendar, DollarSign, Timer, FileText } from "lucide-react";
import { Modal } from "./Modal";

export function ServiceTasksList({ clientId }: { clientId?: string }) {
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ServiceTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getServiceTasks(), api.getClients()]).then(([ts, clis]) => {
      setTasks(ts);
      const clientMap = clis.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      setClients(clientMap);
    });
  }, []);

  const handleTaskSaved = (task: ServiceTask) => {
    if (editingTask) {
      setTasks(tasks.map(t => t.id === task.id ? task : t));
      setEditingTask(null);
    } else {
      setTasks([...tasks, task]);
      setShowForm(false);
    }
  };

  const filteredTasks = tasks.filter(t => !clientId || t.clientId === clientId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Tareas de Servicio</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-sm"
        >
          <Plus size={16} /> Nueva Tarea
        </button>
      </div>

      <div className="grid gap-3">
        {filteredTasks.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            No hay tareas registradas.
          </p>
        )}
        {filteredTasks.map((task) => (
          <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 transition-all group">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${task.isCompleted ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
                    {task.isCompleted ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {task.isCompleted ? "Completado" : "Pendiente"}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">• {task.date}</span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{task.description}</h3>
                {!clientId && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Cliente: <span className="font-medium text-blue-600 dark:text-blue-400">{clients[task.clientId]?.firstName} {clients[task.clientId]?.lastName}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-4 mt-3">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <Timer size={14} className="text-blue-500" />
                    <span>{task.duration}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <DollarSign size={14} className="text-green-500" />
                    <span className="font-bold text-gray-900 dark:text-gray-100">${task.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingTask(task)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => setTaskToDelete(task.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(showForm || editingTask) && (
        <ServiceTaskForm
          initialData={editingTask || undefined}
          clientId={clientId}
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

function ServiceTaskForm({ initialData, clientId, clients, onSuccess, onCancel }: { initialData?: ServiceTask, clientId?: string, clients: Client[], onSuccess: (t: ServiceTask) => void, onCancel: () => void }) {
  const [selectedClientId, setSelectedClientId] = useState(clientId || initialData?.clientId || "");
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
      const taskData = { clientId: selectedClientId, date, description, duration, amount, isCompleted };
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
