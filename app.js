// Front du site sales — parle uniquement à l'edge function (aucune clé ici).
const API = "https://gwococcxzrrtadtricnd.supabase.co/functions/v1/api";
// Le code perso est mémorisé : le site marche aussi ouvert sans ?c=
// (indispensable pour la version « écran d'accueil » iPhone).
let CODE = new URLSearchParams(location.search).get("c") || "";
try {
  if (CODE) localStorage.setItem("sales_code", CODE);
  else CODE = localStorage.getItem("sales_code") || "";
} catch (_) {}
// Clé PUBLIQUE de signature des notifications (la privée est côté serveur)
const VAPID_PUB = "BBefpGJrlJu2jhuahy0XnidzpnE5nfZ84kRh3YueXISXD036WLlbQu50vebuJcKKiF05xz5Cj_C__Qa8wc_YWNQ";

let MOI = null, EQUIPE = [], RECORDS = [], RDVS = [], SERVER_OFFSET = 0, OFFRES_VUES = new Set(), FILE_RELANCES = [], FILE_IDX = 0, PERIOD = "1j", TYPE = "Setting", PLANFILTRE = "tous", VUEQUIPE = "toutes", VUEMOI = "equipe", PENDING_RDV = null, PENDING_PROSPECT = "", PENDING_TYPE = "", PENDING_TEL = "", PENDING_TEL_PROSPECT = "";
const NOM_EQUIPE = { kelian: "Team Kélian", mila: "Team Mila" };
const voitTout = () => MOI && (MOI.role === "admin" || MOI.role === "observateur");
const chipEquipe = e => (voitTout() && e) ? `<span class="pill ${e === "mila" ? "teamM" : "teamK"}" title="${NOM_EQUIPE[e] || e}">${e === "mila" ? "M" : "K"}</span> ` : "";

const el = id => document.getElementById(id);
const maintenantServeur = () => Date.now() + SERVER_OFFSET;
const formatDelaiPrise = s => {
  if (s <= 240) return s < 120 ? "pris en " + s + " s" : "pris en " + Math.round(s / 60) + " min";
  const m = Math.max(1, Math.round((s - 240) / 60));
  return m < 60 ? "pris avec " + m + " min de retard" : m < 1440 ? "pris avec " + Math.round(m / 60) + " h de retard" : "pris avec " + Math.round(m / 1440) + " j de retard";
};
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
  kpi: ["KPI", "Analysez vos perfs"],
  reglages: ["Réglages", "Rappels automatiques et messages de relance"]
};
const ETAT_PILL = { "Closé": "", "À relancer": "amber", "RDV de vente": "", "Vu en setting": "grey", "Setting calé": "grey", "Perdu": "red", "Contacté": "grey" };
// Messages de relance prêts à coller (DM Instagram), par catégorie
const MSG_RELANCE = {
  "No-show": "Coucou {prenom} ! On avait rendez-vous {date} et on s'est loupés, aucun souci ça arrive. Tu préfères qu'on recale ça quand ?",
  "Pas le budget": "Coucou {prenom} ! On s'était parlé {date} et le timing n'était pas le bon côté budget. Je repense à toi : ça a évolué de ton côté ?",
  "Réfléchit": "Coucou {prenom} ! Tu voulais prendre le temps d'y réfléchir après notre échange, ce que je comprends. Tu en es où ?",
  "À rappeler": "Coucou {prenom} ! Comme convenu je reviens vers toi suite à notre échange. C'est toujours ok pour qu'on s'appelle ?",
  "À relancer": "Coucou {prenom} ! Comme convenu on se recontacte suite à notre appel. Toujours partant ? Dis-moi tes dispos.",
  "Pas intéressé": "Coucou {prenom} ! On s'était parlé {date}, je voulais prendre de tes nouvelles. Si les choses ont bougé de ton côté, je suis là.",
  confirmation: "Coucou {prenom} ! On se retrouve {date} pour notre appel. Tu me confirmes que c'est toujours bon pour toi ?",
  defaut: "Coucou {prenom} ! Je reviens vers toi suite à notre dernier échange. Dis-moi quand tu es dispo pour qu'on s'appelle."
};
let MSG_SRV = {}; // textes modifiés par Tony dans Réglages (config serveur)
let PARAMS = {};  // scripts et réponses aux objections (Réglages, onglet Scripts)
const msgRelance = r => (MSG_SRV[r.categorie] || MSG_RELANCE[r.categorie] || MSG_SRV.defaut || MSG_RELANCE.defaut)
  .replace("{prenom}", (r.prospect || "").trim().split(/\s+/)[0] || "")
  .replace("{date}", r.echange ? jolieDate(r.echange, SalesStats.ymdLocal(new Date())) : "récemment");

const CATS_MSG = ["No-show", "Pas intéressé", "Pas le budget", "Réfléchit", "À rappeler", "À relancer", "confirmation", "defaut"];
const CAT_LABEL = { confirmation: "Confirmation de RDV (bouton du planning)", defaut: "Autres cas (Non qualifié, Autre...)" };
// Pilules de réglage (même style que la barre de filtres)
const IC_REG = {
  qui: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/></svg>',
  cond: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z"/></svg>',
  temps: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  etat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
  titre: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>'
};
const pilule = (icone, contenu) => `<div class="fsel fsel-b">${icone}${contenu}</div>`;

// Catalogue des notifications d'événements (textes modifiables dans Réglages)
const NOTIFS_CATALOGUE = [
  { cle: "vente_propose", label: "RDV proposé au closer de référence", balises: "{prospect} {quand} {setter}", defaut: ["RDV de vente — 2 min pour le prendre", "{prospect}, {quand} (setter : {setter}). Ouvre la notif et accepte."] },
  { cle: "vente_ouverte", label: "RDV ouvert à toute l'équipe", balises: "{prospect} {quand} {setter}", defaut: ["RDV ouvert — premier qui accepte", "{prospect}, {quand} (setter : {setter}). 2 minutes pour le prendre."] },
  { cle: "offre_reping", label: "Rappel 30 s avant l'ouverture (au closer proposé)", balises: "{prospect} {quand}", defaut: ["Plus que 30 secondes", "{prospect}, {quand} — après, le RDV part à toute l'équipe."] },
  { cle: "rdv_orphelin", label: "RDV sans preneur (aux admins)", balises: "{prospect} {quand}", defaut: ["RDV sans preneur", "{prospect}, {quand}. Réassigne-le depuis ton dashboard."] },
  { cle: "confirme_veille", label: "Veille 18 h — RDV à confirmer (au setter)", balises: "{prospect} {quand}", defaut: ["À confirmer pour demain", "{prospect}, {quand}. Envoie-lui le message de confirmation."] },
  { cle: "rdv_pris", label: "RDV pris (envoyée au setter)", balises: "{qui} {prospect} {quand} {delai}", defaut: ["RDV pris", "{qui} a pris {prospect}, {quand} {delai}."] },
  { cle: "proposition", label: "Proposition d'horaire (au setter)", balises: "{qui} {nouveau} {prospect} {quand}", defaut: ["Proposition d'horaire à valider", "{qui} propose {nouveau} pour {prospect} (au lieu de {quand})."] },
  { cle: "horaire_confirme", label: "Horaire confirmé (à celui qui a proposé)", balises: "{prospect} {quand}", defaut: ["Horaire confirmé", "{prospect} est confirmé {quand}."] },
  { cle: "vente_closee", label: "Vente closée (à toi)", balises: "{montant}", defaut: ["Order !", "{montant}, 1 vente by K.NE"] }
];

// Options des menus « Résultat… » rapides (prospects + retards)
const RES_Q_SETTING = ["No-show", "Non abouti", "RDV de vente calé"];
const RES_Q_VENTE = ["Closé", "Pas closé", "No-show", "À relancer"];
const quickresHTML = r => `<select class="quickres" data-rdv="${r.id}"><option value="">${r.type === "Setting" ? "Résultat du setting…" : "Résultat de la vente…"}</option>` +
  (r.type === "Setting" ? RES_Q_SETTING : RES_Q_VENTE).map(o => `<option>${o}</option>`).join("") + `</select>`;

const MAP = {
  type: "Type de call", date: "Date", qui: "Qui", telephone: "Téléphone",
  instagram: "Instagram", source: "Source", res_setting: "Résultat setting",
  rdv_le: "RDV prévu le", rdv_avec: "RDV avec", fiche: "Fiche prospect",
  res_pres: "Résultat présentation", res_closing: "Résultat closing",
  offre: "Offre vendue", montant: "Montant total", encaisse: "Encaissé aujourd'hui",
  paiement: "Type de paiement", date_relance: "Date de relance",
  prospect: "Prospect", notes: "Notes", cause: "Cause", qui_presentation: "Présentation par",
  objection: "Objection"
};
function adapt(row) {
  const f = {};
  for (const k in MAP) if (row[k] !== null && row[k] !== undefined && row[k] !== "") f[MAP[k]] = row[k];
  return { fields: f, createdTime: row.created_at, id: row.id, equipe: row.equipe, rdvId: row.rdv_id || null };
}

function roleMatchFront(type, roleVente) {
  const r = String(roleVente || "");
  if (type === "Prez" || type === "Vente") return r.includes("presentateur") || r.includes("présentateur") || r.includes("closer");
  if (type === "Closing") return r.includes("closer");
  return false;
}

async function call(action, extra) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ code: CODE, action }, extra || {}))
  });
  let j = {};
  try { j = await res.json(); } catch (_) { /* réponse non-JSON = panne côté serveur */ }
  if (!res.ok) throw new Error(j.error || ("erreur " + res.status + " — réessaie dans une minute"));
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
  if (r.statut === "ouvert") return "Ouvert — le premier qui accepte le prend (closer ou présentateur)";
  if (r.statut === "decale") return "Décalage proposé par " + esc(r.proposition_par) + " (" + quandJoli(r.proposition, SalesStats.ymdLocal(new Date())) + ") — en attente du setter";
  return "";
}

