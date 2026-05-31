/**
 * GET /api/universe/etfs
 *
 * Returns the cached ETF universe. Supports query params for filtering.
 *
 * Query params:
 *   ?set=top           — only top 500 by AUM
 *   ?set=diversified   — only the diversified category-balanced sample
 *   ?set=all           — all ETFs (default)
 *   ?bucket=us_sector  — filter by sample bucket id (see SAMPLE_BUCKETS in build script)
 *   ?category=bond     — filter by Yahoo Finance category substring (case-insensitive)
 *   ?ticker=VTI        — lookup single ETF
 *   ?meta=true         — return only metadata (counts, bucketBreakdown, builtAt)
 *
 * Sample bucket ids:
 *   us_equity_large | us_equity_small_mid | us_sector | intl_developed |
 *   intl_emerging   | bonds_core          | bonds_hiy_intl | factor_smart_beta |
 *   thematic        | leveraged_inverse   | commodities | esg | income_multiasset
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { setCORSHeaders } from "../../../lib/api/cors";
import {
  getEtfUniverse,
  getTopAumEtfs,
  getDiversifiedSampleEtfs,
  getAllEtfs,
  getEtfByTicker,
  getEtfsByBucket,
  getUniverseMeta,
} from "../../../lib/universe/etfUniverse";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { set, bucket, category, ticker, meta } = req.query as Record<string, string>;

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

    // Filter by sample bucket (overrides set)
    if (bucket) {
      const etfs = getEtfsByBucket(bucket);
      return res.status(200).json({
        builtAt: getUniverseMeta().builtAt,
        bucket,
        count: etfs.length,
        etfs,
      });
    }

    // Get base set
    let etfs = set === "top"
      ? getTopAumEtfs()
      : set === "diversified"
        ? getDiversifiedSampleEtfs()
        : getAllEtfs();

    // Optional Yahoo-category filter
    if (category) {
      const lower = category.toLowerCase();
      etfs = etfs.filter((e) => e.category?.toLowerCase().includes(lower));
    }

    const meta_ = getUniverseMeta();
    return res.status(200).json({
      builtAt: meta_.builtAt,
      count: etfs.length,
      ...((!set || set === "all") && { bucketBreakdown: meta_.bucketBreakdown }),
      etfs,
    });
  } catch (err: any) {
    if (err.message?.includes("not built yet")) {
      return res.status(503).json({
        error: "ETF universe not available",
        message: err.message,
        fix: "Run: npx ts-node --project tsconfig.json scripts/buildEtfUniverse.ts",
      });
    }
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
