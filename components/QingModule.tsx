import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, QING_ABI, MAP_ABI, ERC20_ABI, LAU_ABI } from '../constants';
import { formatEther, isAddress, ZeroAddress } from 'ethers';
import VoidChat from './VoidChat';

interface QingModuleProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
}

interface SectorInfo {
    name: string;
    symbol: string;
    address: string;
    integrative: string; // Asset address
    waat: string;
    isSystem: boolean;
}

interface SectorDetails {
    isAdmitted: boolean;
    coverCharge: bigint;
    assetSymbol: string;
    assetAddress: string;
    // User wallet details
    userBalance: bigint;
    userAllowance: bigint;
    // LAU details (Critical for Transit)
    lauAssetBalance: bigint;
}

const QingModule: React.FC<QingModuleProps> = ({ user, web3, addLog, setUser }) => {
  const [mode, setMode] = useState<'NAV' | 'TERRAFORM'>('NAV');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // Navigation State
  const [searchQuery, setSearchQuery] = useState('');
  const [sectors, setSectors] = useState<SectorInfo[]>([
      { name: 'VOID_ROOT', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" }
  ]);
  
  // Selection State
  const [selectedSector, setSelectedSector] = useState<SectorInfo | null>(null);
  const [sectorDetails, setSectorDetails] = useState<SectorDetails | null>(null);
  
  // Terraform State
  const [tfAsset, setTfAsset] = useState('');

  // Initial Scan (Lightweight)
  useEffect(() => {
      if(!web3) return;
      // Scan last 50k blocks automatically on mount
      scanMap(50000); 
  }, [web3]);

  // Refresh user's current area after operations
  const refreshUserLocation = async () => {
      if (!web3 || !user.lauAddress) return;
      try {
          const lau = web3.getContract(user.lauAddress, LAU_ABI);
          const currentArea = await lau.CurrentArea();
          setUser(prev => ({ ...prev, currentArea }));
      } catch (e) {
          console.error("Failed to refresh location", e);
      }
  };

  const scanMap = async (blocksBack: number) => {
      if(!web3) return;
      setIsScanning(true);
      
      try {
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          const currentBlock = await web3.getProvider().getBlockNumber();
          
          // Genesis of Map Contract or User specified range
          const GENESIS_BLOCK = 22813947; 
          const startBlock = Math.max(GENESIS_BLOCK, currentBlock - blocksBack);
          
          const CHUNK_SIZE = 5000; // Conservative chunk size
          const allEvents: any[] = [];
          const filter = map.filters.NewQing();

          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Scanning Sector Map: Blocks ${startBlock} to ${currentBlock}...` });

          for (let i = startBlock; i <= currentBlock; i += CHUNK_SIZE) {
              const to = Math.min(i + CHUNK_SIZE - 1, currentBlock);
              try {
                  const events = await map.queryFilter(filter, i, to);
                  allEvents.push(...events);
                  // Artificial delay to prevent RPC rate limiting
                  await new Promise(r => setTimeout(r, 100));
              } catch (err) {
                  console.warn(`Chunk failed: ${i}-${to}`);
              }
          }
          
          if(allEvents.length === 0) {
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `No new sectors found in range.` });
          } else {
               const foundSectors: SectorInfo[] = await Promise.all(allEvents.map(async (e: any) => {
                  const qingAddress = e.args[0];
                  const integrative = e.args[1];
                  const waat = e.args[2];
                  
                  // Fetch basic info
                  let name = "Unknown Sector";
                  let symbol = "UNK";
                  try {
                      // Optimization: Basic check if address exists
                      const qing = web3.getContract(qingAddress, QING_ABI);
                      name = await qing.name();
                      symbol = await qing.symbol();
                  } catch {}

                  return {
                      address: qingAddress,
                      integrative,
                      waat: waat.toString(),
                      name,
                      symbol,
                      isSystem: false
                  };
              }));

              setSectors(prev => {
                  const map = new Map<string, SectorInfo>();
                  prev.forEach(s => map.set(s.address.toLowerCase(), s));
                  foundSectors.forEach(s => map.set(s.address.toLowerCase(), s));
                  return Array.from(map.values());
              });
              
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Map Updated: ${foundSectors.length} Sectors Found.` });
          }

      } catch(e: any) {
          console.warn("Scanning failed", e);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Sector Scan Failed`, details: e.message });
      } finally {
          setIsScanning(false);
      }
  };

  // Fetch Details when a sector is selected
  useEffect(() => {
      if(!web3 || !selectedSector || !user.lauAddress || !user.address) {
          setSectorDetails(null);
          return;
      }
      
      if(selectedSector.isSystem) return;

      const fetchDetails = async () => {
          try {
              const qing = web3.getContract(selectedSector.address, QING_ABI);
              const asset = web3.getContract(selectedSector.integrative, ERC20_ABI);
              
              const [admitted, cover, symbol, balance, allowance, lauBalance] = await Promise.all([
                  qing.Admitted(user.lauAddress).catch(() => false),
                  qing.CoverCharge().catch(() => 0n),
                  asset.symbol().catch(() => "???"),
                  asset.balanceOf(user.address).catch(() => 0n),
                  asset.allowance(user.address, selectedSector.address).catch(() => 0n),
                  // Critical: Check if the LAU itself has the asset needed for cover charge
                  asset.balanceOf(user.lauAddress).catch(() => 0n)
              ]);

              setSectorDetails({
                  isAdmitted: admitted,
                  coverCharge: cover,
                  assetSymbol: symbol,
                  assetAddress: selectedSector.integrative,
                  userBalance: balance,
                  userAllowance: allowance,
                  lauAssetBalance: lauBalance
              });

          } catch(e) {
              console.error("Detail fetch failed", e);
          }
      };
      fetchDetails();
  }, [selectedSector, web3, user.lauAddress, user.address, loading]);

  // Filter Sectors
  const filteredSectors = sectors.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- ACTIONS ---

  const transferToLau = async () => {
      if(!web3 || !sectorDetails || !user.lauAddress || !selectedSector) return;
      setLoading(true);
      
      const needed = sectorDetails.coverCharge - sectorDetails.lauAssetBalance;
      if (needed <= 0n) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Hull already has sufficient mass.` });
          setLoading(false);
          return;
      }

      if (sectorDetails.userBalance < needed) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Insufficient balance. Need ${formatEther(needed)} ${sectorDetails.assetSymbol}` });
          setLoading(false);
          return;
      }

      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Transferring ${formatEther(needed)} ${sectorDetails.assetSymbol} to LAU Hull...` });

      try {
          const asset = web3.getContract(sectorDetails.assetAddress, ERC20_ABI);
          const tx = await web3.sendTransaction(asset, 'transfer', [user.lauAddress, needed]);
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Cargo Secured in LAU.` });
          
          // Refresh details
          await new Promise(r => setTimeout(r, 1000));
          setLoading(false);
          setLoading(true); // Trigger re-fetch
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transfer Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const approveAsset = async () => {
      if(!web3 || !selectedSector || !sectorDetails) return;
      setLoading(true);
      try {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Approving ${sectorDetails.assetSymbol} for QING contract...` });
          
          const tx = await web3.approve(selectedSector.integrative, selectedSector.address);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Approval tx: ${tx.hash}` });
          
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Approval Granted.` });
          
          // Refresh details
          await new Promise(r => setTimeout(r, 1000));
          setLoading(false);
          setLoading(true); // Trigger re-fetch
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Approval Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const payCover = async () => {
      if(!web3 || !selectedSector || !user.lauAddress) return;
      setLoading(true);
      try {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Paying cover charge...` });
          
          const qing = web3.getContract(selectedSector.address, QING_ABI);
          const tx = await web3.sendTransaction(qing, 'Join', [user.lauAddress]);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Cover payment tx: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Admission Granted.` });
          
          // Refresh details
          await new Promise(r => setTimeout(r, 1000));
          setLoading(false);
          setLoading(true); // Trigger re-fetch
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Cover Payment Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const transit = async (target: string) => {
      if(!web3 || !user.lauAddress) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Pilot Identity Required.` });
          return;
      }
      setLoading(true);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Initiating Transit Sequence to ${target.substring(0,8)}...` });

      try {
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          
          // Pre-flight validation for non-VOID targets
          if (!target.toLowerCase().includes(ADDRESSES.VOID.toLowerCase()) && sectorDetails) {
              if (!sectorDetails.isAdmitted) {
                  throw new Error("Admittance Denied. Must pay cover charge first via Join().");
              }
              if (sectorDetails.lauAssetBalance < sectorDetails.coverCharge) {
                  throw new Error(`Insufficient Hull Mass. LAU needs ${formatEther(sectorDetails.coverCharge)} ${sectorDetails.assetSymbol}.`);
              }
          }

          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Calling MAP.Enter(${user.lauAddress}, ${target})...` });
          
          const tx = await web3.sendTransaction(map, 'Enter', [user.lauAddress, target]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Transit initiated: ${tx.hash}` });
          
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Transit Complete!` });
          
          // CRITICAL: Refresh user's location after successful transit
          await refreshUserLocation();
          
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transit Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const terraform = async () => {
      if(!web3 || !tfAsset || !isAddress(tfAsset)) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Asset Address.` });
          return;
      }
      
      const exists = sectors.find(s => s.integrative.toLowerCase() === tfAsset.toLowerCase());
      if(exists) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Asset already terraformed: ${exists.name}` });
          return;
      }

      setLoading(true);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Initializing MAP Generation...` });
      
      try {
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          const tx = await web3.sendTransaction(map, 'New', [tfAsset]);
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Sector Generated. You are now the Architect.` });
          setTfAsset('');
          
          // Rescan to pick up new sector
          await scanMap(10000);
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Terraforming Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const isCurrentLocation = (addr: string) => {
      const current = user.currentArea || ADDRESSES.VOID;
      return current.toLowerCase() === addr.toLowerCase();
  };

  return (
    <div className="h-full p-6 font-mono text-gray-300">
         <div className="w-full h-full max-w-6xl mx-auto flex flex-col gap-4">
            
            {/* Header */}
            <div className="flex border-b border-dys-border bg-black">
                 <button 
                    onClick={() => setMode('NAV')}
                    className={`px-6 py-3 font-bold text-sm flex items-center gap-2 border-r border-dys-border transition-colors ${mode === 'NAV' ? 'text-dys-cyan bg-dys-cyan/10' : 'text-gray-600 hover:text-white'}`}
                 >
                     <span>🔭</span> NAV_COMPUTER
                 </button>
                 <button 
                    onClick={() => setMode('TERRAFORM')}
                    className={`px-6 py-3 font-bold text-sm flex items-center gap-2 border-r border-dys-border transition-colors ${mode === 'TERRAFORM' ? 'text-dys-green bg-dys-green/10' : 'text-gray-600 hover:text-white'}`}
                 >
                     <span>🌱</span> TERRAFORM
                 </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                
                {/* LEFT: SECTOR LIST (FREQUENCY TUNER) */}
                <div className="w-full md:w-1/3 bg-dys-panel border border-dys-border flex flex-col h-full">
                    {mode === 'NAV' && (
                        <>
                            <div className="p-4 border-b border-dys-border bg-black">
                                <h2 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">FREQUENCY_TUNER</h2>
                                <input 
                                    className="w-full bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none font-mono placeholder-gray-700"
                                    placeholder="Search Sectors..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {/* DEEP SCAN BUTTON */}
                                <button 
                                    onClick={() => scanMap(10000000)} // Scan from Genesis
                                    disabled={isScanning}
                                    className="w-full mt-2 text-[10px] bg-dys-cyan/10 text-dys-cyan border border-dys-cyan/30 py-1 hover:bg-dys-cyan hover:text-black transition-colors disabled:opacity-50"
                                >
                                    {isScanning ? 'SCANNING GEOMETRY...' : 'INITIATE DEEP SCAN'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                                {filteredSectors.map((sector) => (
                                    <button
                                        key={sector.address}
                                        onClick={() => setSelectedSector(sector)}
                                        className={`w-full text-left p-3 border transition-all flex justify-between items-center ${
                                            selectedSector?.address === sector.address
                                            ? 'border-dys-cyan bg-dys-cyan/10'
                                            : 'border-transparent hover:bg-white/5'
                                        }`}
                                    >
                                        <div>
                                            <div className={`font-bold text-xs ${selectedSector?.address === sector.address ? 'text-dys-cyan' : 'text-gray-300'}`}>
                                                {sector.name}
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-mono">
                                                {sector.isSystem ? "SYSTEM_ROOT" : `${sector.symbol} :: ${sector.address.substring(0,6)}...`}
                                            </div>
                                        </div>
                                        {isCurrentLocation(sector.address) && (
                                            <span className="text-[9px] bg-dys-green text-black px-2 py-0.5 font-bold animate-pulse">LOC</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    
                    {mode === 'TERRAFORM' && (
                        <div className="p-6 space-y-6">
                            <div className="text-xs text-gray-400">
                                <h3 className="text-dys-green font-bold text-sm mb-2">GENERATE NEW SECTOR</h3>
                                <p>Provide an Asset Address (Integrative) to spawn a new QING Sector via the MAP contract.</p>
                                <p className="mt-2 text-dys-gold italic border-l-2 border-dys-gold pl-2">
                                    Warning: As the creator, you become the Architect. You are responsible for setting the physics (Cover Charge) of this reality.
                                </p>
                            </div>
                            <div>
                                <label className="text-[10px] text-dys-green font-bold uppercase">Integrative Asset</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm text-white focus:border-dys-green outline-none mt-1"
                                    placeholder="0x..."
                                    value={tfAsset}
                                    onChange={(e) => setTfAsset(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={terraform}
                                disabled={loading}
                                className="w-full bg-dys-green/10 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black py-3 font-bold transition-all text-xs tracking-wider disabled:opacity-50"
                            >
                                {loading ? 'TERRAFORMING...' : 'INITIATE GENESIS'}
                            </button>
                        </div>
                    )}
                </div>

                {/* RIGHT: COMMAND & COMMS PANEL */}
                <div className="flex-1 bg-black border border-dys-cyan/30 relative overflow-hidden flex flex-col">
                    
                    {selectedSector ? (
                        <div className="flex-col h-full flex">
                            
                            {/* COCKPIT / TRANSIT CONTROLS */}
                            <div className="bg-dys-panel border-b border-dys-border p-4 shrink-0">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h2 className="text-xl text-white font-bold">{selectedSector.name}</h2>
                                        <div className="text-xs text-dys-cyan font-mono">{selectedSector.address}</div>
                                    </div>
                                    
                                    <div className="flex gap-2 flex-wrap">
                                        {selectedSector.isSystem ? (
                                            <button 
                                                onClick={() => transit(selectedSector.address)}
                                                disabled={loading || isCurrentLocation(selectedSector.address)}
                                                className="px-6 py-2 bg-purple-500/20 text-purple-400 border border-purple-500 hover:bg-purple-500 hover:text-white font-bold text-xs tracking-widest transition-all disabled:opacity-50"
                                            >
                                                {isCurrentLocation(selectedSector.address) ? 'LOCATION_SECURE' : 'TRANSIT TO VOID'}
                                            </button>
                                        ) : sectorDetails && (
                                            <>
                                                {isCurrentLocation(selectedSector.address) ? (
                                                    <button 
                                                        onClick={() => transit(ADDRESSES.VOID)}
                                                        disabled={loading}
                                                        className="px-6 py-2 bg-dys-red/20 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs tracking-widest transition-all"
                                                    >
                                                        EXIT SECTOR
                                                    </button>
                                                ) : (
                                                    <>
                                                        {!sectorDetails.isAdmitted && (
                                                            sectorDetails.coverCharge > 0n && sectorDetails.userAllowance < sectorDetails.coverCharge ? (
                                                                <button 
                                                                    onClick={approveAsset} 
                                                                    disabled={loading} 
                                                                    className="px-4 py-2 bg-dys-gold/20 text-dys-gold border border-dys-gold font-bold text-xs hover:bg-dys-gold hover:text-black transition-all"
                                                                >
                                                                    APPROVE {sectorDetails.assetSymbol}
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    onClick={payCover} 
                                                                    disabled={loading || (sectorDetails.coverCharge > 0n && sectorDetails.userBalance < sectorDetails.coverCharge)} 
                                                                    className="px-4 py-2 bg-dys-red/20 text-dys-red border border-dys-red font-bold text-xs hover:bg-dys-red hover:text-black transition-all disabled:opacity-50"
                                                                    title={sectorDetails.userBalance < sectorDetails.coverCharge ? `Need ${formatEther(sectorDetails.coverCharge)} ${sectorDetails.assetSymbol}` : ''}
                                                                >
                                                                    PAY COVER ({formatEther(sectorDetails.coverCharge)})
                                                                </button>
                                                            )
                                                        )}

                                                        {sectorDetails.isAdmitted && (
                                                            sectorDetails.lauAssetBalance < sectorDetails.coverCharge ? (
                                                                <button 
                                                                    onClick={transferToLau}
                                                                    disabled={loading}
                                                                    className="px-4 py-2 bg-dys-gold/20 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black font-bold text-xs animate-pulse"
                                                                    title={`LAU needs ${formatEther(sectorDetails.coverCharge)} ${sectorDetails.assetSymbol} to enter`}
                                                                >
                                                                    ⚠ TRANSFER CARGO TO LAU
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    onClick={() => transit(selectedSector.address)}
                                                                    disabled={loading}
                                                                    className="px-6 py-2 bg-dys-cyan/20 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black font-bold text-xs tracking-widest transition-all disabled:opacity-50"
                                                                >
                                                                    INITIATE TRANSIT
                                                                </button>
                                                            )
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {!selectedSector.isSystem && sectorDetails && (
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px] font-mono border-t border-gray-800 pt-2">
                                        <div>
                                            <span className="text-gray-500">COVER:</span> <span className="text-white">{formatEther(sectorDetails.coverCharge)} {sectorDetails.assetSymbol}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">WALLET:</span> <span className="text-white">{Number(formatEther(sectorDetails.userBalance)).toFixed(2)}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">LAU_HULL:</span> <span className={sectorDetails.lauAssetBalance < sectorDetails.coverCharge ? "text-dys-red font-bold" : "text-dys-green"}>{Number(formatEther(sectorDetails.lauAssetBalance)).toFixed(2)}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">STATUS:</span> <span className={sectorDetails.isAdmitted ? "text-dys-green" : "text-dys-red"}>{sectorDetails.isAdmitted ? "ADMITTED" : "RESTRICTED"}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* COMMS / VOID CHAT INTEGRATION */}
                            <div className="flex-1 relative overflow-hidden">
                                <VoidChat 
                                    web3={web3!} 
                                    viewAddress={selectedSector.address}
                                    lauArea={user.currentArea} 
                                    lauAddress={user.lauAddress}
                                    addLog={addLog}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                            <div className="text-4xl mb-4 opacity-30">📡</div>
                            <div className="text-sm">SELECT A SECTOR TO ESTABLISH LINK</div>
                        </div>
                    )}
                </div>
            </div>
         </div>
    </div>
  );
};

export default QingModule;