import { dashboard } from "./dashboard.js";
import {
  S,
  el,
  esc,
  ic,
  icons,
  clock,
  day,
  teacher,
  admin,
  operator,
  opt,
  button,
  empty,
  badge,
  roomName,
  roomCodes,
  roomIcon,
  initials,
  api,
} from "./ui.js";
export const pages = {
  home: ["Visão geral", "layout-dashboard"],
  inventory: ["Quadro de chaves", "key-round"],
  history: ["Movimentações", "arrow-left-right"],
  issues: ["Ocorrências", "flag"],
  reports: ["Relatórios", "chart-no-axes-column-increasing"],
  records: ["Cadastros", "folders"],
  schedule: ["Grade de aulas", "calendar-days"],
  audit: ["Auditoria", "shield-check"],
  settings: ["Configurações", "settings-2"],
};
export function allowed() {
  return teacher()
    ? ["home", "inventory", "history", "schedule"]
    : S.data.user.role === "Auditor"
      ? ["home", "inventory", "history", "reports", "audit"]
      : [
          "home",
          "inventory",
          "history",
          "issues",
          "reports",
          ...(admin() ? ["records"] : []),
          "schedule",
          "audit",
          ...(admin() ? ["settings"] : []),
        ];
}
const navLink = (p) =>
  '<a class="nav-item ' +
  (S.page === p ? "active" : "") +
  '" href="#' +
  p +
  '" ' +
  (S.page === p ? 'aria-current="page"' : "") +
  ">" +
  ic(pages[p][1], 18) +
  esc(teacher() && p === "history" ? "Meu histórico" : pages[p][0]) +
  "</a>";
export function brand() {
  return (
    '<div class="brand-symbol">' +
    ic("key-round", 24) +
    '</div><div class="brand-name">Controle de&nbsp;Chaves<span>FATEC VOTORANTIM</span></div>'
  );
}
export function shell() {
  const u = S.data.user,
    allowedPages = allowed(),
    group = (label, items) => {
      const filtered = items.filter((a) => allowedPages.includes(a));
      return filtered.length
        ? '<div class="nav-group"><div class="nav-label">' +
            label +
            "</div>" +
            filtered.map(navLink).join("") +
            "</div>"
        : "";
    };
  const pending = S.data.keys.filter(
    (k) => k.late && (!teacher() || k.loan?.user_id === u.id),
  ).length;
  return (
    '<div class="layout"><aside class="sidebar" id="sidebar"><a class="brand" href="#home" aria-label="Controle de Chaves · Início">' +
    brand() +
    "</a><nav>" +
    group("ESPAÇO DE TRABALHO", ["home", "inventory", "history", "issues"]) +
    group("GESTÃO", ["reports", "records", "schedule", "audit", "settings"]) +
    '</nav><div class="side-bottom">' +
    button("Ajuda e suporte", "help", "circle-help", "side-help") +
    '<div class="unit-mark"><strong>Fatec</strong><span>Votorantim</span></div></div></aside><button class="shade" aria-label="Fechar menu" data-action="menu"></button><div class="workspace"><header class="topbar"><div class="crumb">' +
    button(
      "",
      "menu",
      "menu",
      "icon-btn mobile-menu",
      'aria-label="Abrir menu"',
    ) +
    ic("panels-top-left", 17) +
    "<span>Área de trabalho</span>" +
    ic("chevron-right", 13) +
    "<b>" +
    esc(pages[S.page][0]) +
    '</b></div><div class="top-right"><span class="connection"><i></i>' +
    (navigator.onLine ? "Online" : "Sem conexão") +
    "</span>" +
    button(
      "",
      "notifications",
      "bell",
      "icon-btn bell" + (pending ? " dot" : ""),
      'aria-label="Ver pendências"',
    ) +
    '<button class="account" data-action="account"><span class="avatar">' +
    esc(initials(u.name)) +
    "</span><span><b>" +
    esc(u.name) +
    "</b><small>" +
    esc(u.role) +
    "</small></span>" +
    ic("chevron-down", 14) +
    '</button></div></header><main id="main" tabindex="-1"></main><footer>Controle de Chaves <span>·</span> Fatec Votorantim' +
    (S.demo ? "<span> / </span> Ambiente de demonstração" : "") +
    "</footer></div></div>"
  );
}
const link = (s, p) =>
  '<a class="text-link" href="#' +
  p +
  '">' +
  esc(s) +
  ic("arrow-up-right", 14) +
  "</a>";
