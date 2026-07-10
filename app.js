// Front du site sales — parle uniquement à l'edge function (aucune clé ici).
const API = "https://gwococcxzrrtadtricnd.supabase.co/functions/v1/api";
const CODE = new URLSearchParams(location.search).get("c") || "";

let MOI = null, EQUIPE = [], RECORDS = [], PERIOD = "7j", TYPE = "Setting";

const el = id => document.getElementById(id);
const eur = n => (Number(n) || 0).toLocaleString("fr-FR") + " €";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtPct = v => v === null || v === undefined ? "–" : v + " %";
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const jolieDate = (ymd, today) => ymd === today ? "aujourd'hui" :
  JOURS[new Date(ymd + "T12:00:00").getDay()] + " " + ymd.slice(8, 10) + "/" + ymd.slice(5, 7);

const PAGES = {
  log: ["Log un call", "Après chaque call, 20 secondes"],
  dashboard: ["Dashboard", "Vue d'ensemble"],
  pipeline: ["Pipeline", "Suivez vos deals"],
  prospects: ["Prospects", "Tous les prospects identifiés"],
  rdv: ["Rendez-vous", "Settings, prez et closings calés"],
  appels: ["Appels", "Les 100 derniers calls loggés"],
  relances: ["Relances", "Les follow-ups à faire"],
  kpi: ["KPI", "Analysez vos perfs"]
};
const ETAT_PILL = { "Closé": "", "À relancer": "amber", "En closing": "", "En prez": "", "Vu en setting": "grey", "Setting calé": "grey", "Perdu": "red", "Contacté": "grey" };

const MAP = {
  type: "Type de call", date: "Date", qui: "Qui", telephone: "Téléphone",
  instagram: "Instagram", source: "Source", res_setting: "Résultat setting",
  rdv_le: "RDV prévu le", rdv_avec: "RDV avec", fiche: "Fiche prospect",
  res_pres: "Résultat présentation", res_closing: "Résultat closing",
  offre: "Offre vendue", montant: "Montant total", encaisse: "Encaissé aujourd'hui",
  paiement: "Type de paiement", date_relance: "Date de relance",
  prospect: "Prospect", notes: "Notes", cause: "Cause"
};
function adapt(row) {
  const f = {};
  for (const k in MAP) if (row[k] !== null && row[k] !== undefined && row[k] !== "") f[MAP[k]] = row[k];
  return { fields: f, createdTime: row.created_at, id: row.id };
}

async function call(action, extra) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ code: CODE, action }, extra || {}))
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || ("erreur " + res.status));
  return j;
}

function tableHTML(headers, rows) {
  if (!rows.length) return "";
  return "<table><tr>" + headers.map(h => `<th class="${h.n ? "num" : ""}">${h.t}</th>`).join("") + "</tr>" +
    rows.map(r => "<tr>" + r.map(c => `<td class="${c.n ? "num" : ""}">${c.t}</td>`).join("") + "</tr>").join("") + "</table>";
}

