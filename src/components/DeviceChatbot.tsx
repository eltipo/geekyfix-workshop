import React, { useState, useEffect, useRef } from "react";
import { Bot, Sparkles, Send, Trash2, HelpCircle, Loader, MessageSquare, AlertCircle, RefreshCw } from "lucide-react";
import { Device } from "../types";
import { api } from "../api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DeviceChatbotProps {
  device: Device;
}

export function DeviceChatbot({ device }: DeviceChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`chatbot_v1_${device.id}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing chat history from disk:", e);
      }
    } else {
      // Introdutional greeting
      setMessages([
        {
          role: "assistant",
          content: `¡Hola! Soy **GeekyFix AI**, tu asistente inteligente de diagnóstico. 

He analizado los datos del equipo **${device.brand} ${device.model || "especificado"}** y estoy listo para ayudarte. Puedo:
* Analizar el problema inicial del equipo y guiarte en el diagnóstico técnico.
* Examinar las fotos que has cargado (placas, pantallas de error, componentes físicos).
* Ayudarte con procedimientos específicos de reparación (micro-soldadura, medición de voltajes, jumpers).
* Revisar las tareas/tickets pendientes para organizar los siguientes pasos.

¿Con qué te gustaría empezar hoy?`
        }
      ]);
    }
  }, [device.id]);

  // Save chat history to localStorage
  const saveHistory = (msgs: Message[]) => {
    localStorage.setItem(`chatbot_v1_${device.id}`, JSON.stringify(msgs));
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: messageText };
    const updatedMessages = [...messages, userMsg];
    
    setMessages(updatedMessages);
    setInput("");
    saveHistory(updatedMessages);
    setIsLoading(true);
    setError(null);

    try {
      // Call our secure server-side diagnose endpoint
      const data = await api.diagnoseDevice(device.id, updatedMessages);
      
      const assistantMsg: Message = {
        role: "assistant",
        content: data.text || "No obtuve una respuesta válida de Gemini.",
      };
      
      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } catch (err: any) {
      console.error("Error in AI diagnostic chat:", err);
      setError(err.message || "Error de red o conexión al servidor");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    if (window.confirm("¿Seguro que deseas reiniciar el chat con el asistente?")) {
      const initial: Message[] = [
        {
          role: "assistant",
          content: `¡Chat reiniciado! Estoy listo para ayudarte nuevamente con el **${device.brand} ${device.model || "especificado"}**.`
        }
      ];
      setMessages(initial);
      saveHistory(initial);
      setError(null);
    }
  };

  const quickPrompts = [
    {
      label: "🛠️ Diagnosticar problema",
      prompt: "¿Qué diagnóstico, causas comunes y sugerencias tienes para el problema reportado de este equipo?"
    },
    {
      label: "📸 Analizar fotos cargadas",
      prompt: "Analiza las imágenes que he subido del equipo y dime qué detalles, anomalías o pistas encuentras en ellas."
    },
    {
      label: "📋 Tareas pendientes",
      prompt: "¿Qué tareas, reportes o tickets pendientes tenemos para este equipo y en qué orden sugieres abordarlos?"
    },
    {
      label: "💡 Truco de reparación",
      prompt: "¿Cuáles serían los mejores consejos de reparación electrónica o micro-soldadura útiles para resolver los problemas de este tipo de equipos?"
    }
  ];

  // Helper function to render text with basic Markdown (bold, lists, code)
  const renderFormattedText = (text: string) => {
    // Split into lines
    const lines = text.split("\n");
    let inList = false;
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      let currentLine = line.trim();

      // Check for code blocks
      const isCodeBlock = currentLine.startsWith("```");
      if (isCodeBlock) {
        // Just general stripping for simplicity
        return;
      }

      // Headers (e.g. ### o ##)
      if (currentLine.startsWith("#")) {
        const depth = (currentLine.match(/^#+/) || [""])[0].length;
        const cleanText = currentLine.replace(/^#+\s*/, "");
        const sizeClass = depth === 1 ? "text-xl font-bold mt-4 mb-2 text-blue-600 dark:text-blue-400" : depth === 2 ? "text-lg font-bold mt-3 mb-1.5 text-blue-500 dark:text-blue-400" : "text-base font-bold mt-2 mb-1 text-gray-800 dark:text-gray-200";
        elements.push(<h4 key={index} className={sizeClass}>{parseInlineMarkdown(cleanText)}</h4>);
        return;
      }

      // Unordered list item
      if (currentLine.startsWith("* ") || currentLine.startsWith("- ")) {
        const cleanText = currentLine.substring(2);
        elements.push(
          <li key={index} className="ml-5 list-disc text-sm text-gray-700 dark:text-gray-300 py-0.5">
            {parseInlineMarkdown(cleanText)}
          </li>
        );
        return;
      }

      // Ordered list item
      if (/^\d+\.\s/.test(currentLine)) {
        const cleanText = currentLine.replace(/^\d+\.\s*/, "");
        const match = currentLine.match(/^\d+/);
        const number = match ? match[0] : "1";
        elements.push(
          <li key={index} className="ml-5 list-decimal text-sm text-gray-700 dark:text-gray-300 py-0.5" value={parseInt(number)}>
            {parseInlineMarkdown(cleanText)}
          </li>
        );
        return;
      }

      // Empty line
      if (currentLine === "") {
        elements.push(<div key={index} className="h-2" />);
        return;
      }

      // Normal paragraph line
      elements.push(
        <p key={index} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 my-1">
          {parseInlineMarkdown(currentLine)}
        </p>
      );
    });

    return elements;
  };

  const parseInlineMarkdown = (text: string) => {
    // Basic regex parser for bold **text** and code `code`
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldIdx = remaining.indexOf("**");
      const codeIdx = remaining.indexOf("`");

      if (boldIdx === -1 && codeIdx === -1) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }

      // Find first occurrence
      if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
        // Plain text before bold
        if (boldIdx > 0) {
          parts.push(<span key={key++}>{remaining.substring(0, boldIdx)}</span>);
        }
        const afterFirstAsterisk = remaining.substring(boldIdx + 2);
        const nextBoldIdx = afterFirstAsterisk.indexOf("**");
        if (nextBoldIdx === -1) {
          // Unmatched, treat as plain text
          parts.push(<span key={key++}>**</span>);
          remaining = afterFirstAsterisk;
        } else {
          const boldText = afterFirstAsterisk.substring(0, nextBoldIdx);
          parts.push(<strong key={key++} className="font-extrabold text-gray-900 dark:text-white">{boldText}</strong>);
          remaining = afterFirstAsterisk.substring(nextBoldIdx + 2);
        }
      } else {
        // Plain text before code
        if (codeIdx > 0) {
          parts.push(<span key={key++}>{remaining.substring(0, codeIdx)}</span>);
        }
        const afterFirstBacktick = remaining.substring(codeIdx + 1);
        const nextCodeIdx = afterFirstBacktick.indexOf("`");
        if (nextCodeIdx === -1) {
          // Unmatched, treat as plain text
          parts.push(<span key={key++}>`</span>);
          remaining = afterFirstBacktick;
        } else {
          const codeText = afterFirstBacktick.substring(0, nextCodeIdx);
          parts.push(<code key={key++} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 font-mono text-xs rounded border border-gray-200 dark:border-gray-600 text-red-600 dark:text-red-400">{codeText}</code>);
          remaining = afterFirstBacktick.substring(nextCodeIdx + 1);
        }
      }
    }

    return parts;
  };

  return (
    <div className="flex flex-col h-[600px] border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden shadow-inner">
      {/* Bot Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl text-white shadow-md shadow-blue-500/20">
              <Bot size={18} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 border-2 border-white dark:border-gray-800"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-sm text-gray-900 dark:text-white">GeekyFix AI</h4>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5 uppercase tracking-wide">
                <Sparkles size={8} /> Gemini 3.5
              </span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Diagnóstico Inteligente de Equipos</p>
          </div>
        </div>
        
        <button 
          onClick={handleClear}
          title="Reiniciar conversación"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-2.5 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
          >
            {msg.role === "assistant" && (
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/40 rounded-lg border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400">
                <Bot size={16} />
              </div>
            )}
            
            <div className={`p-3.5 rounded-2xl border text-sm shadow-sm transition-all duration-300 ${
              msg.role === "user"
                ? "bg-blue-600 text-white border-blue-500 rounded-tr-none"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-150 dark:border-gray-700/60 rounded-tl-none"
            }`}>
              {msg.role === "assistant" ? (
                <div className="space-y-1">
                  {renderFormattedText(msg.content)}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start gap-2.5 max-w-[85%] mr-auto">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/40 rounded-lg border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400">
              <Bot size={16} />
            </div>
            <div className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3.5 rounded-2xl border border-gray-150 dark:border-gray-700/60 rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader size={16} className="animate-spin text-blue-500" />
              <span className="text-xs">GeekyFix AI está analizando el equipo e imágenes...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 flex items-start gap-2 text-xs">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-bold mb-0.5">Fallo de conexión</p>
              <p>{error}</p>
              <button 
                onClick={() => handleSend()} 
                className="mt-1.5 font-bold underline flex items-center gap-1 hover:text-red-800 dark:hover:text-red-300"
              >
                <RefreshCw size={10} /> Reintentar enviar
              </button>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Chips Selection (Only show if loading is idle) */}
      {!isLoading && messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <HelpCircle size={10} /> Sugerencias de diagnóstico:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.prompt)}
                className="text-xs bg-white hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-950/20 text-gray-700 hover:text-blue-700 dark:text-gray-300 dark:hover:text-blue-400 border border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-900 px-2.5 py-1.5 rounded-lg transition-all text-left shadow-sm font-medium"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form Box */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
        className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-2 items-center"
      >
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe una pregunta para GeekyFix AI..."
          disabled={isLoading}
          className="flex-1 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-950 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
        />
        <button 
          type="submit" 
          disabled={isLoading || !input.trim()}
          className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/10 hover:bg-blue-700 disabled:opacity-40 transition-all active:scale-95 shrink-0 flex items-center justify-center"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
