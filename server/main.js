import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openDatabase } from "./db.js";
import { initialize } from "./seed.js";
import { configureLabels } from "./labels.js";
import {
  now,
  uid,
  token,
  digest,
  matches,
  isActive,
  requireRole,
  fail,
  field,
  audit,
  hashPassword,
  choice,
  requestScope,
} from "./common.js";
import { inventory, history, schedules, identify, move } from "./custody.js";
import { manage } from "./admin.js";
import { dataset } from "./reports.js";
import { csv, pdf } from "./exports.js";

const root = fileURLToPath(new URL("../", import.meta.url)),
  port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1",
  prod = process.env.NODE_ENV === "production";
const demo = !prod && process.env.DEMO_MODE !== "0";
if (demo && !["127.0.0.1", "localhost", "::1"].includes(host))
  throw Error("A demonstração usa somente a interface local.");
if (
  prod &&
  (!process.env.DATABASE_URL ||
    !process.env.PUBLIC_ORIGIN?.startsWith("https://"))
)
  throw Error("Produção requer PostgreSQL e PUBLIC_ORIGIN HTTPS.");
const file =
  process.env.DB_FILE ||
  path.join(root, "data", demo ? "demo.sqlite" : "unit.sqlite");
configureLabels(file + ".labels");
const db = await openDatabase(process.env.DATABASE_URL, file);
await db.tx((d) => initialize(d, demo));
const publicUser = (u) =>
  Object.fromEntries(
    [
      "id",
      "name",
      "email",
      "role",
      "registration",
      "valid_until",
      "active",
      "master",
    ].map((k) => [k, u[k]]),
  );
