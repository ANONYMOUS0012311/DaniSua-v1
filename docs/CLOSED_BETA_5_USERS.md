# DaniSua — Closed Beta (5 utenti)

## Obiettivo

Validare il comportamento reale di DaniSua con 5 persone prima di ampliare la beta.

Questa fase non richiede che tutto il catalogo sia pronto. Richiede però che, al momento della sessione, almeno 3 famiglie P0 abbiano abbastanza dati affidabili da permettere un confronto reale.

## Gate prima della sessione

Eseguire:

```bash
npm run beta:closed-check
```

La sessione parte solo se il comando termina con exit code 0.

Il criterio attuale della beta chiusa è:

- almeno 3 famiglie P0 pronte;
- per ogni famiglia pronta, almeno 2 negozi con offerte fresh;
- le offerte devono essere standard, in EUR e disponibili;
- il costo di spedizione deve essere noto, così DaniSua può confrontare il costo finale;
- le offerte devono rispettare la finestra di affidabilità (fresh <= 2h);
- Awin non è obbligatorio per una sessione controllata di 5 utenti.

Per la beta pubblica il criterio resta più severo: tutte le famiglie P0 devono raggiungere il proprio minimo di negozi con costo finale verificabile e l'automazione deve essere pronta.

## Controllo produzione

Prima di invitare gli utenti:

1. Verificare che il deploy Render più recente sia live.
2. Controllare che non ci siano errori recenti nei log.
3. Verificare in `/health` che `readyForClosedBeta` sia `true`.
4. Eseguire nuovamente `npm run beta:closed-check` immediatamente prima della sessione, perché la freschezza scade.

## Come testare

Non insegnare agli utenti la sintassi di DaniSua. Devono scrivere come scriverebbero normalmente.

Per ogni utente chiedere di completare tre compiti:

1. Cercare un modello preciso che comprerebbe davvero.
2. Cercare un prodotto descrivendo un bisogno o un budget, senza indicare il modello.
3. Fare una ricerca naturale, anche incompleta o con un errore di scrittura.

Se una famiglia non è affidabile in quel momento, `offers_need_refresh` è un comportamento corretto: DaniSua deve essere trasparente invece di inventare una raccomandazione.

## Cosa osservare

Durante la sessione annotare solo problemi di prodotto e fiducia:

- prodotto o variante sbagliata;
- capacità/colore/condizione non rispettati;
- prezzo non coerente con il negozio;
- costo finale sbagliato;
- seller marketplace trattato come retailer diretto;
- link rotto o non corrispondente alla variante;
- domanda di chiarimento inutile;
- raccomandazione bloccata quando esiste un'offerta fresh valida;
- offerta stale che viene raccomandata o rende il CTA attivo.

## Metriche già disponibili

Il backend registra eventi strutturati senza salvare il testo cercato:

- `search_outcome`: intent, status, canRecommend, count, hasBestOffer, clarificationNeeded;
- `client_event` con `offer_click`: offerId, familyId, store e posizione.

La query dell'utente non viene inclusa in questi eventi.

## Segnale principale

La domanda finale per ogni tester è:

> Useresti DaniSua prima di comprare online per controllare se esiste un prezzo migliore affidabile?

Il segnale più importante non è il numero di ricerche, ma se la persona sente che DaniSua le fa risparmiare tempo e vorrebbe controllarla prima di acquistare.

## Dopo i 5 utenti

Prima di passare a 15 utenti:

- correggere tutti i bug che possono danneggiare la fiducia;
- rieseguire CI;
- rieseguire il test production reliability;
- rifare il gate `beta:closed-check`;
- verificare che i dati siano ancora fresh;
- confrontare `search_outcome` e `offer_click` con il feedback qualitativo.

Non ampliare la beta se rimangono errori di prezzo, variante, seller, stock o link.
