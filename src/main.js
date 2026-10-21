// 1. IMPORTAZIONI DI IONIC
import '@ionic/core/css/ionic.bundle.css';
import { defineCustomElements as defineIonic } from '@ionic/core/loader';
defineIonic(window);

// 2. IMPORTAZIONI PER CAPACITOR E SQLITE
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';

// Variabile globale per mantenere il riferimento al database aperto
let db;

// --- FUNZIONE PER INIZIALIZZARE IL DATABASE SQLITE ---
async function initDatabase() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const platform = Capacitor.getPlatform();

  // Se siamo nel browser del PC ("web"), creiamo l'elemento jeep-sqlite
  if (platform === 'web') {
    defineJeepSqlite(window);
    const jeepEl = document.createElement('jeep-sqlite');
    document.body.appendChild(jeepEl);
    await customElements.whenDefined('jeep-sqlite');
    await sqlite.initWebStore();
  }

  // Creiamo o apriamo la connessione al database chiamato "miodb"
  db = await sqlite.createConnection('miodb', false, 'no-encryption', 1, false);
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
  const risultato = await db.query('SELECT * FROM utenti ORDER BY id DESC;');
  const listaHtml = document.getElementById('lista-utenti-db');
  listaHtml.innerHTML = '';

  if (risultato.values && risultato.values.length > 0) {
    risultato.values.forEach(utente => {
      const item = document.createElement('ion-item');
      item.innerHTML = `<ion-label>#${utente.id} - <strong>${utente.nome}</strong></ion-label>`;
      listaHtml.appendChild(item);
    });
  } else {
    listaHtml.innerHTML = '<ion-item><ion-label>Nessun utente nel DB</ion-label></ion-item>';
  }
}

// --- FUNZIONE PER SCRIVERE NEL DATABASE (INSERT) ---
async function aggiungiUtenteAlDB(nome) {
  await db.run('INSERT INTO utenti (nome) VALUES (?);', [nome]);
  
  // Se siamo sul browser del PC, dobbiamo forzare il salvataggio su disco locale
  if (Capacitor.getPlatform() === 'web') {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.saveToStore('miodb');
  }
  
  await leggiUtentiDalDB();
}

// --- FUNZIONE PER CHIAMATA AJAX A UN'API ESTERNA ---
async function chiamaApiEsterna() {
  const listaApi = document.getElementById('lista-post-api');
  listaApi.innerHTML = '<ion-item><ion-label>Caricamento in corso...</ion-label></ion-item>';

  try {
    // Chiamata AJAX (GET) usando la Fetch API nativa di JavaScript
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5');
    
    if (!response.ok) {
      throw new Error('Errore nella risposta del server');
    }

    const dati = await response.json();
    listaApi.innerHTML = '';

    dati.forEach(post => {
      const item = document.createElement('ion-item');
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
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Avvia SQLite
  try {
    await initDatabase();
  } catch (err) {
    console.error('Errore inizializzazione DB:', err);
  }

  // 2. Gestione click nel Menu Laterale per cambiare schermata
  const sezioneDb = document.getElementById('sezione-db');
  const sezioneApi = document.getElementById('sezione-api');
  const pageTitle = document.getElementById('page-title');

  document.getElementById('menu-db').addEventListener('click', () => {
    sezioneDb.style.display = 'block';
    sezioneApi.style.display = 'none';
    pageTitle.innerText = 'Database SQLite';
  });

  document.getElementById('menu-api').addEventListener('click', () => {
    sezioneDb.style.display = 'none';
    sezioneApi.style.display = 'block';
    pageTitle.innerText = 'Chiamata API (AJAX)';
  });

  // 3. Gestione bottone "Salva nel Database"
  document.getElementById('btn-salva-db').addEventListener('click', async () => {
    const inputNome = document.getElementById('input-nome');
    const valore = inputNome.value ? inputNome.value.trim() : '';
    
    if (valore !== '') {
      await aggiungiUtenteAlDB(valore);
      inputNome.value = ''; // Svuota il campo
    } else {
      alert('Inserisci un nome valido!');
    }
  });

  // 4. Gestione bottone "Scarica Post dal Server" (AJAX)
  document.getElementById('btn-carica-api').addEventListener('click', () => {
    chiamaApiEsterna();
  });
});