import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Project, Client, ProjectDoc } from "../types";
import { Plus, Folder, FileText, Image as ImageIcon, Link as LinkIcon, Trash2, Edit2, ExternalLink, Calendar, User, Upload, X, CheckCircle2, Clock, AlertCircle, Copy } from "lucide-react";
import { Modal } from "./Modal";

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, c] = await Promise.all([api.getProjects(), api.getClients()]);
    setProjects(p);
    setClients(c.filter(client => (client.type as string) === 'project' || (client.type as string) === 'projects'));
  };

  const handleSaveProject = async (projectData: Partial<Project>) => {
    if (editingProject) {
      const updated = await api.updateProject(editingProject.id, projectData);
      setProjects(projects.map(p => p.id === updated.id ? updated : p));
      setEditingProject(null);
    } else {
      const created = await api.createProject(projectData);
      setProjects([...projects, created]);
      setShowForm(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este proyecto?")) {
      await api.deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
      if (selectedProject?.id === id) setSelectedProject(null);
    }
  };

  const handleUpdateProject = async (id: string, projectData: Partial<Project>) => {
    const updated = await api.updateProject(id, projectData);
    setProjects(projects.map(p => p.id === updated.id ? updated : p));
    if (selectedProject?.id === id) setSelectedProject(updated);
  };

  const handleUploadDocs = async (projectId: string, files: FileList | null, links: { name: string, url: string }[]) => {
    if (!files && links.length === 0) return;
    
    setIsUploading(true);
    const formData = new FormData();
    if (files) {
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    }
    if (links.length > 0) {
      formData.append("links", JSON.stringify(links));
    }

    try {
      const updated = await api.uploadProjectDocuments(projectId, formData);
      setProjects(projects.map(p => p.id === updated.id ? updated : p));
      setSelectedProject(updated);
    } catch (error) {
      console.error("Error uploading documents", error);
    } finally {
      setIsUploading(false);
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
      await api.createClient(clonedClient);
      // No need to update local state as it's likely cloned to a different type
      // that wouldn't be shown in the current view anyway.
    } catch (error) {
      console.error("Error cloning client:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Proyectos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona tus proyectos y documentación</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          <Plus size={20} /> Nuevo Proyecto
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => {
          const client = clients.find(c => c.id === project.clientId);
          return (
            <div 
              key={project.id}
              className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group cursor-pointer"
              onClick={() => setSelectedProject(project)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                  <Folder size={24} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingProject(project); }}
                    className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{project.name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                <User size={14} />
                <span>{client ? `${client.firstName} ${client.lastName}` : "Cliente desconocido"}</span>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className={`px-2 py-1 rounded-full ${
                    project.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    project.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}>
                    {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : 'En espera'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <FileText size={12} />
                  {project.documents.length} docs
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-700">
          <div className="bg-gray-50 dark:bg-gray-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Folder size={32} className="text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">No hay proyectos</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto mt-1">
            Comienza creando tu primer proyecto para organizar tu trabajo y documentación.
          </p>
        </div>
      )}

      {(showForm || editingProject) && (
        <ProjectForm 
          clients={clients}
          initialData={editingProject || undefined}
          onSave={handleSaveProject}
          onCancel={() => { setShowForm(false); setEditingProject(null); }}
        />
      )}

      {selectedProject && (
        <ProjectDetail 
          project={selectedProject}
          client={clients.find(c => c.id === selectedProject.clientId)}
          onClose={() => setSelectedProject(null)}
          onUploadDocs={(files, links) => handleUploadDocs(selectedProject.id, files, links)}
          onUpdateProject={(data) => handleUpdateProject(selectedProject.id, data)}
          onCloneClient={handleCloneClient}
          isUploading={isUploading}
        />
      )}
    </div>
  );
}

function ProjectForm({ clients, initialData, onSave, onCancel }: { clients: Client[], initialData?: Project, onSave: (p: Partial<Project>) => void, onCancel: () => void }) {
  const [name, setName] = useState(initialData?.name || "");
  const [clientId, setClientId] = useState(initialData?.clientId || "");
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(initialData?.description || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [status, setStatus] = useState<Project['status']>(initialData?.status || 'active');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, clientId, startDate, description, notes, status });
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={initialData ? "Editar Proyecto" : "Nuevo Proyecto"}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Nombre del Proyecto</label>
          <input 
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder="Ej: Instalación de Red Local"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
          <select 
            required
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          >
            <option value="">Seleccionar cliente...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Fecha de Inicio</label>
            <input 
              type="date"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select 
              value={status}
              onChange={e => setStatus(e.target.value as Project['status'])}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="active">Activo</option>
              <option value="on-hold">En espera</option>
              <option value="completed">Completado</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
          <textarea 
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 resize-none"
            placeholder="Detalles del proyecto..."
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Notas Adicionales</label>
          <textarea 
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 resize-none"
            placeholder="Información adicional, notas de progreso..."
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
            Cancelar
          </button>
          <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95">
            {initialData ? "Guardar Cambios" : "Crear Proyecto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectDetail({ project, client, onClose, onUploadDocs, onUpdateProject, onCloneClient, isUploading }: { project: Project, client?: Client, onClose: () => void, onUploadDocs: (files: FileList | null, links: { name: string, url: string }[]) => void, onUpdateProject: (data: Partial<Project>) => void, onCloneClient: (client: Client) => void, isUploading: boolean }) {
  const [showUpload, setShowUpload] = useState(false);
  const [newLinks, setNewLinks] = useState<{ name: string, url: string }[]>([]);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(project.notes || "");
  const [clonedStatus, setClonedStatus] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSaveNotes = () => {
    onUpdateProject({ notes });
    setIsEditingNotes(false);
  };

  const handleClone = async () => {
    if (client) {
      onCloneClient(client);
      setClonedStatus(`Cliente clonado a ${client.type === 'workshop' ? 'Proyectos' : 'Workshop'}`);
      setTimeout(() => setClonedStatus(null), 3000);
    }
  };

  const addLink = () => {
    if (linkName && linkUrl) {
      setNewLinks([...newLinks, { name: linkName, url: linkUrl }]);
      setLinkName("");
      setLinkUrl("");
    }
  };

  const removeLink = (idx: number) => {
    setNewLinks(newLinks.filter((_, i) => i !== idx));
  };

  const handleUpload = () => {
    onUploadDocs(fileInputRef.current?.files || null, newLinks);
    setShowUpload(false);
    setNewLinks([]);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={project.name} maxWidth="max-w-4xl">
      <div className="flex flex-col h-[80vh]">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 dark:text-gray-100">{client ? `${client.firstName} ${client.lastName}` : "N/A"}</p>
                    {client && (
                      <button
                        onClick={handleClone}
                        className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title={`Clonar cliente a ${client.type === 'workshop' ? 'Proyectos' : 'Workshop'}`}
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {clonedStatus && (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-lg border border-green-100 dark:border-green-800 animate-in fade-in slide-in-from-left-2">
                  <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
                  <span className="text-xs font-bold text-green-600 dark:text-green-400">{clonedStatus}</span>
                </div>
              )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Inicio</p>
                <p className="font-bold text-gray-900 dark:text-gray-100">{project.startDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado</p>
                <p className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm">{project.status}</p>
              </div>
            </div>
          </div>
          {project.description && (
            <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{project.description}</p>
            </div>
          )}
          
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileText size={18} className="text-gray-400" />
                Notas Adicionales
              </h4>
              {!isEditingNotes ? (
                <button 
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Editar Notas
                </button>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setIsEditingNotes(false); setNotes(project.notes || ""); }}
                    className="text-xs text-gray-500 hover:underline font-medium"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveNotes}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    Guardar
                  </button>
                </div>
              )}
            </div>
            
            {isEditingNotes ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[120px] resize-y"
                placeholder="Escribe aquí información adicional, notas de progreso, etc..."
                autoFocus
              />
            ) : (
              <div 
                className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 min-h-[80px] cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
                onClick={() => setIsEditingNotes(true)}
              >
                {project.notes ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{project.notes}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Haz clic para agregar notas...</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText size={20} className="text-blue-500" />
              Documentación
            </h4>
            <button 
              onClick={() => setShowUpload(true)}
              className="text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-all flex items-center gap-2"
            >
              <Upload size={16} /> Agregar Documento
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.documents.map(doc => (
              <a 
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition-all group shadow-sm flex flex-col gap-3"
              >
                {doc.type === 'image' && (
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                    <img 
                      src={doc.url} 
                      alt={doc.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    doc.type === 'image' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' :
                    doc.type === 'link' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                    'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  }`}>
                    {doc.type === 'image' ? <ImageIcon size={20} /> : doc.type === 'link' ? <LinkIcon size={20} /> : <FileText size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{doc.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{doc.date}</p>
                  </div>
                  <ExternalLink size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                </div>
              </a>
            ))}
            {project.documents.length === 0 && (
              <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-900/30 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                <p className="text-gray-400 dark:text-gray-600 text-sm">No hay documentos cargados aún.</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 transition-all">
            Cerrar
          </button>
        </div>
      </div>

      {showUpload && (
        <Modal isOpen={true} onClose={() => setShowUpload(false)} title="Cargar Documentación">
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Archivos e Imágenes</label>
              <input 
                type="file" 
                multiple 
                ref={fileInputRef}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Enlaces Externos</label>
              <div className="flex gap-2">
                <input 
                  placeholder="Nombre"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
                <input 
                  placeholder="URL (https://...)"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="flex-[2] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
                <button 
                  onClick={addLink}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {newLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 p-2 rounded-lg text-sm">
                    <div className="flex items-center gap-2 truncate">
                      <LinkIcon size={14} className="text-amber-500" />
                      <span className="font-bold">{link.name}</span>
                      <span className="text-gray-400 truncate">{link.url}</span>
                    </div>
                    <button onClick={() => removeLink(idx)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => setShowUpload(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                Cancelar
              </button>
              <button 
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {isUploading ? "Cargando..." : "Cargar Todo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
