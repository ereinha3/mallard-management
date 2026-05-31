/**
 * ETF Universe Builder
 *
 * Uses a comprehensive seed list of ~800 known ETF tickers.
 * Batch-fetches quote data from yahoo-finance2 (netAssets = AUM).
 *
 * Top 500: sorted by AUM descending — the biggest, most liquid ETFs.
 *
 * Diversified 500: NOT purely random. ETFs are bucketed into 13 category
 * groups, and the 500 slots are filled proportionally across those buckets
 * so every corner of the ETF universe is represented. Bucket assignment
 * uses Yahoo Finance's category field first, then falls back to keyword
 * matching on ticker/name so nothing gets lost.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/buildEtfUniverse.ts
 */

import YahooFinanceModule from "yahoo-finance2";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YahooFinance = YahooFinanceModule as any;

// ── Diversified sample buckets ────────────────────────────────────────────
// Each bucket has:
//   targetCount  — ideal slots out of 500
//   yahooKeywords — substrings to match against Yahoo's category field
//   nameKeywords  — fallback: substrings to match against ticker or name
//
// Buckets are non-overlapping; priority is top-to-bottom.

export interface SampleBucket {
  id: string;
  label: string;
  targetCount: number;
  yahooKeywords: string[];   // match against category field (case-insensitive)
  nameKeywords: string[];    // fallback match against ticker+name (case-insensitive)
}

export const SAMPLE_BUCKETS: SampleBucket[] = [
  {
    id: "us_equity_large",
    label: "U.S. Large-Cap Equity",
    targetCount: 60,
    yahooKeywords: ["large blend","large growth","large value","large-blend","large-growth","large-value","s&p 500"],
    nameKeywords: ["large cap","large-cap","s&p 500","nasdaq","total market","total stock"],
  },
  {
    id: "us_equity_small_mid",
    label: "U.S. Small/Mid-Cap Equity",
    targetCount: 40,
    yahooKeywords: ["small blend","small growth","small value","mid-cap","mid blend","mid growth","mid value","small-blend","small-growth","small-value"],
    nameKeywords: ["small cap","small-cap","mid cap","mid-cap","russell 2000","s&p 400","s&p 600"],
  },
  {
    id: "us_sector",
    label: "U.S. Sector & Industry",
    targetCount: 70,
    yahooKeywords: ["technology","health","financial","energy","industrials","consumer","utilities","materials","communication","real estate","biotechnology","semiconductor"],
    nameKeywords: ["tech","health","financial","energy","industrial","consumer","utilities","materials","biotech","semiconductor","pharma","defense","aerospace","bank","insurance","retail","media"],
  },
  {
    id: "intl_developed",
    label: "International Developed",
    targetCount: 45,
    yahooKeywords: ["foreign large","foreign small","europe","japan","pacific","world","international blend","developed market"],
    nameKeywords: ["europe","japan","pacific","international","developed","msci eafe","ftse developed","global ex"],
  },
  {
    id: "intl_emerging",
    label: "International Emerging",
    targetCount: 35,
    yahooKeywords: ["diversified emerging","china","india","brazil","emerging market","latin america"],
    nameKeywords: ["emerging","china","india","brazil","latin","korea","taiwan","asean","bric"],
  },
  {
    id: "bonds_core",
    label: "Core Bonds (IG / Govt / Muni)",
    targetCount: 60,
    yahooKeywords: ["intermediate government","short government","long government","intermediate core","short-term bond","ultrashort","inflation-protected","municipal","corporate bond","investment grade"],
    nameKeywords: ["treasury","government","aggregate","bond","municipal","muni","tips","inflation","investment grade","corporate","ig bond"],
  },
  {
    id: "bonds_hiy_intl",
    label: "High-Yield & International Bonds",
    targetCount: 30,
    yahooKeywords: ["high yield","emerging market bond","world bond","bank loan","convertible"],
    nameKeywords: ["high yield","junk","leveraged loan","bank loan","convertible","emerging bond","international bond","global bond"],
  },
  {
    id: "factor_smart_beta",
    label: "Factor / Smart Beta",
    targetCount: 45,
    yahooKeywords: ["dividend","equity income","value","momentum","quality","minimum volatility","multi-factor","equal weight"],
    nameKeywords: ["dividend","value","momentum","quality","factor","minimum vol","low vol","equal weight","fundamental","smart beta","dfa","dimensional"],
  },
  {
    id: "thematic",
    label: "Thematic & Innovation",
    targetCount: 45,
    yahooKeywords: ["miscellaneous","global real estate","trading","alternative"],
    nameKeywords: ["ark","cloud","cyber","ai","robot","autonomous","blockchain","crypto","cannabis","gaming","esports","metaverse","ev","electric","clean","solar","wind","space","genomic","innovation","disrupt","internet","fintech","drone","5g"],
  },
  {
    id: "leveraged_inverse",
    label: "Leveraged & Inverse",
    targetCount: 35,
    yahooKeywords: ["trading--leveraged","trading--inverse","bear","bull"],
    nameKeywords: ["2x","3x","ultra","ultrashort","short ","inverse","bear","bull","daily","direxion","proshares sqqq","proshares spxs"],
  },
  {
    id: "commodities",
    label: "Commodities & Real Assets",
    targetCount: 35,
    yahooKeywords: ["commodities","commodity","gold","silver","energy limited","natural resources","infrastructure","mlp"],
    nameKeywords: ["gold","silver","commodity","oil","gas","metals","mining","agriculture","corn","wheat","natural resource","infrastructure","mlp","pipeline"],
  },
  {
    id: "esg",
    label: "ESG / Sustainable",
    targetCount: 25,
    yahooKeywords: ["esg","sustainable","socially","environmental"],
    nameKeywords: ["esg","sustainable","socially","environmental","clean energy","green","impact","responsible","carbon","climate","krma","bibl","vegn"],
  },
  {
    id: "income_multiasset",
    label: "Income / Options Overlay / Multi-Asset",
    targetCount: 30,
    yahooKeywords: ["options","covered call","allocation","balanced","target","multi-asset","retirement"],
    nameKeywords: ["covered call","option","income","yield","allocation","balanced","multi-asset","target date","retirement","jepi","jepq","qyld","xyld"],
  },
];