const publicAssets = new Map([
  ["/vendor/icons.js", "lucide/dist/umd/lucide.min.js"],
  ["/vendor/jsqr.js", "jsqr/dist/jsQR.js"],
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
const attempts = new Map();
function rate(key, limit) {
  const t = Date.now();
  if (attempts.size > 5000)
    for (const [k, v] of attempts) if (v.until < t) attempts.delete(k);
  let entry = attempts.get(key);
  if (!entry || entry.until < t) {
    entry = { n: 0, until: t + 60000 };
    attempts.set(key, entry);
  }
  if (++entry.n > limit) fail(429, "Muitas tentativas. Aguarde um minuto.");
}
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "Envie os dados em JSON.");
  const chunks = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 280000) fail(413, "Arquivo muito grande.");
    chunks.push(part);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const b = JSON.parse(text || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    return b;
  } catch {
    fail(400, "Conteúdo inválido.");
  }
}
const server = http.createServer((req, res) =>
  requestScope.run(uid(), () => handle(req, res)),
);
async function handle(req, res) {
  const requestId = requestScope.getStore();
  let user,
    route = "",
    api = false;
  const send = (status, obj) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(obj));
  };
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Request-ID", requestId);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    if (p === "/healthz" && req.method === "GET") {
      await db.tx((d) => d.one("SELECT 1 AS ok"));
      send(200, { status: "ok" });
      return;
    }
    if (!p.startsWith("/api/v1/")) {
      if (req.method !== "GET" && req.method !== "HEAD")
        fail(405, "Método inválido.");
      let resource = publicAssets.get(p);
      if (
        /^\/fonts\/(dm-sans|barlow-condensed)-latin-(400|500|600|700)-normal\.woff2$/.test(
          p,
        )
      ) {
        const f = p.slice(7);
        resource =
          "@fontsource/" +
          (f.startsWith("dm-") ? "dm-sans" : "barlow-condensed") +
          "/files/" +
          f;
      }
      const base = path.join(root, resource ? "node_modules" : "public");
      const file = path.resolve(
        base,
        resource || "." + (p === "/" ? "/index.html" : decodeURIComponent(p)),
      );
      if (
        !file.startsWith(base + path.sep) ||
        !(await stat(file).catch(() => null))?.isFile()
      )
        fail(404, "Arquivo não encontrado.");
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.end(req.method === "HEAD" ? null : await readFile(file));
      return;
    }
    api = true;
    route = p.slice(8);
    res.setHeader("Cache-Control", "no-store");
    const post = req.method === "POST";
    if (!post && req.method !== "GET") fail(405, "Método inválido.");
    if (
      demo &&
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL("http://" + req.headers.host).hostname,
      )
    )
      fail(403, "Ambiente demonstrativo local.");
    if (
      post &&
      req.headers.origin &&
      req.headers.origin !==
        (process.env.PUBLIC_ORIGIN || "http://" + req.headers.host)
    )
      fail(403, "Origem não autorizada.");
    const b = post ? await body(req) : {};
    const cookie =
      (req.headers.cookie || "").match(/(?:^|; *)fv_session=([\w-]+)/)?.[1] ||
      "";
    const sessionHash = digest(cookie),
      secure = prod ? "; Secure" : "";
    const result = await db.tx(async (d) => {
      user = await d.one(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        [sessionHash, now()],
      );
      if (!isActive(user)) user = null;
      if (route === "auth/me" && !post)
        return { user: user ? publicUser(user) : null, demo };
      if (["auth/login", "auth/demo"].includes(route) && post) {
        rate("login" + req.socket.remoteAddress, 40);
        let u;
        if (route === "auth/demo") {
          if (!demo) fail(404, "Perfil de demonstração indisponível.");
          u = await d.one("SELECT * FROM users WHERE id=?", [
            choice(b.profile, [
              "admin",
              "professor",
              "secretaria",
              "auditoria",
            ]),
          ]);
        } else {
          u = await d.one("SELECT * FROM users WHERE email=?", [
            field(b, "email").toLowerCase(),
          ]);
          if (!u || !matches(field(b, "password", 160), u.password))
            fail(401, "E-mail ou senha incorretos.");
        }
        if (!isActive(u)) fail(403, "Vínculo inativo. Procure a secretaria.");
        const sid = token();
        await d.run(
          "DELETE FROM sessions WHERE token=? OR expires<?",
          sessionHash,
          now(),
        );
        await d.run(
          "INSERT INTO sessions VALUES (?,?,?)",
          digest(sid),
          u.id,
          new Date(Date.now() + 28800000).toISOString(),
        );
        res.setHeader(
          "Set-Cookie",
          "fv_session=" +
            sid +
            "; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict" +
            secure,
        );
        await audit(d, u, "Acesso ao sistema");
        return { user: publicUser(u), demo };
      }
      if (!user) fail(401, "Entre para acessar o sistema.");
      if (route === "auth/logout" && post) {
        await d.run("DELETE FROM sessions WHERE token=?", sessionHash);
        res.setHeader(
          "Set-Cookie",
          "fv_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" + secure,
        );
        return { ok: true };
      }
      if (route === "auth/password" && post) {
        if (!matches(field(b, "current", 160), user.password))
          fail(403, "Senha atual incorreta.");
        const pw = field(b, "password", 160);
        if (pw.length < 10) fail(422, "Use ao menos 10 caracteres.");
        await d.run(
          "UPDATE users SET password=? WHERE id=?",
          hashPassword(pw),
          user.id,
        );
        await d.run(
          "DELETE FROM sessions WHERE user_id=? AND token<>?",
          user.id,
          sessionHash,
        );
        await audit(d, user, "Senha alterada");
        return { ok: true };
      }
      if (route === "workspace" && !post) {
        const teacher = user.role === "Docente",
          auditOnly = user.role === "Auditor";
        let keys = await inventory(d);
        if (teacher || auditOnly)
          keys = keys.map((k) => ({
            ...k,
            loan: k.loan
              ? teacher && k.loan.user_id === user.id
                ? k.loan
                : { occupied: true }
              : null,
          }));
        const loans = await history(d, user);
        const cutoff = new Date(Date.now() - 32 * 86400000).toISOString();
        const recentEvents = [];
        for (const loan of loans) {
          if (loan.voided) continue;
          for (const [type, at] of [["out", loan.checkout], ["in", loan.returned]]) {
            if (at && at >= cutoff) recentEvents.push({ type, at, code: loan.code, rooms: loan.rooms });
          }
        }
        return {
          user: publicUser(user),
          demo,
          recentEvents,
          keys,
          rooms: await d.all("SELECT * FROM rooms ORDER BY code"),
          loans: loans.slice(0, 150),
          schedules: auditOnly ? [] : await schedules(d, user),
          people:
            teacher || auditOnly
              ? []
              : (
                  await d.all(
                    "SELECT id,name,email,registration,role,active,valid_until,master FROM users ORDER BY name",
                  )
                ).filter(
                  (v) => user.role === "Administrador" || v.role === "Docente",
                ),
          incidents:
            teacher || auditOnly
              ? []
              : await d.all(
                  "SELECT i.*,k.code,u.name AS author FROM incidents i JOIN keys k ON k.id=i.key_id JOIN users u ON u.id=i.actor ORDER BY opened DESC",
                ),
          settings: await d.one("SELECT * FROM settings"),
          serverTime: now(),
        };
      }
      if (route === "keys/resolve" && post) {
        rate("resolve" + user.id, 100);
        return identify(d, user, b);
      }
      if (route === "loans/confirm" && post)
        return move(d, user, b, req.headers["idempotency-key"]);
      if (route.startsWith("manage/") && post)
        return manage(d, user, route.slice(7), b);
      if (route === "audit" && !post) {
        requireRole(user, "Administrador", "Auditor", "Secretaria");
        let rows = await d.all(
          "SELECT a.*,m.previous,m.current_value,m.request_id FROM audit a LEFT JOIN audit_meta m ON m.event_id=a.id ORDER BY a.at DESC LIMIT 1000",
        );
        if (user.role === "Secretaria")
          rows = rows.filter((r) =>
            [
              "Retirada confirmada",
              "Devolução confirmada",
              "Ocorrência aberta",
              "Ocorrência resolvida",
              "Painel conferido",
              "Etiqueta conferida",
              "Empréstimo anulado",
            ].includes(r.action),
          );
        return user.role === "Auditor"
          ? rows.map((r) => ({
              ...r,
              actor: r.role,
              detail: "",
              previous: "{}",
              current_value: "{}",
            }))
          : rows;
      }
      if (route === "reports" && !post) {
        const f = Object.fromEntries(url.searchParams);
        const page = Math.max(0, parseInt(f.page) || 0);
        const set =
          f.kind && f.kind !== "custody" ? await dataset(d, user, f) : null;
        const rows = set ? set.rows : await history(d, user, f);
        if (f.report === "1" && page === 0)
          await audit(d, user, "Relatório consultado", f.kind || "custody");
        return {
          rows: rows.slice(page * 25, page * 25 + 25),
          total: rows.length,
          columns: set?.columns,
        };
      }
      if (route === "reports/export" && post) {
        if (
          user.role === "Auditor" &&
          !["audit", "daily", "room-use"].includes(b.filters?.kind)
        )
          fail(403, "Exportação nominal restrita.");
        const reason = field(b, "reason", 500),
          fmt = choice(b.format, ["csv", "pdf"]),
          f = b.filters || {};
        const set =
          f.kind && f.kind !== "custody" ? await dataset(d, user, f) : null;
        const rows = set ? [] : await history(d, user, f);
        if ((set?.rows.length ?? rows.length) > 10000)
          fail(422, "Restrinja o período a até 10.000 registros.");
        await audit(
          d,
          user,
          "Relatório exportado",
          fmt,
          reason + " · " + (set?.rows.length ?? rows.length) + " registros",
        );
        return {
          download: true,
          fmt,
          bytes:
            fmt === "csv"
              ? csv(rows, set)
              : await pdf(rows, user, reason, f, set),
        };
      }
      fail(404, "Recurso não encontrado.");
    });
    if (result.download) {
      res.setHeader(
        "Content-Type",
        result.fmt === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="custodia-fatec.' + result.fmt + '"',
      );
      res.end(result.bytes);
    } else send(200, result);
  } catch (e) {
    const duplicate = /unique constraint|duplicate key/i.test(e.message);
    const status = e.status || (duplicate ? 409 : 500),
      message = e.status
        ? e.message
        : duplicate
          ? "Este identificador já está cadastrado."
          : "Não foi possível concluir. Tente novamente.";
    if (api && (req.method === "POST" || status === 403))
      await db
        .tx((d) =>
          audit(
            d,
            user,
            "Operação recusada",
            route,
            message + " · " + requestId,
          ),
        )
        .catch(() => {});
    if (status === 500) console.error(requestId, e.name, e.message);
    send(status, { error: { message, request_id: requestId } });
  }
}
server.listen(port, host, () =>
  console.log(
    "Controle de Chaves em http://" +
      host +
      ":" +
      server.address().port +
      " · " +
      (demo ? "demonstração local" : "ambiente institucional"),
  ),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await db.close();
    process.exit(0);
  }),
);
