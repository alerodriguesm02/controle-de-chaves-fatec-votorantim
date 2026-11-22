import { readFile, writeFile, access } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { openDatabase } from "../server/db.js";

const [op, archive] = process.argv.slice(2);
if (!["backup", "restore"].includes(op) || !archive)
  throw Error("Use node scripts/archive.js backup|restore arquivo.gz");
const dbFile = process.env.DB_FILE || "data/demo.sqlite",
  pgUrl = process.env.DATABASE_URL;
if (!pgUrl && op === "backup") await access(dbFile);
const tables = [
  "settings",
  "users",
  "rooms",
  "keys",
  "key_rooms",
  "labels",
  "schedules",
  "schedule_exceptions",
  "loans",
  "loan_context",
  "corrections",
  "requests",
  "audit",
  "audit_meta",
  "incidents",
  "checks",
  "label_checks",
  "app_meta",
];
const db = await openDatabase(pgUrl, dbFile);
try {
  if (op === "backup") {
    const snapshot = await db.tx(async (d) => {
      const data = {};
      for (const table of tables)
        data[table] = await d.all("SELECT * FROM " + table);
      return { format: 2, at: new Date().toISOString(), data };
    });
    await writeFile(archive, gzipSync(JSON.stringify(snapshot)), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      "Backup concluído. Guarde o segredo das etiquetas separadamente.",
    );
  } else {
    const snap = JSON.parse(gunzipSync(await readFile(archive)));
    if (snap.format === 1 && snap.data) snap.data.label_checks ??= [];
    if (
      ![1, 2].includes(snap.format) ||
      !tables.every((t) => Array.isArray(snap.data?.[t]))
    )
      throw Error("Backup incompatível.");
    await db.tx(async (d) => {
      for (const table of tables.filter((t) => t !== "app_meta"))
        if (await d.one("SELECT 1 FROM " + table + " LIMIT 1"))
          throw Error("A restauração exige uma base de destino vazia.");
      for (const table of tables)
        for (const row of snap.data[table]) {
          if (table === "app_meta" && row.name === "schema") continue;
          const cols = Object.keys(row);
          if (!cols.every((k) => /^[a-z_]+$/.test(k)))
            throw Error("Coluna inválida no backup.");
          await d.run(
            "INSERT INTO " +
              table +
              " (" +
              cols.join(",") +
              ") VALUES (" +
              cols.map(() => "?").join(",") +
              ")",
            ...Object.values(row),
          );
        }
    });
    console.log(
      "Restauração concluída. Configure o segredo original das etiquetas antes de iniciar a aplicação.",
    );
  }
} finally {
  await db.close();
}
