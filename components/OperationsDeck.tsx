
import React, { useState, useEffect, useMemo } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, MAP_ABI, CHEON_ABI, QING_ABI, YUE_ABI, ERC20_ABI } from '../constants';
import { Persistence, SectorData } from '../services/persistenceService';
import { isAddress, formatUnits } from 'ethers';

interface OperationsDeckProps {
  web3: Web3Service | null;
  user: UserContext;
  addLog: (entry: LogEntry) => void;
  onNavigate?: (address: string) => void;
}

const OperationsDeck: React.FC<OperationsDeckProps> = ({ web3, user, addLog, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'FOUNDRY' | 'REACTOR' | 'CONFLICT'>('REACTOR');
  
  // FOUNDRY (Genesis) State
  const [tfAsset, setTfAsset] = useState('');
  const [recentGenesis, setRecentGenesis] = useState<any[]>([]);
  
  // REACTOR (Cheon) State
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [selectedReactorQing, setSelectedReactorQing] = useState<string>('');
  const [reactorStatus, setReactorStatus] = useState<'IDLE' | 'CHARGING' | 'COOLING'>('IDLE');
  const [sectorSearch, setSectorSearch] = useState('');
  
  // TELEMETRY State
  const [telemetry, setTelemetry] = useState({
      hypogram: '0.00',
      epigram: '0.00',
      maiBalance: '0.00',
      lastYield: '0.00'
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
      const load = async () => {
          const s = await Persistence.getAllSectors();
          setSectors(s);
          if (user.currentArea && user.currentArea !== ADDRESSES.VOID) {
              setSelectedReactorQing(user.currentArea);
          } else if (s.length > 0 && !selectedReactorQing) {
              setSelectedReactorQing(s[0].address);
          }
      };
      load();
  }, [user.currentArea, user.mapSync.lastUpdate]); 

  useEffect(() => {
      if (selectedReactorQing && activeTab === 'REACTOR') {
          fetchTelemetry();
      }
  }, [selectedReactorQing, activeTab, user.yue, web3]);

  // Fetch Recent Genesis Events
  useEffect(() => {
      if (activeTab === 'FOUNDRY' && web3) {
          const fetchEvents = async () => {
              try {
                  const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
                  const currentBlock = await web3.getProvider().getBlockNumber();
                  const fromBlock = Math.max(0, currentBlock - 10000); // Scan last 10k blocks safely
                  const events = await map.queryFilter("NewQing", fromBlock, currentBlock);
                  
                  const formatted = await Promise.all(events.reverse().slice(0, 10).map(async (e: any) => {
                      const qing = e.args[0];
                      const asset = e.args[1];
                      let name = "Unknown Sector";
                      try {
                          const qContract = web3.getContract(qing, QING_ABI);
                          name = await qContract.name();
                      } catch {}
                      return { qing, asset, name, block: e.blockNumber };
                  }));
                  setRecentGenesis(formatted);
              } catch (e) {
                  console.warn("Genesis scan failed", e);
              }
          };
          fetchEvents();
      }
  }, [activeTab, web3]);

  const fetchTelemetry = async () => {
      if (!web3 || !user.yue || !user.address || !selectedReactorQing) return null;
      try {
          const yue = web3.getContract(user.yue, YUE_ABI);
          const mai = web3.getContract(ADDRESSES.MAI, ERC20_ABI);

          const [barData, maiBal] = await Promise.all([
              yue.Bar(selectedReactorQing).catch(() => [0n, 0n]),
              mai.balanceOf(user.address).catch(() => 0n)
          ]);

          const stats = {
              hypogram: formatUnits(barData[0], 18),
              epigram: formatUnits(barData[1], 18),
              maiBalance: formatUnits(maiBal, 18),
              rawMai: maiBal,
              rawHypo: barData[0],
              rawEpi: barData[1]
          };

          setTelemetry(prev => ({
              ...prev,
              hypogram: stats.hypogram,
              epigram: stats.epigram,
              maiBalance: stats.maiBalance
          }));

          return stats;
      } catch (e) {
          console.error("Telemetry error", e);
          return null;
      }
  };

  const handleTerraform = async () => {
      if(!web3 || !tfAsset || !isAddress(tfAsset)) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Asset Address.` });
          return;
      }
      setLoading(true);
      try {
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          const tx = await web3.sendTransaction(map, 'New', [tfAsset]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Genesis Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Sector Generated.` });
          setTfAsset('');
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Terraforming Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleCycleReactor = async () => {
      if (!web3 || !selectedReactorQing) return;
      setLoading(true);
      setReactorStatus('CHARGING');
      
      try {
          // 1. Snapshot Pre-State
          const preStats = await fetchTelemetry();

          const cheon = web3.getContract(ADDRESSES.CHEON, CHEON_ABI);
          const tx = await web3.sendTransaction(cheon, 'Su', [selectedReactorQing]);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Reactor Cycle Initiated (Su): ${tx.hash}` });
          
          await web3.waitForReceipt(tx);
          
          // 2. Snapshot Post-State & Diff
          const postStats = await fetchTelemetry();
          
          let logMsg = "Cycle Complete.";
          if (preStats && postStats) {
              const maiDiff = postStats.rawMai - preStats.rawMai;
              const hypoDiff = postStats.rawHypo - preStats.rawHypo;
              const formattedMai = formatUnits(maiDiff, 18);
              const formattedHypo = formatUnits(hypoDiff, 18);
              
              if (maiDiff > 0n) {
                  logMsg += ` Yield: +${formattedMai} MAI.`;
                  setTelemetry(prev => ({ ...prev, lastYield: formattedMai }));
              }
              if (hypoDiff > 0n) {
                  logMsg += ` Pressure Δ: +${formattedHypo} Bar.`;
              }
          }

          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: logMsg });
          
          setReactorStatus('COOLING');
          setTimeout(() => setReactorStatus('IDLE'), 2000);
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Reactor Critical`, details: web3.parseError(e) });
          setReactorStatus('IDLE');
      } finally {
          setLoading(false);
      }
  };

  const forceReset = () => {
      setLoading(false);
      setReactorStatus('IDLE');
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Manual Override: System Reset.` });
  };

  const filteredSectors = useMemo(() => {
        const q = sectorSearch.toLowerCase();
        return sectors.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.symbol.toLowerCase().includes(q) || 
            s.address.toLowerCase().includes(q)
        );
  }, [sectors, sectorSearch]);

  const selectedSectorName = sectors.find(s => s.address === selectedReactorQing)?.name || "UNKNOWN SECTOR";

  return (
    <div className="h-full flex flex-col bg-dys-black p-4 md:p-8 font-mono text-gray-300">
        <div className="flex border-b border-dys-border mb-6">
            <button onClick={() => setActiveTab('REACTOR')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'REACTOR' ? 'bg-dys-gold/20 text-dys-gold border-b-2 border-dys-gold' : 'text-gray-500 hover:text-white'}`}>REACTOR (CHEON)</button>
            <button onClick={() => setActiveTab('FOUNDRY')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'FOUNDRY' ? 'bg-dys-green/20 text-dys-green border-b-2 border-dys-green' : 'text-gray-500 hover:text-white'}`}>FOUNDRY (MAP)</button>
            <button onClick={() => setActiveTab('CONFLICT')} className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'CONFLICT' ? 'bg-dys-red/20 text-dys-red border-b-2 border-dys-red' : 'text-gray-500 hover:text-white'}`}>CONFLICT PROTOCOLS</button>
        </div>

        <div className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full">
            {activeTab === 'REACTOR' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                    <div className="lg:col-span-4 bg-dys-panel border border-dys-border flex flex-col h-[500px] lg:h-auto">
                        <div className="p-3 border-b border-dys-border bg-black/50">
                            <h3 className="text-dys-gold font-bold tracking-widest text-xs mb-2">TARGET SELECTION</h3>
                            <input 
                                className="w-full bg-black border border-dys-border p-2 text-[10px] text-dys-gold focus:border-dys-gold outline-none font-mono mb-2"
                                placeholder="Search Sectors..."
                                value={sectorSearch}
                                onChange={(e) => setSectorSearch(e.target.value)}
                            />
                            <button 
                                onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                                className={`w-full text-[9px] border py-2 font-bold transition-all flex items-center justify-center gap-2 ${user.mapSync.isScanning ? 'bg-dys-red/20 text-dys-red border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/30 hover:bg-dys-green hover:text-black'}`}
                            >
                                <span className={user.mapSync.isScanning ? "animate-spin" : ""}>{user.mapSync.isScanning ? "⟳" : "📡"}</span>
                                {user.mapSync.isScanning ? `SCANNING [${user.mapSync.progress}]` : 'SYNC NETWORK'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {filteredSectors.map(s => {
                                const isSelected = s.address === selectedReactorQing;
                                return (
                                    <button 
                                        key={s.address}
                                        onClick={() => setSelectedReactorQing(s.address)}
                                        className={`w-full text-left p-3 border-l-4 text-xs font-mono transition-all flex justify-between items-center group ${isSelected ? 'border-dys-gold bg-dys-gold/10 text-white' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                    >
                                        <div className="truncate pr-2">
                                            <div className={`font-bold ${isSelected ? 'text-dys-gold' : 'text-gray-400 group-hover:text-white'}`}>{s.name}</div>
                                            <div className="text-[9px] opacity-50">{s.symbol}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="lg:col-span-8 flex flex-col gap-6">
                        <div className="bg-dys-panel border border-dys-gold/30 p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-dys-gold text-black text-[9px] font-bold px-2 py-1">CHEON SYSTEM ONLINE</div>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xl text-dys-gold font-bold tracking-widest">PARTICLE REACTOR</h3>
                                    <div className="text-xs text-white font-bold mt-1">LOCKED TARGET: {selectedSectorName}</div>
                                </div>
                                <button 
                                    onClick={() => onNavigate && onNavigate(selectedReactorQing)}
                                    disabled={!selectedReactorQing}
                                    className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black px-4 py-2 font-bold text-xs disabled:opacity-30"
                                >
                                    OPEN NAV
                                </button>
                            </div>
                            
                            {user.yue ? (
                                <div className="bg-black border border-dys-border p-4 grid grid-cols-2 gap-4 text-xs mb-6">
                                    <div className="col-span-2 text-[10px] text-gray-500 border-b border-gray-800 pb-1 mb-1 flex justify-between">
                                        <span>REACTOR TELEMETRY</span>
                                        <span>VAULT: {user.yue.substring(0, 6)}...</span>
                                    </div>
                                    <div><div className="text-gray-500 mb-1">HYPOGRAM (PRESSURE)</div><div className="text-dys-cyan font-bold font-mono text-sm">{parseFloat(telemetry.hypogram).toFixed(4)}</div></div>
                                    <div><div className="text-gray-500 mb-1">EPIGRAM (POTENTIAL)</div><div className="text-purple-400 font-bold font-mono text-sm">{parseFloat(telemetry.epigram).toFixed(4)}</div></div>
                                    <div className="col-span-2 bg-dys-gold/5 p-2 border border-dys-gold/20"><div className="flex justify-between items-center"><div className="text-dys-gold font-bold">MAI YIELD</div><div className="text-white font-mono">{parseFloat(telemetry.maiBalance).toFixed(4)}</div></div></div>
                                </div>
                            ) : (
                                <div className="text-center text-xs text-dys-red p-4 border border-dys-red bg-dys-red/5 mb-6">[WARNING] NO YUE VAULT LINKED. REACTOR INACTIVE.</div>
                            )}

                            <div>
                                <button onClick={handleCycleReactor} disabled={loading || !selectedReactorQing || !user.yue} className={`w-full py-6 font-bold text-sm tracking-[0.2em] transition-all relative overflow-hidden group ${reactorStatus === 'CHARGING' ? 'bg-dys-gold text-black cursor-wait' : reactorStatus === 'COOLING' ? 'bg-dys-cyan text-black' : 'bg-dys-gold/10 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                                    <span className="relative z-10">{reactorStatus === 'CHARGING' ? 'CYCLING...' : reactorStatus === 'COOLING' ? 'COOLING DOWN' : 'CYCLE REACTOR'}</span>
                                </button>
                                {loading && <button onClick={forceReset} className="w-full mt-2 text-[9px] text-dys-red hover:text-white uppercase font-bold border border-transparent hover:border-dys-red py-1">[ EMERGENCY RESET ]</button>}
                            </div>
                        </div>

                        <div className="border border-dys-border bg-black p-6 flex flex-col items-center justify-center relative flex-1 min-h-[300px]">
                            <pre className={`text-[10px] leading-none font-bold transition-colors duration-500 select-none ${reactorStatus === 'CHARGING' ? 'text-white animate-pulse' : reactorStatus === 'COOLING' ? 'text-dys-cyan' : 'text-dys-gold/50'}`}>
{`
       .---.
      /     \\
     |  ( )  |
      \\     /
       '---'
      /  |  \\
     /   |   \\
    /    |    \\
   /     |     \\
  /______|______\\
  |      |      |
  | [##] | [##] |
  |______|______|
`}
                            </pre>
                             <div className="mt-4 text-center z-10 bg-black/80 px-4 py-1">
                                <div className="text-xs text-gray-500">CORE STATUS</div>
                                <div className={`text-lg font-bold ${reactorStatus === 'IDLE' ? 'text-gray-400' : reactorStatus === 'CHARGING' ? 'text-white' : 'text-dys-cyan'}`}>{reactorStatus}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* ... (Foundry and Conflict tabs remain the same) */}
            {activeTab === 'FOUNDRY' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <div className="bg-dys-panel border border-dys-green/30 p-8 space-y-6">
                        <div>
                            <h3 className="text-xl text-dys-green font-bold mb-2 tracking-widest">SECTOR GENESIS</h3>
                            <p className="text-xs text-gray-500">Wrap an ERC20 asset to create a new QING territory on the map. Requires CHO registration.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] text-dys-green font-bold uppercase">Seed Asset Address</label>
                            <input className="w-full bg-black border border-dys-green/50 p-3 text-sm text-white focus:border-dys-green outline-none font-mono" placeholder="0x..." value={tfAsset} onChange={(e) => setTfAsset(e.target.value)} />
                        </div>
                        <button onClick={handleTerraform} disabled={loading || !tfAsset} className="w-full py-4 bg-dys-green/10 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black font-bold text-xs tracking-widest transition-all">{loading ? 'TERRAFORMING...' : 'INITIATE GENESIS'}</button>
                     </div>
                     <div className="border border-dys-border bg-black p-6 flex flex-col">
                         <h4 className="text-xs text-gray-500 font-bold uppercase mb-4 border-b border-gray-800 pb-2">RECENT EXPANSIONS</h4>
                         <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] scrollbar-thin">
                             {recentGenesis.map((g, idx) => (
                                 <div key={idx} className="p-3 border-l-2 border-dys-green bg-dys-green/5 hover:bg-dys-green/10 transition-colors">
                                     <div className="flex justify-between items-start"><span className="text-xs font-bold text-dys-green">{g.name}</span><span className="text-[9px] text-gray-500">BLK {g.block}</span></div>
                                     <div className="text-[10px] text-gray-600 font-mono mt-1">{g.qing}</div>
                                 </div>
                             ))}
                         </div>
                     </div>
                </div>
            )}
            
            {activeTab === 'CONFLICT' && (
                <div className="flex flex-col items-center justify-center h-[50vh] border border-dys-red/20 bg-dys-red/5 p-10 text-center">
                    <div className="text-6xl text-dys-red opacity-50 mb-6">⚠</div>
                    <h2 className="text-2xl text-dys-red font-bold tracking-widest mb-2">SYSTEM OFFLINE</h2>
                </div>
            )}
        </div>
    </div>
  );
};

export default OperationsDeck;