function renderPlanning(today) {
  const moi = MOI.nom, admin = MOI.role === "admin";
  // Préserver une saisie d'horaire en cours (le re-render toutes les 10 min l'effacerait)
  const inlinesOuverts = [...document.querySelectorAll(".decale-inline")].filter(x => x.style.display === "flex").map(x => x.id);
  const saisiesInline = {};
  document.querySelectorAll(".decale-inline input").forEach(i => { if (i.value) saisiesInline[i.id] = i.value; });
  const retardOuvert = !!document.querySelector("details.retard[open]");
  const actifs = rdvsVisibles().filter(r => r.statut !== "annule" && r.statut !== "fait");
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

  const reassignHTML = r => !admin ? "" : `
        <select class="quickres" data-reassigner="${r.id}">
          <option value="">Réassigner à…</option>
          ${EQUIPE.filter(m => m.equipe === r.equipe && roleMatchFront(r.type, m.role_vente)).map(m => `<option>${esc(m.nom)}</option>`).join("")}
        </select>`;
  let html = "";
  if (pourMoi.length) {
    html += `<h2>À prendre — c'est pour toi</h2>` + pourMoi.map(r => `
      <div class="slot" ${r.offre_niveau >= 3 ? 'style="border-color:#7f1d1d"' : ""}>
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}${r.offre_niveau >= 3 ? ' · <span class="late">SANS PRENEUR</span>' : ""}</div>
        <div class="sinfo">${slotInfo(r)}</div>
        ${ficheHTML(r)}
        <div class="abtns">
          <button class="abtn oui" data-act="rdv_accept" data-id="${r.id}">Je le prends</button>
          <button class="abtn non" data-act="rdv_refuse" data-id="${r.id}">Pas dispo</button>
          <button class="abtn" data-act="toggle-decale" data-id="${r.id}">Proposer un autre horaire</button>
          ${r.offre_niveau >= 3 ? reassignHTML(r) : ""}
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
  const mesConfirmes = actifs.filter(r => r.statut === "confirme" && (admin || r.assigne_a === moi || r.setter === moi))
    .sort((a, c) => a.quand.localeCompare(c.quand));
  const deplaceHTML = r => `
        <div class="decale-inline" id="dep-${r.id}">
          <input type="datetime-local" id="deph-${r.id}">
          <button class="abtn oui" data-act="rdv_deplace" data-id="${r.id}">Valider le nouvel horaire</button>
        </div>`;
  // Plus de 2 jours sans résultat -> section repliée « à régulariser »
  // (comme le « masqué » du dashboard Mila : rien ne pourrit dans la vue)
  const seuilRetard = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const aLogger = mesConfirmes.filter(r => jourLocal(r.quand) <= today && r.quand >= seuilRetard);
  const aVenir = mesConfirmes.filter(r => jourLocal(r.quand) > today);
  const confHTML = r => r.type !== "Vente" ? "" : (r.confirme_prospect
    ? `<div class="sinfo" style="color:var(--accent)">Confirmé par le prospect</div>`
    : `<div class="abtns" style="margin-bottom:10px">
        <button class="abtn" data-act="copie-conf" data-id="${r.id}" data-nom="${esc(r.prospect)}" data-quand="${r.quand}">Copier le message de confirmation</button>
        <button class="abtn oui" data-act="conf-prospect" data-id="${r.id}">Le prospect a confirmé</button>
      </div>`);
  const prisHTML = r => r.pris_en_s ? `<div class="sinfo" style="font-size:12px">${formatDelaiPrise(r.pris_en_s)}</div>` : "";
  const enRetard = mesConfirmes.filter(r => r.quand < seuilRetard);
  if (aLogger.length) {
    html += `<h2>À logger — l'appel est passé (ou c'est aujourd'hui)</h2>` + aLogger.map(r => `
      <div class="slot">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${esc(r.assigne_a)}</div>
        ${prisHTML(r)}
        ${r.qualif ? `<div class="sinfo">${esc(r.qualif)}</div>` : ""}
        ${r.quand > new Date().toISOString() ? confHTML(r) : ""}
        ${ficheHTML(r)}
        <div class="abtns">
          <button class="abtn oui" data-act="log-resultat" data-id="${r.id}">Log le résultat (pré-rempli)</button>
          <button class="abtn" data-act="toggle-deplace" data-id="${r.id}">Décaler</button>
          ${outilsSetter(r)}
        </div>
        ${deplaceHTML(r)}
      </div>`).join("");
  }
  if (aVenir.length) {
    html += `<h2>À venir — confirmés</h2>` + aVenir.map(r => `
      <div class="slot">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${esc(r.assigne_a)}</div>
        ${prisHTML(r)}
        ${r.qualif ? `<div class="sinfo">${esc(r.qualif)}</div>` : ""}
        ${confHTML(r)}
        ${ficheHTML(r)}
        <div class="abtns">
          <button class="abtn" data-act="toggle-deplace" data-id="${r.id}">Décaler</button>
          ${outilsSetter(r)}
        </div>
        ${deplaceHTML(r)}
      </div>`).join("");
  }
  if (enAttente.length) {
    html += `<h2>En cours d'attribution</h2>` + enAttente.map(r => `
      <div class="slot ${r.offre_niveau >= 3 ? "" : "grise"}" ${r.offre_niveau >= 3 ? 'style="border-color:#7f1d1d"' : ""}>
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}${r.offre_niveau >= 3 ? ' · <span class="late">SANS PRENEUR</span>' : ""}</div>
        <div class="sinfo">${slotInfo(r)}</div>
        <div class="setat">${etatTexte(r)}</div>
        <div class="abtns">${reassignHTML(r)}${outilsSetter(r)}</div>
      </div>`).join("");
  }
  if (enRetard.length) {
    html += `<details class="retard"><summary>En retard — à régulariser (${enRetard.length})</summary>` +
      enRetard.map(r => `
      <div class="slot grise">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${esc(r.assigne_a)} — résultat jamais loggé</div>
        <div class="abtns">${quickresHTML(r)} ${outilsSetter(r)}</div>
      </div>`).join("") + `</details>`;
  }
  el("aprendre").innerHTML = html || `<div class="empty">Rien pour l'instant. Les settings calés et les RDV de vente arrivent ici.</div>`;
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

  inlinesOuverts.forEach(id => { const d = el(id); if (d) d.style.display = "flex"; });
  Object.entries(saisiesInline).forEach(([id, v]) => { const i = el(id); if (i) i.value = v; });
  if (retardOuvert) { const det = document.querySelector("details.retard"); if (det) det.open = true; }

  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.id, act = b.dataset.act;
    try {
      if (act === "toggle-decale") { const d = el("dec-" + id); d.style.display = d.style.display === "flex" ? "none" : "flex"; return; }
      if (act === "toggle-deplace") { const d = el("dep-" + id); d.style.display = d.style.display === "flex" ? "none" : "flex"; return; }
      if (act === "rdv_deplace") {
        const v = el("deph-" + id).value;
        if (!v) return alert("Choisis le nouvel horaire.");
        await call("rdv_deplace", { id, quand: new Date(v).toISOString() });
        await loadData();
        return;
      }
      if (act === "conf-prospect") {
        await call("rdv_confirme_prospect", { id, ok: true });
        await loadData();
        return;
      }
      if (act === "copie-conf") {
        const msg = (MSG_SRV.confirmation || MSG_RELANCE.confirmation)
          .replace("{prenom}", (b.dataset.nom || "").trim().split(/\s+/)[0] || "")
          .replace("{date}", quandJoli(b.dataset.quand, SalesStats.ymdLocal(new Date())));
        try { await navigator.clipboard.writeText(msg); b.textContent = "Copié, colle-le en DM"; setTimeout(() => { b.textContent = "Copier le message de confirmation"; }, 2000); }
        catch (_) { prompt("Copie le message :", msg); }
        return;
      }
      if (act === "log-resultat") {
        const r = RDVS.find(x => x.id === id);
        if (r) prefillLog(r);
        return;
      }
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

  // Dashboard : RDV du jour depuis le planning (suit la vue Moi / équipe)
  let jour = actifs.filter(r => jourLocal(r.quand) === today).sort((a, c) => a.quand.localeCompare(c.quand));
  if (VUEMOI === "moi") jour = jour.filter(r => r.assigne_a === moi || r.setter === moi);
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

// Cartes bonus du bandeau : show selon confirmation + commissions (vue Moi)
function cartesBonus(s) {
  const F3 = SalesStats.F;
  const dansPeriode = r => { const d = SalesStats.dateOf(r); return d >= s.bounds.from && d <= s.bounds.to; };
  let cOui = 0, cOuiShow = 0, cNon = 0, cNonShow = 0;
  recsVisibles().forEach(r => {
    if (!r.rdvId || r.fields[F3.type] !== "Vente" || !dansPeriode(r)) return;
    const rdv = RDVS.find(x => x.id === r.rdvId);
    const res = r.fields[F3.resClosing] || r.fields[F3.resPres];
    if (!rdv || !res) return;
    const show = res !== "No-show";
    if (rdv.confirme_prospect) { cOui++; if (show) cOuiShow++; }
    else { cNon++; if (show) cNonShow++; }
  });
  const cartes = [];
  if (cOui || cNon) {
    cartes.push(["Show vente (confirmés)", cOui ? Math.round(cOuiShow / cOui * 100) + " %" : "–"]);
    cartes.push(["Show vente (non confirmés)", cNon ? Math.round(cNonShow / cNon * 100) + " %" : "–"]);
  }
  if (VUEMOI === "moi" && MOI && MOI.taux_commission) {
    const debutMois = s.today.slice(0, 8) + "01";
    const finMois = s.today.slice(0, 8) + "31";
    let cash = 0;
    RECORDS.forEach(r => {
      const f = r.fields;
      if (f[F3.type] === "Vente" && (f[F3.resClosing] || f[F3.resPres]) === "Closé" && f[F3.qui] === MOI.nom && SalesStats.dateOf(r) >= debutMois && SalesStats.dateOf(r) <= finMois) {
        cash += Number(f[F3.encaisse]) || 0;
      }
    });
    cartes.push(["Commissions du mois", eur(Math.round(cash * MOI.taux_commission))]);
  }
  return cartes;
}

// Filtres de vue appliqués avant tous les calculs :
// équipe (admin) puis « Moi » (mes calls : setting/closing par moi, ou prez par moi)
function recsVisibles() {
  let recs = (!voitTout() || VUEQUIPE === "toutes") ? RECORDS : RECORDS.filter(r => r.equipe === VUEQUIPE);
  if (VUEMOI === "moi") {
    const F = SalesStats.F;
    recs = recs.filter(r => r.fields[F.qui] === MOI.nom || r.fields[F.quiPres] === MOI.nom);
  }
  return recs;
}
function rdvsVisibles() {
  if (!voitTout() || VUEQUIPE === "toutes") return RDVS;
  return RDVS.filter(r => r.equipe === VUEQUIPE);
}

function render() {
  const s = SalesStats.compute(recsVisibles(), PERIOD, new Date());
  // En vue « Moi », relances et pipeline s'arbitrent sur l'historique COMPLET
  // de l'équipe (le closing d'un coéquipier éteint ma relance), puis on
  // restreint aux prospects que j'ai touchés.
  if (VUEMOI === "moi") {
    const recsEq = (!voitTout() || VUEQUIPE === "toutes") ? RECORDS : RECORDS.filter(r => r.equipe === VUEQUIPE);
    const sEq = SalesStats.compute(recsEq, PERIOD, new Date());
    const miens = new Set(recsVisibles().map(r => SalesStats.keyOf(r)).filter(Boolean));
    s.relances = sEq.relances.filter(r => r.qui === MOI.nom);
    s.matin.relancesAFaire = s.relances.length;
    s.prospects = sEq.prospects.filter(x => x.cle && miens.has(x.cle));
    const pi2 = { contacte: 0, cale: 0, vu: 0, enVente: 0, aRelancer: 0, close: 0, perdu: 0, total: 0, closeEur: 0, aRelancerEur: 0 };
    s.prospects.forEach(x => {
      pi2.total++;
      if (x.etat === "Closé") { pi2.close++; pi2.closeEur += x.vendu; }
      else if (x.etat === "À relancer") { pi2.aRelancer++; pi2.aRelancerEur += x.relanceEur; }
      else if (x.etat === "RDV de vente") pi2.enVente++;
      else if (x.etat === "Perdu") pi2.perdu++;
      else if (x.etat === "Vu en setting") pi2.vu++;
      else if (x.etat === "Setting calé") pi2.cale++;
      else pi2.contacte++;
    });
    s.pipeline = pi2;
  }
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
    ["Aboutis en RDV de vente", fmtPct(g.txAbouti)],
    ["Closés", g.closes],
    ["Taux de closing", fmtPct(g.txClose)],
    ["Vendu", eur(g.vendu)],
    ["Encaissé", eur(g.encaisse)],
    ["Panier moyen", g.panier === null ? "–" : eur(g.panier)],
    ["Délai calé → setting", s.delais.setting.moy === null ? "–" : s.delais.setting.moy + " j"],
    ["Délai calé → vente", s.delais.vente.moy === null ? "–" : s.delais.vente.moy + " j"]
  ].concat(cartesBonus(s)).map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

  const causesArr = Object.entries(g.causes).sort((a, c) => c[1] - a[1]);
  el("causes").innerHTML = causesArr.length
    ? tableHTML([{ t: "Cause" }, { t: "Settings", n: 1 }], causesArr.map(([c, n]) => [{ t: esc(c) }, { t: n, n: 1 }]))
    : `<div class="empty">Aucun setting non abouti sur la période.</div>`;


  const pi = s.pipeline;
  const maxPi = Math.max(pi.contacte, pi.cale, pi.vu, pi.enVente, pi.aRelancer, pi.close, pi.perdu, 1);
  const bar = (label, n, cls, eurVal) => `<div class="row"><div class="name">${label}${eurVal ? `<br><span class="eur">${eur(eurVal)}</span>` : ""}</div><div class="bar"><i class="${cls || ""}" style="width:${Math.round(n / maxPi * 100)}%"></i></div><div class="n">${n}</div></div>`;
  el("pipe").innerHTML = pi.total
    ? `<div class="pipe">` + bar("Setting calé", pi.cale, "grey") + bar("Vu en setting", pi.vu, "grey") + bar("RDV de vente", pi.enVente) +
      bar("À relancer", pi.aRelancer, "", pi.aRelancerEur) + bar("Closé", pi.close, "", pi.closeEur) + bar("Perdu", pi.perdu, "red") + `</div>`
    : `<div class="empty">Aucun prospect identifié pour l'instant.</div>`;

  const ORDRE = ["Setting calé", "Vu en setting", "RDV de vente", "À relancer", "Closé", "Perdu"];
  const filtrePipe = el("pipeFiltre") ? el("pipeFiltre").value : "tous";
  const nrmI = v => String(v || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
  const nrmT = v => String(v || "").replace(/\D/g, "").slice(-9);
  const clesRdvFutur = new Set(rdvsVisibles()
    .filter(r => ["propose", "ouvert", "decale", "confirme"].includes(r.statut) && r.quand > new Date().toISOString())
    .flatMap(r => [r.instagram ? "ig:" + nrmI(r.instagram) : null, r.telephone ? "tel:" + nrmT(r.telephone) : null].filter(Boolean)));
  const aRdvFutur = x => x.contact && !String(x.contact).trim().startsWith("@")
    ? clesRdvFutur.has("tel:" + nrmT(x.contact))
    : clesRdvFutur.has("ig:" + nrmI(x.contact));
  const estOrphelin = x => ["Setting calé", "Vu en setting", "RDV de vente", "Contacté"].includes(x.etat) && !aRdvFutur(x);
  let prospectsPipe = s.prospects;
  if (filtrePipe === "orphelins") prospectsPipe = s.prospects.filter(estOrphelin);
  if (filtrePipe === "sommeil") prospectsPipe = s.prospects.filter(x => x.sommeil);
  el("kanban").innerHTML = prospectsPipe.length
    ? ORDRE.map(etat => {
        const list = prospectsPipe.filter(x => x.etat === etat);
        const cards = list.slice(0, 20).map(x =>
          `<div class="kcard" ${x.sommeil ? 'style="border-left:3px solid var(--bad)"' : ""}><div class="kn">${esc(x.nom || x.contact || "?")}</div><div class="kc">${esc(x.contact)}</div>` +
          (x.sommeil ? `<div class="rot">${x.joursSans} j sans contact</div>` : "") +
          (etat === "Closé" && x.vendu ? `<div class="ke">${eur(x.vendu)}${x.vendu > x.encaisse ? " (reste " + eur(x.vendu - x.encaisse) + ")" : ""}</div>` : "") +
          (etat === "À relancer" && x.relanceEur ? `<div class="ke">${eur(x.relanceEur)}</div>` : "") + `</div>`).join("");
        return `<div class="kol"><h3>${etat} <span>${list.length}</span></h3>${cards}${list.length > 20 ? `<div class="kmore">+ ${list.length - 20} autres</div>` : ""}</div>`;
      }).join("")
    : `<div class="empty">${filtrePipe === "tous" ? "Aucun prospect identifié." : "Rien dans ce filtre. Bon signe."}</div>`;

  // Menu « Résultat… » sur les lignes dont le RDV est passé (visible
  // seulement pour celui qui a calé / pris le RDV, et l'admin)
  const maintenant = new Date().toISOString();
  const rdvsEchus = rdvsVisibles().filter(r => r.statut === "confirme" && r.quand <= maintenant &&
    (MOI.role === "admin" || r.assigne_a === MOI.nom || r.setter === MOI.nom));
  const nrmInsta = v => String(v || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
  const nrmTel = v => String(v || "").replace(/\D/g, "").slice(-9);
  const rdvEchuDe = x => {
    const estTel = x.contact && !String(x.contact).trim().startsWith("@");
    const xi = estTel ? "" : nrmInsta(x.contact);
    const xp = estTel ? nrmTel(x.contact) : "";
    return rdvsEchus
      .filter(r => (xi && nrmInsta(r.instagram) === xi) ||
                   (xp && nrmTel(r.telephone) === xp) ||
                   (!x.contact && x.nom && cleTxt(r.prospect) === cleTxt(x.nom)))
      .sort((a, c) => a.quand.localeCompare(c.quand))[0];
  };

  el("prospectsT").innerHTML = s.prospects.length
    ? tableHTML(
        [{ t: "Prospect" }, { t: "Contact" }, { t: "Source" }, { t: "État" }, { t: "" }, { t: "Dernier contact" }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        s.prospects.map(x => {
          const rp = rdvEchuDe(x);
          const quick = rp ? quickresHTML(rp) : "";
          return [
            { t: esc(x.nom || "?") }, { t: esc(x.contact) }, { t: esc(x.source || "–") },
            { t: `<span class="pill ${ETAT_PILL[x.etat] || ""}">${esc(x.etat)}</span>` },
            { t: quick },
            { t: esc(x.dernier) + (x.sommeil ? ` <span class="rot">(${x.joursSans} j)</span>` : "") }, { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
          ];
        }))
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
    if (!confirm("Supprimer ce call ? S'il avait créé un RDV au planning, le RDV sera annulé aussi.")) return;
    try { await call("delete", { id: b.dataset.id }); await loadData(); } catch (e) { alert(e.message); }
  }));

  el("relances").innerHTML = s.relances.length
    ? tableHTML(
        [{ t: "Pour le" }, { t: "Prospect" }, { t: "Contact" }, { t: "Catégorie" }, { t: "Source" }, { t: "Qui" }, { t: "Notes" }, { t: "" }],
        s.relances.map(r => [
          { t: r.date < s.today ? `<span class="late">${esc(r.date)}</span>` : esc(r.date) },
          { t: esc(r.prospect) }, { t: esc(r.contact) },
          { t: `<span class="pill amber">${esc(r.categorie || "–")}</span>` + (r.echange ? `<div style="color:var(--muted);font-size:11px;margin-top:3px">échange du ${esc(jolieDate(r.echange, s.today))}</div>` : "") },
          { t: esc(r.source || "–") }, { t: esc(r.qui) },
          { t: r.notes ? `<details><summary>voir</summary><div>${esc(r.notes)}</div></details>` : "" },
          { t: MOI.role === "observateur" ? "" : `<button class="abtn rel-copie" data-msg="${esc(msgRelance(r))}">Copier le message</button> <button class="abtn oui rel-log" data-nom="${esc(r.prospect)}" data-contact="${esc(r.contact)}" data-type="${r.type === "Vente" ? "Vente" : "Setting"}" data-source="${esc(r.source || "")}">Log le résultat</button>` }
        ]))
    : `<div class="empty">Aucune relance en attente.</div>`;
  document.querySelectorAll(".rel-copie").forEach(b => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.msg);
      const t = b.textContent; b.textContent = "Copié, colle-le en DM";
      setTimeout(() => { b.textContent = t; }, 2000);
    } catch (_) { prompt("Copie le message :", b.dataset.msg); }
  }));
  document.querySelectorAll(".rel-log").forEach(b => b.addEventListener("click", () => {
    showPage("log"); resetForm(); setType(b.dataset.type);
    el("inProspect").value = b.dataset.nom === "?" ? "" : b.dataset.nom;
    if (String(b.dataset.contact).startsWith("@")) el("inInsta").value = b.dataset.contact;
    else if (b.dataset.contact) { PENDING_TEL = b.dataset.contact; PENDING_TEL_PROSPECT = b.dataset.nom || ""; }
    if (b.dataset.source) el("inSource").value = b.dataset.source;
    el("toast").textContent = "Pré-rempli pour la relance de " + (b.dataset.nom || "?") + " — choisis le résultat et enregistre.";
    el("toast").style.display = "block";
    setTimeout(() => { el("toast").style.display = "none"; }, 5000);
  }));

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

  // Répartition des objections (période + vue courantes)
  const dansP = r => { const d = SalesStats.dateOf(r); return d >= s.bounds.from && d <= s.bounds.to; };
  const objs = {};
  recsVisibles().forEach(r => {
    const o = r.fields["Objection"];
    if (o && o !== "Aucune" && dansP(r)) objs[o] = (objs[o] || 0) + 1;
  });
  const objArr = Object.entries(objs).sort((x, y) => y[1] - x[1]);
  el("objections").innerHTML = objArr.length
    ? tableHTML([{ t: "Objection principale" }, { t: "Appels", n: 1 }], objArr.map(([k, n2]) => [{ t: esc(k) }, { t: n2, n: 1 }]))
    : `<div class="empty">Aucune objection saisie sur la période.</div>`;

  // Dispatch : temps de prise par closer
  const parCloser = {};
  rdvsVisibles().forEach(r => {
    if (!r.pris_en_s || !r.assigne_a) return;
    if (VUEMOI === "moi" && r.assigne_a !== MOI.nom) return;
    const d = SalesStats.ymdLocal(new Date(r.offre_premiere || r.quand));
    if (d < s.bounds.from || d > s.bounds.to) return;
    (parCloser[r.assigne_a] = parCloser[r.assigne_a] || []).push(r.pris_en_s);
  });
  const medi = arr => { const t2 = arr.slice().sort((x, y) => x - y); return t2[Math.floor(t2.length / 2)]; };
  const dispArr = Object.entries(parCloser).sort((x, y) => y[1].length - x[1].length);
  el("dispatch").innerHTML = dispArr.length
    ? tableHTML([{ t: "Closer" }, { t: "RDV pris", n: 1 }, { t: "Temps médian de prise", n: 1 }],
        dispArr.map(([nom2, arr]) => [{ t: esc(nom2) }, { t: arr.length, n: 1 }, { t: formatDelaiPrise(medi(arr)).replace("pris ", ""), n: 1 }]))
    : `<div class="empty">Aucun RDV dispatché pris sur la période.</div>`;

  const names = Object.keys(s.people).sort();
  el("people").innerHTML = names.length
    ? tableHTML(
        [{ t: "Qui" }, { t: "Settings calés", n: 1 }, { t: "Effectués", n: 1 }, { t: "Show", n: 1 }, { t: "No-show setting", n: 1 }, { t: "No-show vente", n: 1 }, { t: "Non aboutis", n: 1 }, { t: "RDV de vente", n: 1 }, { t: "Prez faites", n: 1 }, { t: "Closings faits", n: 1 }, { t: "Closés", n: 1 }, { t: "Taux close", n: 1 }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        names.map(n => { const x = s.people[n]; return [
          { t: esc(n) }, { t: x.cales, n: 1 }, { t: x.effectues, n: 1 },
          { t: fmtPct(x.txShow), n: 1 }, { t: x.noShows, n: 1 }, { t: x.ventesNoShow, n: 1 }, { t: x.nonAboutis, n: 1 },
          { t: x.versVente, n: 1 }, { t: x.presFaites, n: 1 }, { t: x.ventesEff, n: 1 },
          { t: x.closes, n: 1 },
          { t: fmtPct(x.txClose), n: 1 },
          { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
        ]; }))
    : `<div class="empty">Aucun call loggé sur la période.</div>`;

  renderPlanning(s.today);

  // Menus « Résultat… » rapides (table prospects + retards du planning)
  document.querySelectorAll(".quickres").forEach(sel => sel.addEventListener("change", async () => {
    if (sel.dataset.reassigner) {
      if (!sel.value) return;
      try { await call("rdv_reassigner", { id: sel.dataset.reassigner, nom: sel.value }); await loadData(); }
      catch (e) { alert(e.message); }
      return;
    }
    const r = RDVS.find(x => x.id === sel.dataset.rdv);
    if (r && sel.value) prefillLog(r, sel.value);
  }));

  // Bandeau « En retard » du dashboard : la dette avant le neuf
  const relRetard = s.relances.filter(r => r.date < s.today && (MOI.role === "admin" || r.qui === MOI.nom)).length;
  const nbRegulariser = rdvsVisibles().filter(r => r.statut === "confirme" &&
    r.quand < new Date(Date.now() - 48 * 3600 * 1000).toISOString() &&
    (MOI.role === "admin" || r.assigne_a === MOI.nom || r.setter === MOI.nom)).length;
  const nbSansPreneur = MOI.role === "admin" ? rdvsVisibles().filter(r => r.statut === "ouvert" && r.offre_niveau >= 3).length : 0;
  const segs = [];
  if (relRetard) segs.push(`<span data-va="relances">${relRetard} relance${relRetard > 1 ? "s" : ""} en retard</span>`);
  if (nbRegulariser) segs.push(`<span data-va="planning">${nbRegulariser} résultat${nbRegulariser > 1 ? "s" : ""} à saisir</span>`);
  if (nbSansPreneur) segs.push(`<span data-va="planning">${nbSansPreneur} RDV sans preneur</span>`);
  el("bandeauRetard").style.display = segs.length ? "" : "none";
  el("bandeauRetard").className = "bandeau-retard";
  el("bandeauRetard").innerHTML = segs.join(" · ");
  el("bandeauRetard").querySelectorAll("[data-va]").forEach(x => x.addEventListener("click", () => showPage(x.dataset.va)));

  // File de relances : les dues, de la plus ancienne à la plus récente
  if (el("fileOverlay").style.display === "none") {
    FILE_RELANCES = s.relances.slice().sort((x, y) => x.date.localeCompare(y.date));
  }
  majBoutonFile(FILE_RELANCES.length);

  // Pastille de la cloche (mobile) : RDV à traiter + relances
  const nbPlan = el("bPlan").style.display === "none" ? 0 : (parseInt(el("bPlan").textContent, 10) || 0);
  const nbCloche = nbPlan + (s.matin.relancesAFaire || 0);
  el("bellDot").textContent = nbCloche;
  el("bellDot").style.display = nbCloche ? "flex" : "none";

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
  el("topTitre").textContent = PAGES[id][0];
  el("periodCtrls").style.display = (id === "log" || id === "planning" || id === "reglages") ? "none" : "";
  if (id === "reglages") chargeRappels();
}
// Tiroir de navigation (mobile)
function fermeTiroir() {
  el("sideNav").classList.remove("open");
  el("navOverlay").classList.remove("on");
}

// ----- Chips : un tap au lieu d'un menu déroulant -----
const CHIP_SELECTS = ["inResSetting", "inCause", "inResVente", "inCauseV", "inSource", "inOffreV", "inQuiPres", "inQuiClose", "inVenteMoi"];
const CHIP_TOGGLE = ["inSource", "inOffreV", "inVenteMoi"]; // optionnels : re-tap = désélection
function buildChips(id) {
  const sel = el(id);
  if (!sel) return;
  let box = document.getElementById("chips-" + id);
  if (!box) {
    box = document.createElement("div");
    box.className = "chips";
    box.id = "chips-" + id;
    sel.after(box);
    sel.classList.add("chipified");
  }
  box.innerHTML = [...sel.options].filter(o => o.value !== "").map(o =>
    `<button type="button" data-val="${esc(o.value)}">${esc(o.textContent)}</button>`).join("");
  box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    sel.value = (sel.value === b.dataset.val && CHIP_TOGGLE.includes(id)) ? "" : b.dataset.val;
    sel.dispatchEvent(new Event("change"));
    majChips(id);
  }));
  majChips(id);
}
function majChips(id) {
  (id ? [id] : CHIP_SELECTS).forEach(i => {
    const box = document.getElementById("chips-" + i);
    if (!box) return;
    const v = el(i).value;
    box.querySelectorAll("button").forEach(b => b.classList.toggle("active", v === b.dataset.val));
  });
}

