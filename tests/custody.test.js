import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import jsQR from "jsqr";
import pngjs from "pngjs";
import { openDatabase } from "../server/db.js";

let child, base, temp, env, pgPool, dbFile;
const cookies = {},
  schemas = [];
async function testSchema() {
  const schema = "test_" + randomUUID().replaceAll("-", "");
  await pgPool.query("CREATE SCHEMA " + schema);
  schemas.push(schema);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  return url.href;
}
async function call(path, b, role = "admin", headers = {}) {
  const response = await fetch(base + "/api/v1/" + path, {
    method: b === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookies[role] || "",
      ...headers,
    },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  if (response.headers.has("set-cookie"))
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  return {
    status: response.status,
    data: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer(),
  };
}
const confirm = (data, role = "professor", key = randomUUID()) =>
  call("loans/confirm", data, role, { "idempotency-key": key });
const resolve = async (code, role = "professor") => {
  const r = await call(
    "keys/resolve",
    { identifier: code, person: "professor" },
    role,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return {
    identifier: code,
    person: r.data.person,
    action: r.data.action,
    loan_id: r.data.loan_id,
    version: r.data.version,
    purpose: "Estudo orientado",
  };
};
before(async () => {
  temp = await mkdtemp(join(tmpdir(), "chavario-test-"));
  dbFile = join(temp, "test.sqlite");
  env = {
    ...process.env,
    NODE_ENV: "test",
    DEMO_MODE: "1",
    PORT: "0",
    HOST: "127.0.0.1",
    DB_FILE: dbFile,
    DATABASE_URL: "",
    LABEL_SECRET: randomUUID(),
    PUBLIC_ORIGIN: "",
  };
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    pgPool = new pg.Pool({ connectionString: url.href });
    env.DATABASE_URL = await testSchema();
  }
  child = spawn(process.execPath, ["server/main.js"], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout });
  const line = await Promise.race([
    once(lines, "line").then((v) => v[0]),
    once(child, "exit").then(() => {
      throw Error("Falha ao iniciar a API de teste");
    }),
  ]);
  base = line.match(/http:\/\/[^ ]+/)[0];
  lines.close();
  for (const role of ["admin", "professor", "secretaria", "auditoria"])
    assert.equal(
      (await call("auth/demo", { profile: role }, role)).status,
      200,
    );
});
after(async () => {
  if (child && child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
  if (pgPool) {
    for (const schema of schemas)
      await pgPool.query("DROP SCHEMA " + schema + " CASCADE");
    await pgPool.end();
  }
});

test("sessão obrigatória e auditor sem exportação nominal ou cadastro", async () => {
  assert.equal((await call("workspace", undefined, "anon")).status, 401);
  assert.equal(
    (await call("manage/settings", { hours: 2, max_keys: 1 }, "professor"))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "reports/export",
        { reason: "Consulta", format: "csv" },
        "auditoria",
      )
    ).status,
    403,
  );
  const { data } = await call("workspace", undefined, "professor");
  assert.equal(data.people.length, 0);
  assert.ok(data.loans.every((l) => l.user_id === "professor"));
  const audit = await call("audit");
  assert.ok(audit.data.some((e) => e.action === "Operação recusada"));
});
test("100 confirmações concorrentes produzem uma única retirada; reenvio e devolução idempotentes", async () => {
  const payload = await resolve("CH-001"),
    ids = Array.from({ length: 100 }, () => randomUUID());
  const out = await Promise.all(
    ids.map((k) => confirm(payload, "professor", k)),
  );
  assert.equal(out.filter((r) => r.status === 200).length, 1);
  assert.ok(out.every((r) => [200, 409].includes(r.status)));
  const i = out.findIndex((r) => r.status === 200);
  assert.deepEqual(
    (await confirm(payload, "professor", ids[i])).data,
    out[i].data,
  );
  assert.equal(
    (await confirm({ ...payload, purpose: "Outra" }, "professor", ids[i]))
      .status,
    409,
  );
  const ret = await resolve("CH-001"),
    key = randomUUID();
  assert.equal(ret.action, "return");
  const returned = await confirm(ret, "professor", key);
  assert.equal(returned.status, 200);
  assert.equal(returned.data.id, out[i].data.id);
  assert.deepEqual((await confirm(ret, "professor", key)).data, returned.data);
});
test("devolução de terceiro, bloqueios e confirmação desatualizada", async () => {
  assert.equal(
    (await call("keys/resolve", { identifier: "CH-002" }, "professor")).status,
    403,
  );
  assert.equal(
    (await call("keys/resolve", { identifier: "CH-006" }, "professor")).status,
    409,
  );
  const payload = await resolve("CH-001");
  assert.equal(
    (await confirm({ ...payload, version: randomUUID() })).status,
    409,
  );
});
test("QR impresso decodifica, pode ser reimpresso e deixa de valer após rotação", async () => {
  const scan = async () => {
    const r = await call("manage/label", { id: "key-0", mode: "reprint" });
    assert.equal(r.status, 200);
    const img = pngjs.PNG.sync.read(
      Buffer.from(r.data.image.split(",")[1], "base64"),
    );
    return jsQR(new Uint8ClampedArray(img.data), img.width, img.height).data;
  };
  const old = await scan();
  assert.equal(await scan(), old);
  await resolve(old);
  await call("manage/label", {
    id: "key-0",
    mode: "rotate",
    reason: "Etiqueta danificada",
  });
  assert.equal(
    (await call("keys/resolve", { identifier: old }, "professor")).status,
    410,
  );
  const current = await scan();
  assert.notEqual(current, old);
  const verify = (identifier, expected_key, check_id = randomUUID(), role = "secretaria") =>
    call("manage/check-label", { identifier, expected_key, check_id }, role);
  assert.equal((await verify(current, "key-0", randomUUID(), "professor")).status, 403);
  assert.equal((await verify(current, "key-0")).data.outcome, "Conferida");
  assert.equal((await verify(old, "key-0")).data.outcome, "Etiqueta revogada");
  const checkId = randomUUID();
  assert.equal((await verify(current, "key-1", checkId)).data.outcome, "Etiqueta em outro gancho");
  await verify(current, "key-1", checkId);
  const report = await call("reports?kind=label-checks");
  assert.equal(report.data.rows.filter(r => r.includes("Etiqueta em outro gancho")).length, 1);
  assert.equal((await verify("CH-001", "key-0")).status, 422);
});
test("registro assistido exige motivo, preserva responsável, contexto e horários", async () => {
  const b = await resolve("CH-001", "secretaria");
  assert.equal((await confirm(b, "secretaria")).status, 422);
  assert.equal((await confirm({ ...b, reason: "Livro físico", origin: "contingency" }, "secretaria")).status, 422);
  const r = await confirm(
    {
      ...b,
      origin: "contingency",
      reason: "Livro físico",
      declared: new Date(Date.now() - 60000).toISOString(),
    },
    "secretaria",
  );
  assert.equal(r.status, 200);
  const row = (
    await call("reports?key=key-0&person=professor&state=assisted")
  ).data.rows.find((l) => l.id === r.data.id);
  assert.equal(row.actor_out, "secretaria");
  assert.equal(row.user_id, "professor");
  assert.ok(row.declared_out < row.checkout);
  assert.equal(row.contingency_out, 1);
  assert.equal((await call("reports?state=contingency")).data.rows[0].id, r.data.id);
  assert.equal(row.context, b.purpose);
  assert.equal((await confirm(await resolve("CH-001"))).status, 200);
});
test("cadastro de grade em lote tem prévia, rollback e vigência", async () => {
  const csv =
    "email;room;subject;class_name;weekday;start_time;end_time;valid_from;valid_to\nprofessor@demo.invalid;A-101;Oficina;DSM;2;09:00;11:00;2026-01-01;2027-12-31";
  const initial = (await call("workspace")).data.schedules.length;
  assert.equal(
    (await call("manage/import", { kind: "grade", csv, preview: true })).data
      .count,
    1,
  );
  assert.equal((await call("workspace")).data.schedules.length, initial);
  assert.equal(
    (
      await call("manage/import", {
        kind: "grade",
        csv: csv + "\ninvalid;ZZ;X;X;2;09:00;11:00;2026-01-01;2027-12-31",
      })
    ).status,
    422,
  );
  const saved = await call("manage/import", { kind: "grade", csv });
  assert.equal(saved.status, 200);
  await call("manage/undo-import", {
    id: saved.data.batch,
    reason: "Ajuste do lote",
  });
  assert.equal((await call("workspace")).data.schedules.length, initial);
});
test("conferência abre ocorrência sem deduzir movimentação e correção mantém horários", async () => {
  const ws = (await call("workspace")).data,
    observations = Object.fromEntries(
      ws.keys.map((k) => [k.id, k.loan ? "ausente" : "presente"]),
    );
  observations["key-0"] = "ausente";
  assert.deepEqual(
    (await call("manage/check", { shift: "Tarde", observations }, "secretaria"))
      .data.differences,
    ["CH-001"],
  );
  const current = (await call("workspace")).data;
  assert.ok(current.incidents.some((v) => v.key_id === "key-0"));
  assert.equal(current.keys[0].loan, null);
  const r = await confirm(await resolve("CH-001"));
  await call("manage/correct", {
    id: r.data.id,
    reason: "Erro material verificado no gancho",
  });
  const row = (await call("reports?state=void")).data.rows[0];
  assert.ok(row.voided);
  assert.equal(row.returned, null);
  assert.equal(row.checkout, r.data.at);
  assert.equal((await resolve("CH-001")).action, "checkout");
});
test("conserva filtros e finalidade nas exportações CSV/PDF", async () => {
  assert.equal((await call("reports/export", { format: "csv" })).status, 422);
  for (const format of ["csv", "pdf"]) {
    const r = await call("reports/export", {
      format,
      reason: "Conferência do inventário",
      filters: { key: "key-0" },
    });
    assert.equal(r.status, 200);
    const s = Buffer.from(r.data).toString();
    assert.ok(
      format === "pdf"
        ? s.startsWith("%PDF-")
        : s.includes("CH-001") && !s.includes("CH-002"),
    );
  }
});
test("backup consistente é restaurado em base vazia com histórico e sem sessões", async () => {
  const archive = join(temp, "snapshot.gz"),
    other = join(temp, "restored.sqlite");
  execFileSync(process.execPath, ["scripts/archive.js", "backup", archive], {
    env,
  });
  const restoredUrl = pgPool ? await testSchema() : "";
  execFileSync(process.execPath, ["scripts/archive.js", "restore", archive], {
    env: { ...env, DATABASE_URL: restoredUrl, DB_FILE: other },
  });
  const restored = await openDatabase(restoredUrl, other);
  try {
    await restored.tx(async (d) => {
      assert.equal(
        Number((await d.one("SELECT count(*) AS n FROM keys")).n),
        24,
      );
      assert.ok((await d.one("SELECT count(*) AS n FROM loans")).n > 24);
      assert.equal(
        Number((await d.one("SELECT count(*) AS n FROM sessions")).n),
        0,
      );
      assert.ok(await d.one("SELECT id FROM corrections"));
      assert.ok(await d.one("SELECT id FROM label_checks"));
    });
  } finally {
    await restored.close();
  }
});