function render() {
  const s = SalesStats.compute(RECORDS, PERIOD, new Date());
  const g = s.global;
  const F = SalesStats.F;

  el("bRdv").style.display = s.rdvJour.length ? "" : "none";
  el("bRdv").textContent = s.rdvJour.length;
  el("bRel").style.display = s.matin.relancesAFaire ? "" : "none";
  el("bRel").textContent = s.matin.relancesAFaire;

  el("k1").textContent = s.matin.rdvJour;
  el("k2").textContent = eur(s.matin.encaisse30);
  el("k3").textContent = s.matin.relancesAFaire;
  el("k3h").textContent = s.matin.relancesAFaire ? "dont en retard : " + s.relances.filter(r => r.date < s.today).length : "rien en attente";

  el("strip").innerHTML = [
    ["Settings calés", g.cales],
    ["Settings effectués", g.effectues],
    ["Show", fmtPct(g.txShow)],
    ["Non aboutis", g.nonAboutis],
    ["Part en prez/closing", fmtPct(g.txAbouti)],
    ["Closés", g.closes],
    ["Taux de closing", fmtPct(g.txClose)],
    ["Vendu", eur(g.vendu)],
    ["Encaissé", eur(g.encaisse)],
    ["Panier moyen", g.panier === null ? "–" : eur(g.panier)]
  ].map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

  const causesArr = Object.entries(g.causes).sort((a, c) => c[1] - a[1]);
  el("causes").innerHTML = causesArr.length
    ? tableHTML([{ t: "Cause" }, { t: "Settings", n: 1 }], causesArr.map(([c, n]) => [{ t: esc(c) }, { t: n, n: 1 }]))
    : `<div class="empty">Aucun setting non abouti sur la période.</div>`;

  el("reste").innerHTML = s.reste.liste.length
    ? tableHTML([{ t: "Prospect" }, { t: "Contact" }, { t: "Reste dû", n: 1 }],
        s.reste.liste.map(x => [{ t: esc(x.prospect) }, { t: esc(x.contact) }, { t: eur(x.du), n: 1 }]))
      .replace("<table>", `<table><tr><th colspan="2">TOTAL</th><th class="num">${eur(s.reste.total)}</th></tr>`)
    : `<div class="empty">Aucun acompte en attente de solde.</div>`;

  const rdvT = rows => tableHTML(
    [{ t: "Quand" }, { t: "Heure" }, { t: "Quoi" }, { t: "Prospect" }, { t: "Avec" }, { t: "Setter" }, { t: "Contact" }, { t: "Fiche" }],
    rows.map(r => [
      { t: r.jour === s.today ? `<span class="today">${jolieDate(r.jour, s.today)}</span>` : esc(jolieDate(r.jour, s.today)) },
      { t: esc(r.heure) || "?" }, { t: `<span class="pill grey">${esc(r.quoi)}</span>` }, { t: esc(r.prospect) },
      { t: `<span class="pill">${esc(r.avec)}</span>` },
      { t: esc(r.setter) }, { t: esc(r.contact) },
      { t: r.fiche ? `<details><summary>voir</summary><div>${esc(r.fiche)}</div></details>` : "" }
    ]));
  el("rdvjour").innerHTML = s.rdvJour.length ? rdvT(s.rdvJour) : `<div class="empty">Aucun RDV aujourd'hui.</div>`;
  el("rdv").innerHTML = s.rdvAVenir.length ? rdvT(s.rdvAVenir.slice(0, 30)) : `<div class="empty">Aucun RDV à venir. Le moment idéal pour caler des settings.</div>`;

  const pi = s.pipeline;
  const maxPi = Math.max(pi.contacte, pi.cale, pi.vu, pi.enPrez, pi.enClosing, pi.aRelancer, pi.close, pi.perdu, 1);
  const bar = (label, n, cls, eurVal) => `<div class="row"><div class="name">${label}${eurVal ? `<br><span class="eur">${eur(eurVal)}</span>` : ""}</div><div class="bar"><i class="${cls || ""}" style="width:${Math.round(n / maxPi * 100)}%"></i></div><div class="n">${n}</div></div>`;
  el("pipe").innerHTML = pi.total
    ? `<div class="pipe">` + bar("Setting calé", pi.cale, "grey") + bar("Vu en setting", pi.vu, "grey") + bar("En prez", pi.enPrez) +
      bar("En closing", pi.enClosing) + bar("À relancer", pi.aRelancer, "", pi.aRelancerEur) + bar("Closé", pi.close, "", pi.closeEur) + bar("Perdu", pi.perdu, "red") + `</div>`
    : `<div class="empty">Aucun prospect identifié pour l'instant.</div>`;

  const ORDRE = ["Setting calé", "Vu en setting", "En prez", "En closing", "À relancer", "Closé", "Perdu"];
  el("kanban").innerHTML = s.prospects.length
    ? ORDRE.map(etat => {
        const list = s.prospects.filter(x => x.etat === etat);
        const cards = list.slice(0, 20).map(x =>
          `<div class="kcard"><div class="kn">${esc(x.nom || x.contact || "?")}</div><div class="kc">${esc(x.contact)}</div>` +
          (etat === "Closé" && x.vendu ? `<div class="ke">${eur(x.vendu)}${x.vendu > x.encaisse ? " (reste " + eur(x.vendu - x.encaisse) + ")" : ""}</div>` : "") +
          (etat === "À relancer" && x.relanceEur ? `<div class="ke">${eur(x.relanceEur)}</div>` : "") + `</div>`).join("");
        return `<div class="kol"><h3>${etat} <span>${list.length}</span></h3>${cards}${list.length > 20 ? `<div class="kmore">+ ${list.length - 20} autres</div>` : ""}</div>`;
      }).join("")
    : "";

  el("prospectsT").innerHTML = s.prospects.length
    ? tableHTML(
        [{ t: "Prospect" }, { t: "Contact" }, { t: "Source" }, { t: "État" }, { t: "Dernier contact" }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        s.prospects.map(x => [
          { t: esc(x.nom || "?") }, { t: esc(x.contact) }, { t: esc(x.source || "–") },
          { t: `<span class="pill ${ETAT_PILL[x.etat] || ""}">${esc(x.etat)}</span>` },
          { t: esc(x.dernier) }, { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
        ]))
    : `<div class="empty">Aucun prospect identifié.</div>`;

  const calls = RECORDS.slice()
    .sort((a, c) => (SalesStats.dateOf(c) + (c.createdTime || "")).localeCompare(SalesStats.dateOf(a) + (a.createdTime || "")))
    .slice(0, 100);
  const headA = [{ t: "Date" }, { t: "Type" }, { t: "Qui" }, { t: "Prospect" }, { t: "Résultat" }, { t: "Montant", n: 1 }, { t: "Encaissé", n: 1 }];
  if (MOI.role === "admin") headA.push({ t: "" });
  el("appels").innerHTML = calls.length
    ? tableHTML(headA,
        calls.map(r => {
          const f = r.fields || {};
          let res = f[F.resSetting] || f[F.resPres] || f[F.resClosing] || (f[F.type] === "Paiement" ? "Encaissement" : "–");
          if (f[F.cause]) res += " (" + f[F.cause] + ")";
          const row = [
            { t: esc(SalesStats.dateOf(r)) },
            { t: `<span class="pill grey">${esc(f[F.type] || "?")}</span>` },
            { t: esc(f[F.qui] || "?") }, { t: esc(f[F.prospect] || "?") }, { t: esc(res) },
            { t: f[F.montant] ? eur(f[F.montant]) : "", n: 1 },
            { t: f[F.encaisse] ? eur(f[F.encaisse]) : "", n: 1 }
          ];
          if (MOI.role === "admin") row.push({ t: `<button class="del" data-id="${r.id}" title="Supprimer (erreur de saisie)">suppr.</button>`, n: 1 });
          return row;
        }))
    : `<div class="empty">Aucun call loggé pour l'instant.</div>`;
  document.querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Supprimer ce call ? (uniquement pour corriger une erreur de saisie)")) return;
    try { await call("delete", { id: b.dataset.id }); await loadData(); } catch (e) { alert(e.message); }
  }));

  el("relances").innerHTML = s.relances.length
    ? tableHTML(
        [{ t: "Pour le" }, { t: "Prospect" }, { t: "Contact" }, { t: "Qui" }, { t: "Notes" }],
        s.relances.map(r => [
          { t: r.date < s.today ? `<span class="late">${esc(r.date)}</span>` : esc(r.date) },
          { t: esc(r.prospect) }, { t: esc(r.contact) }, { t: esc(r.qui) },
          { t: r.notes ? `<details><summary>voir</summary><div>${esc(r.notes)}</div></details>` : "" }
        ]))
    : `<div class="empty">Aucune relance en attente.</div>`;

  const wk = s.hebdo;
  const chart = (title, vals, fmt) => {
    const mx = Math.max(...vals.map(v => v === null ? 0 : v), 1);
    return `<div class="card"><div class="chart-title">${title}</div><div class="bars">` +
      wk.map((w, i) => {
        const v = vals[i];
        const h = v === null ? 0 : Math.round(v / mx * 100);
        return `<div class="bcol"><div class="bv">${v === null ? "–" : fmt(v)}</div><div class="b" style="height:${h}%"></div><div class="bl">${w.label}</div></div>`;
      }).join("") + `</div></div>`;
  };
  el("charts").innerHTML =
    chart("Encaissé par semaine", wk.map(w => w.encaisse), v => v ? (v >= 1000 ? Math.round(v / 100) / 10 + "k" : v) : "0") +
    chart("Closés par semaine", wk.map(w => w.closes), v => v);

  const names = Object.keys(s.people).sort();
  el("people").innerHTML = names.length
    ? tableHTML(
        [{ t: "Qui" }, { t: "Calés", n: 1 }, { t: "Effectués", n: 1 }, { t: "Show", n: 1 }, { t: "No-show", n: 1 }, { t: "Non aboutis", n: 1 }, { t: "Vers prez", n: 1 }, { t: "Vers closing", n: 1 }, { t: "Prez closées", n: 1 }, { t: "Closings closés", n: 1 }, { t: "Taux close", n: 1 }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        names.map(n => { const x = s.people[n]; return [
          { t: esc(n) }, { t: x.cales, n: 1 }, { t: x.effectues, n: 1 },
          { t: fmtPct(x.txShow), n: 1 }, { t: x.noShows + x.prezNoShow + x.closNoShow, n: 1 }, { t: x.nonAboutis, n: 1 },
          { t: x.versPrez, n: 1 }, { t: x.versClosing, n: 1 },
          { t: x.prezCloses, n: 1 }, { t: x.closCloses, n: 1 },
          { t: fmtPct(x.txClose), n: 1 },
          { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
        ]; }))
    : `<div class="empty">Aucun call loggé sur la période.</div>`;

  el("dot").className = "dot";
  el("updated").textContent = s.totalRecords + " calls loggés. Mis à jour à " +
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ".";
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
  el("page-" + id).classList.add("on");
  document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("active", x.dataset.page === id));
  el("pageTitle").textContent = PAGES[id][0];
  el("pageSub").textContent = PAGES[id][1];
  el("periodCtrls").style.display = id === "log" ? "none" : "";
}

