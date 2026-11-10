import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.env.CODOGMA_HTML5_BUILD_OUTPUT ?? "");
if (!process.env.CODOGMA_HTML5_BUILD_OUTPUT) throw new Error("CODOGMA_HTML5_BUILD_OUTPUT is required.");
const rootStat = await stat(root);
if (!rootStat.isDirectory()) throw new Error("HTML5 artifact output must be a directory.");
const port = Number(process.env.PORT ?? 4179);
const configuredBasePath = process.env.CODOGMA_HTML5_BASE_PATH ?? "/";
const normalizedBasePath = configuredBasePath.startsWith("/") ? configuredBasePath : "/" + configuredBasePath;
const mountPath = normalizedBasePath.endsWith("/") ? normalizedBasePath : normalizedBasePath + "/";
if (
  !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(mountPath) ||
  mountPath.includes("//") ||
  mountPath.split("/").some((segment) => segment === "." || segment === "..")
) throw new Error("CODOGMA_HTML5_BASE_PATH must be a safe absolute URL path ending in '/'.");
const contentTypes = new Map([
  [".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],
  [".css","text/css; charset=utf-8"],[".svg","image/svg+xml"],[".json","application/json; charset=utf-8"],
  [".map","application/json; charset=utf-8"],[".png","image/png"],[".jpg","image/jpeg"],[".jpeg","image/jpeg"],
  [".webp","image/webp"],[".woff","font/woff"],[".woff2","font/woff2"]
]);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Allow": "GET, HEAD" }).end();
      return;
    }
    const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (requestPath === mountPath.slice(0, -1) && mountPath !== "/") {
      response.writeHead(308, { "Location": mountPath }).end();
      return;
    }
    if (!requestPath.startsWith(mountPath)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const entryFile = process.env.CODOGMA_HTML5_ENTRY ?? "index.html";
    const mountedPath = requestPath.slice(mountPath.length);
    const relativePath = mountedPath.length === 0 ? entryFile : mountedPath;
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1");