test("duas aulas exigem seleção consciente; exceção e edição preservam o contexto passado", async () => {
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const weekday = new Date(local + "T12:00:00Z").getUTCDay();
  const entry = {
    user_id: "professor",
    room_id: "room-0",
    subject: "Oficina de integração",
    class_name: "DSM-X",
    weekday,
    start_time: "00:00",
    end_time: "23:59",
    valid_from: local,
    valid_to: local,
  };
  for (const subject of [entry.subject, "Estágio supervisionado"])
    assert.equal(
      (await call("manage/schedule", { ...entry, subject })).status,
      200,
    );
  const info = (
    await call("keys/resolve", { identifier: "CH-001" }, "professor")
  ).data;
  assert.ok(info.options.length >= 2);
  const body = { ...(await resolve("CH-001")), purpose: "" };
  assert.equal((await confirm(body)).status, 422);
  const selected = info.options.find((s) => s.subject === entry.subject);
  const result = await confirm({ ...body, schedule: selected.id });
  assert.equal(result.status, 200);
  await confirm(await resolve("CH-001"));
  assert.equal(
    (
      await call("manage/exception", {
        id: selected.id,
        date: local,
        mode: "Cancelar",
        reason: "Calendário ajustado",
      })
    ).status,
    200,
  );
  const revised = (
    await call("keys/resolve", { identifier: "CH-001" }, "professor")
  ).data;
  assert.ok(!revised.options.some((s) => s.id === selected.id));
  const row = (await call("reports?key=key-0")).data.rows.find(
    (l) => l.id === result.data.id,
  );
  assert.ok(row.context.includes(entry.subject));
});
test("relatórios de conferência, auditoria, pendências e uso agregado respeitam o perfil", async () => {
  for (const kind of ["daily", "room-use", "incidents", "checks", "audit"]) {
    const r = await call("reports?kind=" + kind);
    assert.equal(r.status, 200);
    assert.ok(r.data.columns.length >= 3);
  }
  assert.equal(
    (await call("reports?kind=incidents", undefined, "auditoria")).status,
    403,
  );
  assert.equal(
    (
      await call(
        "reports/export",
        {
          format: "pdf",
          reason: "Resumo para gestão",
          filters: { kind: "daily" },
        },
        "auditoria",
      )
    ).status,
    200,
  );
});
