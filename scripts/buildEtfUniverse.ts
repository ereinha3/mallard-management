/**
 * ETF Universe Builder
 *
 * Uses a comprehensive seed list of ~1400 known ETF tickers.
 * Batch-fetches quote data from yahoo-finance2 (which includes AUM via netAssets).
 * Sorts by AUM → top 500 = "topAum", randomly samples 500 more from the rest.
 * Caches combined list to data/etf-universe.json.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/buildEtfUniverse.ts
 */

import YahooFinanceModule from "yahoo-finance2";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// yahoo-finance2 v3: default export is the class constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YahooFinance = YahooFinanceModule as any;

// ── ETF seed list ─────────────────────────────────────────────────────────
// ~1400 tickers covering broad market, sectors, bonds, international,
// factor/smart-beta, thematic, leveraged/inverse, commodity ETFs.

const ETF_SEED: string[] = [
  // ── Broad U.S. Equity ──────────────────────────────────────────────────
  "SPY","IVV","VOO","VTI","QQQ","IWM","DIA","MDY","IJH","IJR",
  "VUG","VTV","VXF","ITOT","SCHB","SCHX","SCHG","SCHV","SCHA","SCHM",
  "IWB","IWF","IWD","IWR","IWS","IWP","IWO","IWN","MTUM","VLUE",
  "QUAL","USMV","SIZE","EFAV","MOAT","VIG","DGRO","SDY","HDV","DVY",
  "NOBL","DGRW","VYM","SPYD","SPHD","FVD","SDOG","DGRS","LRGF","SMHB",
  "RSP","QQEW","PKW","ACWV","SPLV","BTAL","PHDG","VONE","VTWO","VTHREE",
  "FNILX","FZROX","MGC","MGK","MGV","VBR","VBK","VOE","VOT","VB",
  "VO","VV","ESGU","ESGE","ESGD","DSI","SUSA","ETHO","CRBN","CLIM",
  // ── Sector ETFs ────────────────────────────────────────────────────────
  "XLK","XLF","XLV","XLE","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
  "VGT","VHT","VFH","VDE","VIS","VCR","VDC","VPU","VAW","VNQ","VOX",
  "IYW","IYF","IYH","IYE","IYJ","IYC","IYK","IDU","IYM","IYR","IYZ",
  "SOXX","SMH","FTEC","CIBR","HACK","BUG","CLOU","SKYY","WCLD","IGV",
  "ARKK","ARKQ","ARKW","ARKG","ARKF","ARKX","CTEC","GNOM","EDOC","IZRL",
  "SOXL","TECL","FNGU","TQQQ","SQQQ","SPXL","SPXS","UVXY","SVXY","VXX",
  "GDX","GDXJ","SIL","SILJ","RING","PICK","XME","REMX","LIT","COPX",
  "IBB","XBI","LABU","LABD","PBE","BBH","FBT","ARKG","GENY","HTEC",
  "JETS","IAI","IYG","KBE","KIE","KRE","KBWB","IAK","PGF","PFF",
  "ITA","XAR","CDEF","MOO","SOIL","CROP","WOOD","PINE","CUT","TIMB",
  "ICLN","TAN","FAN","ACES","QCLN","PBW","SMOG","GRID","RNRG","CNRG",
  "ESPO","HERO","GAMR","NERD","META","SOCL","EBIZ","FDWM","BETZ","ODDS",
  "XHB","ITB","REZ","HOMZ","ROOF","KBWY","SRVR","INDS","STOR","FFR",
  // ── International Developed ────────────────────────────────────────────
  "VEA","IEFA","EFA","SCHF","SPDW","IDEV","FDEV","URTH","ACWI","ACWX",
  "VGK","EWJ","EWG","EWU","EWC","EWA","EWQ","EWI","EWP","EWD","EWN",
  "EWL","EWO","EWK","EWS","EWT","EWY","EWM","EWH","EDEN","ENOR","EFNL",
  "HEWJ","HEWG","HEFA","FLOT","DBJP","DBEF","DXJ","DNL","DWM","PXF",
  "IDLV","IHDG","IQLT","FNDF","FNDX","FNDE","VYMI","IDV","DVYA","FGD",
  // ── International Emerging ─────────────────────────────────────────────
  "VWO","EEM","IEMG","SCHE","SPEM","GEM","FEMS","EMQQ","EMXC","EEMV",
  "EWZ","EWW","EWY","EWC","EPI","INDA","INDY","PIN","FXI","MCHI","KWEB",
  "CQQQ","KGRN","TUR","RSX","VNM","THD","EPHE","ECH","EWX","EEMS",
  "XSOE","EMGF","TLTE","HSCZ","KESG","ESGEM","ESGE","VSGX","DEMZ","EMBD",
  // ── U.S. Bonds ─────────────────────────────────────────────────────────
  "AGG","BND","BNDW","SCHZ","IUSB","SPAB","BKAG","CBON","FBND","GBF",
  "IEF","TLT","SHY","SCHR","SCHI","SCHQ","SPTS","SPTI","SPTL","GOVT",
  "SHV","VGSH","VGIT","VGLT","VCIT","VCLT","VCSH","BSV","BIV","BLV",
  "TIPS","VTIP","SCHP","STIP","LTPZ","TDTF","PBTP","RINF","IVOL","LTPZ",
  "LQD","IGLB","VCLT","FLOT","ULST","NEAR","MINT","CLTL","ICSH","GSY",
  "HYG","JNK","USHY","FALN","ANGL","HYLB","HYLS","SJNK","SPHY","GHYB",
  "MUB","VTEB","TFI","CMF","NYF","HYD","HYMB","MEAR","SUB","IBMB",
  "IBDU","IBDV","IBDW","IBDX","IGSB","IGIB","IGLB","FLCO","BINC","BOND",
  "PIMIX","PONDX","PDBC","PFFD","PGHY","PGX","PHB","PIE","PIM","PJP",
  "CORP","CLY","CWB","CBND","CBS","BNDX","IAGG","BWX","WIP","EMB",
  // ── International Bonds ────────────────────────────────────────────────
  "BNDX","IAGG","BWX","WIP","EMB","VWOB","PCY","LEMB","EBND","EMHY",
  "IGOV","PICB","ISHG","MINC","PFUIX","PFUDX","IGBH","ILTB","CIMB","HYIN",
  // ── REITs ──────────────────────────────────────────────────────────────
  "VNQ","SCHH","USRT","ICF","IYR","RWR","BBRE","FREL","DFGR","REET",
  "REZ","FFR","REM","MORT","KBWY","SRVR","INDS","STOR","ROOF","HOMZ",
  // ── Commodities ────────────────────────────────────────────────────────
  "PDBC","DJP","COMT","GSG","USCI","COMB","CMDY","DBC","HAP","RJI",
  "GLD","IAU","GLDM","SGOL","BAR","RING","GDX","GDXJ","OUNZ","PHYS",
  "SLV","SIVR","PSLV","ETFS","DBO","USO","OIH","XOP","DRIP","GUSH",
  "UNG","BOIL","KOLD","CORN","SOYB","WEAT","NIB","JO","SGG","COW",
  "COPX","CPER","JJCTF","JJC","JJN","JJT","JJU","LD","PALL","PPLT",
  // ── Cash & Short-Term ──────────────────────────────────────────────────
  "SGOV","USFR","BIL","SHV","CLTL","TBLL","GBIL","BILS","CLIP","XHLF",
  "MINT","NEAR","GSY","ULST","ICSH","JPST","FLOT","TFLO","FLRN","VNLA",
  // ── Multi-Asset / Allocation ───────────────────────────────────────────
  "AOM","AOA","AOK","AOR","VSMX","VSMGX","VSCGX","VASGX","VPGDX","FFR",
  "NTSX","PSLDX","RPAR","UPAR","GDE","SWAN","HTUS","BTAL","VBAIX","VBINX",
  // ── Dividend & Income ──────────────────────────────────────────────────
  "VYM","DGRO","DVY","SDY","HDV","SPYD","SPHD","NOBL","DGRW","VIG",
  "PFF","PGF","PFFD","PSK","FPE","PFLT","REGL","SDOG","FVD","KBWD",
  // ── Factor / Smart Beta ────────────────────────────────────────────────
  "MTUM","VLUE","QUAL","USMV","SIZE","EFAV","LRGF","SMLF","INTL","INTF",
  "DEFA","ACWF","DEEF","DEMF","ISCF","FNDB","FNDA","FNDX","FNDE","FNDF",
  "VFMO","VFMF","VFMV","VFQY","VFVA","VFWM","CALF","DEEP","IVAL","IMOM",
  "QMOM","VMOT","QVAL","QLVD","QVML","QVMS","QVMM","QVMN","DFLV","DFUS",
  "DFAC","DFAX","DFAI","DFAE","DFSV","DFLV","DFCF","DFIEX","DFIE","DFIC",
  // ── Leveraged & Inverse ────────────────────────────────────────────────
  "TQQQ","SQQQ","SPXL","SPXS","UPRO","SPXU","TECL","TECS","FNGU","FNGD",
  "UDOW","SDOW","DDM","DXD","QLD","QID","SSO","SDS","CURE","RXL","RXD",
  "ERX","ERY","LABU","LABD","NUGT","DUST","JNUG","JDST","BOIL","KOLD",
  "GUSH","DRIP","DFEN","FLYD","TMF","TMV","TYD","TYO","UBT","TBT",
  "SOXL","SOXS","USD","HIBL","HIBS","OILU","OILD","NAIL","DRN","DRV",
  // ── Thematic ──────────────────────────────────────────────────────────
  "ESPO","HERO","NERD","GAMR","CLOU","SKYY","WCLD","BUG","HACK","CIBR",
  "ARKK","ARKQ","ARKW","ARKG","ARKF","ARKX","CTEC","GNOM","EDOC","IZRL",
  "JETS","AWAY","BETZ","ODDS","META","SOCL","EBIZ","IPAY","FINX","BLOK",
  "LEGR","KOIN","BITQ","BKCH","DAPP","IBLC","BTCO","EZBC","DEFI","WGMI",
  "MSOS","YOLO","MJ","POTX","CNBS","THCX","HMMJ","MMLP","KURE","CXSE",
  "MOON","UFO","ARKZ","ROBO","IRBO","BOTZ","ROBT","THNQ","AIQ","AIEQ",
  "DRIV","CARZ","KARS","IDRV","EKAR","HAIL","BLCN","KOMP","GFOF","SNSR",
  "QTUM","ARTY","METV","VR","MTVR","PRNT","NFLY","BITE","DIET","LGLV",
  "FIVG","NXTG","MFGM","BUFF","SATO","BITS","AETH","BRRR","FBTC","IBIT",
  "GBTC","ETHE","BTCW","BTCZ","HODL","BITO","BTF","XBTF","BTFD","OBTC",
  // ── Currency ──────────────────────────────────────────────────────────
  "UUP","UDN","FXE","FXB","FXY","FXF","FXA","FXC","FXS","FXM","CEW",
  "DBV","ICI","ICN","CROC","CYB","CNY","JPYB","MEAR","BNCR","CNYB",
  // ── Infrastructure / Real Assets ──────────────────────────────────────
  "IGF","GII","IFRA","TOLZ","PAVE","NFRA","EMLP","AMJ","AMLP","MLPA",
  "MLPB","MLPX","AMZA","MLP","ZMLP","TPYP","ENFR","MLPR","ATMP","FIF",
  // ── ESG / Sustainable ─────────────────────────────────────────────────
  "ESGU","ESGE","ESGD","DSI","SUSA","CRBN","CLIM","ETHO","LOWC","VEGN",
  "BIBL","VETS","SHLD","PALC","KRMA","OWNS","NULV","NUAG","NUSC","NULG",
  "ESGV","ESGB","VOTE","EMPW","IQSU","IQSI","USXF","PABU","SMOG","ACES",
  // ── Income / Options Overlay ───────────────────────────────────────────
  "JEPI","JEPQ","QYLD","XYLD","RYLD","DIVO","PBP","QQCC","QQQX","BXMX",
  "ETV","ETW","ALTY","PCEF","DIVY","PDIV","MDIV","IYLD","SPHY","LHBS",
  // ── Fixed Maturity (iBonds style) ─────────────────────────────────────
  "IBDO","IBDP","IBDQ","IBDR","IBDS","IBDT","IBDU","IBDV","IBDW","IBDX",
  "IBTD","IBTE","IBTF","IBTG","IBTH","IBTI","IBTJ","IBTK","IBTS","IBTT",
  "BSCO","BSCP","BSCQ","BSCR","BSCS","BSCT","BSCU","BSCV","BSCW","BSCX",
  // ── Global/World ──────────────────────────────────────────────────────
  "ACWI","ACWX","VT","VXUS","IXUS","SPDW","SPEM","GEM","FDEV","FEMS",
  "URTH","IOO","EZU","MCHI","AAXJ","AXJL","LDEM","RIGS","FIXD","TOTL",
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface EtfEntry {
  ticker: string;
  name: string;
  totalAssets: number | null;   // AUM in USD
  expenseRatio: number | null;  // e.g. 0.03 = 0.03%
  category: string | null;
  exchange: string | null;
  inTopAum: boolean;
}

export interface EtfUniverse {
  builtAt: string;
  totalCount: number;
  topAumCount: number;
  randomSampleCount: number;
  etfs: EtfEntry[];
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

async function batchQuote(
  yf: any,
  tickers: string[],
  batchSize = 50
): Promise<EtfEntry[]> {
  const results: EtfEntry[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    process.stdout.write(`  [${i + 1}-${Math.min(i + batchSize, tickers.length)}/${tickers.length}] `);
    try {
      const quotes: any[] = await yf.quote(batch, {}, { validateResult: false });
      const arr = Array.isArray(quotes) ? quotes : [quotes];
      for (const q of arr) {
        if (q.quoteType !== "ETF") continue;
        results.push({
          ticker: q.symbol ?? "",
          name: q.shortName ?? q.longName ?? "",
          totalAssets: q.netAssets ?? null,
          expenseRatio: q.netExpenseRatio ?? null,
          category: q.category ?? null,
          exchange: q.exchange ?? null,
          inTopAum: false,
        });
      }
      process.stdout.write(`ok (${arr.filter((q: any) => q.quoteType === "ETF").length} ETFs)\n`);
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

  // Deduplicate seed list
  const allTickers = [...new Set(ETF_SEED.map((t) => t.toUpperCase()))];
  console.log(`Seed list: ${allTickers.length} unique tickers\n`);

  // Batch fetch all
  console.log("Fetching quote data...");
  const allEtfs = await batchQuote(yf, allTickers);
  console.log(`\nFetched data for ${allEtfs.length} confirmed ETFs\n`);

  // Sort by AUM descending
  allEtfs.sort((a, b) => {
    const aa = a.totalAssets ?? -1;
    const bb = b.totalAssets ?? -1;
    return bb - aa;
  });

  // Top 500 by AUM
  const topEtfs = allEtfs.slice(0, 500).map((e) => ({ ...e, inTopAum: true }));
  const topTickers = new Set(topEtfs.map((e) => e.ticker));

  // Remaining pool → shuffle → take up to 500
  const remaining = allEtfs.slice(500).filter((e) => !topTickers.has(e.ticker));
  const randomEtfs = shuffle(remaining).slice(0, 500).map((e) => ({ ...e, inTopAum: false }));

  const combined = [...topEtfs, ...randomEtfs];

  const universe: EtfUniverse = {
    builtAt: new Date().toISOString(),
    totalCount: combined.length,
    topAumCount: topEtfs.length,
    randomSampleCount: randomEtfs.length,
    etfs: combined,
  };

  const outPath = path.join(__dirname, "..", "data", "etf-universe.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(universe, null, 2));

  console.log(`Done! Wrote ${combined.length} ETFs to data/etf-universe.json`);
  console.log(`  Top AUM:       ${topEtfs.length}`);
  console.log(`  Random sample: ${randomEtfs.length}`);
  console.log(`  Built at:      ${universe.builtAt}`);
  console.log(`\nTop 10 by AUM:`);
  topEtfs.slice(0, 10).forEach((e, i) => {
    const aum = e.totalAssets ? `$${(e.totalAssets / 1e9).toFixed(1)}B` : "n/a";
    console.log(`  ${i + 1}. ${e.ticker.padEnd(8)} ${aum.padStart(10)}  ${e.name}`);
  });
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
