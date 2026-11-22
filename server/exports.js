import PDFDocument from "pdfkit";
import { localDate } from "./common.js";
export const columns = [
  "Chave",
  "Ambientes",
  "Docente",
  "Retirada",
  "Devolução",
  "Minutos de uso",
  "Contexto",
  "Executor da retirada",
  "Motivo da retirada",
  "Executor da devolução",
  "Motivo da devolução",
  "Situação",
  "Justificativa de anulação",
  "Retirada em contingência", "Horário físico da retirada",
  "Devolução em contingência", "Horário físico da devolução",
];
const stamp = (v) => (v ? localDate(v) : "Em aberto");
export function reportRows(rows) {
  return rows.map((l) => [
    l.code,
    l.rooms,
    l.holder,
    stamp(l.checkout),
    l.voided && !l.returned ? "—" : stamp(l.returned),
    Math.max(
      0,
      Math.floor(
        ((l.returned
          ? Date.parse(l.returned)
          : l.voided
            ? Date.parse(l.voided)
            : Date.now()) -
          Date.parse(l.checkout)) /
          60000,
      ),
    ),
    l.context,
    l.operator_out,
    l.reason_out,
    l.operator_in || "",
    l.reason_in || "",
    l.voided ? "Anulado" : l.returned ? "Encerrado" : "Em aberto",
    l.correction || "",
    l.contingency_out ? "Sim" : "", l.declared_out ? stamp(l.declared_out) : "",
    l.contingency_in ? "Sim" : "", l.declared_in ? stamp(l.declared_in) : "",
  ]);
}
export function csv(rows, set) {
  const escape = (v) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return Buffer.from(
    "\ufeff" +
      (set ? [set.columns, ...set.rows] : [columns, ...reportRows(rows)])
        .map((row) => row.map(escape).join(";"))
        .join("\r\n"),
  );
}
export async function pdf(rows, u, reason, filters, set) {
  const d = new PDFDocument({
    size: "A4",
    margin: 42,
    info: { Title: "Relatório de custódia · Fatec Votorantim" },
  });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    d.on("data", (v) => chunks.push(v));
    d.on("end", () => resolve(Buffer.concat(chunks)));
    d.on("error", reject);
  });
  d.fillColor("#b1372f")
    .fontSize(11)
    .text("CONTROLE DE CHAVES  /  FATEC VOTORANTIM")
    .moveDown();
  d.fillColor("#182639")
    .fontSize(25)
    .text(set?.title || "Relatório de custódia")
    .moveDown(0.4);
  d.fontSize(10)
    .text("Gerado em " + localDate() + " (São Paulo) por " + u.name)
    .text("Finalidade: " + reason)
    .text(
      "Período: " + (filters.from || "início") + " a " + (filters.to || "hoje"),
    )
    .text("Filtros: " + (filters.description || "Todos"))
    .text((set?.rows.length ?? rows.length) + " registro(s)")
    .moveDown();
  if (set)
    for (const cells of set.rows) {
      if (d.y > 680) d.addPage();
      const lines = cells.map((v, i) => set.columns[i] + ": " + (v ?? "—"));
      d.font("Helvetica-Bold").fontSize(12).text(lines[0]);
      d.font("Helvetica")
        .fontSize(10)
        .text(lines.slice(1).join("   |   "))
        .moveDown();
    }
  for (const l of rows) {
    if (d.y > 685) d.addPage();
    d.font("Helvetica-Bold")
      .fontSize(12)
      .text(l.code + "   " + l.rooms + "   |   " + l.holder);
    d.font("Helvetica")
      .fontSize(10)
      .text(
        stamp(l.checkout) +
          "   a   " +
          (l.voided && !l.returned
            ? "anulação em " + stamp(l.voided)
            : stamp(l.returned)) +
          "   |   " +
          reportRows([l])[0][5] +
          " min" +
          (l.returned || l.voided ? "" : " (provisórios)"),
      )
      .text(l.context);
    if (l.contingency_out) d.text("Retirada em contingência · horário físico: " + stamp(l.declared_out));
    if (l.contingency_in) d.text("Devolução em contingência · horário físico: " + stamp(l.declared_in));
    if (l.voided) d.text("Anulação: " + l.correction);
    if (l.reason_out)
      d.text("Retirada assistida: " + l.operator_out + " · " + l.reason_out);
    if (l.reason_in)
      d.text("Devolução assistida: " + l.operator_in + " · " + l.reason_in);
    d.moveDown();
  }
  d.end();
  return done;
}
