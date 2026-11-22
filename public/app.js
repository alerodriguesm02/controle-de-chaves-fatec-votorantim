import { dashboard, eventDetails } from "./dashboard.js";
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
  input,
  area,
  button,
  empty,
  badge,
  roomCodes,
  api,
  refresh,
  close,
  toast,
  modal,
  formHtml,
  bind,
  notifyError,
  navigation,
  dataOf,
} from "./ui.js";
import {
  pages,
  allowed,
  brand,
  shell,
  home,
  fillBoard,
  inventoryPage,
  reportPage,
  loadReport,
  records,
  grade,
  issues,
  settings,
  auditView,
} from "./views.js";
import {
  keyDetail,
  startMovement,
  camera,
  edit,
  label,
  incident,
  check,
  checkLabel,
  importCsv,
  exportFile,
  loanDetail,
  removeSchedule,
  exception,
  correctLoan,
} from "./flows.js";
function demoButtons() {
  return (
    '<div class="demo-choices">' +
    [
      ["admin", "Administrador", "settings-2"],
      ["secretaria", "Secretaria", "building-2"],
      ["professor", "Docente", "graduation-cap"],
      ["auditoria", "Auditor", "shield-check"],
    ]
      .map(([id, name, icon]) =>
        button(name, "demo", icon, "secondary", 'data-id="' + id + '"'),
      )
      .join("") +
    "</div>"
  );
}
function login() {
  S.data = null;
  close();
  el("#app").innerHTML =
    '<main class="auth-layout"><section class="auth-art"><div class="brand">' +
    brand() +
    '</div><div><div class="hero-kicker"><i></i> FATEC VOTORANTIM</div><h1>Controle de chaves</h1><img src="/keyring.webp" alt=""></div></section><section class="auth-content"><h2>Entrar no Controle de Chaves</h2><p>Acesse com sua conta autorizada pela unidade.</p><form id="login-form">' +
    input(
      "E-mail institucional",
      "email",
      "",
      "email",
      'required autocomplete="username"',
    ) +
    input(
      "Senha",
      "password",
      "",
      "password",
      'required autocomplete="current-password"',
    ) +
    '<p class="form-error" role="alert" hidden></p><button class="primary" type="submit">Entrar ' +
    ic("arrow-right", 17) +
    "</button></form>" +
    button("Preciso recuperar meu acesso", "recover", "", "text-link") +
    (S.demo
      ? '<div class="demo-box"><h3>Explorar demonstração</h3><p>Escolha um perfil para experimentar com dados fictícios.</p>' +
        demoButtons() +
        "</div>"
      : "") +
    "</section></main>";
  const form = el("#login-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await api("auth/login", dataOf(form));
      sessionStorage.removeItem("fv-signedout");
      await enter();
    } catch (err) {
      const p = form.querySelector(".form-error");
      p.hidden = false;
      p.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  icons();
}
async function enter() {
  await refresh();
  render();
}
function render() {
  if (!S.data) return;
  const route = location.hash.slice(1) || "home";
  S.page = allowed().includes(route) ? route : "home";
  el("#app").innerHTML = shell();
  const main = el("#main");
  main.innerHTML = {
    home,
    inventory: inventoryPage,
    history: reportPage,
    reports: reportPage,
    records,
    schedule: grade,
    issues,
    settings,
    audit: () => '<p class="loading">Carregando auditoria…</p>',
  }[S.page]();
  fillBoard();
  icons();
  document.title = pages[S.page][0] + " · Controle de Chaves";
  if (el("#key-search"))
    el("#key-search").oninput = (e) => {
      S.search = e.target.value;
      fillBoard();
    };
  if (el("#key-filter"))
    el("#key-filter").onchange = (e) => {
      S.filter = e.target.value;
      fillBoard();
    };
  if (el("#report-filters")) {
    const f = el("#report-filters");
    if (el("#report-kind"))
      el("#report-kind").onchange = (e) => {
        S.report = { kind: e.target.value };
        S.num = 0;
        render();
      };
    f.onsubmit = (e) => {
      e.preventDefault();
      const b = dataOf(f);
      if (b.from && b.to && b.from > b.to) {
        toast("A data final deve ser igual ou posterior à inicial.");
        return;
      }
      S.report = b;
      S.num = 0;
      loadReport().catch(notifyError);
    };
    loadReport().catch(notifyError);
  }
  if (S.page === "audit") auditView().catch(notifyError);
}
function notifications() {
  const ks = S.data.keys.filter(
    (k) => k.late && (!teacher() || k.loan?.user_id === S.data.user.id),
  );
  modal(
    "Pendências de devolução",
    ks.length
      ? ks
          .map(
            (k) =>
              '<div class="notification"><span>' +
              ic("clock-alert", 20) +
              "</span><div><b>" +
              esc(k.code) +
              " · " +
              esc(roomCodes(k)) +
              "</b><small>" +
              esc(k.loan?.holder || "Empréstimo acima do prazo") +
              "</small></div>" +
              button(
                "Ver",
                "key",
                "",
                "small-btn",
                'data-id="' + esc(k.id) + '"',
              ) +
              "</div>",
          )
          .join("")
      : empty(
          "Tudo em dia",
          "Nenhuma devolução acima do prazo para este perfil.",
        ),
  );
}
function account() {
  const u = S.data.user;
  modal(
    "Minha conta",
    '<div class="account-detail"><b>' +
      esc(u.name) +
      "</b><p>" +
      esc(u.email) +
      "</p><span>" +
      esc(u.role) +
      ' · Fatec Votorantim</span></div><div class="account-actions">' +
      button("Alterar senha", "password", "lock-keyhole") +
      button("Sair da conta", "logout", "log-out") +
      "</div>" +
      (S.demo
        ? '<div class="demo-box"><h3>Alternar perfil de demonstração</h3>' +
          demoButtons() +
          "</div>"
        : ""),
  );
}
document.addEventListener("click", async (e) => {
  const n = e.target.closest("[data-action]");
  if (!n || n.disabled) return;
  const a = n.dataset.action,
    id = n.dataset.id || "";
  try {
    if (a === "period") {
      S.period = n.dataset.period;
      el(".analytics").outerHTML = dashboard();
      icons();
      el('.analytics [aria-pressed="true"]').focus();
    } else if (a === "event-details")
      eventDetails(n.dataset.type, n.dataset.bucket);
    else if (a === "close") close();
    else if (a === "menu") document.body.classList.toggle("menu-open");
    else if (a === "move") startMovement(id);
    else if (a === "camera") await camera();
    else if (a === "key") keyDetail(id);
    else if (a === "metric") {
      S.filter = n.dataset.filter;
      S.search = "";
      navigation("inventory");
    } else if (a === "account") account();
    else if (a === "notifications") notifications();
    else if (a === "demo") {
      close();
      await api("auth/demo", { profile: id });
      sessionStorage.removeItem("fv-signedout");
      S.report = {};
      S.num = 0;
      S.search = "";
      S.filter = "Todas";
      history.replaceState(null, "", "#home");
      await enter();
    } else if (a === "logout") {
      await api("auth/logout", {});
      sessionStorage.setItem("fv-signedout", "1");
      login();
    } else if (a === "recover")
      modal(
        "Recuperar acesso",
        "<p>Solicite à secretaria da Fatec Votorantim a redefinição de sua senha. Informe seu identificador institucional para que o responsável confira o vínculo e emita uma nova credencial.</p>" +
          button("Entendi", "close"),
      );
    else if (a === "password") {
      modal(
        "Alterar senha",
        formHtml(
          input(
            "Senha atual",
            "current",
            "",
            "password",
            'required autocomplete="current-password"',
          ) +
            input(
              "Nova senha",
              "password",
              "",
              "password",
              'required minlength="10" maxlength="160" autocomplete="new-password"',
            ),
        ),
      );
      bind(async (b) => {
        await api("auth/password", b);
        close();
        toast("Senha atualizada.");
      });
    } else if (a === "help")
      modal(
        "Ajuda e suporte",
        "<h3>Como movimentar uma chave</h3><ol><li>Identifique a etiqueta no gancho pelo QR ou pelo código impresso.</li><li>Confira a chave, os ambientes e a finalidade da retirada.</li><li>Ao receber ou devolver a chave física, confirme e aguarde o comprovante.</li></ol><h3>Se a câmera ou a rede falhar</h3><p>Procure a secretaria. O responsável pode conferir o gancho e realizar o registro assistido. Durante indisponibilidade, a unidade usa o formulário de contingência e reconcilia os registros ao restabelecer o serviço.</p>" +
          button("Entendi", "close"),
      );
    else if (a.startsWith("edit-")) edit(a.slice(5), id);
    else if (a === "record-tab") {
      S.tab = n.dataset.tab;
      render();
    } else if (a === "label") label(id);
    else if (a === "print") window.print();
    else if (a === "new-issue" || a === "resolve-issue") incident(id);
    else if (a === "check-label") checkLabel();
    else if (a === "check") check();
    else if (a === "import-grade" || a === "import-people")
      importCsv(a === "import-grade" ? "grade" : "docentes");
    else if (a === "exception") exception(id);
    else if (a === "correct-loan") correctLoan(id);
    else if (a === "export") exportFile();
    else if (a === "loan") loanDetail(id);
    else if (a === "prev" || a === "next") {
      S.num += a === "next" ? 1 : -1;
      await loadReport();
    } else if (a === "remove-schedule" || a === "undo-import")
      removeSchedule(a, id);
  } catch (err) {
    notifyError(err);
  }
});
window.addEventListener("hashchange", () => {
  document.body.classList.remove("menu-open");
  close();
  S.report = {};
  S.num = 0;
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("dataupdated", render);
window.addEventListener("sessionexpired", () => {
  sessionStorage.setItem("fv-signedout", "1");
  login();
  toast("Sessão encerrada. Entre novamente.");
});
window.addEventListener("offline", () => {
  el(".connection")?.classList.add("offline");
  if (el(".connection")) el(".connection").textContent = "Sem conexão";
  toast("Sem conexão. A secretaria pode registrar a contingência.");
});
window.addEventListener("online", () => {
  if (S.data) enter().catch(notifyError);
});
setInterval(async () => {
  if (
    S.data &&
    !document.hidden &&
    !el("#dialog").open &&
    S.page === "home" &&
    !["INPUT", "SELECT"].includes(document.activeElement.tagName)
  ) {
    try {
      await refresh();
      render();
    } catch {
      /* The next poll retries. */
    }
  }
}, 30000);
async function init() {
  const auth = await api("auth/me");
  S.demo = auth.demo;
  if (auth.user) await enter();
  else if (auth.demo && !sessionStorage.getItem("fv-signedout")) {
    await api("auth/demo", { profile: "admin" });
    await enter();
  } else login();
}
init().catch((err) => {
  el("#app").innerHTML =
    '<main class="offline-page"><h1>Controle de Chaves indisponível</h1><p>' +
    esc(err.message) +
    '</p><button class="primary" id="retry">Tentar novamente</button></main>';
  el("#retry").onclick = () => location.reload();
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
