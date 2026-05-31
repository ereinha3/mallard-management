import type { NextApiRequest, NextApiResponse } from "next";
import { setCORSHeaders } from "../../../lib/api/cors";
import { ClientSnapshotSchema } from "../../../lib/optimization/types";
import { runQuarterlyOptimization } from "../../../lib/optimization/quarterlyOptimizer";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (setCORSHeaders(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const parsed = ClientSnapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const report = runQuarterlyOptimization(parsed.data);
  return res.status(200).json(report);
}
