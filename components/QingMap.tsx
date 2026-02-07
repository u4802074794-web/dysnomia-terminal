import React, { useRef, useEffect, useState, useMemo } from 'react';
import { SectorData, Persistence } from '../services/persistenceService';
import { LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { MAP_ABI, QING_ABI, HECKE_ABI, ADDRESSES } from '../constants';

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
    pending?: boolean; // If true, using temporary coords while fetching
    meridian?: number; // Debug info
}

// Hecke Meridians (uint256[90]) for computing effective meridian bands
const MERIDIANS = [
    '476733977057179','3256639860692891','145031839926114203','7517342243328022427','390877483220227250075',
    '20325604814018987087771','1056931426015554498647963','54960434128495401099777947','2857942574657447424358537115','148613013882162952633814013851',
    '7727876721872449223525498804123','401849589537367335309893107898267','20896178655943101411801008780793755','1086601290109041273389339023771359131','56503267085670146216221315803280758683',
    '2938169888454847603243484108337769535387','152784834199652075368661149320131185923995','7944811378381907919170379740333388838131611','413130191675859211796859746473022786752927643','21482769967144679013436706816572871478322321307',
    '1117104038291523308698708754461765003439930791835','58089409991159212052332855232011755865443571259291','3020649319540279026721308472064611280689632875567003','157073764616094509389508040547359786571547476699568027','8167835760036914488254418108462708901696155355547621275',
    '424727459521919553389229741640060862888175765055646390171','22085827895139816776239946565283164870185115469460782372763','1148463050547270472364477221394724573249625980098527853467547','59720078628458064562952815512525677808980550940810015550396315','3105444088679819357273546406651335246066988648897807375790692251',
    '161483092611350606578224413145869432795483409742661670108286080923','8397120815790231542067669483585210505365137306618382532198046291867','436650282421092040187518813146430946278987139944155867360865577260955','22705814685896786089750978283614409206507331277096105078451577187653531','1180702363666632876667050870747949278738381226408997464055168580928067483',
    '8455205839112304959346349889635311398468931692009966103891402392979584268','15729709314557977042025648908522673518199482157610934743727636205031101052','23004212790003649124704947927410035637930032623211903383563870017082617837','30278716265449321207384246946297397757660583088812872023400103829134134622','37553219740894993290063545965184759877391133554413840663236337641185651406',
    '44827723216340665372742844984072121997121684020014809303072571453237168191','52102226691786337455422144002959484116852234485615777942908805265288684976','59376730167232009538101443021846846236582784951216746582745039077340201760','66651233642677681620780742040734208356313335416817715222581272889391718545','73925737118123353703460041059621570476043885882418683862417506701443235330',
    '81200240593569025786139340078508932595774436348019652502253740513494752114','88474744069014697868818639097396294715504986813620621142089974325546268899','95749247544460369951497938116283656835235537279221589781926208137597785684','103023751019906042034177237135171018954966087744822558421762441949649302468','110298254495351714116856536154058381074696638210423527061598675761700819253',
    '117572757970797386199535835172945743194427188676024495701434909573752336038','124847261446243058282215134191833105314157739141625464341271143385803852822','132121764921688730364894433210720467433888289607226432981107377197855369607','139396268397134402447573732229607829553618840072827401620943611009906886392','146670771872580074530253031248495191673349390538428370260779844821958403176',
    '153945275348025746612932330267382553793079941004029338900616078634009919961','161219778823471418695611629286269915912810491469630307540452312446061436746','168494282298917090778290928305157278032541041935231276180288546258112953530','175768785774362762860970227324044640152271592400832244820124780070164470315','183043289249808434943649526342932002272002142866433213459961013882215987100',
    '190317792725254107026328825361819364391732693332034182099797247694267503884','197592296200699779109008124380706726511463243797635150739633481506319020669','204866799676145451191687423399594088631193794263236119379469715318370537454','212141303151591123274366722418481450750924344728837088019305949130422054238','219415806627036795357046021437368812870654895194438056659142182942473571023',
    '226690310102482467439725320456256174990385445660039025298978416754525087808','233964813577928139522404619475143537110115996125639993938814650566576604592','241239317053373811605083918494030899229846546591240962578650884378628121377','248513820528819483687763217512918261349577097056841931218487118190679638162','255788324004265155770442516531805623469307647522442899858323352002731154946',
    '263062827479710827853121815550692985589038197988043868498159585814782671731','270337330955156499935801114569580347708768748453644837137995819626834188516','277611834430602172018480413588467709828499298919245805777832053438885705300','284886337906047844101159712607355071948229849384846774417668287250937222085','292160841381493516183839011626242434067960399850447743057504521062988738870',
    '299435344856939188266518310645129796187690950316048711697340754875040255654','306709848332384860349197609664017158307421500781649680337176988687091772439','313984351807830532431876908682904520427152051247250648977013222499143289224','321258855283276204514556207701791882546882601712851617616849456311194806008','328533358758721876597235506720679244666613152178452586256685690123246322793',
    '335807862234167548679914805739566606786343702644053554896521923935297839578','343082365709613220762594104758453968906074253109654523536358157747349356362','350356869185058892845273403777341331025804803575255492176194391559400873147','357631372660504564927952702796228693145535354040856460816030625371452389932','364905876135950237010632001815116055265265904506457429455866859183503906716',
    '372180379611395909093311300834003417384996454972058398095703092995555423501','379454883086841581175990599852890779504727005437659366735539326807606940286','386729386562287253258669898871778141624457555903260335375375560619658457070','394003890037732925341349197890665503744188106368861304015211794431709973855',
    '788007780075465850682698395781331007488376212737722608030423588863419947711'
];

