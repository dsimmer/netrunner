import type { IncomingMessage, ServerResponse } from "http";
import { Collection, Document } from "mongodb";
import { response, htmlResponse } from "./utils";
import { frontendVersion } from "./versions";

export interface System {
  db: Collection<Document>;
  serverMode: string;
}

export interface RequestUser {
  _id?: string;
  [key: string]: any;
}

export interface PageRequest extends IncomingMessage {
  system: System;
  user?: RequestUser;
  pathParams?: Record<string, string>;
}

export interface OgData {
  type?: string;
  url?: string;
  image?: string;
  title?: string;
  site_name?: string;
  description?: string;
}

function ogDefault(
  key: keyof OgData,
  defaultValue: string,
  og?: OgData,
): string {
  return og?.[key] ?? defaultValue;
}

export function indexPage(
  req: PageRequest,
  og?: OgData,
  replayId?: string,
): { status: number; body: string; headers: Record<string, string> } {
  const user = req.user || {};
  const serverMode = req.system.serverMode;
  const fv = frontendVersion;
  const cssVersion = serverMode === "dev" ? "" : fv ? `?v=${fv}` : "";
  const jsVersion = serverMode === "dev" ? "" : fv ? `?v=${fv}` : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=0.6, minimal-ui">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta property="og:type" content="${ogDefault("type", "website", og)}">
<meta property="og:url" content="${ogDefault("url", "https://jinteki.net", og)}">
<meta property="og:image" content="${ogDefault("image", "https://www.jinteki.net/img/icons/jinteki_167.png", og)}">
<meta property="og:title" content="${ogDefault("title", "Play Netrunner in your browser", og)}">
<meta property="og:site_name" content="${ogDefault("site_name", "jinteki.net", og)}">
<meta property="og:description" content="${ogDefault("description", "Build Netrunner decks and test them online against other players.", og)}">
<link rel="apple-touch-icon" href="/img/icons/jinteki_167.png">
<title>Jinteki</title>
<link rel="stylesheet" href="/lib/css/toastr.min.css">
<link rel="stylesheet" href="/css/netrunner.css${cssVersion}">
</head>
<body>
<div id="sente-csrf-token" style="display:none" data-csrf-token=""></div>
<div style="display:none" id="server-originated-data" data-version="${fv || ""}" data-replay-id="${replayId || ""}"></div>
<div id="main-content"></div>
<audio id="ting">
<source src="/sound/ting.mp3" type="audio/mp3">
<source src="/sound/ting.ogg" type="audio/ogg">
</audio>
<script src="https://code.jquery.com/jquery-2.1.1.min"></script>
<script src="https://code.jquery.com/ui/1.13.0/jquery-ui.min"></script>
<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/js/bootstrap.min"></script>
<script src="/lib/js/toastr.min"></script>
<script type="text/javascript">var user=${JSON.stringify(user)};</script>
${
  serverMode === "dev"
    ? '<script src="/js/cljs-runtime/goog.base"></script>\n<script src="/js/main"></script>'
    : `<script src="/js/main.js${jsVersion}"></script>`
}
</body>
</html>`;

  return htmlResponse(200, html);
}

export function resetPasswordPage(
  req: PageRequest,
  res: ServerResponse,
): { status: number; body: any; headers: Record<string, string> } {
  const db = req.system.db;
  const token = req.pathParams?.token;

  if (!token) {
    return response(404, {
      message: "Sorry, but that reset token is invalid or has expired.",
    });
  }

  db.findOne(
    { resetPasswordToken: token, resetPasswordExpires: { $gt: new Date() } },
    (err: Error | null, doc: Document | null) => {
      if (err || !doc) {
        const notFound = response(404, {
          message: "Sorry, but that reset token is invalid or has expired.",
        });
        res.writeHead(notFound.status, notFound.headers);
        res.end(JSON.stringify(notFound.body));
        return;
      }

      const html = `<!DOCTYPE html>
<html>
<head>
<title>Jinteki</title>
<link rel="stylesheet" href="/css/netrunner.css">
</head>
<body>
<div class="reset-bg"></div>
<form class="panel blue-shade reset-form" method="POST">
<h3>Password Reset</h3>
<p>
<input class="form-control" type="password" name="password" value="" placeholder="New password" autofocus required>
</p>
<p>
<input class="form-control" type="password" name="confirm" value="" placeholder="Confirm password" required>
</p>
<p>
<button class="btn btn-primary" type="submit">Update Password</button>
</p>
</form>
</body>
</html>`;

      const okResponse = htmlResponse(200, html);
      res.writeHead(okResponse.status, okResponse.headers);
      res.end(okResponse.body);
    },
  );

  // Return a placeholder; the actual response is written asynchronously in the callback
  return { status: 200, body: "", headers: {} };
}
