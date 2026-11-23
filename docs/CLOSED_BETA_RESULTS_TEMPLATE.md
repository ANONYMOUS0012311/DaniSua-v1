# DaniSua — Risultati beta chiusa (5 utenti)

Usare questo file insieme a `CLOSED_BETA_5_USERS.md`.

## Regole di raccolta

- Identificare le persone solo come T1–T5.
- Non annotare nome, email, telefono o altri dati personali.
- Non copiare sistematicamente il testo completo delle ricerche.
- Se una query serve a riprodurre un bug, annotarne solo la parte tecnica necessaria.
- Prima della sessione eseguire `npm run beta:closed-check`.
- Se il gate fallisce, aggiornare i dati prima di testare.

## Stato pre-sessione

- Data/ora:
- Commit in produzione:
- Deploy Render live: sì / no
- `/health` OK: sì / no
- `readyForClosedBeta`: true / false
- Famiglie P0 pronte:
- Errori recenti Render: sì / no

---

## T1

### Compito 1 — modello preciso
- Obiettivo del tester:
- Risultato corretto: sì / no
- Variante rispettata: sì / no
- Prezzo coerente col negozio: sì / no
- Costo finale corretto: sì / no
- Link corretto: sì / no
- Ha cliccato un’offerta: sì / no
- Problema osservato:

### Compito 2 — bisogno / budget
- Obiettivo del tester:
- Raccomandazione utile: sì / no
- Vincoli rispettati: sì / no
- Spiegazione comprensibile: sì / no
- Domanda di chiarimento necessaria: sì / no / nessuna
- Problema osservato:

### Compito 3 — linguaggio naturale / typo
- Tipo di input: incompleto / typo / colloquiale / altro
- DaniSua ha capito l’intento: sì / no
- Ha chiesto un dettaglio inutile: sì / no
- Problema osservato:

### Segnale finale
**“Useresti DaniSua prima di comprare online per controllare se esiste un prezzo migliore affidabile?”**

- Risposta: sì / forse / no
- Perché:
- Cosa mancava per fidarsi:

---

## T2

Ripetere la struttura di T1.

## T3

Ripetere la struttura di T1.

## T4

Ripetere la struttura di T1.

## T5

Ripetere la struttura di T1.

---

# Bug trovati

| ID | Gravità | Tipo | Descrizione | Riproducibile | Stato |
| --- | --- | --- | --- | --- | --- |
| B1 | critica / alta / media / bassa | prezzo / variante / seller / link / UX / altro |  | sì / no | aperto |
| B2 |  |  |  |  |  |
| B3 |  |  |  |  |  |

## Classificazione della gravità

**Critica:** prezzo/costo finale errato, variante errata, seller marketplace trattato come retailer diretto, CTA attivo verso offerta stale o link verso prodotto sbagliato.

**Alta:** raccomandazione chiaramente incompatibile con il bisogno o un vincolo esplicito ignorato.

**Media:** chiarimento inutile, spiegazione confusa o percorso che rallenta ma non porta a una decisione errata.

**Bassa:** testo, layout o dettaglio cosmetico senza impatto sulla fiducia o sulla decisione.

# Sintesi della sessione

- Tester che rispondono “sì”: /5
- Tester che rispondono “forse”: /5
- Tester che rispondono “no”: /5
- Ricerche completate senza problema:
- Clic su offerte:
- Bug critici:
- Bug alti:
- Bug medi:
- Bug bassi:
- Principale motivo di fiducia:
- Principale motivo di sfiducia:

# Decisione dopo 5 utenti

Passare a 15 utenti solo se:

- non rimangono bug critici aperti;
- nessun prezzo o costo finale verificato è risultato errato;
- nessuna variante esplicita è stata ignorata;
- nessun seller marketplace è stato presentato come retailer diretto;
- nessun CTA stale è rimasto attivo;
- CI è verde;
- `npm run test:production-reliability` passa;
- `npm run beta:closed-check` passa immediatamente prima della nuova sessione.

Decisione: **passare a 15 / correggere e ripetere 5**

Motivo:
