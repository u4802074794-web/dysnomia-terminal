import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry, AppView } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES } from '../constants';
import { formatUnits } from 'ethers';

interface DashboardProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
  setView: (view: AppView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, setView, web3 }) => {
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [atropaData, setAtropaData] = useState({ price: '---', supply: '---' });

  // Fetch Atropa System Data
  useEffect(() => {
      if(!web3) return;
      const fetchAtropa = async () => {
          try {
              const atropa = web3.getContract(ADDRESSES.ATROPA, [
                  "function price() view returns (uint256)",
                  "function totalSupply() view returns (uint256)"
              ]);
              const [p, s] = await Promise.all([
                  atropa.price().catch(() => 0n),
                  atropa.totalSupply().catch(() => 0n)
              ]);
              
              setAtropaData({
                  price: formatUnits(p, 18), 
                  supply: formatUnits(s, 18)
              });
          } catch(e) { console.error("Atropa fetch failed", e); }
      };
      fetchAtropa();
      const interval = setInterval(fetchAtropa, 30000);
      return () => clearInterval(interval);
  }, [web3]);

  return (
    <div className="h-full w-full bg-dys-black p-4 md:p-8 overflow-y-auto font-mono text-gray-300">
      
      {/* 1. Bridge Header Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Resonance Display (Replacing Static Ship Status) */}
          <div className="bg-black border border-dys-border p-4 relative overflow-hidden group hover:border-dys-gold/50 transition-colors flex flex-col justify-between h-full">
              <div className="absolute top-0 right-0 p-1 text-[10px] text-dys-gold border-l border-b border-dys-border bg-dys-black">
                  NODE_RESONANCE
              </div>
              
              {user.saat ? (
                  <div className="flex flex-col gap-3 mt-4">
                      {/* Aura Meter */}
                      <div>
                          <div className="flex justify-between text-[10px] text-dys-gold mb-1">
                              <span>AURA_FIELD</span>
                              <span>{user.saat.aura}</span>
                          </div>
                          <div className="h-2 bg-gray-900 border border-gray-800 relative">
                              <div className="absolute top-0 left-0 bottom-0 bg-dys-gold opacity-80" 
                                   style={{ width: `${Math.min(Number(user.saat.aura) % 100, 100)}%` }}></div>
                          </div>
                      </div>
                      
                      {/* Soul Meter */}
                      <div>
                          <div className="flex justify-between text-[10px] text-dys-cyan mb-1">
                              <span>SOUL_DENSITY</span>
                              <span>{user.saat.soul}</span>
                          </div>
                          <div className="h-2 bg-gray-900 border border-gray-800 relative">
                              <div className="absolute top-0 left-0 bottom-0 bg-dys-cyan opacity-80" 
                                   style={{ width: `${Math.min(Number(user.saat.soul) % 100, 100)}%` }}></div>
                          </div>
                      </div>

                      {/* Pole Frequency */}
                      <div className="flex justify-between items-end mt-2">
                          <span className="text-[10px] text-gray-500">POLE_FREQ</span>
                          <span className="text-lg font-bold text-dys-green">{user.saat.pole} Hz</span>
                      </div>
                  </div>
              ) : (
                   <div className="flex items-center justify-center flex-1 opacity-50 text-xs text-center p-4">
                       NO RESONANCE DATA.<br/>INITIALIZE LAU SHELL.
                   </div>
              )}
          </div>

          {/* Navigation Fix */}
          <div className="bg-black border border-dys-border p-4 flex flex-col justify-between group hover:border-dys-cyan/50 transition-colors">
              <div className="flex justify-between items-start">
                  <span className="text-xs text-dys-cyan uppercase tracking-widest">Navigation Fix</span>
                  <div className={`w-2 h-2 rounded-full ${user.currentArea ? 'bg-dys-cyan animate-pulse' : 'bg-dys-red'}`}></div>
              </div>
              <div className="mt-4">
                  <div className="text-2xl text-white font-bold truncate">
                      {user.currentArea === ADDRESSES.VOID || !user.currentArea ? "THE VOID" : user.currentArea}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">COORDS: {user.currentArea || "NO_SIGNAL"}</div>
              </div>
              <button 
                onClick={() => setView(AppView.QING)}
                className="mt-4 w-full bg-dys-cyan/10 hover:bg-dys-cyan hover:text-black border border-dys-cyan/30 text-dys-cyan text-xs font-bold py-2 transition-all"
              >
                  ADJUST HEADING
              </button>
          </div>

          {/* Pilot Identity */}
          <div className="bg-black border border-dys-border p-4 flex flex-col justify-between group hover:border-dys-green/50 transition-colors">
               <div className="flex justify-between items-start">
                  <span className="text-xs text-dys-green uppercase tracking-widest">Pilot Identity</span>
                  <span className="text-[10px] text-gray-600">AUTH: LAU</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                  <div className="text-3xl">{user.lauAddress ? '👾' : '👤'}</div>
                  <div>
                      <div className="text-xl text-white font-bold">{user.username || "GHOST"}</div>
                      <div className="text-[10px] text-gray-500 font-mono truncate max-w-[150px]">{user.lauAddress || "NO_SHELL"}</div>
                  </div>
              </div>
               <button 
                onClick={() => setView(AppView.LAU)}
                className={`mt-4 w-full border text-xs font-bold py-2 transition-all ${
                    user.lauAddress 
                    ? 'bg-dys-green/10 hover:bg-dys-green hover:text-black border-dys-green/30 text-dys-green' 
                    : 'bg-dys-red/10 hover:bg-dys-red hover:text-black border-dys-red/30 text-dys-red animate-pulse'
                }`}
              >
                  {user.lauAddress ? 'MANAGE SHELL' : 'INITIALIZE SHELL'}
              </button>
          </div>
      </div>

      {/* 2. Main Deck Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-64">
          
          {/* Quick Modules */}
          <div className="bg-dys-panel border border-dys-border p-1">
              <div className="h-full grid grid-cols-2 gap-1 bg-black p-1">
                  {[
                      { id: AppView.VOID_CHAT, label: 'COMMS_RELAY', icon: '📡', color: 'text-dys-cyan' },
                      { id: AppView.CONTRACT_STUDIO, label: 'ENGINEERING', icon: '🛠', color: 'text-dys-gold' },
                      { id: AppView.YUE, label: 'CARGO_BRIDGE', icon: '📦', color: 'text-purple-400' },
                      { id: AppView.SETTINGS, label: 'SYSTEM_CONFIG', icon: '⚙', color: 'text-gray-400' },
                  ].map(mod => (
                      <button
                        key={mod.id}
                        onClick={() => setView(mod.id)}
                        onMouseEnter={() => setHoveredModule(mod.label)}
                        onMouseLeave={() => setHoveredModule(null)}
                        className="border border-dys-border/50 hover:border-dys-border hover:bg-dys-panel flex flex-col items-center justify-center gap-2 transition-all group"
                      >
                          <div className={`text-2xl group-hover:scale-110 transition-transform ${mod.color}`}>{mod.icon}</div>
                          <div className="text-[10px] text-gray-500 font-bold tracking-widest group-hover:text-white">{mod.label}</div>
                      </button>
                  ))}
              </div>
          </div>

          {/* Atropa Market Feed */}
          <div className="bg-dys-panel border border-dys-border flex flex-col">
              <div className="p-2 border-b border-dys-border bg-black flex justify-between">
                  <span className="text-xs text-gray-500 font-bold">ATROPA_MARKET_FEED</span>
                  <span className="text-[10px] text-dys-green animate-pulse">LIVE</span>
              </div>
              <div className="flex-1 p-3 overflow-hidden relative flex flex-col justify-center gap-4">
                   <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                   
                   <div className="flex justify-between items-end border-b border-gray-800 pb-2">
                       <div className="text-xs text-gray-500 uppercase">PRICE (PLS)</div>
                       <div className="text-2xl font-bold text-dys-gold font-mono">{Number(atropaData.price).toFixed(4)}</div>
                   </div>
                   
                   <div className="flex justify-between items-end">
                       <div className="text-xs text-gray-500 uppercase">TOTAL SUPPLY</div>
                       <div className="text-lg font-bold text-white font-mono">{Number(atropaData.supply).toLocaleString()}</div>
                   </div>

                   <div className="text-[9px] text-gray-600 mt-2">
                       Data retrieved directly from Sovereign Architect contract [0x7a...414]
                   </div>
              </div>
              {hoveredModule && (
                  <div className="p-2 bg-dys-black border-t border-dys-border text-center text-xs text-dys-cyan uppercase font-bold">
                      ACCESSING: {hoveredModule}...
                  </div>
              )}
          </div>

      </div>
    </div>
  );
};

export default Dashboard;