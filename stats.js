// Logique de calcul du dashboard sales (pur : records en entrée, stats en sortie).
// Matching prospect : Instagram d'abord (le process de Tony ne collecte pas les
// numéros, sauf funnel Mila), téléphone en secours.

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
    notes: "Notes"
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
    const y = now.getFullYear(), m = now.getMonth();
    if (period === "mois") return { from: ymdLocal(new Date(y, m, 1)), to: t };
    if (period === "mois-1") return { from: ymdLocal(new Date(y, m - 1, 1)), to: ymdLocal(new Date(y, m, 0)) };
    if (period === "7j") { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymdLocal(d), to: t }; }
    return { from: "0000-00-00", to: "9999-99-99" };
  }

  function inPeriod(r, b) { const d = dateOf(r); return d >= b.from && d <= b.to; }
  function isType(r, t) { return r.fields && r.fields[F.type] === t; }
  function sum(arr, fn) { return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0); }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : null; }

  // État le plus avancé + fiche agrégée de chaque prospect identifié (Instagram/téléphone).
  function prospectStates(all) {
    const st = {};
    all.forEach(r => {
      const k = keyOf(r);
      if (!k) return;
      if (!st[k]) st[k] = { setting: false, rdv: false, enClosing: false, relance: false, close: false, perdu: false,
                            nom: "", contact: "", source: "", dernier: "", vendu: 0, encaisse: 0, relanceEur: 0 };
      const s = st[k], f = r.fields;
      const d = dateOf(r);
      if (d > s.dernier) s.dernier = d;
      if (f[F.prospect]) s.nom = f[F.prospect];
      const c = contactOf(r); if (c) s.contact = c;
      if (isType(r, "Setting")) {
        s.setting = true;
        if (!s.source && f[F.source]) s.source = f[F.source];
        if (f[F.resSetting] === "RDV posé") s.rdv = true;
        if (f[F.resSetting] === "Non qualifié") s.perdu = true;
      }
      if (isType(r, "Présentation")) {
        if (f[F.resPres] === "Passe en closing") s.enClosing = true;
        if (f[F.resPres] === "Pas intéressé") s.perdu = true;
        if (f[F.resPres] === "À relancer") s.relance = true;
      }
      if (isType(r, "Closing")) {
        s.enClosing = true;
        if (f[F.resClosing] === "Closé") { s.close = true; s.vendu += Number(f[F.montant]) || 0; }
        if (f[F.resClosing] === "Pas closé") s.perdu = true;
        if (f[F.resClosing] === "À relancer") { s.relance = true; s.relanceEur += Number(f[F.montant]) || 0; }
      }
      if (isType(r, "Closing") || isType(r, "Paiement")) s.encaisse += Number(f[F.encaisse]) || 0;
    });
    Object.values(st).forEach(s => {
      s.etat = s.close ? "Closé" : s.relance ? "À relancer" : s.enClosing ? "En closing" : s.perdu ? "Perdu" : s.rdv ? "RDV posé" : "Contacté";
    });
    return st;
  }

  function pipeline(st) {
    const out = { contacte: 0, rdvPose: 0, enClosing: 0, aRelancer: 0, close: 0, perdu: 0, total: 0, closeEur: 0, aRelancerEur: 0 };
    Object.values(st).forEach(s => {
      out.total++;
      if (s.etat === "Closé") { out.close++; out.closeEur += s.vendu; }
      else if (s.etat === "À relancer") { out.aRelancer++; out.aRelancerEur += s.relanceEur; }
      else if (s.etat === "En closing") out.enClosing++;
      else if (s.etat === "Perdu") out.perdu++;
      else if (s.etat === "RDV posé") out.rdvPose++;
      else out.contacte++;
    });
    return out;
  }

  // Découpage par semaine (lundi-dimanche) des n dernières semaines.
  function weekly(all, now, n) {
    n = n || 8;
    const m0 = new Date(now); const off = (m0.getDay() + 6) % 7;
    m0.setDate(m0.getDate() - off); m0.setHours(12, 0, 0, 0);
    const weeks = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(m0); start.setDate(start.getDate() - 7 * i);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      weeks.push({ from: ymdLocal(start), to: ymdLocal(end), label: pad(start.getDate()) + "/" + pad(start.getMonth() + 1), encaisse: 0, closes: 0, tenus: 0 });
    }
    all.forEach(r => {
      const d = dateOf(r);
      const w = weeks.find(w => d >= w.from && d <= w.to);
      if (!w) return;
      if (isType(r, "Closing") || isType(r, "Paiement")) w.encaisse += Number(r.fields[F.encaisse]) || 0;
      if (isType(r, "Closing")) {
        if (r.fields[F.resClosing] === "Closé") w.closes++;
        if (r.fields[F.resClosing] && r.fields[F.resClosing] !== "No-show") w.tenus++;
      }
    });
    weeks.forEach(w => { w.tx = pct(w.closes, w.tenus); });
    return weeks;
  }

  function compute(records, period, now, opts) {
    now = now || new Date();
    opts = opts || {};
    const rates = opts.commissionRates || null;
    const today = ymdLocal(now);
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    const yesterday = ymdLocal(yest);
    const monthStart = ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    const b = periodBounds(period || "mois", now);

    const all = records || [];
    const settingsAll = all.filter(r => isType(r, "Setting"));
    const presAll = all.filter(r => isType(r, "Présentation"));
    const closAll = all.filter(r => isType(r, "Closing"));
    const paysAll = all.filter(r => isType(r, "Paiement"));
    const cashAll = closAll.concat(paysAll);

    // ----- Les chiffres du matin -----
    const rdvHier = settingsAll.filter(r => r.fields[F.resSetting] === "RDV posé" && dateOf(r) === yesterday).length;
    const encaisseMois = sum(cashAll.filter(r => { const d = dateOf(r); return d >= monthStart && d <= today; }), r => r.fields[F.encaisse]);
    // Relances dues — en excluant les prospects closés depuis (matché par Instagram/téléphone)
    const dejaCloses = new Set(closAll.filter(r => r.fields[F.resClosing] === "Closé").map(keyOf).filter(Boolean));
    const relances = all.filter(r =>
      (r.fields[F.resClosing] === "À relancer" || r.fields[F.resPres] === "À relancer") &&
      r.fields[F.relance] && String(r.fields[F.relance]).slice(0, 10) <= today
    ).filter(r => { const k = keyOf(r); return !(k && dejaCloses.has(k)); });

    // ----- RDV à venir (aujourd'hui inclus) -----
    const rdvAVenir = settingsAll
      .filter(r => r.fields[F.resSetting] === "RDV posé" && rdvDayLocal(r) >= today)
      .sort((a, c) => (a.fields[F.rdvLe] || "").localeCompare(c.fields[F.rdvLe] || ""))
      .map(r => ({
        jour: rdvDayLocal(r),
        heure: rdvTimeLocal(r),
        prospect: r.fields[F.prospect] || "?",
        avec: r.fields[F.rdvAvec] || "?",
        setter: r.fields[F.qui] || "?",
        contact: contactOf(r),
        fiche: r.fields[F.fiche] || ""
      }));
    const rdvJour = rdvAVenir.filter(r => r.jour === today);

    // ----- Période sélectionnée -----
    const settings = settingsAll.filter(r => inPeriod(r, b));
    const pres = presAll.filter(r => inPeriod(r, b));
    const clos = closAll.filter(r => inPeriod(r, b));
    const pays = paysAll.filter(r => inPeriod(r, b));

    const people = {};
    function P(name) {
      if (!people[name]) people[name] = { settings: 0, rdvPoses: 0, presTenues: 0, presPasse: 0, closPris: 0, closes: 0, noShows: 0, vendu: 0, encaisse: 0, commission: null };
      return people[name];
    }
    settings.forEach(r => { const p = P(r.fields[F.qui] || "?"); p.settings++; if (r.fields[F.resSetting] === "RDV posé") p.rdvPoses++; });
    pres.forEach(r => {
      const p = P(r.fields[F.qui] || "?");
      if (r.fields[F.resPres] === "No-show") p.noShows++;
      else if (r.fields[F.resPres]) p.presTenues++;
      if (r.fields[F.resPres] === "Passe en closing") p.presPasse++;
    });
    clos.forEach(r => {
      const p = P(r.fields[F.qui] || "?");
      if (r.fields[F.resClosing] === "No-show") p.noShows++;
      else if (r.fields[F.resClosing]) p.closPris++;
      if (r.fields[F.resClosing] === "Closé") { p.closes++; p.vendu += Number(r.fields[F.montant]) || 0; }
      p.encaisse += Number(r.fields[F.encaisse]) || 0;
    });
    pays.forEach(r => { P(r.fields[F.qui] || "?").encaisse += Number(r.fields[F.encaisse]) || 0; });
    if (rates) {
      Object.keys(people).forEach(n => {
        const rate = Number(rates[n]);
        if (rate > 0) people[n].commission = Math.round(people[n].encaisse * rate) / 1; // % sur l'encaissé de la période
      });
    }

    // Funnel par source
    const closedKeys = new Set(closAll.filter(r => r.fields[F.resClosing] === "Closé").map(keyOf).filter(Boolean));
    const sources = {};
    settings.forEach(r => {
      const s = r.fields[F.source] || "Non renseignée";
      if (!sources[s]) sources[s] = { settings: 0, rdvPoses: 0, closes: 0 };
      sources[s].settings++;
      if (r.fields[F.resSetting] === "RDV posé") sources[s].rdvPoses++;
      const k = keyOf(r);
      if (k && closedKeys.has(k)) sources[s].closes++;
    });

    // Show-up (matché par Instagram/téléphone)
    const tenusKeys = new Set(
      presAll.filter(r => r.fields[F.resPres] && r.fields[F.resPres] !== "No-show").map(keyOf)
        .concat(closAll.filter(r => r.fields[F.resClosing] && r.fields[F.resClosing] !== "No-show").map(keyOf))
        .filter(Boolean)
    );
    const rdvPosesPeriode = settings.filter(r => r.fields[F.resSetting] === "RDV posé");
    const rdvAvecCle = rdvPosesPeriode.filter(r => keyOf(r));
    const showUps = rdvAvecCle.filter(r => tenusKeys.has(keyOf(r))).length;

    const noShows = pres.filter(r => r.fields[F.resPres] === "No-show").length +
                    clos.filter(r => r.fields[F.resClosing] === "No-show").length;
    const dealsPerdus = clos.filter(r => r.fields[F.resClosing] === "Pas closé").length +
                        pres.filter(r => r.fields[F.resPres] === "Pas intéressé").length;

    // Closés après relance : parmi les closés de la période (avec identifiant),
    // % dont le prospect avait un « À relancer » ANTÉRIEUR au closing.
    const relanceDates = {};
    all.forEach(r => {
      if (r.fields[F.resClosing] === "À relancer" || r.fields[F.resPres] === "À relancer") {
        const k = keyOf(r);
        if (k) { const d = dateOf(r); if (!relanceDates[k] || d < relanceDates[k]) relanceDates[k] = d; }
      }
    });
    const closesAvecCle = clos.filter(r => r.fields[F.resClosing] === "Closé" && keyOf(r));
    const apresRelance = closesAvecCle.filter(r => relanceDates[keyOf(r)] && relanceDates[keyOf(r)] < dateOf(r)).length;

    const stProspects = prospectStates(all);
    const presTenues = pres.filter(r => r.fields[F.resPres] && r.fields[F.resPres] !== "No-show").length;
    const presPasse = pres.filter(r => r.fields[F.resPres] === "Passe en closing").length;
    const closTenus = clos.filter(r => r.fields[F.resClosing] && r.fields[F.resClosing] !== "No-show").length;
    const closes = clos.filter(r => r.fields[F.resClosing] === "Closé").length;

    return {
      today, yesterday, bounds: b,
      matin: { rdvHier, encaisseMois, relancesAFaire: relances.length },
      relances: relances.map(r => ({
        prospect: r.fields[F.prospect] || "?",
        contact: contactOf(r),
        date: (r.fields[F.relance] || "").slice(0, 10),
        qui: r.fields[F.qui] || "?",
        notes: r.fields[F.notes] || ""
      })).sort((a, c) => a.date.localeCompare(c.date)),
      rdvJour, rdvAVenir,
      pipeline: pipeline(stProspects),
      prospects: Object.values(stProspects).sort((a, c) => c.dernier.localeCompare(a.dernier)),
      periode: {
        settings: settings.length,
        rdvPoses: rdvPosesPeriode.length,
        txRdv: pct(rdvPosesPeriode.length, settings.length),
        showUp: pct(showUps, rdvAvecCle.length),
        noShows,
        txNoShow: pct(noShows, noShows + presTenues + closTenus),
        dealsPerdus,
        txApresRelance: pct(apresRelance, closesAvecCle.length),
        presTenues, presPasse, txPres: pct(presPasse, presTenues),
        closTenus, closes, txClose: pct(closes, closTenus),
        vendu: sum(clos.filter(r => r.fields[F.resClosing] === "Closé"), r => r.fields[F.montant]),
        encaisse: sum(clos, r => r.fields[F.encaisse]) + sum(pays, r => r.fields[F.encaisse])
      },
      people, sources,
      hebdo: weekly(all, now, 8),
      hasCommissions: !!rates,
      totalRecords: all.length
    };
  }

  return { compute, F, normPhone, normInsta, keyOf, dateOf, ymdLocal };
});
