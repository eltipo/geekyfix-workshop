import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Project, Client, ProjectDoc, Budget } from "../types";
import { Plus, Folder, FileText, Image as ImageIcon, Link as LinkIcon, Trash2, Edit2, ExternalLink, Calendar, User, Upload, X, CheckCircle2, Clock, AlertCircle, Camera, Maximize2, ReceiptText, ChevronRight, FileDown, History, List } from "lucide-react";
import { Modal } from "./Modal";
import { ServiceTasksList } from "./ServiceTasksList";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBase64ImageFromUrl } from "../lib/utils";

export function ProjectsList({ 
  clientId, 
  onNavigateToBudget,
  initialProjectId,
  onClose,
  onNavigateToClients
}: { 
  clientId?: string, 
  onNavigateToBudget?: (budgetId: string) => void,
  onNavigateToClients?: () => void,
  initialProjectId?: string,
  onClose?: () => void
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>(clientId || "all");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (clientId) {
      setClientFilter(clientId);
    } else {
      setClientFilter("all");
    }
  }, [clientId]);

  useEffect(() => {
    if (initialProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === initialProjectId);
      if (project) {
        setSelectedProject(project);
      }
    } else if (!initialProjectId) {
      setSelectedProject(null);
    }
  }, [initialProjectId, projects]);

  const loadData = async () => {
    const [p, c, b] = await Promise.all([api.getProjects(), api.getClients(), api.getBudgets()]);
    setProjects(p);
    setBudgets(b);
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

      <div className="flex gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="completed">Completado</option>
          <option value="on-hold">En espera</option>
        </select>
        
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
        >
          <option value="all">Todos los clientes</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.filter(p => {
          if (statusFilter !== "all" && p.status !== statusFilter) return false;
          if (clientFilter !== "all" && p.clientId !== clientFilter) return false;
          return true;
        }).map(project => {
          const client = clients.find(c => c.id === project.clientId);
          const projectBudgets = budgets.filter(b => b.projectId === project.id);
          const isApproved = projectBudgets.some(b => b.status === 'approved');

          return (
            <div 
              key={project.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all group cursor-pointer ${
                isApproved 
                  ? 'border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-900/10' 
                  : 'border-gray-100 dark:border-gray-700'
              }`}
              onClick={() => setSelectedProject(project)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${
                  isApproved 
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' 
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                }`}>
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
          onNavigateToClients={onNavigateToClients}
        />
      )}

      {selectedProject && (
        <ProjectDetail 
          project={selectedProject}
          client={clients.find(c => c.id === selectedProject.clientId)}
          budgets={budgets.filter(b => b.projectId === selectedProject.id)}
          onClose={() => {
            setSelectedProject(null);
            if (onClose) onClose();
          }}
          onUploadDocs={(files, links) => handleUploadDocs(selectedProject.id, files, links)}
          onUpdateProject={(data) => handleUpdateProject(selectedProject.id, data)}
          onNavigateToBudget={onNavigateToBudget}
          isUploading={isUploading}
        />
      )}
    </div>
  );
}

