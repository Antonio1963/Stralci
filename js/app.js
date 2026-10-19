"use strict";
// Stralci: le schermate dell'app. I dati restano solo su questo dispositivo,
// cifrati con la password principale (vedi cripto.js).

const CHIAVE_ARCHIVIO = "stralci.archivio";
const CHIAVE_OPZIONI = "stralci.opzioni";
const CHIAVE_PROFILI = "stralci.profili";
const VERSIONE_APP = "1.1.0";
const DATA_VERSIONE_APP = "19/10/2026";
const NASCOSTO = "••••••••";

const S = {
  c: null, // { chiave, sale, iter } quando l'archivio è aperto
  dati: null, // { voci: [...] }
  profili: [],
  profiloId: null,
  profiloIdentita: null,
  profiloNome: "",
  filtro: "",
  anteprima: null, // voci lette da un file di testo, in attesa di importazione
  ultima: Date.now(),
  nascosto: 0,
};

const main = document.getElementById("contenuto");
const touch = matchMedia("(pointer: coarse)").matches;

// ---------- utilità ----------

function el(tag, attr, ...figli) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of figli.flat()) {
    if (f == null || f === false) continue;
    e.append(f instanceof Node ? f : String(f));
  }
  return e;
}

function mostra(...nodi) {
  main.replaceChildren(...nodi);
  window.scrollTo(0, 0);
}

