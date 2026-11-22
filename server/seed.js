import { uid, now, hashPassword } from "./common.js";
import { issueLabel } from "./labels.js";
export async function initialize(db, demo) {
  const mode = demo ? "demo" : "unit";
  const marker = await db.one("SELECT value FROM app_meta WHERE name='mode'");
  if (marker && marker.value !== mode)
    throw Error(
      "Use um banco separado para demonstração e dados institucionais.",
    );
  if (!marker) {
    const synthetic = await db.one(
      "SELECT id FROM users WHERE email='admin@demo.invalid'",
    );
    if (synthetic && !demo)
      throw Error("Esta base contém dados demonstrativos.");
    await db.run("INSERT INTO app_meta VALUES (?,?)", "mode", mode);
  }
  if (await db.one("SELECT id FROM settings")) return;
  await db.run("INSERT INTO settings VALUES (1,3,4)");
  if (!demo) {
    const email = process.env.ADMIN_EMAIL,
      password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < 12)
      throw Error(
        "Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo de 12 caracteres) para inicializar.",
      );
    await db.run(
      "INSERT INTO users (id,name,email,registration,role,password) VALUES (?,?,?,?,?,?)",
      uid(),
      "Administração",
      email.trim().toLowerCase(),
      "ADMIN",
      "Administrador",
      hashPassword(password),
    );
    return;
  }
  const hash = hashPassword("Fatec-Demo-2026");
  const people = [
    ["Marina Costa", "admin", "Administrador"],
    ["Lívia Duarte", "secretaria", "Secretaria"],
    ["Carlos Almeida", "professor", "Docente"],
    ["Ana Paula Ribeiro", "ana", "Docente"],
    ["Rafael Martins", "rafael", "Docente"],
    ["Beatriz Lima", "beatriz", "Docente"],
    ["Lucas Ferreira", "lucas", "Docente"],
    ["Sofia Mendes", "auditoria", "Auditor"],
  ];
  for (const [i, [name, login, role]] of people.entries())
    await db.run(
      "INSERT INTO users (id,name,email,registration,role,password) VALUES (?,?,?,?,?,?)",
      login,
      name,
      login + "@demo.invalid",
      "FV-" + (1010 + i),
      role,
      hash,
    );
  const timestamp = Date.now();
  const ago = (m) => new Date(timestamp - m * 60000).toISOString();
  const rows = [
    ["A-101", "Sala de aula"],
    ["A-102", "Sala de aula"],
    ["L-01", "Laboratório de informática"],
    ["B-201", "Sala de aula"],
    ["B-202", "Sala de aula"],
    ["AUD", "Auditório"],
    ["A-103", "Sala de aula"],
    ["L-02", "Laboratório de redes"],
    ["A-104", "Sala de aula"],
    ["B-203", "Sala de aula"],
    ["B-204", "Sala de aula"],
    ["BIB", "Biblioteca"],
    ["A-105", "Sala de aula"],
    ["A-106", "Sala de aula"],
    ["L-03", "Laboratório de projetos"],
    ["B-205", "Sala de aula"],
    ["B-206", "Sala de aula"],
    ["MULT", "Sala multimídia"],
    ["A-107", "Sala de aula"],
    ["A-108", "Sala de aula"],
    ["L-04", "Laboratório de hardware"],
    ["B-207", "Sala de aula"],
    ["B-208", "Sala de aula"],
    ["REU", "Sala de reuniões"],
  ];
  for (const [i, [code, name]] of rows.entries()) {
    const id = "key-" + i,
      room = "room-" + i;
    await db.run(
      "INSERT INTO rooms VALUES (?,?,?,?,1)",
      room,
      code,
      name,
      code.startsWith("B") ? "Bloco B" : "Bloco A",
    );
    await db.run(
      "INSERT INTO keys VALUES (?,?,?,?,?)",
      id,
      "CH-" + String(i + 1).padStart(3, "0"),
      "G-" + String(i + 1).padStart(2, "0"),
      "Individual",
      [5, 23].includes(i) ? "Manutenção" : "Ativa",
    );
    await db.run("INSERT INTO key_rooms VALUES (?,?)", id, room);
    await issueLabel(db, id);
    const user = ["professor", "ana", "rafael", "beatriz", "lucas"][i % 5];
    const start = i === 1 ? 12 : i === 2 ? 49 : 74 + i * 13;
    const open = [1, 4, 7, 10, 13, 16].includes(i);
    await db.run(
      "INSERT INTO loans (id,key_id,user_id,checkout,due,returned,actor_out,actor_in,reason_out,context,rooms) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      uid(),
      id,
      user,
      ago(start),
      ago(start - 240),
      open ? null : ago(i === 0 ? 5 : i === 2 ? 28 : start - 35),
      user,
      open ? null : user,
      "",
      ["Programação I", "Gestão de projetos", "Banco de dados"][i % 3],
      code,
    );
  }
  for (let i = 0; i < 5; i++)
    await db.run(
      "INSERT INTO schedules (id,user_id,room_id,subject,class_name,weekday,start_time,end_time,valid_from,valid_to) VALUES (?,?,?,?,?,?,?,?,?,?)",
      uid(),
      "professor",
      "room-" + i,
      [
        "Programação I",
        "Engenharia de software",
        "Banco de dados",
        "Projetos",
        "Algoritmos",
      ][i],
      "DSM-2",
      i + 1,
      "18:50",
      "22:20",
      "2026-01-01",
      "2027-12-31",
    );
}
