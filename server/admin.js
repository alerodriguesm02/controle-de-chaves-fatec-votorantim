import { parse } from "csv-parse/sync";
import QRCode from "qrcode";
import {
  roles,
  uid,
  now,
  field,
  fail,
  audit,
  requireRole,
  choice,
  hashPassword,
  digest,
} from "./common.js";
import { issueLabel, labelToken } from "./labels.js";
import { inventory } from "./custody.js";

const conditions = ["Ativa", "Manutenção", "Extraviada", "Inativa"];
function date(v) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T12:00Z")) ||
    new Date(v + "T12:00Z").toISOString().slice(0, 10) !== v
  )
    fail(422, "Data inválida.");
  return v;
}
async function existing(db, table, id) {
  const row = await db.one("SELECT * FROM " + table + " WHERE id=?", [id]);
  if (!row) fail(404, "Cadastro não encontrado.");
  return row;
}
async function saveUser(db, b) {
  const id = b.id || uid(),
    previous = b.id && (await existing(db, "users", id));
  const email = field(b, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, "E-mail inválido.");
  const pass = b.password;
  if ((pass || !previous) && (!pass || pass.length < 10 || pass.length > 160))
    fail(422, "Use uma senha de 10 a 160 caracteres.");
  const vals = [
    field(b, "name"),
    email,
    field(b, "registration"),
    choice(b.role, roles),
    pass ? hashPassword(pass) : previous.password,
    b.active === false ? 0 : 1,
    b.valid_until ? date(b.valid_until) : "",
    b.master ? 1 : 0,
  ];
  if (previous) {
    if (
      previous.role === "Administrador" &&
      (vals[3] !== "Administrador" || !vals[5] || vals[6])
    ) {
      const other = await db.one(
        "SELECT id FROM users WHERE id<>? AND active=1 AND role='Administrador' AND valid_until=''",
        [id],
      );
      if (!other)
        fail(
          409,
          "Mantenha outro administrador ativo antes de alterar este vínculo.",
        );
    }
    await db.run(
      "UPDATE users SET name=?,email=?,registration=?,role=?,password=?,active=?,valid_until=?,master=? WHERE id=?",
      ...vals,
      id,
    );
    await db.run("DELETE FROM sessions WHERE user_id=?", id);
  } else
    await db.run("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)", id, ...vals);
  return id;
}
async function saveSchedule(db, b, batch = "") {
  if (
    !(await db.one(
      "SELECT id FROM users WHERE id=? AND role='Docente' AND active=1",
      [b.user_id],
    ))
  )
    fail(422, "Docente inválido.");
  await existing(db, "rooms", b.room_id);
  const day = Number(b.weekday),
    start = b.start_time,
    end = b.end_time,
    clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !Number.isInteger(day) ||
    day < 0 ||
    day > 6 ||
    !clock.test(start) ||
    !clock.test(end) ||
    start >= end ||
    date(b.valid_from) > date(b.valid_to)
  )
    fail(422, "Confira o dia, a faixa de horários e a vigência.");
  if (b.id) {
    await existing(db, "schedules", b.id);
    await db.run("UPDATE schedules SET active=0 WHERE id=?", b.id);
  }
  const id = uid();
  await db.run(
    "INSERT INTO schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,1)",
    id,
    b.user_id,
    b.room_id,
    field(b, "subject"),
    field(b, "class_name"),
    day,
    start,
    end,
    b.valid_from,
    b.valid_to,
    batch,
  );
  return id;
}
export async function manage(db, u, op, b) {
  if (["incident", "resolve-incident", "check", "check-label"].includes(op))
    requireRole(u, "Administrador", "Secretaria");
  else requireRole(u, "Administrador");
  let target = b.id || "",
    detail = "",
    result = { ok: true },
    action = op;
  const tables = {
    user: "users",
    room: "rooms",
    key: "keys",
    settings: "settings",
    schedule: "schedules",
    "remove-schedule": "schedules",
  };
  async function auditValue(id) {
    if (!tables[op] || !id) return {};
    const r = await db.one("SELECT * FROM " + tables[op] + " WHERE id=?", [id]);
    if (!r) return {};
    const { password, ...safe } = r;
    if (op === "key")
      safe.rooms = (
        await db.all("SELECT room_id FROM key_rooms WHERE key_id=?", [id])
      ).map((v) => v.room_id);
    return safe;
  }
  const before = await auditValue(op === "settings" ? 1 : target);
  switch (op) {
    case "user": {
      const old = b.id && (await existing(db, "users", b.id));
      target = await saveUser(db, b);
      action = "Cadastro de usuário";
      detail = [
        b.name,
        old?.role,
        b.role,
        b.active === false ? "Inativo" : "Ativo",
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    }
    case "room": {
      target = b.id || uid();
      const vals = [
        field(b, "code", 40).toUpperCase(),
        field(b, "name"),
        field(b, "block"),
        b.active === false ? 0 : 1,
      ];
      if (b.id) {
        await existing(db, "rooms", b.id);
        await db.run(
          "UPDATE rooms SET code=?,name=?,block=?,active=? WHERE id=?",
          ...vals,
          target,
        );
      } else
        await db.run("INSERT INTO rooms VALUES (?,?,?,?,?)", target, ...vals);
      action = "Cadastro de ambiente";
      detail = vals.slice(0, 3).join(" · ");
      break;
    }
    case "key": {
      target = b.id || uid();
      const vals = [
        field(b, "hook", 40),
        choice(b.kind, ["Individual", "Molho", "Mestra"]),
        choice(b.condition, conditions),
      ];
      if (b.id) {
        await existing(db, "keys", b.id);
        await db.run(
          "UPDATE keys SET hook=?,kind=?,condition=? WHERE id=?",
          ...vals,
          target,
        );
      } else {
        await db.run(
          "INSERT INTO keys VALUES (?,?,?,?,?)",
          target,
          field(b, "code", 40).toUpperCase(),
          ...vals,
        );
        await issueLabel(db, target);
      }
      if (!Array.isArray(b.rooms))
        fail(422, "Selecione os ambientes da chave.");
      await db.run("DELETE FROM key_rooms WHERE key_id=?", target);
      for (const r of new Set(b.rooms)) {
        await existing(db, "rooms", r);
        await db.run("INSERT INTO key_rooms VALUES (?,?)", target, r);
      }
      action = "Cadastro de chave";
      detail = vals.join(" · ");
      break;
    }
    case "label": {
      await existing(db, "keys", target);
      choice(b.mode, ["reprint", "rotate", "revoke"]);
      detail = b.mode === "reprint" ? "Reimpressão" : field(b, "reason", 500);
      if (b.mode === "revoke")
        await db.run("UPDATE labels SET active=0 WHERE key_id=?", target);
      else {
        if (b.mode === "rotate") await issueLabel(db, target);
        const label = await db.one(
          "SELECT id FROM labels WHERE key_id=? AND active=1",
          [target],
        );
        if (!label) fail(410, "Emita uma nova etiqueta para esta chave.");
        result = {
          image: await QRCode.toDataURL("fv:" + labelToken(label.id), {
            width: 360,
            margin: 4,
            errorCorrectionLevel: "M",
          }),
        };
      }
      action = {
        rotate: "Etiqueta emitida",
        revoke: "Etiqueta revogada",
        reprint: "Etiqueta reimpressa",
      }[b.mode];
      break;
    }
    case "correct": {
      const loan = await existing(db, "loans", target);
      if (await db.one("SELECT id FROM corrections WHERE loan_id=?", [target]))
        fail(409, "Este empréstimo já foi anulado.");
      detail = field(b, "reason", 600);
      const at = now();
      // Release custody without recording a physical return that did not happen.
      await db.run(
        "INSERT INTO corrections VALUES (?,?,?,?,?)",
        uid(),
        target,
        at,
        u.id,
        detail,
      );
      await db.run("UPDATE loans SET voided_at=? WHERE id=?", at, target);
      action = "Empréstimo anulado";
      detail +=
        " · Retirada original " +
        loan.checkout +
        " · Devolução original " +
        (loan.returned || "em aberto");
      break;
    }
    case "exception": {
      const s = await existing(db, "schedules", target),
        day = date(b.date);
      if (
        day < s.valid_from ||
        day > s.valid_to ||
        new Date(day + "T12:00Z").getUTCDay() !== s.weekday
      )
        fail(422, "A data precisa corresponder a esta aula vigente.");
      const mode = choice(b.mode, ["Cancelar", "Alterar"]),
        person = b.teacher_id || null,
        room = b.room_id || null;
      if (mode === "Alterar" && !person && !room)
        fail(422, "Selecione a substituição de docente ou de ambiente.");
      if (
        person &&
        !(await db.one(
          "SELECT id FROM users WHERE id=? AND role='Docente' AND active=1",
          [person],
        ))
      )
        fail(422, "Docente inválido.");
      if (room) await existing(db, "rooms", room);
      detail = field(b, "reason");
      await db.run(
        "INSERT INTO schedule_exceptions VALUES (?,?,?,?,?,?,?) ON CONFLICT(schedule_id,date) DO UPDATE SET mode=excluded.mode, teacher_id=excluded.teacher_id, room_id=excluded.room_id, reason=excluded.reason",
        uid(),
        target,
        day,
        mode,
        mode === "Cancelar" ? null : person,
        mode === "Cancelar" ? null : room,
        detail,
      );
      action = "Exceção de grade";
      detail = day + " · " + mode + " · " + detail;
      break;
    }
    case "schedule":
      target = await saveSchedule(db, b);
      action = "Aula cadastrada";
      detail = b.subject;
      break;
    case "remove-schedule":
      await existing(db, "schedules", target);
      await db.run("UPDATE schedules SET active=0 WHERE id=?", target);
      action = "Aula desativada";
      detail = field(b, "reason");
      break;
    case "settings": {
      const n = Number(b.max_keys),
        h = Number(b.hours);
      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n > 100 ||
        !Number.isInteger(h) ||
        h < 1 ||
        h > 720
      )
        fail(422, "Confira os limites configurados.");
      await db.run("UPDATE settings SET max_keys=?,hours=? WHERE id=1", n, h);
      action = "Regras atualizadas";
      detail = n + " chaves · " + h + " horas";
      break;
    }
    case "incident":
      target = uid();
      await existing(db, "keys", b.key_id);
      await db.run(
        "INSERT INTO incidents VALUES (?,?,?,?,?,?,NULL,NULL)",
        target,
        b.key_id,
        field(b, "type"),
        field(b, "description", 1000),
        now(),
        u.id,
      );
      action = "Ocorrência aberta";
      detail = b.description;
      break;
    case "resolve-incident": {
      const incident = await existing(db, "incidents", target);
      if (incident.closed) fail(409, "Ocorrência já resolvida.");
      detail = field(b, "resolution", 1000);
      await db.run(
        "UPDATE incidents SET closed=?,resolution=? WHERE id=?",
        now(),
        detail,
        target,
      );
      action = "Ocorrência resolvida";
      break;
    }
    case "check-label": {
      const id = field(b, "check_id", 36);
      if (!/^[0-9a-f-]{36}$/i.test(id)) fail(422, "Conferência inválida.");
      const expected = await existing(db, "keys", field(b, "expected_key"));
      const token = field(b, "identifier", 180);
      if (!token.startsWith("fv:")) fail(422, "Leia o QR da etiqueta com a câmera ou com um leitor.");
      const label = await db.one(
        "SELECT l.id,l.active,l.key_id,k.code FROM labels l JOIN keys k ON k.id=l.key_id WHERE l.token_hash=?",
        [digest(token.slice(3))],
      );
      const prior = await db.one("SELECT * FROM label_checks WHERE id=?", [id]);
      if (prior) {
        if (prior.actor !== u.id || prior.expected_key !== expected.id || prior.label_id !== (label?.id ?? null))
          fail(409, "Inicie uma nova conferência para esta leitura.");
        return { outcome: prior.outcome, scanned: prior.scanned_code };
      }
      const outcome = !label ? "QR desconhecido" : !label.active ? "Etiqueta revogada"
        : label.key_id !== expected.id ? "Etiqueta em outro gancho" : "Conferida";
      const rooms = (await db.all("SELECT r.code FROM rooms r JOIN key_rooms kr ON kr.room_id=r.id WHERE kr.key_id=? ORDER BY r.code", [expected.id])).map(r => r.code).join(", ");
      const at = now();
      const scanned = label?.code || "Não identificada";
      const incident = outcome === "Conferida" ? null : uid();
      if (incident) {
        await db.run("INSERT INTO incidents VALUES (?,?,?,?,?,?,NULL,NULL)", incident, expected.id,
          "Divergência física", outcome + ". Gancho: " + expected.hook + ". Esperada: " + expected.code + ". Lida: " + scanned, at, u.id);
        await audit(db, u, "Ocorrência aberta", incident, outcome);
      }
      await db.run("INSERT INTO label_checks VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        id, expected.id, label?.id ?? null, u.id, at, expected.hook, expected.code, rooms, scanned, outcome, incident);
      target = expected.id;
      detail = expected.hook + " · " + outcome;
      result = { outcome, scanned };
      action = "Etiqueta conferida";
      break;
    }
    case "check": {
      const items = await inventory(db);
      const shift = choice(b.shift, ["Manhã", "Tarde", "Noite"]);
      if (
        !items.length ||
        !b.observations ||
        items.some(
          (k) => !["presente", "ausente"].includes(b.observations[k.id]),
        )
      )
        fail(422, "Confira cada gancho antes de concluir.");
      const differences = [];
      for (const k of items) {
        if ((b.observations[k.id] === "presente") === !!k.loan) {
          differences.push(k.code);
          await db.run(
            "INSERT INTO incidents VALUES (?,?,?,?,?,?,NULL,NULL)",
            uid(),
            k.id,
            "Divergência física",
            "Conferência de " +
              shift.toLowerCase() +
              " · " +
              b.observations[k.id] +
              " no gancho.",
            now(),
            u.id,
          );
        }
      }
      target = uid();
      await db.run(
        "INSERT INTO checks VALUES (?,?,?,?,?)",
        target,
        shift,
        now(),
        u.id,
        JSON.stringify(b.observations),
      );
      detail = differences.join(", ") || "Sem divergências";
      result = { differences };
      action = "Painel conferido";
      break;
    }
    case "import": {
      const kind = choice(b.kind, ["grade", "docentes"]);
      let rows;
      try {
        rows = parse(field(b, "csv", 200000), {
          columns: true,
          trim: true,
          bom: true,
          skip_empty_lines: true,
          delimiter: ";",
        });
      } catch {
        fail(
          422,
          "CSV inválido. Confira as colunas e o separador ponto e vírgula.",
        );
      }
      if (!rows.length || rows.length > 500)
        fail(422, "O arquivo deve ter de 1 a 500 linhas.");
      const batch = uid();
      // Validation uses exactly the same writes inside a savepoint and rolls them back for preview.
      await db.run("SAVEPOINT csv_preview");
      for (const [i, r] of rows.entries()) {
        try {
          if (kind === "docentes")
            await saveUser(db, {
              ...r,
              id: undefined,
              role: "Docente",
              active: true,
              master: false,
            });
          else {
            const teacher = await db.one("SELECT id FROM users WHERE email=?", [
              String(r.email).toLowerCase(),
            ]);
            const room = await db.one("SELECT id FROM rooms WHERE code=?", [
              r.room,
            ]);
            if (!teacher || !room)
              fail(422, "Docente ou ambiente não cadastrado.");
            await saveSchedule(
              db,
              { ...r, id: undefined, user_id: teacher.id, room_id: room.id },
              batch,
            );
          }
        } catch (e) {
          fail(
            422,
            "Linha " +
              (i + 2) +
              " · " +
              (e.status ? e.message : "Cadastro duplicado ou inválido."),
          );
        }
      }
      if (b.preview) {
        await db.run("ROLLBACK TO SAVEPOINT csv_preview");
        return {
          count: rows.length,
          preview: rows
            .slice(0, 5)
            .map((r) =>
              kind === "docentes" ? r.name : r.subject + " · " + r.room,
            ),
        };
      }
      result = { count: rows.length, batch };
      action = "Importação de " + kind;
      target = batch;
      detail = rows.length + " registros";
      break;
    }
    case "undo-import": {
      const row = await db.one(
        "SELECT id FROM schedules WHERE batch=? AND active=1",
        [target],
      );
      if (!row) fail(404, "Lote de grade indisponível.");
      await db.run("UPDATE schedules SET active=0 WHERE batch=?", target);
      action = "Importação de grade desfeita";
      detail = field(b, "reason");
      break;
    }
    default:
      fail(404, "Operação desconhecida.");
  }
  await audit(
    db,
    u,
    action,
    target,
    detail,
    before,
    await auditValue(op === "settings" ? 1 : target),
  );
  return result;
}
