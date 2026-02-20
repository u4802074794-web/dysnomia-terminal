
import { InterfaceAbi } from "ethers";

// Default PulseChain RPC
export const DEFAULT_RPC_URL = "https://rpc.pulsechain.com";

export const GEMINI_MODELS = [
    'gemini-2.5-flash-preview-09-2025',
    'gemini-flash-latest',
    'gemini-3-pro-preview',
    'gemini-flash-lite-latest',
    'gemma-3-4b-it'
];

export const DYSNOMIA_ERRORS = [
    "error DysnomiaInsufficientBalance(address origin, address sender, address from, address to, address what, uint256 balance, uint256 needed)",
    "error DysnomiaInsufficientAllowance(address origin, address sender, address owner, address spender, address what, uint256 allowance, uint256 needed)",
    "error MarketRateNotFound(address asset)",
    "error ExchangeRateNotFound(address SpendAsset, address ReceiveAsset)",
    "error OwnableInvalidOwner(address origin, address owner, address what)",
    "error OwnableUnauthorizedAccount(address origin, address account, address what)",
    "error InvalidUserToken(address Asset)",
    "error InvalidOwnership(address UserToken, address User)",
    "error NoUserEntry(address User)",
    "error NoUserName(address User)",
    "error UserAlreadyCreated(address User)",
    "error NotShioOwner(address Shio, address Requestor)",
    "error InvalidLogXi(string Xi)",
    "error ReactionZeroError(uint64 Eta, uint64 Kappa)",
    "error ReactionInequalityError(uint64 Eta, uint64 Kappa)",
    "error SigmaAlreadyInstalled(address Phi)",
    "error MarketRateCanOnlyBeIncreased(address Contract, uint256 CurrentRate)",
    "error TokenMaximumRate(address Contract, uint256 MaximumRate)",
    "error BouncerUnauthorized(address origin, address account, address what)",
    "error AlreadyJoined(address UserToken)",
    "error CoverChargeUnauthorized(address AssetAddress, uint256 Amount)",
    "error PayCover(address Asset, uint256 CoverCharge)",
    "error Forbidden(address Asset)",
    "error NotAdmitted(uint64 Soul)",
    "error AlreadyAdded(address Origin, address Yue, address New)",
    "error NotOrigin(address YueOrigin, address Requestor)",
    "error PlayerMustOptIn(address Player, address Yue, address Contract)",
    "error NotStarted(address)"
];

export const ADDRESSES: Record<string, string> = {
  VOID: "0x965b0d74591bf30327075a247c47dbf487dcff08", 
  SIU: "0x43136735603d4060f226c279613a4dd97146937c",
  YANG: "0xb702b3ec6d9de1011be963efe30a28b6ddfbe011",
  YAU: "0x7e91d862a346659daeed93726e733c8c1347a225",
  ZHOU: "0x5cc318d0c01fed5942b5ed2f53db07727d36e261",
  ZHENG: "0x24e62c39e34d7fe2b7df1162e1344eb6eb3b3e15",
  YI: "0x4757438723055f14a1af5c9651c2e37730f41a9e",
  LAU_FACTORY: "0xbA6CcD38992839aEE20D5bF9125b1d94190b091C",
  SHA_FACTORY: "0x4208333D65A90577E3da39B84D6A95eb9db717D2",
  SHIO_FACTORY: "0x5063D2A97960DDE8dc5E3e5A69aAa379C6301F1C",
  CHO: "0xB6be11F0A788014C1F68C92F8D6CcC1AbF78F2aB",
  MAP: "0xD3a7A95012Edd46Ea115c693B74c5e524b3DdA75",
  WAR: "0x965b0d74591bf30327075a247c47dbf487dcff08", 
  CHAN: "0xe250bf9729076B14A8399794B61C72d0F4AeFcd8",
  CHOA: "0x0f5a352fd4cA4850c2099C15B3600ff085B66197",
  RING: "0x1574c84Ec7fA78fC6C749e1d242dbde163675e72",
  SEI: "0x3dC54d46e030C42979f33C9992348a990acb6067",
  CHEON: "0x3d23084cA3F40465553797b5138CFC456E61FB5D",
  META: "0xE77Bdae31b2219e032178d88504Cc0170a5b9B97",
  QI: "0x4d9Ce396BE95dbc5F71808c38107eB7422FD9a03",
  MAI: "0xc48B0a4E79eF302c8Eb5be71F562d08fB8E6A3d8",
  XIA: "0x7f4a4DD4a6f233d2D82BE38b2F9fc0Fef46f25FA",
  XIE: "0x4Df51741F2926525A21bF63E4769bA70633D2792",
  ZI: "0xCbAdd3C3957Bd9D6C036863CB053FEccf3D53338",
  PANG: "0xEe25Ccd41671F3B67d660cf6532085586aec8457",
  HECKE: "0x29A924D9B0233026B9844f2aFeB202F1791D7593",
  LIB_ATTRIBUTE: "0x529e3e15da19c7c828f9cce13c53f7031a30ec7c",
  LIB_STRINGS: "0x4ab87f1DBDF6f741ED8BF481C7346103a86f1068",
  LIB_REACTIONS: "0x8704d7740735F6DEA0103366fE297Ba3F9fCaCc4",
  WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  ATROPA: "0x7a20189B297343CF26d8548764b04891f37F3414", 
  AFFECTION: "0x24F0154C1dCe548AdF15da2098Fdd8B8A3B8151D",
  GWAT: "0x595d2432a550A4a475355609B4985226D1426466"
};

