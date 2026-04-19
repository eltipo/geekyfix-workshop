import { useState, useEffect } from "react";
import { ClientsList } from "./components/ClientsList";
import { DevicesList, DeviceFilterStatus } from "./components/DevicesList";
import { DailyReport } from "./components/DailyReport";
import { ToolsList } from "./components/ToolsList";
import { Users, Smartphone, FileText, Wrench, Download, Moon, Sun, ReceiptText, Home, ChevronDown, ChevronUp, LayoutGrid, Settings as SettingsIcon } from "lucide-react";
import { BudgetsList } from "./components/BudgetsList";
import { Dashboard } from "./components/Dashboard";
import { Settings } from "./components/Settings";
import { CalendarView } from "./components/CalendarView";
import { ServiceTasksList } from "./components/ServiceTasksList";
import { ProjectsList } from "./components/ProjectsList";
import { Calendar as CalendarIcon, ClipboardList, Folder } from "lucide-react";

export default function App() {
  const [appMode, setAppMode] = useState<"workshop" | "project">(() => {
    return (localStorage.getItem('appMode') as "workshop" | "project") || "workshop";
  });
  const [currentTab, setCurrentTab] = useState<"home" | "clients" | "devices" | "report" | "tools" | "budgets" | "settings" | "calendar" | "tasks" | "projects">("home");
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | undefined>();
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilterStatus>(() => {
    return (localStorage.getItem('deviceFilter') as DeviceFilterStatus) || 'all';
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  
  // Detect if mobile for default footer state
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  const [showFooter, setShowFooter] = useState(!isMobile);

  // Synchronize state with URL hash for better browser history behavior (fixes mobile back button)
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      
      // Default values
      let newTab: any = "home";
      let newClientId: string | undefined = undefined;
      let newDeviceId: string | undefined = undefined;
      let newProjectId: string | undefined = undefined;
      let newBudgetId: string | undefined = undefined;

      if (hash) {
        const parts = hash.split('/');
        const tab = parts[0] as any;
        const id = parts[1];

        const validTabs = ["home", "clients", "devices", "report", "tools", "budgets", "settings", "calendar", "tasks", "projects"];
        if (validTabs.includes(tab)) {
          newTab = tab;
          if (tab === "clients") {
            newClientId = id;
          } else if (tab === "devices") {
            if (parts[1] === 'client' && parts[2]) {
              newClientId = parts[2];
            } else {
              newDeviceId = id;
            }
          } else if (tab === "projects") {
            newProjectId = id;
          } else if (tab === "budgets") {
            newBudgetId = id;
          }
        }
      }

      setCurrentTab(newTab);
      setSelectedClientId(newClientId);
      setSelectedDeviceId(newDeviceId);
      setSelectedProjectId(newProjectId);
      setSelectedBudgetId(newBudgetId);
    };

    window.addEventListener('popstate', handlePopState);
    handlePopState(); // Execute on mount

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let hash = `#${currentTab}`;
    if (currentTab === "clients" && selectedClientId) hash += `/${selectedClientId}`;
    if (currentTab === "devices") {
       if (selectedDeviceId) hash += `/${selectedDeviceId}`;
       else if (selectedClientId) hash += `/client/${selectedClientId}`;
    }
    if (currentTab === "projects" && selectedProjectId) hash += `/${selectedProjectId}`;
    if (currentTab === "budgets" && selectedBudgetId) hash += `/${selectedBudgetId}`;

    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
  }, [currentTab, selectedClientId, selectedDeviceId, selectedProjectId, selectedBudgetId]);

  useEffect(() => {
    localStorage.setItem('appMode', appMode);
  }, [appMode]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      // If switching to tablet/PC, ensure footer is shown
      if (!mobile) {
        setShowFooter(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('deviceFilter', deviceFilter);
  }, [deviceFilter]);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
        (!('darkMode' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (currentTab !== "clients") {
      setClientFormOpen(false);
    }
  }, [currentTab]);

  const handleSelectClient = (id: string) => {
    setSelectedClientId(id);
    setCurrentTab(appMode === 'project' ? "projects" : "devices");
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col font-sans transition-colors duration-200 text-sm sm:text-base overflow-hidden">
      {/* Header */}
      <header className="bg-blue-600 dark:bg-gray-800 text-white p-2 sm:p-4 shadow-md z-10 border-b border-transparent dark:border-gray-700 transition-colors duration-200 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div 
            className="flex items-center gap-2 cursor-pointer shrink-0"
            onClick={() => { setCurrentTab("home"); setSelectedClientId(undefined); }}
          >
            <img 
              src="/data/logo.png" 
              alt="GeekyFix Logo" 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'block';
              }} 
            />
            <div style={{ display: 'none' }}>
              <Wrench size={20} />
            </div>
            <h1 className="hidden sm:block text-lg sm:text-xl font-bold tracking-tight">
              {appMode === "workshop" ? "GeekyFix Workshop" : "GeekyFix Projects"}
            </h1>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Mode Switcher */}
            <div className="flex bg-white/10 p-1 rounded-xl mr-2">
              <button 
                onClick={() => { setAppMode("workshop"); setCurrentTab("home"); }}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${appMode === "workshop" ? "bg-white text-blue-600 shadow-sm" : "text-white/70 hover:text-white"}`}
              >
                Workshop
              </button>
              <button 
                onClick={() => { setAppMode("project"); setCurrentTab("home"); }}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${appMode === "project" ? "bg-white text-blue-600 shadow-sm" : "text-white/70 hover:text-white"}`}
              >
                Projects
              </button>
            </div>

            <button 
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className={`p-2 rounded-lg transition-all relative group shrink-0 ${isDrawerOpen ? "bg-white/20 text-white" : "text-blue-100 hover:bg-white/10"}`}
              title="Menú de Aplicaciones"
            >
              <LayoutGrid size={22} className="sm:w-6 sm:h-6" />
            </button>

            <div className="h-6 w-px bg-white/20 mx-1"></div>

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* App Drawer Overlay */}
        {isDrawerOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsDrawerOpen(false)}
          />
        )}

        {/* App Drawer Content */}
        <div className={`fixed top-[52px] sm:top-[64px] left-0 right-0 bg-blue-600 dark:bg-gray-800 shadow-2xl z-50 border-b border-blue-500 dark:border-gray-700 transition-all duration-300 transform ${isDrawerOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"}`}>
          <div className="max-w-3xl mx-auto p-4 sm:p-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 sm:gap-6">
              <DrawerItem 
                icon={<Home size={24} />} 
                label="Inicio" 
                active={currentTab === "home"} 
                onClick={() => { setCurrentTab("home"); setSelectedClientId(undefined); setIsDrawerOpen(false); }} 
              />
              <DrawerItem 
                icon={<Users size={24} />} 
                label="Clientes" 
                active={currentTab === "clients"} 
                onClick={() => { setCurrentTab("clients"); setSelectedClientId(undefined); setIsDrawerOpen(false); }} 
              />
              
              {appMode === "workshop" && (
                <>
                  <DrawerItem 
                    icon={<Smartphone size={24} />} 
                    label="Equipos" 
                    active={currentTab === "devices"} 
                    onClick={() => { setCurrentTab("devices"); setSelectedClientId(undefined); setIsDrawerOpen(false); }} 
                  />
                  <DrawerItem 
                    icon={<ClipboardList size={24} />} 
                    label="Tareas" 
                    active={currentTab === "tasks"} 
                    onClick={() => { setCurrentTab("tasks"); setSelectedClientId(undefined); setIsDrawerOpen(false); }} 
                  />
                  <DrawerItem 
                    icon={<FileText size={24} />} 
                    label="Reporte" 
                    active={currentTab === "report"} 
                    onClick={() => { setCurrentTab("report"); setIsDrawerOpen(false); }} 
                  />
                  <DrawerItem 
                    icon={<Download size={24} />} 
                    label="Herramientas" 
                    active={currentTab === "tools"} 
                    onClick={() => { setCurrentTab("tools"); setIsDrawerOpen(false); }} 
                  />
                </>
              )}

              {appMode === "project" && (
                <DrawerItem 
                  icon={<Folder size={24} />} 
                  label="Proyectos" 
                  active={currentTab === "projects"} 
                  onClick={() => { setCurrentTab("projects"); setSelectedClientId(undefined); setSelectedProjectId(undefined); setIsDrawerOpen(false); }} 
                />
              )}

              <DrawerItem 
                icon={<ReceiptText size={24} />} 
                label="Presupuestos" 
                active={currentTab === "budgets"} 
                onClick={() => { setCurrentTab("budgets"); setIsDrawerOpen(false); }} 
              />
              <DrawerItem 
                icon={<CalendarIcon size={24} />} 
                label="Calendario" 
                active={currentTab === "calendar"} 
                onClick={() => { setCurrentTab("calendar"); setIsDrawerOpen(false); }} 
              />
              <DrawerItem 
                icon={<SettingsIcon size={24} />} 
                label="Configuración" 
                active={currentTab === "settings"} 
                onClick={() => { setCurrentTab("settings"); setIsDrawerOpen(false); }} 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-smooth relative scrollbar-hide">
        <div className={`w-full max-w-3xl mx-auto p-3 sm:p-4 ${showFooter ? 'pb-32' : 'pb-10'} text-gray-900 dark:text-gray-100 transition-all duration-300`}>
          {currentTab === "home" && (
            <Dashboard 
              appMode={appMode}
              onNavigate={(tab) => {
                if (tab === "projects") setSelectedProjectId(undefined);
                setCurrentTab(tab as any);
              }} 
              onSelectDevice={(id) => { setSelectedDeviceId(id); setCurrentTab("devices"); }}
              onSelectProject={(id) => { setSelectedProjectId(id); setCurrentTab("projects"); }}
              onSetDeviceFilter={setDeviceFilter}
            />
          )}
          {currentTab === "clients" && (
            <ClientsList 
              appMode={appMode}
              onSelectClient={handleSelectClient} 
              onSelectClientTasks={(id) => { setSelectedClientId(id); setCurrentTab("tasks"); }}
              initialClientId={selectedClientId}
              setCurrentTab={setCurrentTab}
              setSelectedBudgetId={setSelectedBudgetId}
              initialShowForm={clientFormOpen}
            />
          )}
          {currentTab === "devices" && (
            <div>
              {(selectedClientId || selectedDeviceId) && (
                <button
                  onClick={() => {
                    setSelectedClientId(undefined);
                    setSelectedDeviceId(undefined);
                  }}
                  className="mb-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  &larr; Todos los equipos
                </button>
              )}
              <DevicesList 
                clientId={selectedClientId} 
                initialDeviceId={selectedDeviceId} 
                initialFilter={deviceFilter}
                onFilterChange={(f) => setDeviceFilter(f)}
                onNavigateToClient={(id) => {
                  setSelectedClientId(id);
                  setCurrentTab("clients");
                }}
                onNavigateToBudget={(id) => {
                  setSelectedDeviceId(id);
                  setCurrentTab("budgets");
                }}
              />
            </div>
          )}
          {currentTab === "report" && <DailyReport />}
          {currentTab === "tools" && <ToolsList />}
          {currentTab === "budgets" && <BudgetsList appMode={appMode} initialDeviceId={selectedDeviceId} initialBudgetId={selectedBudgetId} />}
          {currentTab === "settings" && <Settings />}
          {currentTab === "calendar" && (
            <CalendarView 
              appMode={appMode}
              onNavigateToDevice={(deviceId) => {
                setSelectedDeviceId(deviceId);
                setCurrentTab("devices");
              }}
              onNavigateToProject={(projectId) => {
                // We don't have a way to select a specific project in ProjectsList yet, 
                // but we can at least switch to the projects tab.
                setCurrentTab("projects");
              }}
            />
          )}
          {currentTab === "tasks" && (
            <div>
              {selectedClientId && (
                <button
                  onClick={() => setSelectedClientId(undefined)}
                  className="mb-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  &larr; Todas las tareas
                </button>
              )}
              <ServiceTasksList clientId={selectedClientId} />
            </div>
          )}
          {currentTab === "projects" && (
            <ProjectsList 
              clientId={selectedClientId} 
              initialProjectId={selectedProjectId}
              onClose={() => setSelectedProjectId(undefined)}
              onNavigateToBudget={(budgetId) => {
                setSelectedBudgetId(budgetId);
                setCurrentTab("budgets");
              }}
              onNavigateToClients={() => {
                setClientFormOpen(true);
                setCurrentTab("clients");
                setSelectedClientId(undefined);
              }}
            />
          )}
        </div>

        {/* Toggle Footer Button */}
        <button 
          onClick={() => setShowFooter(!showFooter)}
          className={`fixed bottom-4 right-4 z-50 p-2 rounded-full shadow-lg transition-all duration-300 ${
            showFooter 
              ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" 
              : "bg-blue-600 text-white hover:bg-blue-700 animate-pulse"
          }`}
          title={showFooter ? "Ocultar menú" : "Mostrar menú"}
        >
          {showFooter ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </main>

      {/* Bottom Navigation (Mobile First) */}
      <nav className={`bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 w-full pb-safe transition-all duration-300 shrink-0 overflow-hidden ${
        showFooter ? "max-h-20 opacity-100" : "max-h-0 opacity-0 border-none"
      }`}>
        <div className="max-w-md mx-auto flex justify-center gap-1 sm:gap-4 items-center px-2">
          <button
            onClick={() => { setCurrentTab("home"); setSelectedClientId(undefined); }}
            className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "home" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
          >
            <Home size={18} />
            <span className="text-[8px] mt-0.5 font-medium truncate text-center">Inicio</span>
          </button>
          <button
            onClick={() => { setCurrentTab("clients"); setSelectedClientId(undefined); }}
            className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "clients" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
          >
            <Users size={18} />
            <span className="text-[8px] mt-0.5 font-medium truncate text-center">Clientes</span>
          </button>
          
          {appMode === "workshop" ? (
            <>
              <button
                onClick={() => { setCurrentTab("devices"); setSelectedClientId(undefined); }}
                className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "devices" && !selectedClientId ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <Smartphone size={18} />
                <span className="text-[8px] mt-0.5 font-medium truncate text-center">Equipos</span>
              </button>
              <button
                onClick={() => setCurrentTab("tasks")}
                className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "tasks" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <ClipboardList size={18} />
                <span className="text-[8px] mt-0.5 font-medium truncate text-center">Tareas</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setCurrentTab("projects"); setSelectedClientId(undefined); }}
                className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "projects" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <Folder size={18} />
                <span className="text-[8px] mt-0.5 font-medium truncate text-center">Proyec.</span>
              </button>
              <button
                onClick={() => setCurrentTab("tasks")}
                className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "tasks" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <ClipboardList size={18} />
                <span className="text-[8px] mt-0.5 font-medium truncate text-center">Tareas</span>
              </button>
              <button
                onClick={() => setCurrentTab("budgets")}
                className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "budgets" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <ReceiptText size={18} />
                <span className="text-[8px] mt-0.5 font-medium truncate text-center">Presup.</span>
              </button>
            </>
          )}

          <button
            onClick={() => setCurrentTab("calendar")}
            className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "calendar" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
          >
            <CalendarIcon size={18} />
            <span className="text-[8px] mt-0.5 font-medium truncate text-center">Calend.</span>
          </button>
          
          <button
            onClick={() => setCurrentTab("settings")}
            className={`flex flex-col items-center justify-center p-2 min-w-[64px] ${currentTab === "settings" ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
          >
            <SettingsIcon size={18} />
            <span className="text-[8px] mt-0.5 font-medium truncate text-center">Config.</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function DrawerItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95 ${active ? "bg-white/20 text-white shadow-inner" : "text-blue-100 hover:bg-white/10"}`}
    >
      <div className="mb-2">{icon}</div>
      <span className="text-xs font-bold text-center">{label}</span>
    </button>
  );
}
