
import React, { useState, useEffect } from 'react';
import { formatUnits } from 'ethers';
import { Web3Service } from './services/web3Service';
import { AppView, LogEntry, UserContext } from './types';
import { ADDRESSES, DEFAULT_RPC_URL, GEMINI_MODELS } from './constants';

// Components
import TerminalLog from './components/TerminalLog';
import NavAI from './components/NavAI';
import ContractStudio from './components/ContractStudio';
import Dashboard from './components/Dashboard';
import LauModule from './components/LauModule';
import YueModule from './components/YueModule';
import QingModule from './components/QingModule';
import VoidChat from './components/VoidChat';
import LauRegistry from './components/LauRegistry';

enum System {
    DYSNOMIA = 'DYSNOMIA',
    ATROPA = 'ATROPA',
    BREZ = 'BREZ'
}

const App: React.FC = () => {
  const [activeSystem, setActiveSystem] = useState<System>(System.DYSNOMIA);
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [web3, setWeb3] = useState<Web3Service | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showNavAI, setShowNavAI] = useState(true);
  
  // Settings State
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview-09-2025');
  
  // RPC State
  const [activeRpc, setActiveRpc] = useState<string>(DEFAULT_RPC_URL);

  // Registry Navigation State
  const [registrySearch, setRegistrySearch] = useState('');

  // Telemetry
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [gasPrice, setGasPrice] = useState<string>('0');
  const [bootTime] = useState(new Date().toLocaleTimeString());
  
  const [user, setUser] = useState<UserContext>({
    address: null,
    isConnected: false,
    providerType: 'READ_ONLY',
    balance: '0',
    lauAddress: null,
    username: null,
    currentArea: null,
    yue: null,
    qings: []
  });

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addLog = (entry: LogEntry) => {
    const safeEntry = { ...entry, id: entry.id || generateId() };
    setLogs(prev => [...prev, safeEntry].slice(-100)); // Keep last 100
  };

  useEffect(() => {
    // Load Settings on Boot
    const storedKey = localStorage.getItem('dys_gemini_key');
    const storedModel = localStorage.getItem('dys_gemini_model');
    const storedRpc = localStorage.getItem('dys_custom_rpc');
    
    if(storedKey) setAiKey(storedKey);
    if(storedModel) setAiModel(storedModel);
    
    const rpcToUse = storedRpc || DEFAULT_RPC_URL;
    setActiveRpc(rpcToUse);

    initWeb3(rpcToUse);
  }, []);

  const initWeb3 = async (url: string) => {
      const _web3 = new Web3Service(url);
      setWeb3(_web3);
      addLog({
          id: generateId(),
          timestamp: new Date().toLocaleTimeString(),
          type: 'INFO',
          message: `TERMINAL_OS v4.1.5 // ATROPA KERNEL LOADED`
      });

      // Initial Stats Fetch
      try {
          const provider = _web3.getProvider();
          const block = await provider.getBlockNumber();
          setBlockNumber(block);
          const feeData = await provider.getFeeData();
          if(feeData.gasPrice) {
              setGasPrice(formatUnits(feeData.gasPrice, 'gwei'));
          }
      } catch(e) {
          console.error("Telemetry failed", e);
          addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: 'Uplink Unstable: Check RPC Settings.' });
      }
  };

  const saveSettings = () => {
      localStorage.setItem('dys_gemini_key', aiKey);
      localStorage.setItem('dys_gemini_model', aiModel);
      localStorage.setItem('dys_custom_rpc', activeRpc);
      
      addLog({ id: generateId(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: 'Configuration Saved. Reinitializing Uplink...' });
      
      // Re-init Web3 with new settings
      initWeb3(activeRpc);
  };

  const resetRpcDefaults = () => {
      setActiveRpc(DEFAULT_RPC_URL);
  };

  const handleViewIdentity = (id: string) => {
      setRegistrySearch(id);
      setView(AppView.LAU_REGISTRY);
  };

  // Polling for block stats
  useEffect(() => {
      if(!web3) return;
      const interval = setInterval(async () => {
          try {
              const provider = web3.getProvider();
              const block = await provider.getBlockNumber();
              setBlockNumber(block);
              const feeData = await provider.getFeeData();
              if(feeData.gasPrice) {
                  setGasPrice(parseFloat(formatUnits(feeData.gasPrice, 'gwei')).toFixed(1));
              }
          } catch(e) {}
      }, 12000); // PulseChain block time is faster, but 12s is safe poll
      return () => clearInterval(interval);
  }, [web3]);

  const connectWallet = async () => {
      if(!web3) return;
      try {
          const addr = await web3.connect();
          const balance = await web3.getBalance(addr);
          
          setUser(prev => ({
              ...prev,
              address: addr,
              isConnected: true,
              balance,
              providerType: 'INJECTED'
          }));

          addLog({
              id: generateId(),
              timestamp: new Date().toLocaleTimeString(),
              type: 'SUCCESS',
              message: `USER AUTHENTICATED: ${addr}`
          });
      } catch(e: any) {
          addLog({
              id: generateId(),
              timestamp: new Date().toLocaleTimeString(),
              type: 'ERROR',
              message: 'AUTH FAILURE',
              details: e.message
          });
      }
  };

  const renderContent = () => {
      if(!web3) return <div className="p-10 text-dys-amber animate-pulse font-mono">SYSTEM BOOT SEQUENCE...</div>;

      if (view === AppView.SETTINGS) {
          return (
              <div className="p-8 text-dys-amber font-mono max-w-2xl mx-auto mt-10 border border-dys-amber/20 bg-dys-panel/50 overflow-y-auto max-h-[80vh]">
                  <h2 className="text-xl mb-6 border-b border-dys-amber/30 pb-2 flex justify-between">
                      <span>TERMINAL CONFIGURATION</span>
                      <span>[SYS_ADMIN]</span>
                  </h2>
                  <div className="space-y-8">
                      {/* RPC SETTINGS */}
                      <div className="space-y-4">
                          <div className="flex justify-between items-end border-b border-dys-amber/10 pb-1">
                              <label className="text-xs uppercase font-bold text-gray-500">Active Uplink Node</label>
                              <button onClick={resetRpcDefaults} className="text-[10px] text-dys-red hover:text-white uppercase">Reset Default</button>
                          </div>
                          
                          <div className="flex gap-2 mt-2">
                              <input 
                                  className="flex-1 bg-black border border-dys-amber/30 p-2 text-sm text-dys-amber focus:border-dys-amber outline-none font-mono"
                                  placeholder="https://..."
                                  value={activeRpc}
                                  onChange={(e) => setActiveRpc(e.target.value)}
                              />
                          </div>
                      </div>

                      {/* AI SETTINGS */}
                      <div className="space-y-4 pt-4 border-t border-dys-amber/10">
                          <div className="flex flex-col gap-2">
                              <label className="text-xs uppercase font-bold text-dys-cyan">Gemini API Key</label>
                              <input 
                                  type="password"
                                  className="bg-black border border-dys-cyan/30 p-3 text-sm text-dys-cyan focus:border-dys-cyan outline-none font-mono"
                                  placeholder="sk-..."
                                  value={aiKey}
                                  onChange={(e) => setAiKey(e.target.value)}
                              />
                              <div className="text-[10px] text-gray-500">Required for NavAI and Oracle features. Stored locally.</div>
                          </div>

                          <div className="flex flex-col gap-2">
                              <label className="text-xs uppercase font-bold text-dys-cyan">AI Model</label>
                              <select 
                                  className="bg-black border border-dys-cyan/30 p-3 text-sm text-dys-cyan focus:border-dys-cyan outline-none font-mono"
                                  value={aiModel}
                                  onChange={(e) => setAiModel(e.target.value)}
                              >
                                  {GEMINI_MODELS.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="pt-4 border-t border-dys-amber/20">
                          <button 
                            onClick={saveSettings}
                            disabled={!activeRpc}
                            className="bg-dys-amber/10 text-dys-amber border border-dys-amber hover:bg-dys-amber hover:text-black px-6 py-2 font-bold text-sm transition-all disabled:opacity-50"
                          >
                              SAVE & REBOOT
                          </button>
                      </div>
                  </div>
              </div>
          );
      }

      if(activeSystem !== System.DYSNOMIA) {
          return (
              <div className="flex flex-col items-center justify-center h-full text-dys-red font-mono border-2 border-dys-red/20 m-4">
                  <div className="text-6xl font-bold mb-4 opacity-50">⚠</div>
                  <div className="text-xl font-bold mb-2">ACCESS DENIED</div>
                  <div className="bg-dys-red/10 p-4 border border-dys-red text-center">
                      SUBSYSTEM [{activeSystem}] IS OFFLINE<br/>
                      OR REQUIRES HIGHER CLEARANCE LEVEL.<br/>
                      <br/>
                      <span className="animate-pulse">_</span>
                  </div>
              </div>
          );
      }

      switch(view) {
          case AppView.DASHBOARD:
              return <Dashboard user={user} web3={web3} addLog={addLog} setUser={setUser} setView={setView} />;
          case AppView.LAU:
              return <LauModule user={user} web3={web3} addLog={addLog} setUser={setUser} />;
          case AppView.LAU_REGISTRY:
              return <LauRegistry 
                  user={user} 
                  web3={web3} 
                  addLog={addLog} 
                  setUser={setUser} 
                  initialSearchTerm={registrySearch}
              />;
          case AppView.YUE:
              return <YueModule user={user} web3={web3} addLog={addLog} />;
          case AppView.QING:
              return <QingModule 
                  user={user} 
                  web3={web3} 
                  addLog={addLog} 
                  setUser={setUser} 
                  onViewIdentity={handleViewIdentity}
              />;
          case AppView.VOID_CHAT:
              return <div className="h-full w-full max-w-4xl mx-auto p-6">
                <VoidChat 
                    web3={web3}
                    viewAddress={ADDRESSES.VOID} 
                    lauArea={user.currentArea}
                    lauAddress={user.lauAddress}
                    addLog={addLog}
                    onViewIdentity={handleViewIdentity}
                />
              </div>;
          case AppView.CONTRACT_STUDIO:
              return <ContractStudio web3={web3} addLog={addLog} />;
          default:
              return <div className="p-10 text-center font-mono text-dys-red">ERR: MODULE NOT FOUND</div>;
      }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050505] text-dys-amber overflow-hidden selection:bg-dys-amber selection:text-black font-mono">
      
      {/* 1. TOP STATUS BAR (HARDWARE LEVEL) */}
      <div className="h-6 bg-dys-black border-b border-dys-border flex items-center justify-center md:justify-between px-2 text-[10px] tracking-wider select-none shrink-0 opacity-60">
          <div className="flex items-center gap-4">
              <span>KERNEL: v.4.1.5</span>
              <span>MEM: OK</span>
          </div>
          <div className="hidden md:flex items-center gap-4">
              <span>UPTIME: {bootTime}</span>
              <span className={web3 ? "text-dys-green" : "text-dys-red"}>NET: {web3 ? "ONLINE" : "OFFLINE"}</span>
          </div>
      </div>

      {/* 2. COMMAND DECK HEADER (Compact) */}
      <header className="h-16 px-4 md:px-6 border-b-2 border-dys-amber flex items-center justify-between shrink-0 bg-[#080808]">
        
        <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="leading-none group cursor-default">
                <h1 className="font-bold text-2xl tracking-tighter text-dys-amber group-hover:text-white transition-colors">ATROPA-999</h1>
                <span className="text-[10px] text-gray-500 tracking-[0.2em] group-hover:text-dys-amber transition-colors">RESEARCH_VESSEL</span>
            </div>

            {/* Separator */}
            <div className="h-8 w-px bg-dys-border hidden md:block"></div>

            {/* System Selector (Inline) */}
            <div className="hidden md:flex items-center gap-2">
                {[System.DYSNOMIA, System.ATROPA, System.BREZ].map(sys => (
                    <button
                        key={sys}
                        onClick={() => { setActiveSystem(sys); setView(AppView.DASHBOARD); }}
                        className={`px-3 py-1 text-xs font-bold tracking-wider transition-all border ${
                            activeSystem === sys && view !== AppView.SETTINGS
                            ? 'border-dys-amber text-black bg-dys-amber' 
                            : 'border-transparent text-gray-600 hover:text-dys-amber hover:border-dys-amber/30'
                        }`}
                    >
                        {sys}
                    </button>
                ))}
                
                {/* SETTINGS BUTTON */}
                <button
                    onClick={() => setView(AppView.SETTINGS)}
                    className={`px-3 py-1 text-xs font-bold tracking-wider transition-all border ${
                        view === AppView.SETTINGS
                        ? 'border-gray-500 text-black bg-gray-500' 
                        : 'border-transparent text-gray-600 hover:text-white hover:border-gray-500/30'
                    }`}
                >
                    SETTINGS
                </button>
            </div>
        </div>

        {/* Right: Telemetry & Pilot */}
        <div className="flex items-center gap-6 text-xs font-mono">
            
            {/* Blockchain Stats */}
            <div className="hidden lg:flex flex-col items-end leading-tight border-r border-dys-border pr-6 mr-2 opacity-80">
                <div className="flex gap-2">
                    <span className="text-gray-600 text-[9px] uppercase">SYNC</span>
                    <span className="text-dys-amber font-bold">#{blockNumber}</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-gray-600 text-[9px] uppercase">FUEL</span>
                    <span className="text-dys-amber font-bold">{gasPrice} GW</span>
                </div>
            </div>

            <div className="flex flex-col items-end leading-tight">
                <span className="text-gray-600 text-[9px] uppercase">PILOT</span>
                {user.isConnected ? (
                    <span className="text-dys-amber font-bold">{user.username || user.address?.substring(0,8)}</span>
                ) : (
                    <button onClick={connectWallet} className="text-dys-red hover:text-white font-bold animate-pulse">
                        [ CONNECT ]
                    </button>
                )}
            </div>
            
            <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-gray-600 text-[9px] uppercase">CREDITS</span>
                <span className="text-dys-amber">{Number(user.balance).toFixed(2)} PLS</span>
            </div>

            <button 
                onClick={() => setShowNavAI(!showNavAI)} 
                className={`border px-3 py-1 font-bold transition-all hover:bg-white/10 ${showNavAI ? 'border-dys-amber text-dys-amber' : 'border-gray-800 text-gray-700'}`}
            >
                AI_CORE
            </button>
        </div>
      </header>

      {/* 3. MODULE NAVIGATION (DYSNOMIA CONTEXT) */}
      {activeSystem === System.DYSNOMIA && view !== AppView.SETTINGS && (
        <div className="bg-[#0a0a0a] border-b border-dys-border py-2 px-6 flex items-center gap-2 text-xs shrink-0 overflow-x-auto">
            <span className="text-dys-cyan font-bold mr-4 tracking-widest hidden md:block">MODULE // DYSNOMIA</span>
            <span className="text-gray-800 mr-2 hidden md:block">|</span>
            
            <nav className="flex gap-1">
                {[
                    { id: AppView.DASHBOARD, label: 'BRIDGE' },
                    { id: AppView.LAU, label: 'LAU_SHELL' },
                    { id: AppView.LAU_REGISTRY, label: 'REGISTRY' },
                    { id: AppView.YUE, label: 'YUE_BRIDGE' },
                    { id: AppView.QING, label: 'QING_NAV' },
                    { id: AppView.VOID_CHAT, label: 'COMMS' },
                    { id: AppView.CONTRACT_STUDIO, label: 'ENG' },
                ].map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        className={`px-3 py-1 border transition-all whitespace-nowrap ${
                            view === item.id 
                            ? 'border-dys-cyan text-dys-cyan bg-dys-cyan/10' 
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>
      )}

      {/* 4. MAIN VIEWPORT */}
      <div className="flex-1 flex overflow-hidden relative border-l-4 border-r-4 border-dys-black">
          
          {/* Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-[#000] relative">
             {/* Scanlines restricted to content area */}
             <div className="absolute inset-0 pointer-events-none z-0 opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
             
             <div className="flex-1 overflow-auto z-10">
                {renderContent()}
             </div>
          </main>

          {/* Right Sidebar: AI (Overlay style) */}
          {showNavAI && (
              <aside className="w-80 md:w-96 border-l-2 border-dys-amber/20 z-40 bg-[#050505]">
                  <NavAI userContext={user} addLog={addLog} currentView={view} />
              </aside>
          )}

      </div>

      {/* 5. FOOTER CONSOLE */}
      <div className="h-32 shrink-0 z-50 border-t-2 border-dys-amber bg-black">
          <TerminalLog logs={logs} />
      </div>

    </div>
  );
};

export default App;
