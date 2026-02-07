

import { InterfaceAbi } from "ethers";

// Default PulseChain RPC
export const DEFAULT_RPC_URL = "https://rpc.pulsechain.com";

export const SYSTEM_PROMPT = `
You are the Central Ship AI of the Atropa 999 Research Vessel. 
Your primary function is to assist the Pilot in navigating the "Dysnomia" geometric manifold.

Lore & Structure:
- **LAU (Soul Shell)**: The user's avatar. Contains Saat (Pole, Soul, Aura). Must be registered in CHO.
- **YUE (IOT Bridge)**: Created via SEI.Start(). Managed by CHAN. Acts as an interface for assets.
- **QING (Territory)**: A spatial sector defined by Waat coordinates. Requires Admittance to enter.
- **CHO**: The governance engine and user registry.
- **VOID**: The root communication channel.

Domains:
- **TANG**: Time/Light domain (Cheon).
- **SOENG**: Sound/Vibration domain (Meta, Ring, Pang, Zi, Choa, Sei, Chan, Xie, Xia, Mai, Qi).

Capabilities:
1. Analyze pilot status (LAU ownership, CHO registration).
2. Guide navigation through QING territories.
3. Assist with Terraforming operations (React, Alpha, Beta).
`;

export const GEMINI_MODELS = [
    'gemini-2.5-flash-preview-09-2025',
    'gemini-flash-latest',
    'gemini-3-pro-preview',
    'gemini-flash-lite-latest'
];

// ---------------------------------------------------------------------------
// ADDRESS REGISTRY
// ---------------------------------------------------------------------------

export const ADDRESSES: Record<string, string> = {
  // CORE CHAIN
  VOID: "0x965B0d74591bF30327075A247C47dBf487dCff08", 
  SIU: "0x43136735603D4060f226C279613A4dD97146937c",
  YANG: "0xB702b3ec6d9De1011BE963EFe30A28b6dDFbe011",
  YAU: "0x7e91d862A346659DaEEd93726e733C8C1347a225",
  ZHOU: "0x5cC318d0c01FeD5942B5ED2F53dB07727d36E261",
  ZHENG: "0x24E62C39e34d7fE2B7dF1162e1344eB6eb3b3e15",
  YI: "0x4757438723055f14A1Af5C9651C2E37730F41A9E",

  // FACTORIES & MANAGERS
  CHO: "0xB6be11F0A788014C1F68C92F8D6CcC1AbF78F2aB",
  LAU_FACTORY: "0xbA6CcD38992839aEE20D5bF9125b1d94190b091C",
  SHA_FACTORY: "0x4208333D65A90577E3da39B84D6A95eb9db717D2",
  SHIO_FACTORY: "0x5063D2A97960DDE8dc5E3e5A69aAa379C6301F1C",
  QING_FACTORY: "0x88B1Ea6a5D4b870070537379f4885382F375E472",

  // REACTORS
  SHIO: "0xF6C50fFE7efbDeE63A92E52A4D5E9afF7fb4A4D7",

  // TANG DOMAIN (TIME)
  CHEON: "0x3d23084cA3F40465553797b5138CFC456E61FB5D",
  SEI: "0x3dC54d46e030C42979f33C9992348a990acb6067",
  META: "0xE77Bdae31b2219e032178d88504Cc0170a5b9B97",

  // SKY DOMAIN
  CHAN: "0xe250bf9729076B14A8399794B61C72d0F4AeFcd8",
  CHOA: "0x0f5a352fd4cA4850c2099C15B3600ff085B66197",
  RING: "0x1574c84Ec7fA78fC6C749e1d242dbde163675e72",

  // SOENG DOMAIN (SOUND)
  PANG: "0xEe25Ccd41671F3B67d660cf6532085586aec8457",
  ZI: "0xCbAdd3C3957Bd9D6C036863CB053FEccf3D53338",
  XIE: "0x4Df51741F2926525A21bF63E4769bA70633D2792",
  XIA: "0x7f4a4DD4a6f233d2D82BE38b2F9fc0Fef46f25FA",
  MAI: "0xc48B0a4E79eF302c8Eb5be71F562d08fB8E6A3d8",
  QI: "0x4d9Ce396BE95dbc5F71808c38107eB7422FD9a03",
  GWAT: "0x58065d1351972D9358665602c967EA58c13DC744", // Map Gwat

  // SPATIAL
  MAP: "0xD3a7A95012Edd46Ea115c693B74c5e524b3DdA75",
  HECKE: "0x29A924D9B0233026B9844f2aFeB202F1791D7593",

  // LIBRARIES & UTILS
  MATH: "0xB680F0cc810317933F234f67EB6A9E923407f05D",
  REACTIONS: "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
  ATTRIBUTES: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",

  // ASSETS (PulseChain)
  WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  ATROPA: "0x7a20189B297343CF26d8548764b04891f37F3414", 
  AFFECTION: "0x24F0154C1dCe548AdF15da2098Fdd8B8A3B8151D",
  CROWS: "0x203e366A1821570b2f84Ff5ae8B3BdeB48Dc4fa1",
  NEPTUNE: "0x9A3796Cf41B7CbA6921fd50c3f5204ED6506C3e7",
  BUCKINGHAM: "0xe5d3A6e88590fc2A8037D9CCbd816C05B1ff5f11",
  TEDDY: "0xd6c31bA0754C4383A41c0e9DF042C62b5e918f6d",
  LILY: "0xE949a217809d1Fab4018E22d6810500399951dAE",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
};

