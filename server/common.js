import { AsyncLocalStorage } from "node:async_hooks";
export const requestScope = new AsyncLocalStorage();
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const uid = randomUUID,
  now = () => new Date().toISOString();
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function matches(password, stored) {
  return timingSafeEqual(
    Buffer.from(hashPassword(password, stored.split(":")[0])),
    Buffer.from(stored),
  );
}
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function requireRole(user, ...roles) {
  if (!roles.includes(user.role))
    fail(403, "Seu perfil não tem permissão para esta operação.");
}
export function field(body, key, max = 180) {
  const val = body[key];
  if (typeof val !== "string" || !val.trim() || val.trim().length > max)
    fail(422, "Confira o campo " + key + ".");
  return val.trim();
}
export function choice(value, options) {
  if (!options.includes(value)) fail(422, "Seleção inválida.");
  return value;
}
export function localDate(iso = now()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
export function isActive(u) {
  return (
    u?.active === 1 &&
    (!u.valid_until || u.valid_until >= localDate().slice(0, 10))
  );
}
export const roles = ["Administrador", "Secretaria", "Docente", "Auditor"];
export async function audit(
  db,
  u,
  action,
  target = "",
  detail = "",
  before = {},
  after = {},
) {
  const id = uid();
  await db.run(
    "INSERT INTO audit VALUES (?,?,?,?,?,?,?)",
    id,
    now(),
    u?.name ?? null,
    u?.role ?? null,
    action,
    target,
    detail,
  );
  await db.run(
    "INSERT INTO audit_meta VALUES (?,?,?,?,?,?)",
    id,
    u?.id ?? null,
    "FV",
    requestScope.getStore() || uid(),
    JSON.stringify(before),
    JSON.stringify(after),
  );
}
