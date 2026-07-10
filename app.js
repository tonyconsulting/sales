// Front du site sales — parle uniquement à l'edge function (aucune clé ici).
const API = "https://gwococcxzrrtadtricnd.supabase.co/functions/v1/api";
const CODE = new URLSearchParams(location.search).get("c") || "";

let MOI = null, EQUIPE = [], RECORDS = [], PERIOD = "mois", TYPE = "Setting";

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
  rdv: ["Rendez-vous", "Les RDV posés à venir"],
  appels: ["Appels", "Les 100 derniers calls loggés"],
  relances: ["Relances", "Les follow-ups à faire"],
  kpi: ["KPI", "Analysez vos perfs"]
};
const ETAT_PILL = { "Closé": "", "À relancer": "amber", "En closing": "", "RDV posé": "", "Perdu": "red", "Contacté": "grey" };

// Adaptateur : ligne base de données -> format attendu par le moteur de stats
const MAP = {
  type: "Type de call", date: "Date", qui: "Qui", telephone: "Téléphone",
  instagram: "Instagram", source: "Source", res_setting: "Résultat setting",
  rdv_le: "RDV prévu le", rdv_avec: "RDV avec", fiche: "Fiche prospect",
  res_pres: "Résultat présentation", res_closing: "Résultat closing",
  offre: "Offre vendue", montant: "Montant total", encaisse: "Encaissé aujourd'hui",
  paiement: "Type de paiement", date_relance: "Date de relance",
  prospect: "Prospect", notes: "Notes"
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
  const s = SalesStats.compute(RECORDS, PERIOD, new Date(), {});
  const p = s.periode;

  el("bRdv").style.display = s.rdvJour.length ? "" : "none";
  el("bRdv").textContent = s.rdvJour.length;
  el("bRel").style.display = s.matin.relancesAFaire ? "" : "none";
  el("bRel").textContent = s.matin.relancesAFaire;

  el("k1").textContent = s.matin.rdvHier;
  el("k1h").textContent = "settings du " + s.yesterday;
  el("k2").textContent = eur(s.matin.encaisseMois);
  el("k2h").textContent = "closings + paiements loggés";
  el("k3").textContent = s.matin.relancesAFaire;
  el("k3h").textContent = s.matin.relancesAFaire ? "dont en retard : " + s.relances.filter(r => r.date < s.today).length : "rien en attente";

  el("strip").innerHTML = [
    ["Vendu (période)", eur(p.vendu)],
    ["Encaissé (période)", eur(p.encaisse)],
    ["Taux de closing", fmtPct(p.txClose)],
    ["Show-up", fmtPct(p.showUp)],
    ["No-show", fmtPct(p.txNoShow)],
    ["Passe en closing", fmtPct(p.txPres)],
    ["Deals perdus", p.dealsPerdus],
    ["Closés après relance", fmtPct(p.txApresRelance)]
  ].map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

  const rdvT = rows => tableHTML(
    [{ t: "Quand" }, { t: "Heure" }, { t: "Prospect" }, { t: "Avec" }, { t: "Setter" }, { t: "Contact" }, { t: "Fiche" }],
    rows.map(r => [
      { t: r.jour === s.today ? `<span class="today">${jolieDate(r.jour, s.today)}</span>` : esc(jolieDate(r.jour, s.today)) },
      { t: esc(r.heure) || "?" }, { t: esc(r.prospect) }, { t: `<span class="pill">${esc(r.avec)}</span>` },
      { t: esc(r.setter) }, { t: esc(r.contact) },
      { t: r.fiche ? `<details><summary>voir</summary><div>${esc(r.fiche)}</div></details>` : "" }
    ]));
  el("rdvjour").innerHTML = s.rdvJour.length ? rdvT(s.rdvJour) : `<div class="empty">Aucun RDV aujourd'hui.</div>`;
  el("rdv").innerHTML = s.rdvAVenir.length ? rdvT(s.rdvAVenir.slice(0, 30)) : `<div class="empty">Aucun RDV à venir. Le moment idéal pour poser des settings.</div>`;

  const pi = s.pipeline;
  const maxPi = Math.max(pi.contacte, pi.rdvPose, pi.enClosing, pi.aRelancer, pi.close, pi.perdu, 1);
  const bar = (label, n, cls, eurVal) => `<div class="row"><div class="name">${label}${eurVal ? `<br><span class="eur">${eur(eurVal)}</span>` : ""}</div><div class="bar"><i class="${cls || ""}" style="width:${Math.round(n / maxPi * 100)}%"></i></div><div class="n">${n}</div></div>`;
  el("pipe").innerHTML = pi.total
    ? `<div class="pipe">` + bar("Contacté", pi.contacte, "grey") + bar("RDV posé", pi.rdvPose) + bar("En closing", pi.enClosing) +
      bar("À relancer", pi.aRelancer, "", pi.aRelancerEur) + bar("Closé", pi.close, "", pi.closeEur) + bar("Perdu", pi.perdu, "red") + `</div>`
    : `<div class="empty">Aucun prospect identifié pour l'instant (l'Instagram relie les calls d'un même prospect).</div>`;

  const ORDRE = ["Contacté", "RDV posé", "En closing", "À relancer", "Closé", "Perdu"];
  el("kanban").innerHTML = s.prospects.length
    ? ORDRE.map(etat => {
        const list = s.prospects.filter(x => x.etat === etat);
        const cards = list.slice(0, 20).map(x =>
          `<div class="kcard"><div class="kn">${esc(x.nom || x.contact || "?")}</div><div class="kc">${esc(x.contact)}</div>` +
          (etat === "Closé" && x.vendu ? `<div class="ke">${eur(x.vendu)}</div>` : "") +
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
  const F = SalesStats.F;
  const headA = [{ t: "Date" }, { t: "Type" }, { t: "Qui" }, { t: "Prospect" }, { t: "Résultat" }, { t: "Montant", n: 1 }, { t: "Encaissé", n: 1 }];
  if (MOI.role === "admin") headA.push({ t: "" });
  el("appels").innerHTML = calls.length
    ? tableHTML(headA,
        calls.map(r => {
          const f = r.fields || {};
          const res = f[F.resSetting] || f[F.resPres] || f[F.resClosing] || (f[F.type] === "Paiement" ? "Encaissement" : "–");
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
    chart("Taux de closing par semaine", wk.map(w => w.tx), v => v + "%");

  const names = Object.keys(s.people).sort();
  el("people").innerHTML = names.length
    ? tableHTML(
        [{ t: "Qui" }, { t: "Settings", n: 1 }, { t: "RDV posés", n: 1 }, { t: "Prés. tenues", n: 1 }, { t: "Passe closing", n: 1 }, { t: "Closings", n: 1 }, { t: "Closés", n: 1 }, { t: "Taux close", n: 1 }, { t: "No-show", n: 1 }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        names.map(n => { const x = s.people[n]; return [
          { t: esc(n) }, { t: x.settings, n: 1 }, { t: x.rdvPoses, n: 1 },
          { t: x.presTenues, n: 1 }, { t: x.presPasse, n: 1 }, { t: x.closPris, n: 1 }, { t: x.closes, n: 1 },
          { t: fmtPct(x.closPris ? Math.round(x.closes / x.closPris * 100) : null), n: 1 },
          { t: x.noShows, n: 1 }, { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
        ]; }))
    : `<div class="empty">Aucun call loggé sur la période.</div>`;

  const srcs = Object.keys(s.sources).sort();
  el("sources").innerHTML = srcs.length
    ? tableHTML(
        [{ t: "Source" }, { t: "Settings", n: 1 }, { t: "RDV posés", n: 1 }, { t: "Closés (Insta matché)", n: 1 }],
        srcs.map(n => { const x = s.sources[n]; return [{ t: esc(n) }, { t: x.settings, n: 1 }, { t: x.rdvPoses, n: 1 }, { t: x.closes, n: 1 }]; }))
    : `<div class="empty">Aucune donnée de source sur la période.</div>`;

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
function resetForm() {
  ["inProspect", "inInsta", "inTel", "inFiche", "inMontant", "inEncaisse", "inEncaissePmt", "inNotes", "inRdvLe", "inDateRelance"].forEach(i => el(i).value = "");
  ["inSource", "inResSetting", "inResPres", "inResClosing", "inOffre", "inPaiement", "inPaiementPmt"].forEach(i => el(i).value = "");
  el("inDate").value = todayLocal();
  el("rdvBlock").style.display = "none";
  el("relanceBlock").style.display = "none";
}
async function submitForm(e) {
  e.preventDefault();
  const c = { type: TYPE, prospect: el("inProspect").value.trim() };
  if (!c.prospect) return alert("Le prénom du prospect est obligatoire.");
  c.instagram = el("inInsta").value.trim();
  c.telephone = el("inTel").value.trim();
  c.source = el("inSource").value;
  c.date = el("inDate").value || todayLocal();
  c.notes = el("inNotes").value.trim();
  if (MOI.role === "admin") c.qui = el("inQui").value;
  if (TYPE === "Setting") {
    c.res_setting = el("inResSetting").value;
    if (!c.res_setting) return alert("Le résultat du setting est obligatoire.");
    if (c.res_setting === "RDV posé") {
      if (el("inRdvLe").value) c.rdv_le = new Date(el("inRdvLe").value).toISOString();
      c.rdv_avec = el("inRdvAvec").value;
      c.fiche = el("inFiche").value.trim();
    }
  }
  if (TYPE === "Présentation") {
    c.res_pres = el("inResPres").value;
    if (!c.res_pres) return alert("Le résultat de la présentation est obligatoire.");
  }
  if (TYPE === "Closing") {
    c.res_closing = el("inResClosing").value;
    if (!c.res_closing) return alert("Le résultat du closing est obligatoire.");
    c.offre = el("inOffre").value;
    c.paiement = el("inPaiement").value;
    if (el("inMontant").value) c.montant = Number(el("inMontant").value);
    if (el("inEncaisse").value) c.encaisse = Number(el("inEncaisse").value);
    if (c.res_closing === "À relancer" && el("inDateRelance").value) c.date_relance = el("inDateRelance").value;
  }
  if (TYPE === "Paiement") {
    if (!el("inEncaissePmt").value) return alert("Le montant encaissé est obligatoire pour un paiement.");
    c.encaisse = Number(el("inEncaissePmt").value);
    c.paiement = el("inPaiementPmt").value;
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
  el("inResSetting").addEventListener("change", () => { el("rdvBlock").style.display = el("inResSetting").value === "RDV posé" ? "" : "none"; });
  el("inResClosing").addEventListener("change", () => { el("relanceBlock").style.display = el("inResClosing").value === "À relancer" ? "" : "none"; });
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
