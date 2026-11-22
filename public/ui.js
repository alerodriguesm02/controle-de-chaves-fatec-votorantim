export const S = {
  data: null,
  page: "home",
  demo: false,
  menu: false,
  filter: "Todas",
  search: "",
  tab: "keys",
  report: {},
  num: 0,
};
export const el = (q) => document.querySelector(q);
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const ic = (name, size = 18) =>
  '<i data-lucide="' +
  name +
  '" width="' +
  size +
  '" height="' +
  size +
  '" aria-hidden="true"></i>';
export const icons = () =>
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
export const clock = (v, full = false) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(full ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(v));
export const day = (v) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  }).format(new Date(v));
export const teacher = () => S.data.user.role === "Docente",
  admin = () => S.data.user.role === "Administrador",
  operator = () => ["Administrador", "Secretaria"].includes(S.data.user.role);
export const opt = (v, label, sel = "") =>
  '<option value="' +
  esc(v) +
  '" ' +
  (String(v) === String(sel) ? "selected" : "") +
  ">" +
  esc(label) +
  "</option>";
export const options = (list, sel) => list.map((x) => opt(x, x, sel)).join("");
export const input = (
  label,
  name,
  val = "",
  type = "text",
  extra = "required",
) =>
  "<label>" +
  esc(label) +
  '<input type="' +
  type +
  '" name="' +
  name +
  '" value="' +
  esc(val) +
  '" ' +
  extra +
  "></label>";
export const select = (label, name, opts, attr = "required") =>
  "<label>" +
  esc(label) +
  '<select name="' +
  name +
  '" ' +
  attr +
  ">" +
  opts +
  "</select></label>";
export const area = (
  label,
  name,
  val = "",
  extra = 'required maxlength="600"',
) =>
  "<label>" +
  esc(label) +
  '<textarea name="' +
  name +
  '" ' +
  extra +
  ">" +
  esc(val) +
  "</textarea></label>";
export const button = (
  text,
  action,
  icon = "",
  cls = "secondary",
  extra = "",
) =>
  '<button type="button" class="' +
  cls +
  '" data-action="' +
  action +
  '" ' +
  extra +
  ">" +
  (icon ? ic(icon, 16) : "") +
  esc(text) +
  "</button>";
export const empty = (title, desc = "") =>
  '<div class="empty">' +
  ic("inbox", 28) +
  "<strong>" +
  esc(title) +
  "</strong><small>" +
  esc(desc) +
  "</small></div>";
export const badge = (s) =>
  '<span class="badge ' +
  ({
    Disponível: "green",
    "Em uso": "blue",
    Bloqueada: "amber",
    Pendente: "amber",
    Encerrado: "green",
    "Em aberto": "blue",
  }[s] || "gray") +
  '"><b></b>' +
  esc(s) +
  "</span>";
export const roomName = (k) =>
  k.rooms
    .map((r) => (r.name === "Sala de aula" ? "Sala " + r.code : r.name))
    .join(" / ") || k.code;
export const roomCodes = (k) =>
  k.rooms.map((r) => r.code).join(", ") || "Sem ambiente";
export const roomIcon = (k) =>
  k.rooms.some((r) => r.name.includes("Laboratório"))
    ? "monitor"
    : k.rooms.some((r) => r.name === "Auditório")
      ? "presentation"
      : k.rooms.some((r) => r.name === "Biblioteca")
        ? "library-big"
        : "door-open";
export const initials = (n) =>
  n
    .split(" ")
    .filter(Boolean)
    .map((t) => t[0])
    .filter((v, i, a) => i === 0 || i === a.length - 1)
    .join("");
export const dataOf = (form) => Object.fromEntries(new FormData(form));
export async function api(route, b, headers = {}) {
  let res;
  try {
    res = await fetch("/api/v1/" + route, {
      method: b === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: b === undefined ? undefined : JSON.stringify(b),
    });
  } catch {
    throw Error(
      "Sem conexão com o servidor. Tente novamente ou procure a secretaria.",
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 && S.data && !route.startsWith("auth/"))
      window.dispatchEvent(new Event("sessionexpired"));
    throw Object.assign(Error(err.error?.message || "Falha ao carregar."), {
      status: res.status,
    });
  }
  return res.headers.get("content-type")?.includes("application/json")
    ? res.json()
    : res.blob();
}
export async function refresh() {
  S.data = await api("workspace");
  S.demo = S.data.demo;
}
let timer, cleanup;
export function toast(msg) {
  clearTimeout(timer);
  const n = el("#toast");
  n.textContent = msg;
  n.classList.add("show");
  timer = setTimeout(() => n.classList.remove("show"), 3500);
}
export function close() {
  cleanup?.();
  cleanup = null;
  el("#dialog").close();
}
export function onClose(fn) {
  cleanup = fn;
}
el("#dialog").addEventListener("cancel", () => {
  cleanup?.();
  cleanup = null;
});
el("#dialog").addEventListener("click", (e) => {
  if (e.target === el("#dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  }
});
export function modal(title, content, wide = false) {
  cleanup?.();
  cleanup = null;
  const d = el("#dialog");
  d.className = wide ? "wide" : "";
  d.setAttribute("aria-labelledby", "dialog-title");
  d.innerHTML =
    '<header class="modal-head"><h2 id="dialog-title">' +
    esc(title) +
    "</h2>" +
    button("", "close", "x", "icon-btn", 'aria-label="Fechar"') +
    '</header><div class="modal-body">' +
    content +
    "</div>";
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  icons();
}
export function formHtml(fields, submit = "Salvar", icon = "check") {
  return (
    '<form id="modal-form">' +
    fields +
    '<p class="form-error" role="alert" hidden></p><div class="actions">' +
    button("Cancelar", "close") +
    '<button class="primary" type="submit">' +
    ic(icon, 16) +
    esc(submit) +
    "</button></div></form>"
  );
}
export function bind(fn) {
  const form = el("#modal-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]"),
      out = form.querySelector(".form-error");
    if (btn.disabled) return;
    btn.disabled = true;
    out.hidden = true;
    try {
      await fn(dataOf(form), form);
    } catch (err) {
      out.hidden = false;
      out.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
}
export function notifyError(err) {
  if (el("#dialog").open) {
    let node = el("#dialog .form-error");
    if (!node) {
      node = document.createElement("p");
      node.className = "form-error";
      el(".modal-body").append(node);
    }
    node.textContent = err.message;
    node.hidden = false;
  } else toast(err.message);
}
export function navigation(page) {
  if (location.hash === "#" + page)
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = page;
}
export function updated() {
  window.dispatchEvent(new Event("dataupdated"));
}