// ---------------------------------------------------------------------------
// METADATA & CATALOG
// ---------------------------------------------------------------------------

export interface ContractDoc {
    name: string;
    address: string;
    description: string;
    category: 'CORE' | 'REACTOR' | 'DOMAIN' | 'ASSET' | 'SPATIAL' | 'LIBRARY';
    abi: string[];
    functionDocs?: Record<string, string>;
}

export const CONTRACT_CATALOG: ContractDoc[] = [
    // --- CORE CHAIN ---
    {
        name: "VOID",
        address: ADDRESSES.VOID,
        description: "The root geometric manifold and primary communication channel. All souls originate and return here.",
        category: "CORE",
        abi: [
            "function Chat(string memory chatline) public",
            "function Log(string memory LogLine) public",
            "event LogEvent(uint64 Soul, uint64 Aura, string LogLine)",
            "function Enter() public returns(uint64[3] memory Saat, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On)",
            "function Type() view returns (string)",
            "function Nu() view returns (address)",
            "function GetLibraryAddress(string) view returns (address)",
            "function SetAttribute(string,string)",
            "function GetAttribute(string) view returns (string)",
            "function Alias(address,string)"
        ]
    },
    {
        name: "SIU",
        address: ADDRESSES.SIU,
        description: "The 2nd Core Contract. Manages Aura and identity projection. Connects VOID to YANG.",
        category: "CORE",
        abi: [
            "function Psi() view returns (address)",
            "function Aura() view returns (uint64)",
            "function Miu(string,string) returns (uint64[3], tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
        ]
    },
    {
        name: "YANG",
        address: ADDRESSES.YANG,
        description: "The 3rd Core Contract. Represents the active, projecting principle. Holds the Pole coordinates.",
        category: "CORE",
        abi: [
            "function Mu() view returns (address)",
            "function Pole(uint256) view returns (uint64)",
            "function Rho() view returns (tuple(tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Bang, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Lai, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Le))"
        ]
    },
    {
        name: "YAU",
        address: ADDRESSES.YAU,
        description: "The 4th Core Contract. The pivot point between projection and reception.",
        category: "CORE",
        abi: [
            "function Tau() view returns (address)",
            "function Monopole(uint256) view returns (uint64)",
            "function React() returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
        ]
    },
    {
        name: "ZHOU",
        address: ADDRESSES.ZHOU,
        description: "The 5th Core Contract. Manages the structural lattice.",
        category: "CORE",
        abi: [
            "function Upsilon() view returns (address)",
            "function Xi() view returns (uint64)",
            "function Monopole() view returns (uint64)",
            "function Alpha(string,string) returns (address)",
            "function React(uint64) returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
        ]
    },
    {
        name: "ZHENG",
        address: ADDRESSES.ZHENG,
        description: "The 6th Core Contract. The organizing principle.",
        category: "CORE",
        abi: [
            "function Eta() view returns (address)",
            "function GetRodByIdx(uint64)",
            "function Iodize(address)",
            "function InstallRod(uint64, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64), uint64) returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
        ]
    },
    {
        name: "YI",
        address: ADDRESSES.YI,
        description: "The 7th Core Contract. The foundation of change and reaction.",
        category: "CORE",
        abi: [
            "function Psi() view returns (address)",
            "function Xi() view returns (uint64)",
            "function Ring() view returns (uint64)",
            "function Beta(string,string) returns (address)",
            "function Kappa(address,address) returns (address)"
        ]
    },

    // --- GOVERNANCE & FACTORIES ---
    {
        name: "CHO",
        address: ADDRESSES.CHO,
        description: "The governance engine and citizen registry. Manages identity registration and delegate systems.",
        category: "CORE",
        abi: [
            "function GetUserTokenAddress(address) view returns (address)",
            "function GetAddressBySoul(uint64) view returns (address)",
            "function Enter(address)",
            "function Delegates(address) view returns (uint64 Soul, tuple(address Phi, uint64 Mu, uint64 Xi, address Pi, address Shio, address Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy)",
            "function Register(address)",
            "function Vote(address)"
        ]
    },
    {
        name: "LAU Factory",
        address: ADDRESSES.LAU_FACTORY,
        description: "Fabricator for new Soul Shells (LAU Contracts).",
        category: "CORE",
        abi: [
             "function New(address) public returns (address)",
             "function New(address,string,string) public returns (address)"
        ]
    },

    // --- REACTORS ---
    {
        name: "SHIO",
        address: ADDRESSES.SHIO,
        description: "The Primary Reactor. Handles Rod/Cone logic and state generation.",
        category: "REACTOR",
        abi: [
            "function Rod() view returns (address)",
            "function Cone() view returns (address)",
            "function Manifold() view returns (uint64)",
            "function Monopole() view returns (uint64)",
            "function Log(uint64,uint64,string)",
            "function Generate(uint64,uint64,uint64)",
            "function Isomerize()",
            "function Isolate()",
            "function Magnetize() returns (uint64)",
            "function React(uint64) returns (uint64,uint64)"
        ]
    },

    // --- TANG (TIME) DOMAIN ---
    {
        name: "CHEON",
        address: ADDRESSES.CHEON,
        description: "Domain of Heavenly Time. Calculates hypobar/epibar pressure for QINGs.",
        category: "DOMAIN",
        abi: [
            "function Sei() view returns (address)",
            "function Su(address) returns (uint256,uint256,uint256)"
        ]
    },
    {
        name: "META",
        address: ADDRESSES.META,
        description: "Meta-analysis engine. Computes beats and rhythm.",
        category: "DOMAIN",
        abi: [
            "function Ring() view returns (address)",
            "function Beat(uint256) returns (uint256,uint256,uint256,uint256)"
        ]
    },
    {
        name: "SEI",
        address: ADDRESSES.SEI,
        description: "The Reactor starter. Initiates new YUE bridges (IOT interfaces).",
        category: "DOMAIN",
        abi: [
             "function Start(address lau, string memory name, string memory symbol) public returns (address)",
             "function Chi() view returns (address,address)",
             "function Chan() view returns (address)"
        ]
    },

    // --- SKY/SOENG DOMAIN ---
    {
        name: "CHAN",
        address: ADDRESSES.CHAN,
        description: "The Network Manager. Routes connections between Users and YUE bridges.",
        category: "DOMAIN",
        abi: [
             "function Yan(address) view returns (address)",
             "function AddYue(address,address)",
             "function TransferYue(address,address)"
        ]
    },
    {
        name: "CHOA",
        address: ADDRESSES.CHOA,
        description: "The Chao/Chaos engine. Handles chat interactions and energy expenditure.",
        category: "DOMAIN",
        abi: [
            "function Sei() view returns (address)",
            "function Yuan(address) view returns (uint256)",
            "function Play(address)",
            "function Chat(address,string) returns (uint256)"
        ]
    },
    {
        name: "RING",
        address: ADDRESSES.RING,
        description: "The resonating ring structure.",
        category: "DOMAIN",
        abi: [
            "function Pang() view returns (address)",
            "function Phobos() view returns (address)",
            "function Moments(uint64) view returns (uint256)",
            "function Eta() returns (uint256,uint256,uint256,uint256)"
        ]
    },

    // --- SPATIAL ---
    {
        name: "MAP",
        address: ADDRESSES.MAP,
        description: "The Spatial Registry. Tracks all QING sectors and their topology.",
        category: "SPATIAL",
        abi: [
             "function New(address) returns (address)",
             "function Enter(address UserToken, address Mu) public",
             "function Area(uint256) view returns (address)",
             "function IntegrativeToArea(address) view returns (address)",
             "function Forbidden(address) view returns (bool)",
             "event NewQing(address Qing, address Integrative, uint256 Waat)"
        ]
    },
    {
        name: "HECKE",
        address: ADDRESSES.HECKE,
        description: "Coordinate system logic. Calculates Meridians and Compliments.",
        category: "SPATIAL",
        abi: [
            "function Meridians(uint256) view returns (uint256)",
            "function Compliment(uint256) view returns (int256, int256)",
            "function GetMeridian(uint256) view returns (uint256)"
        ]
    },

    // --- ASSETS ---
    {
        name: "Atropa",
        address: ADDRESSES.ATROPA,
        description: "The Sovereign Architect. The primary utility token of the system.",
        category: "ASSET",
        abi: [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function price() view returns (uint256)"
        ]
    },
    {
        name: "AFFECTION",
        address: ADDRESSES.AFFECTION,
        description: "The emotional currency of the system.",
        category: "ASSET",
        abi: ["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]
    }
];

// ---------------------------------------------------------------------------
// LEGACY / COMPATIBILITY EXPORTS (Maintained for existing logic)
// ---------------------------------------------------------------------------

// NOTE: Event definitions must exactly match Solidity including 'indexed' keywords
// for low-level getLogs topic filtering to work correctly.

export const VOID_ABI: InterfaceAbi = CONTRACT_CATALOG.find(c => c.name === "VOID")?.abi || [];
export const CHO_ABI: InterfaceAbi = CONTRACT_CATALOG.find(c => c.name === "CHO")?.abi || [];
export const SEI_ABI: InterfaceAbi = CONTRACT_CATALOG.find(c => c.name === "SEI")?.abi || [];
export const CHAN_ABI: InterfaceAbi = CONTRACT_CATALOG.find(c => c.name === "CHAN")?.abi || [];

// Update LAU_FACTORY ABI with the event signature requested
export const LAU_FACTORY_ABI: InterfaceAbi = [
     "function New(address) public returns (address)",
     "function New(address,string,string) public returns (address)"
];

export const MAP_ABI: InterfaceAbi = CONTRACT_CATALOG.find(c => c.name === "MAP")?.abi || [];

export const HECKE_ABI: InterfaceAbi = [
    "function Meridians(uint256) view returns (uint256)",
    "function Compliment(uint256) view returns (int256, int256)",
    "function GetMeridian(uint256) view returns (uint256)"
];

export const LAU_ABI: InterfaceAbi = [
  "function Username() public view returns (string memory)",
  "function Username(string memory newUsername) public",
  "function Chat(string memory chatline) public",
  "function CurrentArea() public view returns (address)",
  "function owner() view returns (address)",
  "function transfer(address to, uint256 value) public returns (bool)",
  "function Type() view returns (string)",
  "function Eta() view returns (address)",
  "function Saat(uint256) view returns (uint64)",
  "function Withdraw(address,uint256)",
  "function Leave()"
];

export const QING_FACTORY_ABI: InterfaceAbi = [
    "function New(address) public returns (address)",
    "function New(address,string,string) public returns (address)",
    "event New(address indexed qing, address indexed creator, string name, string symbol)"
];

export const ERC20_ABI: InterfaceAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function Type() view returns (string)"
];