// ----- Formulaire -----
function setType(t) {
  TYPE = t;
  document.querySelectorAll("#typeBtns button").forEach(b => b.classList.toggle("active", b.dataset.t === t));
  document.querySelectorAll("[data-only]").forEach(x => { x.style.display = x.dataset.only === t ? "" : "none"; });
}
function todayLocal() {
  const d = new Date(), p = n => n < 10 ? "0" + n : n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function majConditionnels() {
  const rs = el("inResSetting").value;
  el("caleBlock").style.display = rs === "Calé (à venir)" ? "" : "none";
  el("causeBlock").style.display = rs === "Non abouti" ? "" : "none";
  el("suiteBlock").style.display = (rs === "Part en prez" || rs === "Part en closing") ? "" : "none";
  el("rappelBlock").style.display = el("inCause").value === "À rappeler" ? "" : "none";
  const rp = el("inResPres").value;
  el("closePBlock").style.display = rp === "Closé" ? "" : "none";
  el("causePBlock").style.display = rp === "Pas closé" ? "" : "none";
  el("relancePBlock").style.display = rp === "À relancer" ? "" : "none";
  const rc = el("inResClosing").value;
  el("closeCBlock").style.display = rc === "Closé" ? "" : "none";
  el("causeCBlock").style.display = rc === "Pas closé" ? "" : "none";
  el("relanceCBlock").style.display = rc === "À relancer" ? "" : "none";
}
function resetForm() {
  document.querySelectorAll("#logForm input, #logForm textarea").forEach(i => i.value = "");
  document.querySelectorAll("#logForm select").forEach(sel => { if (sel.id !== "inQui" && sel.id !== "inRdvAvec") sel.value = ""; });
  el("inDate").value = todayLocal();
  majConditionnels();
}
async function submitForm(e) {
  e.preventDefault();
  const c = { type: TYPE, prospect: el("inProspect").value.trim() };
  if (!c.prospect) return alert("Le prospect est obligatoire.");
  c.instagram = el("inInsta").value.trim();
  c.telephone = el("inTel").value.trim();
  c.source = el("inSource").value;
  c.date = el("inDate").value || todayLocal();
  c.notes = el("inNotes").value.trim();
  if (MOI.role === "admin") c.qui = el("inQui").value;

  if (TYPE === "Setting") {
    c.res_setting = el("inResSetting").value;
    if (!c.res_setting) return alert("Le résultat du setting est obligatoire.");
    if (c.res_setting === "Calé (à venir)") {
      if (!el("inCaleLe").value) return alert("Indique quand le setting est calé.");
      c.rdv_le = new Date(el("inCaleLe").value).toISOString();
    }
    if (c.res_setting === "Non abouti") {
      c.cause = el("inCause").value;
      if (!c.cause) return alert("La cause est obligatoire.");
      if (c.cause === "À rappeler" && el("inDateRappel").value) c.date_relance = el("inDateRappel").value;
    }
    if (c.res_setting === "Part en prez" || c.res_setting === "Part en closing") {
      if (el("inSuiteLe").value) c.rdv_le = new Date(el("inSuiteLe").value).toISOString();
      c.rdv_avec = el("inRdvAvec").value;
      c.fiche = el("inFiche").value.trim();
    }
  }
  if (TYPE === "Prez") {
    c.res_pres = el("inResPres").value;
    if (!c.res_pres) return alert("Le résultat de la prez est obligatoire.");
    if (c.res_pres === "Closé") {
      c.offre = el("inOffreP").value;
      c.paiement = el("inPaiementP").value;
      if (el("inMontantP").value) c.montant = Number(el("inMontantP").value);
      if (el("inEncaisseP").value) c.encaisse = Number(el("inEncaisseP").value);
    }
    if (c.res_pres === "Pas closé") c.cause = el("inCauseP").value;
    if (c.res_pres === "À relancer" && el("inDateRelanceP").value) c.date_relance = el("inDateRelanceP").value;
  }
  if (TYPE === "Closing") {
    c.res_closing = el("inResClosing").value;
    if (!c.res_closing) return alert("Le résultat du closing est obligatoire.");
    if (c.res_closing === "Closé") {
      c.offre = el("inOffreC").value;
      c.paiement = el("inPaiementC").value;
      if (el("inMontantC").value) c.montant = Number(el("inMontantC").value);
      if (el("inEncaisseC").value) c.encaisse = Number(el("inEncaisseC").value);
    }
    if (c.res_closing === "Pas closé") c.cause = el("inCauseC").value;
    if (c.res_closing === "À relancer" && el("inDateRelanceC").value) c.date_relance = el("inDateRelanceC").value;
  }
  if (TYPE === "Paiement") {
    if (!el("inEncaissePmt").value) return alert("Le montant encaissé est obligatoire.");
    c.encaisse = Number(el("inEncaissePmt").value);
    c.paiement = "Solde";
  }
  el("submitBtn").disabled = true;
  try {
    await call("log", { call: c });
    resetForm();
    el("toast").style.display = "block";
    setTimeout(() => { el("toast").style.display = "none"; }, 3500);
    loadData();
  } catch (err) {
    alert("Erreur : " + err.message);
  } finally {
    el("submitBtn").disabled = false;
  }
}

async function loadData() {
  try {
    const d = await call("data");
    RECORDS = (d.calls || []).map(adapt);
    render();
    el("err").style.display = "none";
  } catch (e) {
    el("err").textContent = "Impossible de charger : " + e.message;
    el("err").style.display = "block";
    el("dot").className = "dot err";
    el("updated").textContent = "Hors ligne.";
  }
}

async function init() {
  if (!CODE) { el("lock").style.display = "block"; return; }
  try {
    const cfg = await call("config");
    MOI = cfg.moi; EQUIPE = cfg.equipe || [];
  } catch (e) {
    el("lock").style.display = "block";
    el("lockMsg").textContent = e.message === "code invalide"
      ? "Lien invalide ou désactivé. Demande ton lien personnel à Tony."
      : "Connexion impossible : " + e.message;
    return;
  }
  el("app").style.display = "";
  el("hello").textContent = "Salut " + MOI.nom;
  el("inRdvAvec").innerHTML = EQUIPE.map(n => `<option>${esc(n)}</option>`).join("");
  if (MOI.role === "admin") {
    el("fQuiAdmin").style.display = "";
    el("inQui").innerHTML = EQUIPE.map(n => `<option${n === MOI.nom ? " selected" : ""}>${esc(n)}</option>`).join("");
  }
  resetForm();
  setType("Setting");
  showPage(MOI.role === "admin" ? "dashboard" : "log");
  document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
  document.querySelectorAll("#typeBtns button").forEach(b => b.addEventListener("click", () => setType(b.dataset.t)));
  ["inResSetting", "inCause", "inResPres", "inResClosing"].forEach(i => el(i).addEventListener("change", majConditionnels));
  document.querySelectorAll("#periodCtrls button[data-p]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#periodCtrls button[data-p]").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); PERIOD = b.dataset.p; render();
  }));
  el("refresh").addEventListener("click", loadData);
  el("logForm").addEventListener("submit", submitForm);
  await loadData();
  setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 10 * 60 * 1000);
}
init();
