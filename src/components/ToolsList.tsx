import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Tool } from "../types";
import { Plus, Trash2, ExternalLink, Download, Search, AlertCircle, Edit2, FileText, Link as LinkIcon, Upload, Wrench, Box, Globe, Shield, Zap } from "lucide-react";
import { Modal } from "./Modal";
import { motion, AnimatePresence } from "motion/react";

export function ToolsList() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [toolToDelete, setToolToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTools();
      setTools(data);
    } catch (error) {
      console.error("Error loading tools", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTool = async (formData: FormData) => {
    try {
      if (editingTool) {
        const updated = await api.updateTool(editingTool.id, formData);
        setTools(tools.map(t => t.id === updated.id ? updated : t));
        setEditingTool(null);
      } else {
        const newTool = await api.createTool(formData);
        setTools([...tools, newTool]);
        setShowForm(false);
      }
    } catch (error) {
      console.error("Error saving tool", error);
    }
  };

  const confirmDelete = async () => {
    if (!toolToDelete) return;
    try {
      await api.deleteTool(toolToDelete);
      setTools(tools.filter(t => t.id !== toolToDelete));
      setToolToDelete(null);
    } catch (error) {
      console.error("Error deleting tool", error);
    }
  };

  const filteredTools = tools.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
              <Wrench size={24} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Caja de Herramientas</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Acceso rápido a utilidades, instaladores y enlaces útiles</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          <Plus size={20} /> Nueva Herramienta
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o descripción..."
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none shadow-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-blue-100 dark:border-blue-900/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Cargando herramientas...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTools.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="col-span-full text-center py-20 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800"
              >
                <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm inline-block mb-4">
                  <Box size={40} className="text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">No hay herramientas</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                  {searchQuery ? "No se encontraron resultados para tu búsqueda." : "Comienza agregando instaladores o enlaces frecuentes."}
                </p>
              </motion.div>
            ) : (
              filteredTools.map((tool) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={tool.id}
                  className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden"
                >
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-3 rounded-xl ${
                        tool.type === 'file' 
                          ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      }`}>
                        {tool.type === 'file' ? <FileText size={24} /> : <Globe size={24} />}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingTool(tool)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setToolToDelete(tool.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {tool.name}
                    </h3>
                    
                    {tool.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 leading-relaxed">
                        {tool.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-auto pt-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        tool.type === 'file' 
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' 
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}>
                        {tool.type === 'file' ? 'Ejecutable' : 'Enlace'}
                      </span>
                      {tool.fileName && (
                        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate max-w-[150px]">
                          {tool.fileName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 mt-auto">
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 ${
                        tool.type === 'file'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                          : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }`}
                    >
                      {tool.type === 'file' ? <Download size={18} /> : <ExternalLink size={18} />}
                      {tool.type === 'file' ? 'Descargar' : 'Visitar Sitio'}
                    </a>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      )}

      <Modal isOpen={showForm || !!editingTool} onClose={() => { setShowForm(false); setEditingTool(null); }} title={editingTool ? "Editar Herramienta" : "Nueva Herramienta"}>
        <ToolForm 
          initialData={editingTool || undefined}
          onSuccess={handleSaveTool} 
          onCancel={() => { setShowForm(false); setEditingTool(null); }} 
        />
      </Modal>

      <Modal isOpen={!!toolToDelete} onClose={() => setToolToDelete(null)} title="Eliminar Herramienta">
        <div className="p-2">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={24} />
            <h4 className="font-bold">¿Confirmar eliminación?</h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Estás a punto de eliminar esta herramienta. Si es un archivo subido, se perderá permanentemente del servidor.
          </p>
          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button 
              onClick={() => setToolToDelete(null)} 
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmDelete} 
              className="px-6 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-red-500/20"
            >
              Eliminar Permanentemente
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ToolForm({ initialData, onSuccess, onCancel }: { initialData?: Tool; onSuccess: (formData: FormData) => void; onCancel: () => void }) {
  const [type, setType] = useState<'link' | 'file'>(initialData?.type || 'link');
  const [name, setName] = useState(initialData?.name || "");
  const [url, setUrl] = useState(initialData?.url || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("description", description);
    if (type === 'link') {
      formData.append("url", url);
    } else if (file) {
      formData.append("file", file);
    }
    onSuccess(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex gap-2 p-1.5 bg-gray-100 dark:bg-gray-900 rounded-2xl">
        <button
          type="button"
          onClick={() => setType('link')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${type === 'link' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          <Globe size={14} />
          Enlace Externo
        </button>
        <button
          type="button"
          onClick={() => setType('file')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${type === 'file' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          <Upload size={14} />
          Subir Archivo
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Nombre de la herramienta</label>
          <input
            type="text"
            required
            placeholder="Ej: Rufus, CPU-Z, CrystalDiskInfo"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {type === 'link' ? (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">URL de descarga</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="url"
                required={type === 'link'}
                placeholder="https://..."
                className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Archivo</label>
            <div className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-200 dark:border-gray-700 border-dashed rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-50/50 dark:bg-gray-900/30">
              <div className="space-y-2 text-center">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm inline-block mb-2">
                  <Upload className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex text-sm text-gray-600 dark:text-gray-400">
                  <label className="relative cursor-pointer rounded-md font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 focus-within:outline-none">
                    <span>Haga clic para subir</span>
                    <input 
                      type="file" 
                      className="sr-only" 
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      required={type === 'file' && !initialData}
                    />
                  </label>
                  <p className="pl-1">o arrastre y suelte</p>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {file ? file.name : (initialData?.fileName || "Cualquier archivo ejecutable o comprimido")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Descripción (opcional)</label>
          <textarea
            rows={3}
            placeholder="Explica brevemente para qué sirve esta herramienta..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-8 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          {initialData ? "Actualizar Herramienta" : "Guardar Herramienta"}
        </button>
      </div>
    </form>
  );
}

