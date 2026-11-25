import http from "node:http";
import https from "node:https";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export function createAuthServiceProxy(
  loginServiceUrl = process.env.LOGIN_SERVICE_URL || "http://localhost:3003",
) {
  const target = new URL(loginServiceUrl);
  const transport = target.protocol === "https:" ? https : http;

  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("LOGIN_SERVICE_URL must use HTTP or HTTPS.");
  }

  return (req, res) => {
    const targetPath = new URL(req.originalUrl, target);
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;

    const proxyRequest = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path: `${targetPath.pathname}${targetPath.search}`,
        headers,
      },
      (proxyResponse) => {
        const responseHeaders = { ...proxyResponse.headers };
        for (const header of HOP_BY_HOP_HEADERS) {
          delete responseHeaders[header];
        }

        res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
        proxyResponse.pipe(res);
      },
    );

    proxyRequest.on("error", (error) => {
      console.error(`Login service proxy error: ${error.message}`);

      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      res.status(502).json({
        error: {
          code: "AUTH_SERVICE_UNAVAILABLE",
          message: "The login service is unavailable.",
        },
      });
    });

    req.on("aborted", () => proxyRequest.destroy());
    req.pipe(proxyRequest);
  };
}
