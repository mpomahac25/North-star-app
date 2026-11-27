import express from "express";

export function createInternalAuthRouter(authService) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/password-users", async (req, res, next) => {
    const { username, email, password } = req.body ?? {};
    if (
      typeof username !== "string" ||
      username.trim().length < 1 ||
      username.trim().length > 50 ||
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error:
          "Username, valid email, and a password of 8 to 128 characters are required.",
      });
    }

    try {
      const user = await authService.createPasswordUser({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      return res.status(201).json({ user });
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post("/password-authentication", async (req, res, next) => {
    const { identifier, password } = req.body ?? {};
    if (
      typeof identifier !== "string" ||
      !identifier.trim() ||
      identifier.length > 255 ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "A username or email and password are required.",
      });
    }

    try {
      const user = await authService.authenticatePasswordUser({
        identifier: identifier.trim(),
        password,
      });
      if (!user) {
        return res
          .status(401)
          .json({ error: "Invalid username/email or password." });
      }
      return res.json({ user });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/google-users", async (req, res, next) => {
    const { subject, email, displayName } = req.body ?? {};
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.length > 255 ||
      typeof email !== "string" ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (displayName !== undefined &&
        displayName !== null &&
        (typeof displayName !== "string" || displayName.trim().length > 255))
    ) {
      return res
        .status(400)
        .json({ error: "A valid Google subject and email are required." });
    }

    try {
      const user = await authService.findOrCreateGoogleUser({
        subject: subject.trim(),
        email: email.trim(),
        displayName:
          typeof displayName === "string" ? displayName.trim() || null : null,
      });
      return res.json({ user });
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post("/email-verification-tokens", async (req, res, next) => {
    const { userId, tokenHash, expiresAt } = req.body ?? {};
    if (
      !Number.isSafeInteger(userId) ||
      userId < 1 ||
      typeof tokenHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(tokenHash) ||
      typeof expiresAt !== "string" ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    ) {
      return res.status(400).json({
        error: "A valid user, token hash, and future expiry are required.",
      });
    }

    try {
      const user = await authService.saveEmailVerificationToken({
        userId,
        tokenHash,
        expiresAt,
      });
      return res.status(201).json({ user });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post("/email-verification-resend", async (req, res, next) => {
    const { email, tokenHash, expiresAt } = req.body ?? {};
    if (
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof tokenHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(tokenHash) ||
      typeof expiresAt !== "string" ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    ) {
      return res.status(400).json({
        error: "A valid email, token hash, and future expiry are required.",
      });
    }

    try {
      const user = await authService.issueEmailVerificationToken({
        email: email.trim(),
        tokenHash,
        expiresAt,
      });
      return res.json({ user });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/email-verification", async (req, res, next) => {
    const { tokenHash } = req.body ?? {};
    if (typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(tokenHash)) {
      return res
        .status(400)
        .json({ error: "A valid verification token is required." });
    }

    try {
      await authService.verifyEmailToken(tokenHash);
      return res.status(204).end();
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).json({ error: error.message });
      }
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
