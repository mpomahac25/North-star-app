import express from "express";

export function createInternalAuthRouter(authService) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/google-users", async (req, res, next) => {
    const { subject, email } = req.body ?? {};
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.length > 255 ||
      typeof email !== "string" ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res
        .status(400)
        .json({ error: "A valid Google subject and email are required." });
    }

    try {
      const user = await authService.findOrCreateGoogleUser({
        subject: subject.trim(),
        email: email.trim(),
      });
      return res.json({ user });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/sessions", async (req, res, next) => {
    const { userId, previousToken } = req.body ?? {};
    if (
      !Number.isSafeInteger(userId) ||
      userId < 1 ||
      (previousToken !== undefined &&
        (typeof previousToken !== "string" || previousToken.length > 256))
    ) {
      return res.status(400).json({ error: "A valid user ID is required." });
    }

    try {
      const session = await authService.createSession({
        userId,
        previousToken,
      });
      return res.json({
        sessionToken: session.token,
        expiresInSeconds: session.expiresInSeconds,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/sessions/current", async (req, res, next) => {
    const token = req.get("x-session-token");
    if (!token || token.length > 256) {
      return res.status(401).json({ error: "Authentication required." });
    }
    try {
      const user = await authService.findSession(token);
      if (!user) {
        await authService.revokeSession(token);
        return res.status(401).json({ error: "Authentication required." });
      }
      return res.json({ user });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/sessions/current", async (req, res, next) => {
    const token = req.get("x-session-token");
    if (token && token.length <= 256) {
      try {
        await authService.revokeSession(token);
      } catch (error) {
        return next(error);
      }
    }
    return res.status(204).end();
  });

  return router;
}
