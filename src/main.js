// 1. Importa gli stili CSS obbligatori di Ionic
import '@ionic/core/css/ionic.bundle.css';

// 2. Inizializza i Web Components di Ionic
import { defineCustomElements } from '@ionic/core/loader';
defineCustomElements(window);

// 3. Il tuo codice JavaScript puro
document.addEventListener('DOMContentLoaded', () => {
  const bottone = document.getElementById('mio-bottone');
  
  bottone.addEventListener('click', () => {
    alert('Hai cliccato il bottone Ionic!');
  });
});