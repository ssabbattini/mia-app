// 1. IMPORTAZIONI DI IONIC
import "@ionic/core/css/ionic.bundle.css";
import { defineCustomElements as defineIonic } from "@ionic/core/loader";
defineIonic(window);

// 2. IMPORTAZIONI PER CAPACITOR E SQLITE
import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { defineCustomElements as defineJeepSqlite } from "jeep-sqlite/loader";

import { CapacitorUpdater } from "@capgo/capacitor-updater";

// Diciamo al plugin che l'app attuale è partita correttamente (evita il rollback di sicurezza)
CapacitorUpdater.notifyAppReady();

async function controllaAggiornamenti() {
  // 1. CONTROLLO FONDAMENTALE: Se siamo nel browser del PC, ci fermiamo qui!
  if (!Capacitor.isNativePlatform()) {
    console.log(
      "Siamo nel browser (web): salto il controllo aggiornamenti OTA.",
    );
    return;
  }

  try {
    // Avvisa il plugin nativo che l'app è partita correttamente
    await CapacitorUpdater.notifyAppReady();

    // 2. Chiami il tuo server per leggere il JSON
    const res = await fetch("https://abaco.eber.org/versione.json");
    const datiServer = await res.json();

    const versioneAttuale = localStorage.getItem("versione_app") || "1.0.0";

    if (datiServer.version !== versioneAttuale) {
      console.log("Nuova versione trovata:", datiServer.version);
      alert("Nuova versione " + datiServer.version + " trovata!");

      // 3. Scarica lo ZIP (questo funziona SOLO sull'APK Android / app iOS!)
      const nuovaVersione = await CapacitorUpdater.download({
        url: datiServer.url,
        version: datiServer.version,
        checksum: datiServer.checksum
      });

      // 4. Salva la versione e riavvia l'app con i nuovi file
      localStorage.setItem("versione_app", datiServer.version);
      await CapacitorUpdater.set(nuovaVersione);

      alert("Riavvio");
    }
  } catch (err) {
    console.error("Errore durante l'aggiornamento:", err);
  }
}

