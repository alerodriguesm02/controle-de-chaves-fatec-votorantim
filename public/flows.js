import {
  S,
  el,
  esc,
  ic,
  icons,
  clock,
  teacher,
  admin,
  operator,
  opt,
  options,
  input,
  select,
  area,
  button,
  badge,
  empty,
  roomName,
  roomCodes,
  api,
  refresh,
  close,
  onClose,
  toast,
  modal,
  formHtml,
  bind,
  notifyError,
  updated,
} from "./ui.js";
const personOptions = (id, active = true) =>
  S.data.people
    .filter((u) => u.role === "Docente" && (!active || u.active))
    .map((u) => opt(u.id, u.name, id))
    .join("");
const keyOptions = (id) =>
  S.data.keys.map((k) => opt(k.id, k.code + " · " + roomCodes(k), id)).join("");
const roomOptions = (id) =>
  S.data.rooms
    .filter((r) => r.active || r.id === id)
    .map((r) => opt(r.id, r.code + " · " + r.name, id))
    .join("");
const facts = (arr) =>
  "<dl>" +
  arr
    .filter((x) => x[1] !== null && x[1] !== undefined && x[1] !== "")
    .map(([l, v]) => "<dt>" + esc(l) + "</dt><dd>" + esc(v) + "</dd>")
    .join("") +
  "</dl>";
