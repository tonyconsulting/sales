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

let MOI = null, EQUIPE = [], RECORDS = [], RDVS = [], CORBEILLE = [], LEADS = [], ANNONCES = [], CARO_IDX = 0, CARO_TIMER = null, PROSPECT_FILTRE = "", FICHES = {}, SERVER_OFFSET = 0, OFFRES_VUES = new Set(), FILE_RELANCES = [], FILE_IDX = 0, PERIOD = "1j", TYPE = "Setting", PLANFILTRE = "tous", PLANTYPE = "tous", AGENDA_MODE = "mois", AGENDA_REF = Date.now(), VUEQUIPE = "toutes", VUEMOI = "equipe", PENDING_RDV = null, PENDING_PROSPECT = "", PENDING_TYPE = "", PENDING_TEL = "", PENDING_TEL_PROSPECT = "";
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
  prospection: ["Prospection", "La machine à DM : contacte, relance, convertis"],
  dashboard: ["Dashboard", "Vue d'ensemble"],
  pipeline: ["Pipeline", "Tes deals, du contact au closé"],
  prospects: ["Prospects", "Tous les prospects identifiés"],
  planning: ["Planning", "Les RDV à prendre et l'emploi du temps"],
  agenda: ["Agenda", "Le calendrier de l'équipe"],
  appels: ["Appels", "Les 100 derniers calls loggés"],
  relances: ["Relances", "Les follow-ups à faire"],
  kpi: ["KPI", "Les chiffres qui ne mentent pas"],
  reglages: ["Réglages", "Rappels automatiques et messages de relance"]
};
const ETAT_PILL = { "Closé": "green", "À relancer": "amber", "RDV de vente": "", "Vu en setting": "blue", "Setting calé": "grey", "Perdu": "red", "Contacté": "grey" };
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
  { cle: "vente_closee", label: "Vente closée (à toi)", balises: "{montant}", defaut: ["Order !", "{montant}, 1 vente by K.NE"] },
  { cle: "debrief", label: "Débrief coaching (au vendeur du call)", balises: "{qui} {prospect}", defaut: ["Débrief de {qui}", "Sur ton call avec {prospect}. Ouvre la page Appels pour le lire."] },
  { cle: "encaissement", label: "Argent du R2 reçu (à toi)", balises: "{montant} {prospect}", defaut: ["Argent reçu", "{montant} encaissé pour {prospect}."] }
];

// Options des menus « Résultat… » rapides (prospects + retards)
const RES_Q_SETTING = ["No-show", "Non abouti", "RDV de vente calé"];
const RES_Q_VENTE = ["Closé", "Pas closé", "No-show", "À relancer"];
const quickresHTML = r => r.type === "R2"
  ? `<button class="abtn oui" data-act="r2-encaisse" data-id="${r.id}">Argent reçu</button>`
  : `<select class="quickres" data-rdv="${r.id}"><option value="">${r.type === "Setting" ? "Résultat du setting…" : "Résultat de la vente…"}</option>` +
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
  return { fields: f, createdTime: row.created_at, id: row.id, equipe: row.equipe, rdvId: row.rdv_id || null, debrief: row.debrief || null, debriefPar: row.debrief_par || null, debriefLe: row.debrief_le || null };
}