// Anything not matched above goes into "other"
const BUCKET_OTHER_ID = "other";

// ── ETF seed list ─────────────────────────────────────────────────────────

const ETF_SEED: string[] = [
  // ── Broad U.S. Large-Cap ──────────────────────────────────────────────
  "SPY","IVV","VOO","VTI","QQQ","DIA","ITOT","SCHB","SCHX","RSP",
  "MGC","MGK","MGV","VV","VONE","IWB","IWF","IWD","ACWV","SPLV",
  "PHDG","BTAL","QQEW","PKW","MOAT","VIG","DGRO","SDY","NOBL","DGRW",
  "SCHG","SCHV","LRGF","QUAL","USMV","MTUM","VLUE","SIZE","EFAV","QUAL",
  "COWZ","QQQM","VOOG","VOOV","SPGP","SPYG","SPYV","IVW","IVE","RPG",
  "RPV","PWB","PWV","ELR","FNDX","FNDB","SPMO","IUSV","IUSG","IUSB",
  "BBUS","SPTM","ESGU","LGLV","OMFL","OMFS","JPUS","JPSV","GSLC","FTA",
  // ── U.S. Small/Mid-Cap ────────────────────────────────────────────────
  "IWM","MDY","IJH","IJR","VXF","SCHM","SCHA","VO","VB","VBR","VBK",
  "VOE","VOT","VTWO","IWR","IWS","IWP","IWO","IWN","VIOO","FSMD",
  "SLYG","SLYV","SLY","SMMD","SMCP","IJT","IJS","XSVM","XSHD","XSOE",
  "AVUV","AVLV","AVMV","DFSV","DFAS","DFAT","DFAS","DFLV","DFUL","DFUS",
  "IWC","ISCB","PRFZ","EES","EZM","FNK","FNY","FYC","FYT","SCHA",
  "RZG","RZV","RFG","RFV","RWJ","BBSC","CALF","VIOO","SMLF","SMHB",
  // ── U.S. Sector ───────────────────────────────────────────────────────
  "XLK","XLF","XLV","XLE","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
  "VGT","VHT","VFH","VDE","VIS","VCR","VDC","VPU","VAW","VNQ","VOX",
  "IYW","IYF","IYH","IYE","IYJ","IYC","IYK","IDU","IYM","IYR",
  "SOXX","SMH","FTEC","IBB","XBI","JETS","KRE","KBE","KBWB","XME",
  "GDX","GDXJ","SIL","ICLN","TAN","ACES","XHB","ITB","ITA","MOO",
  "HACK","CIBR","BUG","CLOU","SKYY","WCLD","IGV","FINX","IPAY",
  "GENY","HTEC","PBE","BBH","FBT","IAI","IAK","KIE","PFF","PGF",
  "REMX","LIT","COPX","PICK","RING","WOOD","PINE","CUT","TIMB",
  "FAN","QCLN","PBW","SMOG","GRID","RNRG","CNRG","CNRG","ACES",
  "XHB","REZ","HOMZ","ROOF","KBWY","SRVR","INDS","STOR",
  "FHLC","FNCL","FIDU","FENY","FMAT","FREL","FSEC","FSST","FSTA",
  "FTXG","FTXH","FTXL","FTXN","FTXO","FTXP","FTXR","FTXW",
  "RYT","RYF","RYH","RYE","RGI","RCD","RHS","RYU","RTM","FRI",
  "PKB","PBS","PBJ","PEJ","PFI","PRFZ","PXI","PXQ","PYZ","PZI",
  "FDN","PNQI","FDTX","FDNI","FDIS","FDFN","FDLO","FDMO","FDVL",
  "IDAT","IDRV","IPAY","IPPP","IROBO","ISMD","ISHG","ISIG","ISOK",
  "XITK","XLFN","XLFS","XMHQ","XSMO","XSVM","XSHD",
  "FIVG","NXTG","SNSR","AIQ","THNQ","ROBO","IRBO","BOTZ","ROBT",
  "SRVR","INDS","STOR","KBWY","REZ","NLR","URA","URNM","NUKZ",
  "SILJ","SGDM","SGDJ","GOAU","GDMN","RINF","IBTK",
  // ── International Developed ───────────────────────────────────────────
  "VEA","IEFA","EFA","SCHF","SPDW","IDEV","FDEV","URTH","ACWI","ACWX",
  "VGK","EWJ","EWG","EWU","EWC","EWA","EWQ","EWI","EWP","EWD","EWN",
  "EWL","EWO","EWK","EWS","EWT","EWM","EWH","EDEN","ENOR","EFNL",
  "HEWJ","HEWG","HEFA","DBJP","DBEF","DXJ","DNL","DWM","PXF",
  "IDLV","IHDG","IQLT","FNDF","VYMI","IDV","DVYA","FGD",
  "VT","VXUS","IXUS","IOO","EZU","AAXJ","LDEM",
  "FLGB","FLCH","FLJP","FLAU","FLJP","FLCA","FLDE","FLFR","FLKR",
  "DBJP","DBEF","DBIN","DBBR","DBES","DBUK",
  "EWZS","EWD","EWI","EWP","EWQ","EWO","EWK","EWN","EIRL","EFNL",
  "PGAL","NORW","GREK","EWY","EWC","EWH","EWS","EPHE","THD","TUR",
  "JPXN","DFJP","DFID","DFGF","DFAI","DFAE","DFIEX","DFIC","DFIE",
  "SCHD","FIDI","DVYE","IHDG","HEFA","HEDJ","HEZU","DBEU","DBEN",
  "BBEU","BBIN","BBCA","BBJP","BBAW","BBAX","BBRE","BBUS",
  // ── International Emerging ────────────────────────────────────────────
  "VWO","EEM","IEMG","SCHE","SPEM","EMQQ","EMXC","EEMV",
  "EWZ","EWW","EPI","INDA","INDY","PIN","FXI","MCHI","KWEB",
  "CQQQ","KGRN","TUR","VNM","THD","EPHE","ECH","EWX","EEMS",
  "XSOE","EMGF","VSGX","DEMZ","EMBD","GEM","FEMS","KESG",
  "ARGT","EWT","EWM","EIDO","EFGM","FM","HSCZ","MFEM","EMXC",
  "ADRE","DEM","DGS","DWX","EDIV","EELV","EMCG","EMQQ","EMSG",
  "FRDM","FLBR","FLIN","FLMX","FLCO","FLHK","FLKR","FLTW","FLZA",
  "KFYP","KGRN","KURE","CXSE","CBON","ASHR","ASHS","ASHX","CNXT",
  "CHIQ","CHIX","CHIC","BABA","KWEB","CQQQ","MCSI","INDA","INCO",
  "MINDX","INQQ","NDIA","IIND","SMIN","SCIF","NFTY","INDY",
  // ── U.S. Bonds — Core ────────────────────────────────────────────────
  "AGG","BND","BNDW","SCHZ","IUSB","SPAB","FBND","GBF",
  "IEF","TLT","SHY","SCHR","SCHI","SCHQ","SPTS","SPTI","SPTL","GOVT",
  "SHV","VGSH","VGIT","VGLT","VCIT","VCLT","VCSH","BSV","BIV","BLV",
  "VTIP","SCHP","STIP","LTPZ","RINF","IVOL",
  "LQD","IGSB","IGIB","IGLB","CORP","CLY","FLCO","BINC","BOND",
  "MUB","VTEB","TFI","CMF","NYF","HYD","HYMB","MEAR","SUB","IBMB",
  "IBDO","IBDP","IBDQ","IBDR","IBDS","IBDT","IBDU","IBDV","IBDW","IBDX",
  "IBTD","IBTE","IBTF","IBTG","IBTH","IBTI","IBTJ","IBTK","IBTS","IBTT",
  "BSCO","BSCP","BSCQ","BSCR","BSCS","BSCT","BSCU","BSCV","BSCW","BSCX",
  "SGOV","USFR","BIL","CLTL","TBLL","GBIL","BILS","CLIP","XHLF",
  "MINT","NEAR","GSY","ULST","ICSH","JPST","TFLO","FLRN","VNLA",
  "ILTB","TLTH","UTHY","XHLF","CLOA","CLOZ","AFIF","AFSM","AGGH",
  "STXT","STHY","SLQD","USIG","LKOR","VCSH","VCIT","VCLT","VMBS",
  "MBB","VMBS","SPMB","GNMA","CMBS","LMBS","MBSD","VMBS","JMBS",
  "FIGB","FISR","FIXD","FTSM","FUMB","FUTY","FWWW","FXDE",
  "TOTL","RIGS","FBND","FIBR","FISI","FITT","FITW","FIVA","FIVG",
  "FLOT","FLRN","TFLO","FLTR","SNSXX","PULS","CSHI","JAAA","CLOI",
  "HYXF","HYXU","IHYF","IGBH","IGEB","IIGV","IIGD","IIGG","IIGB",
  "PICB","ISHG","MINC","IGBH","ILTB","CWB","CBND",
  // ── High-Yield & International Bonds ──────────────────────────────────
  "HYG","JNK","USHY","FALN","ANGL","HYLB","HYLS","SJNK","SPHY","GHYB",
  "BNDX","IAGG","BWX","WIP","EMB","VWOB","PCY","LEMB","EBND","EMHY",
  "IGOV","PICB","ISHG","MINC","IGBH","ILTB","CWB","CBND","FLOT",
  "HYEM","HYXE","HYXF","SHYG","HYLB","THHY","ONLN","GHYB","HYDB",
  "BALI","BSJO","BSJP","BSJQ","BSJR","BSJS","BSJT","BSJU","BSJV","BSJW",
  "IBHB","IBHC","IBHD","IBHE","IBHF","IBHG","IBHH","IBHI","IBHJ",
  "SNLN","BKLN","SRLN","FTSL","SPFB","FLBL","BLHY",
  // ── Factor / Smart Beta ───────────────────────────────────────────────
  "MTUM","VLUE","QUAL","USMV","SIZE","EFAV","LRGF","SMLF","INTF",
  "DEFA","ACWF","ISCF","FNDB","FNDA","FNDE","FNDF",
  "VFMO","VFMF","VFMV","VFQY","VFVA","CALF","DEEP","IVAL","IMOM",
  "QMOM","VMOT","QVAL","QLVD","DFLV","DFUS","DFAC","DFAX","DFAI","DFAE",
  "DFSV","DFCF","DFIE","DFIC","DFIEX","DFJP","DFGF","DFAU","DFAT","DFAS",
  "AVUV","AVLV","AVMV","AVIG","AVGE","AVEM","AVIV","AVDE","AVDV","AVSC",
  "VYM","DVY","SDY","HDV","SPYD","SPHD","NOBL","DGRW","SDOG","FVD",
  "PFF","PGF","PFFD","PSK","FPE","PFLT","REGL","KBWD","IDV","DVYA",
  "EUDV","VYMI","IDVY","EFAD","FIDI","FDVV","RDVY","DIVO","SCHD",
  "COWZ","VALQ","FCVT","JVAL","JMOM","JQUA","JMIN","JHDV","JIRE",
  "OMFL","OMFS","OUSA","QDEF","QMOM","QVAL","DEEP","IVAL","IMOM",
  "XRLV","XMLV","XMHQ","XMMO","XSMO","XSVM","XSHD","XSLV","XSOE",
  "SMMV","SMMD","SMCP","SPLV","SPVM","SPVU","SPVW","SPGP","SPGM",
  "PDP","PXSG","PXSV","PXMG","PXMV","PXLG","PXLV","PRFZ","PRF",
  "ALPS","ALPHE","GLOF","GLOV","GLOM","GLOD","GLOE","GLOC","GLOB","GLOS",
  // ── Thematic ─────────────────────────────────────────────────────────
  "ARKK","ARKQ","ARKW","ARKG","ARKF","ARKX","CTEC","GNOM","EDOC","IZRL",
  "ESPO","HERO","NERD","GAMR","META","SOCL","EBIZ","BETZ","ODDS",
  "JETS","AWAY","BLOK","LEGR","KOIN","BITQ","BKCH","DAPP","IBLC",
  "BTCO","EZBC","DEFI","WGMI","BITO","BTF","XBTF","IBIT","FBTC","GBTC",
  "ETHE","BTCW","HODL","OBTC","BITB","CBTC","DEFI","BRRR","SATO","AETH",
  "MSOS","YOLO","MJ","POTX","CNBS","THCX","HMMJ","MMLP",
  "MOON","UFO","ROBO","IRBO","BOTZ","ROBT","THNQ","AIQ","AIEQ",
  "DRIV","CARZ","KARS","IDRV","KOMP","SNSR","QTUM","METV","FIVG","NXTG",
  "PRNT","NFLY","BITE","DIET","MTVR","ARTY","BUFF","LGLV",
  "BIBL","VETS","SHLD","KRMA","OWNS","VOTE",
  "MEDI","MEDX","IDNA","HAPI","BODY","IDLE","HIIQ","BALT","DALT","GALT",
  "PAVE","IFRA","TOLZ","NFRA","GII","IGF","INCO","GRID","RNRG","CNRG",
  "ICLN","TAN","FAN","QCLN","PBW","SMOG","ACES","CLMT","NRGU","NRGO",
  "SNSR","IQQQ","KOIN","BLCN","LEGR","COIN","BKCH","HODL","WGMI","DEFI",
  "CLDL","WCLD","CLOU","SKYY","BUG","HACK","CIBR","IHAK","CPSM","OGIG",
  "PHO","FIW","EBIZ","FINX","IPAY","KBWP","ARKF","WETF","LOUP",
  "DRIV","KARS","MOTO","CARZ","IDRV","HAIL","EKAR","CEFD","DRIV",
  "GDAT","DTEC","IROBO","IRBO","ROBO","BOTZ","ROBT","RBOT","THNQ","AIQ",
  "WCBR","EDOC","ARKG","GNOM","CTEC","ARGT","ARCE","ARCA","ARCW","ARCX",
  "LHBS","DIVB","DIVY","PDIV","MDIV","IYLD","PCEF","ALTY","ETV","ETW",
  // ── Leveraged & Inverse ───────────────────────────────────────────────
  "TQQQ","SQQQ","SPXL","SPXS","UPRO","SPXU","TECL","TECS","FNGU","FNGD",
  "UDOW","SDOW","DDM","DXD","QLD","QID","SSO","SDS","CURE","RXL","RXD",
  "ERX","ERY","LABU","LABD","NUGT","DUST","JNUG","JDST","BOIL","KOLD",
  "GUSH","DRIP","DFEN","TMF","TMV","TYD","TYO","UBT","TBT",
  "SOXL","SOXS","HIBL","HIBS","NAIL","DRN","DRV","UVXY","SVXY","VXX",
  "ROM","REW","USD","USD","UMDD","SMDD","MIDU","MIDZ","TNA","TZA",
  "URTY","SRTY","AGQ","ZSL","UCO","SCO","OILU","OILD","NRGU","NRGO",
  "YANG","YINN","CWEB","CHAU","CLDS","LRET","DPST","WTIU","WTID","WEAT",
  "DFEN","DFEB","DTYS","DTUL","DFVL","DFVS","DFSH","DFNL","DFNS",
  "BULZ","BERZ","GDXD","GDXU","SILX","SILJ","SLVO","UVXY","SVXY","VXX",
  // ── Commodities ───────────────────────────────────────────────────────
  "PDBC","DJP","COMT","GSG","USCI","COMB","CMDY","DBC","HAP","RJI",
  "GLD","IAU","GLDM","SGOL","BAR","OUNZ","PHYS","IAUF","BGLD","GLDM",
  "SLV","SIVR","PSLV","DBO","USO","OIH","XOP","DRIP","GUSH","NRGU",
  "UNG","BOIL","KOLD","CORN","SOYB","WEAT","NIB","JO","SGG","COW",
  "COPX","CPER","PALL","PPLT","LD","PALB","PLTM","SLVO","SIVR",
  "IGF","GII","IFRA","TOLZ","PAVE","NFRA","GII","INFR","GLIF","GLIO",
  "EMLP","AMJ","AMLP","MLPA","MLPB","MLPX","TPYP","ENFR","MLPR","ATMP",
  "BDRY","PICK","REMX","LIT","SLVR","SILJ","SGDM","SGDJ","GOAU","GDMN",
  "DBO","DBB","DBS","DBP","USOI","SVOL","PUTW","XRLV","CTA","PDBC",
  // ── ESG / Sustainable ────────────────────────────────────────────────
  "ESGU","ESGD","DSI","SUSA","CRBN","CLIM","ETHO","LOWC","VEGN",
  "BIBL","VETS","SHLD","KRMA","OWNS","NULV","NUAG","NUSC","NULG",
  "ESGV","ESGB","VOTE","EMPW","IQSU","IQSI","USXF","PABU","SMOG","ACES",
  "ESGE","ESGEM","ESGF","ESGN","ESGS","ESGT","ESGW","ESGX","ESGY","ESGZ",
  "NACP","NULC","NULE","NULG","NULH","NULM","NULN","NULR","NULV","NULW",
  "IQSM","IQSE","IQSW","IQSI","IQSU","IQSD","IQSG","IQSF","IQSA","IQSB",
  "CLMT","KGRN","GCLN","GRNB","KCCA","CBON","BGRN","HYXE","SUSC","SUSB",
  "IWFH","WOMN","SHE","EQUL","JUST","VBLT","RESP","RBND","REEM","RFEM",
  "SNPE","SPYX","SPDR","SUSA","SULB","SUSC","SUSL","SUSM","SUSP","SUSR",
  // ── Income / Options Overlay / Multi-Asset ────────────────────────────
  "JEPI","JEPQ","QYLD","XYLD","RYLD","DIVO","PBP","QQQX","BXMX",
  "ETV","ETW","ALTY","PCEF","DIVY","PDIV","MDIV","IYLD",
  "AOM","AOA","AOK","AOR","NTSX","RPAR","UPAR","GDE","SWAN","HTUS",
  "GBAL","GMOM","GMOM","GLOM","GLOV","GLOF","GLOD","GLOE","GLOC","GLOB",
  "PFLD","PFLA","PFFW","PFFN","PFFL","PFFR","PFFS","PFFT","PFFU","PFFV",
  "QQCC","QDCC","DJIA","BUFF","BALI","BALT","DALT","GALT","NALT","XALL",
  "OUSA","OMFL","OMFS","JPUS","JPSV","GSLC","ONOF","ONEO","ONEF","ONES",
  "HYKE","HYDB","HYMU","HYLB","HYLS","HYXE","HYXF","HYXU","HYMB","HYEM",
  // ── Currency ─────────────────────────────────────────────────────────
  "UUP","UDN","FXE","FXB","FXY","FXF","FXA","FXC","FXS","FXM","CEW","DBV",
  "CROC","CYB","CNY","JPYB","CNYB","ICN","ICI","USDU","JYEN","EURL",
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface EtfEntry {
  ticker: string;
  name: string;
  totalAssets: number | null;
  expenseRatio: number | null;
  category: string | null;           // Yahoo Finance category
  sampleBucket: string | null;       // our bucket id (null = top-AUM set)
  exchange: string | null;
  inTopAum: boolean;
}

export interface EtfUniverse {
  builtAt: string;
  totalCount: number;
  topAumCount: number;
  diversifiedSampleCount: number;
  bucketBreakdown: Record<string, number>;  // bucket id → count
  etfs: EtfEntry[];
}

// ── Bucket assignment ──────────────────────────────────────────────────────

function assignBucket(etf: EtfEntry): string {
  const cat = (etf.category ?? "").toLowerCase();
  const nameAndTicker = `${etf.ticker} ${etf.name}`.toLowerCase();

  for (const bucket of SAMPLE_BUCKETS) {
    if (bucket.yahooKeywords.some((kw) => cat.includes(kw))) return bucket.id;
  }
  // Fallback: name/ticker keyword matching
  for (const bucket of SAMPLE_BUCKETS) {
    if (bucket.nameKeywords.some((kw) => nameAndTicker.includes(kw))) return bucket.id;
  }
  return BUCKET_OTHER_ID;
}

// ── Diversified sampler ────────────────────────────────────────────────────

function buildDiversifiedSample(pool: EtfEntry[], targetTotal: number): EtfEntry[] {
  // Assign every candidate to a bucket
  const bucketMap = new Map<string, EtfEntry[]>();
  for (const etf of pool) {
    const bid = assignBucket(etf);
    if (!bucketMap.has(bid)) bucketMap.set(bid, []);
    bucketMap.get(bid)!.push(etf);
  }

  // Shuffle within each bucket for randomness
  for (const [id, etfs] of bucketMap) {
    bucketMap.set(id, shuffle(etfs));
  }

  // Log bucket sizes
  console.log("\n  Bucket pool sizes:");
  const sorted = [...bucketMap.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [id, etfs] of sorted) {
    const bucket = SAMPLE_BUCKETS.find((b) => b.id === id);
    const label = bucket?.label ?? "Other / Uncategorized";
    const target = bucket?.targetCount ?? 0;
    console.log(`    ${label.padEnd(38)} pool=${String(etfs.length).padStart(3)}  target=${target}`);
  }

  // First pass: fill each named bucket up to its target
  const selected: EtfEntry[] = [];
  let slotsUsed = 0;
  const overflow: EtfEntry[] = [];

  for (const bucket of SAMPLE_BUCKETS) {
    const candidates = bucketMap.get(bucket.id) ?? [];
    const take = Math.min(bucket.targetCount, candidates.length);
    const picked = candidates.slice(0, take).map((e) => ({ ...e, sampleBucket: bucket.id }));
    selected.push(...picked);
    slotsUsed += take;
    // Leftover candidates go to overflow pool
    overflow.push(...candidates.slice(take).map((e) => ({ ...e, sampleBucket: bucket.id })));
  }

  // Add "other" bucket to overflow
  const otherPool = (bucketMap.get(BUCKET_OTHER_ID) ?? []).map((e) => ({
    ...e,
    sampleBucket: BUCKET_OTHER_ID,
  }));
  overflow.push(...shuffle(otherPool));

  // Second pass: fill remaining slots from overflow (already shuffled)
  const remaining = targetTotal - slotsUsed;
  if (remaining > 0) {
    selected.push(...shuffle(overflow).slice(0, remaining));
  }

  return selected;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function batchQuote(yf: any, tickers: string[], batchSize = 50): Promise<EtfEntry[]> {
  const results: EtfEntry[] = [];
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    process.stdout.write(`  [${i + 1}-${Math.min(i + batchSize, tickers.length)}/${tickers.length}] `);
    try {
      const quotes: any[] = await yf.quote(batch, {}, { validateResult: false });
      const arr = Array.isArray(quotes) ? quotes : [quotes];
      let count = 0;
      for (const q of arr) {
        if (q.quoteType !== "ETF") continue;
        results.push({
          ticker: q.symbol ?? "",
          name: q.shortName ?? q.longName ?? "",
          totalAssets: q.netAssets ?? null,
          expenseRatio: q.netExpenseRatio ?? null,
          category: q.category ?? null,
          sampleBucket: null,
          exchange: q.exchange ?? null,
          inTopAum: false,
        });
        count++;
      }
      process.stdout.write(`ok (${count} ETFs)\n`);
    } catch (err: any) {
      process.stdout.write(`error: ${err.message}\n`);
    }
    await sleep(300);
  }
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function build() {
  console.log("Building ETF universe...\n");

  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  const allTickers = [...new Set(ETF_SEED.map((t) => t.toUpperCase()))];
  console.log(`Seed list: ${allTickers.length} unique tickers\n`);

  // ── Fetch all ────────────────────────────────────────────────────────
  console.log("Fetching quote data from Yahoo Finance...");
  const allEtfs = await batchQuote(yf, allTickers);
  console.log(`\nFetched ${allEtfs.length} confirmed ETFs\n`);

  // ── Top 500 by AUM ───────────────────────────────────────────────────
  allEtfs.sort((a, b) => (b.totalAssets ?? -1) - (a.totalAssets ?? -1));
  const topEtfs = allEtfs.slice(0, 500).map((e) => ({ ...e, inTopAum: true, sampleBucket: null }));
  const topTickers = new Set(topEtfs.map((e) => e.ticker));

  // ── Diversified 500 from remaining ───────────────────────────────────
  console.log("Building diversified sample...");
  const candidatePool = allEtfs.filter((e) => !topTickers.has(e.ticker));
  const diversifiedEtfs = buildDiversifiedSample(candidatePool, 500).map((e) => ({
    ...e,
    inTopAum: false,
  }));

  // ── Bucket breakdown for metadata ────────────────────────────────────
  const bucketBreakdown: Record<string, number> = {};
  for (const e of diversifiedEtfs) {
    const bid = e.sampleBucket ?? BUCKET_OTHER_ID;
    bucketBreakdown[bid] = (bucketBreakdown[bid] ?? 0) + 1;
  }

  const combined = [...topEtfs, ...diversifiedEtfs];

  const universe: EtfUniverse = {
    builtAt: new Date().toISOString(),
    totalCount: combined.length,
    topAumCount: topEtfs.length,
    diversifiedSampleCount: diversifiedEtfs.length,
    bucketBreakdown,
    etfs: combined,
  };

  const outPath = path.join(__dirname, "..", "data", "etf-universe.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(universe, null, 2));

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done!  Wrote ${combined.length} ETFs to data/etf-universe.json`);
  console.log(`  Top 500 by AUM:        ${topEtfs.length}`);
  console.log(`  Diversified sample:    ${diversifiedEtfs.length}`);
  console.log(`  Built at:              ${universe.builtAt}`);

  console.log(`\nTop 10 by AUM:`);
  topEtfs.slice(0, 10).forEach((e, i) => {
    const aum = e.totalAssets ? `$${(e.totalAssets / 1e9).toFixed(1)}B` : "n/a";
    console.log(`  ${i + 1}. ${e.ticker.padEnd(8)} ${aum.padStart(10)}  ${e.name}`);
  });

  console.log(`\nDiversified sample — actual counts per bucket:`);
  for (const bucket of SAMPLE_BUCKETS) {
    const actual = bucketBreakdown[bucket.id] ?? 0;
    const bar = "█".repeat(Math.round(actual / 2));
    console.log(`  ${bucket.label.padEnd(38)} ${String(actual).padStart(3)} / ${bucket.targetCount}  ${bar}`);
  }
  const otherCount = bucketBreakdown[BUCKET_OTHER_ID] ?? 0;
  if (otherCount > 0) console.log(`  ${"Other / Uncategorized".padEnd(38)} ${String(otherCount).padStart(3)}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
