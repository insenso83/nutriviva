# NutriViva: beta con 3 tester e pubblicazione online

L'app dieta NutriViva viene pubblicata a un indirizzo fisso, sempre online, e resa installabile sul telefono come un'app vera direttamente dal browser.
I 3 tester la usano dalla versione pubblicata e inviano i loro commenti con un pulsante dentro l'app; il proprietario li legge in una pagina admin.

## A chi serve
- **Il proprietario dell'app**: pubblica la beta, condivide il link, legge i commenti e decide cosa migliorare prima di aprirla a tutti.
- **I 3 beta tester**: si registrano da soli, installano l'app sul telefono e la usano ogni giorno come utenti normali.

## Funzionalità ed esperienza
- **Pubblicazione online**: l'app ha un indirizzo pubblico permanente, attivo 24/7. Il primo deploy costa 50 crediti al mese per app. Si può collegare un dominio personalizzato. Ogni modifica futura richiede una nuova pubblicazione per arrivare online.
- **Notifiche e controlli programmati attivi in produzione**: promemoria di pasti e integratori, avvisi delle scorte, riepilogo della domenica.
- **Registrazione libera**: i tester si iscrivono con email e password. Non servono account creati in anticipo.
- **Pulsante "Invia feedback"** sempre visibile dentro l'app:
  - il tester sceglie un tipo (Problema, Suggerimento, Mi piace)
  - scrive un messaggio e può allegare uno screenshot
  - l'app registra in automatico la sezione in cui si trovava, il dispositivo e la data
  - dopo l'invio compare una conferma
- **Pagina admin dei feedback**, visibile solo all'account admin:
  - elenco dei commenti con nome del tester, tipo, sezione, data e screenshot
  - filtro per tipo e per tester
  - ogni commento si segna come "Da fare / In corso / Risolto"
  - conteggio dei tester iscritti e della loro ultima attività
- **App installabile "come vera"**:
  - icona e nome curati, schermata di avvio con logo
  - apertura a schermo intero, senza barra del browser
  - colori della barra di stato coordinati
  - scorciatoie rapide dall'icona (es. Piano di oggi, Registra peso, Foto pasto)
- **Guida all'installazione dentro l'app**:
  - pagina "Installa l'app" con istruzioni passo-passo distinte per iPhone (Safari → Condividi → Aggiungi a Home) e per Android (Chrome → Installa app)
  - su Android, dove il browser lo permette, c'è un pulsante "Installa" diretto
  - un invito discreto a installare, mostrato al primo accesso da telefono
  - non riappare dopo l'installazione o se viene chiuso
  - su iPhone viene spiegato che le notifiche funzionano solo dopo aver aggiunto l'app alla Home (iOS 16.4 o successivo)
- **Pagina "Novità della beta"**: breve elenco delle funzioni da provare, con un invito a lasciare feedback.
- **"Ricomincia da zero"**: è un pulsante nella scheda Profilo, accanto a "Salva modifiche".
  - Cancella tutti i dati dell'utente come se si iscrivesse per la prima volta: profilo, obiettivi, patologie, piani alimentari, frigo, lista spesa, pesi, centimetri, peso obiettivo, foto progressi, diario foto, pasti segnati, acqua, umore, integratori e scorte, promemoria e notifiche, calendario della dieta.
  - Restano solo email e password: l'utente rimane collegato e viene portato all'onboarding.
  - Prima di cancellare chiede conferma in una finestra di avviso. Spiega che l'operazione non si può annullare e chiede di scrivere la parola **AZZERA**.
  - I prodotti memorizzati con il codice a barre restano nel database comune dell'app, perché servono anche agli altri utenti.
- **"Elimina account"**: è un'opzione separata, in fondo alla scheda Profilo, in rosso.
  - Cancella tutti i dati come "Ricomincia da zero" e in più l'account stesso, con email e password.
  - Chiede conferma con la password dell'utente.
  - Dopo l'eliminazione l'utente esce e torna alla pagina di accesso. La stessa email si può riutilizzare per una nuova iscrizione.
  - L'account admin non può essere eliminato da qui.
- **Accesso da cellulare**: su schermi piccoli la scheda Profilo si apre anche da un'icona utente fissa in alto a destra, accanto al nome, senza dover scorrere la barra delle schede. "Ricomincia da zero" ed "Elimina account" sono a larghezza piena e ben visibili a fondo pagina.

