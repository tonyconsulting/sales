// Moteur de calcul — modèle Tony (10/07 v2) :
// Setting : Calé (booké) -> Effectué (show) ou No-show ;
//   effectué -> Non abouti (avec cause) OU « RDV de vente calé ».
// Vente = UN appel avec deux phases : présentation (qui_presentation)
//   puis closing (qui) — possiblement deux personnes. Peut closer/encaisser.
// Paiement = encaissement ultérieur (solde d'acompte).
// (Les anciens types Prez/Closing restent lus pour compatibilité.)
// Matching prospect : Instagram d'abord, téléphone en secours.

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SalesStats = factory(); }
})(typeof self !== "undefined" ? self : this, function () {

  const F = {
    type: "Type de call",
    date: "Date",
    qui: "Qui",
    tel: "Téléphone",
    insta: "Instagram",
    source: "Source",
    resSetting: "Résultat setting",
    rdvLe: "RDV prévu le",
    rdvAvec: "RDV avec",
    fiche: "Fiche prospect",
    resPres: "Résultat présentation",
    resClosing: "Résultat closing",
    offre: "Offre vendue",
    montant: "Montant total",
    encaisse: "Encaissé aujourd'hui",
    paiement: "Type de paiement",
    relance: "Date de relance",
    prospect: "Prospect",
    notes: "Notes",
    cause: "Cause",
    quiPres: "Présentation par"
  };

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymdLocal(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function normPhone(p) { return String(p || "").replace(/\D/g, "").slice(-9); }
  function normInsta(v) { return String(v || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, ""); }
  function keyOf(r) {
    const f = r.fields || {};
    const i = normInsta(f[F.insta]);
    if (i) return "ig:" + i;
    const p = normPhone(f[F.tel]);
    return p ? "tel:" + p : "";
  }
  function contactOf(r) {
    const f = r.fields || {};
    const i = String(f[F.insta] || "").trim();
    if (i) return (i.startsWith("@") ? i : "@" + i);
    return f[F.tel] || "";
  }
  function dateOf(r) {
    const d = r.fields && r.fields[F.date];
    if (d) return String(d).slice(0, 10);
    return r.createdTime ? ymdLocal(new Date(r.createdTime)) : "";
  }
  function rdvDayLocal(r) {
    const v = r.fields && r.fields[F.rdvLe];
    return v ? ymdLocal(new Date(v)) : "";
  }
  function rdvTimeLocal(r) {
    const v = r.fields && r.fields[F.rdvLe];
    if (!v) return "";
    const d = new Date(v);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function periodBounds(period, now) {
    const t = ymdLocal(now);
    if (period === "1j") return { from: t, to: t };
    if (period === "7j") { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymdLocal(d), to: t }; }
    if (period === "30j") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: ymdLocal(d), to: t }; }
    return { from: "0000-00-00", to: "9999-99-99" };
  }

  function inPeriod(r, b) { const d = dateOf(r); return d >= b.from && d <= b.to; }
  function isType(r, t) { return r.fields && r.fields[F.type] === t; }
  function num(v) { return Number(v) || 0; }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : null; }

  const SET_CALE = "Calé (à venir)";
  const SET_NOSHOW = "No-show";
  const SET_NONABOUTI = "Non abouti";
  const SET_PREZ = "Part en prez";           // legacy
  const SET_CLOSING = "Part en closing";     // legacy
  const SET_VENTE = "RDV de vente calé";
  function estVente(r) { return isType(r, "Vente") || isType(r, "Prez") || isType(r, "Présentation") || isType(r, "Closing"); }
  function resVente(f) { return f["Résultat closing"] || f["Résultat présentation"]; }

  function statsVides() {
    return {
      cales: 0, effectues: 0, noShows: 0, nonAboutis: 0, causes: {},
      versVente: 0, presFaites: 0,
      ventesEff: 0, ventesNoShow: 0,
      closes: 0, vendu: 0, encaisse: 0
    };
  }

  // accumule(S, r) pour le global ; accumule(S, r, nom) pour une personne :
  // le closing est crédité à « Qui », la phase de présentation à « Présentation par ».
  function accumule(S, r, nom) {
    const f = r.fields;
    const pourMoi = !nom || f[F.qui] === nom;
    if (isType(r, "Setting") && pourMoi) {
      const res = f[F.resSetting];
      if (res === SET_CALE) S.cales++;
      else if (res === SET_NOSHOW) S.noShows++;
      else if (res === SET_NONABOUTI) {
        S.effectues++; S.nonAboutis++;
        const c = f[F.cause] || "Sans cause";
        S.causes[c] = (S.causes[c] || 0) + 1;
      } else if (res === SET_PREZ || res === SET_CLOSING || res === SET_VENTE) { S.effectues++; S.versVente++; }
    }
    if (estVente(r)) {
      const res = resVente(f);
      const pres = f[F.quiPres] || f[F.qui];
      if ((!nom || pres === nom) && res && res !== "No-show") S.presFaites++;
      if (pourMoi) {
        if (res === "No-show") S.ventesNoShow++;
        else if (res) S.ventesEff++;
        if (res === "Closé") { S.closes++; S.vendu += num(f[F.montant]); }
        S.encaisse += num(f[F.encaisse]);
      }
    }
    if (isType(r, "Paiement") && pourMoi) S.encaisse += num(f[F.encaisse]);
  }

  function finalise(S) {
    S.txShow = pct(S.effectues, S.effectues + S.noShows);
    S.txAbouti = pct(S.versVente, S.effectues);
    S.txClose = pct(S.closes, S.ventesEff);
    S.panier = S.closes ? Math.round(S.vendu / S.closes) : null;
    return S;
  }

  // Fiche agrégée par prospect (tout l'historique)
  function prospectStates(all) {
    const st = {};
    all.forEach(r => {
      const k = keyOf(r);
      if (!k) return;
      if (!st[k]) st[k] = { cale: false, vu: false, enVente: false, relance: false, close: false, perdu: false,
                            nom: "", contact: "", source: "", dernier: "", vendu: 0, encaisse: 0, relanceEur: 0 };
      const s = st[k], f = r.fields;
      const d = dateOf(r);
      if (d > s.dernier) s.dernier = d;
      if (f[F.prospect]) s.nom = f[F.prospect];
      const c = contactOf(r); if (c) s.contact = c;
      if (isType(r, "Setting")) {
        if (!s.source && f[F.source]) s.source = f[F.source];
        const res = f[F.resSetting];
        if (res === SET_CALE) s.cale = true;
        if (res === SET_NOSHOW) s.cale = true;
        if (res === SET_NONABOUTI) { s.vu = true; if ((f[F.cause] || "") !== "À rappeler") s.perdu = true; else s.relance = true; }
        if (res === SET_PREZ || res === SET_CLOSING || res === SET_VENTE) { s.vu = true; s.enVente = true; }
      }
      if (estVente(r)) {
        const res = resVente(f);
        if (res === "Closé") { s.close = true; s.vendu += num(f[F.montant]); }
        if (res === "Pas closé") s.perdu = true;
        if (res === "À relancer") { s.relance = true; s.relanceEur += num(f[F.montant]); }
        s.encaisse += num(f[F.encaisse]);
      }
      if (isType(r, "Paiement")) s.encaisse += num(f[F.encaisse]);
    });
    Object.values(st).forEach(s => {
      s.etat = s.close ? "Closé" : s.relance ? "À relancer" : s.enVente ? "RDV de vente"
        : s.perdu ? "Perdu" : s.vu ? "Vu en setting" : s.cale ? "Setting calé" : "Contacté";
    });
    return st;
  }

  function weekly(all, now, n) {
    n = n || 8;
    const m0 = new Date(now); const off = (m0.getDay() + 6) % 7;
    m0.setDate(m0.getDate() - off); m0.setHours(12, 0, 0, 0);
    const weeks = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(m0); start.setDate(start.getDate() - 7 * i);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      weeks.push({ from: ymdLocal(start), to: ymdLocal(end), label: pad(start.getDate()) + "/" + pad(start.getMonth() + 1), encaisse: 0, closes: 0 });
    }
    all.forEach(r => {
      const d = dateOf(r);
      const w = weeks.find(w => d >= w.from && d <= w.to);
      if (!w) return;
      const f = r.fields;
      if (estVente(r) || isType(r, "Paiement")) w.encaisse += num(f[F.encaisse]);
      if (estVente(r) && resVente(f) === "Closé") w.closes++;
    });
    return weeks;
  }

  function compute(records, period, now) {
    now = now || new Date();
    const today = ymdLocal(now);
    const b = periodBounds(period || "7j", now);
    const all = records || [];
    const enPeriode = all.filter(r => inPeriod(r, b));

    const global = statsVides();
    const people = {};
    const noms = new Set();
    enPeriode.forEach(r => {
      accumule(global, r);
      if (r.fields[F.qui]) noms.add(r.fields[F.qui]);
      if (r.fields[F.quiPres]) noms.add(r.fields[F.quiPres]);
    });
    noms.forEach(nom => {
      people[nom] = statsVides();
      enPeriode.forEach(r => accumule(people[nom], r, nom));
    });
    finalise(global);
    Object.values(people).forEach(finalise);

    const st = prospectStates(all);
    const prospects = Object.values(st).sort((a, c) => c.dernier.localeCompare(a.dernier));

    // Reste à encaisser : closés dont le montant dépasse les encaissements cumulés (acomptes non soldés)
    const resteListe = prospects
      .filter(x => x.etat === "Closé" && x.vendu > x.encaisse)
      .map(x => ({ prospect: x.nom || x.contact, contact: x.contact, du: x.vendu - x.encaisse }))
      .sort((a, c) => c.du - a.du);
    const resteTotal = resteListe.reduce((a, x) => a + x.du, 0);

    // Relances dues (hors prospects closés depuis)
    const dejaCloses = new Set(Object.keys(st).filter(k => st[k].close));
    const relances = all.filter(r => {
      const f = r.fields;
      const rel = ((estVente(r) && resVente(f) === "À relancer") ||
                   (f[F.resSetting] === SET_NONABOUTI && f[F.cause] === "À rappeler"));
      return rel && f[F.relance] && String(f[F.relance]).slice(0, 10) <= today;
    }).filter(r => { const k = keyOf(r); return !(k && dejaCloses.has(k)); })
      .map(r => ({
        prospect: r.fields[F.prospect] || "?",
        contact: contactOf(r),
        date: (r.fields[F.relance] || "").slice(0, 10),
        qui: r.fields[F.qui] || "?",
        notes: r.fields[F.notes] || ""
      })).sort((a, c) => a.date.localeCompare(c.date));

    // RDV à venir : settings calés + parts en prez/closing à date future (aujourd'hui inclus)
    const rdvAVenir = all.filter(r => {
      const res = r.fields[F.resSetting];
      return isType(r, "Setting") && (res === SET_CALE || res === SET_PREZ || res === SET_CLOSING || res === SET_VENTE) && rdvDayLocal(r) >= today;
    }).sort((a, c) => (a.fields[F.rdvLe] || "").localeCompare(c.fields[F.rdvLe] || ""))
      .map(r => ({
        jour: rdvDayLocal(r),
        heure: rdvTimeLocal(r),
        quoi: r.fields[F.resSetting] === SET_CALE ? "Setting" : r.fields[F.resSetting] === SET_PREZ ? "Prez" : "Closing",
        prospect: r.fields[F.prospect] || "?",
        avec: r.fields[F.resSetting] === SET_CALE ? (r.fields[F.qui] || "?") : (r.fields[F.rdvAvec] || "?"),
        setter: r.fields[F.qui] || "?",
        contact: contactOf(r),
        fiche: r.fields[F.fiche] || ""
      }));
    const rdvJour = rdvAVenir.filter(r => r.jour === today);

    const pi = { contacte: 0, cale: 0, vu: 0, enVente: 0, aRelancer: 0, close: 0, perdu: 0, total: 0, closeEur: 0, aRelancerEur: 0 };
    prospects.forEach(s => {
      pi.total++;
      if (s.etat === "Closé") { pi.close++; pi.closeEur += s.vendu; }
      else if (s.etat === "À relancer") { pi.aRelancer++; pi.aRelancerEur += s.relanceEur; }
      else if (s.etat === "RDV de vente") pi.enVente++;
      else if (s.etat === "Perdu") pi.perdu++;
      else if (s.etat === "Vu en setting") pi.vu++;
      else if (s.etat === "Setting calé") pi.cale++;
      else pi.contacte++;
    });

    const b30 = periodBounds("30j", now);
    let encaisse30 = 0;
    all.forEach(r => {
      if (!inPeriod(r, b30)) return;
      if (estVente(r) || isType(r, "Paiement")) encaisse30 += num(r.fields[F.encaisse]);
    });

    return {
      today, bounds: b,
      matin: { rdvJour: rdvJour.length, encaisse30, relancesAFaire: relances.length },
      global, people,
      reste: { total: resteTotal, liste: resteListe },
      relances, rdvJour, rdvAVenir,
      pipeline: pi, prospects,
      hebdo: weekly(all, now, 8),
      totalRecords: all.length
    };
  }

  return { compute, F, keyOf, dateOf, ymdLocal };
});