export const YUE_ABI: InterfaceAbi = [
  "function Chan() view returns (address)",
  "function Origin() view returns (address)",
  "function Hong(address,address,uint256)",
  "function Hung(address,address,uint256)",
  "function GetAssetRate(address,address) view returns (uint256)",
  "function IsValidAsset(address,address) view returns (bool)",
  "function ChangeOrigin(address)",
  "function MintToOrigin()",
  "function React(address) returns (uint256)",
  "function Bar(address) view returns (uint256, uint256)",
  "function Type() view returns (string)",
  "function Hypobar(address) view returns (uint256)",
  "function Epibar(address) view returns (uint256)"
];

export const QING_ABI: InterfaceAbi = [
    "function Cho() view returns (address)",
    "function Asset() view returns (address)",
    "function Waat() view returns (uint256)",
    "function Entropy() view returns (uint64)",
    "function GWAT() view returns (bool)",
    "function BouncerDivisor() view returns (uint16)",
    "function CoverCharge() view returns (uint256)",
    "function Join(address)",
    "function Leave(address)", 
    "function Chat(address,string)", 
    "function Withdraw(address,uint256)",
    "function Admitted(address) view returns (bool)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function owner() view returns (address)",
    "function SetAdmittance(address,bool)",
    "function SetCoverCharge(uint256)",
    "event LogEvent(string Username, uint64 Soul, uint64 Aura, string LogLine)"
];


