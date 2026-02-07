import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry, AppView } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES } from '../constants';
import { formatUnits } from 'ethers';
import QingMap from './QingMap';

interface DashboardProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
  setView: (view: AppView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, setView, web3, addLog }) => {
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  
  // Real Telemetry Data
  const [telemetry, setTelemetry] = useState({
      block: 0,
      gas: '0',
      latency: 0,
      peers: 0
  });

  useEffect(() => {
      if(!web3) return;
      
      const fetchTelemetry = async () => {
          try {
              const provider = web3.getProvider();
              const start = Date.now();
              const block = await provider.getBlockNumber();
              const latency = Date.now() - start;
              const fee = await provider.getFeeData();
              const gas = fee.gasPrice ? formatUnits(fee.gasPrice, 'gwei') : '0';
              
              setTelemetry(prev => ({
                  ...prev,
                  block,
                  gas: parseFloat(gas).toFixed(1),
                  latency,
                  peers: 369 // Static ID for PulseChain Mainnet as peer count isn't readily available on standard RPC
              }));
          } catch(e) {}
      };

      fetchTelemetry();
      const interval = setInterval(fetchTelemetry, 5000);
      return () => clearInterval(interval);
  }, [web3]);

  // Dynamic ASCII generation
  const getShipAscii = () => {
      const status = user.isConnected ? 'ONLINE' : 'OFFLINE';
      const fuel = `${telemetry.gas} GW`;
      const net = `${telemetry.block}`;
      
      // Pad strings to maintain alignment
      const pStatus = status.padEnd(8, ' ');
      const pFuel = fuel.padEnd(8, ' ');
      const pNet = net.padEnd(9, ' ');

// Note: Removed initial newline to align top-left
return `      /|
     / |
    /  |  [ ATROPA 999 ]
   /___|
  (_____)  STATUS: ${pStatus}
   \\   /   FUEL:   ${pFuel}
    \\ /    NET:    ${pNet}
     V`;
  };

  return (
    <div className="h-full w-full bg-dys-black p-4 md:p-8 overflow-y-auto font-mono text-gray-300">
      
      {/* 1. Bridge Header Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 h-80 lg:h-64">
          
          {/* Resonance Display (ASCII + Stats) */}
          <div className="bg-black border border-dys-border p-4 relative overflow-hidden group hover:border-dys-gold/50 transition-colors flex flex-col justify-between h-full">
              <div className="absolute top-0 right-0 p-1 text-[10px] text-dys-gold border-l border-b border-dys-border bg-dys-black z-20">
                  NODE_RESONANCE
              </div>
              
              <div className="flex h-full items-start pt-2">
                  {/* Left: ASCII Art (Top Left aligned) */}
                  <div className="w-auto flex flex-col justify-start mr-6 z-10">
                      <pre className="text-[9px] md:text-[10px] text-dys-gold font-bold whitespace-pre leading-[1.2]">
                          {getShipAscii()}
                      </pre>
                  </div>

                  {/* Right: Stats (Wrapping around) */}
                  <div className="flex-1 flex flex-col justify-center gap-4 z-10 h-full">
                      {user.saat ? (
                          <>
                            {/* Aura Meter */}
                            <div>
                                <div className="flex justify-between text-[10px] text-dys-gold mb-1">
                                    <span>AURA_FIELD</span>
                                    <span>{user.saat.aura}</span>
                                </div>
                                <div className="h-2 bg-gray-900 border border-gray-800 relative w-full">
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
                                <div className="h-2 bg-gray-900 border border-gray-800 relative w-full">
                                    <div className="absolute top-0 left-0 bottom-0 bg-dys-cyan opacity-80" 
                                         style={{ width: `${Math.min(Number(user.saat.soul) % 100, 100)}%` }}></div>
                                </div>
                            </div>

                            {/* Pole Frequency */}
                            <div className="flex justify-between items-end mt-1">
                                <span className="text-[10px] text-gray-500">POLE_FREQ</span>
                                <span className="text-lg font-bold text-dys-green">{user.saat.pole} Hz</span>
                            </div>
                          </>
                      ) : (
                           <div className="flex flex-col h-full justify-center text-[10px] text-gray-600 italic">
                               <div>Waiting for Link...</div>
                               <div className="mt-2 text-dys-red">NO RESONANCE DATA</div>
                           </div>
                      )}
                  </div>
              </div>
          </div>

          {/* System Telemetry (Replacing simulated Sensor Array) */}
          <div className="bg-black border border-dys-border p-4 flex flex-col justify-between group hover:border-dys-cyan/50 transition-colors relative overflow-hidden">
              <div className="flex justify-between items-start z-10">
                  <span className="text-xs text-dys-cyan uppercase tracking-widest">SYSTEM_TELEMETRY</span>
                  <div className={`w-2 h-2 rounded-full ${user.isConnected ? 'bg-dys-cyan animate-pulse' : 'bg-dys-red'}`}></div>
              </div>

              {/* Real-Time Stats List */}
              <div className="mt-4 flex-1 z-10 space-y-2 font-mono text-[10px]">
                  
                  <div className="flex justify-between items-center border-b border-gray-800 pb-1">
                      <span className="text-gray-500">UPLINK_LATENCY</span>
                      <span className={telemetry.latency < 200 ? "text-dys-green" : "text-dys-gold"}>
                          {telemetry.latency}ms
                      </span>
                  </div>

                  <div className="flex justify-between items-center border-b border-gray-800 pb-1">
                      <span className="text-gray-500">GAS_FLUX (GW)</span>
                      <span className="text-dys-gold">{telemetry.gas}</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-gray-800 pb-1">
                      <span className="text-gray-500">NETWORK_ID</span>
                      <span className="text-dys-cyan">{telemetry.peers} (PLS)</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-gray-800 pb-1">
                      <span className="text-gray-500">CURRENT_VECTOR</span>
                      <span className="text-white truncate max-w-[120px]" title={user.currentArea || 'VOID'}>
                          {user.currentArea || 'VOID'}
                      </span>
                  </div>

                  <div className="flex justify-between items-center">
                      <span className="text-gray-500">BRIDGE_STATUS</span>
                      <span className={user.yue ? "text-dys-green" : "text-gray-600"}>
                          {user.yue ? 'LINKED' : 'UNLINKED'}
                      </span>
                  </div>

              </div>

              <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.03)_1px,transparent_1px)] bg-[length:20px_20px] pointer-events-none"></div>
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

          {/* Mini Manifold Map (Replacing Market Feed) */}
          <div className="bg-dys-panel border border-dys-border flex flex-col relative group overflow-hidden">
              <div className="absolute top-0 left-0 right-0 z-10 p-2 border-b border-dys-border bg-black/80 flex justify-between pointer-events-none">
                  <span className="text-xs text-dys-gold font-bold tracking-widest">MANIFOLD_PROJECTION</span>
                  <span className="text-[10px] text-dys-green animate-pulse">LIVE FEED</span>
              </div>
              
              <div className="flex-1 w-full h-full relative">
                  <QingMap 
                    web3={web3} 
                    addLog={addLog} 
                    onSelectSector={() => {}} 
                    viewOnly={true} 
                  />
                  
                  {/* Overlay Interaction hint */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="text-dys-gold text-xs font-bold border border-dys-gold px-3 py-1 bg-black/80">
                          CLICK MODULE TO INTERACT
                      </div>
                  </div>
              </div>

              {/* Interactive Cover (Clicking takes to Map View) */}
              <button 
                  onClick={() => setView(AppView.MAP)}
                  className="absolute inset-0 w-full h-full z-20 cursor-pointer opacity-0"
                  aria-label="Open Map"
              />
          </div>

      </div>
    </div>
  );
};

export default Dashboard;