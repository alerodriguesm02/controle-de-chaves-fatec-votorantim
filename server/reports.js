import { history } from "./custody.js";
import { choice, requireRole, localDate } from "./common.js";
const kinds = ["custody", "daily", "room-use", "incidents", "checks", "label-checks", "audit"];
export async function dataset(db, u, f) {
  const kind = choice(f.kind || "custody", kinds);
  requireRole(u, "Administrador", "Secretaria", "Auditor");
  const dateAllowed = (v) => {
    const day = localDate(v).slice(0, 10);
    return (!f.from || day >= f.from) && (!f.to || day <= f.to);
  };
  if (kind === "daily" || kind === "room-use") {
    const loans = (
      await history(db, u, {
        ...f,
        ...(kind === "daily" ? { from: "", to: "" } : {}),
      })
    ).filter((l) => !l.voided);
    const groups = new Map(),
      inc = (k, col, n = 1) => {
        const v = groups.get(k) || [0, 0];
        v[col] += n;
        groups.set(k, v);
      };
    for (const l of loans) {
      if (kind === "daily") {
        if (dateAllowed(l.checkout)) inc(localDate(l.checkout).slice(0, 10), 0);
        if (l.returned && dateAllowed(l.returned))
          inc(localDate(l.returned).slice(0, 10), 1);
      } else
        for (const room of l.rooms
          .split(", ")
          .filter((r) => !f.room || r === f.room)) {
          inc(room, 0);
          inc(
            room,
            1,
            Math.floor(
              ((l.returned ? Date.parse(l.returned) : Date.now()) -
                Date.parse(l.checkout)) /
                60000,
            ),
          );
        }
    }
    return {
      title: kind === "daily" ? "Operações por dia" : "Uso por ambiente",
      columns:
        kind === "daily"
          ? ["Dia", "Retiradas", "Devoluções"]
          : ["Ambiente", "Empréstimos", "Minutos de custódia"],
      rows: [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ...v]),
    };
  }
  if (kind === "audit") {
    const ev = await db.all(
      "SELECT a.*,m.request_id FROM audit a LEFT JOIN audit_meta m ON m.event_id=a.id ORDER BY a.at DESC",
    );
    const visible =
      u.role === "Secretaria"
        ? ev.filter((r) =>
            [
              "Retirada confirmada",
              "Devolução confirmada",
              "Ocorrência aberta",
              "Ocorrência resolvida",
              "Painel conferido",
              "Etiqueta conferida",
              "Empréstimo anulado",
            ].includes(r.action),
          )
        : ev;
    return {
      title: "Auditoria de operações",
      columns: ["Data", "Ação", "Responsável", "Recurso", "Correlação"],
      rows: visible
        .filter((r) => dateAllowed(r.at))
        .map((r) => [
          localDate(r.at),
          r.action,
          u.role === "Auditor" ? r.role : r.actor,
          r.target,
          r.request_id,
        ]),
    };
  }
  requireRole(u, "Administrador", "Secretaria");
  if (kind === "incidents") {
    const data = await db.all(
      "SELECT i.*,k.code,u.name FROM incidents i JOIN keys k ON k.id=i.key_id JOIN users u ON u.id=i.actor ORDER BY opened DESC",
    );
    return {
      title: "Divergências e ocorrências",
      columns: [
        "Chave",
        "Categoria",
        "Abertura",
        "Responsável",
        "Descrição",
        "Situação",
        "Resolução",
      ],
      rows: data
        .filter(
          (i) =>
            dateAllowed(i.opened) &&
            (!f.key || i.key_id === f.key) &&
            (!f.state || (f.state === "closed" ? !!i.closed : !i.closed)),
        )
        .map((i) => [
          i.code,
          i.type,
          localDate(i.opened),
          i.name,
          i.description,
          i.closed ? "Resolvida" : "Aberta",
          i.resolution || "—",
        ]),
    };
  }
  if (kind === "label-checks") {
    const checks = await db.all("SELECT c.*,u.name FROM label_checks c JOIN users u ON u.id=c.actor ORDER BY c.at DESC,c.id");
    return {
      title: "Conferência de etiquetas",
      columns: ["Data", "Responsável", "Gancho", "Chave esperada", "Ambientes", "Chave lida", "Resultado"],
      rows: checks.filter(c => dateAllowed(c.at)).map(c => [localDate(c.at), c.name, c.hook, c.expected_code, c.rooms, c.scanned_code, c.outcome]),
    };
  }
  if (kind === "checks") {
    const data = await db.all(
      "SELECT c.*,u.name FROM checks c JOIN users u ON u.id=c.actor ORDER BY at DESC",
    );
    const rows = [];
    for (const c of data.filter((v) => dateAllowed(v.at))) {
      const v = Object.values(JSON.parse(c.result));
      const event = await db.one(
        "SELECT detail FROM audit WHERE target=? AND action=?",
        [c.id, "Painel conferido"],
      );
      rows.push([
        localDate(c.at),
        c.shift,
        c.name,
        v.length,
        v.filter((s) => s === "presente").length,
        v.filter((s) => s === "ausente").length,
        event?.detail || "—",
      ]);
    }
    return {
      title: "Conferência física do painel",
      columns: [
        "Data",
        "Turno",
        "Responsável",
        "Ganchos verificados",
        "Presentes",
        "Ausentes",
        "Resultado da conferência",
      ],
      rows,
    };
  }
}
