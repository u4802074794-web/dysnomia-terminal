import React, { useState, useEffect, useRef } from 'react';
import { getGeminiResponse } from '../services/geminiService';
import { LogEntry, UserContext } from '../types';

interface NavAIProps {
  userContext: UserContext;
  addLog: (entry: LogEntry) => void;
  currentView: string;
}

const NavAI: React.FC<NavAIProps> = ({ userContext, addLog, currentView }) => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleAsk = async () => {
    if (!prompt) return;
    setLoading(true);
    setResponse(''); 

    try {
      const contextStr = JSON.stringify({
        pilot: userContext.address,
        lau: userContext.lauAddress,
        balance: userContext.balance,
        location: userContext.currentArea,
        current_module: currentView
      });
      
      const res = await getGeminiResponse(prompt, contextStr);
      setResponse(res);
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'AI',
        message: 'NavAI Response Received.'
      });
    } catch (err: any) {
      setResponse("SYSTEM ERROR: Navigation AI Unreachable. Check API Uplink.");
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: 'NavAI Error',
        details: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-dys-black/95 border-l border-dys-border w-80 md:w-96 shrink-0 relative shadow-2xl">
      {/* Decorative Grid Background */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      </div>
      
      <div className="p-4 border-b border-dys-border bg-dys-panel z-10 flex items-center justify-between">
        <div>
            <h2 className="text-dys-gold font-bold font-sans tracking-widest text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-dys-gold rounded-full animate-pulse"></span>
                NAV_AI SYSTEM
            </h2>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Gemini-2.5 Core // Online</p>
        </div>
        <div className="text-dys-gold opacity-50 text-2xl">❖</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs z-10 scrollbar-thin scrollbar-thumb-dys-border">
        {response ? (
            <div className="bg-dys-panel/80 border border-dys-gold/20 p-3 rounded text-gray-300 relative">
                <div className="absolute -top-2 left-2 bg-dys-black px-1 text-[10px] text-dys-gold">RESPONSE</div>
                <div className="whitespace-pre-wrap leading-relaxed">{response}</div>
            </div>
        ) : (
            <div className="text-gray-600 italic text-center mt-10 border border-dashed border-gray-800 p-4 rounded">
                awaiting_pilot_input...
            </div>
        )}
        <div ref={responseEndRef} />
      </div>

      <div className="p-4 border-t border-dys-border bg-dys-panel z-10">
        <div className="relative">
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                    }
                }}
                placeholder="Query Navigation Database..."
                className="w-full bg-black border border-dys-border text-dys-gold p-3 text-xs font-mono focus:outline-none focus:border-dys-gold resize-none h-20 mb-2 placeholder-gray-700"
            />
            {loading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-dys-gold text-xs animate-pulse">PROCESSING...</span>
                </div>
            )}
        </div>
        <button
            onClick={handleAsk}
            disabled={loading}
            className="w-full bg-dys-gold/10 hover:bg-dys-gold hover:text-black text-dys-gold border border-dys-gold/50 font-bold py-2 transition-all text-xs tracking-wider"
        >
            EXECUTE QUERY
        </button>
      </div>
    </div>
  );
};

export default NavAI;