## Percorso dell'utente
1. Il proprietario pubblica l'app e manda il link ai 3 tester.
2. Il tester apre il link dal telefono, si registra e completa l'onboarding.
3. Compare l'invito "Installa NutriViva sul telefono" con la guida per il suo dispositivo.
4. Il tester installa l'app, attiva le notifiche e usa la dieta ogni giorno.
5. Quando trova un problema o ha un'idea, preme "Invia feedback", scrive e allega uno screenshot.
6. Il proprietario apre la pagina admin, legge i commenti, li segna come risolti e chiede le correzioni.
7. Dopo ogni gruppo di correzioni l'app viene ripubblicata e i tester vedono subito la versione aggiornata.
8. Se un tester vuole rifare tutto, preme "Ricomincia da zero" nel Profilo, conferma scrivendo AZZERA e riparte dall'onboarding. Se vuole lasciare la beta, usa "Elimina account".

## Aspetto e sensazione
- Stesso stile verde e naturale dell'app attuale.
- Il pulsante feedback è piccolo e fluttuante, in basso a destra, e non copre i contenuti.
- La guida all'installazione è illustrata con passaggi numerati e icone, chiara anche per chi non è pratico.
- Una volta installata, l'app si apre con la schermata di avvio col logo e senza elementi del browser, come un'app nativa.

## Fasi di realizzazione
**Fase 1 (MVP, da realizzare ora)**
- Pulsante "Invia feedback" con screenshot e pagina admin dei feedback con stati e filtri.
- App installabile migliorata: icone, schermata di avvio, schermo intero, scorciatoie.
- Guida all'installazione per iPhone e Android, invito all'installazione e pagina "Novità della beta".
- "Ricomincia da zero" ed "Elimina account" nella scheda Profilo, con le relative conferme.
- Controllo di prontezza alla pubblicazione e pubblicazione online, con verifica di notifiche e controlli programmati in produzione.

**Fase 2**
- Funzionamento di base senza connessione (piano del giorno e frigo consultabili offline).
- Email di benvenuto ai nuovi iscritti e avviso al proprietario per ogni nuovo feedback.
- Dominio personalizzato (es. nutriviva.it).

**Fase 3**
- Preparazione dei pacchetti per Google Play e App Store tramite uno strumento esterno di conversione (es. PWABuilder). Richiede un account sviluppatore aperto dal proprietario: Google 25 $ una tantum, Apple 99 $/anno. Prevede anche la revisione degli store, che per le app di salute può chiedere avvisi medici e una privacy policy.
- Privacy policy e termini d'uso, con un avviso che i consigli non sostituiscono il medico o il nutrizionista.

## Ipotesi
- Emergent non crea app native per App Store e Google Play. Per ora l'app si installa dal browser, che offre icona sul telefono, schermo intero e notifiche.
- Le iscrizioni restano aperte a chiunque abbia il link. Non c'è un codice d'invito: con 3 tester il rischio è basso.
- Solo l'account admin esistente (admin@nutriviva.it) vede la pagina dei feedback. La password admin va cambiata prima di condividere il link.
- I dati dei tester stanno nel database della versione pubblicata. Gli account di prova creati durante lo sviluppo (es. marco@test.it) potrebbero non esistere online: andranno ricreati se servono.
- Le notifiche push su iPhone arrivano solo con l'app aggiunta alla Home e iOS 16.4 o successivo. Su Android funzionano anche dal browser.
- I promemoria restano arrotondati al quarto d'ora.
- Lo screenshot nel feedback è facoltativo, caricato dal tester, e viene conservato come le altre foto dell'app.
- Le funzioni AI (piano, foto, etichette, ricette) consumano il credito della chiave Emergent anche durante la beta. Se il saldo finisce, quelle funzioni si fermano finché non viene ricaricato.
- Nessuna lingua diversa dall'italiano in questa fase.
- I feedback inviati da un tester restano visibili all'admin anche dopo "Ricomincia da zero". Vengono cancellati solo con "Elimina account".
- I dispositivi registrati per le notifiche vengono scollegati in entrambi i casi. Dopo l'azzeramento le notifiche vanno riattivate.
- Con l'eliminazione, le foto vengono rimosse dall'app e non sono più consultabili.
