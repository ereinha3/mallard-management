import type { NextApiRequest, NextApiResponse } from "next";
import { setCORSHeaders } from "../../lib/api/cors";
import { FinancialProfileInputSchema, buildFinancialProfile } from "../../lib/api/financialProfile";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return; // preflight OPTIONS handled

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = FinancialProfileInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const profile = buildFinancialProfile(parsed.data);
  return res.status(200).json(profile);
}