// ----- Autocomplétion prospects : 3 lettres suffisent, l'Insta et la source suivent -----
// En cas d'ambiguïté (deux prospects du même nom, deux noms sur le même @),
// on ne pré-remplit RIEN : mieux vaut un champ vide qu'une mauvaise donnée.
let PAR_NOM = {}, PAR_INSTA = {};
const cleTxt = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
function majProspectsIdx() {
  const F = SalesStats.F;
  PAR_NOM = {}; PAR_INSTA = {};
  const ajoute = (nom, insta, source) => {
    if (nom) {
      const k = cleTxt(nom);
      const e = PAR_NOM[k] = PAR_NOM[k] || { nom: String(nom).trim(), instas: new Set(), sources: new Set() };
      if (insta) e.instas.add(String(insta).trim());
      if (source) e.sources.add(source);
    }
    if (insta) {
      const k = cleTxt(insta);
      const e = PAR_INSTA[k] = PAR_INSTA[k] || { insta: String(insta).trim(), noms: new Set(), sources: new Set() };
      if (nom) e.noms.add(String(nom).trim());
      if (source) e.sources.add(source);
    }
  };
  RECORDS.forEach(r => { const f = r.fields; ajoute(f[F.prospect], f[F.insta], f[F.source]); });
  RDVS.forEach(r => ajoute(r.prospect, r.instagram, r.source));
  const seul = set => set.size === 1 ? [...set][0] : "";
  el("dlProspects").innerHTML = Object.values(PAR_NOM).map(p =>
    `<option value="${esc(p.nom)}">${esc(seul(p.instas))}</option>`).join("");
  el("dlInsta").innerHTML = Object.values(PAR_INSTA).map(p =>
    `<option value="${esc(p.insta)}">${esc(seul(p.noms))}</option>`).join("");
}
const unSeul = set => set && set.size === 1 ? [...set][0] : "";
function autofillProspect() {
  const p = PAR_NOM[cleTxt(el("inProspect").value)];
  if (!p) return;
  if (!el("inInsta").value && unSeul(p.instas)) el("inInsta").value = unSeul(p.instas);
  if (!el("inSource").value && unSeul(p.sources)) { el("inSource").value = unSeul(p.sources); majChips("inSource"); }
}
function autofillDepuisInsta() {
  const p = PAR_INSTA[cleTxt(el("inInsta").value)];
  if (!p) return;
  if (!el("inProspect").value && unSeul(p.noms)) el("inProspect").value = unSeul(p.noms);
  if (!el("inSource").value && unSeul(p.sources)) { el("inSource").value = unSeul(p.sources); majChips("inSource"); }
}