function ProjectForm({ clients, initialData, onSave, onCancel, onNavigateToClients }: { clients: Client[], initialData?: Project, onSave: (p: Partial<Project>) => void, onCancel: () => void, onNavigateToClients?: () => void }) {
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
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Cliente</label>
            {onNavigateToClients && (
              <button 
                type="button"
                onClick={onNavigateToClients}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800 transition-all"
              >
                + Nuevo Cliente
              </button>
            )}
          </div>
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
          {clients.length === 0 && (
            <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">No hay clientes de tipo 'Proyecto' registrados.</p>
          )}
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

function ProjectDetail({ project, client, budgets, onClose, onUploadDocs, onUpdateProject, onNavigateToBudget, isUploading }: { project: Project, client?: Client, budgets: Budget[], onClose: () => void, onUploadDocs: (files: FileList | null, links: { name: string, url: string }[]) => void, onUpdateProject: (data: Partial<Project>) => void, onNavigateToBudget?: (budgetId: string) => void, isUploading: boolean }) {
  const [showUpload, setShowUpload] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [newLinks, setNewLinks] = useState<{ name: string, url: string }[]>([]);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showNoteHistory, setShowNoteHistory] = useState(false);
  const [notes, setNotes] = useState(project.notes || "");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<ProjectDoc | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const [isAddingField, setIsAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");

  const handleSaveField = () => {
    if (!fieldKey.trim()) return;
    const currentFields = project.customFields || [];
    
    if (editingFieldId) {
      onUpdateProject({
        customFields: currentFields.map(f => f.id === editingFieldId ? { ...f, key: fieldKey, value: fieldValue } : f)
      });
      setEditingFieldId(null);
    } else {
      onUpdateProject({
        customFields: [...currentFields, { id: crypto.randomUUID(), key: fieldKey, value: fieldValue }]
      });
      setIsAddingField(false);
    }
    setFieldKey("");
    setFieldValue("");
  };

  const handleDeleteField = (id: string) => {
    if (confirm("¿Eliminar este campo personalizado?")) {
      onUpdateProject({
        customFields: (project.customFields || []).filter(f => f.id !== id)
      });
    }
  };

  const startEditingField = (field: {id: string, key: string, value: string}) => {
    setFieldKey(field.key);
    setFieldValue(field.value);
    setEditingFieldId(field.id);
    setIsAddingField(false);
  };

  const handleSaveNotes = () => {
    onUpdateProject({ notes });
    setIsEditingNotes(false);
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadDocs(e.target.files, []);
      setShowUpload(false);
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

  const handleDeleteDoc = (docId: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este documento?")) {
      const updatedDocs = project.documents.filter(d => d.id !== docId);
      onUpdateProject({ documents: updatedDocs });
    }
  };

  const startEditingDoc = (doc: ProjectDoc) => {
    setEditingDoc({ ...doc });
  };

  const handleUpdateDoc = () => {
    if (!editingDoc || !editingDoc.name.trim() || !editingDoc.url.trim()) return;
    const updatedDocs = project.documents.map(d => 
      d.id === editingDoc.id ? editingDoc : d
    );
    onUpdateProject({ documents: updatedDocs });
    setEditingDoc(null);
  };

  const handleExportProject = async () => {
    setIsExporting(true);
    try {
      const tasks = await api.getServiceTasks();
      const projectTasks = tasks.filter(t => t.projectId === project.id);
      
      const doc = new jsPDF();
      let yPos = 20;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235); // blue-600
      doc.text("Resumen de Proyecto", 20, yPos);
      yPos += 15;

      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(project.name, 20, yPos);
      yPos += 10;

      // Basic Info Table
      autoTable(doc, {
        startY: yPos,
        head: [['Detalle', 'Información']],
        body: [
          ['Cliente', client ? `${client.firstName} ${client.lastName}` : 'N/A'],
          ['Fecha Inicio', project.startDate],
          ['Estado', project.status.toUpperCase()],
          ['Descripción', project.description || 'Sin descripción'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] }
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Notes
      if (project.notes) {
        doc.setFontSize(14);
        doc.text("Notas del Proyecto", 20, yPos);
        yPos += 7;
        doc.setFontSize(10);
        const splitNotes = doc.splitTextToSize(project.notes, 170);
        doc.text(splitNotes, 20, yPos);
        yPos += (splitNotes.length * 5) + 10;
      }

      // Budgets
      if (budgets.length > 0) {
        doc.setFontSize(14);
        doc.text("Presupuestos", 20, yPos);
        yPos += 5;
        autoTable(doc, {
          startY: yPos,
          head: [['ID', 'Fecha', 'Monto', 'Estado']],
          body: budgets.map(b => [
            b.id.substring(0, 8),
            b.date,
            `$${b.total.toLocaleString()}`,
            b.status === 'approved' ? 'Aprobado' : b.status === 'rejected' ? 'Rechazado' : 'Pendiente'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [147, 51, 234] } // purple-600
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Tasks
      if (projectTasks.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.text("Tareas y Servicios", 20, yPos);
        yPos += 5;
        autoTable(doc, {
          startY: yPos,
          head: [['Fecha', 'Descripción', 'Duración', 'Monto', 'Estado']],
          body: projectTasks.map(t => [
            t.date,
            t.description,
            t.duration,
            `$${t.amount.toLocaleString()}`,
            t.isCompleted ? 'Completada' : 'Pendiente'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [5, 150, 105] } // emerald-600
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Documentation (Links & Files)
      const otherDocs = project.documents.filter(d => d.type !== 'image');
      if (otherDocs.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.text("Documentación y Enlaces", 20, yPos);
        yPos += 5;
        autoTable(doc, {
          startY: yPos,
          head: [['Nombre', 'Tipo', 'Fecha', 'Enlace/Referencia']],
          body: otherDocs.map(d => [
            d.name,
            d.type === 'link' ? 'Enlace' : 'Archivo',
            d.date,
            'Link'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [75, 85, 99] }, // gray-600
          columnStyles: {
            0: { cellWidth: 42.5 },
            1: { cellWidth: 42.5 },
            2: { cellWidth: 42.5 },
            3: { cellWidth: 42.5, textColor: [37, 99, 235], fontStyle: 'bold' }
          },
          didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
              const docItem = otherDocs[data.row.index];
              const url = docItem.url.startsWith('http') ? docItem.url : `https://${docItem.url}`;
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Documentation & Images
      const images = project.documents.filter(d => d.type === 'image');
      if (images.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.text("Documentación Fotográfica", 20, yPos);
        yPos += 10;

        for (const img of images) {
          try {
            if (yPos > 200) { doc.addPage(); yPos = 20; }
            const base64 = await getBase64ImageFromUrl(img.url);
            // Simple placeholder for image positioning - center and fixed width
            doc.addImage(base64, 'JPEG', 20, yPos, 170, 95);
            yPos += 100;
            doc.setFontSize(8);
            doc.text(`${img.name} - ${img.date}`, 20, yPos);
            yPos += 15;
          } catch (e) {
            console.warn("Could not add image to PDF", e);
          }
        }
      }

      doc.save(`Proyecto_${project.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error("Error exporting project", error);
      alert("Error al exportar el proyecto. Por favor intenta de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={project.name} maxWidth="max-w-4xl">
      <div className="flex flex-col h-[85vh]">
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="flex justify-between items-start">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 dark:text-gray-100">{client ? `${client.firstName} ${client.lastName}` : "N/A"}</p>
                    </div>
                  </div>
                </div>
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
              
              <button 
                onClick={handleExportProject}
                disabled={isExporting}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-green-600/20 text-green-700 dark:text-green-400 font-bold text-xs hover:bg-green-50 dark:hover:bg-green-900/20 transition-all ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isExporting ? (
                  <Clock size={16} className="animate-spin" />
                ) : (
                  <FileDown size={16} />
                )}
                {isExporting ? 'Exportando...' : 'Exportar Informe'}
              </button>
            </div>
          {project.description && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{project.description}</p>
            </div>
          )}
          
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
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
                <>
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
                  {project.noteHistory && project.noteHistory.length > 0 && (
                    <div className="mt-3">
                      <button 
                        onClick={() => setShowNoteHistory(!showNoteHistory)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                      >
                        <History size={14} />
                        {showNoteHistory ? "Ocultar historial" : "Ver historial de cambios"}
                      </button>
                      
                      {showNoteHistory && (
                        <div className="mt-3 space-y-3 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                          {project.noteHistory.slice().reverse().map((h, i) => (
                            <div key={i} className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg text-sm">
                              <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-200 dark:border-gray-700">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{h.author}</span>
                                <span className="text-xs text-gray-500">{new Date(h.date).toLocaleString('es-AR')}</span>
                              </div>
                              <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{h.notes}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                <ReceiptText size={18} className="text-gray-400" />
                Presupuestos
              </h4>
              <div className="space-y-2">
                {budgets.map(budget => (
                  <button
                    key={budget.id}
                    onClick={() => onNavigateToBudget?.(budget.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all group ${
                      budget.status === 'approved' 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 hover:border-green-300' 
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">#{budget.id.substring(0, 8)}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                          budget.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                          budget.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                        }`}>
                          {budget.status === 'approved' ? 'Aprobado' : budget.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1">${budget.total.toLocaleString()}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </button>
                ))}
                {budgets.length === 0 && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 text-center">
                    <p className="text-xs text-gray-400">No hay presupuestos asociados.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
          
        <div className="p-4 pt-0 space-y-4">
            {/* Custom Fields Section */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <List size={18} className="text-gray-400" />
                  Campos Personalizados
                </h4>
                <button
                  onClick={() => setIsAddingField(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                >
                  <Plus size={14} /> Agregar Campo
                </button>
              </div>

              <div className="space-y-3">
                {(project.customFields || []).map(field => (
                  <div key={field.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg group border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                    {editingFieldId === field.id ? (
                      <div className="w-full flex flex-col sm:flex-row gap-2">
                        <input
                          value={fieldKey}
                          onChange={(e) => setFieldKey(e.target.value)}
                          placeholder="Nombre del campo (ej. SO)"
                          className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <input
                          value={fieldValue}
                          onChange={(e) => setFieldValue(e.target.value)}
                          placeholder="Valor"
                          className="flex-[2] px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <div className="flex gap-2 justify-end sm:justify-start">
                          <button onClick={handleSaveField} className="text-blue-600 hover:text-blue-700 font-medium text-xs px-2">Guardar</button>
                          <button onClick={() => setEditingFieldId(null)} className="text-gray-500 hover:text-gray-700 font-medium text-xs px-2">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1 min-w-0">
                          <span className="text-xs font-bold text-gray-500 w-32 break-words">{field.key}:</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 break-words">{field.value}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end mt-2 sm:mt-0">
                          <button onClick={() => startEditingField(field)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteField(field.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {isAddingField && (
                  <div className="flex flex-col sm:flex-row gap-2 p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                    <input
                      value={fieldKey}
                      onChange={(e) => setFieldKey(e.target.value)}
                      placeholder="Nombre del campo"
                      className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                    <input
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      placeholder="Valor del campo"
                      className="flex-[2] px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <div className="flex gap-2 justify-end sm:justify-start">
                      <button onClick={handleSaveField} disabled={!fieldKey.trim()} className="text-blue-600 hover:text-blue-700 font-medium text-xs px-2 disabled:opacity-50">Guardar</button>
                      <button onClick={() => { setIsAddingField(false); setFieldKey(""); setFieldValue(""); }} className="text-gray-500 hover:text-gray-700 font-medium text-xs px-2">Cancelar</button>
                    </div>
                  </div>
                )}
                
                {(!project.customFields || project.customFields.length === 0) && !isAddingField && (
                  <p className="text-sm text-gray-400 italic">No hay campos personalizados.</p>
                )}
              </div>
            </div>

            <div>
              <ServiceTasksList projectId={project.id} clientId={project.clientId} />
            </div>

          <div>
            <div className="flex justify-between items-center mb-3">
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
              {project.documents.map(doc => {
              const isImage = doc.type === 'image';
              const Content = (
                <div className="flex flex-col gap-3 h-full">
                  {isImage && (
                    <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900 relative group/img">
                      <img 
                        src={doc.url} 
                        alt={doc.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 size={24} className="text-white" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isImage ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' :
                      doc.type === 'link' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                      'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                    }`}>
                      {isImage ? <ImageIcon size={20} /> : doc.type === 'link' ? <LinkIcon size={20} /> : <FileDown size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{doc.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{doc.date}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => startEditingDoc(doc)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Editar nombre"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50 dark:border-gray-800 mt-auto">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      {isImage ? 'Visualizar imagen' : doc.type === 'link' ? 'Abrir enlace' : 'Descargar archivo'}
                    </span>
                    <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
              );

              const handleClick = () => {
                if (isImage) {
                  setSelectedImage(doc.url);
                } else {
                  window.open(doc.url, '_blank', 'noreferrer');
                }
              };

              return (
                <div 
                  key={doc.id}
                  onClick={handleClick}
                  className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition-all group shadow-sm text-left w-full cursor-pointer flex flex-col gap-3"
                >
                  {Content}
                </div>
              );
            })}
            {project.documents.length === 0 && (
              <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-900/30 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                <p className="text-gray-400 dark:text-gray-600 text-sm">No hay documentos cargados aún.</p>
              </div>
            )}
          </div>
        </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-4 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-2xl hover:bg-purple-100 transition-all border border-purple-100 dark:border-purple-800 font-bold"
              >
                <Camera size={24} />
                <span>Tomar Foto</span>
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-800 font-bold"
              >
                <Upload size={24} />
                <span>Subir Archivo</span>
              </button>
            </div>

            <div className="hidden">
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={cameraInputRef}
                onChange={handleCameraCapture}
              />
              <input 
                type="file" 
                multiple 
                accept="*/*"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadDocs(e.target.files, []);
                    setShowUpload(false);
                  }
                }}
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
      {editingDoc && (
      <Modal isOpen={true} onClose={() => setEditingDoc(null)} title="Editar Documento">
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre del Documento</label>
              <input 
                type="text"
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                value={editingDoc.name}
                onChange={e => setEditingDoc({ ...editingDoc, name: e.target.value })}
                placeholder="Ej: Plano de Instalación"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo</label>
              <select 
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                value={editingDoc.type}
                onChange={e => setEditingDoc({ ...editingDoc, type: e.target.value as any })}
              >
                <option value="file">Archivo</option>
                <option value="image">Imagen</option>
                <option value="link">Enlace / Link</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">URL / Ruta</label>
              <input 
                type="text"
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                value={editingDoc.url}
                onChange={e => setEditingDoc({ ...editingDoc, url: e.target.value })}
                placeholder="https://..."
              />
              <p className="text-[10px] text-gray-400">Nota: Al cambiar la URL de un archivo local, este podría dejar de ser accesible si la ruta no es correcta.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setEditingDoc(null)}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleUpdateDoc}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      </Modal>
    )}
    {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white/70 hover:text-white p-2 bg-white/10 rounded-full transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            <X size={32} />
          </button>
          <img 
            src={selectedImage} 
            alt="Vista previa" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Modal>
  );
}
