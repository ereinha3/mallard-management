import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { setCORSHeaders } from "../../../lib/api/cors";
import { PortfolioWeightsSchema, AssetClassSchema, locateAssets } from "../../../lib/waterfall/assetLocation";
import { WaterfallBucket } from "../../../lib/waterfall/types";

const RequestSchema = z.object({
  weights: PortfolioWeightsSchema,
  buckets: z.array(z.object({
    priority: z.number(),
    accountType: z.string(),
    label: z.string(),
    monthlyAmount: z.number(),
    annualAmount: z.number(),
    annualLimit: z.number(),
    alreadyContributing: z.number(),
    additionalNeeded: z.number(),
    remainingCapacity: z.number(),
    isMaxed: z.boolean(),
    taxTreatment: z.string(),
    whyThisOrder: z.string(),
  })),
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const result = locateAssets(parsed.data.weights, parsed.data.buckets as WaterfallBucket[]);
  return res.status(200).json(result);
}
