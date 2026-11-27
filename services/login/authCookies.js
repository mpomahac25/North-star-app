export const SESSION_COOKIE_NAME = "rio_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function authCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    sameSite: "Lax",
    path: "/api",
    maxAge,
  };
}

export function readAuthCookie(req, name) {
  const item = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!item) return undefined;

  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

export function setSessionCookie(res, session) {
  res.cookie(
    SESSION_COOKIE_NAME,
    session.sessionToken,
    authCookieOptions(session.expiresInSeconds * 1000),
  );
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, authCookieOptions(0));
}
