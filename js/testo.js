// Lettura e scrittura del file di testo "in chiaro":
// voci separate da una riga di trattini o trattini bassi (_____ oppure -----),
// prima riga = nome del servizio, poi righe "Chiave = valore" (o "Chiave: valore").
const Testo = (() => {
  const SEPARATORE = /^\s*[_\-]{5,}\s*$/;

  // Nome della chiave nel file -> campo dell'app.
  const ALIAS = {
    utente: ["user", "utente", "username", "user name", "userid", "user id", "nome utente", "login", "account", "id"],
    email: ["email", "e-mail", "mail"],
    password: ["password", "pw", "pwd", "pass", "psw", "passwd", "passw", "parola chiave", "parola d'ordine"],
    pin: ["pin", "codice pin"],
    keypass: ["keypass", "key pass", "key-pass", "chiave", "passkey"],
    sito: ["sito", "url", "web", "link", "indirizzo web"],
    note: ["note", "nota", "annotazioni"],
  };

  function normalizza(k) {
    return k.toLowerCase().replace(/\s+/g, " ").replace(/[.]/g, "").trim();
  }

  function campoDa(chiave) {
    const k = normalizza(chiave);
    for (const [campo, nomi] of Object.entries(ALIAS)) {
      if (nomi.includes(k)) return campo;
    }
    return null;
  }

  // "chiave = valore" oppure "chiave: valore". Preferisce "=" perché le password
  // contengono più spesso ":" che "=" e gli indirizzi web contengono ":".
  function dividiRiga(riga) {
    if (/^\s*(https?:\/\/|www\.)/i.test(riga)) return { chiave: "sito", valore: riga.trim() };
    let pos = riga.indexOf("=");
    if (pos < 0) pos = riga.indexOf(":");
    if (pos <= 0) return null;
    const chiave = riga.slice(0, pos).trim();
    if (!chiave || chiave.length > 30 || /[\/\\]/.test(chiave)) return null;
    return { chiave, valore: riga.slice(pos + 1) };
  }

  function aggiungiNota(voce, testo) {
    testo = testo.trim();
    if (!testo) return;
    voce.note = voce.note ? voce.note + "\n" + testo : testo;
  }

  const EMAIL = /^\S+@\S+\.\S+$/;

  // Chiave scritta senza "=" né ":", es. "PW abc123" o "NUOVA PW abc123".
  // "vecchia pw ..." resta un campo a parte, per non sovrascrivere la password.
  const CHIAVE_SENZA_SEGNO = /^(?:(nuova|nuovo|new|vecchia|vecchio|old)\s+)?(password|pw|pwd|psw|pass|pin|user|utente|keypass)\s+(\S+)$/i;

  function chiaveSenzaSegno(riga) {
    const m = riga.trim().match(CHIAVE_SENZA_SEGNO);
    if (!m) return null;
    const vecchia = m[1] && /^(vecchi|old)/i.test(m[1]);
    return { chiave: vecchia ? m[1] + " " + m[2] : m[2], valore: m[3] };
  }

  // Una data tra parentesi in fondo al valore, es. "mario@x.it (11-04-2026)",
  // è un'annotazione: la stacca dal valore.
  function staccaData(valore) {
    const m = valore.match(/^(.*?)\s*((?:modificat[ao]\s*)?\(\s*\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\s*\))$/i);
    if (!m || !m[1].trim()) return { valore, data: "" };
    return { valore: m[1].trim(), data: m[2].trim() };
  }

  // Divide valore e annotazioni (dopo una tabulazione o una data finale).
  function separaAnnotazioni(testo) {
    const pezzi = testo.split("\t").map((p) => p.trim()).filter(Boolean);
    const { valore, data } = staccaData(pezzi.shift() || "");
    if (data) pezzi.unshift(data);
    return { valore, annotazioni: pezzi.join(" ") };
  }

  function leggiBlocco(righe) {
    const voce = { titolo: "", utente: "", password: "", pin: "", keypass: "", sito: "", note: "", extra: [] };
    const dedotti = [];
    const senzaChiave = []; // righe senza "chiave =", sistemate alla fine
    let visteChiavi = false;
    let prima = true;
    for (const grezza of righe) {
      const riga = grezza.replace(/\s+$/, "");
      if (!riga.trim()) continue;
      // La prima riga della voce è il nome, anche se somiglia a "PIN xyz".
      const kv = dividiRiga(riga) || (prima ? null : chiaveSenzaSegno(riga));
      prima = false;
      if (!kv) {
        const { valore, annotazioni } = separaAnnotazioni(riga);
        senzaChiave.push({ testo: valore, annotazioni, primaDelleChiavi: !visteChiavi });
        continue;
      }
      visteChiavi = true;
      // Dopo il valore ci può essere un'annotazione, separata da tabulazioni
      // o come data tra parentesi (es. "Correggio2026!<TAB>(11-04-2026)"): va nelle note.
      const { valore, annotazioni } = separaAnnotazioni(kv.valore);
      const pezzi = annotazioni ? [annotazioni] : [];
      let campo = campoDa(kv.chiave);
      if (campo === "email") campo = voce.utente ? null : "utente";
      if (campo === "note") {
        aggiungiNota(voce, kv.valore);
      } else if (campo && !voce[campo]) {
        voce[campo] = valore;
      } else {
        voce.extra.push({ nome: kv.chiave, valore });
      }
      if (pezzi.length) aggiungiNota(voce, pezzi.join(" ") + (campo && campo !== "note" ? " (" + kv.chiave + ")" : ""));
    }

    // Righe senza etichetta: la prima (se viene prima delle chiavi e non è
    // un'email) è il nome; poi, in ordine, le righe di una sola "parola"
    // riempiono utente e password se mancano; il resto va nelle note.
    if (senzaChiave.length && senzaChiave[0].primaDelleChiavi && !EMAIL.test(senzaChiave[0].testo)) {
      const t = senzaChiave.shift();
      voce.titolo = t.testo;
      aggiungiNota(voce, t.annotazioni);
    }
    for (const { testo, annotazioni } of senzaChiave) {
      const parola = !/\s/.test(testo) && testo.length <= 64;
      let campo = null;
      if (parola && !voce.utente) campo = "utente";
      else if (parola && !voce.password) campo = "password";
      if (campo) {
        voce[campo] = testo;
        dedotti.push(campo);
        if (annotazioni) aggiungiNota(voce, annotazioni + " (" + campo + ")");
      } else {
        aggiungiNota(voce, testo + (annotazioni ? " " + annotazioni : ""));
      }
    }
    if (!voce.titolo) voce.titolo = voce.sito || voce.utente || "Senza titolo";
    return { voce, dedotti };
  }

  // Restituisce un elenco di { voce, dedotti, originale } per l'anteprima;
  // "dedotti" elenca i campi indovinati da righe senza etichetta.
  function leggi(testo) {
    const righe = testo.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    const blocchi = [];
    let corrente = [];
    for (const r of righe) {
      if (SEPARATORE.test(r)) {
        blocchi.push(corrente);
        corrente = [];
      } else {
        corrente.push(r);
      }
    }
    blocchi.push(corrente);
    return blocchi
      .filter((b) => b.some((r) => r.trim()))
      .map((b) => ({ ...leggiBlocco(b), originale: b.join("\n").trim() }));
  }

  // Scrive le voci nello stesso formato, così il file si può rileggere.
  function scrivi(voci) {
    const sep = "_____________________________";
    const parti = voci.map((v) => {
      const r = [v.titolo || "Senza titolo"];
      if (v.utente) r.push("User = " + v.utente);
      if (v.password) r.push("Password = " + v.password);
      if (v.pin) r.push("PIN = " + v.pin);
      if (v.keypass) r.push("Keypass = " + v.keypass);
      if (v.sito) r.push("Sito = " + v.sito);
      for (const e of v.extra || []) r.push((e.nome || "Campo") + " = " + (e.valore || ""));
      for (const n of (v.note || "").split("\n")) if (n.trim()) r.push("Note = " + n);
      return r.join("\r\n");
    });
    return parti.join("\r\n" + sep + "\r\n\r\n") + "\r\n" + sep + "\r\n";
  }

  return { leggi, scrivi };
})();
