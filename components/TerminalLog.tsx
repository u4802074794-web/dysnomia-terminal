import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface TerminalLogProps {
  logs: LogEntry[];
}

const TerminalLog: React.FC<TerminalLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full w-full bg-dys-black border-t-2 border-dys-border flex flex-col font-mono text-xs md:text-sm">
      <div className="bg-dys-panel px-4 py-1 border-b border-dys-border flex justify-between items-center select-none">
        <span className="text-dys-cyan font-bold uppercase tracking-widest">System_Log_Console // v.1.0</span>
        <div className="flex gap-2">
            <span className="w-2 h-2 rounded-full bg-dys-green animate-pulse"></span>
            <span className="text-gray-500">LIVE</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.map((log) => (
          <div key={log.id} className="flex flex-col gap-0.5 hover:bg-white/5 p-1 rounded border-b border-white/5">
            <div className="flex gap-2 items-center">
                <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                <span className={`font-bold shrink-0 ${
                log.type === 'ERROR' ? 'text-dys-red' :
                log.type === 'SUCCESS' ? 'text-dys-green' :
                log.type === 'AI' ? 'text-dys-gold' :
                log.type === 'TX' ? 'text-purple-400' :
                'text-blue-400'
                }`}>
                {log.type}
                </span>
                <span className="text-gray-300">{log.message}</span>
            </div>
            {log.details && (
                <div className="pl-16 text-gray-500 text-[10px] whitespace-pre-wrap font-mono break-words opacity-80">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default TerminalLog;