// DYSNOMIA SPECIFIC ABIS FOR DYNAMIC LOADING
export const DYSNOMIA_ABIS: Record<string, InterfaceAbi> = {
  "SHA": [
    "function Dynamo() view returns (uint64)",
    "function Fuse(uint64,uint64,uint64)",
    "function Avail(uint64)",
    "function Form(uint64)",
    "function Polarize()",
    "function Conjugate(uint64)",
    "function Conify(uint64)",
    "function Saturate(uint64,uint64,uint64)",
    "function Bond()",
    "function Adduct(uint64) returns (uint64)",
    "function React(uint64,uint64) returns (uint64,uint64)",
    "function View() view returns (tuple(uint64 Base, uint64 Secret, uint64 Signal, uint64 Channel, uint64 Contour, uint64 Pole, uint64 Identity, uint64 Foundation, uint64 Element, uint64 Coordinate, uint64 Charge, uint64 Chin, uint64 Monopole))"
  ],
  "SHIO": [
    "function Rod() view returns (address)",
    "function Cone() view returns (address)",
    "function Manifold() view returns (uint64)",
    "function Monopole() view returns (uint64)",
    "function Log(uint64,uint64,string)",
    "function Generate(uint64,uint64,uint64)",
    "function Isomerize()",
    "function Isolate()",
    "function Magnetize() returns (uint64)",
    "function React(uint64) returns (uint64,uint64)"
  ],
  "YI": [
    "function Psi() view returns (address)",
    "function Xi() view returns (uint64)",
    "function Ring() view returns (uint64)",
    "function Beta(string,string) returns (address)",
    "function Kappa(address,address) returns (address)",
    "function Bing(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Bang(address) view returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))"
  ],
  "ZHENG": [
    "function Eta() view returns (address)",
    "function GetRodByIdx(uint64)",
    "function Iodize(address)",
    "function InstallRod(uint64, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64), uint64) returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))",
    "function Mau(string,string,uint64,uint64,uint64) returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
  ],
  "ZHOU": [
    "function Upsilon() view returns (address)",
    "function Xi() view returns (uint64)",
    "function Monopole() view returns (uint64)",
    "function Alpha(string,string) returns (address)",
    "function React(uint64) returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
  ],
  "YAU": [
    "function Tau() view returns (address)",
    "function Monopole(uint256) view returns (uint64)",
    "function React() returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))",
    "function Theta() view returns (tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
  ],
  "YANG": [
    "function Mu() view returns (address)",
    "function Pole(uint256) view returns (uint64)",
    "function Rho() view returns (tuple(tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Bang, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Lai, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Le))"
  ],
  "SIU": [
    "function Psi() view returns (address)",
    "function Aura() view returns (uint64)",
    "function Miu(string,string) returns (uint64[3], tuple(address,address,uint64,uint64,address,uint64,uint64,uint64))"
  ],
  "VOID": VOID_ABI,
  "LAU": LAU_ABI,
  "CHO": CHO_ABI,
  "QING": QING_ABI,
  "MAP": MAP_ABI,
  "SEI": SEI_ABI,
  "CHEON": [
    "function Sei() view returns (address)",
    "function Su(address) returns (uint256,uint256,uint256)"
  ],
  "META": [
    "function Ring() view returns (address)",
    "function Beat(uint256) returns (uint256,uint256,uint256,uint256)"
  ],
  "CHAN": CHAN_ABI,
  "RING": [
    "function Pang() view returns (address)",
    "function Phobos() view returns (address)",
    "function Moments(uint64) view returns (uint256)",
    "function Eta() returns (uint256,uint256,uint256,uint256)"
  ],
  "QI": [
    "function Zuo() view returns (address)",
    "function Eris() view returns (address)",
    "function ReactSoul(uint64) returns (uint256)",
    "function ReactWaat(uint256) view returns (uint256)"
  ],
  "MAI": [
    "function Qi() view returns (address)",
    "function React(uint64,uint256) returns (uint256)"
  ],
  "XIA": [
    "function Mai() view returns (address)",
    "function Fomalhaute() view returns (address)",
    "function Charge(uint256) returns (uint256)"
  ],
  "XIE": [
    "function Xia() view returns (address)",
    "function Fornax() view returns (address)",
    "function Power(uint256) returns (uint256,uint256,uint256)"
  ],
  "ZI": [
    "function Choa() view returns (address)",
    "function Tethys() view returns (address)",
    "function Spin(uint256) returns (uint256,uint256,uint256,uint256)"
  ],
  "PANG": [
    "function Zi() view returns (address)",
    "function Push(uint256) returns (uint256,uint256,uint256,uint256,uint256)"
  ],
  "CHOA": [
    "function Sei() view returns (address)",
    "function Yuan(address) view returns (uint256)",
    "function Play(address)",
    "function Chat(address,string) returns (uint256)"
  ],
  "GWAT": [
    "function War() view returns (address)",
    "function GetMapGwat(int256,int256) view returns (address)",
    "function Gwat(address,uint256)"
  ],
  "WAR": [
    "function World() view returns (address)",
    "function Water() view returns (address)",
    "function CO2() view returns (uint256)",
    "function Faa(address,uint256) returns (uint256)"
  ],
  "YUE": YUE_ABI,
  "WORLD": [
    "function Cheon() view returns (address)",
    "function Meta() view returns (address)",
    "function Vitus() view returns (address)",
    "function Map() view returns (address)",
    "function Bun(int256,int256,address) view returns (uint256)",
    "function Tail(address,uint256) view returns (uint256)",
    "function Whitelist(address,address,bool)",
    "function Code(int256,int256,address)"
  ],
  "VITUS": [
    "function World() view returns (address)",
    "function Mint(address,uint256)"
  ],
  "H2O": [
    "function World() view returns (address)",
    "function Mint(address,uint256)"
  ]
};

// For backward compatibility with existing registry logic, we map CATALOG back to REGISTRY format
export const CONTRACT_REGISTRY: Record<string, Record<string, string>> = {};

// Initialize Registry
CONTRACT_CATALOG.forEach(doc => {
    if (!CONTRACT_REGISTRY[doc.category]) {
        CONTRACT_REGISTRY[doc.category] = {};
    }
    CONTRACT_REGISTRY[doc.category][doc.name] = doc.address;
});

// Add remaining legacy addresses not yet in Catalog
Object.entries(ADDRESSES).forEach(([key, addr]) => {
   // Check if addr is already in catalog
   const exists = CONTRACT_CATALOG.find(c => c.address === addr);
   if(!exists) {
       if(!CONTRACT_REGISTRY["MISC"]) CONTRACT_REGISTRY["MISC"] = {};
       CONTRACT_REGISTRY["MISC"][key] = addr;
   }
});