function leggiLS(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function archivioSalvato() {
  const t = leggiLS(chiaveArchivio());
  if (!t) return null;
  try {
    const p = JSON.parse(t);
    return Cripto.pacchettoValido(p) ? p : null;
  } catch {
    return null;
  }
}

function chiaveArchivio() {
  const profilo = S.profili.find((p) => p.id === S.profiloId);
  return profilo && profilo.archivioKey ? profilo.archivioKey : S.profiloId ? CHIAVE_ARCHIVIO + "." + S.profiloId : CHIAVE_ARCHIVIO;
}

function chiaveOpzioni() {
  const profilo = S.profili.find((p) => p.id === S.profiloId);
  return profilo && profilo.opzioniKey ? profilo.opzioniKey : S.profiloId ? CHIAVE_OPZIONI + "." + S.profiloId : CHIAVE_OPZIONI;
}

function leggiProfili() {
  try {
    const p = JSON.parse(leggiLS(CHIAVE_PROFILI) || "[]");
    return Array.isArray(p) ? p.filter((x) => x && typeof x.id === "string" && typeof x.nome === "string") : [];
  } catch { return []; }
}

function salvaProfili() { localStorage.setItem(CHIAVE_PROFILI, JSON.stringify(S.profili)); }

function aggiornaProfiloTestata() {
  const e = document.getElementById("profilo-attivo");
  if (!e) return;
  e.textContent = S.profiloNome ? "👤 " + S.profiloNome : "";
  e.hidden = !S.profiloNome;
}

function inizializzaProfili() {
  S.profili = leggiProfili();
  // Migra l'archivio precedente senza decifrarlo né alterarlo.
  const legacy = leggiLS(CHIAVE_ARCHIVIO);
  if (!S.profili.length && legacy) {
    try {
      if (Cripto.pacchettoValido(JSON.parse(legacy))) {
        const profilo = { id: nuovoId(), identita: nuovoId(), nome: "Personale", archivioKey: CHIAVE_ARCHIVIO, opzioniKey: CHIAVE_OPZIONI };
        S.profili = [profilo];
        salvaProfili();
      }
    } catch {}
  }
}

function selezionaProfilo(profilo) {
  if (!profilo.identita) { profilo.identita = nuovoId(); salvaProfili(); }
  S.profiloId = profilo.id;
  S.profiloIdentita = profilo.identita;
  S.profiloNome = profilo.nome;
  aggiornaProfiloTestata();
  vistaBlocco();
}

function nomeProfiloValido(nome) {
  nome = (nome || "").trim().replace(/\s+/g, " ");
  if (!nome || nome.length > 40) return "";
  if (S.profili.some((p) => p.nome.toLocaleLowerCase("it") === nome.toLocaleLowerCase("it"))) return "";
  return nome;
}

async function aggiungiProfilo(nome) {
  const pulito = nomeProfiloValido(nome);
  if (!pulito) return avviso("Nome vuoto, troppo lungo o già usato.");
  const profilo = { id: nuovoId(), identita: nuovoId(), nome: pulito };
  S.profili.push(profilo);
  try { salvaProfili(); } catch { S.profili.pop(); return avviso("Non riesco a salvare il profilo in questo browser."); }
  selezionaProfilo(profilo);
}

function opzioni() {
  try {
    return Object.assign({ bloccoMinuti: 5 }, JSON.parse(leggiLS(chiaveOpzioni()) || "{}"));
  } catch {
    return { bloccoMinuti: 5 };
  }
}

function salvaOpzioni(o) {
  try {
    localStorage.setItem(chiaveOpzioni(), JSON.stringify(o));
  } catch {}
}

function semplifica(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function nuovoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function oggi() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function data(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

let timerAvviso;
function avviso(testo) {
  const a = document.getElementById("avviso");
  a.textContent = testo;
  a.classList.add("visibile");
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => a.classList.remove("visibile"), 2600);
}

async function copia(testo, cosa) {
  try {
    await navigator.clipboard.writeText(testo);
  } catch {
    const t = el("textarea", { readonly: true, class: "fuori-schermo" }, testo);
    document.body.append(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  avviso((cosa || "Testo") + " copiato");
}

function indietro() {
  return el("button", { class: "indietro", type: "button", onclick: () => history.back() }, "‹ Indietro");
}

function titoloVista(testo) {
  return el("h1", { class: "titolo-vista" }, testo);
}

// Finestra di dialogo: restituisce il valore del campo (o true) se confermata, null se annullata.
function dialogo({ titolo, testo, campo, conferma = "OK", pericolo = false }) {
  return new Promise((risolvi) => {
    const input = campo ? el("input", { type: campo.tipo || "text", placeholder: campo.segnaposto || "", autocomplete: "off" }) : null;
    const d = el(
      "dialog",
      { class: "dialogo" },
      el(
        "form",
        { method: "dialog" },
        el("h2", {}, titolo),
        testo ? el("p", {}, testo) : null,
        input,
        el(
          "div",
          { class: "pulsanti" },
          el("button", { value: "no", type: "submit", class: "secondario" }, "Annulla"),
          el("button", { value: "si", type: "submit", class: pericolo ? "pericolo" : "primario" }, conferma)
        )
      )
    );
    d.addEventListener("close", () => {
      const ok = d.returnValue === "si";
      d.remove();
      risolvi(ok ? (input ? input.value : true) : null);
    });
    document.body.append(d);
    d.showModal();
    if (input) input.focus();
  });
}

function scegliFile(accept) {
  return new Promise((risolvi) => {
    const i = el("input", { type: "file", accept, class: "fuori-schermo" });
    i.addEventListener("change", () => {
      risolvi(i.files[0] || null);
      i.remove();
    });
    document.body.append(i);
    i.click();
  });
}

// Il file di testo può essere in UTF-8, UTF-16 (Blocco note "Unicode") o ANSI di Windows.
async function leggiTestoFile(f) {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}

async function scaricaFile(nome, contenuto, tipo) {
  const blob = new Blob([contenuto], { type: tipo });
  if (touch && navigator.canShare) {
    const file = new File([blob], nome, { type: tipo });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: nome });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- dati ----------

function pulisciVoce(v) {
  const s = (x) => (x == null ? "" : String(x));
  return {
    id: v.id || nuovoId(),
    titolo: s(v.titolo).trim() || "Senza titolo",
    utente: s(v.utente),
    password: s(v.password),
    pin: s(v.pin),
    keypass: s(v.keypass),
    sito: s(v.sito),
    note: s(v.note),
    extra: Array.isArray(v.extra) ? v.extra.map((e) => ({ nome: s(e.nome), valore: s(e.valore), segreto: !!e.segreto })) : [],
    creato: v.creato || new Date().toISOString(),
    modificato: v.modificato || v.creato || new Date().toISOString(),
  };
}

function pulisciDati(d) {
  const voci = d && Array.isArray(d.voci) ? d.voci.map(pulisciVoce) : [];
  return { voci };
}

function ordinate() {
  return [...S.dati.voci].sort((a, b) => a.titolo.localeCompare(b.titolo, "it", { sensitivity: "base" }));
}

function trova(id) {
  return S.dati.voci.find((v) => v.id === id);
}

function testoRicerca(v) {
  const extra = v.extra.filter((e) => !e.segreto).map((e) => e.nome + " " + e.valore);
  return semplifica([v.titolo, v.utente, v.sito, v.note, ...extra].join(" "));
}

async function salva() {
  const p = await Cripto.cifra(S.dati, S.c);
  try {
    localStorage.setItem(chiaveArchivio(), JSON.stringify(p));
  } catch (e) {
    avviso("Non riesco a salvare: memoria del browser piena o bloccata.");
    throw e;
  }
}

function sblocca(c, dati) {
  S.c = c;
  S.dati = pulisciDati(dati);
  S.ultima = Date.now();
  document.body.classList.remove("bloccato");
  aggiornaProfiloTestata();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  history.replaceState({ vista: "lista" }, "");
  disegna("lista");
}

function blocca() {
  S.c = null;
  S.dati = null;
  S.anteprima = null;
  S.filtro = "";
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  vistaBlocco();
}

function cambiaProfilo() {
  S.c = null;
  S.dati = null;
  S.profiloId = null;
  S.profiloIdentita = null;
  S.profiloNome = "";
  S.anteprima = null;
  S.filtro = "";
  document.body.classList.add("bloccato");
  aggiornaProfiloTestata();
  vistaProfili();
}

// ---------- navigazione ----------

function vai(vista, param = null, sostituisci = false) {
  const st = { vista, param };
  if (sostituisci) history.replaceState(st, "");
  else history.pushState(st, "");
  disegna(vista, param);
}

window.addEventListener("popstate", (e) => {
  if (!S.c) return;
  const st = e.state || { vista: "lista" };
  disegna(st.vista, st.param);
});

function disegna(vista, param) {
  S.ultima = Date.now();
  switch (vista) {
    case "voce":
      return trova(param) ? vistaVoce(param) : vistaLista();
    case "modifica":
      return vistaModifica(param);
    case "importa":
      return vistaImporta();
    case "opzioni":
      return vistaOpzioni();
    case "cambia":
      return vistaCambiaPassword();
    default:
      return vistaLista();
  }
}

// ---------- blocco e creazione ----------

function vistaBlocco() {
  document.body.classList.add("bloccato");
  if (!S.profiloId) return vistaProfili();
  const p = archivioSalvato();
  if (!p) return vistaBenvenuto();
  const pw = el("input", { type: "password", autocomplete: "current-password", placeholder: "Password principale", "aria-label": "Password principale" });
  const errore = el("p", { class: "errore", role: "alert" });
  const bottone = el("button", { class: "primario largo", type: "submit" }, "Apri");
  mostra(
    el(
      "form",
      {
        class: "scheda blocco",
        onsubmit: async (ev) => {
          ev.preventDefault();
          if (!pw.value) return;
          bottone.disabled = true;
          bottone.textContent = "Apro…";
          errore.textContent = "";
          try {
            const chiave = await Cripto.chiavePer(pw.value, p);
            const dati = await Cripto.decifra(p, chiave);
            pw.value = "";
            sblocca({ chiave, sale: p.sale, iter: p.iter }, dati);
          } catch {
            errore.textContent = "Password sbagliata.";
            bottone.disabled = false;
            bottone.textContent = "Apri";
            pw.select();
          }
        },
      },
      el("div", { class: "lucchetto", "aria-hidden": "true" }, "🔒"),
      el("h1", {}, "Stralci"),
      el("p", { class: "etichetta-profilo" }, "Profilo: " + S.profiloNome),
      el("p", { class: "tenue" }, "Inserisci la password principale."),
      pw,
      errore,
      bottone,
      el("button", { type: "button", class: "collegamento", onclick: vistaDimenticata }, "Ho dimenticato la password principale"),
      el("button", { type: "button", class: "collegamento", onclick: cambiaProfilo }, "Cambia profilo")
    )
  );
  pw.focus();
}

function vistaProfili() {
  document.body.classList.add("bloccato");
  const errore = el("p", { class: "errore", role: "alert" });
  const lista = el("div", { class: "lista-profili" }, S.profili.map((p) =>
    el("button", { type: "button", class: "secondario largo profilo-scelta", onclick: () => selezionaProfilo(p) }, "👤  " + p.nome)
  ));
  mostra(el("div", { class: "scheda blocco" },
    el("div", { class: "lucchetto", "aria-hidden": "true" }, "🔐"),
    el("h1", {}, "Scegli il profilo"),
    el("p", { class: "tenue" }, "Ogni persona ha un archivio separato e una propria password principale."),
    lista, errore,
    el("button", { type: "button", class: "primario largo", onclick: async () => {
      const nome = await dialogo({ titolo: "Nuovo profilo", testo: "Scegli un nome per riconoscere questo archivio.", campo: { segnaposto: "Es. Antonio" }, conferma: "Crea profilo" });
      if (nome == null) return;
      if (!nomeProfiloValido(nome)) { errore.textContent = "Nome vuoto, troppo lungo o già usato. Scegli un nome diverso."; return; }
      await aggiungiProfilo(nome);
    }}, "＋ Aggiungi profilo"),
    el("button", { type: "button", class: "secondario largo", onclick: ripristinaSuNuovo }, "Ripristina un backup cifrato")
  ));
}

function vistaDimenticata() {
  mostra(
    el(
      "div",
      { class: "scheda" },
      el("h1", {}, "Password dimenticata"),
      el("p", {}, "La password principale non si può recuperare: è lei che cifra i dati, e non è salvata da nessuna parte. È proprio questo che li rende sicuri."),
      el("p", {}, "Se hai un backup cifrato di cui ricordi la password, puoi cancellare l'archivio e ripristinarlo. Altrimenti puoi solo cancellare tutto e ricominciare, reimportando il tuo file di testo."),
      el("button", { class: "secondario largo", onclick: vistaBlocco }, "‹ Torna indietro e riprova"),
      el(
        "button",
        {
          class: "pericolo largo",
          onclick: async () => {
            const ok = await dialogo({
              titolo: "Cancellare tutto?",
              testo: "Tutte le voci salvate su questo dispositivo verranno eliminate per sempre. Scrivi CANCELLA per confermare.",
              campo: { segnaposto: "CANCELLA" },
              conferma: "Cancella tutto",
              pericolo: true,
            });
            if (ok && ok.trim().toUpperCase() === "CANCELLA") {
              localStorage.removeItem(chiaveArchivio());
              vistaBlocco();
            }
          },
        },
        "Cancella tutto e ricomincia"
      )
    )
  );
}

function vistaBenvenuto() {
  const pw1 = el("input", { type: "password", autocomplete: "new-password", placeholder: "Password principale", "aria-label": "Password principale" });
  const pw2 = el("input", { type: "password", autocomplete: "new-password", placeholder: "Ripeti la password", "aria-label": "Ripeti la password" });
  const errore = el("p", { class: "errore", role: "alert" });
  const bottone = el("button", { class: "primario largo", type: "submit" }, "Crea l'archivio");
  mostra(
    el(
      "form",
      {
        class: "scheda blocco",
        onsubmit: async (ev) => {
          ev.preventDefault();
          errore.textContent = "";
          if (pw1.value.length < 8) return (errore.textContent = "Usa almeno 8 caratteri.");
          if (pw1.value !== pw2.value) return (errore.textContent = "Le due password non coincidono.");
          bottone.disabled = true;
          bottone.textContent = "Creo…";
          S.c = await Cripto.nuovaChiave(pw1.value);
          S.dati = { voci: [] };
          await salva();
          pw1.value = pw2.value = "";
          sblocca(S.c, S.dati);
        },
      },
      el("div", { class: "lucchetto", "aria-hidden": "true" }, "🔐"),
      el("h1", {}, "Benvenuto in Stralci"),
      el("p", {}, "Scegli una password principale: è l'unica che dovrai ricordare. Cifra tutti i dati, che restano solo su questo dispositivo."),
      el("p", { class: "attenzione" }, "Se la dimentichi, i dati non si possono recuperare. Scrivila in un posto sicuro."),
      pw1,
      pw2,
      errore,
      bottone,
      el("button", { type: "button", class: "collegamento", onclick: cambiaProfilo }, "‹ Scegli un altro profilo")
    )
  );
}

async function leggiBackup() {
  const f = await scegliFile(".json,application/json");
  if (!f) return null;
  try {
    const p = JSON.parse(await leggiTestoFile(f));
    if (Cripto.pacchettoValido(p)) return p;
  } catch {}
  avviso("Questo non è un backup di Stralci.");
  return null;
}

async function apriBackup(p, chiaveAttuale, profiloDestinazione = S.profiloNome, identitaDestinazione = S.profiloIdentita) {
  const etichetta = typeof p.profilo === "string" ? p.profilo.trim() : "";
  const identitaCorrisponde = !!p.profiloId && !!identitaDestinazione && p.profiloId === identitaDestinazione;
  if (!identitaCorrisponde) {
    const testo = !etichetta
      ? "Questo backup precedente non riporta il nome né il codice del profilo. Verifica che appartenga all'archivio selezionato."
      : "Backup etichettato «" + etichetta + "»" + (profiloDestinazione && etichetta.toLocaleLowerCase("it") !== profiloDestinazione.toLocaleLowerCase("it") ? ", mentre è selezionato «" + profiloDestinazione + "»" : "") + (p.profiloId ? ". Il codice profilo è diverso" : ". Il backup non contiene il codice profilo") + ". Importa solo se vuoi davvero unire quei dati in questo archivio.";
    const ok = await dialogo({ titolo: "Controlla il profilo del backup", testo, conferma: "Continua comunque" });
    if (!ok) return null;
  }
  if (chiaveAttuale && S.c && p.sale === S.c.sale) {
    try {
      return { dati: await Cripto.decifra(p, S.c.chiave), chiave: S.c.chiave };
    } catch {}
  }
  for (;;) {
    const pw = await dialogo({
      titolo: "Password del backup",
      testo: "Scrivi la password principale con cui è stato creato il backup.",
      campo: { tipo: "password" },
      conferma: "Apri",
    });
    if (pw == null) return null;
    try {
      const chiave = await Cripto.chiavePer(pw, p);
      return { dati: await Cripto.decifra(p, chiave), chiave };
    } catch {
      avviso("Password sbagliata.");
    }
  }
}

async function ripristinaSuNuovo() {
  const p = await leggiBackup();
  if (!p) return;
  const nome = await dialogo({ titolo: "Nome del profilo", testo: p.profilo ? "Etichetta nel backup: " + p.profilo : "Scegli un nome per riconoscere questo archivio.", campo: { segnaposto: p.profilo || "Es. Antonio" }, conferma: "Continua" });
  if (nome == null) return;
  const pulito = nomeProfiloValido(nome);
  if (!pulito) return avviso("Nome vuoto, troppo lungo o già usato.");
  const r = await apriBackup(p, false, pulito, p.profiloId || null);
  if (!r) return;
  const profilo = { id: nuovoId(), identita: p.profiloId || nuovoId(), nome: pulito };
  S.profili.push(profilo);
  try { salvaProfili(); } catch { S.profili.pop(); return avviso("Non riesco a salvare il profilo in questo browser."); }
  S.profiloId = profilo.id;
  S.profiloIdentita = profilo.identita;
  S.profiloNome = profilo.nome;
  aggiornaProfiloTestata();
  // L'archivio ripristinato usa la stessa password del backup.
  S.c = { chiave: r.chiave, sale: p.sale, iter: p.iter };
  S.dati = pulisciDati(r.dati);
  await salva();
  avviso(S.dati.voci.length + " voci ripristinate");
  sblocca(S.c, S.dati);
}

// ---------- elenco ----------

function vistaLista() {
  if (!S.dati.voci.length) {
    return mostra(
      el(
        "div",
        { class: "scheda vuota" },
        el("h1", {}, "Archivio vuoto"),
        el("p", {}, "Puoi importare il tuo file di testo con le password, oppure aggiungere le voci una alla volta."),
        el("button", { class: "primario largo", onclick: () => vai("importa") }, "Importa file di testo"),
        el("button", { class: "secondario largo", onclick: () => vai("modifica") }, "＋ Aggiungi una voce"),
        el("button", { class: "secondario largo", onclick: () => importaBackup() }, "Importa backup cifrato")
      )
    );
  }
  const cerca = el("input", {
    type: "search",
    class: "cerca",
    placeholder: "Cerca…",
    value: S.filtro,
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-label": "Cerca",
  });
  const conta = el("p", { class: "conta" });
  const elenco = el("ul", { class: "elenco" });
  let trovate = [];
  function aggiorna() {
    S.filtro = cerca.value;
    const q = semplifica(S.filtro.trim());
    trovate = ordinate().filter((v) => !q || testoRicerca(v).includes(q));
    conta.textContent = q ? trovate.length + " su " + S.dati.voci.length : S.dati.voci.length + " voci";
    elenco.replaceChildren(
      ...trovate.map((v) =>
        el(
          "li",
          {},
          el(
            "button",
            { class: "riga", onclick: () => vai("voce", v.id) },
            el("span", { class: "iniziale", "aria-hidden": "true" }, (v.titolo[0] || "?").toUpperCase()),
            el("span", { class: "testi" }, el("span", { class: "nome" }, v.titolo), el("span", { class: "sotto" }, v.utente || v.sito || ""))
          )
        )
      )
    );
  }
  cerca.addEventListener("input", aggiorna);
  cerca.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && trovate.length === 1) vai("voce", trovate[0].id);
  });
  aggiorna();
  mostra(
    el("div", { class: "barra-cerca" }, cerca, conta),
    elenco,
    el("button", { class: "fab", title: "Aggiungi una voce", "aria-label": "Aggiungi una voce", onclick: () => vai("modifica") }, "＋")
  );
  if (!touch) cerca.focus();
}

// ---------- dettaglio ----------

function rigaCampo(etichetta, valore, segreto) {
  if (!valore) return null;
  let visibile = !segreto;
  const val = el("span", { class: "valore" + (segreto ? " segreto" : "") }, segreto ? NASCOSTO : valore);
  const occhio = segreto
    ? el(
        "button",
        {
          class: "icona",
          type: "button",
          title: "Mostra/nascondi",
          "aria-label": "Mostra " + etichetta,
          onclick: () => {
            visibile = !visibile;
            val.textContent = visibile ? valore : NASCOSTO;
            occhio.textContent = visibile ? "🙈" : "👁";
          },
        },
        "👁"
      )
    : null;
  return el(
    "div",
    { class: "campo" },
    el("div", { class: "etichetta" }, etichetta),
    el(
      "div",
      { class: "riga-valore" },
      val,
      occhio,
      el("button", { class: "icona", type: "button", title: "Copia", "aria-label": "Copia " + etichetta, onclick: () => copia(valore, etichetta) }, "📋")
    )
  );
}

function indirizzoWeb(s) {
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return "https://" + t;
  return null;
}

function vistaVoce(id) {
  const v = trova(id);
  const web = v.sito ? indirizzoWeb(v.sito) : null;
  mostra(
    indietro(),
    el(
      "div",
      { class: "scheda" },
      titoloVista(v.titolo),
      rigaCampo("Utente", v.utente, false),
      rigaCampo("Password", v.password, true),
      rigaCampo("PIN", v.pin, true),
      rigaCampo("Keypass", v.keypass, true),
      rigaCampo("Sito", v.sito, false),
      web ? el("a", { class: "apri-sito", href: web, target: "_blank", rel: "noopener noreferrer" }, "Apri il sito ↗") : null,
      v.extra.map((e) => rigaCampo(e.nome || "Campo", e.valore, e.segreto)),
      v.note ? el("div", { class: "campo" }, el("div", { class: "etichetta" }, "Note"), el("div", { class: "note" }, v.note)) : null,
      el("p", { class: "tenue piccolo" }, "Modificata il " + data(v.modificato)),
      el(
        "div",
        { class: "pulsanti" },
        el(
          "button",
          {
            class: "pericolo",
            onclick: async () => {
              if (!(await dialogo({ titolo: "Eliminare “" + v.titolo + "”?", testo: "La voce verrà eliminata da questo dispositivo.", conferma: "Elimina", pericolo: true }))) return;
              S.dati.voci = S.dati.voci.filter((x) => x.id !== id);
              await salva();
              avviso("Voce eliminata");
              history.back();
            },
          },
          "Elimina"
        ),
        el("button", { class: "primario", onclick: () => vai("modifica", id) }, "Modifica")
      )
    )
  );
}

// ---------- modifica ----------

function campoTesto(etichetta, valore, { segreto = false, multilinea = false, genera = false } = {}) {
  const input = multilinea
    ? el("textarea", { rows: 4 }, valore)
    : el("input", { type: segreto ? "password" : "text", value: valore, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const extra = [];
  if (segreto) {
    const occhio = el(
      "button",
      {
        class: "icona",
        type: "button",
        title: "Mostra/nascondi",
        onclick: () => {
          input.type = input.type === "password" ? "text" : "password";
          occhio.textContent = input.type === "password" ? "👁" : "🙈";
        },
      },
      "👁"
    );
    extra.push(occhio);
  }
  if (genera) {
    extra.push(
      el(
        "button",
        {
          class: "icona",
          type: "button",
          title: "Genera una password casuale",
          onclick: async () => {
            if (input.value && !(await dialogo({ titolo: "Sostituire la password?", testo: "La password attuale verrà sostituita con una nuova casuale.", conferma: "Sostituisci" }))) return;
            input.value = Cripto.generaPassword(16);
            input.type = "text";
          },
        },
        "🎲"
      )
    );
  }
  const nodo = el("label", { class: "campo-modifica" }, el("span", { class: "etichetta" }, etichetta), el("span", { class: "riga-valore" }, input, extra));
  return { nodo, input };
}

function vistaModifica(id) {
  const esistente = id ? trova(id) : null;
  const v = esistente ? structuredClone(esistente) : pulisciVoce({ titolo: "" });
  if (!esistente) v.titolo = "";
  const titolo = campoTesto("Nome (servizio, sito, banca…)", v.titolo);
  const utente = campoTesto("Utente", v.utente);
  const password = campoTesto("Password", v.password, { segreto: true, genera: true });
  const pin = campoTesto("PIN", v.pin, { segreto: true });
  const keypass = campoTesto("Keypass", v.keypass, { segreto: true });
  const sito = campoTesto("Sito", v.sito);
  const note = campoTesto("Note", v.note, { multilinea: true });

  const righeExtra = el("div", { class: "extra" });
  function rigaExtra(e) {
    const nome = el("input", { type: "text", value: e.nome, placeholder: "Nome campo", "aria-label": "Nome campo" });
    const valore = el("input", { type: e.segreto ? "password" : "text", value: e.valore, placeholder: "Valore", "aria-label": "Valore", autocomplete: "off" });
    const segreto = el("input", { type: "checkbox", checked: e.segreto, onchange: () => (valore.type = segreto.checked ? "password" : "text") });
    const riga = el(
      "div",
      { class: "riga-extra" },
      nome,
      valore,
      el("label", { class: "spunta", title: "Nascondi il valore" }, segreto, "segreto"),
      el("button", { class: "icona", type: "button", title: "Togli campo", onclick: () => riga.remove() }, "✕")
    );
    riga.leggi = () => ({ nome: nome.value.trim(), valore: valore.value, segreto: segreto.checked });
    return riga;
  }
  v.extra.forEach((e) => righeExtra.append(rigaExtra(e)));

  const errore = el("p", { class: "errore", role: "alert" });
  mostra(
    indietro(),
    el(
      "form",
      {
        class: "scheda",
        onsubmit: async (ev) => {
          ev.preventDefault();
          if (!titolo.input.value.trim()) {
            errore.textContent = "Dai un nome alla voce.";
            titolo.input.focus();
            return;
          }
          Object.assign(v, {
            titolo: titolo.input.value.trim(),
            utente: utente.input.value.trim(),
            password: password.input.value,
            pin: pin.input.value.trim(),
            keypass: keypass.input.value,
            sito: sito.input.value.trim(),
            note: note.input.value.trim(),
            extra: [...righeExtra.children].map((r) => r.leggi()).filter((e) => e.nome || e.valore),
            modificato: new Date().toISOString(),
          });
          if (esistente) Object.assign(esistente, v);
          else S.dati.voci.push(v);
          await salva();
          avviso("Salvato");
          if (esistente) history.back();
          else vai("voce", v.id, true);
        },
      },
      titoloVista(esistente ? "Modifica" : "Nuova voce"),
      titolo.nodo,
      utente.nodo,
      password.nodo,
      pin.nodo,
      keypass.nodo,
      sito.nodo,
      el("div", { class: "etichetta" }, "Altri campi (codice cliente, domanda segreta…)"),
      righeExtra,
      el("button", { type: "button", class: "secondario", onclick: () => righeExtra.append(rigaExtra({ nome: "", valore: "", segreto: false })) }, "＋ Aggiungi campo"),
      note.nodo,
      errore,
      el("div", { class: "pulsanti" }, el("button", { type: "button", class: "secondario", onclick: () => history.back() }, "Annulla"), el("button", { type: "submit", class: "primario" }, "Salva"))
    )
  );
  if (!esistente) titolo.input.focus();
}

// ---------- importazione file di testo ----------

function chiaveDoppione(v) {
  return semplifica(v.titolo) + "\u0000" + v.utente + "\u0000" + v.password;
}

function vistaImporta() {
  if (S.anteprima) return vistaAnteprima();
  const area = el("textarea", { rows: 8, placeholder: "…oppure incolla qui il testo", spellcheck: "false", autocapitalize: "off" });
  mostra(
    indietro(),
    el(
      "div",
      { class: "scheda" },
      titoloVista("Importa file di testo"),
      el("p", {}, "Le voci devono essere separate da una riga di trattini (_____ oppure -----). La prima riga è il nome, poi righe come “User = …”, “Password = …”, “PIN = …”."),
      el("p", { class: "tenue" }, "Il file viene letto solo qui, sul dispositivo: non viene inviato da nessuna parte."),
      el(
        "button",
        {
          class: "primario largo",
          onclick: async () => {
            const f = await scegliFile(".txt,text/plain");
            if (f) prepara(await leggiTestoFile(f));
          },
        },
        "Scegli il file .txt"
      ),
      area,
      el("button", { class: "secondario largo", onclick: () => prepara(area.value) }, "Leggi il testo incollato")
    )
  );

  function prepara(testo) {
    const lette = Testo.leggi(testo || "");
    if (!lette.length) return avviso("Non ho trovato voci in questo testo.");
    const esistenti = new Set(S.dati.voci.map(chiaveDoppione));
    S.anteprima = lette.map((r) => {
      const voce = pulisciVoce(r.voce);
      voce.extra.forEach((e) => (e.segreto = /pass|pin|pw|psw|codice|chiave|cvv|puk|segret/i.test(e.nome)));
      const doppione = esistenti.has(chiaveDoppione(voce));
      return { voce, dedotti: r.dedotti, originale: r.originale, doppione, scelta: !doppione };
    });
    area.value = "";
    vistaAnteprima();
  }
}

function vistaAnteprima() {
  const lista = S.anteprima;
  const bottone = el(
    "button",
    {
      class: "primario",
      onclick: async () => {
        const scelte = lista.filter((r) => r.scelta).map((r) => r.voce);
        S.dati.voci.push(...scelte);
        await salva();
        S.anteprima = null;
        avviso(scelte.length + " voci importate");
        vai("lista", null, true);
      },
    },
    ""
  );
  function conta() {
    const n = lista.filter((r) => r.scelta).length;
    bottone.textContent = "Importa " + n + (n === 1 ? " voce" : " voci");
    bottone.disabled = n === 0;
  }
  const doppioni = lista.filter((r) => r.doppione).length;
  const daControllare = lista.filter((r) => r.dedotti.length).length;
  mostra(
    el("button", { class: "indietro", type: "button", onclick: () => ((S.anteprima = null), vistaImporta()) }, "‹ Scegli un altro file"),
    el(
      "div",
      { class: "scheda" },
      titoloVista("Controlla prima di importare"),
      el("p", {}, "Ho trovato " + lista.length + " voci." + (doppioni ? " " + doppioni + " sono già nell'archivio e non sono selezionate." : "")),
      daControllare
        ? el("p", { class: "attenzione" }, "⚠ In " + daControllare + (daControllare === 1 ? " voce" : " voci") + " utente o password non avevano l'etichetta e li ho dedotti dall'ordine delle righe: controllali (evidenziati sotto).")
        : null,
      el("p", { class: "tenue" }, "Tocca “Testo originale” per confrontare una voce con il file."),
      el(
        "ul",
        { class: "anteprima" },
        lista.map((r) => {
          const v = r.voce;
          const presenti = [v.utente && "utente", v.password && "password", v.pin && "PIN", v.keypass && "keypass", v.sito && "sito", v.extra.length && v.extra.length + " altri campi", v.note && "note"].filter(Boolean);
          return el(
            "li",
            { class: [r.doppione && "doppione", r.dedotti.length && "dedotta"].filter(Boolean).join(" ") },
            el(
              "label",
              { class: "spunta-voce" },
              el("input", { type: "checkbox", checked: r.scelta, onchange: (e) => ((r.scelta = e.target.checked), conta()) }),
              el("span", {}, el("strong", {}, v.titolo), r.doppione ? el("span", { class: "etichetta-doppione" }, " già presente") : null, el("br"), el("span", { class: "tenue" }, v.utente || "— nessun utente —"), el("br"), el("span", { class: "tenue piccolo" }, presenti.join(" · ")),
                r.dedotti.length ? el("span", { class: "nota-dedotti" }, "⚠ " + r.dedotti.join(" e ") + (r.dedotti.length > 1 ? " dedotti" : " dedotto") + " — controlla") : null)
            ),
            el("details", {}, el("summary", {}, "Testo originale"), el("pre", {}, r.originale))
          );
        })
      ),
      el(
        "div",
        { class: "pulsanti" },
        el("button", { class: "secondario", onclick: () => ((S.anteprima = null), history.back()) }, "Annulla"),
        bottone
      )
    )
  );
  conta();
}

// ---------- backup ed esportazione ----------

async function esportaBackup() {
  const p = await Cripto.cifra(S.dati, S.c);
  p.profilo = S.profiloNome;
  p.profiloId = S.profiloIdentita;
  const nome = S.profiloNome.toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profilo";
  await scaricaFile("stralci-" + nome + "-backup-" + oggi() + ".json", JSON.stringify(p), "application/json");
}

async function importaBackup() {
  const p = await leggiBackup();
  if (!p) return;
  const r = await apriBackup(p, true);
  if (!r) return;
  const arrivate = pulisciDati(r.dati).voci;
  let nuove = 0;
  let aggiornate = 0;
  for (const v of arrivate) {
    const qui = trova(v.id);
    if (!qui) {
      S.dati.voci.push(v);
      nuove++;
    } else if (new Date(v.modificato) > new Date(qui.modificato)) {
      Object.assign(qui, v);
      aggiornate++;
    }
  }
  await salva();
  avviso(nuove + " nuove, " + aggiornate + " aggiornate");
  vai("lista", null, true);
}

async function esportaInChiaro() {
  const ok = await dialogo({
    titolo: "Esportare in chiaro?",
    testo: "Il file di testo NON è cifrato: chiunque lo apra legge tutte le password. Tienilo in un posto sicuro e cancellalo quando non serve più.",
    conferma: "Esporta lo stesso",
    pericolo: true,
  });
  if (!ok) return;
  await scaricaFile("stralci-in-chiaro-" + oggi() + ".txt", "﻿" + Testo.scrivi(ordinate()), "text/plain;charset=utf-8");
}

// ---------- opzioni ----------

function voceMenu(testo, spiegazione, azione, classe) {
  return el("button", { class: "voce-menu " + (classe || ""), onclick: azione }, el("span", { class: "nome" }, testo), spiegazione ? el("span", { class: "sotto" }, spiegazione) : null);
}

function vistaOpzioni() {
  const o = opzioni();
  const minuti = el(
    "select",
    {
      "aria-label": "Blocco automatico",
      onchange: (e) => {
        o.bloccoMinuti = Number(e.target.value);
        salvaOpzioni(o);
        avviso("Fatto");
      },
    },
    [1, 2, 5, 10, 30].map((m) => el("option", { value: m, selected: m === o.bloccoMinuti }, m + (m === 1 ? " minuto" : " minuti")))
  );
  mostra(
    indietro(),
    el(
      "div",
      { class: "scheda" },
      titoloVista("Opzioni"),
      el("p", { class: "etichetta-profilo" }, "Archivio di " + S.profiloNome),
      voceMenu("Cambia nome al profilo", "Il nome aiuta a riconoscere questo archivio; la password principale lo protegge.", async () => {
        const nuovo = await dialogo({ titolo: "Rinomina profilo", testo: "Nuovo nome (massimo 40 caratteri).", campo: { segnaposto: S.profiloNome }, conferma: "Salva" });
        if (nuovo == null) return;
        const pulito = (nuovo || "").trim().replace(/\s+/g, " ");
        if (!pulito || pulito.length > 40 || S.profili.some((p) => p.id !== S.profiloId && p.nome.toLocaleLowerCase("it") === pulito.toLocaleLowerCase("it"))) return avviso("Nome vuoto, troppo lungo o già usato.");
        const profilo = S.profili.find((p) => p.id === S.profiloId);
        profilo.nome = pulito; S.profiloNome = pulito; salvaProfili(); aggiornaProfiloTestata();
        avviso("Profilo rinominato"); vistaOpzioni();
      }),
      voceMenu("Cambia profilo", "Blocca questo archivio e torna alla scelta della persona.", cambiaProfilo),
      el("h2", {}, "Backup"),
      voceMenu("Esporta backup cifrato", "File .json protetto dalla password principale. Usalo per non perdere i dati e per passarli su un altro dispositivo.", esportaBackup),
      voceMenu("Importa backup cifrato", "Aggiunge le voci di un backup a quelle già presenti.", importaBackup),
      el("h2", {}, "File di testo"),
      voceMenu("Importa file di testo", "Il tuo file con le voci separate da _____ o -----.", () => vai("importa")),
      voceMenu("Esporta in chiaro (.txt)", "Leggibile da chiunque: solo per stampare o archiviare in un posto sicuro.", esportaInChiaro, "avvertimento"),
      el("h2", {}, "Sicurezza"),
      voceMenu("Cambia password principale", null, () => vai("cambia")),
      el("label", { class: "voce-menu" }, el("span", { class: "nome" }, "Blocco automatico dopo"), minuti),
      voceMenu(
        "Cancella tutti i dati da questo dispositivo",
        "Prima esporta un backup!",
        async () => {
          const ok = await dialogo({
            titolo: "Cancellare tutto?",
            testo: "Tutte le " + S.dati.voci.length + " voci verranno eliminate da questo dispositivo. Scrivi CANCELLA per confermare.",
            campo: { segnaposto: "CANCELLA" },
            conferma: "Cancella tutto",
            pericolo: true,
          });
          if (ok && ok.trim().toUpperCase() === "CANCELLA") {
            localStorage.removeItem(chiaveArchivio());
            blocca();
          }
        },
        "pericolo-testo"
      ),
      el("h2", {}, "Informazioni"),
      el("p", { class: "tenue" }, "Stralci " + VERSIONE_APP + " · aggiornamento " + DATA_VERSIONE_APP + " — di Antonio Chitano."),
      el("p", { class: "tenue" }, "I dati restano solo su questo dispositivo, cifrati con AES-256. Niente viene inviato in rete. Ogni dispositivo ha il suo archivio: per copiarlo su un altro usa il backup cifrato.")
    )
  );
}

function vistaCambiaPassword() {
  const vecchia = el("input", { type: "password", autocomplete: "current-password", placeholder: "Password attuale" });
  const nuova1 = el("input", { type: "password", autocomplete: "new-password", placeholder: "Nuova password" });
  const nuova2 = el("input", { type: "password", autocomplete: "new-password", placeholder: "Ripeti la nuova password" });
  const errore = el("p", { class: "errore", role: "alert" });
  mostra(
    indietro(),
    el(
      "form",
      {
        class: "scheda",
        onsubmit: async (ev) => {
          ev.preventDefault();
          errore.textContent = "";
          const p = archivioSalvato();
          try {
            await Cripto.decifra(p, await Cripto.chiavePer(vecchia.value, p));
          } catch {
            return (errore.textContent = "La password attuale è sbagliata.");
          }
          if (nuova1.value.length < 8) return (errore.textContent = "Usa almeno 8 caratteri.");
          if (nuova1.value !== nuova2.value) return (errore.textContent = "Le due nuove password non coincidono.");
          S.c = await Cripto.nuovaChiave(nuova1.value);
          await salva();
          avviso("Password principale cambiata");
          history.back();
        },
      },
      titoloVista("Cambia password principale"),
      el("p", { class: "tenue" }, "I backup fatti prima restano protetti dalla vecchia password."),
      vecchia,
      nuova1,
      nuova2,
      errore,
      el("button", { class: "primario largo", type: "submit" }, "Cambia password")
    )
  );
}

// ---------- avvio ----------

document.getElementById("blocca").addEventListener("click", blocca);
document.getElementById("opzioni").addEventListener("click", () => S.c && vai("opzioni"));
document.getElementById("marchio").addEventListener("click", () => S.c && vai("lista"));

for (const t of ["pointerdown", "keydown", "input", "scroll"]) {
  addEventListener(t, () => (S.ultima = Date.now()), { passive: true, capture: true });
}
setInterval(() => {
  if (S.c && Date.now() - S.ultima > opzioni().bloccoMinuti * 60000) blocca();
}, 10000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) S.nascosto = Date.now();
  else if (S.c && S.nascosto && Date.now() - S.nascosto > 60000) blocca();
});

if (!window.crypto || !crypto.subtle) {
  mostra(el("div", { class: "scheda" }, el("h1", {}, "Browser non adatto"), el("p", {}, "Stralci deve essere aperto da un indirizzo https:// (o da localhost) con un browser recente.")));
} else {
  inizializzaProfili();
  vistaProfili();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