// Pré-remplit le formulaire depuis un RDV (bouton du planning ou menu
// « Résultat… » des prospects) ; resultat optionnel = présélectionné.
function prefillLog(r, resultat) {
  const t = r.type === "Setting" ? "Setting" : "Vente";
  showPage("log"); resetForm(); setType(t);
  el("inProspect").value = r.prospect || "";
  el("inInsta").value = r.instagram || "";
  el("inSource").value = r.source || "";
  el("inDate").value = jourLocal(r.quand); // le call a eu lieu le jour du RDV, pas le jour de la saisie
  if (r.assigne_a && [...el("inQuiClose").options].some(o => o.value === r.assigne_a)) el("inQuiClose").value = r.assigne_a;
  if (r.assigne_a && [...el("inQuiPres").options].some(o => o.value === r.assigne_a)) el("inQuiPres").value = r.assigne_a;
  if (MOI.role === "admin" && r.assigne_a && [...el("inQui").options].some(o => o.value === r.assigne_a)) {
    el("inQui").value = r.assigne_a;
    el("inQui").dispatchEvent(new Event("change"));
  }
  if (resultat) el(t === "Setting" ? "inResSetting" : "inResVente").value = resultat;
  majChips();
  majConditionnels();
  PENDING_RDV = r.id;
  PENDING_PROSPECT = r.prospect || "";
  PENDING_TYPE = t;
  el("toast").textContent = resultat
    ? "Pré-rempli pour " + (r.prospect || "?") + " (" + resultat + ") — complète s'il manque un détail et enregistre."
    : "Pré-rempli depuis le RDV de " + (r.prospect || "?") + " — choisis le résultat et enregistre.";
  el("toast").style.display = "block";
  setTimeout(() => { el("toast").style.display = "none"; }, 5000);
}

