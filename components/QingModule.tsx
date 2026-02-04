
import React, { useState, useEffect, useRef } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { ADDRESSES, QING_ABI, MAP_ABI, ERC20_ABI, LAU_ABI, YUE_ABI, DYSNOMIA_ABIS, CHO_ABI } from '../constants';
import { formatEther, isAddress, ZeroAddress, formatUnits } from 'ethers';
import VoidChat from './VoidChat';
import { Persistence, SectorData, ChannelMeta, ExportMode } from '../services/persistenceService';

interface QingModuleProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
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

const GENESIS_BLOCK = 22813947;
const CHUNK_SIZE = 10000;

const QingModule: React.FC<QingModuleProps> = ({ user, web3, addLog, setUser }) => {
  const [mode, setMode] = useState<'NAV' | 'GENESIS' | 'IO'>('NAV');
  const [sectorView, setSectorView] = useState<'COMMS' | 'OPERATIONS' | 'GOVERNANCE'>('COMMS');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isMapCrawling, setIsMapCrawling] = useState(false); 
  const abortControllerRef = useRef<AbortController | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectors, setSectors] = useState<SectorData[]>([
      { name: 'VOID_ROOT', symbol: 'VOID', address: ADDRESSES.VOID, isSystem: true, integrative: ZeroAddress, waat: "0" }
  ]);
  
  const [selectedSector, setSelectedSector] = useState<SectorData | null>(null);
  const [sectorDetails, setSectorDetails] = useState<SectorDetails | null>(null);
  // States: CHECKING, READY_TO_ENTER, NEEDS_APPROVAL, INSUFFICIENT_FUNDS, DENIED, CURRENT_LOCATION, SYSTEM_ERROR
  const [transitState, setTransitState] = useState<string>('CHECKING');
  
  const [tfAsset, setTfAsset] = useState('');
  const [isChoRegistered, setIsChoRegistered] = useState(false);

  // Operations State
  const [opInputA, setOpInputA] = useState('');
  const [opInputB, setOpInputB] = useState('');

  // Governance State
  const [newCoverCharge, setNewCoverCharge] = useState('');

  // Persistence / Topology State
  const [dataVersion, setDataVersion] = useState(0);
  const [channelMeta, setChannelMeta] = useState<ChannelMeta | null>(null);
  const [mapMeta, setMapMeta] = useState<ChannelMeta | null>(null);
  const [chatGapRequest, setChatGapRequest] = useState<{start: number, end: number} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Initial Load & Restore Session
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
  }, [dataVersion]);

  useEffect(() => {
      if (selectedSector) {
          sessionStorage.setItem('dys_selected_sector', selectedSector.address);
          Persistence.getChannelMeta(selectedSector.address).then(setChannelMeta);
      }
  }, [selectedSector]);

  useEffect(() => {
      Persistence.getChannelMeta(ADDRESSES.MAP).then(setMapMeta);
  }, [mode, isScanning, isMapCrawling]);

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

  // --- MAP SCANNER ---
  const scanMapChunk = async (start: number, end: number, signal: AbortSignal) => {
      if (!web3) return;
      const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
      const events = await map.queryFilter("NewQing", start, end);
      
      if (events.length > 0) {
          const foundSectors: SectorData[] = await Promise.all(events.map(async (e: any) => {
              const qingAddress = e.args[0];
              const integrative = e.args[1];
              const waat = e.args[2];
              
              let name = "Unknown Sector";
              let symbol = "UNK";
              try {
                  const qing = web3.getContract(qingAddress, QING_ABI);
                  name = await qing.name();
                  symbol = await qing.symbol();
              } catch {}

              const s = {
                  address: qingAddress,
                  integrative,
                  waat: waat.toString(),
                  name,
                  symbol,
                  isSystem: false
              };
              await Persistence.saveSector(s);
              return s;
          }));

          setSectors(prev => {
              const map = new Map<string, SectorData>();
              prev.forEach(s => map.set(s.address.toLowerCase(), s));
              foundSectors.forEach(s => map.set(s.address.toLowerCase(), s));
              return Array.from(map.values());
          });
      }
      await Persistence.updateScannedRange(ADDRESSES.MAP, start, end);
      const newMeta = await Persistence.getChannelMeta(ADDRESSES.MAP);
      setMapMeta(newMeta);
  };

  const autoBridgeMapTip = async () => {
      if (!web3) return;
      const currentBlock = await web3.getProvider().getBlockNumber();
      const meta = await Persistence.getChannelMeta(ADDRESSES.MAP);
      
      let maxScanned = GENESIS_BLOCK;
      if (meta && meta.scannedRanges.length > 0) {
          maxScanned = Math.max(...meta.scannedRanges.map(r => r.end));
      }

      if (currentBlock - maxScanned > 0 && currentBlock - maxScanned < 500000) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Syncing Map Topology...` });
          setIsScanning(true);
          const controller = new AbortController();
          try {
             let cursor = maxScanned + 1;
             while(cursor <= currentBlock) {
                 const end = Math.min(cursor + CHUNK_SIZE, currentBlock);
                 await scanMapChunk(cursor, end, controller.signal);
                 cursor = end + 1;
                 await new Promise(r => setTimeout(r, 50));
             }
          } catch(e) {
              console.warn("Auto map sync failed", e);
          } finally {
              setIsScanning(false);
          }
      }
  };

  useEffect(() => {
      if(web3 && !isScanning) {
          const t = setTimeout(autoBridgeMapTip, 1500);
          return () => clearTimeout(t);
      }
  }, [web3]);

  const toggleMapCrawl = async () => {
      if (isMapCrawling) {
          abortControllerRef.current?.abort();
          setIsMapCrawling(false);
          setIsScanning(false);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Map Crawl Paused.` });
          return;
      }

      if (!web3) return;
      setIsMapCrawling(true);
      setIsScanning(true);
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Map Crawl Initiated (Incremental)...` });

      try {
          while (!signal.aborted) {
              const currentBlock = await web3.getProvider().getBlockNumber();
              const meta = await Persistence.getChannelMeta(ADDRESSES.MAP);
              const ranges = meta?.scannedRanges || [];
              ranges.sort((a,b) => a.start - b.start); 

              let tipEnd = GENESIS_BLOCK;
              if (ranges.length > 0) tipEnd = ranges[ranges.length - 1].end;
              
              if (tipEnd < currentBlock) {
                  const start = Math.max(tipEnd + 1, currentBlock - 500000); 
                  const end = Math.min(start + CHUNK_SIZE, currentBlock);
                  await scanMapChunk(start, end, signal);
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              let foundGap = false;
              for (let i = ranges.length - 1; i > 0; i--) {
                  const current = ranges[i];
                  const prev = ranges[i-1];
                  if (current.start > prev.end + 1) {
                      const gapEnd = current.start - 1;
                      const gapStart = Math.max(prev.end + 1, gapEnd - CHUNK_SIZE);
                      await scanMapChunk(gapStart, gapEnd, signal);
                      foundGap = true;
                      break;
                  }
              }
              if (foundGap) {
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              let earliest = GENESIS_BLOCK;
              if (ranges.length > 0) earliest = ranges[0].start;
              
              if (earliest > GENESIS_BLOCK) {
                  const end = earliest - 1;
                  const start = Math.max(GENESIS_BLOCK, end - CHUNK_SIZE);
                  await scanMapChunk(start, end, signal);
                  await new Promise(r => setTimeout(r, 100));
                  continue;
              }

              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Map Fully Synced.` });
              break;
          }
      } catch (e: any) {
          if (e.message !== "Aborted") {
             console.error(e);
             addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Map Crawl Error: ${e.message}` });
          }
      } finally {
          setIsMapCrawling(false);
          setIsScanning(false);
          abortControllerRef.current = null;
      }
  };

  useEffect(() => {
      if (!web3 || isMapCrawling) return;
      const interval = setInterval(async () => {
         const currentBlock = await web3.getProvider().getBlockNumber();
         const meta = await Persistence.getChannelMeta(ADDRESSES.MAP);
         const maxScanned = meta && meta.scannedRanges.length > 0 ? Math.max(...meta.scannedRanges.map(r => r.end)) : GENESIS_BLOCK;
         
         if (currentBlock - maxScanned > 50) { 
             const controller = new AbortController();
             await scanMapChunk(maxScanned + 1, currentBlock, controller.signal);
         }
      }, 30000);
      return () => clearInterval(interval);
  }, [web3, isMapCrawling]);

  // 5. Fetch Details & Perform A Priori Checks
  useEffect(() => {
      if(!web3 || !selectedSector || !user.lauAddress || !user.address) {
          setSectorDetails(null);
          setTransitState('IDLE');
          return;
      }
      
      // Reset State
      setTransitState('CHECKING');
      setSectorDetails(null);

      // Check if this is the user's current location
      const isCurrent = user.currentArea && selectedSector.address.toLowerCase() === user.currentArea.toLowerCase();
      
      // Void handling
      if(selectedSector.address === ADDRESSES.VOID) {
          if (user.currentArea && user.currentArea !== ADDRESSES.VOID) {
             setTransitState('READY_TO_LEAVE'); // Can leave current to go to Void
          } else {
             setTransitState('CURRENT_LOCATION'); // Already in Void
          }
          return;
      }
      
      if(isCurrent) {
           setTransitState('CURRENT_LOCATION');
           // Still fetch details for info purposes
      }

      const checkAdmittance = async () => {
          try {
              const qing = web3.getContract(selectedSector.address, QING_ABI);
              
              // 1. Get QING Config
              const [admitted, cover, assetAddress, owner] = await Promise.all([
                  qing.Admitted(user.lauAddress).catch(() => false),
                  qing.CoverCharge().catch(() => 0n),
                  qing.Asset().catch(() => ZeroAddress),
                  qing.owner().catch(() => ZeroAddress)
              ]);

              let assetSymbol = "???";
              let userBalance = 0n;
              let userAllowance = 0n;

              // 2. Asset Checks (C2, C3, C4)
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

              // 3. Determine Transit Readiness (A Priori Logic)
              if (!admitted) {
                  // If there is a fee, we generally pay from User Wallet via Allowance to QING
                  // If NOT admitted, we check funds.
                  if (cover > 0n) {
                      if (userBalance < cover) {
                          setTransitState('INSUFFICIENT_FUNDS');
                      } else if (userAllowance < cover) {
                          setTransitState('NEEDS_APPROVAL');
                      } else {
                          setTransitState('READY_TO_ENTER');
                      }
                  } else {
                      // Free to join, just gas
                      setTransitState('READY_TO_ENTER');
                  }
              } else {
                  // Already admitted, skip funds/allowance check.
                  // QING.Join will move LAU without transferFrom.
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

  // --- ACTIONS ---

  const approveEntry = async () => {
      if(!web3 || !sectorDetails || !sectorDetails.assetAddress || !selectedSector) return;
      setLoading(true);
      try {
          // Approve QING contract to spend Asset
          const tx = await web3.approve(sectorDetails.assetAddress, selectedSector.address);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Authorization Signal Sent (Approve): ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Allowance Granted for Admittance.` });
          // useEffect will re-run checks when loading sets to false
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
          // Double check admittance status for log/logic clarity, though UI gates this.
          // If admitted, we proceed without "payment". If not, Join handles payment.
          const qing = web3.getContract(selectedSector.address, QING_ABI);
          
          const isAdmitted = sectorDetails?.isAdmitted;
          const msg = isAdmitted 
             ? `Re-Entering ${selectedSector.name} (Admitted)` 
             : `Joining ${selectedSector.name} (Payment/Gas)`;
          
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
          // Calling LAU.Leave() to return to VOID from any location
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
      
      // Prerequisites check
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

  // Operational Logic for React, Alpha, Beta
  const handleOperation = async (type: 'REACT' | 'ALPHA' | 'BETA') => {
      if (!web3 || !selectedSector || !user.yue) return;
      setLoading(true);

      try {
          let tx;
          // Context: We are acting within the QING context, usually via YUE or specific contracts found in the QING
          
          if (type === 'REACT') {
             // REACT: Uses YUE to react with the Sector's integrative asset
             const yue = web3.getContract(user.yue, YUE_ABI);
             tx = await web3.sendTransaction(yue, 'React', [selectedSector.address]);
          } else if (type === 'ALPHA') {
             // ALPHA: Advanced structural deployment (ZHOU)
             const zhou = web3.getContract(ADDRESSES.ZHOU || selectedSector.address, DYSNOMIA_ABIS.ZHOU);
             tx = await web3.sendTransaction(zhou, 'Alpha', [opInputA, opInputB]);
          } else if (type === 'BETA') {
             // BETA: Optimization (YI)
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

  // Governance Logic
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

  const handleMapGapClick = async (s: number, e: number) => {
      const controller = new AbortController();
      setIsScanning(true);
      try {
          let cursor = s;
          while (cursor <= e) {
              const end = Math.min(cursor + CHUNK_SIZE, e);
              await scanMapChunk(cursor, end, controller.signal);
              cursor = end + 1;
              await new Promise(r => setTimeout(r, 50));
          }
      } finally {
          setIsScanning(false);
      }
  };

  const renderTopology = (meta: ChannelMeta | null, onGapClick: (s: number, e: number) => void) => {
      if (!meta) return <div className="text-[10px] text-gray-500 italic">No Data.</div>;
      
      const ranges = [...meta.scannedRanges].sort((a,b) => b.start - a.start); 
      const elements: React.ReactNode[] = [];
      let lastStart = 999999999; 
      let earliestStart = ranges.length > 0 ? ranges[ranges.length-1].start : 999999999;

      ranges.forEach((range, i) => {
          if (lastStart < 999999999 && lastStart > range.end + 1) {
              const gapStart = range.end + 1;
              const gapEnd = lastStart - 1;
              elements.push(
                  <div key={`gap-${i}`} className="flex justify-between items-center text-[9px] bg-dys-red/10 border-l-2 border-dashed border-dys-red p-1 my-1">
                      <span className="text-dys-red">MISSING: {gapEnd - gapStart} BLKS</span>
                      <button 
                        onClick={() => onGapClick(gapStart, gapEnd)}
                        disabled={isScanning || isMapCrawling}
                        className="text-dys-red hover:text-white border border-dys-red/50 px-2 uppercase font-bold"
                      >
                          SCAN GAP
                      </button>
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

      if (earliestStart !== 999999999 && earliestStart > GENESIS_BLOCK) {
          elements.push(
             <div key="genesis-gap" className="flex justify-between items-center text-[9px] bg-dys-gold/10 border-l-2 border-dashed border-dys-gold p-1 my-1">
                 <span className="text-dys-gold">HISTORY: {earliestStart - GENESIS_BLOCK} BLKS</span>
                 <button 
                   onClick={() => onGapClick(GENESIS_BLOCK, earliestStart - 1)}
                   disabled={isScanning || isMapCrawling}
                   className="text-dys-gold hover:text-white border border-dys-gold/50 px-2 uppercase font-bold"
                 >
                     LOAD GENESIS
                 </button>
             </div>
          );
      }

      return <div className="space-y-1 mt-2">{elements}</div>;
  };

  const isOwner = user.lauAddress && sectorDetails?.owner && user.lauAddress.toLowerCase() === sectorDetails.owner.toLowerCase();

  const isCurrentLocation = (addr: string) => {
    if (!user.currentArea) return false;
    return user.currentArea.toLowerCase() === addr.toLowerCase();
  };

  const renderTransitPanel = () => {
      // 1. Current Location - Can only Leave
      if (transitState === 'CURRENT_LOCATION') {
           if (selectedSector?.address === ADDRESSES.VOID) {
               return <div className="text-center text-xs text-dys-cyan font-bold border border-dys-cyan p-2">ROOT LOCATION</div>;
           }
           return (
               <button 
                   onClick={leaveSector} 
                   disabled={loading} 
                   className="px-4 py-2 bg-dys-red/20 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black text-xs font-bold w-full transition-all"
               >
                   {loading ? 'LEAVING SECTOR...' : 'LEAVE SECTOR (RETURN TO VOID)'}
               </button>
           );
      }

      // 2. Can Transit to Void if currently in another sector
      if (transitState === 'READY_TO_LEAVE') {
           return (
               <button 
                   onClick={leaveSector} 
                   disabled={loading} 
                   className="px-4 py-2 bg-dys-cyan/20 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black text-xs font-bold w-full transition-all"
               >
                   {loading ? 'TRANSITING...' : 'RETURN TO VOID'}
               </button>
           );
      }

      // 3. System States for Entry
      if (transitState === 'CHECKING') {
          return <div className="text-center text-xs text-gray-500 animate-pulse">VERIFYING ADMITTANCE PROTOCOLS...</div>;
      }

      if (transitState === 'DENIED') {
          return <div className="p-3 bg-dys-red/10 border border-dys-red text-center text-dys-red font-bold text-xs">ADMITTANCE DENIED (GOVERNANCE)</div>;
      }
      
      if (transitState === 'INSUFFICIENT_FUNDS') {
          return (
              <div className="flex flex-col gap-2">
                  <div className="text-center text-xs text-dys-red border border-dys-red p-1 bg-dys-red/10">INSUFFICIENT FUNDS</div>
                  <div className="text-[10px] text-gray-500 text-center">REQ: {formatUnits(sectorDetails?.coverCharge || 0n, 18)} {sectorDetails?.assetSymbol}</div>
              </div>
          );
      }

      if (transitState === 'NEEDS_APPROVAL') {
           return (
               <div className="flex flex-col gap-2">
                   <div className="text-[10px] text-dys-gold text-center mb-1">REQ: ALLOWANCE GRANT</div>
                   <button onClick={approveEntry} disabled={loading} className="px-4 py-2 bg-dys-gold/20 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black text-xs font-bold w-full animate-pulse">
                       {loading ? 'APPROVING...' : `APPROVE [${sectorDetails?.assetSymbol}]`}
                   </button>
               </div>
           );
      }

      if (transitState === 'READY_TO_ENTER') {
          const cost = sectorDetails?.coverCharge && sectorDetails.coverCharge > 0n && !sectorDetails.isAdmitted ? `PAY ${formatUnits(sectorDetails.coverCharge, 18)} ${sectorDetails.assetSymbol}` : 'ADMITTED';
          return (
              <button onClick={joinSector} disabled={loading} className="px-4 py-2 bg-dys-green/20 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black text-xs font-bold w-full transition-all">
                  {loading ? 'ENTERING...' : `ENTER SECTOR [${cost}]`}
              </button>
          );
      }

      return <div className="text-center text-xs text-dys-red">SYSTEM ERROR</div>;
  };

  return (
    <div className="h-full p-6 font-mono text-gray-300">
         <div className="w-full h-full max-w-6xl mx-auto flex flex-col gap-4">
            
            {/* Header */}
            <div className="flex border-b border-dys-border bg-black justify-between">
                 <div className="flex">
                    <button onClick={() => setMode('NAV')} className={`px-6 py-3 font-bold text-sm border-r border-dys-border transition-colors ${mode === 'NAV' ? 'text-dys-cyan bg-dys-cyan/10' : 'text-gray-600 hover:text-white'}`}>🔭 NAV_COMPUTER</button>
                    <button onClick={() => setMode('GENESIS')} className={`px-6 py-3 font-bold text-sm border-r border-dys-border transition-colors ${mode === 'GENESIS' ? 'text-dys-green bg-dys-green/10' : 'text-gray-600 hover:text-white'}`}>🌱 GENESIS</button>
                 </div>
                 <button onClick={() => setMode('IO')} className={`px-6 py-3 font-bold text-sm border-l border-dys-border transition-colors ${mode === 'IO' ? 'text-dys-gold bg-dys-gold/10' : 'text-gray-600 hover:text-white'}`}>💾 DATA_IO</button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                
                {/* LEFT COLUMN */}
                <div className="w-full md:w-1/3 bg-dys-panel border border-dys-border flex flex-col h-full">
                    {mode === 'NAV' && (
                        <>
                            <div className="p-4 border-b border-dys-border bg-black">
                                <h2 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">FREQUENCY_TUNER</h2>
                                <input className="w-full bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none" placeholder="Search Sectors..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                <button 
                                    onClick={toggleMapCrawl} 
                                    className={`w-full mt-2 text-[10px] border py-1 font-bold transition-all ${isMapCrawling ? 'bg-dys-red text-black border-dys-red animate-pulse' : 'bg-dys-cyan/10 text-dys-cyan border-dys-cyan/30 hover:bg-dys-cyan hover:text-black'}`}
                                >
                                    {isMapCrawling ? 'STOP SCAN [CRAWLING...]' : 'UPDATE MAP [FULL SCAN]'}
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
                                    {isScanning && <span className="text-[9px] text-dys-green animate-pulse">SCANNING...</span>}
                                    {isScanning && <button onClick={() => { setIsMapCrawling(false); abortControllerRef.current?.abort(); }} className="text-[9px] text-dys-red">CANCEL</button>}
                                </div>
                                {renderTopology(mapMeta, (s, e) => handleMapGapClick(s, e))}
                            </div>
                            {selectedSector && (
                                <div className="pt-4 border-t border-dys-border">
                                    <h4 className="text-xs font-bold text-dys-cyan mb-2">CHAT_TOPOLOGY [{selectedSector.symbol}]</h4>
                                    {renderTopology(channelMeta, (s, e) => setChatGapRequest({ start: s, end: e }))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: DETAILS & COMMS */}
                <div className="flex-1 bg-black border border-dys-cyan/30 relative overflow-hidden flex flex-col">
                    {selectedSector ? (
                        <div className="flex-col h-full flex">
                            {/* Sector Header */}
                            <div className="bg-dys-panel border-b border-dys-border p-4 shrink-0">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h2 className="text-xl text-white font-bold">{selectedSector.name}</h2>
                                        <div className="text-xs text-dys-cyan font-mono">{selectedSector.address}</div>
                                    </div>
                                    
                                    {/* NAV CONTROLS */}
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
                                
                                {/* Sub-Tabs */}
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
                                            <div className="p-4 border border-dys-red/20 bg-dys-red/5">
                                                <label className="text-[10px] text-dys-red uppercase font-bold">Admittance Protocol</label>
                                                <div className="flex gap-2 mt-2">
                                                    <input className="flex-1 bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="Target LAU Address..." value={opInputA} onChange={e => setOpInputA(e.target.value)} />
                                                    <button onClick={() => handleGovernance('ADMITTANCE')} disabled={loading} className="px-4 bg-dys-red/20 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs">GRANT</button>
                                                </div>
                                            </div>

                                            <div className="p-4 border border-dys-red/20 bg-dys-red/5">
                                                <label className="text-[10px] text-dys-red uppercase font-bold">Update Cover Charge</label>
                                                <div className="flex gap-2 mt-2">
                                                    <input className="flex-1 bg-black border border-dys-border p-2 text-xs text-white outline-none" placeholder="Amount (Wei)..." value={newCoverCharge} onChange={e => setNewCoverCharge(e.target.value)} />
                                                    <button onClick={() => handleGovernance('CHARGE')} disabled={loading} className="px-4 bg-dys-red/20 text-dys-red border border-dys-red hover:bg-dys-red hover:text-black font-bold text-xs">SET</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
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
