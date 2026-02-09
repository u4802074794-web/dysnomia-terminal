import React, { useState, useEffect, useRef } from 'react';
import { UserContext, LogEntry, AppView } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, QING_ABI, MAP_ABI, ERC20_ABI, LAU_ABI, YUE_ABI, DYSNOMIA_ABIS, CHO_ABI } from '../constants';
import { isAddress, ZeroAddress, formatUnits } from 'ethers';
import VoidChat from './VoidChat';
import { Persistence, SectorData, ChannelMeta, ExportMode } from '../services/persistenceService';

interface QingModuleProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
  setView?: (view: AppView) => void;
  onViewIdentity?: (id: string) => void;
}

interface SectorDetails {
    isAdmitted: boolean;
    coverCharge: bigint;
    assetSymbol: string;
    assetAddress: string;
    userBalance: bigint;
    userAllowance: bigint;
    owner: string;
}

export const QingModule: React.FC<QingModuleProps> = ({ user, web3, addLog, setUser, onViewIdentity }) => {
  const [mode, setMode] = useState<'NAV' | 'GENESIS' | 'IO'>('NAV');
  const [sectorView, setSectorView] = useState<'COMMS' | 'OPERATIONS' | 'GOVERNANCE'>('COMMS');
  const [loading, setLoading] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sectors, setSectors] = useState<SectorData[]>([
      { name: 'VOID_ROOT', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" }
  ]);
  
  const [selectedSector, setSelectedSector] = useState<SectorData | null>(null);
  const [sectorDetails, setSectorDetails] = useState<SectorDetails | null>(null);
  const [transitState, setTransitState] = useState<string>('CHECKING');
  
  const [tfAsset, setTfAsset] = useState('');
  const [isChoRegistered, setIsChoRegistered] = useState(false);

  const [opInputA, setOpInputA] = useState('');
  const [opInputB, setOpInputB] = useState('');
  const [newCoverCharge, setNewCoverCharge] = useState('');

  const [dataVersion, setDataVersion] = useState(0);
  const [channelMeta, setChannelMeta] = useState<ChannelMeta | null>(null);
  const [mapMeta, setMapMeta] = useState<ChannelMeta | null>(null);
  const [chatGapRequest, setChatGapRequest] = useState<{start: number, end: number} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Sectors
  useEffect(() => {
      const loadLocal = async () => {
          const savedSectors = await Persistence.getAllSectors();
          const map = new Map<string, SectorData>();
          map.set(ADDRESSES.VOID.toLowerCase(), { name: 'VOID_ROOT', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" });
          
          if (savedSectors.length > 0) {
              savedSectors.forEach(s => map.set(s.address.toLowerCase(), s));
          }
          setSectors(Array.from(map.values()));
          
          const mm = await Persistence.getChannelMeta(ADDRESSES.MAP);
          setMapMeta(mm);

          const savedAddr = sessionStorage.getItem('dys_selected_sector');
          if (savedAddr) {
              const restored = map.get(savedAddr.toLowerCase());
              if (restored) setSelectedSector(restored);
          } else {
              setSelectedSector(map.get(ADDRESSES.VOID.toLowerCase()) || null);
          }
      };
      loadLocal();
  }, [dataVersion, user.mapSync.isScanning]); // Reload when scan status changes (finished)

  useEffect(() => {
      if (selectedSector) {
          sessionStorage.setItem('dys_selected_sector', selectedSector.address);
          Persistence.getChannelMeta(selectedSector.address).then(setChannelMeta);
      }
  }, [selectedSector]);

  useEffect(() => {
      Persistence.getChannelMeta(ADDRESSES.MAP).then(setMapMeta);
  }, [mode, user.mapSync.isScanning]);

  // Check CHO Registration Status
  useEffect(() => {
      const checkCho = async () => {
          if (!web3 || !user.address || !user.lauAddress) {
              setIsChoRegistered(false);
              return;
          }
          try {
              const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
              const registeredLau = await cho.GetUserTokenAddress(user.address);
              setIsChoRegistered(registeredLau.toLowerCase() === user.lauAddress.toLowerCase());
          } catch(e) { setIsChoRegistered(false); }
      };
      checkCho();
  }, [web3, user.address, user.lauAddress]);

  const refreshUserLocation = async () => {
      if (!web3 || !user.lauAddress) return;
      try {
          const lau = web3.getContract(user.lauAddress, LAU_ABI);
          const currentArea = await lau.CurrentArea();
          setUser(prev => ({ ...prev, currentArea }));
      } catch (e) { console.error("Loc refresh failed", e); }
  };

  // 5. Fetch Details & Perform A Priori Checks
  useEffect(() => {
      if(!web3 || !selectedSector || !user.lauAddress || !user.address) {
          setSectorDetails(null);
          setTransitState('IDLE');
          return;
      }
      
      setTransitState('CHECKING');
      setSectorDetails(null);

      const isCurrent = user.currentArea && selectedSector.address.toLowerCase() === user.currentArea.toLowerCase();
      
      if(selectedSector.address === ADDRESSES.VOID) {
          if (user.currentArea && user.currentArea !== ADDRESSES.VOID) {
             setTransitState('READY_TO_LEAVE'); 
          } else {
             setTransitState('CURRENT_LOCATION'); 
          }
          return;
      }
      
      if(isCurrent) {
           setTransitState('CURRENT_LOCATION');
      }

      const checkAdmittance = async () => {
          try {
              const qing = web3.getContract(selectedSector.address, QING_ABI);
              const [admitted, cover, assetAddress, owner] = await Promise.all([
                  qing.Admitted(user.lauAddress).catch(() => false),
                  qing.CoverCharge().catch(() => 0n),
                  qing.Asset().catch(() => ZeroAddress),
                  qing.owner().catch(() => ZeroAddress)
              ]);

              let assetSymbol = "???";
              let userBalance = 0n;
              let userAllowance = 0n;

              if (assetAddress && assetAddress !== ZeroAddress) {
                  const asset = web3.getContract(assetAddress, ERC20_ABI);
                  [assetSymbol, userBalance, userAllowance] = await Promise.all([
                      asset.symbol().catch(() => "UNK"),
                      asset.balanceOf(user.address).catch(() => 0n),
                      web3.checkAllowance(assetAddress, user.address, selectedSector.address),
                  ]);
              }

              const details = {
                  isAdmitted: admitted,
                  coverCharge: cover,
                  assetSymbol,
                  assetAddress,
                  userBalance,
                  userAllowance,
                  owner
              };
              setSectorDetails(details);

              if (isCurrent) {
                  setTransitState('CURRENT_LOCATION');
                  return;
              }

              if (!admitted) {
                  if (cover > 0n) {
                      if (userBalance < cover) {
                          setTransitState('INSUFFICIENT_FUNDS');
                      } else if (userAllowance < cover) {
                          setTransitState('NEEDS_APPROVAL');
                      } else {
                          setTransitState('READY_TO_ENTER');
                      }
                  } else {
                      setTransitState('READY_TO_ENTER');
                  }
              } else {
                  setTransitState('READY_TO_ENTER');
              }

          } catch(e: any) {
              console.error("Admittance check failed", e);
              setTransitState('SYSTEM_ERROR');
          }
      };

      checkAdmittance();
  }, [selectedSector, web3, user.lauAddress, user.address, loading, user.currentArea]);

  const filteredSectors = sectors.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = async (mode: ExportMode, addr?: string) => {
      try {
          const json = await Persistence.exportData(mode, addr);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `dysnomia_${mode}_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Export [${mode}] Complete.` });
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Export Failed: ${e.message}` });
      }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              setLoading(true);
              const result = await Persistence.importData(event.target?.result as string);
              setLoading(false);
              setDataVersion(prev => prev + 1);
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Imported: ${result.sectorsAdded} Sectors, ${result.messagesAdded} Msgs.` });
          } catch(e: any) {
              setLoading(false);
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Import Failed: ${e.message}` });
          }
      };
      reader.readAsText(file);
  };

  const handleResetMap = async () => {
      if (window.confirm("WARNING: This will clear all map data and sectors. Proceed?")) {
          await Persistence.clearMapData(ADDRESSES.MAP);
          setSectors([{ name: 'VOID_ROOT', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" }]);
          setMapMeta(null);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Map Data Purged.` });
      }
  };

  const handlePurgeChat = async () => {
      if (!selectedSector) return;
      if (window.confirm(`WARNING: Clear all chat history for ${selectedSector.name}?`)) {
          await Persistence.clearChatHistory(selectedSector.address);
          setChannelMeta(null);
          setDataVersion(prev => prev + 1); 
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Chat History Purged for ${selectedSector.name}.` });
      }
  };

  const approveEntry = async () => {
      if(!web3 || !sectorDetails || !sectorDetails.assetAddress || !selectedSector) return;
      setLoading(true);
      try {
          const tx = await web3.approve(sectorDetails.assetAddress, selectedSector.address);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Authorization Signal Sent (Approve): ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Allowance Granted for Admittance.` });
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Approval Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const joinSector = async () => {
      if(!user.lauAddress || !selectedSector || !web3) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Pilot Identity Required.` });
          return;
      }
      setLoading(true);
      try {
          const qing = web3.getContract(selectedSector.address, QING_ABI);
          const isAdmitted = sectorDetails?.isAdmitted;
          const msg = isAdmitted ? `Re-Entering ${selectedSector.name} (Admitted)` : `Joining ${selectedSector.name} (Payment/Gas)`;
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: msg });
          const tx = await web3.sendTransaction(qing, 'Join', [user.lauAddress]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Join Vector Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Arrival Confirmed at ${selectedSector.name}` });
          await refreshUserLocation();
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Join Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const leaveSector = async () => {
       if(!user.lauAddress || !web3) return;
       setLoading(true);
       try {
          const lau = web3.getContract(user.lauAddress, LAU_ABI);
          const tx = await web3.sendTransaction(lau, 'Leave', []);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Egress Vector Initiated (LAU): ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Departure Complete. Returned to VOID.` });
          await refreshUserLocation();
       } catch(e: any) {
           addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Departure Failed`, details: web3.parseError(e) });
       } finally {
           setLoading(false);
       }
  };

  const terraform = async () => {
      if(!web3 || !tfAsset || !isAddress(tfAsset)) return;
      setLoading(true);
      if(!isChoRegistered) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Genesis Failed: Pilot must be registered in CHO.` });
          setLoading(false);
          return;
      }
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

  const handleOperation = async (type: 'REACT' | 'ALPHA' | 'BETA') => {
      if (!web3 || !selectedSector || !user.yue) return;
      setLoading(true);
      try {
          let tx;
          if (type === 'REACT') {
             const yue = web3.getContract(user.yue, YUE_ABI);
             tx = await web3.sendTransaction(yue, 'React', [selectedSector.address]);
          } else if (type === 'ALPHA') {
             const zhou = web3.getContract(ADDRESSES.ZHOU || selectedSector.address, DYSNOMIA_ABIS.ZHOU);
             tx = await web3.sendTransaction(zhou, 'Alpha', [opInputA, opInputB]);
          } else if (type === 'BETA') {
             const yi = web3.getContract(ADDRESSES.YI || selectedSector.address, DYSNOMIA_ABIS.YI);
             tx = await web3.sendTransaction(yi, 'Beta', [opInputA, opInputB]);
          }
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `${type} Operation Initiated: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `${type} Sequence Complete.` });
      } catch (e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `${type} Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleGovernance = async (action: 'ADMITTANCE' | 'CHARGE') => {
      if (!web3 || !selectedSector) return;
      setLoading(true);
      try {
          const qing = web3.getContract(selectedSector.address, QING_ABI);
          let tx;
          if (action === 'ADMITTANCE') {
               if (!isAddress(opInputA)) throw new Error("Invalid Target Address");
               tx = await web3.sendTransaction(qing, 'SetAdmittance', [opInputA, true]);
          } else {
               tx = await web3.sendTransaction(qing, 'SetCoverCharge', [newCoverCharge]);
          }
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Governance Protocol Updated.` });
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Governance Failed`, details: web3.parseError(e) });
      } finally {
          setLoading(false);
      }
  };

  const handleChatProgress = async () => {
      if (selectedSector) {
          const m = await Persistence.getChannelMeta(selectedSector.address);
          setChannelMeta(m);
      }
  };

  const renderTopology = (meta: ChannelMeta | null) => {
      if (!meta) return <div className="text-[10px] text-gray-500 italic">No Data.</div>;
      
      const ranges = [...meta.scannedRanges].sort((a,b) => b.start - a.start); 
      const elements: React.ReactNode[] = [];
      let lastStart = 999999999; 
      
      ranges.forEach((range, i) => {
          if (lastStart < 999999999 && lastStart > range.end + 1) {
              const gapStart = range.end + 1;
              const gapEnd = lastStart - 1;
              elements.push(
                  <div key={`gap-${i}`} className="flex justify-between items-center text-[9px] bg-dys-red/10 border-l-2 border-dashed border-dys-red p-1 my-1">
                      <span className="text-dys-red">MISSING: {gapEnd - gapStart} BLKS</span>
                  </div>
              );
          }
          
          elements.push(
              <div key={`range-${i}`} className="flex justify-between text-[10px] font-mono bg-dys-green/10 p-1 px-2 border-l-2 border-dys-green">
                  <span>BLK: {range.start}</span>
                  <span className="text-dys-green">↔</span>
                  <span>{range.end}</span>
              </div>
          );
          lastStart = range.start;
      });

      return <div className="space-y-1 mt-2">{elements}</div>;
  };

  const isOwner = user.lauAddress && sectorDetails?.owner && user.lauAddress.toLowerCase() === sectorDetails.owner.toLowerCase();
  const isCurrentLocation = (addr: string) => {
    if (!user.currentArea) return false;
    return user.currentArea.toLowerCase() === addr.toLowerCase();
  };

  const renderTransitPanel = () => {
      if(loading || transitState === 'CHECKING') {
          return <div className="text-[10px] text-dys-gold animate-pulse">ANALYZING ACCESS VECTOR...</div>;
      }
      
      if(transitState === 'CURRENT_LOCATION' || transitState === 'READY_TO_LEAVE') {
          return (
              <button 
                onClick={leaveSector} 
                disabled={loading}
                className="w-full bg-dys-red/20 border border-dys-red text-dys-red hover:bg-dys-red hover:text-black py-2 font-bold text-xs transition-all"
              >
                  {loading ? 'INITIATING JUMP...' : 'DEPART SECTOR'}
              </button>
          );
      }

      if(transitState === 'INSUFFICIENT_FUNDS') {
          return (
              <div className="w-full border border-dys-red p-2 text-center">
                  <div className="text-[10px] text-dys-red font-bold">INSUFFICIENT FUNDS</div>
                  <div className="text-[9px] text-gray-500">REQ: {formatUnits(sectorDetails?.coverCharge || 0n, 18)} {sectorDetails?.assetSymbol}</div>
              </div>
          );
      }

      if(transitState === 'NEEDS_APPROVAL') {
           return (
              <button 
                onClick={approveEntry} 
                disabled={loading}
                className="w-full bg-dys-gold/20 border border-dys-gold text-dys-gold hover:bg-dys-gold hover:text-black py-2 font-bold text-xs transition-all"
              >
                  {loading ? 'APPROVING...' : `APPROVE ${sectorDetails?.assetSymbol}`}
              </button>
          );
      }

      if(transitState === 'READY_TO_ENTER') {
           return (
              <button 
                onClick={joinSector} 
                disabled={loading}
                className="w-full bg-dys-green/20 border border-dys-green text-dys-green hover:bg-dys-green hover:text-black py-2 font-bold text-xs transition-all"
              >
                  {loading ? 'ENTERING...' : 'ENTER SECTOR'}
              </button>
          );
      }

      return <div className="text-[10px] text-gray-600">VECTOR LOCKED</div>;
  };

  return (
    <div className="h-full p-6 font-mono text-gray-300">
         <div className="w-full h-full max-w-6xl mx-auto flex flex-col gap-4">
            
            <div className="flex border-b border-dys-border bg-black justify-between">
                 <div className="flex">
                    <button onClick={() => setMode('NAV')} className={`px-6 py-3 font-bold text-sm border-r border-dys-border transition-colors ${mode === 'NAV' ? 'text-dys-cyan bg-dys-cyan/10' : 'text-gray-600 hover:text-white'}`}>🔭 NAV_COMPUTER</button>
                    <button onClick={() => setMode('GENESIS')} className={`px-6 py-3 font-bold text-sm border-r border-dys-border transition-colors ${mode === 'GENESIS' ? 'text-dys-green bg-dys-green/10' : 'text-gray-600 hover:text-white'}`}>🌱 GENESIS</button>
                 </div>
                 <button onClick={() => setMode('IO')} className={`px-6 py-3 font-bold text-sm border-l border-dys-border transition-colors ${mode === 'IO' ? 'text-dys-gold bg-dys-gold/10' : 'text-gray-600 hover:text-white'}`}>💾 DATA_IO</button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                
                <div className="w-full md:w-1/3 bg-dys-panel border border-dys-border flex flex-col h-full">
                    {mode === 'NAV' && (
                        <>
                            <div className="p-4 border-b border-dys-border bg-black">
                                <h2 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">FREQUENCY_TUNER</h2>
                                <input className="w-full bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none" placeholder="Search Sectors..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                <button 
                                    onClick={user.mapSync.isScanning ? user.mapSync.stopSync : user.mapSync.triggerSync}
                                    className={`w-full mt-2 text-[10px] border py-1 font-bold transition-all ${user.mapSync.isScanning ? 'bg-dys-red text-black border-dys-red animate-pulse' : 'bg-dys-cyan/10 text-dys-cyan border-dys-cyan/30 hover:bg-dys-cyan hover:text-black'}`}
                                >
                                    {user.mapSync.isScanning ? `STOP SCAN [${user.mapSync.progress}]` : 'UPDATE MAP [FULL SCAN]'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                                {filteredSectors.map((sector) => (
                                    <button key={sector.address} onClick={() => { setSelectedSector(sector); setSectorView('COMMS'); }} className={`w-full text-left p-3 border transition-all flex justify-between items-center ${selectedSector?.address === sector.address ? 'border-dys-cyan bg-dys-cyan/10' : 'border-transparent hover:bg-white/5'}`}>
                                        <div>
                                            <div className={`font-bold text-sm ${selectedSector?.address === sector.address ? 'text-dys-cyan' : 'text-gray-300'}`}>{sector.name}</div>
                                            <div className="text-xs text-gray-500 font-mono">{sector.isSystem ? "SYSTEM_ROOT" : `${sector.symbol}`}</div>
                                        </div>
                                        {isCurrentLocation(sector.address) && <span className="text-[9px] bg-dys-green text-black px-2 py-0.5 font-bold animate-pulse">LOC</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    
                    {mode === 'GENESIS' && (
                        <div className="p-6 space-y-6">
                            <h3 className="text-dys-green font-bold text-sm tracking-widest border-b border-dys-green/30 pb-2">SECTOR GENESIS PROTOCOL</h3>
                            <div className={`p-4 border ${isChoRegistered ? 'border-dys-green/30 bg-dys-green/5' : 'border-dys-red/30 bg-dys-red/5'}`}>
                                <div className="text-[10px] text-gray-500 uppercase font-bold">PREREQUISITE CHECK</div>
                                <div className={`font-bold text-sm ${isChoRegistered ? 'text-dys-green' : 'text-dys-red'}`}>
                                    {isChoRegistered ? "CHO REGISTRATION: VERIFIED" : "CHO REGISTRATION: FAILED"}
                                </div>
                                {!isChoRegistered && <div className="text-[10px] text-gray-400 mt-1">Pilot must be registered in CHO Governance.</div>}
                            </div>
                            <div>
                                <label className="text-[10px] text-dys-green font-bold uppercase">Seed Asset</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm text-white focus:border-dys-green outline-none mt-1" 
                                    placeholder="Address (0x...)" 
                                    value={tfAsset} 
                                    onChange={(e) => setTfAsset(e.target.value)} 
                                />
                                <div className="text-[10px] text-gray-500 mt-1">Resource committed to stabilize Waat coordinates.</div>
                            </div>
                            <button onClick={terraform} disabled={loading || !isChoRegistered} className="w-full bg-dys-green/10 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black py-4 font-bold transition-all text-xs tracking-widest disabled:opacity-50 disabled:cursor-not-allowed">
                                {loading ? 'TERRAFORMING...' : 'INITIATE GENESIS'}
                            </button>
                        </div>
                    )}

                    {mode === 'IO' && (
                        <div className="p-6 space-y-6 overflow-y-auto h-full scrollbar-thin">
                            <div className="text-xs text-gray-400">
                                <h3 className="text-dys-gold font-bold text-sm mb-2">CHRONOSPHERE_IO</h3>
                                <p>Manage persistent archives and topology.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 border-b border-dys-border pb-4">
                                <button onClick={handleResetMap} className="bg-dys-red/10 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black py-2 font-bold text-[10px] transition-all">RESET MAP TOPOLOGY</button>
                                {selectedSector && <button onClick={handlePurgeChat} className="bg-dys-red/10 text-dys-red border border-dys-red/50 hover:bg-dys-red hover:text-black py-2 font-bold text-[10px] transition-all">PURGE SECTOR CHAT [{selectedSector.symbol}]</button>}
                                <button onClick={() => handleExport('MAP')} className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan/50 hover:bg-dys-cyan hover:text-black py-2 font-bold text-[10px] transition-all">EXPORT SYSTEM MAP</button>
                                {selectedSector && <button onClick={() => handleExport('CHAT', selectedSector.address)} className="bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500 hover:text-white py-2 font-bold text-[10px] transition-all">EXPORT SECTOR CHAT [{selectedSector.symbol}]</button>}
                                <button onClick={() => handleExport('FULL')} className="bg-dys-gold/10 text-dys-gold border border-dys-gold/50 hover:bg-dys-gold hover:text-black py-2 font-bold text-[10px] transition-all">EXPORT FULL DATABASE</button>
                                <label className="bg-dys-black border border-dashed border-gray-600 hover:border-dys-green text-gray-500 hover:text-dys-green py-2 text-center cursor-pointer transition-all flex items-center justify-center mt-2">
                                    <span className="text-[10px] font-bold">{loading ? '...' : 'IMPORT BACKUP FILE'}</span>
                                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} disabled={loading} className="hidden" />
                                </label>
                            </div>
                            <div className="pt-2">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-bold text-gray-500">SYSTEM_MAP_TOPOLOGY</h4>
                                    {user.mapSync.isScanning && <span className="text-[9px] text-dys-green animate-pulse">SCANNING...</span>}
                                    {user.mapSync.isScanning && <button onClick={user.mapSync.stopSync} className="text-[9px] text-dys-red">CANCEL</button>}
                                </div>
                                {renderTopology(mapMeta)}
                            </div>
                            {selectedSector && (
                                <div className="pt-4 border-t border-dys-border">
                                    <h4 className="text-xs font-bold text-dys-cyan mb-2">CHAT_TOPOLOGY [{selectedSector.symbol}]</h4>
                                    {renderTopology(channelMeta)}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 bg-black border border-dys-cyan/30 relative overflow-hidden flex flex-col">
                    {selectedSector ? (
                        <div className="flex-col h-full flex">
                            <div className="bg-dys-panel border-b border-dys-border p-4 shrink-0">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h2 className="text-xl text-white font-bold">{selectedSector.name}</h2>
                                        <div className="text-xs text-dys-cyan font-mono">{selectedSector.address}</div>
                                    </div>
                                    
                                    <div className="flex flex-col items-end gap-2 w-48">
                                        {renderTransitPanel()}
                                        {sectorDetails && (
                                            <div className="text-[9px] text-gray-500 font-mono text-right mt-1">
                                                {sectorDetails.isAdmitted ? "GOV: GRANTED" : "GOV: RESTRICTED"} | 
                                                FEE: {formatUnits(sectorDetails.coverCharge, 18)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 mt-2">
                                    <button onClick={() => setSectorView('COMMS')} className={`px-4 py-1 text-xs font-bold border-b-2 ${sectorView === 'COMMS' ? 'border-dys-cyan text-dys-cyan' : 'border-transparent text-gray-600 hover:text-gray-300'}`}>COMMS</button>
                                    <button onClick={() => setSectorView('OPERATIONS')} className={`px-4 py-1 text-xs font-bold border-b-2 ${sectorView === 'OPERATIONS' ? 'border-dys-gold text-dys-gold' : 'border-transparent text-gray-600 hover:text-gray-300'}`}>OPERATIONS</button>
                                    {isOwner && <button onClick={() => setSectorView('GOVERNANCE')} className={`px-4 py-1 text-xs font-bold border-b-2 ${sectorView === 'GOVERNANCE' ? 'border-dys-red text-dys-red' : 'border-transparent text-gray-600 hover:text-gray-300'}`}>GOVERNANCE</button>}
                                </div>
                            </div>

                            <div className="flex-1 relative overflow-hidden bg-black/50">
                                {sectorView === 'COMMS' && (
                                    <VoidChat 
                                        web3={web3!} 
                                        viewAddress={selectedSector.address}
                                        lauArea={user.currentArea} 
                                        lauAddress={user.lauAddress}
                                        addLog={addLog}
                                        refreshTrigger={dataVersion}
                                        requestedGap={chatGapRequest}
                                        onGapRequestHandled={() => setChatGapRequest(null)}
                                        onChunkLoaded={handleChatProgress}
                                        onViewIdentity={onViewIdentity}
                                    />
                                )}
                                {sectorView === 'OPERATIONS' && (
                                    <div className="p-6 h-full overflow-y-auto">
                                        <div className="mb-6">
                                            <h3 className="text-dys-gold font-bold text-sm mb-2">TERRAFORMING INTERFACE</h3>
                                            <p className="text-xs text-gray-500">Execute modification protocols within the QING manifold. Requires YUE bridge.</p>
                                        </div>
                                        <div className="space-y-4 max-w-lg">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] text-gray-500 uppercase font-bold">Parameter A</label>
                                                    <input className="w-full bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="Data..." value={opInputA} onChange={e => setOpInputA(e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-500 uppercase font-bold">Parameter B</label>
                                                    <input className="w-full bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="Data..." value={opInputB} onChange={e => setOpInputB(e.target.value)} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 mt-4">
                                                <button onClick={() => handleOperation('REACT')} disabled={loading} className="p-3 border border-dys-gold/50 text-dys-gold hover:bg-dys-gold hover:text-black font-bold text-xs flex justify-between items-center transition-all">
                                                    <span>REACT</span>
                                                    <span className="text-[9px] opacity-60">YUE.REACT()</span>
                                                </button>
                                                <button onClick={() => handleOperation('ALPHA')} disabled={loading} className="p-3 border border-purple-500/50 text-purple-400 hover:bg-purple-500 hover:text-white font-bold text-xs flex justify-between items-center transition-all">
                                                    <span>ALPHA</span>
                                                    <span className="text-[9px] opacity-60">ZHOU.ALPHA()</span>
                                                </button>
                                                <button onClick={() => handleOperation('BETA')} disabled={loading} className="p-3 border border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white font-bold text-xs flex justify-between items-center transition-all">
                                                    <span>BETA</span>
                                                    <span className="text-[9px] opacity-60">YI.BETA()</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {sectorView === 'GOVERNANCE' && (
                                    <div className="p-6 h-full overflow-y-auto">
                                        <div className="mb-6 border-b border-dys-red/30 pb-4">
                                            <h3 className="text-dys-red font-bold text-sm mb-2">OWNER CONTROLS</h3>
                                            <p className="text-xs text-gray-500">Modify admittance criteria and taxation policies.</p>
                                        </div>
                                        <div className="space-y-6 max-w-lg">
                                            <div>
                                                <div className="text-[10px] text-dys-red font-bold uppercase mb-2">Grant Admittance</div>
                                                <div className="flex gap-2">
                                                    <input className="w-full bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="LAU Address (0x...)" value={opInputA} onChange={e => setOpInputA(e.target.value)} />
                                                    <button onClick={() => handleGovernance('ADMITTANCE')} disabled={loading} className="bg-dys-red/10 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black px-4 font-bold text-xs">GRANT</button>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-dys-red font-bold uppercase mb-2">Set Cover Charge</div>
                                                <div className="flex gap-2">
                                                    <input className="w-full bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="Amount (18 decimals)..." value={newCoverCharge} onChange={e => setNewCoverCharge(e.target.value)} />
                                                    <button onClick={() => handleGovernance('CHARGE')} disabled={loading} className="bg-dys-red/10 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black px-4 font-bold text-xs">SET</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600">
                            <div className="text-4xl mb-4 opacity-20">⚛</div>
                            <p>SELECT A SECTOR TO INITIALIZE UPLINK</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
     </div>
  );
};

export default QingModule;