// Déjà un RDV confirmé à ±45 min ? (le serveur refuse l'acceptation de toute façon)
function monConflit(r) {
  if (!MOI) return false;
  const t = new Date(r.quand).getTime();
  return RDVS.some(x => x.id !== r.id && x.assigne_a === MOI.nom && x.statut === "confirme" &&
    Math.abs(new Date(x.quand).getTime() - t) <= 45 * 60000);
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

function majOffZone(today) {
  const z = el("offZone");
  if (!z || !MOI || MOI.role === "observateur") { if (z) z.innerHTML = ""; return; }
  const off = MOI.off_jusqu_au && MOI.off_jusqu_au >= today;
  // Discret, en haut à droite : calendrier + pilule d'état (compactes, jamais étalées)
  const webcal = API.replace(/^https:\/\//, "webcal://") + "?ics=" + encodeURIComponent(CODE);
  z.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin:-4px 0 10px;flex-wrap:wrap">
      <a class="fsel" href="${webcal}" style="text-decoration:none;color:var(--ink);font-size:13.5px;padding:0 13px" title="Tes RDV Kairós directement dans le Calendrier Apple, mis à jour tout seuls">${IC_REG.temps}Mon calendrier</a>
      <div class="fsel">${IC_REG.etat}<select id="offSelect" ${off ? 'style="color:#f87171"' : ""}>
        ${off
          ? `<option value="">Off jusqu'au ${jolieDate(MOI.off_jusqu_au, today)}</option><option value="retour">Je suis de retour</option>`
          : `<option value="">Dispo</option>
             <option value="1">Off aujourd'hui</option>
             <option value="3">Off 3 jours</option>
             <option value="7">Off 1 semaine</option>
             <option value="14">Off 2 semaines</option>`}
      </select></div>
    </div>`;
  el("offSelect").addEventListener("change", async () => {
    const v = el("offSelect").value;
    if (!v) return;
    try {
      if (v === "retour") {
        await call("membre_off", { jusqu_au: null });
        MOI.off_jusqu_au = null;
      } else {
        const d = new Date(today + "T12:00:00");
        d.setDate(d.getDate() + Number(v) - 1);
        const jusqu = SalesStats.ymdLocal(d);
        await call("membre_off", { jusqu_au: jusqu });
        MOI.off_jusqu_au = jusqu;
      }
      render();
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); el("offSelect").value = ""; }
  });
}
function renderPlanning(today) {
  majOffZone(today);
  const moi = MOI.nom, admin = MOI.role === "admin";
  // Préserver une saisie d'horaire en cours (le re-render toutes les 10 min l'effacerait)
  const inlinesOuverts = [...document.querySelectorAll(".decale-inline")].filter(x => x.style.display === "flex").map(x => x.id);
  const saisiesInline = {};
  document.querySelectorAll(".decale-inline input").forEach(i => { if (i.value) saisiesInline[i.id] = i.value; });
  const retardOuvert = !!document.querySelector("details.retard[open]");
  const tousActifs = rdvsVisibles().filter(r => r.statut !== "annule" && r.statut !== "fait");
  // Le badge de la cloche reste honnête : compté AVANT les filtres d'affichage
  const badgePourMoi = tousActifs.filter(r => r.statut !== "confirme" && !monConflit(r) &&
    ((r.statut === "propose" && r.assigne_a === moi) ||
     (r.statut === "ouvert" && roleMatchFront(r.type, MOI.role_vente) && !(r.refusee_par || []).includes(moi) && r.setter !== moi))).length;
  const badgeProps = tousActifs.filter(r => r.statut === "decale" && (admin || r.setter === moi)).length;
  // Filtres de la page : catégorie (Setting / Vente / R2) et « les miens »
  const typeOk = r => PLANTYPE === "tous" ||
    (PLANTYPE === "Vente" ? ["Vente", "Prez", "Closing"].includes(r.type) : r.type === PLANTYPE);
  const quiOk = r => PLANFILTRE !== "moi" || r.assigne_a === moi || r.setter === moi;
  const actifs = tousActifs.filter(r => typeOk(r) && quiOk(r));
  const nonConfirmes = actifs.filter(r => r.statut !== "confirme");

  const pourMoi = nonConfirmes.filter(r => !monConflit(r) &&
    ((r.statut === "propose" && r.assigne_a === moi) ||
     (r.statut === "ouvert" && roleMatchFront(r.type, MOI.role_vente) && !(r.refusee_par || []).includes(moi) && r.setter !== moi)));
  const propositions = actifs.filter(r => r.statut === "decale" && (admin || r.setter === moi));
  const enAttente = nonConfirmes.filter(r => !pourMoi.includes(r) && !propositions.includes(r));

  el("bPlan").style.display = (badgePourMoi + badgeProps) ? "" : "none";
  el("bPlan").textContent = badgePourMoi + badgeProps;

  const ficheHTML = r => r.fiche ? `<details style="margin-bottom:10px"><summary>Fiche prospect</summary><div>${esc(r.fiche)}</div></details>` : "";
  const outilsSetter = r => (admin || r.setter === moi)
    ? (r.statut === "propose" ? `<button class="abtn" data-act="rdv_ouvre" data-id="${r.id}">Ouvrir à tous</button>` : "") +
      `<button class="abtn non" data-act="rdv_annule" data-id="${r.id}">Annuler</button>`
    : "";

  const reassignHTML = r => !admin ? "" : `
        <select class="quickres" data-reassigner="${r.id}">
          <option value="">Réassigner à…</option>
          ${EQUIPE.filter(m => m.equipe === r.equipe && roleMatchFront(r.type, m.role_vente)).map(m => `<option>${esc(m.nom)}</option>`).join("")}
        </select>`;
  const zone = (titre, coul, n, inner) => `
    <div class="pzone">
      <h3><span class="kdot" style="background:${coul}"></span>${titre}<span class="knb">${n}</span></h3>
      ${inner}
    </div>`;
  let html = "";
  if (pourMoi.length) {
    html += zone("À prendre — c'est pour toi", "var(--accent)", pourMoi.length, pourMoi.map(r => `
      <div class="slot" ${r.offre_niveau >= 3 ? 'style="border-color:#7f1d1d"' : ""}>
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}${r.offre_niveau >= 3 ? ' <span class="pill red">Sans preneur</span>' : ""}</div>
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
      </div>`).join(""));
  }
  if (propositions.length) {
    html += zone("Propositions de décalage à valider (vérifie avec le prospect)", "#60a5fa", propositions.length, propositions.map(r => `
      <div class="slot">
        <div class="stitre">${esc(r.type)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${esc(r.proposition_par)} propose ${quandJoli(r.proposition, today)} au lieu de ${quandJoli(r.quand, today)}</div>
        <div class="abtns">
          <button class="abtn oui" data-act="prop-oui" data-id="${r.id}">Le prospect est ok</button>
          <button class="abtn non" data-act="prop-non" data-id="${r.id}">Refuser (repart à l'équipe)</button>
        </div>
      </div>`).join(""));
  }
  const mesConfirmes = actifs.filter(r => r.statut === "confirme" && r.type !== "Perso" && (admin || r.assigne_a === moi || r.setter === moi))
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
  const r2HTML = r => r.type !== "R2" ? "" :
    `<div class="sinfo" style="color:var(--accent)">À encaisser : ${eur(r.montant_attendu || 0)}${r.note_r2 ? " · " + esc(r.note_r2) : ""}</div>`;
  const enRetard = mesConfirmes.filter(r => r.quand < seuilRetard);
  if (aLogger.length) {
    html += zone("À logger — l'appel est passé (ou c'est aujourd'hui)", "#fbbf24", aLogger.length, aLogger.map(r => `
      <div class="slot">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${avi(r.assigne_a)}</div>
        ${prisHTML(r)}${r2HTML(r)}
        ${r.qualif ? `<div class="sinfo">${esc(r.qualif)}</div>` : ""}
        ${r.quand > new Date().toISOString() ? confHTML(r) : ""}
        ${ficheHTML(r)}
        <div class="abtns">
          ${r.type === "R2"
            ? `<button class="abtn oui" data-act="r2-encaisse" data-id="${r.id}">Argent reçu</button>`
            : `<button class="abtn oui" data-act="log-resultat" data-id="${r.id}">Log le résultat (pré-rempli)</button>`}
          <button class="abtn" data-act="toggle-deplace" data-id="${r.id}">Décaler</button>
          ${outilsSetter(r)}
        </div>
        ${deplaceHTML(r)}
      </div>`).join(""));
  }
  if (aVenir.length) {
    html += zone("À venir — confirmés", "#34d399", aVenir.length, aVenir.map(r => `
      <div class="slot">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${avi(r.assigne_a)}</div>
        ${prisHTML(r)}${r2HTML(r)}
        ${r.qualif ? `<div class="sinfo">${esc(r.qualif)}</div>` : ""}
        ${confHTML(r)}
        ${ficheHTML(r)}
        <div class="abtns">
          <button class="abtn" data-act="toggle-deplace" data-id="${r.id}">Décaler</button>
          ${outilsSetter(r)}
        </div>
        ${deplaceHTML(r)}
      </div>`).join(""));
  }
  if (enAttente.length) {
    html += zone("En cours d'attribution", "#948da6", enAttente.length, enAttente.map(r => `
      <div class="slot ${r.offre_niveau >= 3 ? "" : "grise"}" ${r.offre_niveau >= 3 ? 'style="border-color:#7f1d1d"' : ""}>
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)}${r.offre_niveau >= 3 ? ' <span class="pill red">Sans preneur</span>' : ""}</div>
        <div class="sinfo">${slotInfo(r)}</div>
        <div class="setat">${etatTexte(r)}</div>
        <div class="abtns">${reassignHTML(r)}${outilsSetter(r)}</div>
      </div>`).join(""));
  }
  if (enRetard.length) {
    html += zone("En retard — à régulariser", "#f87171", enRetard.length,
      `<details class="retard"><summary>Déplier pour régulariser</summary>` +
      enRetard.map(r => `
      <div class="slot grise">
        <div class="stitre">${chipEquipe(r.equipe)}${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(r.prospect)}</div>
        <div class="sinfo">${slotInfo(r)} · pris par ${avi(r.assigne_a)} — résultat jamais loggé</div>
        <div class="abtns">${quickresHTML(r)} ${outilsSetter(r)}</div>
      </div>`).join("") + `</details>`);
  }
  el("aprendre").innerHTML = html || `<div class="empty">${PLANTYPE !== "tous" || PLANFILTRE === "moi" ? "Rien dans ce filtre." : "Rien pour l'instant. Les settings calés et les RDV de vente arrivent ici."}</div>`;
  el("propositions").innerHTML = "";

  // Emploi du temps (aujourd'hui -> +14 jours)
  let liste = actifs.filter(r => jourLocal(r.quand) >= today);
  liste.sort((a, c) => a.quand.localeCompare(c.quand));
  const parJour = {};
  liste.forEach(r => { const j = jourLocal(r.quand); (parJour[j] = parJour[j] || []).push(r); });
  el("planning").innerHTML = Object.keys(parJour).length
    ? `<div class="pzone">` + Object.keys(parJour).sort().map(j =>
        `<div class="jour">${jolieDate(j, today)}</div>` +
        parJour[j].map(r => `
          <div class="pl ${r.statut === "confirme" ? "" : "grise"}">
            <span class="h">${heureLocale(r.quand)}</span>
            ${chipEquipe(r.equipe)}<span class="pill grey">${esc(r.type)}</span>
            <span>${esc(r.prospect)}</span>
            <span>${r.assigne_a ? avi(r.assigne_a) : `<span class="pill amber">À prendre</span>`}</span>
            <span class="conf ${r.statut === "confirme" ? "today" : ""}" style="font-size:12px">${r.statut === "confirme" ? "confirmé" : "en attente"}</span>
          </div>`).join("")).join("") + `</div>`
    : `<div class="empty">Aucun RDV à venir${PLANFILTRE === "moi" || PLANTYPE !== "tous" ? " dans ce filtre" : ""}.</div>`;

  inlinesOuverts.forEach(id => { const d = el(id); if (d) d.style.display = "flex"; });
  Object.entries(saisiesInline).forEach(([id, v]) => { const i = el(id); if (i) i.value = v; });
  if (retardOuvert) { const det = document.querySelector("details.retard"); if (det) det.open = true; }

  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.id, act = b.dataset.act;
    if (b.classList.contains("busy")) return;
    if (!act.startsWith("toggle")) b.classList.add("busy");
    try {
      if (act === "toggle-decale") { const d = el("dec-" + id); d.style.display = d.style.display === "flex" ? "none" : "flex"; return; }
      if (act === "toggle-deplace") { const d = el("dep-" + id); d.style.display = d.style.display === "flex" ? "none" : "flex"; return; }
      if (act === "rdv_deplace") {
        const v = el("deph-" + id).value;
        if (!v) return toast("Choisis le nouvel horaire.", "err");
        await call("rdv_deplace", { id, quand: new Date(v).toISOString() });
        await loadData();
        return;
      }
      if (act === "conf-prospect") {
        await call("rdv_confirme_prospect", { id, ok: true });
        await loadData();
        return;
      }
      if (act === "r2-encaisse") {
        try { await call("r2_encaisse", { id }); } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
        await loadData();
        return;
      }
      if (act === "copie-conf") {
        const msg = (MSG_SRV.confirmation || MSG_RELANCE.confirmation)
          .replace("{prenom}", (b.dataset.nom || "").trim().split(/\s+/)[0] || "")
          .replace("{date}", quandJoli(b.dataset.quand, SalesStats.ymdLocal(new Date())));
        try { await navigator.clipboard.writeText(msg); b.textContent = "Copié, colle-le en DM"; setTimeout(() => { b.textContent = "Copier le message de confirmation"; }, 2000); }
        catch (_) { copieManuelle(msg, "Copie le message"); }
        return;
      }
      if (act === "log-resultat") {
        const r = RDVS.find(x => x.id === id);
        if (r) prefillLog(r);
        return;
      }
      if (act === "rdv_propose") {
        const v = el("dech-" + id).value;
        if (!v) return toast("Choisis le nouvel horaire.", "err");
        await call("rdv_propose", { id, quand: new Date(v).toISOString() });
      } else if (act === "prop-oui") await call("rdv_reponse_proposition", { id, ok: true });
      else if (act === "prop-non") await call("rdv_reponse_proposition", { id, ok: false });
      else if (act === "rdv_annule") { if (!(await confirmer({ titre: "Annuler ce RDV ?", ok: "Oui, annuler", danger: true }))) return; await call("rdv_annule", { id }); }
      else await call(act, { id });
      await loadData();
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    finally { b.classList.remove("busy"); }
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
          { t: r.assigne_a ? avi(r.assigne_a) : `<span class="pill amber">À prendre</span>` },
          { t: avi(r.setter) },
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
  {
    let attente = 0;
    rdvsVisibles().forEach(r => {
      if (r.type !== "R2" || !["confirme", "decale"].includes(r.statut)) return;
      if (VUEMOI === "moi" && r.assigne_a !== MOI.nom) return;
      if (MOI.role !== "admin" && VUEMOI !== "moi" && r.assigne_a !== MOI.nom) return;
      attente += Number(r.montant_attendu) || 0;
    });
    if (attente) cartes.push(["En attente d'encaissement", eur(attente)]);
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
  const KDOT = { "Setting calé": "#948da6", "Vu en setting": "#60a5fa", "RDV de vente": "#a78bfa", "À relancer": "#fbbf24", "Closé": "#34d399", "Perdu": "#f87171" };
  el("kanban").innerHTML = prospectsPipe.length
    ? ORDRE.map(etat => {
        const list = prospectsPipe.filter(x => x.etat === etat);
        const totalEur = etat === "Closé" ? list.reduce((t2, x) => t2 + (x.vendu || 0), 0)
          : etat === "À relancer" ? list.reduce((t2, x) => t2 + (x.relanceEur || 0), 0) : null;
        const cards = list.slice(0, 20).map(x =>
          `<div class="kcard fiche-tap" data-cle="${esc(x.cle || "")}" ${x.sommeil ? 'style="border-left:3px solid var(--bad);cursor:pointer"' : 'style="cursor:pointer"'}><div class="kn">${esc(x.nom || x.contact || "?")}</div><div class="kc">${esc(x.contact)}</div>` +
          (x.sommeil ? `<div class="rot">${x.joursSans} j sans contact</div>` : "") +
          (etat === "Closé" && x.vendu ? `<div class="ke">${eur(x.vendu)}${x.vendu > x.encaisse ? " (reste " + eur(x.vendu - x.encaisse) + ")" : ""}</div>` : "") +
          (etat === "À relancer" && x.relanceEur ? `<div class="ke">${eur(x.relanceEur)}</div>` : "") + `</div>`).join("");
        return `<div class="kol">
          <h3><span class="kdot" style="background:${KDOT[etat] || "var(--muted)"}"></span>${etat}<span class="knb">${list.length}</span></h3>
          <div class="keur">${totalEur !== null ? eur(totalEur) : "&nbsp;"}</div>
          ${list.length ? cards : `<div class="kvide">Vide</div>`}
          ${list.length > 20 ? `<div class="kmore">+ ${list.length - 20} autres</div>` : ""}
        </div>`;
      }).join("")
    : `<div class="empty">${filtrePipe === "tous" ? "Aucun prospect identifié." : "Rien dans ce filtre. Bon signe."}</div>`;
  document.querySelectorAll(".fiche-tap").forEach(k => k.addEventListener("click", () => montreFiche(k.dataset.cle)));

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

  FICHES = {};
  s.prospects.forEach(x => { if (x.cle) FICHES[x.cle] = x; });
  const filtreP = PROSPECT_FILTRE.trim().toLowerCase();
  const prospectsMontres = !filtreP ? s.prospects
    : s.prospects.filter(x => (x.nom || "").toLowerCase().includes(filtreP) || (x.contact || "").toLowerCase().includes(filtreP));
  el("prospectsT").innerHTML = prospectsMontres.length
    ? tableHTML(
        [{ t: "Prospect" }, { t: "Contact" }, { t: "Source" }, { t: "État" }, { t: "" }, { t: "Dernier contact" }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        prospectsMontres.map(x => {
          const rp = rdvEchuDe(x);
          const quick = rp ? quickresHTML(rp) : "";
          return [
            { t: `<a href="#" class="fiche-lien" data-cle="${esc(x.cle || "")}" style="color:var(--fg);text-decoration:underline dotted var(--muted)">${esc(x.nom || "?")}</a>` }, { t: esc(x.contact) }, { t: esc(x.source || "–") },
            { t: `<span class="pill ${ETAT_PILL[x.etat] || ""}">${esc(x.etat)}</span>` },
            { t: quick },
            { t: esc(jolieDate(x.dernier, s.today)) + (x.sommeil ? ` <span class="rot">(${x.joursSans} j)</span>` : "") }, { t: eurOu(x.vendu), n: 1 }, { t: eurOu(x.encaisse), n: 1 }
          ];
        }))
    : `<div class="empty">${filtreP ? "Aucun prospect ne correspond à la recherche." : "Aucun prospect identifié."}</div>`;
  document.querySelectorAll(".fiche-lien").forEach(l2 => l2.addEventListener("click", e2 => { e2.preventDefault(); montreFiche(l2.dataset.cle); }));

  const calls = recsVisibles().slice()
    .sort((a, c) => (SalesStats.dateOf(c) + (c.createdTime || "")).localeCompare(SalesStats.dateOf(a) + (a.createdTime || "")))
    .slice(0, 100);
  const admin2 = MOI.role === "admin";
  const peutCorriger = r => {
    if (admin2) return true;
    if (MOI.role === "observateur") return false;
    const f = r.fields || {};
    const mien = f[F.qui] === MOI.nom || f[F.quiPres] === MOI.nom;
    return mien && r.createdTime && (Date.now() - new Date(r.createdTime).getTime()) < 24 * 3600 * 1000;
  };
  const headA = [{ t: "Date" }, { t: "Type" }, { t: "Qui" }, { t: "Prospect" }, { t: "Résultat" }, { t: "Montant", n: 1 }, { t: "Encaissé", n: 1 }, { t: "" }];
  el("appels").innerHTML = calls.length
    ? tableHTML(headA,
        calls.map(r => {
          const f = r.fields || {};
          let res = f[F.resSetting] || f[F.resPres] || f[F.resClosing] || (f[F.type] === "Paiement" ? "Encaissement" : "–");
          if (f[F.cause]) res += " (" + f[F.cause] + ")";
          const boutons = [];
          if (peutCorriger(r)) boutons.push(`<button class="del" data-corrige="${r.id}">Corriger</button>`);
          if (admin2) boutons.push(`<button class="del" data-debrief="${r.id}">${r.debrief ? "Débriefé" : "Débrief"}</button>`);
          else if (r.debrief) boutons.push(`<button class="del" data-debrief="${r.id}">Débrief</button>`);
          if (admin2) boutons.push(`<button class="del" data-id="${r.id}" title="Mettre à la corbeille">Supprimer</button>`);
          const row = [
            { t: esc(jolieDate(SalesStats.dateOf(r), s.today)) },
            { t: chipEquipe(r.equipe) + `<span class="pill grey">${esc(f[F.type] || "?")}</span>` },
            { t: avi(f[F.qui] || "?") }, { t: esc(f[F.prospect] || "?") }, { t: esc(res) },
            { t: f[F.montant] ? eur(f[F.montant]) : "", n: 1 },
            { t: f[F.encaisse] ? eur(f[F.encaisse]) : "", n: 1 },
            { t: boutons.join(" "), n: 1 }
          ];
          return row;
        }))
    : `<div class="empty">Aucun call loggé pour l'instant.</div>`;
  document.querySelectorAll("[data-corrige]").forEach(b => b.addEventListener("click", () => montreCorrige(b.dataset.corrige)));
  document.querySelectorAll("[data-debrief]").forEach(b => b.addEventListener("click", () => montreDebrief(b.dataset.debrief)));
  document.querySelectorAll(".del[data-id]").forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmer({ titre: "Mettre ce call à la corbeille ?", texte: "S'il avait créé un RDV au planning, le RDV sera annulé. Restaurable pendant 30 jours en bas de cette page.", ok: "À la corbeille", danger: true }))) return;
    try { await call("delete", { id: b.dataset.id }); await loadData(); } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  }));

  // Corbeille (admin) : restaurable 30 jours
  if (el("corbeilleZone")) {
    el("corbeilleZone").innerHTML = (admin2 && CORBEILLE.length) ? `
      <details class="slot regl" style="margin-top:14px">
        <summary>Corbeille (${CORBEILLE.length}) — vidée automatiquement après 30 jours</summary>
        ${CORBEILLE.map(c => `
          <div class="sinfo" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)">
            <span>${esc(c.date || "")} · ${esc(c.type || "?")} · ${esc(c.prospect || "?")} (${esc(c.qui || "?")})</span>
            <button class="abtn" data-restaure="${c.id}">Restaurer</button>
          </div>`).join("")}
      </details>` : "";
    document.querySelectorAll("[data-restaure]").forEach(b => b.addEventListener("click", async () => {
      try { await call("call_restore", { id: b.dataset.restaure }); await loadData(); } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    }));
  }

  el("relances").innerHTML = s.relances.length
    ? tableHTML(
        [{ t: "Pour le" }, { t: "Prospect" }, { t: "Contact" }, { t: "Catégorie" }, { t: "Source" }, { t: "Qui" }, { t: "Notes" }, { t: "" }],
        s.relances.map(r => [
          { t: r.date < s.today ? `<span class="late">${esc(jolieDate(r.date, s.today))}</span>` : esc(jolieDate(r.date, s.today)) },
          { t: esc(r.prospect) }, { t: esc(r.contact) },
          { t: `<span class="pill amber">${esc(r.categorie || "–")}</span>` + (r.echange ? `<div style="color:var(--muted);font-size:11px;margin-top:3px">échange du ${esc(jolieDate(r.echange, s.today))}</div>` : "") },
          { t: esc(r.source || "–") }, { t: avi(r.qui) },
          { t: r.notes ? `<details><summary>voir</summary><div>${esc(r.notes)}</div></details>` : "" },
          { t: MOI.role === "observateur" ? "" : `<button class="abtn rel-copie" data-msg="${esc(msgRelance(r))}">Copier le message</button> <button class="abtn oui rel-log" data-nom="${esc(r.prospect)}" data-contact="${esc(r.contact)}" data-type="${r.type === "Vente" ? "Vente" : "Setting"}" data-source="${esc(r.source || "")}">Log le résultat</button>` }
        ]))
    : `<div class="empty">Aucune relance en attente.</div>`;
  document.querySelectorAll(".rel-copie").forEach(b => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.msg);
      const t = b.textContent; b.textContent = "Copié, colle-le en DM";
      setTimeout(() => { b.textContent = t; }, 2000);
    } catch (_) { copieManuelle(b.dataset.msg, "Copie le message"); }
  }));
  document.querySelectorAll(".rel-log").forEach(b => b.addEventListener("click", () => {
    showPage("log"); resetForm(); setType(b.dataset.type);
    el("inProspect").value = b.dataset.nom === "?" ? "" : b.dataset.nom;
    if (String(b.dataset.contact).startsWith("@")) el("inInsta").value = b.dataset.contact;
    else if (b.dataset.contact) { PENDING_TEL = b.dataset.contact; PENDING_TEL_PROSPECT = b.dataset.nom || ""; }
    if (b.dataset.source) el("inSource").value = b.dataset.source;
    toast("Pré-rempli pour la relance de " + (b.dataset.nom || "?") + " — choisis le résultat et enregistre.");
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
        dispArr.map(([nom2, arr]) => [{ t: avi(nom2) }, { t: arr.length, n: 1 }, { t: formatDelaiPrise(medi(arr)).replace("pris ", ""), n: 1 }]))
    : `<div class="empty">Aucun RDV dispatché pris sur la période.</div>`;

  if (el("bilanZone")) {
    if (MOI.role === "admin") {
      el("bilanZone").innerHTML = `<div class="abtns" style="margin-bottom:6px">
        <button class="abtn" data-bilan="kelian">Copier le bilan de la semaine — Team Kélian</button>
        <button class="abtn" data-bilan="mila">Copier le bilan — Team Mila</button>
      </div>`;
      el("bilanZone").querySelectorAll("[data-bilan]").forEach(b => b.addEventListener("click", async () => {
        const eq = b.dataset.bilan;
        const txt = bilanSemaine(eq, eq === "kelian" ? "Team Kélian" : "Team Mila");
        try { await navigator.clipboard.writeText(txt); const t0 = b.textContent; b.textContent = "Copié, colle-le en DM"; setTimeout(() => { b.textContent = t0; }, 2500); }
        catch (_) { copieManuelle(txt, "Copie le bilan"); }
      }));
    } else el("bilanZone").innerHTML = "";
  }
  if (el("comparatifZone")) {
    if (MOI.role === "admin" && VUEQUIPE === "toutes") {
      const gK = SalesStats.compute(RECORDS.filter(r => r.equipe === "kelian"), PERIOD, new Date()).global;
      const gM = SalesStats.compute(RECORDS.filter(r => r.equipe === "mila"), PERIOD, new Date()).global;
      const lignes = [
        ["Settings calés", x => x.cales || 0], ["Settings effectués", x => x.effectues || 0],
        ["Show", x => fmtPct(x.txShow)], ["RDV de vente calés", x => x.versVente || 0],
        ["Ventes closées", x => x.closes || 0], ["Taux de closing", x => fmtPct(x.txClose)],
        ["Vendu", x => eur(x.vendu || 0)], ["Encaissé", x => eur(x.encaisse || 0)],
      ];
      el("comparatifZone").innerHTML = `<h2>Kélian vs Mila (période sélectionnée)</h2><div class="tscroll">` +
        tableHTML([{ t: "" }, { t: "Team Kélian", n: 1 }, { t: "Team Mila", n: 1 }],
          lignes.map(([lbl, fn]) => [{ t: lbl }, { t: fn(gK), n: 1 }, { t: fn(gM), n: 1 }])) + `</div>`;
    } else el("comparatifZone").innerHTML = "";
  }

  const names = Object.keys(s.people).sort();
  el("people").innerHTML = names.length
    ? tableHTML(
        [{ t: "Qui" }, { t: "Settings calés", n: 1 }, { t: "Effectués", n: 1 }, { t: "Show", n: 1 }, { t: "No-show setting", n: 1 }, { t: "No-show vente", n: 1 }, { t: "Non aboutis", n: 1 }, { t: "RDV de vente", n: 1 }, { t: "Prez faites", n: 1 }, { t: "Closings faits", n: 1 }, { t: "Closés", n: 1 }, { t: "Taux close", n: 1 }, { t: "Vendu", n: 1 }, { t: "Encaissé", n: 1 }],
        names.map(n => { const x = s.people[n]; return [
          { t: avi(n) }, { t: x.cales, n: 1 }, { t: x.effectues, n: 1 },
          { t: fmtPct(x.txShow), n: 1 }, { t: x.noShows, n: 1 }, { t: x.ventesNoShow, n: 1 }, { t: x.nonAboutis, n: 1 },
          { t: x.versVente, n: 1 }, { t: x.presFaites, n: 1 }, { t: x.ventesEff, n: 1 },
          { t: x.closes, n: 1 },
          { t: fmtPct(x.txClose), n: 1 },
          { t: eur(x.vendu), n: 1 }, { t: eur(x.encaisse), n: 1 }
        ]; }))
    : `<div class="empty">Aucun call loggé sur la période.</div>`;

  renderPlanning(s.today);
  renderAgenda();
  renderJeu(s);
  renderAnnonces();
  renderProspection(s);

  // Menus « Résultat… » rapides (table prospects + retards du planning)
  document.querySelectorAll(".quickres").forEach(sel => sel.addEventListener("change", async () => {
    if (sel.dataset.reassigner) {
      if (!sel.value) return;
      try { await call("rdv_reassigner", { id: sel.dataset.reassigner, nom: sel.value }); await loadData(); }
      catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      return;
    }
    const r = RDVS.find(x => x.id === sel.dataset.rdv);
    if (r && sel.value) prefillLog(r, sel.value);
  }));

  // Bandeau « En retard » du dashboard : la dette avant le neuf
  const relRetard = s.relances.filter(r => r.date < s.today && (MOI.role === "admin" || r.qui === MOI.nom)).length;
  const nbRegulariser = rdvsVisibles().filter(r => r.statut === "confirme" && !["Perso", "R2"].includes(r.type) &&
    r.quand < new Date(Date.now() - 48 * 3600 * 1000).toISOString() &&
    (MOI.role === "admin" || r.assigne_a === MOI.nom || r.setter === MOI.nom)).length;
  const nbSansPreneur = MOI.role === "admin" ? rdvsVisibles().filter(r => r.statut === "ouvert" && r.offre_niveau >= 3).length : 0;
  const nbR2 = rdvsVisibles().filter(r => r.type === "R2" && r.statut === "confirme" &&
    r.quand < new Date().toISOString() && (MOI.role === "admin" || r.assigne_a === MOI.nom)).length;
  const segs = [];
  if (relRetard) segs.push(`<span data-va="relances">${relRetard} relance${relRetard > 1 ? "s" : ""} en retard</span>`);
  if (nbRegulariser) segs.push(`<span data-va="planning">${nbRegulariser} résultat${nbRegulariser > 1 ? "s" : ""} à saisir</span>`);
  if (nbSansPreneur) segs.push(`<span data-va="planning">${nbSansPreneur} RDV sans preneur</span>`);
  if (nbR2) segs.push(`<span data-va="planning">${nbR2} encaissement${nbR2 > 1 ? "s" : ""} à confirmer</span>`);
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
  // Pastille sur l'icône de l'app (iOS 16.4+, Android)
  if ("setAppBadge" in navigator) {
    try { nbCloche ? navigator.setAppBadge(nbCloche) : navigator.clearAppBadge(); } catch (_) { /* pas grave */ }
  }
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
  el("periodCtrls").style.display = (id === "log" || id === "planning" || id === "reglages" || id === "agenda") ? "none" : "";
  if (id === "reglages") chargeRappels();
}
// Tiroir de navigation (mobile)
function fermeTiroir() {
  el("sideNav").classList.remove("open");
  el("navOverlay").classList.remove("on");
}

// ----- Feedback maison : toast, confirmation, copie manuelle (fin des popups navigateur) -----
let TOAST_TIMER = null;
function toast(msg, type, ms) {
  let t = document.getElementById("toastG");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastG";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast-g" + (type === "err" ? " err" : "");
  setTimeout(() => t.classList.add("on"), 10);
  clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(() => t.classList.remove("on"), ms || (type === "err" ? 5000 : 4000));
}
function confirmer(o) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "dlg-ov";
    ov.innerHTML = `<div class="dlg" role="alertdialog">
      <div class="dlg-t">${esc(o.titre || "Tu confirmes ?")}</div>
      ${o.texte ? `<div class="dlg-x">${esc(o.texte)}</div>` : ""}
      <div class="dlg-b">
        <button class="dlg-non">${esc(o.non || "Annuler")}</button>
        <button class="dlg-oui${o.danger ? " danger" : ""}">${esc(o.ok || "Oui")}</button>
      </div></div>`;
    const fin = v => { ov.remove(); document.removeEventListener("keydown", surTouche); resolve(v); };
    const surTouche = e2 => { if (e2.key === "Escape") fin(false); };
    ov.querySelector(".dlg-oui").addEventListener("click", () => fin(true));
    ov.querySelector(".dlg-non").addEventListener("click", () => fin(false));
    ov.addEventListener("click", e2 => { if (e2.target === ov) fin(false); });
    document.addEventListener("keydown", surTouche);
    document.body.appendChild(ov);
    ov.querySelector(".dlg-oui").focus();
  });
}
function copieManuelle(txt, titre) {
  const ov = document.createElement("div");
  ov.className = "dlg-ov";
  ov.innerHTML = `<div class="dlg">
    <div class="dlg-t">${esc(titre || "Copie le texte")}</div>
    <textarea readonly></textarea>
    <div class="dlg-b"><button class="dlg-oui">Fermer</button></div></div>`;
  ov.querySelector("textarea").value = txt;
  ov.querySelector(".dlg-oui").addEventListener("click", () => ov.remove());
  ov.addEventListener("click", e2 => { if (e2.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  const ta = ov.querySelector("textarea");
  ta.focus(); ta.select();
}
const eurOu = n => n ? eur(n) : '<span style="color:var(--muted)">–</span>';
// Avatar : photo de profil si elle existe, sinon initiale colorée (même personne = même couleur)
let AVATARS = {};
function avi(nom) {
  const n = String(nom || "?").trim() || "?";
  if (AVATARS[n]) return `<img class="avi" src="${AVATARS[n]}" alt="">${esc(n)}`;
  let hh = 0;
  for (const c of n) hh = (hh * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avi" style="background:hsl(${hh} 42% 26%);color:hsl(${hh} 75% 82%)">${esc(n[0].toUpperCase())}</span>${esc(n)}`;
}
function majAvatars() {
  AVATARS = {};
  (EQUIPE || []).forEach(m => { if (m.avatar) AVATARS[m.nom] = m.avatar; });
  if (MOI && MOI.avatar) AVATARS[MOI.nom] = MOI.avatar;
  const u = el("uinit");
  if (u) u.innerHTML = AVATARS[MOI.nom] ? `<img src="${AVATARS[MOI.nom]}" alt="">` : esc((MOI.nom || "?")[0].toUpperCase());
}
// L'espace profil : tap sur sa carte dans le tiroir -> photo, nom, mail, téléphone
let PROFIL_INPUT = null;
function brancheAvatar() {
  const box = el("userbox");
  if (!box) return;
  box.style.cursor = "pointer";
  box.title = "Ton profil";
  PROFIL_INPUT = document.createElement("input");
  PROFIL_INPUT.type = "file";
  PROFIL_INPUT.accept = "image/*";
  PROFIL_INPUT.style.display = "none";
  document.body.appendChild(PROFIL_INPUT);
  PROFIL_INPUT.addEventListener("change", () => {
    const f = PROFIL_INPUT.files && PROFIL_INPUT.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = async () => {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 128;
      const cx = c.getContext("2d");
      const cote = Math.min(img.width, img.height);
      cx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 128, 128);
      const data = c.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(img.src);
      PROFIL_INPUT.value = "";
      try {
        await call("avatar_upload", { image: data });
        MOI.avatar = data;
        AVATARS[MOI.nom] = data;
        majAvatars();
        render();
        const pa = el("profilAvatar");
        if (pa) pa.innerHTML = `<img src="${data}" alt="">`;
        toast("Photo enregistrée : l'équipe te voit maintenant partout avec.");
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    };
    img.onerror = () => { toast("Impossible de lire cette image.", "err"); PROFIL_INPUT.value = ""; };
    img.src = URL.createObjectURL(f);
  });
  box.addEventListener("click", () => { fermeTiroir(); montreProfil(); });
}
function montreProfil() {
  const ov = el("callOverlay");
  const lecteur = MOI.role === "observateur";
  const grandAvatar = AVATARS[MOI.nom]
    ? `<img src="${AVATARS[MOI.nom]}" alt="">`
    : `<span style="font-size:26px;font-weight:750;color:var(--accent)">${esc((MOI.nom || "?")[0].toUpperCase())}</span>`;
  ov.innerHTML = `<div class="offre-carte" style="text-align:left;max-width:440px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div id="profilAvatar" title="Changer ma photo" style="width:72px;height:72px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;flex:none;border:1px solid var(--line)">${grandAvatar}</div>
      <div>
        <div class="offre-titre" style="font-size:19px;margin:0">${esc(MOI.nom)}${MOI.nom_famille ? " " + esc(MOI.nom_famille) : ""}</div>
        <div class="sinfo" style="margin:2px 0 0">${esc(el("urole").textContent)}</div>
        ${lecteur ? "" : `<button class="del" id="profilPhotoBtn" style="margin-top:4px">${AVATARS[MOI.nom] ? "Changer ou retirer la photo" : "Ajouter une photo"}</button>`}
      </div>
    </div>
    <div class="row2">
      <div class="field"><label>Prénom (l'identité dans l'app, vois avec Tony pour le changer)</label><input value="${esc(MOI.nom)}" disabled style="opacity:.55"></div>
      <div class="field"><label>Nom</label><input id="prfNom" maxlength="40" value="${esc(MOI.nom_famille || "")}" ${lecteur ? "disabled" : ""}></div>
    </div>
    <div class="row2">
      <div class="field"><label>Email</label><input id="prfMail" type="email" maxlength="80" value="${esc(MOI.email || "")}" placeholder="prenom@exemple.com" ${lecteur ? "disabled" : ""}></div>
      <div class="field"><label>Téléphone</label><input id="prfTel" type="tel" maxlength="25" value="${esc(MOI.telephone || "")}" placeholder="+33 6 12 34 56 78" ${lecteur ? "disabled" : ""}></div>
    </div>
    <div class="offre-actions">
      ${lecteur ? "" : `<button class="abtn oui" id="prfSave">Enregistrer</button>`}
      <button class="abtn" id="prfFermer">Fermer</button>
    </div>
  </div>`;
  ouvreOverlay(ov);
  el("prfFermer").addEventListener("click", () => fermeOverlay(ov));
  const pa = el("profilAvatar"), pb = el("profilPhotoBtn");
  const photoFlow = async () => {
    if (lecteur) return;
    if (AVATARS[MOI.nom]) {
      const garde = await confirmer({ titre: "Ta photo de profil", texte: "La changer ou la retirer ?", ok: "Changer la photo", non: "Retirer la photo" });
      if (!garde) {
        try {
          await call("avatar_upload", { image: "" });
          MOI.avatar = null;
          delete AVATARS[MOI.nom];
          majAvatars();
          render();
          pa.innerHTML = `<span style="font-size:26px;font-weight:750;color:var(--accent)">${esc((MOI.nom || "?")[0].toUpperCase())}</span>`;
          toast("Photo retirée.");
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
        return;
      }
    }
    PROFIL_INPUT.click();
  };
  pa.addEventListener("click", photoFlow);
  if (pb) pb.addEventListener("click", photoFlow);
  const sv = el("prfSave");
  if (sv) sv.addEventListener("click", async () => {
    try {
      await call("profil_maj", { nom_famille: el("prfNom").value.trim(), email: el("prfMail").value.trim(), telephone: el("prfTel").value.trim() });
      MOI.nom_famille = el("prfNom").value.trim() || null;
      MOI.email = el("prfMail").value.trim() || null;
      MOI.telephone = el("prfTel").value.trim() || null;
      fermeOverlay(ov);
      toast("Profil enregistré.");
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
}
// Overlays : verrou du scroll + fermeture au tap sur le fond
function ouvreOverlay(ov) {
  ov.dataset.scrollY = window.scrollY;
  document.body.style.cssText = "position:fixed;top:-" + window.scrollY + "px;left:0;right:0";
  ov.style.display = "";
  if (ov.id !== "offreOverlay") ov.onclick = e2 => { if (e2.target === ov) fermeOverlay(ov); };
}
function fermeOverlay(ov) {
  if (ov.style.display === "none") return;
  ov.style.display = "none";
  const y = Number(ov.dataset.scrollY) || 0;
  document.body.style.cssText = "";
  window.scrollTo(0, y);
}
document.addEventListener("focusin", e2 => {
  if (e2.target.closest(".overlay-plein")) setTimeout(() => e2.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
});

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
  toast(resultat
    ? "Pré-rempli pour " + (r.prospect || "?") + " (" + resultat + ") — complète s'il manque un détail et enregistre."
    : "Pré-rempli depuis le RDV de " + (r.prospect || "?") + " — choisis le résultat et enregistre.");
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
  const r2 = rv === "Closé" && el("inEncaisseSel").value === "r2";
  el("fR2Quand").style.display = r2 ? "" : "none";
  el("fR2Note").style.display = r2 ? "" : "none";
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
// Le setter voit le planning des closers au moment où il cale
function majJourHint(inputId, hintId) {
  const inp = el(inputId), hint = el(hintId);
  if (!inp || !hint) return;
  const v = inp.value;
  if (!v) { hint.style.display = "none"; return; }
  const jourChoisi = v.slice(0, 10);
  const tChoisi = new Date(v).getTime();
  const jour = rdvsVisibles()
    .filter(r => !["annule", "fait"].includes(r.statut) && String(r.quand).length && jourLocal(r.quand) === jourChoisi)
    .sort((p, q) => p.quand.localeCompare(q.quand));
  if (!jour.length) { hint.style.display = ""; hint.innerHTML = `Ce jour-là : personne n'a encore de RDV.`; return; }
  hint.style.display = "";
  hint.innerHTML = `Déjà au planning ce jour-là :<br>` + jour.map(r => {
    const proche = Math.abs(new Date(r.quand).getTime() - tChoisi) <= 45 * 60000;
    return `<span ${proche ? 'class="late"' : ""}>${heureLocale(r.quand)} · ${esc(r.type)} · ${r.assigne_a ? esc(r.assigne_a) : "à prendre"}${proche ? " — ça se chevauche" : ""}</span>`;
  }).join("<br>");
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
  el("inEncaisseSel").value = "oui";
  majChips();
  majConditionnels();
}
async function submitForm(e) {
  e.preventDefault();
  const c = { type: TYPE, prospect: el("inProspect").value.trim() };
  if (!c.prospect) return toast("Le prospect est obligatoire.", "err");
  c.instagram = el("inInsta").value.trim();
  // Prospect historique identifié par téléphone : on transmet son numéro
  if (!c.instagram && PENDING_TEL && cleTxt(c.prospect) === cleTxt(PENDING_TEL_PROSPECT)) c.telephone = PENDING_TEL;
  if (!c.instagram && TYPE === "Vente" && el("inResVente").value === "Closé") {
    if (!(await confirmer({ titre: "Pas d'Instagram ?", texte: "Cette vente ne sera pas reliée à la fiche du prospect.", ok: "Enregistrer quand même" }))) return;
  }
  c.source = el("inSource").value;
  c.date = el("inDate").value || todayLocal();
  c.notes = el("inNotes").value.trim();
  if (MOI.role === "admin") {
    if (TYPE !== "Vente") c.qui = el("inQui").value; // pour une Vente, « Closing fait par » fait foi
    if (el("fEquipeAdmin").style.display !== "none") {
      c.equipe = el("inEquipe").value;
      if (!c.equipe) return toast("Choisis l'équipe du call.", "err");
    }
  }

  if (TYPE === "Setting") {
    c.res_setting = el("inResSetting").value;
    if (!c.res_setting) return toast("Le résultat du setting est obligatoire.", "err");
    if (c.res_setting === "Calé (à venir)") {
      if (!el("inCaleLe").value) return toast("Indique quand le setting est calé.", "err");
      c.rdv_le = new Date(el("inCaleLe").value).toISOString();
    }
    if (c.res_setting === "No-show") {
      const dr = dateRelanceDepuis("Ns");
      if (dr === null) return toast("Choisis la date de relance.", "err");
      if (dr) c.date_relance = dr;
    }
    if (c.res_setting === "Non abouti") {
      c.cause = el("inCause").value;
      if (!c.cause) return toast("La cause est obligatoire.", "err");
      const dr = dateRelanceDepuis("Set");
      if (dr === null) return toast("Choisis la date de relance.", "err");
      if (c.cause === "À rappeler" && !dr) return toast("« À rappeler » = choisis quand le relancer.", "err");
      if (dr) c.date_relance = dr;
    }
    if (c.res_setting === "RDV de vente calé") {
      if (!el("inSuiteLe").value) return toast("Indique quand le RDV de vente est calé.", "err");
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
    if (!c.res_closing) return toast("Le résultat de l'appel est obligatoire.", "err");
    c.qui_presentation = el("inQuiPres").value;
    c.qui = el("inQuiClose").value;
    if (c.res_closing === "Closé") {
      c.offre = el("inOffreV").value;
      if (!el("inMontantV").value) return toast("Indique le montant total de la vente.", "err");
      c.montant = Number(el("inMontantV").value);
      // Plus d'acomptes (10/07) : tout est comptant, l'encaissé = le montant
      c.paiement = "Comptant";
      c.encaisse = c.montant;
      // Argent pas encore arrivé (plafond bloqué...) : R2 d'encaissement au planning
      if (el("inEncaisseSel").value === "r2") {
        if (!el("inR2Quand").value) return toast("Indique la date du R2 d'encaissement.", "err");
        c.r2_quand = new Date(el("inR2Quand").value).toISOString();
        c.r2_note = el("inR2Note").value.trim();
      }
    }
    if (c.res_closing === "Pas closé") {
      c.cause = el("inCauseV").value;
      if (!c.cause) return toast("La cause est obligatoire.", "err");
      const dr = dateRelanceDepuis("Pc");
      if (dr === null) return toast("Choisis la date de relance.", "err");
      if (dr) c.date_relance = dr;
    }
    if (c.res_closing === "No-show") {
      const dr = dateRelanceDepuis("NsV");
      if (dr === null) return toast("Choisis la date de relance.", "err");
      if (dr) c.date_relance = dr;
    }
    if (c.res_closing === "À relancer") {
      if (!el("inDateRelanceV").value) return toast("Indique la date de relance (sinon la relance ne sonnera jamais).", "err");
      c.date_relance = el("inDateRelanceV").value;
      if (el("inMontantRelV").value) c.montant = Number(el("inMontantRelV").value);
    }
    if (PENDING_RDV && TYPE === PENDING_TYPE && cleTxt(c.prospect) === cleTxt(PENDING_PROSPECT)) c.rdv_id = PENDING_RDV;
    if (["Closé", "Pas closé", "À relancer"].includes(c.res_closing)) c.objection = el("inObjection").value;
  }
  el("submitBtn").disabled = true;
  el("submitBtn").classList.add("busy");
  el("submitBtn").textContent = "Enregistrement";
  try {
    const r = await call("log", { call: c });
    if (CLOSES_VUS && r.id) CLOSES_VUS.add(r.id); // pas de cha-ching pour sa propre saisie
    resetForm();
    let msgOk = r.rdv_erreur ? "Call enregistré, MAIS le RDV n'a pas pu être créé au planning — préviens Tony (" + r.rdv_erreur + ")."
      : !r.rdv ? "Call enregistré."
      : c.res_setting === "Calé (à venir)" ? "Call enregistré. Le setting est au planning."
      : r.rdv_statut === "confirme" ? "Call enregistré. L'appel de vente est au planning de " + (r.rdv_assigne || "?") + "."
      : "Call enregistré. Le RDV est parti au dispatch (onglet Planning).";
    if (r.rdv_conflit) msgOk += " Attention : il y a déjà un RDV " + r.rdv_conflit + " chez la même personne.";
    toast(msgOk, (r.rdv_erreur || r.rdv_conflit) ? "err" : "", (r.rdv_erreur || r.rdv_conflit) ? 8000 : 4000);
    loadData();
  } catch (err) {
    toast("Ça n'a pas marché : " + err.message, "err");
  } finally {
    el("submitBtn").disabled = false;
    el("submitBtn").classList.remove("busy");
    el("submitBtn").textContent = "Enregistrer";
  }
}

// ----- Écran d'offre BeReal (dispatch avec compte à rebours) -----
let OFFRE_TIMER = null;
function offrePourMoi() {
  if (!MOI || MOI.role === "observateur") return null;
  const moi = MOI.nom;
  return rdvsVisibles().find(r =>
    !OFFRES_VUES.has(r.id + "|" + r.offre_depuis) && r.offre_depuis && !monConflit(r) &&
    ((r.statut === "propose" && r.assigne_a === moi) ||
     (r.statut === "ouvert" && roleMatchFront(r.type, MOI.role_vente) && !(r.refusee_par || []).includes(moi) && r.setter !== moi)));
}
function majOffre() {
  const r = offrePourMoi();
  const ov = el("offreOverlay");
  if (!r) { fermeOverlay(ov); if (OFFRE_TIMER) { clearInterval(OFFRE_TIMER); OFFRE_TIMER = null; } return; }
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
  ouvreOverlay(ov);
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
  const ferme = () => { fermeOverlay(ov); if (OFFRE_TIMER) { clearInterval(OFFRE_TIMER); OFFRE_TIMER = null; } };
  el("offrePrendre").addEventListener("click", async () => {
    try { await call("rdv_accept", { id: r.id }); ferme(); await loadData(); showPage("planning"); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); ferme(); loadData(); }
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
    ouvreOverlay(ov);
    el("fileFin").addEventListener("click", () => { fermeOverlay(ov); loadData(); });
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
  ouvreOverlay(ov);
  el("fileCopier").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(msgRelance(r)); el("fileCopier").textContent = "Copié, colle-le en DM"; }
    catch (_) { copieManuelle(msgRelance(r), "Copie le message"); }
  });
  el("fileLog").addEventListener("click", () => {
    fermeOverlay(ov);
    showPage("log"); resetForm(); setType(r.type === "Vente" ? "Vente" : "Setting");
    el("inProspect").value = r.prospect === "?" ? "" : r.prospect;
    if (String(r.contact).startsWith("@")) el("inInsta").value = r.contact;
    else if (r.contact) { PENDING_TEL = r.contact; PENDING_TEL_PROSPECT = r.prospect === "?" ? "" : r.prospect; }
    if (r.source) el("inSource").value = r.source;
  });
  el("fileSuivant").addEventListener("click", () => { FILE_IDX++; montreFile(); });
  el("fileQuitter").addEventListener("click", () => { fermeOverlay(ov); });
}

// ----- Prospection : la machine à DM (inspirée du process de Kéo) -----
const LEAD_ETATS = { a_contacter: ["À contacter", "grey"], contacte: ["Contacté", "amber"], repondu: ["Répondu", ""], appel_reserve: ["Appel réservé", "blue"], negociation: ["En négociation", "blue"], signe: ["Converti", "green"], perdu: ["Perdu", "red"] };
function mesLeads() {
  return LEADS.filter(l => l.qui === MOI.nom);
}
function leadConverti(l) {
  // un call existe avec le même @ : le lead est passé dans la machine de vente
  const cle = "ig:" + String(l.handle || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
  return PROSPECTS_IDX ? PROSPECTS_IDX.has(cle) : false;
}
let PROSPECTS_IDX = null;
function majProspectsIdxLeads() {
  PROSPECTS_IDX = new Set(RECORDS.map(r => SalesStats.keyOf(r)).filter(Boolean));
}
function renderProspection(s) {
  if (!el("prosObjectif")) return;
  majProspectsIdxLeads();
  const today = s.today;
  const miens = mesLeads();
  const lecteur = MOI.role === "observateur";
  const objectif = Math.max(1, Number(PARAMS.prospection_objectif) || 18);
  const contactsJour = miens.filter(l => l.contacte_le === today).length;
  const relancesJour = miens.filter(l => l.derniere_relance_le === today).length;
  const actionsJour = contactsJour + relancesJour;
  const aContacter = miens.filter(l => l.statut === "a_contacter" && !leadConverti(l));
  const relancesDues = miens.filter(l => l.relance_le && l.relance_le <= today && !["a_contacter", "perdu", "signe"].includes(l.statut) && !leadConverti(l))
    .sort((p, q) => p.relance_le.localeCompare(q.relance_le));
  const froids = relancesDues.filter(l => l.relance_le < today);
  // badge de nav
  const bp = el("bPros");
  if (bp) {
    const n = lecteur ? 0 : aContacter.length + relancesDues.length;
    bp.style.display = n ? "" : "none";
    bp.textContent = n;
  }
  // anneaux d'objectif
  const ring = (fait, total, lbl) => {
    const pct = Math.min(100, Math.round(fait / Math.max(1, total) * 100));
    const coul = pct >= 100 ? "#34d399" : "var(--accent)";
    return `<div class="pring" style="background:conic-gradient(${coul} ${pct}%, #1e1930 0)">
      <span><b>${fait}</b><small>${esc(lbl)}</small></span></div>`;
  };
  el("prosObjectif").innerHTML = lecteur ? "" : `<div class="pzone">
    <h3><span class="kdot" style="background:var(--accent)"></span>Objectif du jour<span class="knb">${actionsJour} / ${objectif} actions</span></h3>
    <div class="prings">
      ${ring(contactsJour, objectif, "leads contactés sur " + objectif)}
      ${ring(relancesJour, Math.max(1, relancesDues.length + relancesJour), "relances faites (" + relancesDues.length + " dues)")}
    </div>
  </div>`;
  // le bandeau « ça refroidit »
  el("prosFroid").innerHTML = froids.length ? `<div class="bandeau-retard" style="display:block">${froids.length} lead${froids.length > 1 ? "s" : ""} refroidiss${froids.length > 1 ? "ent" : "e"} — relance-les avant de les perdre</div>` : "";
  // les files d'action
  const ligneLead = (l, bouton) => {
    const [lblE, clsE] = LEAD_ETATS[l.statut] || [l.statut, "grey"];
    const retard = l.relance_le && l.relance_le < today ? Math.round((new Date(today) - new Date(l.relance_le)) / 86400000) : 0;
    const depuis = l.contacte_le ? Math.round((new Date(today) - new Date(l.contacte_le)) / 86400000) : null;
    return `<div class="ld" data-lid="${l.id}">
      <span style="cursor:pointer" data-fichelead="${l.id}">${avi(l.handle.replace(/^@/, ""))}</span>
      <div class="ld-i" style="cursor:pointer" data-fichelead="${l.id}">
        <div class="ld-m">
          <span class="pill ${clsE}">${lblE}</span>
          ${retard ? `<span class="late">${retard} j de retard</span>` : ""}
          ${depuis !== null ? `<span>${depuis} j depuis contact</span>` : ""}
          ${l.abonnes ? `<span>${esc(l.abonnes)}</span>` : ""}${l.niche ? `<span>${esc(l.niche)}</span>` : ""}
        </div>
      </div>
      ${bouton}
    </div>`;
  };
  const zoneF = (titre, coul, liste, vide, bouton) => `<div class="pzone">
    <h3><span class="kdot" style="background:${coul}"></span>${titre}<span class="knb">${liste.length}</span></h3>
    ${liste.length ? liste.map(l => ligneLead(l, bouton(l))).join("") : `<div class="kvide">${vide}</div>`}
  </div>`;
  el("prosFiles").innerHTML = lecteur ? "" :
    zoneF("À contacter", "#948da6", aContacter, "Aucun lead à contacter. Ajoute-en au-dessus.", l => `<button class="abtn oui" data-ldgeste="contacte" data-lid="${l.id}">Contacté</button>`) +
    zoneF("Relances à faire", "#fbbf24", relancesDues, "Tout est relancé. Personne ne refroidit.", l => `<button class="abtn oui" data-ldgeste="relance" data-lid="${l.id}">Relancé</button>`);
  // le chemin vers la prochaine vente
  const contactes = miens.filter(l => l.statut !== "a_contacter" || leadConverti(l));
  const repondus = contactes.filter(l => ["repondu", "appel_reserve", "negociation", "signe"].includes(l.statut) || leadConverti(l));
  const convertis = miens.filter(l => leadConverti(l) || l.statut === "signe");
  const clesConverties = new Set(convertis.map(l => "ig:" + String(l.handle).trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "")));
  const F2 = SalesStats.F;
  const ventes = new Set();
  RECORDS.forEach(r => {
    const k = SalesStats.keyOf(r);
    if (k && clesConverties.has(k) && (r.fields[F2.resClosing] || r.fields[F2.resPres]) === "Closé") ventes.add(k);
  });
  const nC = contactes.length, nR = repondus.length, nCv = convertis.length, nV = ventes.size;
  const barF = (lbl, n, max2) => `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;font-size:13px">
    <span style="width:110px;color:var(--muted)">${lbl}</span>
    <div class="gbar" style="flex:1;margin:0"><i style="width:${Math.round(n / Math.max(1, max2) * 100)}%"></i></div>
    <b style="width:34px;text-align:right">${n}</b>
    <span style="width:44px;text-align:right;color:var(--muted);font-size:11.5px">${Math.round(n / Math.max(1, nC) * 100)} %</span>
  </div>`;
  const tauxRep = nC ? Math.round(nR / nC * 100) : 0;
  let phrase = "";
  if (nV > 0) phrase = `À ton rythme actuel (${tauxRep} % de réponse), contacte ~${Math.max(1, Math.ceil(nC / nV))} profils pour ta prochaine vente.`;
  else if (nC > 0) phrase = `Taux de réponse : ${tauxRep} %. Continue à contacter, la première vente issue de la prospection arrive.`;
  el("prosFunnel").innerHTML = (lecteur || !nC) ? "" : `<div class="pzone">
    <h3><span class="kdot" style="background:#34d399"></span>Le chemin vers la prochaine vente</h3>
    ${barF("Contactés", nC, nC)}${barF("Répondus", nR, nC)}${barF("Settings calés", nCv, nC)}${barF("Ventes closées", nV, nC)}
    ${phrase ? `<div class="sinfo" style="margin-top:8px;color:var(--accent)">${esc(phrase)}</div>` : ""}
  </div>`;
  // les 4 compteurs
  const pipeline = miens.filter(l => !["perdu"].includes(l.statut)).length;
  const convertisMois = convertis.filter(l => true).length;
  el("prosCompteurs").innerHTML = lecteur ? "" : `<div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="card"><div class="label">Leads en pipeline</div><div class="value" style="font-size:28px">${pipeline}</div></div>
    <div class="card"><div class="label">Relances aujourd'hui</div><div class="value" style="font-size:28px">${relancesJour}</div></div>
    <div class="card"><div class="label">Taux de réponse</div><div class="value" style="font-size:28px">${tauxRep} %</div></div>
    <div class="card"><div class="label">Convertis (total)</div><div class="value" style="font-size:28px">${convertisMois}</div></div>
  </div>`;
  // branchements
  document.querySelectorAll("[data-ldgeste]").forEach(b => b.addEventListener("click", async () => {
    if (b.classList.contains("busy")) return;
    b.classList.add("busy");
    try { await call("lead_action", { id: b.dataset.lid, geste: b.dataset.ldgeste }); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    finally { b.classList.remove("busy"); }
  }));
  document.querySelectorAll("[data-fichelead]").forEach(x => x.addEventListener("click", () => montreLead(x.dataset.fichelead)));
}
function montreLead(id) {
  const l = LEADS.find(x => x.id === id);
  if (!l) return;
  const ov = el("callOverlay");
  const [lblE] = LEAD_ETATS[l.statut] || [l.statut];
  const converti = leadConverti(l);
  ov.innerHTML = `<div class="offre-carte" style="text-align:left;max-width:440px">
    <div class="offre-titre" style="font-size:19px">${esc(l.handle)}</div>
    <div class="sinfo" style="margin:4px 0 12px">${esc(lblE)}${converti ? " · déjà dans tes prospects" : ""}${l.abonnes ? " · " + esc(l.abonnes) : ""}${l.niche ? " · " + esc(l.niche) : ""}${l.relances_faites ? " · " + l.relances_faites + " relance" + (l.relances_faites > 1 ? "s" : "") : ""}</div>
    ${converti ? "" : `<div class="abtns" style="flex-wrap:wrap;margin-bottom:12px">
      ${l.statut === "a_contacter" ? `<button class="abtn oui" data-g="contacte">Contacté</button>` : ""}
      ${["contacte"].includes(l.statut) ? `<button class="abtn oui" data-g="repondu">Il a répondu</button>` : ""}
      ${["repondu", "appel_reserve"].includes(l.statut) ? `<button class="abtn" data-g="negociation">En négociation</button>` : ""}
      ${["repondu", "negociation", "appel_reserve"].includes(l.statut) ? `<button class="abtn oui" id="ldCaler">Caler le setting</button>` : ""}
      <button class="abtn non" data-g="perdu">Perdu</button>
    </div>`}
    <div class="row2">
      <div class="field"><label>Prochaine relance</label><input type="date" id="ldRelDate" value="${esc(l.relance_le || "")}"></div>
      <div class="field"><label>Note</label><input id="ldNoteEdit" maxlength="300" value="${esc(l.note || "")}"></div>
    </div>
    <div class="offre-actions">
      <button class="abtn oui" id="ldSauver">Enregistrer</button>
      <button class="abtn" id="ldFermer">Fermer</button>
      <button class="abtn non" id="ldSuppr">Supprimer</button>
    </div>
  </div>`;
  ouvreOverlay(ov);
  el("ldFermer").addEventListener("click", () => fermeOverlay(ov));
  ov.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", async () => {
    try { await call("lead_action", { id: l.id, geste: b.dataset.g }); fermeOverlay(ov); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  }));
  const cal = el("ldCaler");
  if (cal) cal.addEventListener("click", () => {
    fermeOverlay(ov);
    showPage("log");
    resetForm();
    setType("Setting");
    el("inProspect").value = l.handle.replace(/^@/, "").replace(/[._]/g, " ");
    el("inInsta").value = l.handle;
    el("inResSetting").value = "Calé (à venir)";
    el("inResSetting").dispatchEvent(new Event("change"));
    toast("Pré-rempli depuis la prospection : mets la date du setting et enregistre. Le lead passera en Converti tout seul.");
  });
  el("ldSauver").addEventListener("click", async () => {
    try {
      await call("lead_maj", { id: l.id, relance_le: el("ldRelDate").value || "", note: el("ldNoteEdit").value.trim() });
      fermeOverlay(ov);
      await loadData();
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
  el("ldSuppr").addEventListener("click", async () => {
    if (!(await confirmer({ titre: "Supprimer ce lead ?", ok: "Supprimer", danger: true }))) return;
    try { await call("lead_supprime", { id: l.id }); fermeOverlay(ov); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
}

// ----- Agenda : le calendrier de l'équipe (vue mois / semaine) -----
const MOIS_NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
function agendaRdvs() {
  return rdvsVisibles().filter(r => r.statut !== "annule" && r.quand);
}
const agTypeCls = r => r.type === "R2" ? "r2" : r.type === "Perso" ? "perso" : r.type === "Setting" ? "setting" : "";
const agAttente = r => !["confirme", "fait"].includes(r.statut);
function renderAgenda() {
  const z = el("agenda");
  if (!z) return;
  const today = SalesStats.ymdLocal(new Date());
  const ref = new Date(AGENDA_REF);
  const rdvs = agendaRdvs();
  document.querySelectorAll(".agseg button").forEach(b => b.classList.toggle("active", b.dataset.agmode === AGENDA_MODE));
  if (AGENDA_MODE === "mois") {
    el("agTitre").textContent = MOIS_NOMS[ref.getMonth()][0].toUpperCase() + MOIS_NOMS[ref.getMonth()].slice(1) + " " + ref.getFullYear();
    const debut = new Date(ref.getFullYear(), ref.getMonth(), 1, 12);
    debut.setDate(debut.getDate() - ((debut.getDay() + 6) % 7));
    const parJour = {};
    rdvs.forEach(r => { const j = jourLocal(r.quand); (parJour[j] = parJour[j] || []).push(r); });
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut); d.setDate(d.getDate() + i);
      const j = SalesStats.ymdLocal(d);
      const evs = (parJour[j] || []).sort((p, q) => p.quand.localeCompare(q.quand));
      const chips = evs.slice(0, 3).map(r =>
        `<span class="cal-chip ${agTypeCls(r)}${agAttente(r) ? " attente" : ""}">${heureLocale(r.quand)}<span class="qui"> · ${esc((r.assigne_a || "à prendre").split(" ")[0])} · ${esc(r.prospect)}</span></span>`).join("");
      cells.push(`<div class="cal-cell${d.getMonth() !== ref.getMonth() ? " hors" : ""}${j === today ? " auj" : ""}" data-jour="${j}">
        <div class="cal-num">${d.getDate()}</div>${chips}${evs.length > 3 ? `<span class="cal-plus">+ ${evs.length - 3} autres</span>` : ""}</div>`);
    }
    z.innerHTML = `<div class="cal-wrap"><div class="cal-head">${JOURS_COURTS.map(x => `<div>${x}.</div>`).join("")}</div><div class="cal-grid">${cells.join("")}</div></div>`;
    z.querySelectorAll(".cal-cell").forEach(c => c.addEventListener("click", () => montreJourAgenda(c.dataset.jour)));
  } else {
    const unJour = AGENDA_MODE === "jour";
    const lundi = new Date(ref); lundi.setHours(12, 0, 0, 0);
    if (!unJour) lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    const dim = new Date(lundi); dim.setDate(dim.getDate() + (unJour ? 0 : 6));
    el("agTitre").textContent = unJour
      ? JOURS_COURTS[(lundi.getDay() + 6) % 7] + ". " + lundi.getDate() + " " + MOIS_NOMS[lundi.getMonth()] + " " + lundi.getFullYear()
      : lundi.getDate() + " – " + dim.getDate() + " " + MOIS_NOMS[dim.getMonth()] + " " + dim.getFullYear();
    const H0 = 8, H1 = 23, hH = 42;
    const hauteur = (H1 - H0) * hH;
    const fondHeures = `background-image:repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${hH}px);`;
    const jours = [];
    for (let i = 0; i < (unJour ? 1 : 7); i++) { const d = new Date(lundi); d.setDate(d.getDate() + i); jours.push(d); }
    const entetes = `<div></div>` + jours.map(d => {
      const j = SalesStats.ymdLocal(d);
      return `<div class="sem-jour${j === today ? " auj" : ""}">${JOURS_COURTS[(d.getDay() + 6) % 7]}.<b>${d.getDate()}</b></div>`;
    }).join("");
    const colHeures = `<div class="sem-heures" style="height:${hauteur}px;position:relative">` +
      Array.from({ length: H1 - H0 }, (_, i) => `<div style="position:absolute;top:${i * hH - 6}px;right:6px">${H0 + i}:00</div>`).join("") + `</div>`;
    const cols = jours.map(d => {
      const j = SalesStats.ymdLocal(d);
      const evs = rdvs.filter(r => jourLocal(r.quand) === j).sort((p, q) => p.quand.localeCompare(q.quand));
      let finPrec = -1;
      const blocs = evs.map(r => {
        const dt = new Date(r.quand);
        const hDec = dt.getHours() + dt.getMinutes() / 60;
        const top = Math.max(0, Math.min(hauteur - 26, (hDec - H0) * hH));
        const chevauche = top < finPrec;
        finPrec = top + 0.75 * hH;
        return `<div class="sem-ev ${agTypeCls(r)}${agAttente(r) ? " attente" : ""}${chevauche ? " lane2" : ""}" style="top:${Math.round(top)}px;height:${Math.round(0.75 * hH)}px" data-jour="${j}">
          ${heureLocale(r.quand)} ${esc((r.assigne_a || "à prendre").split(" ")[0])}<br>${esc(r.prospect)}</div>`;
      }).join("");
      const ligne = j === today
        ? (() => { const n = new Date(); const hDec = n.getHours() + n.getMinutes() / 60;
            return (hDec >= H0 && hDec <= H1) ? `<div class="sem-ligne" style="top:${Math.round((hDec - H0) * hH)}px"></div>` : ""; })()
        : "";
      return `<div class="sem-col${j === today ? " auj" : ""}" style="height:${hauteur}px;${fondHeures}">${blocs}${ligne}</div>`;
    }).join("");
    z.innerHTML = `<div class="sem-wrap"><div class="sem-grid" style="grid-template-columns:48px repeat(${jours.length},minmax(${unJour ? "260px" : "92px"},1fr));min-width:${unJour ? "320px" : "700px"}">${entetes}${colHeures}${cols}</div></div>`;
    z.querySelectorAll(".sem-ev").forEach(e2 => e2.addEventListener("click", () => montreJourAgenda(e2.dataset.jour)));
  }
}
function montreAjoutEvenement() {
  if (MOI.role === "observateur") return;
  const ov = el("callOverlay");
  ov.innerHTML = `<div class="offre-carte" style="text-align:left">
    <div class="offre-titre" style="font-size:19px">Ajouter un événement</div>
    <div class="sinfo" style="margin:4px 0 12px">Un créneau perso : le dispatch ne te proposera pas de RDV à moins de 45 min, et il apparaît dans l'agenda de l'équipe.</div>
    <div class="row2">
      <div class="field"><label>Quoi ? (visible par l'équipe)</label><input id="evTitre" maxlength="60" placeholder="ex : indispo, perso, formation"></div>
      <div class="field"><label>Quand ? *</label><input type="datetime-local" id="evQuand"></div>
    </div>
    <div class="offre-actions">
      <button class="abtn oui" id="evCreer">Ajouter</button>
      <button class="abtn" id="evFermer">Annuler</button>
    </div>
  </div>`;
  ouvreOverlay(ov);
  el("evFermer").addEventListener("click", () => { fermeOverlay(ov); });
  el("evCreer").addEventListener("click", async () => {
    if (!el("evQuand").value) return toast("Indique la date et l'heure.", "err");
    try {
      await call("rdv_perso", { quand: new Date(el("evQuand").value).toISOString(), titre: el("evTitre").value.trim() });
      fermeOverlay(ov);
      await loadData();
      showPage("agenda");
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
}
function montreJourAgenda(j) {
  const today = SalesStats.ymdLocal(new Date());
  const evs = agendaRdvs().filter(r => jourLocal(r.quand) === j).sort((p, q) => p.quand.localeCompare(q.quand));
  const ov = el("callOverlay");
  const ETAT_RDV2 = { propose: "en attente du closer", ouvert: "à prendre (équipe)", decale: "horaire en discussion", confirme: "confirmé", fait: "fait" };
  ov.innerHTML = `<div class="offre-carte" style="text-align:left;max-height:82vh;overflow-y:auto">
    <div class="offre-titre" style="font-size:19px">${esc(jolieDate(j, today))}</div>
    ${evs.length ? evs.map(r => `
      <div style="padding:9px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div class="stitre" style="margin:0;font-size:14px">${heureLocale(r.quand)} · ${esc(r.type)} · ${esc(r.prospect)}</div>
          <div class="sinfo" style="margin:2px 0 0">${r.type === "Perso" ? "créneau perso de " + esc(r.assigne_a || "?") : (r.assigne_a ? "avec " + esc(r.assigne_a) : "personne ne l'a pris") + " · setter " + esc(r.setter || "?") + " · " + (ETAT_RDV2[r.statut] || r.statut)}${r.type === "R2" ? " · à encaisser " + eur(r.montant_attendu || 0) + (r.note_r2 ? " (" + esc(r.note_r2) + ")" : "") : ""}</div>
        </div>
        ${r.type === "Perso" && r.statut !== "annule" && (MOI.role === "admin" || r.setter === MOI.nom) ? `<button class="abtn non" data-evsuppr="${r.id}">Retirer</button>` : ""}
      </div>`).join("") : `<div class="sinfo">Rien ce jour-là.</div>`}
    <div class="offre-actions" style="margin-top:14px"><button class="abtn" id="agJourFermer">Fermer</button></div>
  </div>`;
  ouvreOverlay(ov);
  el("agJourFermer").addEventListener("click", () => { fermeOverlay(ov); });
  ov.querySelectorAll("[data-evsuppr]").forEach(b => b.addEventListener("click", async () => {
    try { await call("rdv_annule", { id: b.dataset.evsuppr }); fermeOverlay(ov); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  }));
}

// ----- Le jeu : XP, rangs, séries, records (calculé depuis les calls vérifiés, intrichable) -----
const XP = { setting_cale: 10, setting_show: 15, rdv_vente_cale: 25, vente_faite: 20, vente_closee: 100, presentation: 30, encaissement: 150, relance_honoree: 8, dispatch_rapide: 15 };
const RANGS = [["Légende KNE", 12000], ["Machine", 5000], ["Pointure", 2000], ["Régulier", 750], ["Setter", 250], ["Rookie", 0]];
const rangDe = xp => RANGS.find(([, seuil]) => xp >= seuil)[0];
function prochainRang(xp) {
  const asc = RANGS.slice().reverse();
  for (let i = 0; i < asc.length; i++) {
    if (xp < asc[i][1]) {
      const [nomR, seuil] = asc[i];
      const plancher = i > 0 ? asc[i - 1][1] : 0;
      return { nom: nomR, seuil, manque: seuil - xp, pct: Math.round((xp - plancher) / (seuil - plancher) * 100) };
    }
  }
  return null; // Légende KNE : rang max
}
const MISSIONS_JOUR = [
  { id: "j0", periode: "jour", txt: "Prospecte (contacts + relances)", but: 0, val: j => j.prosJour, xp: 15 },
  { id: "j1", periode: "jour", txt: "Logge 3 calls", but: 3, val: j => j.callsJour, xp: 15 },
  { id: "j2", periode: "jour", txt: "Cale 1 setting ou 1 RDV de vente", but: 1, val: j => j.calesJour, xp: 10 },
  { id: "j3", periode: "jour", txt: "Honore 1 relance", but: 1, val: j => j.relHonJour, xp: 10 },
];
const MISSIONS_SEM = [
  { id: "s1", periode: "semaine", txt: "10 calls loggés", but: 10, val: j => j.callsSem, xp: 25 },
  { id: "s2", periode: "semaine", txt: "3 settings effectués", but: 3, val: j => j.showsSem, xp: 25 },
  { id: "s3", periode: "semaine", txt: "1 vente closée", but: 1, val: j => j.closesSem, xp: 40 },
];
const IC_ECLAIR = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>';
function calculeJeu() {
  const F = SalesStats.F;
  const recs = (!voitTout() || VUEQUIPE === "toutes") ? RECORDS : RECORDS.filter(r => r.equipe === VUEQUIPE);
  const aujourdHui = new Date();
  const today = SalesStats.ymdLocal(aujourdHui);
  const lundi = new Date(aujourdHui); lundi.setHours(12, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const debutSemaine = SalesStats.ymdLocal(lundi);
  const lundiPrec = new Date(lundi); lundiPrec.setDate(lundiPrec.getDate() - 7);
  const debutSemPrec = SalesStats.ymdLocal(lundiPrec);
  const debutMois = today.slice(0, 8) + "01";
  const J = {};
  const joueur = n => J[n] || (J[n] = { xpTotal: 0, xpSemaine: 0, xpMois: 0, xpSemPrec: 0, jours: new Set(), grosseVente: 0, encParSemaine: {}, serie: 0, serieMax: 0,
    callsJour: 0, callsSem: 0, calesJour: 0, showsSem: 0, closesSem: 0, relHonJour: 0, prosJour: 0 });
  const semaineDe = d => {
    const x = new Date(d + "T12:00:00");
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return SalesStats.ymdLocal(x);
  };
  const crediter = (nom, d, xp) => {
    if (!nom || !d) return;
    const j = joueur(nom);
    j.xpTotal += xp;
    if (d >= debutSemaine) j.xpSemaine += xp;
    else if (d >= debutSemPrec) j.xpSemPrec += xp;
    if (d >= debutMois) j.xpMois += xp;
  };
  const relancesParCle = {};
  recs.forEach(r => {
    const f = r.fields, dr = f[F.relance] ? String(f[F.relance]).slice(0, 10) : "";
    if (!dr) return;
    const k = SalesStats.keyOf(r);
    if (k) (relancesParCle[k] = relancesParCle[k] || []).push(dr);
  });
  const relancesVues = new Set();
  recs.forEach(r => {
    const f = r.fields, d = SalesStats.dateOf(r), type = f[F.type];
    const qui = f[F.qui], quiPres = f[F.quiPres];
    if (qui) joueur(qui).jours.add(d);
    if (quiPres) joueur(quiPres).jours.add(d);
    if (qui) {
      const j0 = joueur(qui);
      if (d === today) j0.callsJour++;
      if (d >= debutSemaine) j0.callsSem++;
    }
    if (type === "Setting") {
      const res = f[F.resSetting];
      if (res === "Calé (à venir)") crediter(qui, d, XP.setting_cale);
      else if (res === "Non abouti") crediter(qui, d, XP.setting_show);
      else if (res === "RDV de vente calé") crediter(qui, d, XP.rdv_vente_cale);
      if (qui && d === today && (res === "Calé (à venir)" || res === "RDV de vente calé")) joueur(qui).calesJour++;
      if (qui && d >= debutSemaine && (res === "Non abouti" || res === "RDV de vente calé")) joueur(qui).showsSem++;
    } else if (type === "Vente" || type === "Prez" || type === "Closing") {
      const res = f[F.resClosing] || f[F.resPres];
      if (res && res !== "No-show") crediter(qui, d, XP.vente_faite);
      if (res === "Closé") {
        crediter(qui, d, XP.vente_closee);
        if (qui && d >= debutSemaine) joueur(qui).closesSem++;
        if (quiPres && quiPres !== qui) crediter(quiPres, d, XP.presentation);
        const m = Number(f[F.montant]) || 0;
        if (m > joueur(qui).grosseVente) joueur(qui).grosseVente = m;
      }
    }
    // l'argent réellement arrivé (comptant direct ou R2/paiement) : le jackpot
    const enc = Number(f[F.encaisse]) || 0;
    if (enc > 0 && qui) {
      crediter(qui, d, XP.encaissement);
      const sm = semaineDe(d);
      const j = joueur(qui);
      j.encParSemaine[sm] = (j.encParSemaine[sm] || 0) + enc;
    }
    // relance honorée : un call sur un prospect dont la relance tombait ce jour-là (à ±1 j)
    const k = SalesStats.keyOf(r);
    if (k && qui && (type === "Setting" || type === "Vente")) {
      (relancesParCle[k] || []).forEach(dr => {
        const ecart = (new Date(d + "T12:00:00") - new Date(dr + "T12:00:00")) / 86400000;
        const cle2 = k + "|" + dr;
        if (ecart >= 0 && ecart <= 1 && !relancesVues.has(cle2)) {
          relancesVues.add(cle2);
          crediter(qui, d, XP.relance_honoree);
          if (d === today) joueur(qui).relHonJour++;
        }
      });
    }
  });
  // dispatch éclair : RDV pris en moins de 2 minutes
  rdvsVisibles().forEach(rv => {
    if (rv.pris_en_s && rv.pris_en_s <= 120 && rv.assigne_a) {
      crediter(rv.assigne_a, jourLocal(rv.offre_premiere || rv.quand), XP.dispatch_rapide);
    }
  });
  // séries : jours ouvrés consécutifs avec au moins un call (le week-end ne casse rien,
  // et le jour en cours sans call ne casse pas non plus)
  Object.values(J).forEach(j => {
    let d = new Date(aujourdHui); d.setHours(12, 0, 0, 0);
    let serie = 0, premier = true;
    for (let i = 0; i < 120; i++) {
      const ymd = SalesStats.ymdLocal(d);
      const we = [0, 6].includes(d.getDay());
      if (!we) {
        if (j.jours.has(ymd)) serie++;
        else if (premier) { /* aujourd'hui pas encore joué : on ne casse pas */ }
        else break;
        premier = false;
      }
      d.setDate(d.getDate() - 1);
    }
    j.serie = serie;
    // série record (balayage complet)
    const tous = [...j.jours].sort();
    let max = 0, cur = 0, prec = null;
    tous.forEach(ymd => {
      const dt = new Date(ymd + "T12:00:00");
      if ([0, 6].includes(dt.getDay())) return;
      if (prec) {
        let attendu = new Date(prec + "T12:00:00");
        do { attendu.setDate(attendu.getDate() + 1); } while ([0, 6].includes(attendu.getDay()));
        cur = SalesStats.ymdLocal(attendu) === ymd ? cur + 1 : 1;
      } else cur = 1;
      if (cur > max) max = cur;
      prec = ymd;
    });
    j.serieMax = Math.max(max, j.serie);
  });
  // missions du jour / de la semaine : auto-vérifiées, le bonus compte dans le classement
  // (chacun a sa fiche même à zéro : les missions s'affichent dès le premier jour)
  if (MOI && MOI.role !== "observateur") joueur(MOI.nom);
  // actions de prospection du jour, par personne
  LEADS.forEach(l => {
    if (!l.qui) return;
    if (l.contacte_le === today) joueur(l.qui).prosJour++;
    if (l.derniere_relance_le === today) joueur(l.qui).prosJour++;
  });
  const objPros = Math.max(1, Number(PARAMS.prospection_objectif) || 18);
  Object.values(J).forEach(j => {
    j.missions = MISSIONS_JOUR.concat(MISSIONS_SEM).map(m => {
      const but = m.id === "j0" ? objPros : m.but;
      const fait = Math.min(but, m.val(j));
      const ok = fait >= but;
      if (ok) { j.xpSemaine += m.xp; j.xpMois += m.xp; }
      return { ...m, but, fait, ok };
    });
  });

  // le mur des ventes : l'argent qui vient de tomber
  const mur = recs.filter(r => {
    const f = r.fields;
    return (Number(f[F.encaisse]) || 0) > 0 || (f[F.resClosing] || f[F.resPres]) === "Closé";
  }).sort((p, q) => String(q.createdTime || "").localeCompare(String(p.createdTime || ""))).slice(0, 6)
    .map(r => ({
      qui: r.fields[F.qui] || "?",
      prospect: r.fields[F.prospect] || "?",
      montant: Number(r.fields[F.encaisse]) || Number(r.fields[F.montant]) || 0,
      encaisse: (Number(r.fields[F.encaisse]) || 0) > 0,
      quand: r.createdTime || "",
    }));
  return { joueurs: J, mur, debutSemaine };
}
const tempsRelatif = t => {
  if (!t) return "";
  const min = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (min < 60) return "il y a " + Math.max(1, min) + " min";
  if (min < 1440) return "il y a " + Math.round(min / 60) + " h";
  return "il y a " + Math.round(min / 1440) + " j";
};

function montreAffichePlein(an) {
  const ov = el("callOverlay");
  ov.innerHTML = `<div style="max-width:min(92vw, 520px);max-height:88vh;display:flex;flex-direction:column;gap:10px">
    <img src="${an.image}" alt="" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:14px;border:1px solid var(--line)">
    <button class="abtn" id="affFermer" style="align-self:center">Fermer</button>
  </div>`;
  ouvreOverlay(ov);
  el("affFermer").addEventListener("click", () => fermeOverlay(ov));
}
function renderAnnonces() {
  const z = el("annoncesZone");
  if (!z) return;
  if (!ANNONCES.length) { z.innerHTML = ""; if (CARO_TIMER) { clearInterval(CARO_TIMER); CARO_TIMER = null; } return; }
  if (CARO_IDX >= ANNONCES.length) CARO_IDX = 0;
  z.innerHTML = `<div class="caro" id="caro">
    ${ANNONCES.map((an, i) => `
      <div class="caro-s${an.image ? "" : " txt"}${i === CARO_IDX ? " on" : ""}" data-i="${i}" ${an.image ? `style="background-image:url(${an.image})"` : ""}>
        ${an.titre || an.texte ? `<div class="caro-v">${an.titre ? `<div class="caro-t">${esc(an.titre)}</div>` : ""}${an.texte ? `<div class="caro-x">${esc(an.texte)}</div>` : ""}</div>` : ""}
      </div>`).join("")}
    ${ANNONCES.length > 1 ? `<div class="caro-dots">${ANNONCES.map((_, i) => `<i data-d="${i}" class="${i === CARO_IDX ? "on" : ""}"></i>`).join("")}</div>` : ""}
  </div>`;
  const montre = i => {
    CARO_IDX = i;
    z.querySelectorAll(".caro-s").forEach(s2 => s2.classList.toggle("on", Number(s2.dataset.i) === i));
    z.querySelectorAll(".caro-dots i").forEach(d2 => d2.classList.toggle("on", Number(d2.dataset.d) === i));
  };
  // une affiche verticale s'affiche entière sur fond violet (pas de recadrage sauvage)
  ANNONCES.forEach((an, i) => {
    if (!an.image) return;
    if (an._portrait === undefined) {
      const im = new Image();
      im.onload = () => {
        an._portrait = im.height > im.width * 1.05;
        const sl = z.querySelector(`.caro-s[data-i="${i}"]`);
        if (sl && an._portrait) sl.classList.add("portrait");
      };
      im.src = an.image;
    } else if (an._portrait) {
      const sl = z.querySelector(`.caro-s[data-i="${i}"]`);
      if (sl) sl.classList.add("portrait");
    }
  });
  z.querySelectorAll(".caro-dots i").forEach(d2 => d2.addEventListener("click", e2 => { e2.stopPropagation(); montre(Number(d2.dataset.d)); }));
  const caro = el("caro");
  caro.addEventListener("click", () => {
    const an = ANNONCES[CARO_IDX];
    if (!an) return;
    if (an.lien) return window.open(an.lien, "_blank", "noopener");
    if (an.image) montreAffichePlein(an);
  });
  if (an0Lien()) caro.dataset.lien = "1";
  function an0Lien() { return ANNONCES.some(an => an.lien); }
  // glissement du doigt
  let x0 = null;
  caro.addEventListener("touchstart", e2 => { x0 = e2.touches[0].clientX; }, { passive: true });
  caro.addEventListener("touchend", e2 => {
    if (x0 === null) return;
    const dx = e2.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) montre((CARO_IDX + (dx < 0 ? 1 : ANNONCES.length - 1)) % ANNONCES.length);
    x0 = null;
  }, { passive: true });
  if (CARO_TIMER) clearInterval(CARO_TIMER);
  if (ANNONCES.length > 1) CARO_TIMER = setInterval(() => montre((CARO_IDX + 1) % ANNONCES.length), 5000);
}

let CLASSEMENT_MODE = "semaine";
function renderJeu(s) {
  if (!el("classementZone")) return;
  const jeu = calculeJeu();
  const nomsEquipe = new Set(EQUIPE.map(m => m.nom).concat(MOI.role === "admin" ? [MOI.nom] : []));
  // --- Défi de la semaine (configuré dans Réglages > Jeu)
  const dz = el("defiZone");
  const cible = Number(PARAMS.defi_cible) || 0;
  const defiActif = cible > 0 && PARAMS.defi_depuis === jeu.debutSemaine;
  if (defiActif) {
    const F2 = SalesStats.F;
    const eqOk = r => (PARAMS.defi_equipe || "toutes") === "toutes" || r.equipe === PARAMS.defi_equipe;
    const semOk = r => SalesStats.dateOf(r) >= jeu.debutSemaine;
    const recsDefi = RECORDS.filter(r => eqOk(r) && semOk(r));
    const METRIQUES = {
      settings_cales: ["settings calés", r => r.fields[F2.resSetting] === "Calé (à venir)" ? 1 : 0],
      shows: ["settings effectués", r => ["Non abouti", "RDV de vente calé"].includes(r.fields[F2.resSetting]) ? 1 : 0],
      rdv_vente: ["RDV de vente calés", r => r.fields[F2.resSetting] === "RDV de vente calé" ? 1 : 0],
      ventes_closees: ["ventes closées", r => (r.fields[F2.resClosing] || r.fields[F2.resPres]) === "Closé" ? 1 : 0],
      encaisse: ["euros encaissés", r => Number(r.fields[F2.encaisse]) || 0],
    };
    const [lbl, compte] = METRIQUES[PARAMS.defi_metric] || METRIQUES.ventes_closees;
    const fait = recsDefi.reduce((t2, r) => t2 + compte(r), 0);
    const pct = Math.min(100, Math.round(fait / cible * 100));
    const gagne = fait >= cible;
    dz.innerHTML = `<div class="pzone" style="margin-top:16px">
      <h3><span class="kdot" style="background:${gagne ? "#34d399" : "var(--warn)"}"></span>Défi de la semaine${PARAMS.defi_equipe && PARAMS.defi_equipe !== "toutes" ? " — Team " + (PARAMS.defi_equipe === "kelian" ? "Kélian" : "Mila") : ""}<span class="knb">${gagne ? "réussi" : pct + " %"}</span></h3>
      <div class="sinfo">${PARAMS.defi_metric === "encaisse" ? eur(fait) + " / " + eur(cible) : fait + " / " + cible} ${esc(lbl)}${PARAMS.defi_reco ? (gagne ? " — " + esc(PARAMS.defi_reco) + ", c'est gagné" : " — à la clé : " + esc(PARAMS.defi_reco)) : ""}</div>
      <div class="gbar"><i class="${gagne ? "ok" : ""}" style="width:${pct}%"></i></div>
    </div>`;
  } else dz.innerHTML = "";
  // --- Tes missions (auto-vérifiées, le bonus compte dans le classement)
  const mz0 = el("missionsZone");
  const moiJ0 = jeu.joueurs[MOI.nom];
  if (MOI.role !== "observateur" && moiJ0 && moiJ0.missions) {
    const ligneM = m => `<div style="padding:6px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
        <span>${esc(m.txt)}${m.ok ? ` <span class="pill green" style="margin-left:6px">fait</span>` : ""}</span>
        <span style="color:${m.ok ? "#34d399" : "var(--muted)"};font-weight:650">${m.ok ? "+" + m.xp + " XP" : m.fait + " / " + m.but + " · " + m.xp + " XP"}</span>
      </div>
      <div class="gbar" style="height:6px;margin:5px 0 0"><i class="${m.ok ? "ok" : ""}" style="width:${Math.round(m.fait / m.but * 100)}%"></i></div>
    </div>`;
    const mJour = moiJ0.missions.filter(m => m.periode === "jour");
    const mSem = moiJ0.missions.filter(m => m.periode === "semaine");
    const faites = moiJ0.missions.filter(m => m.ok).length;
    mz0.innerHTML = `<div class="pzone" style="margin-top:16px">
      <h3><span class="kdot" style="background:var(--warn)"></span>Tes missions<span class="knb">${faites} / ${moiJ0.missions.length}</span></h3>
      <div class="sinfo" style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin:4px 0 0">Aujourd'hui</div>
      ${mJour.map(ligneM).join("")}
      <div class="sinfo" style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin:10px 0 0">Cette semaine</div>
      ${mSem.map(ligneM).join("")}
    </div>`;
  } else mz0.innerHTML = "";
  // --- Objectif du mois (engagement public)
  const oz = el("objectifZone");
  const encaisseDuMois = nom => {
    const F2 = SalesStats.F;
    const debutMois = s.today.slice(0, 8) + "01";
    return RECORDS.filter(r => r.fields[F2.qui] === nom && SalesStats.dateOf(r) >= debutMois && SalesStats.dateOf(r) <= s.today.slice(0, 8) + "31")
      .reduce((t2, r) => t2 + (Number(r.fields[F2.encaisse]) || 0), 0);
  };
  const barreObjectif = m => {
    if (!m.objectif_mois) return "";
    const fait = encaisseDuMois(m.nom);
    const pct = Math.min(100, Math.round(fait / m.objectif_mois * 100));
    return `<div style="padding:7px 0">
      <div style="display:flex;justify-content:space-between;font-size:13px"><span>${avi(m.nom)}</span><span>${eur(fait)} / ${eur(m.objectif_mois)}</span></div>
      <div class="gbar"><i class="${pct >= 100 ? "ok" : "or"}" style="width:${pct}%"></i></div>
    </div>`;
  };
  if (MOI.role === "observateur") { oz.innerHTML = ""; }
  else if (VUEMOI === "moi" || MOI.role !== "admin") {
    const fait = encaisseDuMois(MOI.nom);
    const obj = MOI.objectif_mois;
    oz.innerHTML = `<div class="pzone" style="margin-top:16px">
      <h3><span class="kdot" style="background:var(--gold)"></span>Ton objectif du mois<span class="knb"><button class="del" id="objBtn">${obj ? "Modifier" : "Définir"}</button></span></h3>
      ${obj ? `<div class="sinfo">${eur(fait)} encaissés sur ${eur(obj)} déclarés${fait >= obj ? " — objectif atteint" : ""}</div>
      <div class="gbar"><i class="${fait >= obj ? "ok" : "or"}" style="width:${Math.min(100, Math.round(fait / obj * 100))}%"></i></div>`
      : `<div class="sinfo">Déclare ton objectif d'encaissé : ce qu'on annonce devant l'équipe, on le tient.</div>`}
    </div>`;
    const ob = el("objBtn");
    if (ob) ob.addEventListener("click", montreObjectif);
  } else {
    const avecObj = EQUIPE.filter(m => m.objectif_mois && (VUEQUIPE === "toutes" || m.equipe === VUEQUIPE));
    oz.innerHTML = avecObj.length ? `<div class="pzone" style="margin-top:16px">
      <h3><span class="kdot" style="background:var(--gold)"></span>Objectifs du mois<span class="knb">${avecObj.length}</span></h3>
      ${avecObj.map(barreObjectif).join("")}
    </div>` : "";
  }
  // --- Classement
  const cz = el("classementZone");
  const joueurs = Object.entries(jeu.joueurs)
    .filter(([nom]) => nomsEquipe.has(nom))
    .map(([nom, j]) => ({ nom, ...j }))
    .sort((p, q) => (CLASSEMENT_MODE === "semaine" ? q.xpSemaine - p.xpSemaine : q.xpMois - p.xpMois));
  const avecPoints = joueurs.filter(j => j.xpTotal > 0);
  cz.innerHTML = avecPoints.length ? `<div class="pzone" style="margin-top:16px">
    <h3><span class="kdot" style="background:var(--accent)"></span>${CLASSEMENT_MODE === "semaine" ? "Classement de la semaine" : "Saison de " + MOIS_NOMS[new Date().getMonth()]}
      <span class="knb"><span class="agseg" style="padding:3px">
        <button data-cl="semaine" ${CLASSEMENT_MODE === "semaine" ? 'class="active"' : ""} style="padding:5px 12px;font-size:12px">Semaine</button>
        <button data-cl="mois" ${CLASSEMENT_MODE === "mois" ? 'class="active"' : ""} style="padding:5px 12px;font-size:12px">Saison</button>
      </span></span></h3>
    ${joueurs.map((j, i) => {
      const xp = CLASSEMENT_MODE === "semaine" ? j.xpSemaine : j.xpMois;
      const delta = CLASSEMENT_MODE === "semaine" && j.xpSemPrec > 0 && j.xpSemaine > j.xpSemPrec
        ? Math.round((j.xpSemaine - j.xpSemPrec) / j.xpSemPrec * 100) : 0;
      return `<div class="clig">
        <span class="cpos ${i === 0 ? "p1" : i === 1 ? "p2" : i === 2 ? "p3" : ""}">${i + 1}</span>
        <span>${avi(j.nom)}<span class="crang">${rangDe(j.xpTotal)} · ${j.xpTotal.toLocaleString("fr-FR")} XP au total</span></span>
        ${j.serie >= 2 ? `<span class="cserie">${IC_ECLAIR}${j.serie} j</span>` : ""}
        ${delta > 0 && i >= 3 ? `<span class="cdelta">+${delta} % vs ta semaine passée</span>` : ""}
        <span class="cxp">${xp.toLocaleString("fr-FR")} XP</span>
      </div>`;
    }).join("")}
  </div>` : "";
  cz.querySelectorAll("[data-cl]").forEach(b => b.addEventListener("click", () => { CLASSEMENT_MODE = b.dataset.cl; render(); }));
  // --- Records perso (vue Moi)
  const rz = el("recordsZone");
  const moiJ = jeu.joueurs[MOI.nom];
  if (VUEMOI === "moi" && moiJ) {
    const meilleureSem = Math.max(0, ...Object.values(moiJ.encParSemaine));
    rz.innerHTML = `<div class="pzone" style="margin-top:16px">
      <h3><span class="kdot" style="background:#60a5fa"></span>Tes records</h3>
      <div class="sinfo" style="display:flex;gap:22px;flex-wrap:wrap">
        <span>Plus grosse vente<br><b style="color:var(--gold);font-size:16px">${moiJ.grosseVente ? eur(moiJ.grosseVente) : "à écrire"}</b></span>
        <span>Meilleure semaine (encaissé)<br><b style="color:var(--gold);font-size:16px">${meilleureSem ? eur(meilleureSem) : "à écrire"}</b></span>
        <span>Série record<br><b style="font-size:16px">${moiJ.serieMax || 0} jours</b></span>
        <span>Rang<br><b style="font-size:16px;color:var(--accent)">${rangDe(moiJ.xpTotal)}</b></span>
      </div>
      ${(() => {
        const p = prochainRang(moiJ.xpTotal);
        if (!p) return `<div class="sinfo" style="margin-top:12px">Rang maximum atteint. Légende, tout simplement.</div>`;
        return `<div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:var(--muted)">Prochain rang : <b style="color:var(--ink)">${p.nom}</b></span><span style="color:var(--muted)">encore ${p.manque.toLocaleString("fr-FR")} XP</span></div>
          <div class="gbar"><i style="width:${p.pct}%"></i></div>
        </div>`;
      })()}
    </div>`;
  } else rz.innerHTML = "";
  // --- Le mur des ventes
  const mz = el("murZone");
  mz.innerHTML = jeu.mur.length ? `<div class="pzone" style="margin-top:16px">
    <h3><span class="kdot" style="background:#34d399"></span>Le mur des ventes</h3>
    ${jeu.mur.map(v => `<div class="mur-l">
      <span>${avi(v.qui)}</span>
      <span class="mur-t">${v.encaisse ? "a encaissé" : "a closé"} · ${esc(v.prospect)} · ${tempsRelatif(v.quand)}</span>
      <span class="mur-m">${eur(v.montant)}</span>
    </div>`).join("")}
  </div>` : "";
  // le rang dans le tiroir de profil
  if (moiJ) el("urole").textContent = (MOI.role === "admin" ? "Head of sales" : MOI.role === "observateur" ? "Observateur" : (MOI.role_vente || "membre")) + " · " + rangDe(moiJ.xpTotal);
}
function montreObjectif() {
  const ov = document.createElement("div");
  ov.className = "dlg-ov";
  ov.innerHTML = `<div class="dlg">
    <div class="dlg-t">Ton objectif d'encaissé du mois</div>
    <div class="dlg-x">Visible par l'équipe : ce qu'on déclare, on le tient.</div>
    <div class="field"><input type="number" id="objMontant" min="0" step="100" placeholder="ex : 10000" value="${MOI.objectif_mois || ""}" style="font-size:16px"></div>
    <div class="dlg-b" style="margin-top:14px">
      <button class="dlg-non">Annuler</button>
      <button class="dlg-oui">Je m'engage</button>
    </div></div>`;
  ov.querySelector(".dlg-non").addEventListener("click", () => ov.remove());
  ov.addEventListener("click", e2 => { if (e2.target === ov) ov.remove(); });
  ov.querySelector(".dlg-oui").addEventListener("click", async () => {
    const montant = Number(ov.querySelector("#objMontant").value) || 0;
    try {
      await call("membre_objectif", { montant });
      MOI.objectif_mois = montant || null;
      ov.remove();
      render();
      toast(montant ? "Objectif déclaré : " + eur(montant) + ". L'équipe le voit, à toi de jouer." : "Objectif retiré.");
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
  document.body.appendChild(ov);
  ov.querySelector("#objMontant").focus();
}

// ----- Fiche prospect : tout l'historique avant de rappeler -----
function montreFiche(cle) {
  const x = FICHES[cle];
  if (!x) return;
  const ov = el("ficheOverlay");
  const today = SalesStats.ymdLocal(new Date());
  const nI = v => String(v || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
  const nT = v => String(v || "").replace(/\D/g, "").slice(-9);
  const recsEq = (!voitTout() || VUEQUIPE === "toutes") ? RECORDS : RECORDS.filter(r => r.equipe === VUEQUIPE);
  const miens = recsEq.filter(r => SalesStats.keyOf(r) === cle)
    .sort((p, q) => (SalesStats.dateOf(q) + (q.createdTime || "")).localeCompare(SalesStats.dateOf(p) + (p.createdTime || "")));
  const rdvsMiens = rdvsVisibles().filter(r =>
    (r.instagram && "ig:" + nI(r.instagram) === cle) || (r.telephone && "tel:" + nT(r.telephone) === cle))
    .sort((p, q) => q.quand.localeCompare(p.quand));
  const F2 = SalesStats.F;
  const ETAT_RDV = { propose: "en attente du closer", ouvert: "à l'équipe", decale: "horaire en discussion", confirme: "confirmé", fait: "fait", annule: "annulé" };
  const ligneCall = r => {
    const f = r.fields || {};
    const res = f[F2.resSetting] || f[F2.resPres] || f[F2.resClosing] || (f[F2.type] === "Paiement" ? "Encaissement" : "");
    const extras = [];
    if (f[F2.montant]) extras.push(eur(f[F2.montant]) + (Number(f[F2.encaisse]) ? " encaissé" : " (pas encore encaissé)"));
    else if (f[F2.encaisse]) extras.push(eur(f[F2.encaisse]) + " encaissé");
    if (f[F2.cause]) extras.push("cause : " + f[F2.cause]);
    if (f["Objection"] && f["Objection"] !== "Aucune") extras.push("objection : " + f["Objection"]);
    if (f[F2.relance]) extras.push("relance le " + String(f[F2.relance]).slice(0, 10));
    return `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
      <div class="stitre" style="margin:0;font-size:13.5px">${esc(jolieDate(SalesStats.dateOf(r), today))} · ${esc(f[F2.type] || "?")}${res ? " — " + esc(res) : ""} <span style="color:var(--muted);font-weight:400">(${esc(f[F2.qui] || "?")})</span></div>
      ${extras.length ? `<div class="sinfo" style="margin:3px 0 0">${esc(extras.join(" · "))}</div>` : ""}
      ${f[F2.notes] ? `<div class="sinfo" style="margin:3px 0 0;white-space:pre-wrap">${esc(f[F2.notes])}</div>` : ""}
      ${f[F2.fiche] ? `<div class="sinfo" style="margin:3px 0 0;white-space:pre-wrap">${esc(f[F2.fiche])}</div>` : ""}
      ${r.debrief ? `<div class="sinfo" style="margin:5px 0 0;padding:7px 9px;border:1px solid var(--line);border-radius:8px;color:var(--accent)">Débrief de ${esc(r.debriefPar || "?")} : <span style="color:var(--fg);white-space:pre-wrap">${esc(r.debrief)}</span></div>` : ""}
    </div>`;
  };
  const admin2 = MOI.role === "admin";
  const autres = Object.values(FICHES).filter(y => y.cle !== cle);
  ov.innerHTML = `<div class="offre-carte" style="max-height:86vh;overflow-y:auto;text-align:left">
    <div class="offre-titre" style="font-size:19px">${esc(x.nom || x.contact || "?")}</div>
    <div class="sinfo" style="margin:4px 0 2px">${esc(x.contact || "")}${x.source ? " · " + esc(x.source) : ""}</div>
    <div style="margin:8px 0 4px"><span class="pill ${ETAT_PILL[x.etat] || ""}">${esc(x.etat)}</span>
      ${x.sommeil ? `<span class="rot" style="margin-left:8px">${x.joursSans} j sans contact</span>` : ""}
      ${x.vendu ? `<span class="sinfo" style="margin-left:8px">${eur(x.vendu)} vendu · ${eur(x.encaisse)} encaissé</span>` : ""}</div>
    ${rdvsMiens.length ? `<div class="stitre" style="margin:12px 0 2px;font-size:13px;color:var(--muted)">RENDEZ-VOUS</div>` +
      rdvsMiens.map(r => `<div class="sinfo" style="padding:3px 0">${esc(r.type)} · ${quandJoli(r.quand, today)} · ${esc(ETAT_RDV[r.statut] || r.statut)}${r.assigne_a ? " (" + esc(r.assigne_a) + ")" : ""}${r.type === "R2" && r.statut !== "fait" ? ` — à encaisser ${eur(r.montant_attendu || 0)}` : ""}</div>`).join("") : ""}
    <div class="stitre" style="margin:12px 0 2px;font-size:13px;color:var(--muted)">HISTORIQUE (${miens.length} call${miens.length > 1 ? "s" : ""})</div>
    ${miens.map(ligneCall).join("") || `<div class="sinfo">Aucun call.</div>`}
    ${admin2 && autres.length ? `
      <div class="field" style="margin-top:14px"><label>Fusionner cette fiche avec... (si le pseudo a été mal écrit)</label>
        <select id="ficheFusion"><option value="">Choisir la bonne fiche…</option>
          ${autres.slice(0, 200).map(y => `<option value="${esc(y.cle)}">${esc(y.nom || "?")} — ${esc(y.contact || "?")}</option>`).join("")}
        </select></div>` : ""}
    <div class="offre-actions" style="margin-top:14px"><button class="abtn" id="ficheFermer">Fermer</button></div>
  </div>`;
  ouvreOverlay(ov);
  el("ficheFermer").addEventListener("click", () => { fermeOverlay(ov); });
  const fu = el("ficheFusion");
  if (fu) fu.addEventListener("change", async () => {
    const cible = FICHES[fu.value];
    if (!cible) return;
    if (!(await confirmer({ titre: `Fusionner « ${x.nom || x.contact} » dans « ${cible.nom || cible.contact} » ?`, texte: `Les ${miens.length} calls et ${rdvsMiens.length} RDV passeront sur le contact ${cible.contact}.`, ok: "Fusionner", danger: true }))) { fu.value = ""; return; }
    const cibleTel = cible.contact && !String(cible.contact).trim().startsWith("@");
    try {
      await call("fusion_prospect", {
        call_ids: miens.map(r => r.id),
        rdv_ids: rdvsMiens.map(r => r.id),
        instagram: cibleTel ? "" : cible.contact,
        telephone: cibleTel ? cible.contact : "",
      });
      fermeOverlay(ov);
      await loadData();
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); fu.value = ""; }
  });
}

// ----- Corriger un call (l'auteur 24 h, l'admin toujours) -----
function montreCorrige(id) {
  const r = RECORDS.find(x => x.id === id);
  if (!r) return;
  const f = r.fields || {}, F2 = SalesStats.F;
  const ov = el("callOverlay");
  const vente = f[F2.type] === "Vente";
  const sources = [...document.querySelectorAll("#inSource option")].map(o => o.value);
  ov.innerHTML = `<div class="offre-carte" style="text-align:left">
    <div class="offre-titre" style="font-size:19px">Corriger le call</div>
    <div class="sinfo" style="margin:4px 0 12px">${esc(f[F2.type] || "?")} · ${esc(SalesStats.dateOf(r))} · ${esc(f[F2.qui] || "?")} — le type et le résultat ne se corrigent pas (supprime et re-saisis si besoin)</div>
    <div class="row2">
      <div class="field"><label>Prospect</label><input id="corProspect" value="${esc(f[F2.prospect] || "")}"></div>
      <div class="field"><label>Instagram</label><input id="corInsta" value="${esc(f[F2.insta] || "")}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Source</label><select id="corSource">${sources.map(s2 => `<option value="${esc(s2)}"${(f[F2.source] || "") === s2 ? " selected" : ""}>${esc(s2 || "—")}</option>`).join("")}</select></div>
      ${vente ? `<div class="field"><label>Montant (€)</label><input type="number" id="corMontant" min="0" step="1" value="${esc(f[F2.montant] || "")}"></div>` : ""}
    </div>
    <div class="field"><label>Notes</label><textarea id="corNotes" maxlength="1000">${esc(f[F2.notes] || "")}</textarea></div>
    <div class="offre-actions">
      <button class="abtn oui" id="corSave">Enregistrer la correction</button>
      <button class="abtn" id="corFermer">Annuler</button>
    </div>
  </div>`;
  ouvreOverlay(ov);
  el("corFermer").addEventListener("click", () => { fermeOverlay(ov); });
  el("corSave").addEventListener("click", async () => {
    const prospect = el("corProspect").value.trim();
    if (!prospect) return toast("Le prospect est obligatoire.", "err");
    const corr = { prospect, instagram: el("corInsta").value.trim(), source: el("corSource").value, notes: el("corNotes").value.trim() };
    if (vente && el("corMontant")) corr.montant = Number(el("corMontant").value) || 0;
    try { await call("call_update", { id, call: corr }); fermeOverlay(ov); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
}

// ----- Débrief coaching accroché au call -----
function montreDebrief(id) {
  const r = RECORDS.find(x => x.id === id);
  if (!r) return;
  const f = r.fields || {}, F2 = SalesStats.F;
  const ov = el("callOverlay");
  const admin2 = MOI.role === "admin";
  const today = SalesStats.ymdLocal(new Date());
  ov.innerHTML = `<div class="offre-carte" style="text-align:left">
    <div class="offre-titre" style="font-size:19px">Débrief — ${esc(f[F2.prospect] || "?")}</div>
    <div class="sinfo" style="margin:4px 0 12px">${esc(f[F2.type] || "?")} · ${esc(SalesStats.dateOf(r))} · par ${esc(f[F2.qui] || "?")}${r.debriefLe ? " — débriefé le " + esc(jolieDate(String(r.debriefLe).slice(0, 10), today)) : ""}</div>
    ${admin2
      ? `<div class="field"><label>Ton retour au vendeur (il reçoit une notif)</label><textarea id="dbTexte" maxlength="2000" style="min-height:130px">${esc(r.debrief || "")}</textarea></div>
         <div class="offre-actions"><button class="abtn oui" id="dbSave">Envoyer le débrief</button><button class="abtn" id="dbFermer">Fermer</button></div>`
      : `<div class="sinfo" style="white-space:pre-wrap;padding:10px;border:1px solid var(--line);border-radius:10px">${esc(r.debrief || "")}</div>
         <div class="offre-actions" style="margin-top:12px"><button class="abtn" id="dbFermer">Fermer</button></div>`}
  </div>`;
  ouvreOverlay(ov);
  el("dbFermer").addEventListener("click", () => { fermeOverlay(ov); });
  const sv = el("dbSave");
  if (sv) sv.addEventListener("click", async () => {
    try { await call("call_debrief", { id, texte: el("dbTexte").value }); fermeOverlay(ov); await loadData(); }
    catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
  });
}

// ----- Bilan hebdo copiable (le rendu de comptes du dimanche) -----
function bilanSemaine(equipe, nomEquipe) {
  const now = new Date();
  const lundi = new Date(now); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7)); lundi.setHours(12, 0, 0, 0);
  const ymd = d => SalesStats.ymdLocal(d);
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const [de, a2, deP, aP] = [ymd(lundi), ymd(plus(lundi, 6)), ymd(plus(lundi, -7)), ymd(plus(lundi, -1))];
  const recs = RECORDS.filter(r => r.equipe === equipe);
  const dans = (from, to) => recs.filter(r => { const d = SalesStats.dateOf(r); return d >= from && d <= to; });
  const cur = SalesStats.compute(dans(de, a2), "tout", now).global;
  const prev = SalesStats.compute(dans(deP, aP), "tout", now).global;
  const dN = (x, y) => { const v = (x || 0) - (y || 0); return v > 0 ? ` (+${v})` : v < 0 ? ` (${v})` : " (=)"; };
  const dE = (x, y) => { const v = (x || 0) - (y || 0); return v > 0 ? ` (+${eur(v)})` : v < 0 ? ` (-${eur(-v)})` : " (=)"; };
  const jj = s2 => s2.slice(8, 10) + "/" + s2.slice(5, 7);
  return `${nomEquipe} — semaine du ${jj(de)} au ${jj(a2)}

Settings calés : ${cur.cales || 0}${dN(cur.cales, prev.cales)}
Settings effectués : ${cur.effectues || 0}${dN(cur.effectues, prev.effectues)} · Show ${fmtPct(cur.txShow)}
RDV de vente calés : ${cur.versVente || 0}${dN(cur.versVente, prev.versVente)}
Appels de vente faits : ${cur.ventesEff || 0}${dN(cur.ventesEff, prev.ventesEff)}
Ventes closées : ${cur.closes || 0}${dN(cur.closes, prev.closes)} · Taux de closing ${fmtPct(cur.txClose)}
Vendu : ${eur(cur.vendu || 0)}${dE(cur.vendu, prev.vendu)}
Encaissé : ${eur(cur.encaisse || 0)}${dE(cur.encaisse, prev.encaisse)}

(entre parenthèses : l'évolution vs la semaine du ${jj(deP)})`;
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
  ouvreOverlay(ov);
  el("scriptFermer").addEventListener("click", () => { fermeOverlay(ov); });
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
    let MEMBRES = [];
    try { MEMBRES = (await call("membres_list")).membres || []; } catch (_) { /* pas admin */ }
    const lienDe = code => location.origin + location.pathname.replace(/index\.html$/, "") + "?c=" + code;
    const ROLES_VENTE = [["", "aucun (setting seulement)"], ["setter", "setter"], ["closer", "closer"], ["setter,closer", "setter + closer"], ["presentateur", "présentateur"], ["presentateur,closer", "présentateur + closer"]];
    const aujourdHui = SalesStats.ymdLocal(new Date());
    z.innerHTML = `<div class="controls" style="margin:2px 0 18px">
        <button class="rg-tab" data-tab="alertes">Alertes équipe</button>
        <button class="rg-tab" data-tab="rappels">Rappels avant RDV</button>
        <button class="rg-tab" data-tab="messages">Messages prospects</button>
        <button class="rg-tab" data-tab="scripts">Scripts</button>
        ${MEMBRES.length ? `<button class="rg-tab" data-tab="equipe">Équipe</button>` : ""}
        ${MEMBRES.length ? `<button class="rg-tab" data-tab="jeu">Jeu</button>` : ""}
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
      </details>`).join("") + `</div>` +
      (!MEMBRES.length ? "" : `
      <div class="rg-pan" id="pan-equipe" style="display:none">
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Les accès de l'équipe : rôles, référents, commissions, liens. Désactiver quelqu'un coupe son lien immédiatement.</div>` +
      MEMBRES.map(m => {
        const estAdmin = m.role === "admin";
        const estObs = m.role === "observateur";
        const off = m.off_jusqu_au && m.off_jusqu_au >= aujourdHui;
        const resume = [m.nom,
          m.equipe === "kelian" ? "Team Kélian" : m.equipe === "mila" ? "Team Mila" : "les deux",
          estAdmin ? "admin" : estObs ? "observateur" : (m.role_vente || "setting seulement")]
          .concat(m.referent ? ["référent"] : []).concat(off ? ["OFF"] : []).concat(m.actif ? [] : ["DÉSACTIVÉ"]).join(" · ");
        return `
      <details class="slot regl" data-mnom="${esc(m.nom)}" ${m.actif ? "" : 'style="opacity:.55"'}>
        <summary>${esc(resume)}</summary>
        ${estAdmin || estObs ? "" : `
        <div class="row2">
          <div class="field"><label>Rôle de vente</label>${pilule(IC_REG.qui, `<select class="mq-rolev">${ROLES_VENTE.map(([v, l2]) => `<option value="${v}"${(m.role_vente || "") === v ? " selected" : ""}>${l2}</option>`).join("")}</select>`)}</div>
          <div class="field"><label>Closer de référence (reçoit les offres en premier)</label>${pilule(IC_REG.etat, `<select class="mq-ref"><option value="non"${m.referent ? "" : " selected"}>Non</option><option value="oui"${m.referent ? " selected" : ""}>Oui</option></select>`)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Équipe</label>${pilule(IC_REG.qui, `<select class="mq-eq"><option value="kelian"${m.equipe === "kelian" ? " selected" : ""}>Team Kélian</option><option value="mila"${m.equipe === "mila" ? " selected" : ""}>Team Mila</option></select>`)}</div>
          <div class="field"><label>Commission (% de l'encaissé, vide = pas affichée)</label>${pilule(IC_REG.temps, `<input type="number" class="mq-taux" min="0" max="99" step="1" value="${m.taux_commission ? Math.round(m.taux_commission * 100) : ""}">`)}</div>
        </div>`}
        ${m.nom_famille || m.email || m.telephone ? `<div class="sinfo" style="margin-bottom:10px">${[m.nom_famille ? esc(m.nom + " " + m.nom_famille) : "", m.email ? esc(m.email) : "", m.telephone ? esc(m.telephone) : ""].filter(Boolean).join(" · ")}</div>` : ""}
        <div class="field"><label>Off jusqu'au (inclus, vide = dispo)</label>${pilule(IC_REG.temps, `<input type="date" class="mq-off" value="${esc(m.off_jusqu_au || "")}">`)}</div>
        <div class="abtns">
          <button class="abtn oui mq-save">Enregistrer</button>
          <button class="abtn mq-lien" data-code="${esc(m.code)}">Copier son lien</button>
          ${estAdmin ? "" : `<button class="abtn mq-regen">Nouveau code</button>
          <button class="abtn non mq-actif" data-actif="${m.actif ? "0" : "1"}">${m.actif ? "Désactiver" : "Réactiver"}</button>`}
        </div>
      </details>`;
      }).join("") + `
      <details class="slot regl" id="nmBloc">
        <summary>Ajouter quelqu'un</summary>
        <div class="row2">
          <div class="field"><label>Prénom</label><input id="nmNom" maxlength="40"></div>
          <div class="field"><label>Équipe</label>${pilule(IC_REG.qui, `<select id="nmEq"><option value="kelian">Team Kélian</option><option value="mila">Team Mila</option></select>`)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Rôle de vente</label>${pilule(IC_REG.qui, `<select id="nmRolev">${ROLES_VENTE.map(([v, l2]) => `<option value="${v}">${l2}</option>`).join("")}</select>`)}</div>
          <div class="field"><label>Type d'accès</label>${pilule(IC_REG.etat, `<select id="nmRole"><option value="membre">Membre (logge et voit son équipe)</option><option value="observateur">Observateur (voit tout, ne touche à rien)</option></select>`)}</div>
        </div>
        <div class="abtns"><button class="abtn oui" id="nmCreer">Créer et copier son lien</button></div>
        <div class="sinfo" id="nmOut" style="margin-top:8px"></div>
      </details>
      </div>`);
    if (MEMBRES.length) {
      const panJeu = document.createElement("div");
      panJeu.className = "rg-pan";
      panJeu.id = "pan-jeu";
      panJeu.style.display = "none";
      const M_OPTS = [["ventes_closees", "Ventes closées"], ["encaisse", "Euros encaissés"], ["settings_cales", "Settings calés"], ["shows", "Settings effectués"], ["rdv_vente", "RDV de vente calés"]];
      panJeu.innerHTML = `
      <div class="sinfo" style="margin-bottom:14px;color:var(--muted)">Le défi collectif de la semaine (lundi-dimanche). L'équipe voit la barre sur son dashboard ; à toi d'honorer la récompense.</div>
      <details class="slot regl" open>
        <summary>Défi de la semaine${Number(PARAMS.defi_cible) > 0 ? "" : " · aucun en cours"}</summary>
        <div class="row2">
          <div class="field"><label>On compte quoi ?</label>${pilule(IC_REG.cond, `<select id="defiMetric">${M_OPTS.map(([v, l2]) => `<option value="${v}"${(PARAMS.defi_metric || "ventes_closees") === v ? " selected" : ""}>${l2}</option>`).join("")}</select>`)}</div>
          <div class="field"><label>Cible de la semaine</label>${pilule(IC_REG.temps, `<input type="number" id="defiCible" min="0" value="${PARAMS.defi_cible || ""}">`)}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Récompense (tu l'honores en vrai)</label><input id="defiReco" maxlength="80" value="${esc(PARAMS.defi_reco || "")}" placeholder="ex : resto d'équipe"></div>
          <div class="field"><label>Pour qui ?</label>${pilule(IC_REG.qui, `<select id="defiEq"><option value="toutes"${(PARAMS.defi_equipe || "toutes") === "toutes" ? " selected" : ""}>Les deux équipes</option><option value="kelian"${PARAMS.defi_equipe === "kelian" ? " selected" : ""}>Team Kélian</option><option value="mila"${PARAMS.defi_equipe === "mila" ? " selected" : ""}>Team Mila</option></select>`)}</div>
        </div>
        <div class="abtns">
          <button class="abtn oui" id="defiGo">Lancer pour la semaine en cours</button>
          ${Number(PARAMS.defi_cible) > 0 ? `<button class="abtn non" id="defiStop">Arrêter le défi</button>` : ""}
        </div>
      </details>
      <details class="slot regl">
        <summary>Prospection (objectif et relance auto)</summary>
        <div class="row2">
          <div class="field"><label>Objectif d'actions par jour et par personne (contacts + relances)</label>${pilule(IC_REG.temps, `<input type="number" id="prosObj" min="1" max="500" value="${PARAMS.prospection_objectif || 18}">`)}</div>
          <div class="field"><label>Relance auto après un contact (jours)</label>${pilule(IC_REG.temps, `<input type="number" id="prosDelai" min="1" max="30" value="${PARAMS.prospection_relance_jours || 3}">`)}</div>
        </div>
        <div class="abtns"><button class="abtn oui" id="prosSave">Enregistrer</button></div>
      </details>
      <details class="slot regl">
        <summary>Affiches de l'accueil${ANNONCES.length ? " · " + ANNONCES.length + " en ligne" : " · aucune"}</summary>
        <div class="sinfo" style="margin-bottom:10px;color:var(--muted)">Le carrousel en haut du dashboard de toute l'équipe : l'affiche d'un call, le voyage à gagner, un événement. Avec image, ou juste un titre sur fond violet. 6 max.</div>
        ${ANNONCES.map(an => `
        <div class="sinfo" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)">
          ${an.image ? `<img src="${an.image}" style="width:64px;height:36px;object-fit:cover;border-radius:6px;flex:none">` : `<span style="width:64px;height:36px;border-radius:6px;background:var(--accent-dim);display:inline-flex;align-items:center;justify-content:center;color:var(--accent);font-size:10px;flex:none">texte</span>`}
          <span style="flex:1">${esc(an.titre || an.texte || "(sans titre)")}</span>
          <button class="abtn non an-suppr" data-aid="${an.id}">Retirer</button>
        </div>`).join("")}
        <div class="row2" style="margin-top:12px">
          <div class="field"><label>Titre</label><input id="anTitre" maxlength="80" placeholder="ex : Call d'équipe jeudi 19h"></div>
          <div class="field"><label>Texte (optionnel)</label><input id="anTexte" maxlength="200" placeholder="ex : le voyage à Dubaï se joue ce mois-ci"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Lien au tap (optionnel, https)</label><input id="anLien" maxlength="300" placeholder="https://..."></div>
          <div class="field"><label>Affiche (optionnelle)</label><input type="file" id="anImage" accept="image/*"></div>
        </div>
        <div class="abtns"><button class="abtn oui" id="anPublier">Publier l'affiche</button></div>
      </details>
      <details class="slot regl">
        <summary>Le barème des XP (lecture seule)</summary>
        <div class="sinfo" style="line-height:2">
          Setting calé : ${XP.setting_cale} XP · Setting effectué : ${XP.setting_show} XP · RDV de vente calé : ${XP.rdv_vente_cale} XP<br>
          Appel de vente tenu : ${XP.vente_faite} XP · Vente closée : ${XP.vente_closee} XP · Présentation (si 2 personnes) : ${XP.presentation} XP<br>
          Argent encaissé : ${XP.encaissement} XP (le jackpot : personne ne gagne tant que le cash n'est pas là)<br>
          Relance faite à l'heure : ${XP.relance_honoree} XP · RDV pris en moins de 2 min au dispatch : ${XP.dispatch_rapide} XP<br>
          Rangs : ${RANGS.slice().reverse().map(([r2, s2]) => r2 + " (" + s2.toLocaleString("fr-FR") + ")").join(" · ")}
        </div>
      </details>`;
      z.appendChild(panJeu);
      const lundiCourant = () => {
        const d = new Date(); d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return SalesStats.ymdLocal(d);
      };
      el("defiGo").addEventListener("click", async () => {
        const cible = Number(el("defiCible").value) || 0;
        if (!cible) return toast("Indique une cible.", "err");
        try {
          for (const [cle, val] of [["defi_metric", el("defiMetric").value], ["defi_cible", String(cible)], ["defi_reco", el("defiReco").value.trim()], ["defi_equipe", el("defiEq").value], ["defi_depuis", lundiCourant()]]) {
            await call("params_save", { cle, valeur: val });
            PARAMS[cle] = val;
          }
          toast("Défi lancé : l'équipe voit la barre sur son dashboard.");
          render();
          chargeRappels();
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      });
      const litAffiche = () => new Promise((resolve, reject) => {
        const f = el("anImage").files && el("anImage").files[0];
        if (!f) return resolve("");
        const img = new Image();
        img.onload = () => {
          // l'affiche reste telle quelle : juste redimensionnée (max 1280) et compressée
          const c = document.createElement("canvas");
          const cx = c.getContext("2d");
          const k = Math.min(1, 1280 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          cx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src);
          // compression progressive : on descend la qualité jusqu'à passer sous la limite
          let data = "";
          for (const q of [0.8, 0.65, 0.5, 0.38]) {
            data = c.toDataURL("image/jpeg", q);
            if (data.length <= 380000) break;
          }
          if (data.length > 380000) return reject(new Error("cette image reste trop lourde, choisis-en une plus simple"));
          resolve(data);
        };
        img.onerror = () => reject(new Error("image illisible"));
        img.src = URL.createObjectURL(f);
      });
      el("prosSave").addEventListener("click", async () => {
        try {
          for (const [cle, val] of [["prospection_objectif", String(Math.max(1, Number(el("prosObj").value) || 18))], ["prospection_relance_jours", String(Math.max(1, Number(el("prosDelai").value) || 3))]]) {
            await call("params_save", { cle, valeur: val });
            PARAMS[cle] = val;
          }
          toast("Réglages de prospection enregistrés.");
          render();
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      });
      el("anPublier").addEventListener("click", async () => {
        try {
          const image = await litAffiche();
          await call("annonce_ajoute", { titre: el("anTitre").value.trim(), texte: el("anTexte").value.trim(), lien: el("anLien").value.trim(), image });
          const cfg2 = await call("config");
          ANNONCES = cfg2.annonces || [];
          toast("Affiche publiée : elle défile sur le dashboard de toute l'équipe.");
          render();
          chargeRappels();
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      });
      z.querySelectorAll(".an-suppr").forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmer({ titre: "Retirer cette affiche ?", ok: "Retirer", danger: true }))) return;
        try {
          await call("annonce_supprime", { id: b.dataset.aid });
          const cfg2 = await call("config");
          ANNONCES = cfg2.annonces || [];
          render();
          chargeRappels();
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      }));
      const ds = el("defiStop");
      if (ds) ds.addEventListener("click", async () => {
        try {
          await call("params_save", { cle: "defi_cible", valeur: "0" });
          PARAMS.defi_cible = "0";
          toast("Défi arrêté.");
          render();
          chargeRappels();
        } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
      });
    }
    z.querySelectorAll(".mq-save").forEach(b => b.addEventListener("click", async () => {
      const sl = b.closest(".slot");
      const corps = { nom: sl.dataset.mnom };
      const rv = sl.querySelector(".mq-rolev"); if (rv) corps.role_vente = rv.value;
      const rf = sl.querySelector(".mq-ref"); if (rf) corps.referent = rf.value === "oui";
      const eq = sl.querySelector(".mq-eq"); if (eq) corps.equipe = eq.value;
      const tx = sl.querySelector(".mq-taux"); if (tx) corps.taux_commission = tx.value ? Number(tx.value) / 100 : 0;
      const of2 = sl.querySelector(".mq-off"); if (of2) corps.off_jusqu_au = of2.value || null;
      try { await call("membre_maj", corps); b.textContent = "Enregistré"; setTimeout(() => chargeRappels(), 700); }
      catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    }));
    z.querySelectorAll(".mq-lien").forEach(b => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(lienDe(b.dataset.code)); b.textContent = "Lien copié"; setTimeout(() => { b.textContent = "Copier son lien"; }, 2000); }
      catch (_) { copieManuelle(lienDe(b.dataset.code), "Le lien d'accès"); }
    }));
    z.querySelectorAll(".mq-regen").forEach(b => b.addEventListener("click", async () => {
      const nom = b.closest(".slot").dataset.mnom;
      if (!(await confirmer({ titre: "Nouveau code pour " + nom + " ?", texte: "Son ancien lien meurt tout de suite, il faudra lui envoyer le nouveau (et il devra réactiver ses notifs).", ok: "Nouveau code", danger: true }))) return;
      try {
        const r = await call("membre_code_regen", { nom });
        try { await navigator.clipboard.writeText(lienDe(r.code)); toast("Nouveau lien copié, envoie-le à " + nom + " en privé."); }
        catch (_) { copieManuelle(lienDe(r.code), "Nouveau lien de " + nom); }
        chargeRappels();
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    }));
    z.querySelectorAll(".mq-actif").forEach(b => b.addEventListener("click", async () => {
      const nom = b.closest(".slot").dataset.mnom;
      const versActif = b.dataset.actif === "1";
      if (!(await confirmer(versActif
        ? { titre: "Réactiver l'accès de " + nom + " ?", ok: "Réactiver" }
        : { titre: "Désactiver " + nom + " ?", texte: "Son lien ne marchera plus et il ne recevra plus rien.", ok: "Désactiver", danger: true }))) return;
      try { await call("membre_maj", { nom, actif: versActif }); chargeRappels(); } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    }));
    const nmc = el("nmCreer");
    if (nmc) nmc.addEventListener("click", async () => {
      const nom = el("nmNom").value.trim();
      if (!nom) return toast("Le prénom est obligatoire.", "err");
      try {
        const r = await call("membre_ajoute", { nom, equipe: el("nmEq").value, role_vente: el("nmRolev").value, role: el("nmRole").value });
        const lien = lienDe(r.code);
        el("nmOut").innerHTML = `Créé. Son lien : <b>${esc(lien)}</b> — envoie-le en privé, un lien = une identité.`;
        try { await navigator.clipboard.writeText(lien); } catch (_) { /* affiché au-dessus */ }
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    });
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
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); b.textContent = "Enregistrer"; b.disabled = false; }
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
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    z.querySelectorAll(".rg-del").forEach(b => b.addEventListener("click", async () => {
      if (!(await confirmer({ titre: "Supprimer ce rappel ?", texte: "Plus aucune notification de ce type ne partira.", ok: "Supprimer", danger: true }))) return;
      try { await call("rappels_delete", { id: b.closest(".slot").dataset.rid }); chargeRappels(); }
      catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    }));
    z.querySelectorAll(".nt-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      const titre = sl.querySelector(".nt-titre").value.trim().slice(0, 80);
      const corps = sl.querySelector(".nt-corps").value.trim().slice(0, 300);
      if (!titre || !corps) return toast("Titre et message obligatoires.", "err");
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        await call("notifs_save", { cle: sl.dataset.ncle, titre, corps });
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    z.querySelectorAll(".msg-save").forEach(b => b.addEventListener("click", async () => {
      if (b.disabled) return;
      const sl = b.closest(".slot");
      const msg = sl.querySelector(".msg-txt").value.trim().slice(0, 500);
      if (!msg) return toast("Le message ne peut pas être vide.", "err");
      b.disabled = true;
      b.textContent = "Enregistrement…";
      try {
        await call("messages_save", { categorie: sl.dataset.cat, message: msg });
        MSG_SRV[sl.dataset.cat] = msg;
        b.textContent = "Enregistré";
        setTimeout(() => { b.textContent = "Enregistrer"; b.disabled = false; }, 1500);
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); b.textContent = "Enregistrer"; b.disabled = false; }
    }));
    el("rgAjout").addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      b.textContent = "Ajout…";
      try {
        await call("rappels_save", { rappel: { delai_min: 60, message: "Dans 1 h : {type} avec {prospect} à {heure}.", actif: true, cible: "assigne" } });
        chargeRappels();
      } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); b.disabled = false; b.textContent = "Ajouter un rappel"; }
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
      if (perm !== "granted") return toast("Les notifications sont bloquées dans les réglages du navigateur.", "err");
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUB) });
      await call("push_subscribe", { sub: s.toJSON() });
      initNotifs();
    } catch (e) { toast("Activation impossible : " + e.message, "err"); }
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
    CORBEILLE = d.corbeille || [];
    LEADS = d.leads || [];
    // les affiches ont changé côté serveur ? on recharge la config (images incluses)
    const idsServeur = (d.annonce_ids || []).join(",");
    const idsLocaux = ANNONCES.map(x => x.id).join(",");
    if (idsServeur !== idsLocaux) {
      try {
        const cfg2 = await call("config");
        ANNONCES = cfg2.annonces || [];
      } catch (_) { /* au prochain passage */ }
    }
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
    const sp = el("splash");
    if (sp) sp.remove();
    el("err").style.display = "none";
  } catch (e) {
    const sp1 = el("splash");
    if (sp1) sp1.remove();
    el("err").innerHTML = "Impossible de charger : " + esc(e.message) + ' <button class="abtn" id="errRetry" style="margin-left:10px">Réessayer</button>';
    el("err").style.display = "block";
    const bR = el("errRetry");
    if (bR) bR.addEventListener("click", () => { el("err").style.display = "none"; loadData(); });
    el("dot").className = "dot err";
    el("updated").textContent = "Hors ligne.";
  }
}

// Écran verrouillé : on peut coller son lien (ou juste le code) pour entrer
function brancheLock() {
  const sp0 = el("splash");
  if (sp0) sp0.remove();
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
    ANNONCES = cfg.annonces || [];
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
  majAvatars();
  brancheAvatar();
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
  const bougeAgenda = sens => {
    const d = new Date(AGENDA_REF);
    if (AGENDA_MODE === "mois") d.setMonth(d.getMonth() + sens, 15);
    else d.setDate(d.getDate() + (AGENDA_MODE === "jour" ? 1 : 7) * sens);
    AGENDA_REF = d.getTime();
    renderAgenda();
  };
  el("agPrec").addEventListener("click", () => bougeAgenda(-1));
  el("agSuiv").addEventListener("click", () => bougeAgenda(1));
  el("agAuj").addEventListener("click", () => { AGENDA_REF = Date.now(); renderAgenda(); });
  document.querySelectorAll(".agseg button").forEach(b => b.addEventListener("click", () => { AGENDA_MODE = b.dataset.agmode; renderAgenda(); }));
  el("agAjout").addEventListener("click", montreAjoutEvenement);
  el("ldAjouter").addEventListener("click", async () => {
    const b = el("ldAjouter");
    if (b.classList.contains("busy")) return;
    const handle = el("ldHandle").value.trim();
    if (!handle) return toast("Le @ du compte est obligatoire.", "err");
    b.classList.add("busy");
    try {
      const r = await call("lead_ajoute", { handle, abonnes: el("ldAbonnes").value.trim(), niche: el("ldNiche").value.trim(), note: el("ldNote").value.trim() });
      ["ldHandle", "ldAbonnes", "ldNiche", "ldNote"].forEach(i2 => { el(i2).value = ""; });
      toast("Lead ajouté ! Relance programmée dans " + r.relance_dans + " jours.");
      el("ldHandle").focus();
      await loadData();
    } catch (e) { toast("Ça n'a pas marché : " + e.message, "err"); }
    finally { b.classList.remove("busy"); }
  });
  el("planType").addEventListener("change", () => { PLANTYPE = el("planType").value; render(); });
  el("planQui").addEventListener("change", () => { PLANFILTRE = el("planQui").value; render(); });
  let chercheT = null;
  el("prospectCherche").addEventListener("input", () => {
    clearTimeout(chercheT);
    chercheT = setTimeout(() => { PROSPECT_FILTRE = el("prospectCherche").value; render(); }, 200);
  });
  el("inEncaisseSel").addEventListener("change", majConditionnels);
  el("inCaleLe").addEventListener("change", () => majJourHint("inCaleLe", "jourHintCale"));
  el("inSuiteLe").addEventListener("change", () => majJourHint("inSuiteLe", "jourHintSuite"));

  el("refresh").addEventListener("click", loadData);
  el("logForm").addEventListener("submit", submitForm);
  document.addEventListener("click", debloqueAudio);
  initNotifs().catch(() => {});
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { debloqueAudio(); loadData(); } });
  await loadData();
  setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 10 * 60 * 1000);
}
init();