// ----- Formulaire -----
// Champ « Équipe » admin : utile seulement si la personne créditée n'a pas
// d'équipe (pour une Vente, c'est « Closing fait par » qui fait foi)
function majEquipeForm() {
  if (!MOI || MOI.role !== "admin") return;
  const nom = TYPE === "Vente" ? el("inQuiClose").value : el("inQui").value;
  const m = EQUIPE.find(x => x.nom === nom);
  el("fEquipeAdmin").style.display = (m && m.equipe) ? "none" : "";
}
function setType(t) {
  TYPE = t;
  document.querySelectorAll("#typeBtns button").forEach(b => b.classList.toggle("active", b.dataset.t === t));
  document.querySelectorAll("[data-only]").forEach(x => { x.style.display = x.dataset.only === t ? "" : "none"; });
  if (MOI && MOI.role === "admin") {
    el("fQuiAdmin").style.display = t === "Vente" ? "none" : "";
    majEquipeForm();
  }
}
function todayLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function majConditionnels() {
  const rs = el("inResSetting").value;
  el("caleBlock").style.display = rs === "Calé (à venir)" ? "" : "none";
  el("causeBlock").style.display = rs === "Non abouti" ? "" : "none";
  el("noshowBlock").style.display = rs === "No-show" ? "" : "none";
  el("suiteBlock").style.display = rs === "RDV de vente calé" ? "" : "none";
  const rv = el("inResVente").value;
  el("closeVBlock").style.display = rv === "Closé" ? "" : "none";
  el("fObjection").style.display = (rv === "Closé" || rv === "Pas closé" || rv === "À relancer") ? "" : "none";
  el("causeVBlock").style.display = rv === "Pas closé" ? "" : "none";
  el("noshowVBlock").style.display = rv === "No-show" ? "" : "none";
  el("relanceVBlock").style.display = rv === "À relancer" ? "" : "none";
  ["Set", "Ns", "Pc", "NsV"].forEach(p => {
    el("fRel" + p + "Date").style.display = el("inRel" + p).value === "date" ? "" : "none";
  });
}
// Sélecteur de relance -> date (AAAA-MM-JJ) ; null = date précise manquante
function dateRelanceDepuis(pfx) {
  const v = el("inRel" + pfx).value;
  if (!v) return "";
  if (v === "date") return el("inRel" + pfx + "Date").value || null;
  const d = new Date();
  d.setDate(d.getDate() + Number(v));
  return SalesStats.ymdLocal(d);
}
function resetForm() {
  PENDING_RDV = null;
  PENDING_PROSPECT = "";
  PENDING_TYPE = "";
  PENDING_TEL = "";
  PENDING_TEL_PROSPECT = "";
  document.querySelectorAll("#logForm input, #logForm textarea").forEach(i => i.value = "");
  document.querySelectorAll("#logForm select").forEach(sel => { if (sel.id !== "inQui") sel.value = ""; });
  el("inDate").value = todayLocal();
  if (MOI) { el("inQuiPres").value = MOI.nom; el("inQuiClose").value = MOI.nom; }
  el("inQualifBudget").value = "Non demandé";
  el("inQualifUrgence").value = "Non demandé";
  el("inQualifObjection").value = "Aucune";
  el("inObjection").value = "Aucune";
  majChips();
  majConditionnels();
}
async function submitForm(e) {
  e.preventDefault();
  const c = { type: TYPE, prospect: el("inProspect").value.trim() };
  if (!c.prospect) return alert("Le prospect est obligatoire.");
  c.instagram = el("inInsta").value.trim();
  // Prospect historique identifié par téléphone : on transmet son numéro
  if (!c.instagram && PENDING_TEL && cleTxt(c.prospect) === cleTxt(PENDING_TEL_PROSPECT)) c.telephone = PENDING_TEL;
  if (!c.instagram && TYPE === "Vente" && el("inResVente").value === "Closé") {
    if (!confirm("Pas d'Instagram : cette vente ne sera pas reliée à la fiche du prospect. Enregistrer quand même ?")) return;
  }
  c.source = el("inSource").value;
  c.date = el("inDate").value || todayLocal();
  c.notes = el("inNotes").value.trim();
  if (MOI.role === "admin") {
    if (TYPE !== "Vente") c.qui = el("inQui").value; // pour une Vente, « Closing fait par » fait foi
    if (el("fEquipeAdmin").style.display !== "none") {
      c.equipe = el("inEquipe").value;
      if (!c.equipe) return alert("Choisis l'équipe du call.");
    }
  }

  if (TYPE === "Setting") {
    c.res_setting = el("inResSetting").value;
    if (!c.res_setting) return alert("Le résultat du setting est obligatoire.");
    if (c.res_setting === "Calé (à venir)") {
      if (!el("inCaleLe").value) return alert("Indique quand le setting est calé.");
      c.rdv_le = new Date(el("inCaleLe").value).toISOString();
    }
    if (c.res_setting === "No-show") {
      const dr = dateRelanceDepuis("Ns");
      if (dr === null) return alert("Choisis la date de relance.");
      if (dr) c.date_relance = dr;
    }
    if (c.res_setting === "Non abouti") {
      c.cause = el("inCause").value;
      if (!c.cause) return alert("La cause est obligatoire.");
      const dr = dateRelanceDepuis("Set");
      if (dr === null) return alert("Choisis la date de relance.");
      if (c.cause === "À rappeler" && !dr) return alert("« À rappeler » = choisis quand le relancer.");
      if (dr) c.date_relance = dr;
    }
    if (c.res_setting === "RDV de vente calé") {
      if (!el("inSuiteLe").value) return alert("Indique quand le RDV de vente est calé.");
      c.rdv_le = new Date(el("inSuiteLe").value).toISOString();
      c.fiche = el("inFiche").value.trim();
      if (el("inVenteMoi").value === "moi") c.vente_moi = true;
      c.qualif_budget = el("inQualifBudget").value;
      c.qualif_urgence = el("inQualifUrgence").value;
      c.qualif_objection = el("inQualifObjection").value;
    }
    if (PENDING_RDV && TYPE === PENDING_TYPE && cleTxt(c.prospect) === cleTxt(PENDING_PROSPECT)) c.rdv_id = PENDING_RDV;
  }
  if (TYPE === "Vente") {
    c.res_closing = el("inResVente").value;
    if (!c.res_closing) return alert("Le résultat de l'appel est obligatoire.");
    c.qui_presentation = el("inQuiPres").value;
    c.qui = el("inQuiClose").value;
    if (c.res_closing === "Closé") {
      c.offre = el("inOffreV").value;
      if (!el("inMontantV").value) return alert("Indique le montant total de la vente.");
      c.montant = Number(el("inMontantV").value);
      // Plus d'acomptes (10/07) : tout est comptant, l'encaissé = le montant
      c.paiement = "Comptant";
      c.encaisse = c.montant;
    }
    if (c.res_closing === "Pas closé") {
      c.cause = el("inCauseV").value;
      if (!c.cause) return alert("La cause est obligatoire.");
      const dr = dateRelanceDepuis("Pc");
      if (dr === null) return alert("Choisis la date de relance.");
      if (dr) c.date_relance = dr;
    }
    if (c.res_closing === "No-show") {
      const dr = dateRelanceDepuis("NsV");
      if (dr === null) return alert("Choisis la date de relance.");
      if (dr) c.date_relance = dr;
    }
    if (c.res_closing === "À relancer") {
      if (!el("inDateRelanceV").value) return alert("Indique la date de relance (sinon la relance ne sonnera jamais).");
      c.date_relance = el("inDateRelanceV").value;
      if (el("inMontantRelV").value) c.montant = Number(el("inMontantRelV").value);
    }
    if (PENDING_RDV && TYPE === PENDING_TYPE && cleTxt(c.prospect) === cleTxt(PENDING_PROSPECT)) c.rdv_id = PENDING_RDV;
    if (["Closé", "Pas closé", "À relancer"].includes(c.res_closing)) c.objection = el("inObjection").value;
  }
  el("submitBtn").disabled = true;
  el("submitBtn").textContent = "Enregistrement…";
  try {
    const r = await call("log", { call: c });
    if (CLOSES_VUS && r.id) CLOSES_VUS.add(r.id); // pas de cha-ching pour sa propre saisie
    resetForm();
    el("toast").textContent = r.rdv_erreur ? "Call enregistré, MAIS le RDV n'a pas pu être créé au planning — préviens Tony (" + r.rdv_erreur + ")."
      : !r.rdv ? "Call enregistré."
      : c.res_setting === "Calé (à venir)" ? "Call enregistré. Le setting est au planning."
      : r.rdv_statut === "confirme" ? "Call enregistré. L'appel de vente est au planning de " + (r.rdv_assigne || "?") + "."
      : "Call enregistré. Le RDV est parti au dispatch (onglet Planning).";
    el("toast").style.display = "block";
    setTimeout(() => { el("toast").style.display = "none"; }, 4000);
    loadData();
  } catch (err) {
    alert("Erreur : " + err.message);
  } finally {
    el("submitBtn").disabled = false;
    el("submitBtn").textContent = "Enregistrer";
  }
}

