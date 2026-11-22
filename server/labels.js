import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { uid, now, digest } from "./common.js";
let secret;
export function configureLabels(file) {
  secret = process.env.LABEL_SECRET;
  if (!secret) {
    if (process.env.DATABASE_URL)
      throw Error("Defina LABEL_SECRET para a instalação PostgreSQL.");
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    try {
      writeFileSync(file, randomBytes(32).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    secret = readFileSync(file, "utf8");
  }
}
export const labelToken = (id) =>
  createHmac("sha256", secret).update(id).digest("base64url");
export async function issueLabel(db, key) {
  const id = uid();
  await db.run("UPDATE labels SET active=0 WHERE key_id=? AND active=1", key);
  await db.run(
    "INSERT INTO labels VALUES (?,?,?,?,?)",
    id,
    key,
    digest(labelToken(id)),
    1,
    now(),
  );
}