// --- SISTEMA DI INTERCETTAZIONE CONSOLE PER MOBILE ---
function inizializzaConsoleMobile() {
  const contenitoreLogs = document.getElementById('contenitore-logs');

  // Salviamo le funzioni originali del browser per non perderle
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  function scriviLogSuSchermo(tipo, args) {
    if (!contenitoreLogs) return;

    const ora = new Date().toLocaleTimeString();
    
    // Convertiamo gli argomenti in testo (anche se passi Oggetti o Errori!)
    const messaggio = Array.from(args).map(arg => {
      if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg, null, 2); } catch (e) { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    // Scegliamo il colore in base alla gravità
    let colore = '#4ec9b0'; // Verde acqua per i normali console.log
    if (tipo === 'WARN') colore = '#dcdcaa'; // Giallo per i warning
    if (tipo === 'ERROR') colore = '#f44747'; // Rosso acceso per gli errori

    const riga = document.createElement('div');
    riga.style.borderBottom = '1px solid #333';
    riga.style.padding = '6px 0';
    riga.style.color = colore;
    riga.innerHTML = `<small style="color: #888;">[${ora}] [${tipo}]</small><br><pre style="margin: 2px 0; white-space: pre-wrap; font-family: inherit;">${messaggio}</pre>`;

    contenitoreLogs.appendChild(riga);
    // Scorri automaticamente verso il basso all'ultimo messaggio
    contenitoreLogs.scrollTop = contenitoreLogs.scrollHeight;
  }

  // Sovrascriviamo console.log, warn ed error
  console.log = function (...args) {
    originalLog.apply(console, args);
    scriviLogSuSchermo('INFO', args);
  };

  console.warn = function (...args) {
    originalWarn.apply(console, args);
    scriviLogSuSchermo('WARN', args);
  };

  console.error = function (...args) {
    originalError.apply(console, args);
    scriviLogSuSchermo('ERROR', args);
  };

  // Intercettiamo anche eventuali errori critici JS non gestiti o Promise fallite!
  window.addEventListener('error', (event) => {
    scriviLogSuSchermo('ERROR', [`Errore Globale: ${event.message} (${event.filename}:${event.lineno})`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    scriviLogSuSchermo('ERROR', [`Promise fallita:`, event.reason]);
  });
}

// Variabile globale per mantenere il riferimento al database aperto
let db;

// --- FUNZIONE PER INIZIALIZZARE IL DATABASE SQLITE ---
async function initDatabase() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const platform = Capacitor.getPlatform();

  // Se siamo nel browser del PC ("web"), creiamo l'elemento jeep-sqlite
  if (platform === "web") {
    defineJeepSqlite(window);
    const jeepEl = document.createElement("jeep-sqlite");
    document.body.appendChild(jeepEl);
    await customElements.whenDefined("jeep-sqlite");
    await sqlite.initWebStore();
  }

  // Creiamo o apriamo la connessione al database chiamato "miodb"
  db = await sqlite.createConnection("miodb", false, "no-encryption", 1, false);
  await db.open();

  // Creiamo una tabella "utenti" se non esiste già
  const queryCreazione = `
    CREATE TABLE IF NOT EXISTS utenti (
      id INTEGER PRIMARY KEY NOT NULL,
      nome TEXT NOT NULL
    );
  `;
  await db.execute(queryCreazione);

  // Carichiamo subito la lista utenti all'avvio
  await leggiUtentiDalDB();
}

// --- FUNZIONE PER LEGGERE DAL DATABASE (SELECT) ---
async function leggiUtentiDalDB() {
  const risultato = await db.query("SELECT * FROM utenti ORDER BY id DESC;");
  const listaHtml = document.getElementById("lista-utenti-db");
  listaHtml.innerHTML = "";

  if (risultato.values && risultato.values.length > 0) {
    risultato.values.forEach((utente) => {
      const item = document.createElement("ion-item");
      item.innerHTML = `<ion-label>#${utente.id} - <strong>${utente.nome}</strong></ion-label>`;
      listaHtml.appendChild(item);
    });
  } else {
    listaHtml.innerHTML =
      "<ion-item><ion-label>Nessun utente nel DB</ion-label></ion-item>";
  }
}

// --- FUNZIONE PER SCRIVERE NEL DATABASE (INSERT) ---
async function aggiungiUtenteAlDB(nome) {
  await db.run("INSERT INTO utenti (nome) VALUES (?);", [nome]);

  // Se siamo sul browser del PC, dobbiamo forzare il salvataggio su disco locale
  if (Capacitor.getPlatform() === "web") {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.saveToStore("miodb");
  }

  await leggiUtentiDalDB();
}

// --- FUNZIONE PER CHIAMATA AJAX A UN'API ESTERNA ---
async function chiamaApiEsterna() {
  const listaApi = document.getElementById("lista-post-api");
  listaApi.innerHTML =
    "<ion-item><ion-label>Caricamento in corso...</ion-label></ion-item>";

  try {
    // Chiamata AJAX (GET) usando la Fetch API nativa di JavaScript
    const response = await fetch(
      "https://jsonplaceholder.typicode.com/posts?_limit=5",
    );

    if (!response.ok) {
      throw new Error("Errore nella risposta del server");
    }

    const dati = await response.json();
    listaApi.innerHTML = "";

    dati.forEach((post) => {
      const item = document.createElement("ion-item");
      item.innerHTML = `
        <ion-label class="ion-text-wrap">
          <h2><strong>${post.title}</strong></h2>
          <p>${post.body}</p>
        </ion-label>
      `;
      listaApi.appendChild(item);
    });
  } catch (errore) {
    listaApi.innerHTML = `<ion-item color="danger"><ion-label>Errore AJAX: ${errore.message}</ion-label></ion-item>`;
  }
}

// --- AVVIO DELL'APPLICAZIONE E GESTIONE EVENTI ---
window.addEventListener("DOMContentLoaded", async () => {
    // 0. ATTIVA SUBITO LA CONSOLE SU SCHERMO!
  inizializzaConsoleMobile();
  console.log('App avviata! Piattaforma:', Capacitor.getPlatform());

  // 1. Avvia SQLite
  try {
    await initDatabase();
  } catch (err) {
    console.error("Errore inizializzazione DB:", err);
  }

  // 2. Gestione click nel Menu Laterale per cambiare schermata
  const sezioneDb = document.getElementById("sezione-db");
  const sezioneApi = document.getElementById("sezione-api");
  const sezioneLogs = document.getElementById('sezione-logs');
  const pageTitle = document.getElementById("page-title");

   document.getElementById('menu-db').addEventListener('click', () => {
    sezioneDb.style.display = 'block';
    sezioneApi.style.display = 'none';
    sezioneLogs.style.display = 'none';
    pageTitle.innerText = 'Database SQLite';
  });

  document.getElementById('menu-api').addEventListener('click', () => {
    sezioneDb.style.display = 'none';
    sezioneApi.style.display = 'block';
    sezioneLogs.style.display = 'none';
    pageTitle.innerText = 'Chiamata API (AJAX)';
  });

  document.getElementById('menu-logs').addEventListener('click', () => {
    sezioneDb.style.display = 'none';
    sezioneApi.style.display = 'none';
    sezioneLogs.style.display = 'block';
    pageTitle.innerText = 'Console di Debug';
  });

  document.getElementById('btn-pulisci-logs').addEventListener('click', () => {
    document.getElementById('contenitore-logs').innerHTML = '';
  });

  document.getElementById("menu-update").addEventListener("click", async () => {
    await controllaAggiornamenti();
  });

  // 3. Gestione bottone "Salva nel Database"
  document
    .getElementById("btn-salva-db")
    .addEventListener("click", async () => {
      const inputNome = document.getElementById("input-nome");
      const valore = inputNome.value ? inputNome.value.trim() : "";

      if (valore !== "") {
        await aggiungiUtenteAlDB(valore);
        inputNome.value = ""; // Svuota il campo
      } else {
        alert("Inserisci un nome valido!");
      }
    });

  // 4. Gestione bottone "Scarica Post dal Server" (AJAX)
  document.getElementById("btn-carica-api").addEventListener("click", () => {
    chiamaApiEsterna();
  });
});
