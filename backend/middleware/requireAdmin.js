import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";

const SESSION_COOKIE_NAME = "rio_session";

function readCookie(req, name) {
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

function extractSessionToken(req) {
    const cookieToken = readCookie(req, SESSION_COOKIE_NAME);
    if (cookieToken) return cookieToken;

    const headerToken = req.get("x-session-token");
    if (headerToken) return headerToken.trim();

    const authHeader = req.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }

    return undefined;
}

export async function requireAdmin(req, res, next) {
    const token = extractSessionToken(req);
    if (!token || token.length > 256) {
        return res.status(401).json({
            error: {
                code: "UNAUTHENTICATED",
                message: "Authentication required.",
            },
        });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    try {
        const result = await pool.query(
            `SELECT
                u.id,
                u.username,
                u.email,
                COALESCE(to_jsonb(u) ->> 'is_admin', 'false') AS is_admin_flag
             FROM auth_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = $1
               AND s.expires_at > NOW()
             LIMIT 1`,
            [tokenHash],
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({
                error: {
                    code: "UNAUTHENTICATED",
                    message: "Authentication required.",
                },
            });
        }

        if (user.is_admin_flag !== "true") {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Administrator access is required.",
                },
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: true,
        };

        return next();
    } catch (error) {
        console.error("Failed to verify admin session:", error);
        return res.status(500).json({
            error: {
                code: "AUTH_CHECK_FAILED",
                message: "Could not verify administrator permissions.",
            },
        });
    }
}
