function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required to reach the auth persistence API.`);
  return value;
}

async function request(path, { method = "GET", body, sessionToken } = {}) {
  const backendUrl = requiredEnvironment("BACKEND_URL");
  const headers = {
    accept: "application/json",
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (sessionToken) headers["x-session-token"] = sessionToken;

  const response = await fetch(
    new URL(`/api/internal/auth${path}`, backendUrl),
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("Auth persistence backend request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function createAuthPersistenceClient() {
  return {
    async createPasswordUser({ username, email, password }) {
      const result = await request("/password-users", {
        method: "POST",
        body: { username, email, password },
      });
      return result.user;
    },

    async authenticatePasswordUser({ identifier, password }) {
      const result = await request("/password-authentication", {
        method: "POST",
        body: { identifier, password },
      });
      return result.user;
    },

    async findOrCreateGoogleUser({ subject, email }) {
      const result = await request("/google-users", {
        method: "POST",
        body: { subject, email },
      });
      return result.user;
    },

    createSession(userId, previousToken) {
      return request("/sessions", {
        method: "POST",
        body: { userId, previousToken },
      });
    },

    async findSession(token) {
      try {
        const result = await request("/sessions/current", {
          sessionToken: token,
        });
        return result.user;
      } catch (error) {
        if (error.status === 401) return null;
        throw error;
      }
    },

    revokeSession(token) {
      return request("/sessions/current", {
        method: "DELETE",
        sessionToken: token,
      });
    },
  };
}
