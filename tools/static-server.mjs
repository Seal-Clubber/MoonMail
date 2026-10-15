// Local verification only. Production output has no server runtime.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const base = "/MoonMail/",
  root = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    const rel = decodeURIComponent(pathname.slice(base.length)) || "index.html";
    const file = path.resolve(root, rel);
    if (
      !file.startsWith(root + path.sep) &&
      file !== path.join(root, "index.html")
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(4173, "127.0.0.1");