async function done(msg) {
  await refresh();
  close();
  updated();
  toast(msg);
}
function confirmWrite(op, title, fields, initial = {}, transform = (b) => b) {
  modal(title, formHtml(fields, "Revisar"));
  bind(async (b, form) => {
    const payload = { ...initial, ...transform(b, form) };
    const summary = Array.from(form.querySelectorAll("input,select,textarea"))
      .filter((n) => n.name && n.type !== "password" && n.type !== "hidden")
      .map((n) => [
        n.closest("label")?.firstChild?.textContent?.trim() || n.name,
        n.type === "checkbox"
          ? n.checked
            ? "Sim"
            : "Não"
          : n.tagName === "SELECT"
            ? Array.from(n.selectedOptions)
                .map((o) => o.textContent)
                .join(", ")
            : n.value,
      ]);
    modal(
      "Confirmar alteração",
      formHtml(facts(summary), "Confirmar e salvar"),
    );
    bind(async () => {
      await api("manage/" + op, payload);
      await done("Alteração registrada.");
    });
  });
}
export function keyDetail(id) {
  const k = S.data.keys.find((k) => k.id === id);
  modal(
    roomName(k),
    '<div class="detail-badge">' +
      badge(k.status) +
      "</div>" +
      facts([
        ["Chave", k.code],
        ["Ambientes", roomCodes(k)],
        ["Local de guarda", k.hook],
        ["Tipo", k.kind],
        ["Condição", k.condition],
        ["Responsável", k.loan?.holder],
        ["Retirada", k.loan?.checkout && clock(k.loan.checkout, true)],
        ["Prazo", k.loan?.due && clock(k.loan.due, true)],
      ]) +
      '<div class="actions">' +
      (admin()
        ? button(
            "Etiqueta QR",
            "label",
            "qr-code",
            "secondary",
            'data-id="' + esc(id) + '"',
          )
        : "") +
      ((operator() || teacher()) && k.condition === "Ativa"
        ? button(
            "Registrar movimentação",
            "move",
            "scan-line",
            "primary",
            operator() ? 'data-id="' + esc(id) + '"' : "",
          )
        : "") +
      "</div>",
  );
}
export function startMovement(keyId = "") {
  const k = S.data.keys.find((x) => x.id === keyId);
  modal(
    teacher() ? "Identificar chave" : "Registrar movimentação",
    formHtml(
      '<div class="scan-box"><span class="scan-icon">' +
        ic("scan-qr-code", 37) +
        "</span><div><b>Leia o QR do gancho</b><small>Aponte a câmera para a etiqueta da chave.</small></div>" +
        button("Abrir câmera", "camera", "", "secondary") +
        '</div><div id="camera-view"></div><div class="divider-label">ou use o código da etiqueta</div>' +
        input(
          "Código da chave",
          "identifier",
          k?.code || "",
          "text",
          'required placeholder="Ex. CH-001" autocomplete="off" maxlength="180"',
        ) +
        (operator()
          ? select(
              "Docente responsável",
              "person",
              opt("", "Selecione para retirada") +
                personOptions(k?.loan?.user_id),
              "",
            ) +
            '<p class="hint">Na devolução, o sistema identifica quem retirou a chave.</p>'
          : ""),
      "Identificar chave",
      "arrow-right",
    ),
  );
  bind(async (data) => {
    const info = await api("keys/resolve", data);
    confirmMovement(data, info);
  });
}
let decoderPromise;
export async function camera() {
  const view = el("#camera-view"),
    form = el("#modal-form");
  if (!view || !form) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    view.textContent =
      form.elements.expected_key ? "Câmera indisponível. Use um leitor de QR." : "Câmera indisponível. Digite o código da etiqueta abaixo.";
    return;
  }
  const btn = el("[data-action=camera]");
  btn.disabled = true;
  let stream,
    active = true,
    raf;
  const stop = () => {
    active = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
  };
  onClose(stop);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    if (!active) {
      stop();
      return;
    }
    if (!window.jsQR) {
      decoderPromise ??= new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "/vendor/jsqr.js";
        s.onload = res;
        s.onerror = () => {
          decoderPromise = null;
          rej(Error());
        };
        document.head.append(s);
      });
      await decoderPromise;
    }
    if (!active) {
      stop();
      return;
    }
    view.innerHTML =
      '<video muted playsinline autoplay></video><p class="hint">Mantenha a etiqueta dentro do quadro.</p>';
    const video = view.querySelector("video");
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last = 0;
    function scan(t) {
      if (!active) return;
      if (t - last > 120 && video.videoWidth) {
        last = t;
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = (canvas.width * video.videoHeight) / video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(pixels.data, pixels.width, pixels.height);
        if (code) {
          form.elements.identifier.value = code.data;
          stop();
          view.textContent = form.elements.expected_key ? "Etiqueta lida. Confira o gancho e registre." : "Etiqueta lida. Confira o docente e prossiga.";
          btn.disabled = false;
          if (teacher() || form.elements.person?.value) form.requestSubmit();
          return;
        }
      }
      raf = requestAnimationFrame(scan);
    }
    raf = requestAnimationFrame(scan);
  } catch {
    stop();
    if (view.isConnected) {
      view.textContent =
        form.elements.expected_key ? "Verifique a permissão da câmera ou use um leitor de QR." : "Não foi possível abrir a câmera. Verifique a permissão ou digite o código abaixo.";
      btn.disabled = false;
    }
  }
}
function confirmMovement(data, k) {
  const out = k.action === "checkout",
    word = out ? "retirada" : "devolução",
    requestKey = crypto.randomUUID();
  let context = "";
  if (out) {
    if (k.options.length)
      context = select(
        "Atividade",
        "schedule",
        (k.options.length > 1 ? opt("", "Selecione uma atividade") : "") +
          k.options
            .map((v) => opt(v.id, v.subject + " · " + v.class_name))
            .join("") +
          opt("other", "Outra finalidade"),
      );
    context += area(
      "Finalidade do uso",
      "purpose",
      "",
      'maxlength="300" placeholder="Ex. Preparação de aula"' +
        (!k.options.length ? " required" : ""),
    );
  }
  const assisted = operator()
    ? select("Origem do registro", "origin", opt("assisted", "Atendimento assistido") + opt("contingency", "Contingência após indisponibilidade")) +
      area(
        "Justificativa do registro assistido",
        "reason",
        "",
        'required maxlength="600" placeholder="Por que a secretaria está registrando?"',
      ) +
      input(
        "Horário físico informado (São Paulo)",
        "declared",
        "",
        "datetime-local",
        "",
      )
    : "";
  modal(
    "Confirmar " + word,
    formHtml(
      `<div class="notice movement-${out ? "out" : "in"}">` +
        ic("key-round", 20) +
        "<div><b>" +
        esc(k.code) +
        " · " +
        esc(k.rooms) +
        "</b><small>" +
        esc(k.hook) +
        " · " +
        (out ? "Disponível" : "Em uso") +
        "</small></div></div>" +
        facts([
          ["Docente", k.name],
          ["Retirada", k.checkout && clock(k.checkout, true)],
        ]) +
        context +
        assisted +
        '<p class="hint">' +
        (out
          ? "Confirme ao receber a chave física."
          : "Recoloque a chave no gancho antes de confirmar.") +
        "</p>",
      "Confirmar " + word,
      "check",
    ),
  );
  const f = el("#modal-form");
  if (f.elements.origin) {
    f.elements.origin.onchange = () => {
      f.elements.declared.required = f.elements.origin.value === "contingency";
    };
  }
  if (k.options.length && out) {
    function sync() {
      const other = f.elements.schedule.value === "other";
      f.elements.purpose.closest("label").hidden = !other;
      f.elements.purpose.required = other;
    }
    f.elements.schedule.onchange = sync;
    sync();
  }
  let confirmedBody;
  bind(async (b) => {
    const payload = {
      ...data,
      ...b,
      person: k.person,
      version: k.version,
      action: k.action,
      loan_id: k.loan_id,
    };
    if (payload.schedule === "other") delete payload.schedule;
    if (payload.declared)
      payload.declared = new Date(payload.declared + "-03:00").toISOString();
    confirmedBody ??= payload;
    let result;
    try {
      result = await api("loans/confirm", confirmedBody, {
        "Idempotency-Key": requestKey,
      });
    } catch (err) {
      if (err.status && err.status < 500) confirmedBody = null;
      throw err;
    }
    modal(
      out ? "Retirada registrada" : "Devolução registrada",
      `<div class="receipt"><div class="movement-${out ? "out" : "in"}">` +
        ic("check", 30) +
        "</div><h3>" +
        esc(result.code) +
        "</h3><p>" +
        esc(result.rooms) +
        " · " +
        esc(result.name) +
        "</p><small>" +
        clock(result.at, true) +
        ' · Horário de São Paulo</small></div><div class="actions">' +
        button("Concluir", "close", "check", "primary") +
        "</div>",
    );
    await refresh();
    updated();
  });
}
export function edit(kind, id) {
  const d = S.data;
  if (kind === "user") {
    const u = d.people.find((x) => x.id === id) || {};
    confirmWrite(
      "user",
      id ? "Editar pessoa" : "Cadastrar pessoa",
      input("Nome", "name", u.name) +
        input("E-mail institucional", "email", u.email, "email") +
        input("Identificador institucional", "registration", u.registration) +
        select(
          "Perfil",
          "role",
          options(
            ["Docente", "Secretaria", "Administrador", "Auditor"],
            u.role,
          ),
        ) +
        input(
          id ? "Nova senha (opcional)" : "Senha inicial",
          "password",
          "",
          "password",
          (id ? "" : "required ") +
            'minlength="10" maxlength="160" autocomplete="new-password"',
        ) +
        input(
          "Fim do vínculo (opcional)",
          "valid_until",
          u.valid_until,
          "date",
          "",
        ) +
        select(
          "Vínculo",
          "active",
          opt("yes", "Ativo", u.active === 0 ? "no" : "yes") +
            opt("no", "Inativo", u.active === 0 ? "no" : "yes"),
        ) +
        '<label class="checkline"><input type="checkbox" name="master" ' +
        (u.master ? "checked" : "") +
        "> Autorizar retirada de chaves mestras</label>",
      { id },
      (b) => ({ ...b, active: b.active === "yes", master: b.master === "on" }),
    );
  } else if (kind === "room") {
    const r = d.rooms.find((x) => x.id === id) || {};
    confirmWrite(
      "room",
      id ? "Editar ambiente" : "Cadastrar ambiente",
      input("Código", "code", r.code) +
        input("Descrição", "name", r.name) +
        input("Bloco", "block", r.block) +
        select(
          "Situação",
          "active",
          options(["Ativo", "Inativo"], r.active === 0 ? "Inativo" : "Ativo"),
        ),
      { id },
      (b) => ({ ...b, active: b.active === "Ativo" }),
    );
  } else if (kind === "key") {
    const k = d.keys.find((x) => x.id === id) || {};
    confirmWrite(
      "key",
      id ? "Editar chave" : "Cadastrar chave",
      input(
        "Código imutável",
        "code",
        k.code,
        "text",
        id ? "readonly" : "required",
      ) +
        input("Gancho", "hook", k.hook) +
        select(
          "Tipo físico",
          "kind",
          options(["Individual", "Molho", "Mestra"], k.kind),
        ) +
        select(
          "Condição",
          "condition",
          options(
            ["Ativa", "Manutenção", "Extraviada", "Inativa"],
            k.condition,
          ),
        ) +
        '<fieldset><legend>Ambientes atendidos</legend><div class="checks-list">' +
        d.rooms
          .map(
            (r) =>
              '<label class="checkline"><input type="checkbox" name="rooms" value="' +
              esc(r.id) +
              '" ' +
              (k.rooms?.some((x) => x.id === r.id) ? "checked" : "") +
              ">" +
              esc(r.code) +
              " · " +
              esc(r.name) +
              "</label>",
          )
          .join("") +
        "</div></fieldset>",
      { id },
      (b, form) => ({ ...b, rooms: new FormData(form).getAll("rooms") }),
    );
  } else if (kind === "schedule") {
    const s = d.schedules.find((x) => x.id === id) || {};
    confirmWrite(
      "schedule",
      id ? "Editar aula" : "Cadastrar aula",
      select("Docente", "user_id", personOptions(s.user_id)) +
        select("Ambiente", "room_id", roomOptions(s.room_id)) +
        input("Disciplina", "subject", s.subject) +
        input("Turma", "class_name", s.class_name) +
        select(
          "Dia da semana",
          "weekday",
          ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
            .map((v, i) => opt(i, v, s.weekday ?? 1))
            .join(""),
        ) +
        '<div class="form-pair">' +
        input("Início", "start_time", s.start_time, "time") +
        input("Fim", "end_time", s.end_time, "time") +
        '</div><div class="form-pair">' +
        input("Vigência inicial", "valid_from", s.valid_from, "date") +
        input("Vigência final", "valid_to", s.valid_to, "date") +
        "</div>" +
        (id
          ? button(
              "Registrar exceção de data",
              "exception",
              "calendar-days",
              "secondary",
              'data-id="' + esc(id) + '"',
            )
          : "") +
        (id
          ? button(
              "Desativar aula",
              "remove-schedule",
              "",
              "danger-link",
              'data-id="' + esc(id) + '"',
            )
          : "") +
        (s.batch
          ? button(
              "Desfazer importação deste lote",
              "undo-import",
              "",
              "danger-link",
              'data-id="' + esc(s.batch) + '"',
            )
          : ""),
      { id },
    );
  } else if (kind === "settings") {
    confirmWrite(
      "settings",
      "Alterar regras",
      input(
        "Máximo de chaves por docente",
        "max_keys",
        d.settings.max_keys,
        "number",
        'required min="1" max="100"',
      ) +
        input(
          "Prazo em horas",
          "hours",
          d.settings.hours,
          "number",
          'required min="1" max="720"',
        ),
    );
  }
}
export function label(id) {
  const k = S.data.keys.find((v) => v.id === id);
  modal(
    "Etiqueta de " + k.code,
    formHtml(
      select(
        "Operação",
        "mode",
        (k.label ? opt("reprint", "Visualizar e imprimir") : "") +
          opt("rotate", "Emitir nova etiqueta") +
          (k.label ? opt("revoke", "Revogar etiqueta atual") : ""),
      ) + area("Justificativa da alteração", "reason", "", 'maxlength="500"'),
      "Continuar",
    ),
  );
  const f = el("#modal-form");
  function sync() {
    f.elements.reason.closest("label").hidden =
      f.elements.mode.value === "reprint";
    f.elements.reason.required = f.elements.mode.value !== "reprint";
  }
  f.elements.mode.onchange = sync;
  sync();
  bind(async (b) => {
    async function execute() {
      const out = await api("manage/label", { ...b, id });
      await refresh();
      updated();
      if (out.image) {
        modal(
          "Etiqueta da chave",
          '<div class="print-label"><b>FATEC VOTORANTIM</b><img src="' +
            out.image +
            '" alt="QR Code da chave ' +
            esc(k.code) +
            '"><strong>' +
            esc(k.code) +
            "</strong><span>" +
            esc(roomCodes(k)) +
            " · " +
            esc(k.hook) +
            '</span><small>Suporte na secretaria</small></div><div class="actions">' +
            button("Imprimir", "print", "printer", "primary") +
            "</div>",
        );
      } else {
        close();
        toast("Etiqueta revogada.");
      }
    }
    if (b.mode === "reprint") await execute();
    else {
      modal(
        "Confirmar alteração da etiqueta",
        formHtml(
          "<p>A etiqueta anterior deixará de identificar " +
            esc(k.code) +
            ".</p>",
          "Confirmar",
        ),
      );
      bind(execute);
    }
  });
}
export function incident(id) {
  id
    ? confirmWrite(
        "resolve-incident",
        "Resolver ocorrência",
        area("Como a ocorrência foi resolvida?", "resolution"),
        { id },
      )
    : confirmWrite(
        "incident",
        "Abrir ocorrência",
        select("Chave", "key_id", keyOptions()) +
          select(
            "Categoria",
            "type",
            options([
              "Divergência física",
              "Perda",
              "Dano",
              "Etiqueta inválida",
              "Outra",
            ]),
          ) +
          area("Descrição", "description"),
      );
}
export function checkLabel() {
  if (!S.data.keys.length) return modal("Conferir etiqueta", empty("Cadastre uma chave antes da conferência"));
  const checkId = crypto.randomUUID();
  modal("Conferir etiqueta", formHtml(
    select("Gancho e chave esperados", "expected_key", opt("", "Selecione o gancho físico") +
      S.data.keys.map(k => opt(k.id, k.hook + " · " + k.code + " · " + roomCodes(k))).join("")) +
    '<p class="hint">Confira os ambientes e leia a etiqueta fixada nesse gancho. Uma divergência abre uma ocorrência.</p>' +
    button("Abrir câmera", "camera", "scan-line") +
    '<div id="camera-view" aria-live="polite"></div>' +
    input("Leitura do QR", "identifier", "", "text", 'required autocomplete="off" maxlength="180" placeholder="Use a câmera ou um leitor de QR"'),
    "Registrar conferência", "clipboard-check"));
  bind(async b => {
    const result = await api("manage/check-label", { ...b, check_id: checkId });
    const key = S.data.keys.find(k => k.id === b.expected_key);
    await refresh();
    updated();
    modal("Resultado da conferência", facts([
      ["Gancho", key.hook], ["Chave esperada", key.code], ["Ambientes", roomCodes(key)],
      ["Chave lida", result.scanned], ["Resultado", result.outcome],
      ["Ocorrência", result.outcome === "Conferida" ? "" : "Aberta para tratamento"],
    ]) + '<div class="actions">' + button("Conferir outra etiqueta", "check-label") +
      button("Concluir", "close", "check", "primary") + "</div>");
  });
}
export function check() {
  if (!S.data.keys.length) {
    modal("Conferir painel", empty("Cadastre chaves antes da conferência"));
    return;
  }
  confirmWrite(
    "check",
    "Conferência física",
    select("Turno", "shift", options(["Manhã", "Tarde", "Noite"])) +
      '<p class="hint">Confira cada gancho. Uma divergência gera uma ocorrência para a secretaria.</p><div class="check-rows">' +
      S.data.keys
        .map((k) =>
          select(
            k.code + " · " + roomCodes(k),
            k.id,
            opt("", "Verificar") +
              opt("presente", "Presente no gancho") +
              opt("ausente", "Ausente do gancho"),
          ),
        )
        .join("") +
      "</div>",
    {},
    (b) => ({
      shift: b.shift,
      observations: Object.fromEntries(S.data.keys.map((k) => [k.id, b[k.id]])),
    }),
  );
}
export function importCsv(kind) {
  const headers =
    kind === "grade"
      ? "email;room;subject;class_name;weekday;start_time;end_time;valid_from;valid_to"
      : "name;email;registration;password";
  modal(
    "Importar " + kind,
    formHtml(
      '<p class="hint">Use CSV em UTF-8 separado por ponto e vírgula. O arquivo deve conter este cabeçalho.</p><code class="csv-head">' +
        headers +
        '</code><label>Arquivo CSV<input type="file" accept=".csv,text/csv" name="file" required></label>',
      "Validar e visualizar",
    ),
  );
  bind(async (b, f) => {
    const csv = await f.elements.file.files[0].text(),
      body = { csv, kind };
    const info = await api("manage/import", { ...body, preview: true });
    modal(
      "Confirmar importação",
      formHtml(
        "<p>" +
          info.count +
          " registro(s) validado(s).</p>" +
          facts(info.preview.map((v, i) => ["Linha " + (i + 2), v])),
        "Importar",
      ),
    );
    bind(async () => {
      await api("manage/import", body);
      await done("Importação concluída.");
    });
  });
}
export function exportFile() {
  modal(
    "Exportar relatório",
    formHtml(
      select(
        "Formato",
        "format",
        opt("pdf", "PDF") + opt("csv", "CSV (planilha)"),
      ) +
        area("Finalidade da exportação", "reason") +
        '<p class="hint">O arquivo inclui os registros dos filtros atuais. A exportação fica registrada na auditoria.</p>',
      "Gerar arquivo",
      "download",
    ),
  );
  bind(async (b) => {
    const blob = await api("reports/export", {
      ...b,
      filters: {
        ...S.report,
        description: el("#report-filters")
          ? Array.from(el("#report-filters").querySelectorAll("select"))
              .filter((s) => s.value)
              .map((s) => s.selectedOptions[0].textContent)
              .join(" · ")
          : "",
      },
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "custodia-fatec." + b.format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    close();
    toast("Relatório gerado.");
  });
}
export function loanDetail(id) {
  const l = S.reportRows.find((v) => v.id === id);
  modal(
    "Comprovante de custódia",
    facts([
      ["Chave", l.code],
      ["Ambientes na retirada", l.rooms],
      ["Docente", l.holder],
      ["Contexto", l.context],
      ["Retirada", clock(l.checkout, true)],
      ["Registrada por", l.operator_out],
      ["Origem da retirada", l.contingency_out ? "Contingência" : ""],
      ["Justificativa", l.reason_out],
      [
        "Horário físico informado",
        l.declared_out && clock(l.declared_out, true),
      ],
      [
        "Devolução",
        l.returned
          ? clock(l.returned, true)
          : l.voided
            ? "Anulado"
            : "Em aberto",
      ],
      ["Registrada por", l.operator_in],
      ["Origem da devolução", l.contingency_in ? "Contingência" : ""],
      ["Justificativa", l.reason_in],
      ["Horário físico informado", l.declared_in && clock(l.declared_in, true)],
      ["Correção", l.correction],
      ["Empréstimo", l.id],
    ]) +
      (admin() && !l.voided
        ? button(
            "Anular por erro material",
            "correct-loan",
            "",
            "danger-link",
            'data-id="' + esc(id) + '"',
          )
        : "") +
      '<div class="actions">' +
      button("Fechar", "close") +
      "</div>",
  );
}
export function removeSchedule(op, id) {
  confirmWrite(
    op,
    op === "undo-import" ? "Desfazer importação da grade" : "Desativar aula",
    area("Justificativa", "reason"),
    { id },
  );
}

export function exception(id) {
  confirmWrite(
    "exception",
    "Exceção na grade",
    input("Data da aula", "date", "", "date") +
      select("Operação", "mode", options(["Alterar", "Cancelar"])) +
      select(
        "Docente substituto",
        "teacher_id",
        opt("", "Manter docente") + personOptions(),
        "",
      ) +
      select(
        "Novo ambiente",
        "room_id",
        opt("", "Manter ambiente") + roomOptions(),
        "",
      ) +
      area("Justificativa", "reason"),
    { id },
  );
}
export function correctLoan(id) {
  confirmWrite(
    "correct",
    "Anular por erro material",
    "<p>Confira a posição física da chave antes de registrar a anulação. O empréstimo e a justificativa ficarão no histórico.</p>" +
      area("Justificativa da anulação", "reason"),
    { id },
  );
}
