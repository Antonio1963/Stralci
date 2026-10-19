// Cifratura dell'archivio: AES-GCM 256 bit con chiave ricavata dalla password
// principale (PBKDF2-SHA256). Usa solo la crittografia integrata nel browser.
const Cripto = (() => {
  const ITERAZIONI = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function aBase64(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function daBase64(str) {
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function casuali(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  async function derivaChiave(password, sale, iterazioni) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: sale, iterations: iterazioni, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Crea una chiave nuova (sale nuovo) a partire dalla password.
  async function nuovaChiave(password) {
    const sale = casuali(16);
    const chiave = await derivaChiave(password, sale, ITERAZIONI);
    return { chiave, sale: aBase64(sale), iter: ITERAZIONI };
  }

  // Ricava la chiave per un archivio già cifrato (stesso sale e iterazioni).
  async function chiavePer(password, pacchetto) {
    return derivaChiave(password, daBase64(pacchetto.sale), pacchetto.iter);
  }

  async function cifra(oggetto, c) {
    const iv = casuali(12);
    const dati = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, c.chiave, enc.encode(JSON.stringify(oggetto)));
    return { app: "Stralci", v: 1, sale: c.sale, iter: c.iter, iv: aBase64(iv), dati: aBase64(dati) };
  }

  // Lancia un errore se la password è sbagliata o il file è rovinato.
  async function decifra(pacchetto, chiave) {
    const testo = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: daBase64(pacchetto.iv) },
      chiave,
      daBase64(pacchetto.dati)
    );
    return JSON.parse(dec.decode(testo));
  }

  function pacchettoValido(p) {
    return p && typeof p === "object" && p.app === "Stralci" && p.sale && p.iv && p.dati && p.iter;
  }

  // Password casuale per il generatore.
  function generaPassword(lunghezza = 16, simboli = true) {
    const lettere = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const segni = "!@#$%&*?-_+=";
    const alfabeto = simboli ? lettere + segni : lettere;
    const out = [];
    const limite = 256 - (256 % alfabeto.length);
    while (out.length < lunghezza) {
      for (const b of casuali(lunghezza * 2)) {
        if (b < limite && out.length < lunghezza) out.push(alfabeto[b % alfabeto.length]);
      }
    }
    return out.join("");
  }

  return { nuovaChiave, chiavePer, cifra, decifra, pacchettoValido, generaPassword };
})();
