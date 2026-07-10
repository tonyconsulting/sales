// Front du site sales — parle uniquement à l'edge function (aucune clé ici).
const API = "https://gwococcxzrrtadtricnd.supabase.co/functions/v1/api";
const CODE = new URLSearchParams(location.search).get("c") || "";

let MOI = null, EQUIPE = [], RECORDS = [], RDVS = [], PERIOD = "7j", TYPE = "Setting", PLANFILTRE = "tous", VUEQUIPE = "toutes";
const NOM_EQUIPE = { kelian: "Team Kélian", mila: "Team Mila" };
const chipEquipe = e => (MOI && MOI.role === "admin" && e) ? `<span class="pill ${e === "mila" ? "teamM" : "teamK"}" title="${NOM_EQUIPE[e] || e}">${e === "mila" ? "M" : "K"}</span> ` : "";

const el = id => document.getElementById(id);
const eur = n => (Number(n) || 0).toLocaleString("fr-FR") + " €";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtPct = v => v === null || v === undefined ? "–" : v + " %";
const pad = n => n < 10 ? "0" + n : "" + n;
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const jolieDate = (ymd, today) => ymd === today ? "aujourd'hui" :
  JOURS[new Date(ymd + "T12:00:00").getDay()] + " " + ymd.slice(8, 10) + "/" + ymd.slice(5, 7);
