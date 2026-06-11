import React, { useState, useEffect } from "react";
import { api } from "../api";
import { Device, Ticket, Project } from "../types";
import { ChevronLeft, ChevronRight, Monitor, CheckCircle2, X, Briefcase, ChevronRight as ChevronRightIcon, Clock } from "lucide-react";
import { Modal } from "./Modal";

export function CalendarView({ 
  appMode,
  onNavigateToDevice,
  onNavigateToProject
}: { 
  appMode: "workshop" | "project",
  onNavigateToDevice?: (deviceId: string) => void,
  onNavigateToProject?: (projectId: string) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [devices, setDevices] = useState<Device[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<{ device: Device, ticket: Ticket }[]>([]);
  const [selectedDay, setSelectedDay] = useState<{ day: number, events: any } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [devs, projs] = await Promise.all([api.getDevices(), api.getProjects()]);
      setDevices(devs);
      setProjects(projs);
      
      const allTickets: { device: Device, ticket: Ticket }[] = [];
      devs.forEach(d => {
        if (d.tickets) {
          d.tickets.forEach(t => {
            if (t.isCompleted) {
              allTickets.push({ device: d, ticket: t });
            }
          });
        }
      });
      setTickets(allTickets);
    };
    loadData();
  }, []);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (appMode === 'project') {
      return {
        projects: projects.filter(p => p.startDate && p.startDate.startsWith(dateStr)),
        deadlines: projects.filter(p => p.deadline && p.deadline.startsWith(dateStr))
      };
    }

    return {
      entered: devices.filter(d => d.entryDate && d.entryDate.startsWith(dateStr)),
      completed: tickets.filter(t => t.ticket.date.startsWith(dateStr))
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Calendario</h2>
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
          {dayNames.map(day => (
            <div key={day} className="py-3 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="min-h-[100px] border-b border-r border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50"></div>;
            }

            const events = getEventsForDay(day);
            const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

            return (
              <div 
                key={day} 
                onClick={() => setSelectedDay({ day, events })}
                className={`min-h-[100px] p-2 border-b border-r border-gray-100 dark:border-gray-700 transition-colors cursor-pointer ${isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-750'}`}
              >
                <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {appMode === 'workshop' ? (
                    <>
                      {events.entered?.length > 0 && (
                        <div className="text-[10px] flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                          <Monitor size={10} />
                          <span className="truncate">{events.entered.length} Ingresos</span>
                        </div>
                      )}
                      {events.completed?.length > 0 && (
                        <div className="text-[10px] flex items-center gap-1 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                          <CheckCircle2 size={10} />
                          <span className="truncate">{events.completed.length} Completados</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {events.projects?.length > 0 && (
                        <div className="text-[10px] flex items-center gap-1 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                          <Briefcase size={10} />
                          <span className="truncate">{events.projects.length} Inician</span>
                        </div>
                      )}
                      {events.deadlines?.length > 0 && (
                        <div className="text-[10px] flex items-center gap-1 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
                          <Clock size={10} />
                          <span className="truncate">{events.deadlines.length} Entrega</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={`Detalles del ${selectedDay?.day} de ${monthNames[month]} ${year}`}
      >
        {selectedDay && (
          <div className="space-y-6">
            {appMode === 'workshop' ? (
              <>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <Monitor size={20} className="text-blue-500" />
                    Equipos Ingresados ({selectedDay.events.entered?.length || 0})
                  </h3>
                  {selectedDay.events.entered?.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedDay.events.entered.map((d: Device) => (
                        <li 
                          key={d.id} 
                          onClick={() => {
                            if (onNavigateToDevice) {
                              onNavigateToDevice(d.id);
                              setSelectedDay(null);
                            }
                          }}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{d.brand} {d.model}</div>
                            <ChevronRightIcon size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{d.problem}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay ingresos este día.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={20} className="text-green-500" />
                    Tickets Completados ({selectedDay.events.completed?.length || 0})
                  </h3>
                  {selectedDay.events.completed?.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedDay.events.completed.map((item: { device: Device, ticket: Ticket }) => (
                        <li 
                          key={item.ticket.id} 
                          onClick={() => {
                            if (onNavigateToDevice) {
                              onNavigateToDevice(item.device.id);
                              setSelectedDay(null);
                            }
                          }}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-green-300 dark:hover:border-green-700 transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{item.device.brand} {item.device.model}</div>
                            <ChevronRightIcon size={16} className="text-gray-400 group-hover:text-green-500 transition-colors" />
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.ticket.description}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay tickets completados este día.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <Briefcase size={20} className="text-indigo-500" />
                    Proyectos Iniciados ({selectedDay.events.projects?.length || 0})
                  </h3>
                  {selectedDay.events.projects?.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedDay.events.projects.map((p: Project) => (
                        <li 
                          key={p.id} 
                          onClick={() => {
                            if (onNavigateToProject) {
                              onNavigateToProject(p.id);
                              setSelectedDay(null);
                            }
                          }}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.name}</div>
                            <ChevronRightIcon size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{p.description}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay proyectos iniciando este día.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <Clock size={20} className="text-red-500" />
                    Entregas / Deadlines ({selectedDay.events.deadlines?.length || 0})
                  </h3>
                  {selectedDay.events.deadlines?.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedDay.events.deadlines.map((p: Project) => (
                        <li 
                          key={p.id} 
                          onClick={() => {
                            if (onNavigateToProject) {
                              onNavigateToProject(p.id);
                              setSelectedDay(null);
                            }
                          }}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-red-300 dark:hover:border-red-700 transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">{p.name}</div>
                            <ChevronRightIcon size={16} className="text-gray-400 group-hover:text-red-500 transition-colors" />
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Fecha límite de entrega</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay entregas programadas este día.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