export function keyCard(k) {
  return (
    '<button class="key-card" data-action="key" data-id="' +
    esc(k.id) +
    '"><span class="key-top"><span class="room-icon">' +
    ic(roomIcon(k), 19) +
    "</span>" +
    badge(k.status) +
    "</span><strong>" +
    esc(roomName(k)) +
    '</strong><span class="key-meta">' +
    esc(k.code) +
    "<i>·</i>" +
    esc(k.rooms[0]?.block || k.hook) +
    "</span></button>"
  );
}
function activity() {
  const events = S.data.loans
    .filter((l) => !l.voided)
    .flatMap((l) => [
      {
        at: l.checkout,
        name: l.holder,
        kind: "Retirada",
        code: l.code,
        rooms: l.rooms,
      },
      ...(l.returned
        ? [
            {
              at: l.returned,
              name: l.holder,
              kind: "Devolução",
              code: l.code,
              rooms: l.rooms,
            },
          ]
        : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  return events.length
    ? events
        .map(
          (m) =>
            '<div class="activity"><div class="event-icon ' +
            (m.kind === "Retirada" ? "out" : "in") +
            '">' +
            ic(
              m.kind === "Retirada" ? "arrow-up-right" : "arrow-down-left",
              15,
            ) +
            "</div><div><b>" +
            m.kind +
            " de chave</b><p>" +
            esc(m.name) +
            "</p><small>" +
            esc(m.code) +
            " · " +
            esc(m.rooms) +
            '</small></div><time title="' +
            esc(clock(m.at, true)) +
            '">' +
            clock(m.at) +
            "</time></div>",
        )
        .join("")
    : empty("Ainda não há movimentações");
}
function metrics() {
  const k = S.data.keys,
    total = k.length;
  const stats = [
    ["Total de chaves", total, "key-round", "slate", "No inventário"],
    [
      "Disponíveis",
      k.filter((x) => x.status === "Disponível").length,
      "circle-check",
      "green",
      "Prontas para retirada",
    ],
    [
      "Em uso",
      k.filter((x) => x.loan).length,
      "arrow-left-right",
      "blue",
      "Sob responsabilidade",
    ],
    [
      "Bloqueadas",
      k.filter((x) => x.status === "Bloqueada").length,
      "lock-keyhole",
      "amber",
      "Com restrição de uso",
    ],
  ];
  return (
    '<div class="metrics">' +
    stats
      .map(
        ([name, val, icon, color, desc], i) =>
          '<button class="metric" data-action="metric" data-filter="' +
          ["Todas", "Disponível", "Em uso", "Bloqueada"][i] +
          '"><span class="metric-top"><span class="metric-icon ' +
          color +
          '">' +
          ic(icon, 17) +
          "</span><span>" +
          name +
          "</span></span><strong>" +
          val +
          "</strong><small>" +
          desc +
          "</small></button>",
      )
      .join("") +
    "</div>"
  );
}
export function home() {
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(S.data.serverTime));
  const own = S.data.keys.filter((k) => k.loan?.user_id === S.data.user.id);
  const hero = `<section class="dashboard-heading hero"><div><h1>${teacher() ? "Olá, " + esc(S.data.user.name.split(" ")[0]) + "!" : "Painel de chaves"}</h1><p>${teacher() ? "Acompanhe suas retiradas e devoluções." : "Acompanhe as movimentações e a disponibilidade da unidade."}</p></div>${operator() || teacher() ? button(teacher() ? "Ler QR Code" : "Registrar movimentação", "move", "scan-line", "dash-action") : link("Consultar histórico", "history")}</section>`;
  return (
    '<div class="page-context"><span>' +
    ic("building-2", 15) +
    " Unidade Votorantim</span><span>" +
    ic("calendar-days", 15) +
    esc(date[0].toUpperCase() + date.slice(1)) +
    "</span></div>" +
    hero +
    (teacher()
      ? '<section class="panel mine"><div class="panel-title"><h2>Minhas chaves em uso</h2></div><div class="cards">' +
        (own.map(keyCard).join("") ||
          empty(
            "Você está sem chaves em uso",
            "Leia a etiqueta do gancho para iniciar uma retirada.",
          )) +
        "</div></section>"
      : "") +
    dashboard() +
    (teacher() ? "" : metrics()) +
    '<div class="home-grid"><section class="panel board"><div class="panel-title"><div><div class="section-label"><i></i> INVENTÁRIO</div><h2>Quadro de chaves</h2></div>' +
    link("Ver quadro", "inventory") +
    "</div>" +
    boardControls(false) +
    '<div id="board-results" class="cards"></div></section><section class="panel recent"><div class="panel-title"><div><div class="section-label"><i></i> REGISTROS</div><h2>Atividade recente</h2></div><span class="quiet-icon">' +
    ic("history", 21) +
    '</span></div><div class="events">' +
    activity() +
    '</div><div class="panel-foot">' +
    link("Ver movimentações", "history") +
    "</div></section></div>"
  );
}
function boardControls(full) {
  return (
    '<div class="board-tools"><label class="search">' +
    ic("search", 16) +
    '<input id="key-search" aria-label="Buscar chave, sala ou docente" value="' +
    esc(S.search) +
    '" placeholder="Buscar chave, sala ou docente"></label><label class="filter">' +
    ic("sliders-horizontal", 15) +
    '<select id="key-filter" aria-label="Filtrar por situação">' +
    ["Todas", "Disponível", "Em uso", "Bloqueada", "Pendente"]
      .map((v) => opt(v, v === "Todas" ? "Situação" : v, S.filter))
      .join("") +
    "</select></label></div>"
  );
}
export function fillBoard() {
  const node = el("#board-results");
  if (!node) return;
  const norm = (v) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const keys = S.data.keys.filter(
    (k) =>
      [
        k.code,
        roomName(k),
        roomCodes(k),
        k.hook,
        k.loan?.holder || "",
        k.rooms[0]?.block || "",
      ].some((x) => norm(x).includes(norm(S.search))) &&
      (S.filter === "Todas" ||
        (S.filter === "Pendente"
          ? k.late
          : S.filter === "Em uso"
            ? !!k.loan
            : k.status === S.filter)),
  );
  const selected = S.page === "home" ? keys.slice(0, 6) : keys;
  node.innerHTML =
    selected.map(keyCard).join("") ||
    empty(
      "Nenhuma chave encontrada",
      "Experimente outro código, sala ou situação.",
    );
  if (el("#key-count")) el("#key-count").textContent = keys.length + " chaves";
  icons();
}
export function pageHead(title, sub, action = "") {
  return (
    '<div class="page-head"><div><h1>' +
    esc(title) +
    "</h1><p>" +
    esc(sub) +
    "</p></div>" +
    action +
    "</div>"
  );
}
export function inventoryPage() {
  return (
    pageHead(
      "Quadro de chaves",
      "Consulte os ambientes, a disponibilidade e o local de guarda.",
      operator() ? '<div class="actions">' + button("Conferir etiqueta", "check-label", "qr-code") + button("Conferir painel", "check", "clipboard-check") + "</div>" : "",
    ) +
    '<section class="panel standalone"><div class="panel-title"><h2>Inventário da unidade</h2><span id="key-count"></span></div>' +
    boardControls(true) +
    '<div class="cards all-cards" id="board-results"></div></section>'
  );
}
export const table = (headers, rows) =>
  rows.length
    ? '<div class="table-wrap"><table><thead><tr>' +
      headers.map((s) => "<th>" + esc(s) + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map(
          (row) =>
            "<tr>" + row.map((c) => "<td>" + c + "</td>").join("") + "</tr>",
        )
        .join("") +
      "</tbody></table></div>"
    : empty("Nenhum registro encontrado");
const rowButton = (s, action, id) =>
  button(s, action, "", "small-btn", 'data-id="' + esc(id) + '"');
export function grade() {
  const days = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return (
    pageHead(
      teacher() ? "Meu horário" : "Grade de aulas",
      "Aulas previstas por docente, ambiente e período de vigência.",
      admin()
        ? button("Cadastrar aula", "edit-schedule", "plus", "primary")
        : "",
    ) +
    '<section class="panel standalone">' +
    (admin()
      ? '<div class="toolbar">' +
        button("Importar CSV", "import-grade", "file-up") +
        "</div>"
      : "") +
    table(
      [
        "Dia e horário",
        "Disciplina / turma",
        "Ambiente",
        "Docente",
        "Vigência",
        ...(admin() ? [""] : []),
      ],
      S.data.schedules.map((s) => [
        "<b>" +
          days[s.weekday] +
          "</b><small>" +
          s.start_time +
          " – " +
          s.end_time +
          "</small>",
        esc(s.subject) +
          "<small>" +
          esc(s.class_name) +
          "</small>" +
          s.exceptions
            .map(
              (e) =>
                "<small>" +
                esc(e.date) +
                " · " +
                esc(
                  e.mode === "Cancelar"
                    ? "Cancelada"
                    : "Alteração " +
                        [e.substitute, e.new_room].filter(Boolean).join(" / "),
                ) +
                "</small>",
            )
            .join(""),
        esc(s.room),
        esc(s.teacher),
        esc(s.valid_from) + "<small>até " + esc(s.valid_to) + "</small>",
        ...(admin() ? [rowButton("Editar", "edit-schedule", s.id)] : []),
      ]),
    ) +
    "</section>"
  );
}
export function records() {
  const tab = S.tab,
    src =
      tab === "keys"
        ? S.data.keys
        : tab === "people"
          ? S.data.people
          : S.data.rooms;
  const item = tab === "keys" ? "key" : tab === "people" ? "user" : "room";
  const heads =
    tab === "keys"
      ? ["Código", "Ambientes", "Gancho", "Situação", ""]
      : tab === "people"
        ? ["Nome", "E-mail", "Perfil", "Vínculo", ""]
        : ["Ambiente", "Descrição", "Bloco", "Situação", ""];
  const rows = src.map((o) => [
    ...(tab === "keys"
      ? [esc(o.code), esc(roomCodes(o)), esc(o.hook), badge(o.status)]
      : tab === "people"
        ? [
            esc(o.name),
            esc(o.email),
            esc(o.role),
            o.active ? "Ativo" : "Inativo",
          ]
        : [
            esc(o.code),
            esc(o.name),
            esc(o.block),
            o.active ? "Ativo" : "Inativo",
          ]),
    rowButton("Editar", "edit-" + item, o.id),
  ]);
  return (
    pageHead(
      "Cadastros",
      "Gerencie o inventário físico e os vínculos da unidade.",
      button(
        "Adicionar " +
          { keys: "chave", people: "pessoa", rooms: "ambiente" }[tab],
        "edit-" + item,
        "plus",
        "primary",
      ),
    ) +
    '<section class="panel standalone"><div class="toolbar"><div class="tabs">' +
    [
      ["keys", "Chaves"],
      ["rooms", "Ambientes"],
      ["people", "Pessoas"],
    ]
      .map(
        ([id, name]) =>
          '<button data-action="record-tab" aria-pressed="' + (tab === id) + '" data-tab="' +
          id +
          '" class="' +
          (tab === id ? "selected" : "") +
          '">' +
          name +
          "</button>",
      )
      .join("") +
    "</div>" +
    (tab === "people"
      ? button("Importar docentes", "import-people", "file-up")
      : "") +
    "</div>" +
    table(heads, rows) +
    "</section>"
  );
}
export function issues() {
  const data = S.data.incidents;
  return (
    pageHead(
      "Ocorrências",
      "Registre perdas, danos e divergências na conferência física.",
      button("Abrir ocorrência", "new-issue", "plus", "primary"),
    ) +
    '<section class="panel standalone">' +
    table(
      ["Chave", "Categoria", "Descrição", "Abertura", "Situação", ""],
      data.map((i) => [
        esc(i.code),
        esc(i.type),
        esc(i.description) +
          (i.closed ? "<small>" + esc(i.resolution) + "</small>" : ""),
        clock(i.opened, true),
        badge(i.closed ? "Encerrado" : "Em aberto"),
        i.closed ? "" : rowButton("Resolver", "resolve-issue", i.id),
      ]),
    ) +
    "</section>"
  );
}
export async function auditView() {
  const rows = await api("audit");
  if (S.page !== "audit") return;
  el("#main").innerHTML =
    pageHead(
      "Auditoria",
      "Consulte os registros de acesso, alterações de cadastros e operações de custódia.",
    ) +
    '<section class="panel standalone"><label class="search">' +
    ic("search", 16) +
    '<input id="audit-search" placeholder="Buscar ação, pessoa ou recurso" aria-label="Buscar na auditoria"></label><div id="audit-rows"></div></section>';
  const fill = () => {
    const q = el("#audit-search").value.toLocaleLowerCase();
    el("#audit-rows").innerHTML = table(
      ["Data", "Ação", "Responsável", "Detalhes"],
      rows
        .filter((x) =>
          [x.action, x.actor, x.target, x.detail]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
        .map((x) => [
          clock(x.at, true),
          esc(x.action),
          esc(x.actor || "Sistema"),
          esc(x.detail || x.target) +
            ((x.previous && x.previous !== "{}") ||
            (x.current_value && x.current_value !== "{}")
              ? "<details><summary>Ver alteração</summary><small>Antes · " +
                esc(x.previous) +
                "</small><small>Depois · " +
                esc(x.current_value) +
                "</small></details>"
              : ""),
        ]),
    );
  };
  fill();
  el("#audit-search").oninput = fill;
  icons();
}
export function settings() {
  return (
    pageHead("Configurações", "Regras de custódia para a unidade Votorantim.") +
    '<section class="panel standalone narrow"><h2>Limites de empréstimo</h2><dl><dt>Chaves simultâneas por docente</dt><dd>' +
    S.data.settings.max_keys +
    "</dd><dt>Prazo para devolução</dt><dd>" +
    S.data.settings.hours +
    " horas</dd></dl>" +
    button("Alterar regras", "edit-settings", "sliders-horizontal") +
    "</section>"
  );
}
export function reportPage() {
  const r = S.report;
  const filter = (name, label, opts) =>
    "<label>" +
    label +
    '<select name="' +
    name +
    '">' +
    opt("", "Todos") +
    opts +
    "</select></label>";
  const kind = S.page === "reports" ? r.kind || "custody" : "custody",
    custody = kind === "custody",
    aggregate = ["room-use", "daily"].includes(kind);
  const types = [
    ["custody", "Histórico de custódia"],
    ["daily", "Operações por dia"],
    ["room-use", "Uso por ambiente"],
    ...(operator()
      ? [
          ["incidents", "Divergências e ocorrências"],
          ["checks", "Conferência do painel"],
          ["label-checks", "Conferência de etiquetas"],
        ]
      : []),
    ["audit", "Auditoria de operações"],
  ];
  const controls =
    '<form id="report-filters" class="report-filters">' +
    (S.page === "reports"
      ? '<label>Relatório<select name="kind" id="report-kind">' +
        types.map(([v, l]) => opt(v, l, kind)).join("") +
        "</select></label>"
      : "") +
    ((custody || aggregate) && !teacher() && S.data.user.role !== "Auditor"
      ? filter(
          "person",
          "Docente",
          S.data.people
            .filter((u) => u.role === "Docente")
            .map((u) => opt(u.id, u.name, r.person))
            .join(""),
        )
      : "") +
    (custody || aggregate || kind === "incidents"
      ? filter(
          "key",
          "Chave",
          S.data.keys.map((k) => opt(k.id, k.code, r.key)).join(""),
        )
      : "") +
    (custody || aggregate
      ? filter(
          "room",
          "Ambiente",
          S.data.rooms.map((k) => opt(k.code, k.code, r.room)).join(""),
        )
      : "") +
    (custody || kind === "incidents"
      ? filter(
          "state",
          "Situação",
          [
            ["open", "Em aberto"],
            ["closed", "Encerrado"],
            ...(custody
              ? [
                  ["late", "Acima do prazo"],
                  ["assisted", "Assistida"],
                  ["contingency", "Contingência"],
                  ["void", "Anulado"],
                ]
              : []),
          ]
            .map(([v, l]) => opt(v, l, r.state))
            .join(""),
        )
      : "") +
    ["from", "to"]
      .map(
        (k, i) =>
          "<label>" +
          ["De", "Até"][i] +
          '<input type="date" name="' +
          k +
          '" value="' +
          esc(r[k] || "") +
          '"></label>',
      )
      .join("") +
    '<button class="secondary" type="submit">' +
    ic("list-filter", 16) +
    "Aplicar</button></form>";
  return (
    pageHead(
      S.page === "reports"
        ? "Relatórios"
        : teacher()
          ? "Meu histórico"
          : "Movimentações",
      "Consulte o histórico de custódia e filtre os registros por período.",
      S.data.user.role !== "Auditor" || (!custody && S.page === "reports")
        ? button("Exportar", "export", "download")
        : "",
    ) +
    '<section class="panel standalone">' +
    controls +
    '<div id="results"></div></section>'
  );
}
let reportSeq = 0;
export async function loadReport() {
  const seq = ++reportSeq;
  const { rows, total, columns } = await api(
    "reports?" +
      new URLSearchParams({
        ...S.report,
        kind: S.page === "reports" ? S.report.kind || "custody" : "custody",
        report: S.page === "reports" ? "1" : "0",
        page: S.num,
      }),
  );
  if (!el("#results") || seq !== reportSeq) return;
  el("#results").innerHTML =
    (columns
      ? table(
          columns,
          rows.map((row) => row.map(esc)),
        )
      : table(
          [
            "Chave / ambiente",
            "Docente",
            "Retirada",
            "Devolução",
            "Situação",
            "",
          ],
          rows.map((l) => [
            "<b>" + esc(l.code) + "</b><small>" + esc(l.rooms) + "</small>",
            esc(l.holder),
            clock(l.checkout, true),
            l.returned ? clock(l.returned, true) : "—",
            badge(
              l.voided
                ? "Anulado"
                : l.returned
                  ? "Encerrado"
                  : l.due < S.data.serverTime
                    ? "Pendente"
                    : "Em aberto",
            ),
            rowButton("Detalhes", "loan", l.id),
          ]),
        )) +
    '<div class="pager"><span>' +
    total +
    " registros · Página " +
    (S.num + 1) +
    "</span>" +
    button("Anterior", "prev", "", "small-btn", S.num ? "" : "disabled") +
    button(
      "Próxima",
      "next",
      "",
      "small-btn",
      (S.num + 1) * 25 >= total ? "disabled" : "",
    ) +
    "</div>";
  S.reportRows = rows;
  icons();
}