const jourLocal = iso => SalesStats.ymdLocal(new Date(iso));
const heureLocale = iso => { const d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const quandJoli = (iso, today) => jolieDate(jourLocal(iso), today) + " à " + heureLocale(iso);

const PAGES = {
  log: ["Log un call", "Après chaque call, 20 secondes"],
  dashboard: ["Dashboard", "Vue d'ensemble"],
  pipeline: ["Pipeline", "Suivez vos deals"],
  prospects: ["Prospects", "Tous les prospects identifiés"],
  planning: ["Planning", "Les RDV à prendre et l'emploi du temps"],
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
  return { fields: f, createdTime: row.created_at, id: row.id, equipe: row.equipe };
}

function roleMatchFront(type, roleVente) {
  const r = String(roleVente || "");
  if (type === "Prez") return r.includes("presentateur") || r.includes("présentateur") || r.includes("closer");
  if (type === "Closing") return r.includes("closer");
  return false;
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

// ----- Planning / dispatch -----
function slotInfo(r) {
  const bits = [];
  bits.push("Prospect : " + esc(r.prospect) + (r.instagram ? " (" + esc(r.instagram) + ")" : r.telephone ? " (" + esc(r.telephone) + ")" : ""));
  bits.push("setter : " + esc(r.setter));
  if (r.source) bits.push(esc(r.source));
  return bits.join(" · ");
}
function etatTexte(r) {
  if (r.statut === "propose") return "En attente de " + esc(r.assigne_a) + " (référent)";
  if (r.statut === "ouvert") return "Ouvert — premier " + (r.type === "Prez" ? "présentateur/closer" : "closer") + " qui accepte le prend";
  if (r.statut === "decale") return "Décalage proposé par " + esc(r.proposition_par) + " (" + quandJoli(r.proposition, SalesStats.ymdLocal(new Date())) + ") — en attente du setter";
  return "";
}

function renderPlanning(today) {
  const moi = MOI.nom, admin = MOI.role === "admin";
  const actifs = rdvsVisibles().filter(r => r.statut !== "annule");
  const nonConfirmes = actifs.filter(r => r.statut !== "confirme");

  const pourMoi = nonConfirmes.filter(r =>
    (r.statut === "propose" && r.assigne_a === moi) ||
    (r.statut === "ouvert" && roleMatchFront(r.type, MOI.role_vente) && !(r.refusee_par || []).includes(moi) && r.setter !== moi));
  const propositions = actifs.filter(r => r.statut === "decale" && (admin || r.setter === moi));
  const enAttente = nonConfirmes.filter(r => !pourMoi.includes(r) && !propositions.includes(r));

  el("bPlan").style.display = (pourMoi.length + propositions.length) ? "" : "none";
  el("bPlan").textContent = pourMoi.length + propositions.length;

  const ficheHTML = r => r.fiche ? `<details style="margin-bottom:10px"><summary>fiche prospect</summary><div>${esc(r.fiche)}</div></details>` : "";
  const outilsSetter = r => (admin || r.setter === moi)
    ? (r.statut === "propose" ? `<button class="abtn" data-act="rdv_ouvre" data-id="${r.id}">Ouvrir à tous</button>` : "") +
      `<button class="abtn non" data-act="rdv_annule" data-id="${r.id}">Annuler</button>`
    : "";

  let html = "";
  if (pourMoi.length) {
    html += `<h2>À prendre — c'est pour toi</h2>` + pourMoi.map(r => `
      <div class="slot">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}</div>
        <div class="sinfo">${slotInfo(r)}</div>
        ${ficheHTML(r)}
        <div class="abtns">
          <button class="abtn oui" data-act="rdv_accept" data-id="${r.id}">Je le prends</button>
          <button class="abtn non" data-act="rdv_refuse" data-id="${r.id}">Pas dispo</button>
          <button class="abtn" data-act="toggle-decale" data-id="${r.id}">Proposer un autre horaire</button>
        </div>
        <div class="decale-inline" id="dec-${r.id}">
          <input type="datetime-local" id="dech-${r.id}">
          <button class="abtn oui" data-act="rdv_propose" data-id="${r.id}">Envoyer la proposition</button>
        </div>
      </div>`).join("");
  }
  if (propositions.length) {
    html += `<h2>Propositions de décalage à valider (vérifie avec le prospect)</h2>` + propositions.map(r => `
      <div class="slot">
        <div class="stitre">${esc(r.type)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${esc(r.proposition_par)} propose ${quandJoli(r.proposition, today)} au lieu de ${quandJoli(r.quand, today)}</div>
        <div class="abtns">
          <button class="abtn oui" data-act="prop-oui" data-id="${r.id}">Le prospect est ok</button>
          <button class="abtn non" data-act="prop-non" data-id="${r.id}">Refuser (repart à l'équipe)</button>
        </div>
      </div>`).join("");
  }
  if (enAttente.length) {
    html += `<h2>En cours d'attribution</h2>` + enAttente.map(r => `
      <div class="slot grise">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}</div>
        <div class="sinfo">${slotInfo(r)}</div>
        <div class="setat">${etatTexte(r)}</div>
        <div class="abtns">${outilsSetter(r)}</div>
      </div>`).join("");
  }
  el("aprendre").innerHTML = html || `<div class="empty">Rien à attribuer pour l'instant. Les prez et closings calés par les setters arrivent ici.</div>`;
  el("propositions").innerHTML = "";

  // Emploi du temps (aujourd'hui -> +14 jours)
  let liste = actifs.filter(r => jourLocal(r.quand) >= today);
  if (PLANFILTRE === "moi") liste = liste.filter(r => r.assigne_a === moi || r.setter === moi);
  liste.sort((a, c) => a.quand.localeCompare(c.quand));
  const parJour = {};
  liste.forEach(r => { const j = jourLocal(r.quand); (parJour[j] = parJour[j] || []).push(r); });
  el("planning").innerHTML = Object.keys(parJour).length
    ? Object.keys(parJour).sort().map(j =>
        `<div class="jour">${jolieDate(j, today)}</div>` +
        parJour[j].map(r => `
          <div class="pl ${r.statut === "confirme" ? "" : "grise"}">
            <span class="h">${heureLocale(r.quand)}</span>
            ${chipEquipe(r.equipe)}<span class="pill grey">${esc(r.type)}</span>
            <span>${esc(r.prospect)}</span>
            <span class="pill">${r.assigne_a ? esc(r.assigne_a) : "?"}</span>
            <span class="conf ${r.statut === "confirme" ? "today" : ""}" style="font-size:12px">${r.statut === "confirme" ? "confirmé" : "en attente"}</span>
          </div>`).join("")).join("")
    : `<div class="empty">Aucun RDV à venir${PLANFILTRE === "moi" ? " pour toi" : ""}.</div>`;

  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.id, act = b.dataset.act;
    try {
      if (act === "toggle-decale") { const d = el("dec-" + id); d.style.display = d.style.display === "flex" ? "none" : "flex"; return; }
      if (act === "rdv_propose") {
        const v = el("dech-" + id).value;
        if (!v) return alert("Choisis le nouvel horaire.");
        await call("rdv_propose", { id, quand: new Date(v).toISOString() });
      } else if (act === "prop-oui") await call("rdv_reponse_proposition", { id, ok: true });
      else if (act === "prop-non") await call("rdv_reponse_proposition", { id, ok: false });
      else if (act === "rdv_annule") { if (!confirm("Annuler ce RDV ?")) return; await call("rdv_annule", { id }); }
      else await call(act, { id });
      await loadData();
    } catch (e) { alert(e.message); }
  }));

  // Dashboard : RDV du jour depuis le planning
  const jour = actifs.filter(r => jourLocal(r.quand) === today).sort((a, c) => a.quand.localeCompare(c.quand));
  el("k1").textContent = jour.length;
  el("rdvjour").innerHTML = jour.length
    ? tableHTML(
        [{ t: "Heure" }, { t: "Quoi" }, { t: "Prospect" }, { t: "Avec" }, { t: "Setter" }, { t: "Statut" }, { t: "Fiche" }],
        jour.map(r => [
          { t: heureLocale(r.quand) },
          { t: `<span class="pill grey">${esc(r.type)}</span>` },
          { t: esc(r.prospect) },
          { t: `<span class="pill">${r.assigne_a ? esc(r.assigne_a) : "?"}</span>` },
          { t: esc(r.setter) },
          { t: r.statut === "confirme" ? `<span class="today">confirmé</span>` : `<span class="late">en attente</span>` },
          { t: r.fiche ? `<details><summary>voir</summary><div>${esc(r.fiche)}</div></details>` : "" }
        ]))
    : `<div class="empty">Aucun RDV aujourd'hui.</div>`;
}