// ----- Écran d'offre BeReal (dispatch avec compte à rebours) -----
let OFFRE_TIMER = null;
function offrePourMoi() {
  if (!MOI || MOI.role === "observateur") return null;
  const moi = MOI.nom;
  return rdvsVisibles().find(r =>
    !OFFRES_VUES.has(r.id + "|" + r.offre_depuis) && r.offre_depuis &&
    ((r.statut === "propose" && r.assigne_a === moi) ||
     (r.statut === "ouvert" && roleMatchFront(r.type, MOI.role_vente) && !(r.refusee_par || []).includes(moi) && r.setter !== moi)));
}
function majOffre() {
  const r = offrePourMoi();
  const ov = el("offreOverlay");
  if (!r) { ov.style.display = "none"; if (OFFRE_TIMER) { clearInterval(OFFRE_TIMER); OFFRE_TIMER = null; } return; }
  const cleOffre = r.id + "|" + (r.offre_depuis || "");
  if (ov.dataset.rid === cleOffre && ov.style.display !== "none") return; // déjà affichée
  const today = SalesStats.ymdLocal(new Date());
  ov.dataset.rid = cleOffre;
  ov.innerHTML = `
    <div class="offre-carte">
      <div class="offre-type">${r.statut === "propose" ? "RDV pour toi — closer de référence" : "RDV ouvert — premier qui accepte"}</div>
      <div class="offre-titre">${esc(r.prospect)}</div>
      <div class="offre-quand">${esc(r.type)} · ${quandJoli(r.quand, today)}</div>
      <div class="offre-infos">
        ${r.instagram ? esc(r.instagram) + "<br>" : ""}${r.source ? esc(r.source) + "<br>" : ""}setter : ${esc(r.setter)}
        ${r.qualif ? "<br>" + esc(r.qualif) : ""}${r.fiche ? "<br>" + esc(r.fiche) : ""}
      </div>
      <div class="offre-chrono" id="offreChrono"><i style="width:100%"></i></div>
      <div class="offre-compte" id="offreCompte"></div>
      <div class="offre-actions">
        <button class="abtn oui" id="offrePrendre">Je le prends</button>
        <button class="abtn non" id="offrePasser">Je passe</button>
      </div>
      <div class="offre-plus-tard" id="offrePlusTard">Plus tard (le RDV reste dans le planning)</div>
    </div>`;
  ov.style.display = "";
  debloqueAudio();
  const fin = new Date(r.offre_depuis).getTime() + 120000;
  const tick = () => {
    const reste = Math.round((fin - maintenantServeur()) / 1000);
    const chrono = el("offreChrono");
    if (!chrono) return;
    if (reste <= 0) {
      chrono.classList.add("rouge");
      chrono.querySelector("i").style.width = "100%";
      el("offreCompte").textContent = r.statut === "propose"
        ? "Fenêtre passée — le RDV va partir à toute l'équipe, tu peux encore le prendre."
        : "Fenêtre passée — le RDV reste à prendre, premier arrivé.";
    } else {
      chrono.classList.toggle("rouge", reste <= 30);
      chrono.querySelector("i").style.width = Math.max(0, Math.round(reste / 120 * 100)) + "%";
      el("offreCompte").textContent = "Il te reste " + Math.floor(reste / 60) + ":" + pad(reste % 60) + " pour le prendre en premier";
    }
  };
  tick();
  if (OFFRE_TIMER) clearInterval(OFFRE_TIMER);
  OFFRE_TIMER = setInterval(tick, 1000);
  const ferme = () => { ov.style.display = "none"; if (OFFRE_TIMER) { clearInterval(OFFRE_TIMER); OFFRE_TIMER = null; } };
  el("offrePrendre").addEventListener("click", async () => {
    try { await call("rdv_accept", { id: r.id }); ferme(); await loadData(); showPage("planning"); }
    catch (e) { alert(e.message); ferme(); loadData(); }
  });
  el("offrePasser").addEventListener("click", async () => {
    try { await call("rdv_refuse", { id: r.id }); } catch (_) {}
    OFFRES_VUES.add(r.id + "|" + r.offre_depuis);
    ferme();
    loadData();
  });
  el("offrePlusTard").addEventListener("click", () => { OFFRES_VUES.add(r.id + "|" + r.offre_depuis); ferme(); majOffre(); });
}

// ----- Mode file : traiter les relances une par une -----
function majBoutonFile(n) {
  const b = el("fileDemarrer");
  b.style.display = n && MOI.role !== "observateur" ? "" : "none";
  b.textContent = "Démarrer la file (" + n + ")";
}
function montreFile() {
  const ov = el("fileOverlay");
  if (FILE_IDX >= FILE_RELANCES.length) {
    ov.innerHTML = `<div class="offre-carte"><div class="offre-titre">File terminée</div>
      <div class="offre-infos">Toutes les relances du jour sont traitées.</div>
      <div class="offre-actions"><button class="abtn oui" id="fileFin">Fermer</button></div></div>`;
    ov.style.display = "";
    el("fileFin").addEventListener("click", () => { ov.style.display = "none"; loadData(); });
    return;
  }
  const r = FILE_RELANCES[FILE_IDX];
  const today = SalesStats.ymdLocal(new Date());
  ov.innerHTML = `
    <div class="offre-carte">
      <div class="offre-type">Relance ${FILE_IDX + 1} / ${FILE_RELANCES.length} · ${esc(r.categorie || "")}</div>
      <div class="offre-titre">${esc(r.prospect)}</div>
      <div class="offre-quand">${esc(r.contact || "")}</div>
      <div class="offre-infos">Pour le ${esc(r.date)} · ${r.echange ? "dernier échange " + esc(jolieDate(r.echange, today)) : ""}${r.source ? " · " + esc(r.source) : ""}${r.notes ? "<br>" + esc(r.notes) : ""}</div>
      <div class="offre-actions">
        <button class="abtn" id="fileCopier">Copier le message</button>
        <button class="abtn oui" id="fileLog">Log le résultat</button>
        <button class="abtn" id="fileSuivant">Suivant</button>
      </div>
      <div class="offre-plus-tard" id="fileQuitter">Quitter la file</div>
    </div>`;
  ov.style.display = "";
  el("fileCopier").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(msgRelance(r)); el("fileCopier").textContent = "Copié, colle-le en DM"; }
    catch (_) { prompt("Copie le message :", msgRelance(r)); }
  });
  el("fileLog").addEventListener("click", () => {
    ov.style.display = "none";
    showPage("log"); resetForm(); setType(r.type === "Vente" ? "Vente" : "Setting");
    el("inProspect").value = r.prospect === "?" ? "" : r.prospect;
    if (String(r.contact).startsWith("@")) el("inInsta").value = r.contact;
    else if (r.contact) { PENDING_TEL = r.contact; PENDING_TEL_PROSPECT = r.prospect === "?" ? "" : r.prospect; }
    if (r.source) el("inSource").value = r.source;
  });
  el("fileSuivant").addEventListener("click", () => { FILE_IDX++; montreFile(); });
  el("fileQuitter").addEventListener("click", () => { ov.style.display = "none"; });
}

