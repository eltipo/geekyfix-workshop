import { useState, useEffect } from "react";
import { api } from "../api";
import { Device, Client } from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Smartphone, FileDown, ReceiptText, TrendingUp, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBase64ImageFromUrl } from "../lib/utils";
import { Modal } from "./Modal";

export function DailyReport() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeModal, setActiveModal] = useState<'devices' | 'tickets' | 'revenue' | null>(null);

  useEffect(() => {
    Promise.all([api.getDevices(), api.getClients()]).then(([devs, clis]) => {
      setDevices(devs);
      const clientMap = clis.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      setClients(clientMap);
    });
  }, []);

  const dailyDevices = devices.filter((d) => d.entryDate === selectedDate);
  
  const dailyTickets = devices.flatMap(d => (d.tickets || []).map(t => ({ ...t, device: d })))
    .filter(t => t.date === selectedDate && t.isCompleted);

  const totalRevenue = dailyTickets.reduce((sum, t) => {
    const itemsTotal = (t.resolutionItems || []).reduce((s, item) => s + item.amount, 0);
    return sum + itemsTotal;
  }, 0);

  const generatePDF = async () => {
    const doc = new jsPDF();
    
    // Add Logo
    try {
      const logoBase64 = await getBase64ImageFromUrl("/data/logo.png");
      doc.addImage(logoBase64, "PNG", 20, 10, 15, 15);
    } catch (error) {
      console.warn("Could not load logo for PDF", error);
    }
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text("GeekyFix Workshop", 105, 20, { align: "center" });
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("REPORTE DIARIO", 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Fecha del reporte: ${selectedDate}`, 150, 45);
    
    // Summary
    doc.setFontSize(12);
    doc.text("RESUMEN:", 20, 50);
    doc.setFontSize(10);
    doc.text(`Equipos Ingresados: ${dailyDevices.length}`, 20, 57);
    doc.text(`Tickets Completados: ${dailyTickets.length}`, 20, 62);
    doc.text(`Recaudación Total: $${totalRevenue.toLocaleString()}`, 20, 67);
    
    // Table - Entries
    doc.setFontSize(12);
    doc.text("INGRESOS DEL DÍA:", 20, 80);
    
    const entryData = dailyDevices.map(d => {
      const client = clients[d.clientId];
      return [
        `${d.brand} ${d.model}`,
        client ? `${client.firstName} ${client.lastName}` : "N/A",
        d.problem || "N/A"
      ];
    });
    
    autoTable(doc, {
      startY: 85,
      head: [["Equipo", "Cliente", "Problema"]],
      body: entryData,
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] }
    });
    
    // Table - Completed
    const finalY = (doc as any).lastAutoTable.finalY || 120;
    doc.setFontSize(12);
    doc.text("TRABAJOS FINALIZADOS:", 20, finalY + 15);
    
    const completedData = dailyTickets.map(t => {
      const ticketTotal = (t.resolutionItems || []).reduce((s, item) => s + item.amount, 0);
      return [
        `${t.device.brand} ${t.device.model}`,
        t.resolutionItems?.map(i => i.task).join(", ") || t.resolution || "N/A",
        `$${ticketTotal.toLocaleString()}`
      ];
    });
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [["Equipo", "Detalle", "Monto"]],
      body: completedData,
      theme: "striped",
      headStyles: { fillColor: [22, 163, 74] } // green-600
    });
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("GeekyFix Workshop - Reporte Interno", 105, 280, { align: "center" });
    
    doc.save(`Reporte_Diario_${selectedDate}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold">Reporte Diario</h2>
          </div>
          <button 
            onClick={generatePDF}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FileDown size={18} />
            Exportar PDF
          </button>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seleccionar Fecha</label>
          <input
            type="date"
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm w-full sm:w-auto"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <button 
            onClick={() => setActiveModal('devices')}
            className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-left hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all group flex flex-col"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Equipos Ingresados</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{dailyDevices.length}</p>
              </div>
              <Smartphone className="text-blue-400 dark:text-blue-600 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <div className="mt-auto pt-3 flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
              Ver detalles <ChevronRight size={12} />
            </div>
          </button>

          <button 
            onClick={() => setActiveModal('tickets')}
            className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-800 text-left hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all group flex flex-col"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-1">Tickets Completados</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{dailyTickets.length}</p>
              </div>
              <ReceiptText className="text-green-400 dark:text-green-600 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <div className="mt-auto pt-3 flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">
              Ver detalles <ChevronRight size={12} />
            </div>
          </button>

          <button 
            onClick={() => setActiveModal('revenue')}
            className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800 text-left hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all group flex flex-col"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Recaudación Total</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">${totalRevenue.toLocaleString()}</p>
              </div>
              <TrendingUp className="text-purple-400 dark:text-purple-600 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <div className="mt-auto pt-3 flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">
              Ver desglose <ChevronRight size={12} />
            </div>
          </button>
        </div>

      </div>

      {/* Modals for Details */}
      <Modal 
        isOpen={activeModal === 'devices'} 
        onClose={() => setActiveModal(null)} 
        title={`Equipos Ingresados - ${selectedDate}`}
      >
        <div className="space-y-3">
          {dailyDevices.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 italic">No hay ingresos en esta fecha.</p>
          )}
          {dailyDevices.map((device) => {
            const client = clients[device.clientId];
            return (
              <div key={device.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <h4 className="font-bold text-gray-900 dark:text-gray-100">
                  {device.brand} {device.model}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {client ? `Cliente: ${client.firstName} ${client.lastName}` : "Sin cliente asignado"}
                </p>
                {device.problem && (
                  <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded-lg text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                    <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[10px] block mb-1">Problema reportado:</span>
                    {device.problem}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'tickets'} 
        onClose={() => setActiveModal(null)} 
        title={`Tickets Completados - ${selectedDate}`}
      >
        <div className="space-y-3">
          {dailyTickets.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 italic">No hay trabajos finalizados en esta fecha.</p>
          )}
          {dailyTickets.map((ticket) => {
            const ticketTotal = (ticket.resolutionItems || []).reduce((s, item) => s + item.amount, 0);
            return (
              <div key={ticket.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">
                    {ticket.device.brand} {ticket.device.model}
                  </h4>
                  <div className="mt-2 space-y-1">
                    {ticket.resolutionItems?.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>• {item.task}</span>
                        <span className="font-medium">${item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {(!ticket.resolutionItems || ticket.resolutionItems.length === 0) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.resolution || "Sin detalle"}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">${ticketTotal.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'revenue'} 
        onClose={() => setActiveModal(null)} 
        title={`Desglose de Recaudación - ${selectedDate}`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800 text-center">
            <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Total del día</p>
            <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">${totalRevenue.toLocaleString()}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-400 uppercase px-1">Detalle por trabajo</h4>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {dailyTickets.length === 0 && (
                <p className="p-8 text-center text-gray-500 text-sm italic">Sin transacciones registradas.</p>
              )}
              {dailyTickets.map((ticket) => (
                <div key={ticket.id} className="p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{ticket.device.brand} {ticket.device.model}</p>
                  {ticket.resolutionItems?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-0.5">
                      <span className="text-gray-700 dark:text-gray-300">{item.task}</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">${item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