// Vue admin : filtre par équipe appliqué avant tous les calculs
function recsVisibles() {
  if (MOI.role !== "admin" || VUEQUIPE === "toutes") return RECORDS;
  return RECORDS.filter(r => r.equipe === VUEQUIPE);
}
function rdvsVisibles() {
  if (MOI.role !== "admin" || VUEQUIPE === "toutes") return RDVS;
  return RDVS.filter(r => r.equipe === VUEQUIPE);
}

function render() {
  const s = SalesStats.compute(recsVisibles(), PERIOD, new Date());
  const g = s.global;
  const F = SalesStats.F;

  el("bRel").style.display = s.matin.relancesAFaire ? "" : "none";
  el("bRel").textContent = s.matin.relancesAFaire;

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

  const calls = recsVisibles().slice()
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
            { t: chipEquipe(r.equipe) + `<span class="pill grey">${esc(f[F.type] || "?")}</span>` },
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

  renderPlanning(s.today);

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
  el("periodCtrls").style.display = (id === "log" || id === "planning") ? "none" : "";
}

// ----- Formulaire -----
function setType(t) {
  TYPE = t;
  document.querySelectorAll("#typeBtns button").forEach(b => b.classList.toggle("active", b.dataset.t === t));
  document.querySelectorAll("[data-only]").forEach(x => { x.style.display = x.dataset.only === t ? "" : "none"; });
}
function todayLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
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
  document.querySelectorAll("#logForm select").forEach(sel => { if (sel.id !== "inQui") sel.value = ""; });
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
  if (MOI.role === "admin") {
    c.qui = el("inQui").value;
    if (el("fEquipeAdmin").style.display !== "none") c.equipe = el("inEquipe").value;
  }

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
      if (!el("inSuiteLe").value) return alert("Indique quand la suite est calée.");
      c.rdv_le = new Date(el("inSuiteLe").value).toISOString();
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
    const r = await call("log", { call: c });
    resetForm();
    el("toast").textContent = r.rdv ? "Call enregistré. Le RDV est parti au dispatch (onglet Planning)." : "Call enregistré.";
    el("toast").style.display = "block";
    setTimeout(() => { el("toast").style.display = "none"; }, 4000);
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
    RDVS = d.rdvs || [];
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
  if (MOI.role === "admin") {
    el("fQuiAdmin").style.display = "";
    el("inQui").innerHTML = EQUIPE.map(m => `<option${m.nom === MOI.nom ? " selected" : ""}>${esc(m.nom)}</option>`).join("");
    el("vueEquipe").style.display = "";
    el("vueEquipe").addEventListener("change", () => { VUEQUIPE = el("vueEquipe").value; render(); });
    const majEquipeForm = () => {
      const m = EQUIPE.find(x => x.nom === el("inQui").value);
      el("fEquipeAdmin").style.display = (m && m.equipe) ? "none" : "";
    };
    el("inQui").addEventListener("change", majEquipeForm);
    majEquipeForm();
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
  el("planMoi").addEventListener("click", () => { PLANFILTRE = "moi"; el("planMoi").classList.add("active"); el("planTous").classList.remove("active"); render(); });
  el("planTous").addEventListener("click", () => { PLANFILTRE = "tous"; el("planTous").classList.add("active"); el("planMoi").classList.remove("active"); render(); });
  el("refresh").addEventListener("click", loadData);
  el("logForm").addEventListener("submit", submitForm);
  await loadData();
  setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 10 * 60 * 1000);
}
init();