// ----- Script en contexte -----
function montreScript() {
  const p = PARAMS || {};
  const morceaux = [];
  if (TYPE === "Setting") {
    if (p.script_setting) morceaux.push(["Script setting", p.script_setting]);
  } else {
    if (p.script_vente1) morceaux.push(["Phase 1 — présentation", p.script_vente1]);
    if (p.script_vente2) morceaux.push(["Phase 2 — closing", p.script_vente2]);
    const OBJ = { obj_argent: "Objection argent", obj_timing: "Objection timing", obj_conjoint: "Conjoint ou associé", obj_confiance: "Peur ou confiance", obj_ecran: "Écran de fumée" };
    Object.entries(OBJ).forEach(([k, lbl]) => { if (p[k]) morceaux.push([lbl, p[k]]); });
  }
  const ov = el("scriptOverlay");
  ov.innerHTML = `<div class="offre-carte">
    <div class="offre-titre" style="font-size:19px">Script — ${TYPE === "Setting" ? "setting" : "vente"}</div>
    ${morceaux.length ? morceaux.map(([t, x]) => `<div style="margin-top:14px"><div class="stitre" style="font-size:13.5px;color:var(--accent)">${esc(t)}</div><div class="offre-infos" style="white-space:pre-wrap;margin-bottom:0">${esc(x)}</div></div>`).join("") : `<div class="offre-infos">Aucun script rempli pour l'instant. Tony peut les écrire dans Réglages, onglet Scripts.</div>`}
    <div class="offre-actions" style="margin-top:18px"><button class="abtn oui" id="scriptFermer">Fermer</button></div>
  </div>`;
  ov.style.display = "";
  el("scriptFermer").addEventListener("click", () => { ov.style.display = "none"; });
}

// ----- Réglages (admin) : rappels automatiques -----
const CIBLE_LABEL = { assigne: "À celui qui a le RDV", setter: "Au setter", admin: "À toi (admin)" };
let RG_TAB = "alertes";
async function chargeRappels() {
  const z = el("rappelsZone");
  z.innerHTML = `<div class="empty">Chargement…</div>`;
  try {
    const d = await call("rappels_list");
    const rows = d.rappels || [];
    const nt = d.notifs || {};
    z.innerHTML = `<div class="controls" style="margin:2px 0 18px">
        <button class="rg-tab" data-tab="alertes">Alertes équipe</button>
        <button class="rg-tab" data-tab="rappels">Rappels avant RDV</button>
        <button class="rg-tab" data-tab="messages">Messages prospects</button>
        <button class="rg-tab" data-tab="scripts">Scripts</button>
      </div>
      <div class="rg-pan" id="pan-alertes">
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Les textes des alertes envoyées à l'équipe. Touche une ligne pour la modifier, les balises se remplissent toutes seules.</div>` +
      NOTIFS_CATALOGUE.map(n => {
        const cur = nt[n.cle] || { titre: n.defaut[0], corps: n.defaut[1] };
        return `
      <details class="slot regl" data-ncle="${n.cle}">
        <summary>${n.label}</summary>
        <div class="field"><label>Titre</label>${pilule(IC_REG.titre, `<input class="nt-titre" maxlength="80" value="${esc(cur.titre)}">`)}</div>
        <div class="field"><label>Message (balises : ${esc(n.balises)})</label><textarea class="nt-corps" maxlength="300">${esc(cur.corps)}</textarea></div>
        <div class="abtns"><button class="abtn oui nt-save">Enregistrer</button></div>
      </details>`;
      }).join("") +
      `</div>
      <div class="rg-pan" id="pan-rappels" style="display:none">
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Notifications envoyées automatiquement avant chaque RDV (vérification toutes les 5 minutes, délai minimum 5). Balises utilisables dans le message : {prospect} {heure} {type} {insta}</div>` +
      rows.map(g => `
      <details class="slot regl" data-rid="${g.id}">
        <summary>${CIBLE_LABEL[g.cible] || esc(g.cible)} · ${g.delai_min} min avant${g.seulement_statut === "ouvert" ? " · sans preneur" : ""}${g.actif ? "" : " · COUPÉ"}</summary>
        <div class="row2">
          <div class="field"><label>Destinataire</label>${pilule(IC_REG.qui, `
            <select class="rg-cible">
              <option value="assigne"${g.cible === "assigne" ? " selected" : ""}>Celui qui a le RDV</option>
              <option value="setter"${g.cible === "setter" ? " selected" : ""}>Le setter</option>
              <option value="admin"${g.cible === "admin" ? " selected" : ""}>Toi (admin)</option>
            </select>`)}</div>
          <div class="field"><label>Condition</label>${pilule(IC_REG.cond, `
            <select class="rg-statut">
              <option value=""${g.seulement_statut ? "" : " selected"}>RDV confirmés</option>
              <option value="ouvert"${g.seulement_statut === "ouvert" ? " selected" : ""}>Seulement RDV sans preneur</option>
            </select>`)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Minutes avant le RDV (240 = 4 h, min 5)</label>${pilule(IC_REG.temps, `<input type="number" min="5" max="10080" class="rg-delai" value="${g.delai_min}">`)}</div>
          <div class="field"><label>État</label>${pilule(IC_REG.etat, `<select class="rg-actif"><option value="oui"${g.actif ? " selected" : ""}>Actif</option><option value="non"${g.actif ? "" : " selected"}>Coupé</option></select>`)}</div>
        </div>
        <div class="field"><label>Message (300 caractères max)</label><textarea class="rg-msg" maxlength="300">${esc(g.message)}</textarea></div>
        <div class="abtns"><button class="abtn oui rg-save">Enregistrer</button><button class="abtn non rg-del">Supprimer</button></div>
      </details>`).join("") +
      `<div class="abtns" style="margin-top:6px"><button class="abtn" id="rgAjout">Ajouter un rappel</button></div>
      </div>
      <div class="rg-pan" id="pan-messages" style="display:none">
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Les textes du bouton « Copier le message » des relances, copiés tels quels par l'équipe. Balises : {prenom} = prénom du prospect, {date} = date du dernier échange.</div>` +
      CATS_MSG.map(cat => `
      <details class="slot regl" data-cat="${esc(cat)}">
        <summary>${esc(CAT_LABEL[cat] || cat)}</summary>
        <div class="field"><textarea class="msg-txt" maxlength="500">${esc(MSG_SRV[cat] || MSG_RELANCE[cat] || MSG_RELANCE.defaut)}</textarea></div>
        <div class="abtns"><button class="abtn oui msg-save">Enregistrer</button></div>
      </details>`).join("") + `</div>
      <div class="rg-pan" id="pan-scripts" style="display:none">
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Tes scripts d'appel et tes réponses aux objections. L'équipe les consulte depuis le bouton « Voir le script » de la page Log.</div>` +
      [["script_setting", "Script setting"], ["script_vente1", "Vente — phase 1 (présentation)"], ["script_vente2", "Vente — phase 2 (closing)"],
       ["obj_argent", "Réponse — objection argent"], ["obj_timing", "Réponse — logistique ou timing"], ["obj_conjoint", "Réponse — conjoint ou associé"],
       ["obj_confiance", "Réponse — peur ou confiance"], ["obj_ecran", "Réponse — écran de fumée"]].map(([cle, lbl]) => `
      <details class="slot regl" data-pcle="${cle}">
        <summary>${lbl}${(PARAMS[cle] || "").trim() ? "" : " · vide"}</summary>
        <div class="field"><textarea class="prm-txt" maxlength="4000" style="min-height:120px">${esc(PARAMS[cle] || "")}</textarea></div>
        <div class="abtns"><button class="abtn oui prm-save">Enregistrer</button></div>
      </details>`).join("") + `</div>`;
    z.querySelectorAll(".prm-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        const v = sl.querySelector(".prm-txt").value.slice(0, 4000);
        await call("params_save", { cle: sl.dataset.pcle, valeur: v });
        PARAMS[sl.dataset.pcle] = v;
        const sm = sl.querySelector("summary");
        if (sm) sm.textContent = sm.textContent.replace(/ · vide$/, "") + (v.trim() ? "" : " · vide");
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { alert(e.message); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    const montreTab = t => {
      RG_TAB = t;
      z.querySelectorAll(".rg-pan").forEach(p => { p.style.display = p.id === "pan-" + t ? "" : "none"; });
      z.querySelectorAll(".rg-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    };
    z.querySelectorAll(".rg-tab").forEach(b => b.addEventListener("click", () => montreTab(b.dataset.tab)));
    montreTab(RG_TAB);
    z.querySelectorAll(".rg-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      // même normalisation que le serveur, réécrite à l'écran : affiché = stocké
      const delai = Math.max(5, Math.min(10080, Number(sl.querySelector(".rg-delai").value) || 60));
      sl.querySelector(".rg-delai").value = delai;
      const msg = sl.querySelector(".rg-msg").value.slice(0, 300);
      sl.querySelector(".rg-msg").value = msg;
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        await call("rappels_save", { rappel: {
          id: sl.dataset.rid,
          delai_min: delai,
          actif: sl.querySelector(".rg-actif").value === "oui",
          message: msg,
          cible: sl.querySelector(".rg-cible").value,
          seulement_statut: sl.querySelector(".rg-statut").value
        } });
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { alert(e.message); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    z.querySelectorAll(".rg-del").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Supprimer ce rappel ? Plus aucune notification de ce type ne partira.")) return;
      try { await call("rappels_delete", { id: b.closest(".slot").dataset.rid }); chargeRappels(); }
      catch (e) { alert(e.message); }
    }));
    z.querySelectorAll(".nt-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      const titre = sl.querySelector(".nt-titre").value.trim().slice(0, 80);
      const corps = sl.querySelector(".nt-corps").value.trim().slice(0, 300);
      if (!titre || !corps) return alert("Titre et message obligatoires.");
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        await call("notifs_save", { cle: sl.dataset.ncle, titre, corps });
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { alert(e.message); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    z.querySelectorAll(".msg-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      const msg = sl.querySelector(".msg-txt").value.trim().slice(0, 500);
      if (!msg) return alert("Le message ne peut pas être vide.");
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        await call("messages_save", { categorie: sl.dataset.cat, message: msg });
        MSG_SRV[sl.dataset.cat] = msg;
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { alert(e.message); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    el("rgAjout").addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      b.textContent = "Ajout…";
      try {
        await call("rappels_save", { rappel: { delai_min: 60, message: "Dans 1 h : {type} avec {prospect} à {heure}.", actif: true, cible: "assigne" } });
        chargeRappels();
      } catch (e) { alert(e.message); b.disabled = false; b.textContent = "Ajouter un rappel"; }
    });
  } catch (e) { z.innerHTML = `<div class="empty">Impossible de charger : ${esc(e.message)}</div>`; }
}

// ----- Notifications push -----
function b64ToU8(s) {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const b = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function initNotifs() {
  const zone = el("notifZone");
  if (MOI && MOI.role === "observateur") { zone.innerHTML = ""; return; }
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    zone.innerHTML = (iOS && !standalone)
      ? `<div class="slot"><div class="stitre">Recevoir les RDV en notification</div>
         <div class="sinfo">Sur iPhone : bouton Partager de Safari → « Sur l'écran d'accueil ». Ouvre ensuite Kairós depuis la nouvelle icône et reviens ici pour activer les notifications.</div></div>`
      : "";
    return;
  }
  let reg;
  try { reg = await navigator.serviceWorker.register("sw.js"); }
  catch (_) { zone.innerHTML = ""; return; }
  let sub = await reg.pushManager.getSubscription();
  // Clés serveur changées = abonnement mort : on le jette pour réafficher le bouton
  if (sub && sub.options && sub.options.applicationServerKey) {
    const cle = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (cle !== VAPID_PUB) { try { await sub.unsubscribe(); } catch (_) {} sub = null; }
  }
  if (sub && Notification.permission === "granted") {
    call("push_subscribe", { sub: sub.toJSON() }).catch(() => {});
    zone.innerHTML = `<div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Notifications activées sur cet appareil.
      <button class="abtn" id="btnNotifTest" style="margin-left:8px">M'envoyer une notif de test</button></div>`;
    el("btnNotifTest").addEventListener("click", async () => {
      el("btnNotifTest").disabled = true;
      el("btnNotifTest").textContent = "Envoi…";
      try {
        const r = await call("push_test");
        el("btnNotifTest").textContent = r.envoyes
          ? "Envoyée — elle arrive dans quelques secondes"
          : "Aucun appareil abonné côté serveur — désactive puis réactive les notifications";
      } catch (e) {
        el("btnNotifTest").textContent = "Erreur : " + e.message;
      }
    });
    return;
  }
  zone.innerHTML = `<div class="slot">
    <div class="stitre">Sois prévenu quand un RDV arrive pour toi</div>
    <div class="sinfo">Une notification sur ce téléphone dès qu'un RDV de vente est à prendre, décalé ou confirmé.</div>
    <div class="abtns"><button class="abtn oui" id="btnNotifs">Activer les notifications</button></div>
  </div>`;
  el("btnNotifs").addEventListener("click", async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return alert("Les notifications sont bloquées dans les réglages du navigateur.");
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUB) });
      await call("push_subscribe", { sub: s.toJSON() });
      initNotifs();
    } catch (e) { alert("Activation impossible : " + e.message); }
  });
}

