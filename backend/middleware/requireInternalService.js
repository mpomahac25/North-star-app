import { timingSafeEqual } from "node:crypto";

export function requireInternalService(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY;
  const provided = req.get("x-internal-api-key");
  if (!expected || expected.length < 32 || !provided) {
    return res
      .status(503)
      .json({ error: "Internal service authentication is not configured." });
  }

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return res
      .status(401)
      .json({ error: "Unauthorized internal service request." });
  }

  return next();
}
