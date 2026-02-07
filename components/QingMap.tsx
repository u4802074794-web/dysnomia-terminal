import React, { useRef, useEffect, useState, useMemo } from 'react';
import { SectorData, Persistence } from '../services/persistenceService';
import { LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { MAP_ABI, QING_ABI, ADDRESSES } from '../constants';

interface QingMapProps {
    web3: Web3Service | null;
    addLog: (entry: LogEntry) => void;
    onSelectSector: (address: string) => void;
    viewOnly?: boolean;
}

interface RenderNode {
    x: number;
    y: number;
    sector: SectorData;
    mass: number;
    // Cache projected coords for hit testing
    sx?: number; 
    sy?: number;
    // Random phase for twinkling
    phase: number;
}

// Helper to lerp values
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

const QingMap: React.FC<QingMapProps> = ({ web3, addLog, onSelectSector, viewOnly = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [sectors, setSectors] = useState<SectorData[]>([]);
    const [nodes, setNodes] = useState<RenderNode[]>([]);
    const [hoveredNode, setHoveredNode] = useState<RenderNode | null>(null);
    
    // Data Loading State
    const [isScanning, setIsScanning] = useState(false);

    // Selection State
    const [selectedSectorAddr, setSelectedSectorAddr] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    // --- CAMERA REFS (Decoupled from React State for smooth loop) ---
    const camera = useRef({
        x: 0, y: 0,           // Current Offset
        tx: 0, ty: 0,         // Target Offset
        zoom: viewOnly ? 0.45 : 0.6, tZoom: viewOnly ? 0.45 : 0.6,
        tilt: 0.8, tTilt: 0.8,
        rot: 0.5, tRot: 0.5
    });

    const interaction = useRef({
        isDown: false,
        isDragging: false,
        startX: 0, startY: 0,    // Where drag started
        currentX: 0, currentY: 0, // Current mouse pos (for hover)
        lastX: 0, lastY: 0,      // Last frame pos (for delta)
        mode: 'PAN' as 'PAN' | 'ORBIT'
    });

    useEffect(() => {
        const loadSectors = async () => {
            const data = await Persistence.getAllSectors();
            setSectors(data);
            // Auto-select VOID if nothing selected (only in interactive mode)
            if (!selectedSectorAddr && !viewOnly) {
                 const saved = sessionStorage.getItem('dys_selected_sector');
                 if(saved) setSelectedSectorAddr(saved);
            }
        };
        loadSectors();
    }, []);

    // Convert Waat to Lat/Lon & Physics Props
    useEffect(() => {
        const calcNodes = sectors.map(s => {
            let lat = 0, lon = 0;
            try {
                const waatBn = BigInt(s.waat);
                lat = Number(waatBn % 180n) - 90;
                lon = Number((waatBn / 180n) % 360n) - 180;
            } catch (e) { }

            const entropySim = s.isSystem ? 100 : (parseInt(s.address.slice(-4), 16) % 30) + 10; 
            
            return {
                x: lon, 
                y: lat,
                sector: s,
                mass: entropySim,
                phase: Math.random() * Math.PI * 2
            };
        });
        setNodes(calcNodes);
    }, [sectors]);

    // Focus Camera on Selection Logic
    useEffect(() => {
        if (selectedSectorAddr && !viewOnly) {
             const node = nodes.find(n => n.sector.address === selectedSectorAddr);
             // Center logic handled via interaction or explicit reset usually
        }
    }, [selectedSectorAddr, nodes, viewOnly]);

    // --- ANIMATION LOOP ---
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = (time: number) => {
            // 1. Resize handling
            if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }
            const width = canvas.width;
            const height = canvas.height;

            // 2. Physics Interpolation (Smooth Camera)
            const cam = camera.current;
            const factor = 0.1; // Smoothness factor
            
            // Auto-Rotation for View Only Mode
            if (viewOnly) {
                cam.tRot += 0.004; // RESTORED ROTATION SPEED
                cam.tTilt = 0.8 + Math.sin(time / 4000) * 0.15;
            }

            cam.x = lerp(cam.x, cam.tx, factor);
            cam.y = lerp(cam.y, cam.ty, factor);
            cam.zoom = lerp(cam.zoom, cam.tZoom, factor);
            cam.tilt = lerp(cam.tilt, cam.tTilt, factor);
            cam.rot = lerp(cam.rot, cam.tRot, factor);

            // 3. Projection Setup
            const cx = width / 2 + cam.x;
            const cy = height / 2 + cam.y;
            const scale = Math.min(width, height) / 180 * cam.zoom; 

            // Clear
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, width, height);

            // --- 3D MATH ---
            const getZ = (x: number, y: number) => {
                let z = 0;
                for (const node of nodes) {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distSq = dx*dx + dy*dy;
                    z -= (node.mass * 0.5) / (1 + distSq * 0.05);
                }
                return z;
            };

            const cosRot = Math.cos(cam.rot);
            const sinRot = Math.sin(cam.rot);
            const cosTilt = Math.cos(cam.tilt);
            const sinTilt = Math.sin(cam.tilt);

            const project = (x: number, y: number, z: number) => {
                const rx = x * cosRot - y * sinRot;
                const ry = x * sinRot + y * cosRot;
                
                const sx = cx + rx * scale;
                const sy = cy + (ry * cosTilt - z * sinTilt) * scale;
                return { sx, sy, rx, ry };
            };

            // --- GRID RENDERING ---
            const gridSize = 3; 
            const subSteps = 1; 

            const drawPoly = (points: {x:number, y:number}[]) => {
                ctx.beginPath();
                let first = true;
                for (const p of points) {
                    const z = getZ(p.x, p.y);
                    const proj = project(p.x, p.y, z);
                    
                    if (proj.sx < -width || proj.sx > width*2 || proj.sy < -height || proj.sy > height*2) {
                        first = true; continue;
                    }

                    if (first) { ctx.moveTo(proj.sx, proj.sy); first = false; } 
                    else { ctx.lineTo(proj.sx, proj.sy); }
                }
                ctx.stroke();
            };

            ctx.lineWidth = 1;
            
            // Grid Lines - Dimmer for ViewOnly to emphasize shape over noise
            const gridOpacity = viewOnly ? 0.08 : 0.12;
            
            for (let lat = -90; lat <= 90; lat += gridSize * 2) {
                const points = [];
                for (let lon = -180; lon <= 180; lon += subSteps) points.push({ x: lon, y: lat });
                ctx.strokeStyle = `rgba(0, 240, 255, ${Math.abs(lat) < 60 ? gridOpacity : 0.03})`;
                drawPoly(points);
            }

            for (let lon = -180; lon <= 180; lon += gridSize * 2) {
                const points = [];
                for (let lat = -90; lat <= 90; lat += subSteps) points.push({ x: lon, y: lat });
                ctx.strokeStyle = `rgba(139, 92, 246, ${Math.abs(lon) < 120 ? gridOpacity : 0.03})`;
                drawPoly(points);
            }

            // --- HIT TEST PREP ---
            let closestNode: RenderNode | null = null;
            let minDescSq = Infinity;

            // --- NODES RENDERING ---
            nodes.forEach(node => {
                const z = getZ(node.x, node.y);
                const p = project(node.x, node.y, z);
                
                node.sx = p.sx;
                node.sy = p.sy;

                // Hit Test Logic inside Loop
                if (!viewOnly) {
                    const mx = interaction.current.currentX;
                    const my = interaction.current.currentY;
                    
                    const distSq = (mx - p.sx)**2 + (my - p.sy)**2;
                    if (distSq < 225 && distSq < minDescSq) {
                        minDescSq = distSq;
                        closestNode = node;
                    }
                }

                if (p.sx < -50 || p.sx > width + 50 || p.sy < -50 || p.sy > height + 50) return;

                const isHover = hoveredNode === node;
                const isSelected = selectedSectorAddr === node.sector.address;
                
                // --- VISUAL LOGIC ---
                // "Wave" effect based on spatial position + time
                const wave = Math.sin((node.x * 0.05) + (time / 2000));
                // "Twinkle" effect based on random phase
                const twinkle = Math.sin((time / (800 + node.mass * 5)) + node.phase);
                
                // Base size is smaller in viewOnly
                const baseSize = viewOnly ? 1.5 : 2.5;
                const sizeMod = (wave * 0.5) + (twinkle * 0.3);
                
                // Selected/Hovered are significantly larger/brighter
                let radius = (isHover || isSelected) 
                    ? 6 
                    : (baseSize + sizeMod) * (cam.zoom < 1 ? 1 : cam.zoom * 0.8);
                
                // Clamp min radius
                radius = Math.max(0.8, radius);

                // --- SELECTION RINGS ---
                if (isSelected && !viewOnly) {
                    ctx.save();
                    ctx.translate(p.sx, p.sy);
                    ctx.rotate(time / 1000);
                    ctx.strokeStyle = '#00f0ff';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([10, 5]);
                    ctx.beginPath();
                    // Ensure ring radius is positive. Wave is -1 to 1. 15 + wave*2 is always positive (min 13).
                    ctx.arc(0, 0, 15 + wave * 2, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // --- NODE BODY ---
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
                
                // Opacity Logic: ViewOnly is fainter to let grid show. Wave affects alpha.
                const baseAlpha = viewOnly ? 0.4 : 0.7;
                const waveAlpha = 0.2 * wave; 
                const finalAlpha = Math.max(0.2, Math.min(1, baseAlpha + waveAlpha));

                ctx.fillStyle = node.sector.isSystem 
                    ? `rgba(255, 176, 0, ${finalAlpha + 0.2})` 
                    : (isSelected ? '#00f0ff' : `rgba(255, 255, 255, ${finalAlpha})`);
                
                ctx.fill();

                // --- GLOW (Only for high mass or active nodes) ---
                // Don't draw glow for every single node in viewOnly mode to reduce crowding
                if (!viewOnly || node.mass > 20 || wave > 0.8) {
                    ctx.beginPath();
                    // Glow size based on mass (entropy)
                    const calculatedGlow = radius + (node.mass / 20) + (wave * 2);
                    // CLAMP TO PREVENT NEGATIVE RADIUS ERROR
                    const glowSize = Math.max(radius + 0.5, calculatedGlow);
                    
                    ctx.arc(p.sx, p.sy, glowSize, 0, Math.PI * 2);
                    
                    const glowColor = node.sector.isSystem 
                        ? `rgba(255, 176, 0, 0.3)` 
                        : (isSelected ? `rgba(0, 240, 255, 0.5)` : `rgba(139, 92, 246, ${viewOnly ? 0.15 : 0.3})`);
                    
                    ctx.strokeStyle = glowColor;
                    ctx.lineWidth = viewOnly ? 0.5 : 1;
                    ctx.stroke();
                }
                
                // Label
                if (!viewOnly && (cam.zoom > 2 || node.sector.isSystem || isHover || isSelected)) {
                    ctx.font = '9px "JetBrains Mono"';
                    ctx.fillStyle = (isHover || isSelected) ? '#fff' : 'rgba(255,255,255,0.5)';
                    ctx.fillText(node.sector.name, p.sx + 10, p.sy + 4);
                }
            });

            // Update Hover State
            if (closestNode !== hoveredNode) {
                setHoveredNode(closestNode);
            }

            // --- HUD OVERLAY (Hover) ---
            if (!viewOnly && hoveredNode && hoveredNode.sx !== undefined && hoveredNode.sy !== undefined && !interaction.current.isDragging) {
                const hx = hoveredNode.sx;
                const hy = hoveredNode.sy;

                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx + 15, hy - 15);
                ctx.lineTo(hx + 100, hy - 15);
                ctx.stroke();

                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(hx + 15, hy - 35, 120, 20);
                
                ctx.font = 'bold 10px "JetBrains Mono"';
                ctx.fillStyle = '#00f0ff';
                ctx.fillText(hoveredNode.sector.name, hx + 20, hy - 22);
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render(0);
        return () => cancelAnimationFrame(animationFrameId);
    }, [nodes, hoveredNode, selectedSectorAddr, viewOnly]);

    // --- LOGIC ---

    const handleFocusSector = (addr: string) => {
        if (viewOnly) return;
        setSelectedSectorAddr(addr);
        const node = nodes.find(n => n.sector.address === addr);
        
        if (node && containerRef.current) {
            const cam = camera.current;
            const cosRot = Math.cos(cam.tRot);
            const sinRot = Math.sin(cam.tRot);
            
            const rx = node.x * cosRot - node.y * sinRot;
            const ry = node.x * sinRot + node.y * cosRot;
            
            let z = 0;
            
            const rect = containerRef.current.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const scale = Math.min(width, height) / 180 * cam.tZoom;

            camera.current.tx = -rx * scale;
            camera.current.ty = -(ry * Math.cos(cam.tTilt) - z * Math.sin(cam.tTilt)) * scale;
        }
    };

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent, type: 'DOWN' | 'MOVE' | 'UP') => {
        if (viewOnly || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        // @ts-ignore
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        // @ts-ignore
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        if (type === 'DOWN') {
             interaction.current.isDown = true;
             interaction.current.isDragging = false; 
             interaction.current.startX = clientX; 
             interaction.current.startY = clientY;
             interaction.current.lastX = clientX;
             interaction.current.lastY = clientY;
             // @ts-ignore
             if (e.button === 1 || e.shiftKey) interaction.current.mode = 'ORBIT'; else interaction.current.mode = 'PAN';

        } else if (type === 'MOVE') {
             interaction.current.currentX = mouseX;
             interaction.current.currentY = mouseY;

             if (interaction.current.isDown) {
                const dx = clientX - interaction.current.lastX;
                const dy = clientY - interaction.current.lastY;
                const distFromStart = Math.sqrt((clientX - interaction.current.startX)**2 + (clientY - interaction.current.startY)**2);
                if (distFromStart > 5) interaction.current.isDragging = true;

                if (interaction.current.isDragging) {
                    const cam = camera.current;
                    if (interaction.current.mode === 'PAN') {
                        cam.tx += dx;
                        cam.ty += dy;
                        cam.x += dx; 
                        cam.y += dy;
                    } else {
                        cam.tRot -= dx * 0.005;
                        cam.rot -= dx * 0.005;
                        cam.tTilt = Math.min(Math.max(0, cam.tTilt - dy * 0.005), Math.PI / 2.1);
                        cam.tilt = cam.tTilt;
                    }
                }
                interaction.current.lastX = clientX;
                interaction.current.lastY = clientY;
            }
        } else if (type === 'UP') {
            interaction.current.isDown = false;
            if (!interaction.current.isDragging && hoveredNode) {
                 handleFocusSector(hoveredNode.sector.address);
            }
            interaction.current.isDragging = false; 
        }
    };

    const handleSync = async () => {
        if (!web3 || viewOnly) return;
        setIsScanning(true);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Scanning Topology...` });

        try {
            const currentBlock = await web3.getProvider().getBlockNumber();
            const mapContract = web3.getContract(ADDRESSES.MAP, MAP_ABI);
            const range = 50000;
            const start = Math.max(22813947, currentBlock - range);
            const events = await mapContract.queryFilter("NewQing", start, currentBlock);
            
            if (events.length > 0) {
                const newSectors: SectorData[] = [];
                for(const e of events) {
                    // @ts-ignore
                    const [qAddr, intAddr, waat] = e.args;
                    try {
                        const q = web3.getContract(qAddr, QING_ABI);
                        const [name, sym] = await Promise.all([q.name(), q.symbol()]);
                        const s: SectorData = {
                            address: qAddr,
                            name,
                            symbol: sym,
                            integrative: intAddr,
                            waat: waat.toString(),
                            isSystem: false
                        };
                        newSectors.push(s);
                        await Persistence.saveSector(s);
                    } catch {}
                }
                setSectors(prev => {
                    const existing = new Set(prev.map(s => s.address.toLowerCase()));
                    const filtered = newSectors.filter(s => !existing.has(s.address.toLowerCase()));
                    return [...prev, ...filtered];
                });
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Topology Updated: ${newSectors.length} Vectors Found.` });
            } else {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Topology Up to Date.` });
            }

        } catch (e: any) {
             addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Scan Failed: ${e.message}` });
        } finally {
            setIsScanning(false);
        }
    };

    const filteredSectors = useMemo(() => {
        return sectors.filter(s => 
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            s.address.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [sectors, searchQuery]);

    const selectedNodeData = useMemo(() => 
        nodes.find(n => n.sector.address === selectedSectorAddr), 
    [nodes, selectedSectorAddr]);

    return (
        <div className="h-full flex flex-col bg-dys-black relative overflow-hidden">
            
            {/* CANVAS CONTAINER */}
            <div 
                ref={containerRef}
                className={`absolute inset-0 z-0 ${viewOnly ? 'cursor-default' : (interaction.current.isDown ? 'cursor-grabbing' : 'cursor-crosshair')}`}
                onWheel={(e) => {
                    if (viewOnly) return;
                    const delta = -e.deltaY * 0.001 * camera.current.zoom;
                    camera.current.tZoom = Math.min(Math.max(0.2, camera.current.tZoom + delta), 20);
                }}
                onMouseDown={(e) => handleInteraction(e, 'DOWN')}
                onMouseMove={(e) => handleInteraction(e, 'MOVE')}
                onMouseUp={(e) => handleInteraction(e, 'UP')}
                onMouseLeave={(e) => { interaction.current.isDown = false; }}
            >
                <canvas ref={canvasRef} className="w-full h-full" />
            </div>

            {/* UI ELEMENTS (HIDDEN IN VIEW ONLY) */}
            {!viewOnly && (
                <>
                    {/* UI: LEFT SIDEBAR (QING LIST) */}
                    <div className={`absolute left-0 top-0 bottom-0 w-64 bg-black/80 border-r border-dys-border backdrop-blur-sm z-10 transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-64'}`}>
                        <div className="p-4 border-b border-dys-border bg-dys-panel/50">
                            <h2 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">SECTOR_REGISTRY</h2>
                            <input 
                                className="w-full bg-black border border-dys-border p-2 text-xs text-white focus:border-dys-cyan outline-none font-mono mb-2"
                                placeholder="Search Vector..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button 
                                onClick={handleSync}
                                disabled={isScanning}
                                className={`w-full py-1 text-[10px] font-bold border transition-colors ${isScanning ? 'bg-dys-gold text-black border-dys-gold animate-pulse' : 'bg-black text-dys-gold border-dys-gold hover:bg-dys-gold hover:text-black'}`}
                            >
                                {isScanning ? 'SYNCING TOPOLOGY...' : 'SYNC DATA'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                            {filteredSectors.map(s => (
                                <button 
                                    key={s.address}
                                    onClick={() => handleFocusSector(s.address)}
                                    className={`w-full text-left p-2 border-l-2 text-xs font-mono transition-colors flex justify-between items-center ${
                                        selectedSectorAddr === s.address 
                                        ? 'border-dys-cyan bg-dys-cyan/10 text-white' 
                                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="truncate">{s.name}</span>
                                    {s.isSystem && <span className="text-[9px] text-dys-gold">SYS</span>}
                                </button>
                            ))}
                            {filteredSectors.length === 0 && (
                                <div className="text-center text-gray-600 text-[10px] mt-4">NO SIGNAL DETECTED</div>
                            )}
                        </div>
                        <button 
                            className="absolute -right-6 top-1/2 w-6 h-12 bg-dys-panel border-y border-r border-dys-border flex items-center justify-center text-dys-cyan text-xs"
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                        >
                            {isSidebarOpen ? '◄' : '►'}
                        </button>
                    </div>

                    {/* UI: TOP HUD */}
                    <div className="absolute top-4 left-0 right-0 pointer-events-none flex justify-center z-10">
                        <div className="bg-black/80 border border-dys-border px-4 py-1 text-xs text-dys-gold font-mono tracking-widest backdrop-blur">
                            MANIFOLD_VIEWER // NODES: {nodes.length}
                        </div>
                    </div>

                    {/* UI: BOTTOM CENTER HELP (Moved from Left to Center) */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-[10px] text-gray-500 font-mono bg-black/80 p-2 border border-gray-800 whitespace-nowrap backdrop-blur-sm">
                        [LMB] PAN | [SHIFT+LMB] ORBIT | [SCROLL] ZOOM | [CLICK] SELECT
                    </div>

                    {/* UI: RIGHT HUD (SELECTION DETAILS) */}
                    {selectedSectorAddr && (
                        <div className="absolute top-4 right-4 w-80 bg-dys-panel/95 border border-dys-cyan backdrop-blur-md z-20 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right-10 duration-300">
                            <div className="flex justify-between items-center bg-dys-cyan p-1 px-2">
                                <span className="text-black text-[9px] font-bold tracking-widest">TARGET_LOCKED</span>
                                <button 
                                    onClick={() => setSelectedSectorAddr(null)} 
                                    className="text-black hover:text-white bg-dys-cyan hover:bg-black/20 font-bold text-lg w-8 h-8 flex items-center justify-center rounded-sm transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            
                            <div className="p-4 relative overflow-hidden">
                                <div className="absolute inset-0 opacity-5 bg-[linear-gradient(45deg,rgba(0,240,255,0.1)_25%,transparent_25%,transparent_50%,rgba(0,240,255,0.1)_50%,rgba(0,240,255,0.1)_75%,transparent_75%,transparent)] bg-[length:4px_4px]"></div>
                                <div className="relative z-10 space-y-3">
                                    <div>
                                        <h2 className="text-lg text-white font-bold tracking-tight leading-none break-words">
                                            {selectedNodeData?.sector.name || "UNKNOWN"}
                                        </h2>
                                        <div className="text-[10px] text-dys-cyan font-mono break-all opacity-80 mt-1 select-all">
                                            {selectedSectorAddr}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 border-t border-gray-800 pt-2">
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase">CLASS</div>
                                            <div className="text-xs text-dys-gold font-bold">{selectedNodeData?.sector.isSystem ? "ROOT" : "TERRITORY"}</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase">MASS</div>
                                            <div className="text-xs text-purple-400 font-bold">{selectedNodeData?.mass.toFixed(0)} E</div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-[9px] text-gray-500 uppercase">COORD (WAAT)</div>
                                            <div className="text-xs text-gray-400 font-mono break-all select-all">
                                                {selectedNodeData?.sector.waat}
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        className="w-full bg-dys-cyan/20 border border-dys-cyan text-dys-cyan hover:bg-dys-cyan hover:text-black py-2 font-bold text-[10px] tracking-widest transition-all mt-1"
                                        onClick={() => onSelectSector(selectedSectorAddr)}
                                    >
                                        ENGAGE NAV DRIVE
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Reset View Button */}
                    <div className="absolute bottom-4 right-4 z-10">
                        <button 
                            className="bg-dys-panel border border-dys-gold text-dys-gold px-3 h-8 flex items-center justify-center font-bold text-xs hover:bg-dys-gold hover:text-black"
                            onClick={() => { 
                                camera.current.tx = 0; camera.current.ty = 0; 
                                camera.current.tZoom = 0.6; camera.current.tTilt = 0.8; camera.current.tRot = 0.5;
                            }}
                        >RESET CAM</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default QingMap;