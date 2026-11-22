import {
  uid,
  now,
  digest,
  audit,
  fail,
  requireRole,
  field,
  isActive,
  localDate,
} from "./common.js";
export async function inventory(db) {
  const keys = await db.all("SELECT * FROM keys ORDER BY code");
  const rooms = await db.all("SELECT * FROM rooms ORDER BY code");
  const links = await db.all("SELECT * FROM key_rooms");
  const open = await db.all(
    "SELECT l.*,u.name AS holder FROM loans l JOIN users u ON u.id=l.user_id WHERE returned IS NULL AND voided_at IS NULL",
  );
  const labels = await db.all("SELECT id,key_id FROM labels WHERE active=1");
  return keys.map((k) => {
    const loan = open.find((l) => l.key_id === k.id);
    return {
      ...k,
      rooms: rooms.filter((r) =>
        links.some((x) => x.key_id === k.id && x.room_id === r.id),
      ),
      label: labels.find((x) => x.key_id === k.id)?.id ?? null,
      loan: loan ?? null,
      status:
        k.condition !== "Ativa" ? "Bloqueada" : loan ? "Em uso" : "Disponível",
      late: !!loan && loan.due < now(),
    };
  });
}
export async function history(db, u, filters = {}) {
  const clauses = [],
    args = [];
  const where = (sql, val) => {
    clauses.push(sql);
    args.push(val);
  };
  if (u.role === "Docente") where("l.user_id=?", u.id);
  else if (filters.person) where("l.user_id=?", filters.person);
  if (filters.key) where("l.key_id=?", filters.key);
  if (filters.from)
    where(
      "l.checkout>=?",
      new Date(filters.from + "T00:00:00-03:00").toISOString(),
    );
  if (filters.to)
    where(
      "l.checkout<?",
      new Date(
        Date.parse(filters.to + "T00:00:00-03:00") + 86400000,
      ).toISOString(),
    );
  if (filters.state === "open")
    clauses.push("l.returned IS NULL AND l.voided_at IS NULL");
  if (filters.state === "void") clauses.push("v.id IS NOT NULL");
  if (filters.state === "closed")
    clauses.push("l.returned IS NOT NULL AND v.id IS NULL");
  if (filters.state === "late")
    where("l.returned IS NULL AND l.voided_at IS NULL AND l.due<?", now());
  if (filters.state === "contingency") clauses.push("(l.contingency_out=1 OR l.contingency_in=1)");
  if (filters.state === "assisted")
    clauses.push("(l.reason_out<>'' OR COALESCE(l.reason_in,'')<>'')");
  let rows = await db.all(
    "SELECT l.*, v.at AS voided, v.reason AS correction, k.code, u.name AS holder, a.name AS operator_out, b.name AS operator_in FROM loans l JOIN keys k ON k.id=l.key_id JOIN users u ON u.id=l.user_id JOIN users a ON a.id=l.actor_out LEFT JOIN users b ON b.id=l.actor_in LEFT JOIN corrections v ON v.loan_id=l.id " +
      (clauses.length ? "WHERE " + clauses.join(" AND ") : "") +
      " ORDER BY l.checkout DESC,l.id",
    args,
  );
  if (filters.room)
    rows = rows.filter((r) => r.rooms.split(", ").includes(filters.room));
  if (u.role === "Auditor")
    rows = rows.map((r) => ({
      ...r,
      holder: "Acesso restrito",
      operator_out: "—",
      operator_in: "—",
      user_id: null,
      actor_in: null,
      actor_out: null,
      context: "—",
      correction: "",
      reason_in: "",
      reason_out: "",
    }));
  return rows;
}
export async function schedules(db, u, date = "") {
  const base = await db.all(
    "SELECT s.*,u.name AS teacher,r.code AS room FROM schedules s JOIN users u ON u.id=s.user_id JOIN rooms r ON r.id=s.room_id WHERE s.active=1 ORDER BY weekday,start_time",
  );
  const exceptions = await db.all(
    "SELECT e.*,u.name AS substitute,r.code AS new_room FROM schedule_exceptions e LEFT JOIN users u ON u.id=e.teacher_id LEFT JOIN rooms r ON r.id=e.room_id ORDER BY e.date",
  );
  return base.flatMap((s) => {
    const all = exceptions.filter((e) => e.schedule_id === s.id);
    const e = date && all.find((v) => v.date === date);
    if (e?.mode === "Cancelar") return [];
    const item = e
      ? {
          ...s,
          user_id: e.teacher_id || s.user_id,
          teacher: e.substitute || s.teacher,
          room_id: e.room_id || s.room_id,
          room: e.new_room || s.room,
        }
      : s;
    if (u.role === "Docente" && item.user_id !== u.id) {
      if (!date && all.some((v) => v.teacher_id === u.id))
        return all
          .filter((v) => v.teacher_id === u.id)
          .map((v) => ({
            ...s,
            teacher: v.substitute,
            user_id: u.id,
            room: v.new_room || s.room,
            valid_from: v.date,
            valid_to: v.date,
            exceptions: [],
          }));
      return [];
    }
    return [{ ...item, exceptions: all }];
  });
}
export async function identify(db, user, body) {
  requireRole(user, "Docente", "Secretaria", "Administrador");
  const value = field(body, "identifier");
  const key = value.startsWith("fv:")
    ? await db.one(
        "SELECT k.*,e.id AS version,e.active AS label_active FROM keys k JOIN labels e ON e.key_id=k.id WHERE e.token_hash=?",
        [digest(value.slice(3))],
      )
    : await db.one(
        "SELECT k.*,e.id AS version,e.active AS label_active FROM keys k LEFT JOIN labels e ON e.key_id=k.id AND e.active=1 WHERE k.code=?",
        [value.toUpperCase()],
      );
  if (!key) fail(404, "Código não encontrado. Confira a etiqueta do gancho.");
  if (!key.label_active)
    fail(410, "Etiqueta revogada. Solicite auxílio à secretaria.");
  const item = (await inventory(db)).find((k) => k.id === key.id);
  if (item.condition !== "Ativa")
    fail(
      409,
      "Chave em condição de " +
        item.condition.toLowerCase() +
        ". Procure a secretaria.",
    );
  const person =
    user.role === "Docente" ? user.id : item.loan?.user_id || body.person;
  if (user.role === "Docente" && item.loan && item.loan.user_id !== user.id)
    fail(403, "Outra pessoa está com esta chave. Procure a secretaria.");
  const teacher =
    person &&
    (await db.one(
      "SELECT * FROM users WHERE id=?" +
        (item.loan ? "" : " AND role='Docente'"),
      [person],
    ));
  if (!teacher || (!isActive(teacher) && !item.loan))
    fail(422, "Selecione um docente com vínculo ativo.");
  if (!item.loan && key.kind === "Mestra" && !teacher.master)
    fail(403, "O docente precisa de autorização para a chave mestra.");
  const local = localDate(),
    day = local.slice(0, 10),
    time = local.slice(11, 16),
    weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const options = (
    await schedules(db, { id: person, role: "Docente" }, day)
  ).filter(
    (s) =>
      s.weekday === weekday &&
      s.valid_from <= day &&
      s.valid_to >= day &&
      s.start_time <= time &&
      s.end_time > time &&
      item.rooms.some((r) => r.id === s.room_id),
  );
  return {
    code: key.code,
    key_id: key.id,
    version: key.version,
    rooms: item.rooms.map((r) => r.code).join(", "),
    hook: key.hook,
    person,
    name: teacher.name,
    loan_id: item.loan?.id ?? null,
    checkout: item.loan?.checkout ?? null,
    action: item.loan ? "return" : "checkout",
    options,
  };
}
export async function move(db, u, b, requestKey) {
  requireRole(u, "Docente", "Secretaria", "Administrador");
  if (!/^[0-9a-f-]{36}$/i.test(requestKey || ""))
    fail(400, "Identificador da confirmação inválido.");
  const fingerprint = digest(JSON.stringify(b));
  const prior = await db.one(
    "SELECT * FROM requests WHERE user_id=? AND request_key=?",
    [u.id, requestKey],
  );
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(409, "A confirmação já foi usada com outros dados.");
    return JSON.parse(prior.result);
  }
  const k = await identify(db, u, b);
  if (
    k.action !== b.action ||
    k.version !== b.version ||
    k.loan_id !== (b.loan_id ?? null)
  )
    fail(409, "A situação da chave mudou. Identifique-a novamente.");
  const reason = u.role === "Docente" ? "" : field(b, "reason", 600);
  if (b.origin && !["assisted", "contingency"].includes(b.origin))
    fail(422, "Origem de registro inválida.");
  const contingency = b.origin === "contingency";
  if (contingency && u.role === "Docente") fail(403, "Contingência exige registro da secretaria.");
  if (contingency && !b.declared) fail(422, "Informe o horário físico da contingência.");
  if (b.declared && !Number.isFinite(Date.parse(b.declared))) fail(422, "Horário físico inválido.");
  const declared =
    u.role === "Docente" || !b.declared
      ? null
      : new Date(b.declared).toISOString();
  const at = now();
  if (declared && declared > at)
    fail(422, "O horário informado precisa estar no passado.");
  const rules = await db.one("SELECT * FROM settings");
  let id = k.loan_id;
  if (k.action === "checkout") {
    const count = await db.one(
      "SELECT count(*) AS n FROM loans WHERE user_id=? AND returned IS NULL AND voided_at IS NULL",
      [k.person],
    );
    if (+count.n >= rules.max_keys)
      fail(409, "O docente atingiu o limite de chaves em uso.");
    let context;
    if (b.schedule) {
      const s = k.options.find((s) => s.id === b.schedule);
      if (!s) fail(409, "A aula selecionada saiu da faixa de horário.");
      context = s.subject + " · " + s.class_name + " · " + s.room;
    } else context = field(b, "purpose", 300);
    id = uid();
    await db.run(
      "INSERT INTO loans (id,key_id,user_id,checkout,due,actor_out,reason_out,declared_out,contingency_out,context,rooms) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id,
      k.key_id,
      k.person,
      at,
      new Date(Date.parse(at) + rules.hours * 3600000).toISOString(),
      u.id,
      reason,
      declared,
      Number(contingency),
      context,
      k.rooms,
    );
    const selected = k.options.find((s) => s.id === b.schedule);
    const source = selected
      ? k.options.length === 1
        ? "Sugerida e confirmada"
        : "Escolhida pelo docente"
      : "Finalidade informada";
    const snapshot = selected
      ? {
          disciplina: selected.subject,
          turma: selected.class_name,
          sala: selected.room,
        }
      : { finalidade: context };
    await db.run(
      "INSERT INTO loan_context VALUES (?,?,?,?)",
      id,
      selected?.id || null,
      source,
      JSON.stringify(snapshot),
    );
  } else {
    await db.run(
      "UPDATE loans SET returned=?,actor_in=?,reason_in=?,declared_in=?,contingency_in=? WHERE id=? AND returned IS NULL",
      at,
      u.id,
      reason,
      declared,
      Number(contingency),
      id,
    );
  }
  const result = {
    id,
    action: k.action,
    code: k.code,
    rooms: k.rooms,
    at,
    name: k.name,
  };
  await audit(
    db,
    u,
    k.action === "checkout" ? "Retirada confirmada" : "Devolução confirmada",
    id,
    [k.code, k.name, contingency && "Contingência", reason].filter(Boolean).join(" · "),
  );
  await db.run(
    "INSERT INTO requests VALUES (?,?,?,?)",
    u.id,
    requestKey,
    fingerprint,
    JSON.stringify(result),
  );
  return result;
}