// FULL ABI REGISTRY
export const DYSNOMIA_ABIS: Record<string, any[]> = {
  VOID: ["function Enter() returns (uint64[3] Saat, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On)", "function Log(string LogLine)", "function Chat(string chatline)"],
  LAU: ["function Chat(string chatline)", "function Username() view returns (string)", "function CurrentArea() view returns (address)", "function Saat(uint256) view returns (uint64)", "function owner() view returns (address)", "function Type() view returns (string)"],
  CHO: [
    "function Enter(address UserToken) returns (tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) User)",
    "function GetUser() returns (tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) Alpha)",
    "function GetUserSoul() view returns (uint64)",
    "function GetUserTokenAddress(address wallet) view returns (address UserToken)",
    "function GetAddressBySoul(uint64 soul) view returns (address UserAddress)"
  ],
  QING: [
    "function Join(address UserToken)",
    "function Chat(address UserToken, string MSG)",
    "function Admitted(address UserToken) view returns (bool)",
    "function CoverCharge() view returns (uint256)",
    "function Asset() view returns (address)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function AddMarketRate(address Contract, uint256 Rate)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function bouncer(address cBouncer) view returns (bool)",
    "function owner() view returns (address)",
    "function owner(address cOwner) view returns (bool)",
    "function setCoverCharge(uint256 _c)"
  ],
  YUE: [
    "function Bar(address Qing) view returns (uint256 Hypogram, uint256 Epigram)",
    "function Withdraw(address what, address To, uint256 amount)",
    "function Origin() view returns (address)"
  ],
  MAP: ["function New(address Integrative) returns (address Mu)", "event NewQing(address Qing, address Integrative, uint256 Waat)"],
  HECKE: ["function Compliment(uint256 Waat) view returns (int256 Longitude, int256 Latitude)"],
  SEI: ["function Start(address LauToken, string Name, string Symbol) public returns (address Yue, address UserToken)"],
  CHAN: [
      "function Yan(address Origin) view returns (address Yue)",
      "function OptIn(address Contract, bool Allow)",
      "function YueWithdraw(address Yue, address Asset, address To, uint256 Amount)"
  ],
  CHEON: ["function Su(address Qing) returns (uint256 Charge, uint256 Hypobar, uint256 Epibar)"],
  GWAT: ["function Gwat(address Qing, uint256 Lin) returns (address Mu)"],
  LAUFactory: ["function New(string name, string symbol) returns (address Mu)"]
};

// Export individual ABIs
export const VOID_ABI = DYSNOMIA_ABIS.VOID;
export const LAU_ABI = DYSNOMIA_ABIS.LAU;
export const CHO_ABI = DYSNOMIA_ABIS.CHO;
export const QING_ABI = DYSNOMIA_ABIS.QING;
export const YUE_ABI = DYSNOMIA_ABIS.YUE;
export const MAP_ABI = DYSNOMIA_ABIS.MAP;
export const HECKE_ABI = DYSNOMIA_ABIS.HECKE;
export const SEI_ABI = DYSNOMIA_ABIS.SEI;
export const CHAN_ABI = DYSNOMIA_ABIS.CHAN;
export const CHEON_ABI = DYSNOMIA_ABIS.CHEON;
export const GWAT_ABI = DYSNOMIA_ABIS.GWAT;
export const LAU_FACTORY_ABI = DYSNOMIA_ABIS.LAUFactory;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export interface ContractDoc {
    name: string;
    address: string;
    category: string;
    description: string;
    functionDocs?: Record<string, string>;
    isDynamic?: boolean;
}

export const CONTRACT_CATALOG: ContractDoc[] = [
    { name: "VOID", address: ADDRESSES.VOID, category: "CORE", description: "Root session manager." },
    { name: "CHO", address: ADDRESSES.CHO, category: "DAN", description: "Identity Registry." },
    { name: "MAP", address: ADDRESSES.MAP, category: "DAN", description: "Cartography System." },
    { name: "CHAN", address: ADDRESSES.CHAN, category: "SKY", description: "Channel & Vault Manager." },
    { name: "SEI", address: ADDRESSES.SEI, category: "TANG", description: "Onboarding & Vault Creation." },
    { name: "CHEON", address: ADDRESSES.CHEON, category: "TANG", description: "Reward Distributor." },
    { name: "LAU", address: "", category: "TEMPLATE", isDynamic: true, description: "User Identity Token." },
    { name: "QING", address: "", category: "TEMPLATE", isDynamic: true, description: "Sector/Venue Contract." },
    { name: "YUE", address: "", category: "TEMPLATE", isDynamic: true, description: "Player Vault." }
];

export const POWER_TOKENS = {
    ERIS: "0x4d9Ce396BE95dbc5F71808c38107eB7422FD9a03",
    FOMALHAUTE: "0x7f4a4DD4a6f233d2D82BE38b2F9fc0Fef46f25FA",
    FORNAX: "0x4Df51741F2926525A21bF63E4769bA70633D2792",
    TETHYS: "0xCbAdd3C3957Bd9D6C036863CB053FEccf3D53338"
};
