import type { NextApiRequest, NextApiResponse } from "next";
import { TaxInputSchema, calculateTax } from "../../../lib/tax";
import { setCORSHeaders } from "../../../lib/api/cors";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = TaxInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const summary = calculateTax(parsed.data);

  return res.status(200).json(summary);
}
