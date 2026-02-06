import React, { useRef, useEffect, useState } from 'react';
import { SectorData, Persistence } from '../services/persistenceService';
import { LogEntry } from '../types';

interface QingMapProps {
    addLog: (entry: LogEntry) => void;
    onSelectSector: (address: string) => void;
}

interface RenderNode {
    x: number;
    y: number;
    sector: SectorData;
    mass: number;
    // Cache projected coords for hit testing
    sx?: number; 
    sy?: number;
}

const QingMap: React.FC<QingMapProps> = ({ addLog, onSelectSector }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [sectors, setSectors] = useState<SectorData[]>([]);
    const [nodes, setNodes] = useState<RenderNode[]>([]);
    const [hoveredNode, setHoveredNode] = useState<RenderNode | null>(null);

    // Viewport State
    const [zoom, setZoom] = useState(0.6); // Start zoomed out for overview
    // Offset in Screen Space
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    
    // Camera Angles
    const [tilt, setTilt] = useState(0.8); // Start at a nice angle
    const [rotation, setRotation] = useState(0.5); // Yaw

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragMode, setDragMode] = useState<'PAN' | 'ORBIT'>('PAN');

    useEffect(() => {
        const loadSectors = async () => {
            const data = await Persistence.getAllSectors();
            setSectors(data);
            if (data.length > 0) {
                 addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Topological Scan: ${data.length} Vectors Loaded.` });
            }
        };
        loadSectors();
    }, []);

    // Convert Waat to Lat/Lon (-180..180, -90..90)
    useEffect(() => {
        if (!containerRef.current) return;
        
        const calcNodes = sectors.map(s => {
            let lat = 0, lon = 0;
            try {
                const waatBn = BigInt(s.waat);
                lat = Number(waatBn % 180n) - 90;
                lon = Number((waatBn / 180n) % 360n) - 180;
            } catch (e) {
                // fallback
            }

            // Mass simulation
            // System nodes (Void, etc) get massive gravity
            // Regular QINGs get smaller gravity
            const entropySim = s.isSystem ? 100 : (parseInt(s.address.slice(-4), 16) % 30) + 10; 
            
            return {
                x: lon, 
                y: lat,
                sector: s,
                mass: entropySim
            };
        });

        setNodes(calcNodes);
    }, [sectors]);

    // Animation Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = (time: number) => {
            // Resize handling
            if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }

            const width = canvas.width;
            const height = canvas.height;
            const cx = width / 2 + offset.x;
            const cy = height / 2 + offset.y;
            const scale = Math.min(width, height) / 180 * zoom; 

            // Clear
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, width, height);

            // --- 3D MATH ---
            
            // 1. Calculate Z based on gravity wells
            const getZ = (x: number, y: number) => {
                let z = 0;
                // Optimization: Only check nodes within range or assume global effect
                // For smoother visuals, we sum all, but cap distance impact
                for (const node of nodes) {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distSq = dx*dx + dy*dy;
                    
                    // IMPROVED GRAVITY FORMULA (Shallower)
                    // Multiplier reduced from 2.5 to 0.5 to prevent deep spikes
                    // Dampening reduced to 0.05 to create wider, gentler slopes
                    z -= (node.mass * 0.5) / (1 + distSq * 0.05);
                }
                return z;
            };

            // 2. Project 3D (x,y,z) -> 2D (sx, sy)
            const cosRot = Math.cos(rotation);
            const sinRot = Math.sin(rotation);
            const cosTilt = Math.cos(tilt);
            const sinTilt = Math.sin(tilt);

            const project = (x: number, y: number, z: number) => {
                // Rotate (Yaw) around Z-axis center (0,0)
                const rx = x * cosRot - y * sinRot;
                const ry = x * sinRot + y * cosRot;

                // Tilt (Pitch) - effectively squashing Y and offsetting by Z
                // We map 3D Y to Screen Y via Cos(Tilt)
                // We map 3D Z to Screen Y via Sin(Tilt) (Vertical displacement)
                
                const sx = cx + rx * scale;
                const sy = cy + (ry * cosTilt - z * sinTilt) * scale;
                
                return { sx, sy };
            };

            // --- GRID RENDERING ---

            const gridSize = 3; // Grid density
            const subSteps = 1; // High resolution for curves

            // Helper to draw a line segment series
            const drawPoly = (points: {x:number, y:number}[]) => {
                ctx.beginPath();
                let first = true;
                for (const p of points) {
                    const z = getZ(p.x, p.y);
                    const proj = project(p.x, p.y, z);
                    
                    // Simple Culling
                    if (proj.sx < -width || proj.sx > width*2 || proj.sy < -height || proj.sy > height*2) {
                        first = true; // reset path if jump happens (unlikely here but good practice)
                        continue;
                    }

                    if (first) {
                        ctx.moveTo(proj.sx, proj.sy);
                        first = false;
                    } else {
                        ctx.lineTo(proj.sx, proj.sy);
                    }
                }
                ctx.stroke();
            };

            ctx.lineWidth = 1;
            
            // Draw Latitude Lines
            for (let lat = -90; lat <= 90; lat += gridSize * 2) {
                const points = [];
                for (let lon = -180; lon <= 180; lon += subSteps) {
                    points.push({ x: lon, y: lat });
                }
                // Color depth cueing?
                ctx.strokeStyle = `rgba(0, 240, 255, ${Math.abs(lat) < 60 ? 0.12 : 0.04})`;
                drawPoly(points);
            }

            // Draw Longitude Lines
            for (let lon = -180; lon <= 180; lon += gridSize * 2) {
                const points = [];
                for (let lat = -90; lat <= 90; lat += subSteps) {
                    points.push({ x: lon, y: lat });
                }
                ctx.strokeStyle = `rgba(139, 92, 246, ${Math.abs(lon) < 120 ? 0.12 : 0.04})`;
                drawPoly(points);
            }

            // --- NODES RENDERING ---
            
            nodes.forEach(node => {
                const z = getZ(node.x, node.y);
                const p = project(node.x, node.y, z);
                
                // Store projected coords for hit testing
                node.sx = p.sx;
                node.sy = p.sy;

                // Culling
                if (p.sx < -20 || p.sx > width + 20 || p.sy < -20 || p.sy > height + 20) return;

                const isHover = hoveredNode === node;
                const pulse = Math.sin(time / 400) * 3 + 2;
                
                // Draw Core
                ctx.beginPath();
                const radius = (isHover ? 5 : 2.5) * (zoom < 1 ? 1 : zoom * 0.8);
                ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
                ctx.fillStyle = node.sector.isSystem ? '#ffb000' : '#ffffff';
                ctx.fill();

                // Draw Field Glow
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, radius + pulse + (node.mass/30), 0, Math.PI * 2);
                ctx.strokeStyle = node.sector.isSystem ? `rgba(255, 176, 0, 0.4)` : `rgba(139, 92, 246, 0.4)`;
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Draw Label if zoomed in or system node
                if (zoom > 2 || node.sector.isSystem || isHover) {
                    ctx.font = '9px "JetBrains Mono"';
                    ctx.fillStyle = isHover ? '#fff' : 'rgba(255,255,255,0.5)';
                    ctx.fillText(node.sector.name, p.sx + 10, p.sy + 4);
                }
            });

            // --- HUD OVERLAY ---
            if (hoveredNode && hoveredNode.sx !== undefined && hoveredNode.sy !== undefined) {
                const hx = hoveredNode.sx;
                const hy = hoveredNode.sy;

                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 1;
                
                // Connector line
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx + 20, hy - 20);
                ctx.lineTo(hx + 180, hy - 20);
                ctx.stroke();

                // Box
                ctx.fillStyle = 'rgba(5, 5, 8, 0.9)';
                ctx.fillRect(hx + 20, hy - 80, 160, 60);
                ctx.strokeRect(hx + 20, hy - 80, 160, 60);

                ctx.font = 'bold 11px "JetBrains Mono"';
                ctx.fillStyle = '#00f0ff';
                ctx.fillText(hoveredNode.sector.name, hx + 30, hy - 65);

                ctx.font = '9px "JetBrains Mono"';
                ctx.fillStyle = '#aaa';
                ctx.fillText(hoveredNode.sector.isSystem ? 'CLASS: SYSTEM ROOT' : 'CLASS: TERRITORY', hx + 30, hy - 50);
                ctx.fillText(`MASS: ${hoveredNode.mass.toFixed(0)} ENTROPY`, hx + 30, hy - 35);
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render(0);

        return () => cancelAnimationFrame(animationFrameId);
    }, [zoom, offset, nodes, hoveredNode, rotation, tilt]);

    // --- INTERACTION ---

    const handleWheel = (e: React.WheelEvent) => {
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity * zoom;
        const newZoom = Math.min(Math.max(0.3, zoom + delta), 20);
        setZoom(newZoom);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        // Middle mouse or Shift+Click for Orbit
        if (e.button === 1 || e.shiftKey) {
            setDragMode('ORBIT');
        } else {
            setDragMode('PAN');
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (dragMode === 'PAN') {
                setOffset(prev => ({
                    x: prev.x + dx,
                    y: prev.y + dy
                }));
            } else {
                setRotation(prev => prev - dx * 0.005);
                // INVERTED TILT: Drag Down (+dy) -> Decrease Tilt (look more from top)
                setTilt(prev => Math.min(Math.max(0, prev - dy * 0.005), Math.PI / 2.1));
            }
            
            setDragStart({ x: e.clientX, y: e.clientY });
        }

        // Hit Testing in Screen Space (since we cached sx, sy)
        if (!isDragging) {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let closest: RenderNode | null = null;
            let minDescSq = Infinity;
            const threshold = 15; // pixels

            nodes.forEach(node => {
                if (node.sx === undefined || node.sy === undefined) return;
                const distSq = (mouseX - node.sx) ** 2 + (mouseY - node.sy) ** 2;
                if (distSq < threshold * threshold && distSq < minDescSq) {
                    minDescSq = distSq;
                    closest = node;
                }
            });
            setHoveredNode(closest);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleClick = () => {
        if (hoveredNode) {
            onSelectSector(hoveredNode.sector.address);
        }
    };

    return (
        <div className="h-full flex flex-col bg-dys-black p-4 md:p-8">
            <div className="w-full h-full max-w-6xl mx-auto flex flex-col border border-dys-border bg-black relative">
                <div className="absolute top-0 left-0 p-4 z-10 pointer-events-none select-none">
                    <h2 className="text-2xl text-dys-cyan font-bold tracking-tighter">DYSNOMIA_MANIFOLD</h2>
                    <div className="text-xs text-gray-500 mt-1 font-mono">
                        GRAVITY_VIEW // NODES: {sectors.length} // TILT: {(tilt * 57.29).toFixed(0)}°
                    </div>
                </div>
                
                <div className="absolute bottom-4 left-4 z-10 pointer-events-none select-none text-[10px] text-gray-600 font-mono">
                    [LMB] PAN  |  [SHIFT+LMB] ORBIT  |  [SCROLL] ZOOM
                </div>

                <div 
                    ref={containerRef}
                    className={`flex-1 w-full h-full overflow-hidden relative ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={handleClick}
                >
                    <canvas ref={canvasRef} className="absolute inset-0" />
                    
                    {/* Controls Overlay */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                         <button 
                            className="bg-dys-panel border border-dys-gold text-dys-gold px-3 h-8 flex items-center justify-center font-bold text-xs hover:bg-dys-gold hover:text-black"
                            onClick={() => { setOffset({x:0, y:0}); setZoom(0.6); setTilt(0.8); setRotation(0.5); }}
                        >RESET VIEW</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QingMap;