// Son « cha-ching » (caisse enregistreuse) quand une vente closée arrive
// pendant que l'app est ouverte — les notifs verrouillées gardent le son
// système (limite Apple/Google pour les web apps).
let AUDIOCTX = null, CLOSES_VUS = null;
function debloqueAudio() {
  try {
    AUDIOCTX = AUDIOCTX || new (window.AudioContext || window.webkitAudioContext)();
    if (AUDIOCTX.state !== "running") AUDIOCTX.resume();
  } catch (_) {}
}
function chaChing() {
  try {
    if (!AUDIOCTX || AUDIOCTX.state !== "running") return;
    const t0 = AUDIOCTX.currentTime;
    [[1318.5, 0], [1760, 0.09]].forEach(([f, dt]) => {
      const o = AUDIOCTX.createOscillator(), g = AUDIOCTX.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.55);
      o.connect(g); g.connect(AUDIOCTX.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.6);
    });
  } catch (_) {}
}

async function loadData() {
  try {
    const d = await call("data");
    RECORDS = (d.calls || []).map(adapt);
    RDVS = d.rdvs || [];
    if (d.maintenant) SERVER_OFFSET = new Date(d.maintenant).getTime() - Date.now();
    // Nouvelle vente closée par quelqu'un d'autre depuis le dernier chargement ?
    const Fx = SalesStats.F;
    const closesIds = new Set(RECORDS.filter(r => (r.fields[Fx.resClosing] || r.fields[Fx.resPres]) === "Closé").map(r => r.id));
    if (CLOSES_VUS && [...closesIds].some(id => !CLOSES_VUS.has(id) &&
        (RECORDS.find(r => r.id === id) || { fields: {} }).fields[Fx.qui] !== MOI.nom)) {
      chaChing();
    }
    CLOSES_VUS = closesIds;
    majProspectsIdx();
    render();
    majOffre();
    el("err").style.display = "none";
  } catch (e) {
    el("err").textContent = "Impossible de charger : " + e.message;
    el("err").style.display = "block";
    el("dot").className = "dot err";
    el("updated").textContent = "Hors ligne.";
  }
}

// Écran verrouillé : on peut coller son lien (ou juste le code) pour entrer
function brancheLock() {
  el("lock").style.display = "block";
  el("btnCodeLock").addEventListener("click", () => {
    const v = el("inCodeLock").value.trim();
    const m = v.match(/[?&]c=([^&\s]+)/);
    const code = m ? decodeURIComponent(m[1]) : v;
    if (!code) return;
    try { localStorage.setItem("sales_code", code); } catch (_) {}
    location.href = location.pathname + "?c=" + encodeURIComponent(code);
  });
}
async function init() {
  if (!CODE) { brancheLock(); return; }
  try {
    const cfg = await call("config");
    MOI = cfg.moi; EQUIPE = cfg.equipe || [];
    MSG_SRV = cfg.messages || {};
    PARAMS = cfg.parametres || {};
  } catch (e) {
    brancheLock();
    el("lockMsg").textContent = e.message === "code invalide"
      ? "Lien invalide ou désactivé. Demande ton lien personnel à Tony."
      : "Connexion impossible : " + e.message;
    return;
  }
  el("app").style.display = "";
  el("hello").textContent = "Salut " + MOI.nom;
  el("userbox").style.display = "";
  el("uinit").textContent = (MOI.nom || "?")[0].toUpperCase();
  el("unom").textContent = MOI.nom;
  el("urole").textContent = MOI.role === "admin" ? "Head of sales" : MOI.role === "observateur" ? "Observateur" : (MOI.role_vente || "membre");
  if (MOI.role === "observateur") {
    document.querySelector('#nav button[data-page="log"]').style.display = "none";
    el("fVueEquipe").style.display = "";
    el("vueEquipe").addEventListener("change", () => { VUEQUIPE = el("vueEquipe").value; render(); });
  }
  el("burger").addEventListener("click", () => { el("sideNav").classList.add("open"); el("navOverlay").classList.add("on"); });
  el("navOverlay").addEventListener("click", fermeTiroir);
  el("asideClose").addEventListener("click", fermeTiroir);
  el("bellBtn").addEventListener("click", () => { showPage("planning"); fermeTiroir(); });
  const noms = EQUIPE.map(m => m.nom);
  const optsMoi = noms.map(n => `<option${n === MOI.nom ? " selected" : ""}>${esc(n)}</option>`).join("");
  el("inQuiPres").innerHTML = optsMoi;
  el("inQuiClose").innerHTML = optsMoi;
  if (MOI.role === "admin") {
    el("navReglages").style.display = "";
    el("fQuiAdmin").style.display = "";
    el("inQui").innerHTML = EQUIPE.map(m => `<option${m.nom === MOI.nom ? " selected" : ""}>${esc(m.nom)}</option>`).join("");
    el("fVueEquipe").style.display = "";
    el("vueEquipe").addEventListener("change", () => { VUEQUIPE = el("vueEquipe").value; render(); });
    el("inQui").addEventListener("change", majEquipeForm);
    el("inQuiClose").addEventListener("change", majEquipeForm);
    majEquipeForm();
  }
  // (chips désactivés le 10/07 : Tony préfère les menus déroulants —
  //  pour les remettre : CHIP_SELECTS.forEach(buildChips);)
  // « Je fais l'appel moi-même » : seulement pour ceux qui peuvent closer
  if (!(MOI.role === "admin" || roleMatchFront("Vente", MOI.role_vente))) el("fVenteMoi").style.display = "none";
  el("inProspect").addEventListener("change", autofillProspect);
  el("inInsta").addEventListener("change", autofillDepuisInsta);
  resetForm();
  setType("Setting");
  showPage(MOI.role === "admin" || MOI.role === "observateur" ? "dashboard" : "log");
  document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => { showPage(b.dataset.page); fermeTiroir(); }));
  document.querySelectorAll("#typeBtns button").forEach(b => b.addEventListener("click", () => setType(b.dataset.t)));
  ["inResSetting", "inCause", "inResVente", "inRelSet", "inRelNs", "inRelPc", "inRelNsV"].forEach(i => el(i).addEventListener("change", majConditionnels));
  el("periodSel").addEventListener("change", () => { PERIOD = el("periodSel").value; render(); });
  el("pipeFiltre").addEventListener("change", render);
  el("fileDemarrer").addEventListener("click", () => { FILE_IDX = 0; montreFile(); });
  el("btnScript").addEventListener("click", montreScript);
  el("vueMoi").addEventListener("change", () => { VUEMOI = el("vueMoi").value; render(); });
  el("planMoi").addEventListener("click", () => { PLANFILTRE = "moi"; el("planMoi").classList.add("active"); el("planTous").classList.remove("active"); render(); });
  el("planTous").addEventListener("click", () => { PLANFILTRE = "tous"; el("planTous").classList.add("active"); el("planMoi").classList.remove("active"); render(); });
  el("refresh").addEventListener("click", loadData);
  el("logForm").addEventListener("submit", submitForm);
  document.addEventListener("click", debloqueAudio);
  initNotifs().catch(() => {});
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { debloqueAudio(); loadData(); } });
  await loadData();
  setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 10 * 60 * 1000);
}
init();
