import { S, ic, esc, modal, clock, empty } from "./ui.js";

const local = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
const dateLabel = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
function summary() {
  const period = S.period || "Dia";
  const today = local.format(new Date(S.data.serverTime)).slice(0, 10);
  const day = new Date(today + "T12:00:00Z");
  const days =
    period === "Dia"
      ? 1
      : period === "Semana"
        ? ((day.getUTCDay() + 6) % 7) + 1
        : day.getUTCDate();
  const start = new Date(day.getTime() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const buckets = Array.from(
    { length: period === "Dia" ? 24 : days },
    (_, i) => ({
      label:
        period === "Dia"
          ? String(i).padStart(2, "0") + "h"
          : dateLabel(
              new Date(
                Date.parse(start + "T12:00:00Z") + i * 86400000,
              ).toISOString(),
            ),
      count: 0,
    }),
  );
  const events = [];
  for (const event of S.data.recentEvents) {
    const time = local.format(new Date(event.at)),
      date = time.slice(0, 10);
    if (date < start || date > today) continue;
    const bucket =
      period === "Dia"
        ? Number(time.slice(11, 13))
        : (Date.parse(date) - Date.parse(start)) / 86400000;
    buckets[bucket].count++;
    events.push({ ...event, bucket });
  }
  return {
    period,
    buckets,
    events,
    range:
      start === today
        ? dateLabel(today)
        : dateLabel(start) + " – " + dateLabel(today),
  };
}
export function dashboard() {
  const { period, buckets, events, range } = summary();
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const dots = buckets
    .map((b, i) => {
      const count = Math.ceil((6 * b.count) / max);
      return `<button type="button" class="dot-column" data-action="event-details" data-bucket="${i}" title="${b.label} · ${b.count} movimentos" aria-label="${b.label}, ${b.count} movimentos"><span aria-hidden="true">${count ? "<i></i>".repeat(count) : "<b></b>"}</span></button>`;
    })
    .join("");
  const tile = (type, label, icon) =>
    `<button class="glass-tile ${type}" data-action="event-details" data-type="${type}"><span class="tile-heading">${ic(icon, 18)} ${label}<i>${ic("arrow-up-right", 17)}</i></span><strong>${events.filter((e) => e.type === type).length}</strong><small>${range}</small></button>`;
  return `<section class="analytics" aria-label="Movimentações por período"><header><h2>Movimentações</h2><div class="periods" role="group" aria-label="Período">${["Dia", "Semana", "Mês"].map((p) => `<button data-action="period" data-period="${p}" aria-pressed="${period === p}">${p}</button>`).join("")}</div></header>
    <div class="glass-grid"><div class="glass-tile total"><span class="tile-heading">Total no período</span><strong>${events.length}</strong><small>${range}</small><div class="dot-chart">${dots}</div><div class="chart-axis"><span>${buckets[0].label}</span><span>${buckets.length > 1 ? buckets.at(-1).label : ""}</span></div></div>
    ${tile("out", "Retiradas", "arrow-up-right")}${tile("in", "Devoluções", "arrow-down-left")}</div></section>`;
}
export function eventDetails(type, bucket) {
  const { buckets, events, range } = summary();
  const rows = events
    .filter(
      (e) =>
        (!type || type === e.type) &&
        (bucket === undefined || e.bucket === Number(bucket)),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const title =
    type === "out"
      ? "Retiradas"
      : type === "in"
        ? "Devoluções"
        : "Movimentações";
  modal(
    title +
      " · " +
      (bucket === undefined ? range : buckets[Number(bucket)].label),
    rows.length
      ? rows
          .map(
            (e) =>
              `<div class="movement-row"><b>${esc(e.code)} · ${esc(e.rooms)}</b><span>${e.type === "out" ? "Retirada" : "Devolução"} · ${clock(e.at, true)}</span></div>`,
          )
          .join("")
      : empty("Nenhum movimento neste intervalo"),
  );
}
