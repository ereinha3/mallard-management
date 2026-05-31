/**
 * GET /api/universe/etfs
 *
 * Returns the cached ETF universe. Supports query params for filtering.
 *
 * Query params:
 *   ?set=top        — only top 500 by AUM
 *   ?set=random     — only random sample
 *   ?set=all        — all ETFs (default)
 *   ?category=bond  — filter by category substring (case-insensitive)
 *   ?ticker=VTI     — lookup single ETF
 *   ?meta=true      — return only metadata (counts + builtAt), no ETF list
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { setCORSHeaders } from "../../../lib/api/cors";
import {
  getEtfUniverse,
  getTopAumEtfs,
  getRandomSampleEtfs,
  getAllEtfs,
  getEtfByTicker,
  getEtfsByCategory,
  getUniverseMeta,
} from "../../../lib/universe/etfUniverse";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { set, category, ticker, meta } = req.query as Record<string, string>;

    // Metadata only
    if (meta === "true") {
      return res.status(200).json(getUniverseMeta());
    }

    // Single ticker lookup
    if (ticker) {
      const etf = getEtfByTicker(ticker);
      if (!etf) return res.status(404).json({ error: `Ticker ${ticker.toUpperCase()} not found in universe` });
      return res.status(200).json(etf);
    }

    // Get base set
    let etfs = set === "top"
      ? getTopAumEtfs()
      : set === "random"
        ? getRandomSampleEtfs()
        : getAllEtfs();

    // Category filter
    if (category) {
      const lower = category.toLowerCase();
      etfs = etfs.filter((e) => e.category?.toLowerCase().includes(lower));
    }

    const universe = set === "all" || !set ? getEtfUniverse() : null;

    return res.status(200).json({
      builtAt: universe?.builtAt ?? getUniverseMeta().builtAt,
      count: etfs.length,
      etfs,
    });
  } catch (err: any) {
    // Universe not built yet
    if (err.message?.includes("not built yet")) {
      return res.status(503).json({
        error: "ETF universe not available",
        message: err.message,
        fix: "Run: npx ts-node scripts/buildEtfUniverse.ts",
      });
    }
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
