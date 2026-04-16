import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Client, Device, Budget, Project } from "../types";
import { Users, Smartphone, Clock, ReceiptText, CheckCircle, AlertCircle, TrendingUp, Calendar, Folder } from "lucide-react";

import { DevicesList, DeviceFilterStatus } from "./DevicesList";

export function Dashboard({ 
  appMode,
  onNavigate, 
  onSelectDevice,
  onSelectProject,
  onSetDeviceFilter
}: { 
  appMode: "workshop" | "project",
  onNavigate: (tab: "clients" | "devices" | "report" | "tools" | "budgets" | "projects") => void,
  onSelectDevice: (deviceId: string) => void,
  onSelectProject: (projectId: string) => void,
  onSetDeviceFilter: (filter: DeviceFilterStatus) => void
}) {
  const [stats, setStats] = useState({
    totalClients: 0,
    totalDevices: 0,
    totalProjects: 0,
    pendingTickets: 0,
    pendingBudgets: 0,
    completedTicketsToday: 0
  });
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [devices, clients, budgets, projects] = await Promise.all([
          api.getDevices(),
          api.getClients(),
          api.getBudgets(),
          api.getProjects()
        ]);

        const filteredClients = clients.filter(c => 
          appMode === 'workshop' ? (c.type === 'workshop' || !c.type) : ((c.type as string) === 'project' || (c.type as string) === 'projects')
        );

        const filteredBudgets = budgets.filter(b => 
          appMode === 'workshop' ? (b.type !== 'project' && (b.type as string) !== 'projects') : (b.type === 'project' || (b.type as string) === 'projects')
        );

        const today = new Date().toISOString().split('T')[0];
        
        if (appMode === 'workshop') {
          const pendingTickets = devices.reduce((acc, dev) => 
            acc + (dev.tickets?.filter(t => !t.isCompleted).length || 0), 0
          );

          const completedToday = devices.reduce((acc, dev) => 
            acc + (dev.tickets?.filter(t => t.isCompleted && t.date === today).length || 0), 0
          );

          setStats({
            totalClients: filteredClients.length,
            totalDevices: devices.length,
            totalProjects: 0,
            pendingTickets,
            pendingBudgets: filteredBudgets.filter(b => b.status === 'pending').length,
            completedTicketsToday: completedToday
          });

          setRecentDevices(devices.slice(-5).reverse());
        } else {
          setStats({
            totalClients: filteredClients.length,
            totalDevices: 0,
            totalProjects: projects.length,
            pendingTickets: 0,
            pendingBudgets: filteredBudgets.filter(b => b.status === 'pending').length,
            completedTicketsToday: 0
          });

          setRecentProjects(projects.slice(-5).reverse());
        }
      } catch (err) {
        console.error("Error loading dashboard data", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [appMode]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-medium">Error al cargar el tablero</h3>
            <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-3 text-sm font-medium text-red-800 dark:text-red-200 hover:underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={<Users className="text-blue-600" size={20} />} 
          label="Clientes" 
          value={stats.totalClients} 
          onClick={() => onNavigate("clients")}
          color="blue"
        />
        {appMode === 'workshop' ? (
          <>
            <StatCard 
              icon={<Smartphone className="text-purple-600" size={20} />} 
              label="Equipos" 
              value={stats.totalDevices} 
              onClick={() => onNavigate("devices")}
              color="purple"
            />
            <StatCard 
              icon={<Clock className="text-yellow-600" size={20} />} 
              label="Pendientes" 
              value={stats.pendingTickets} 
              onClick={() => {
                onSetDeviceFilter('pending');
                onNavigate("devices");
              }}
              color="yellow"
            />
          </>
        ) : (
          <>
            <StatCard 
              icon={<Folder className="text-indigo-600" size={20} />} 
              label="Proyectos" 
              value={stats.totalProjects} 
              onClick={() => onNavigate("projects")}
              color="indigo"
            />
            <StatCard 
              icon={<Calendar className="text-amber-600" size={20} />} 
              label="Calendario" 
              value={0} 
              onClick={() => onNavigate("budgets")} // Placeholder for calendar navigation if needed
              color="amber"
            />
          </>
        )}
        <StatCard 
          icon={<ReceiptText className="text-green-600" size={20} />} 
          label="Presupuestos" 
          value={stats.pendingBudgets} 
          onClick={() => onNavigate("budgets")}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {appMode === 'workshop' ? (
          <>
            {/* Today's Summary */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500" />
                Resumen de Hoy
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-lg">
                      <CheckCircle size={18} />
                    </div>
                    <span className="text-sm font-medium">Trabajos Finalizados</span>
                  </div>
                  <span className="font-bold text-lg">{stats.completedTicketsToday}</span>
                </div>
                <button 
                  onClick={() => onNavigate("report")}
                  className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  Reporte Diario Completo &rarr;
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-purple-500" />
                Ingresos Recientes
              </h3>
              <div className="space-y-3">
                {recentDevices.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No hay ingresos recientes.</p>
                ) : (
                  recentDevices.map(device => (
                    <div 
                      key={device.id} 
                      className="flex items-center justify-between text-sm p-2 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg cursor-pointer transition-colors group"
                      onClick={() => onSelectDevice(device.id)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {device.brand} {device.model}
                        </span>
                        <span className="text-xs text-gray-500">{device.entryDate}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        device.deviceType === 'Celular' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {device.deviceType}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Recent Projects */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 col-span-full">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Folder size={18} className="text-indigo-500" />
                Proyectos Recientes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentProjects.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4 col-span-full">No hay proyectos recientes.</p>
                ) : (
                  recentProjects.map(project => (
                    <div 
                      key={project.id} 
                      className="flex items-center justify-between text-sm p-3 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer transition-colors group"
                      onClick={() => onSelectProject(project.id)}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {project.name}
                        </span>
                        <span className="text-xs text-gray-500">{project.startDate}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {project.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, onClick, color }: { icon: React.ReactNode, label: string, value: number, onClick: () => void, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: "hover:border-blue-300 bg-blue-50/30",
    purple: "hover:border-purple-300 bg-purple-50/30",
    yellow: "hover:border-yellow-300 bg-yellow-50/30",
    green: "hover:border-green-300 bg-green-50/30",
    indigo: "hover:border-indigo-300 bg-indigo-50/30",
    amber: "hover:border-amber-300 bg-amber-50/30",
  };

  return (
    <button 
      onClick={onClick}
      className={`p-4 rounded-2xl border border-gray-100 dark:border-gray-700 transition-all text-left group ${colorClasses[color] || ""}`}
    >
      <div className="mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
    </button>
  );
}