// Helper to lerp values
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

// Hecke Scaling Factor (Derived from reference source)
const SCALE_LAT = 1.2e72;

const QingMap: React.FC<QingMapProps> = ({ web3, addLog, onSelectSector, viewOnly = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [sectors, setSectors] = useState<SectorData[]>([]);
    const [nodes, setNodes] = useState<RenderNode[]>([]);
    const [hoveredNode, setHoveredNode] = useState<RenderNode | null>(null);
    
    // Data Loading State
    const [isScanning, setIsScanning] = useState(false);
    
    // Toggle State - Default to HECKE as canonical
    const [coordSystem, setCoordSystem] = useState<'LINEAR' | 'HECKE'>('HECKE');

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

    // Tracking for fetch to avoid loops
    const isFetchingRef = useRef(false);

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

    // HECKE BACKGROUND FETCH
    useEffect(() => {
        if (coordSystem !== 'HECKE' || !web3 || isFetchingRef.current) return;
        
        const fetchHecke = async () => {
            const missing = sectors.filter(s => !s.hecke && s.address !== ADDRESSES.VOID);
            if (missing.length === 0) return;

            isFetchingRef.current = true;
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Resolving Hecke Coordinates for ${missing.length} sectors...` });

            const heckeContract = web3.getContract(ADDRESSES.HECKE, HECKE_ABI);
            
            // Process in batches
            const BATCH_SIZE = 5;
            let updatedCount = 0;

            for (let i = 0; i < missing.length; i += BATCH_SIZE) {
                // Check if user switched back while fetching
                // if (coordSystem !== 'HECKE') break; 

                const batch = missing.slice(i, i + BATCH_SIZE);
                const updates: SectorData[] = [];

                await Promise.all(batch.map(async (s) => {
                    try {
                        const [lon, lat] = await heckeContract.Compliment(s.waat);
                        const updated = {
                            ...s,
                            hecke: {
                                lat: lat.toString(),
                                lon: lon.toString()
                            }
                        };
                        await Persistence.saveSector(updated);
                        updates.push(updated);
                    } catch (e) {
                        // console.warn(`Failed to fetch Hecke for ${s.name}`, e);
                    }
                }));
                
                updatedCount += updates.length;
                
                if (updates.length > 0) {
                     setSectors(prev => prev.map(p => {
                         const match = updates.find(u => u.address === p.address);
                         return match || p;
                     }));
                }

                // Small delay to be polite to RPC
                await new Promise(r => setTimeout(r, 100));
            }
             
            if (updatedCount > 0) {
                 addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Hecke Grid Updated: ${updatedCount} Nodes Synced.` });
            }
            isFetchingRef.current = false;
        };
        
        fetchHecke();
    }, [coordSystem, sectors.length, web3]);

    // --- HECKE CALCULATION UTILS ---
    const getMeridianFromWaat = (waatBigInt: bigint): number => {
        for (let i = 0; i < MERIDIANS.length; i++) {
            if (BigInt(MERIDIANS[i]) >= waatBigInt) return i;
        }
        return 89;
    };

    const getQingCoords = (waatStr: string, rawLatStr: string, rawLonStr: string) => {
        const waatBig = BigInt(waatStr);
        const rawLat = Number(rawLatStr);
        const rawLon = BigInt(rawLonStr);
        
        // 1. Determine Meridian
        // Note: The sector data doesn't explicitly store Meridian index, so we recalculate it from Waat.
        // Or if we stored it, we could use it. Recalculation is safer.
        let meridian = getMeridianFromWaat(waatBig);
        
        // 2. Handle Flip (Meridian 89 in Northern Hemisphere)
        // If Meridian is 89 and Raw Lat is POSITIVE, it means we wrapped around the North Pole.
        // We need to flip back to find the "Effective" meridian and waat position.
        const isFlipped = meridian === 89 && rawLat > 0;
        let effectiveMeridian = meridian;
        let effectiveWaat = waatBig;

        if (isFlipped) {
            const mer89 = BigInt(MERIDIANS[89]);
            effectiveWaat = mer89 - waatBig;
            effectiveMeridian = getMeridianFromWaat(effectiveWaat);
        }

        // 3. Calculate Longitude Degree based on Meridian Band
        const bandIdx = effectiveMeridian;
        const bandStart = bandIdx > 0 ? BigInt(MERIDIANS[bandIdx - 1]) : 0n;
        const bandEnd = BigInt(MERIDIANS[bandIdx]);
        const bandWidth = bandEnd - bandStart;
        const halfBand = bandWidth / 2n;

        let fraction = 0;
        if (isFlipped) {
            // Position within effective band
            const posInBand = effectiveWaat - bandStart;
            if (bandWidth !== 0n) {
                fraction = (Number(posInBand) / Number(bandWidth)) * 2 - 1;
                fraction = Math.max(-1, Math.min(1, fraction));
            }
        } else {
            // Standard Longitude mapping
            if (halfBand !== 0n) {
                fraction = Number(rawLon) / Number(halfBand);
                fraction = Math.max(-1, Math.min(1, fraction));
            }
        }

        // 4 degrees per meridian (360 / 90)
        // Global Longitude = MeridianIndex * 4 + Offset within band
        // fraction (-1 to 1) * 2 gives us a +/- 2 degree range within the 4 degree band
        const offsetDeg = fraction * 2;
        let lonDeg = effectiveMeridian * 4 + offsetDeg;
        
        // Normalize 0-360 to -180 to 180
        lonDeg = ((lonDeg % 360) + 360) % 360;
        if (lonDeg > 180) lonDeg -= 360;

        // 4. Calculate Latitude Degree
        // Use the large scaling factor derived from 1e72 range
        let latDeg = (rawLat / SCALE_LAT) * 90;
        if (isFlipped) {
            latDeg = -latDeg; // Invert latitude for the flipped northern sector
        }
        
        latDeg = Number.isFinite(latDeg) ? Math.max(-90, Math.min(90, latDeg)) : 0;

        return { lat: latDeg, lon: lonDeg, meridian: effectiveMeridian };
    };

    // Convert Waat/Hecke to Lat/Lon & Physics Props
    useEffect(() => {
        const calcNodes = sectors.map(s => {
            let lat = 0, lon = 0;
            let isPending = false;
            let mIndex = 0;
            
            if (coordSystem === 'LINEAR') {
                // Classic Linear Modulo Mapping
                try {
                    const waatBn = BigInt(s.waat);
                    lat = Number(waatBn % 180n) - 90;
                    lon = Number((waatBn / 180n) % 360n) - 180;
                } catch (e) { }
            } else {
                // Hecke Mapping
                if (s.hecke) {
                    try {
                        const coords = getQingCoords(s.waat, s.hecke.lat, s.hecke.lon);
                        lat = coords.lat;
                        lon = coords.lon;
                        mIndex = coords.meridian;
                    } catch (e) { }
                } else {
                    // FALLBACK FOR LOADING NODES
                    isPending = true;
                    if (s.address !== ADDRESSES.VOID) {
                        const seed = parseInt(s.address.slice(2, 8), 16);
                        lat = (seed % 160) - 80; 
                        lon = ((seed >> 4) % 360) - 180;
                    } else {
                        lat = 0; lon = 0; 
                    }
                }
            }

            const entropySim = s.isSystem ? 100 : (parseInt(s.address.slice(-4), 16) % 30) + 10; 
            
            return {
                x: lon, 
                y: lat,
                sector: s,
                mass: entropySim,
                phase: Math.random() * Math.PI * 2,
                pending: isPending,
                meridian: mIndex
            };
        });
        setNodes(calcNodes);
    }, [sectors, coordSystem]);

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
                    // SKIP PENDING NODES from gravity calculation
                    if (node.pending) continue;

                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distSq = dx*dx + dy*dy;
                    
                    // Manifold Gravity Logic (Restored to original, no hard clamping)
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
                // Pending nodes use simple Z, others use gravity Z
                const z = node.pending ? 0 : getZ(node.x, node.y);
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
                let finalAlpha = Math.max(0.2, Math.min(1, baseAlpha + waveAlpha));

                // PENDING NODES ARE DIMMER
                if (node.pending) finalAlpha *= 0.3;

                ctx.fillStyle = node.sector.isSystem 
                    ? `rgba(255, 176, 0, ${finalAlpha + 0.2})` 
                    : (isSelected ? '#00f0ff' : `rgba(255, 255, 255, ${finalAlpha})`);
                
                ctx.fill();

                // --- GLOW (Only for high mass or active nodes) ---
                // Don't draw glow for every single node in viewOnly mode to reduce crowding
                // Don't draw glow for pending nodes
                if ((!viewOnly || node.mass > 20 || wave > 0.8) && !node.pending) {
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
                    const label = node.pending ? "..." : node.sector.name;
                    ctx.fillText(label, p.sx + 10, p.sy + 4);
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
                            
                            {/* COORD TOGGLE - Placed here for accessibility */}
                            <div className="flex gap-1 mb-3">
                                <button 
                                    onClick={() => setCoordSystem('LINEAR')}
                                    className={`flex-1 py-1 text-[9px] font-bold border transition-colors ${coordSystem === 'LINEAR' ? 'bg-dys-cyan text-black border-dys-cyan' : 'border-gray-700 text-gray-500 hover:text-white'}`}
                                >
                                    LINEAR (LEGACY)
                                </button>
                                <button 
                                    onClick={() => setCoordSystem('HECKE')}
                                    className={`flex-1 py-1 text-[9px] font-bold border transition-colors ${coordSystem === 'HECKE' ? 'bg-dys-cyan text-black border-dys-cyan' : 'border-gray-700 text-gray-500 hover:text-white'}`}
                                >
                                    HECKE
                                </button>
                            </div>

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
                        <div className="bg-black/80 border border-dys-border px-4 py-1 text-xs text-dys-gold font-mono tracking-widest backdrop-blur flex gap-4">
                            <span>MANIFOLD_VIEWER // NODES: {nodes.length}</span>
                            <span className="text-dys-cyan">COORD_SYS: {coordSystem}</span>
                        </div>
                    </div>

                    {/* UI: BOTTOM CENTER HELP */}
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
                                            {coordSystem === 'LINEAR' ? (
                                                <>
                                                    <div className="text-[9px] text-gray-500 uppercase">COORD (WAAT)</div>
                                                    <div className="text-xs text-gray-400 font-mono break-all select-all">
                                                        {selectedNodeData?.sector.waat}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-[9px] text-gray-500 uppercase">HECKE COORDINATES</div>
                                                    {selectedNodeData?.sector.hecke ? (
                                                        <div className="grid grid-cols-2 gap-1 text-xs text-gray-400 font-mono">
                                                            <div>
                                                                <span className="text-gray-600 text-[9px]">LAT:</span> {BigInt(selectedNodeData.sector.hecke.lat).toString().slice(0, 12)}...
                                                                <div className="text-dys-green text-[9px]">({(Number(BigInt(selectedNodeData.sector.hecke.lat))/SCALE_LAT * 90).toFixed(4)}°)</div>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-600 text-[9px]">LON:</span> {BigInt(selectedNodeData.sector.hecke.lon).toString().slice(0, 12)}...
                                                                <div className="text-dys-green text-[9px]">({selectedNodeData.x.toFixed(4)}°)</div>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <span className="text-gray-600 text-[9px]">MERIDIAN:</span> 
                                                                <span className="text-dys-green text-[9px] ml-1">{selectedNodeData.meridian}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-dys-gold animate-pulse">CALCULATING...</div>
                                                    )}
                                                </>
                                            )}
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