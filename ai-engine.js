const { GoogleGenerativeAI } = require("@google/generative-ai");

const AMBIANCE_MAP = {
  villa: "una villa gotica isolata sulle colline, notte di tempesta",
  treno: "l'Orient Express durante un viaggio notturno negli anni '30",
  nave: "una lussuosa nave da crociera in mezzo all'oceano",
  castello: "un antico castello medievale durante una cena di gala",
  teatro: "un teatro dell'opera abbandonato in una notte nebbiosa",
  hotel: "un hotel di lusso anni '20 durante una festa esclusiva"
};

const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-1.5-flash"];

class AIEngine {
  constructor() {
    this.key = (process.env.GEMINI_API_KEY || "").trim();
    this.ok = this.key.length > 10;
    this.genAI = null;
    if (this.ok) {
      try { this.genAI = new GoogleGenerativeAI(this.key); }
      catch (e) { console.error("Chiave API non valida:", e.message); this.ok = false; }
    } else {
      console.warn("ATTENZIONE: GEMINI_API_KEY mancante. Uso storie di riserva.");
    }
  }

  async tryModels(prompt) {
    let lastErr = null;
    for (const name of MODELS) {
      try {
        const model = this.genAI.getGenerativeModel({ model: name });
        const res = await model.generateContent(prompt);
        console.log("Modello usato:", name);
        return res.response.text();
      } catch (e) {
        lastErr = e;
        console.warn("Modello " + name + " non disponibile: " + e.message);
      }
    }
    throw lastErr || new Error("Nessun modello disponibile");
  }

  async generateStory(playerNames, settings) {
    if (!this.ok) return this.fallbackStory(playerNames, settings);
    try {
      const ambDesc = AMBIANCE_MAP[settings.ambiance] || AMBIANCE_MAP.villa;
      const n = playerNames.length;
      const numPhases = settings.duration === 30 ? 3 : 4;
      const prompt = "Sei l'Agente TORMENTA, detective donna brillante, sarcastica e misteriosa (tipo Sherlock Holmes al femminile).\n" +
        "Crea una storia per una Cena con Delitto per " + n + " giocatori.\n" +
        "Ambientazione: " + ambDesc + "\nGiocatori: " + playerNames.join(", ") + "\n\n" +
        "Rispondi SOLO con JSON valido in questa struttura:\n" +
        '{"setting":"3 frasi","settingEmoji":"emoji","introduction":"3 paragrafi in prima persona","victim":"nome NPC",' +
        '"characters":[{"name":"","publicRole":"","privateBackground":"","secret":"","motive":"","isKiller":false,"personality":"","alibi":""}],' +
        '"phases":[{"title":"","narrative":"","clue":"","privateClues":{"NomePersonaggio":"indizio"}}],' +
        '"revelation":"3 paragrafi"}\n\n' +
        "REGOLE: esattamente " + n + " personaggi; UN SOLO isKiller true; la vittima e' un NPC; " +
        numPhases + " fasi con difficolta' crescente; ogni personaggio ha un movente credibile; " +
        "in ogni fase almeno 2 personaggi ricevono un indizio privato (usa esattamente i nomi dei personaggi come chiavi); " +
        "tutto in ITALIANO; rispondi SOLO con il JSON senza testo extra.";

      const raw = await this.tryModels(prompt);
      const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      const story = JSON.parse(clean.substring(start, end + 1));

      if (!story.characters || story.characters.length < playerNames.length) {
        console.warn("Storia AI incompleta, uso riserva");
        return this.fallbackStory(playerNames, settings);
      }
      story.characters = story.characters.slice(0, playerNames.length);
      story.characters.forEach((c, i) => { c.playerAssigned = playerNames[i]; });
      const killers = story.characters.filter(c => c.isKiller);
      if (killers.length === 0) {
        story.characters[Math.floor(Math.random() * story.characters.length)].isKiller = true;
      } else if (killers.length > 1) {
        killers.slice(1).forEach(k => { k.isKiller = false; });
      }
      if (!story.phases || !story.phases.length) return this.fallbackStory(playerNames, settings);
      return story;
    } catch (e) {
      console.error("Errore AI, uso storia di riserva:", e.message);
      return this.fallbackStory(playerNames, settings);
    }
  }

  async askTormenta(story, character, question, phase, recentChat) {
    if (!this.ok) return this.fallbackHint(question);
    try {
      const chatContext = (recentChat || []).map(m => m.sender + ": " + m.text).join("\n").substring(0, 800);
      const prompt = "Sei l'Agente TORMENTA: detective donna brillante, sarcastica, misteriosa. Parli italiano.\n" +
        "Caso: " + story.setting + " | Vittima: " + story.victim + " | Fase " + (phase + 1) + " di " + story.phases.length + "\n" +
        "Il giocatore interpreta: " + (character && character.name) + " (" + (character && character.publicRole) + ")\n" +
        "Chat recente:\n" + chatContext + "\n" +
        'Domanda: "' + question + '"\n' +
        "Rispondi in personaggio, sarcastica ed elegante, con suggerimenti sottili e MAI la soluzione. Massimo 4 frasi.";
      return await this.tryModels(prompt);
    } catch (e) {
      return this.fallbackHint(question);
    }
  }

  fallbackHint(q) {
    const hints = [
      "Interessante domanda... ma le risposte migliori si trovano osservando chi evita il vostro sguardo.",
      "Mmh. Vi suggerirei di rileggere l'ultimo indizio: c'e' una parola di troppo. O una di meno.",
      "Non tutti mentono per colpa. Alcuni mentono per vergogna. Distinguere i due casi e' il vostro lavoro.",
      "Chiedete a chi ha un alibi troppo perfetto. La perfezione, mio caro, e' sempre costruita.",
      "Le mie sinapsi sono un po' offuscate stasera. Ma il vostro istinto no: usatelo."
    ];
    return hints[Math.floor(Math.random() * hints.length)];
  }

  fallbackStory(playerNames, settings) {
    const amb = (settings && settings.ambiance) || "villa";
    const S = {
      villa: { emoji: "\u{1F3DA}\uFE0F", place: "Villa Nebbiosa, magione gotica isolata sulle colline", victim: "Conte Aldo Ferraris" },
      treno: { emoji: "\u{1F682}", place: "l'Orient Express, bloccato dalla neve tra i Balcani", victim: "Barone Von Hessler" },
      nave: { emoji: "\u{1F6A2}", place: "il transatlantico Regina Nera, in mezzo all'Atlantico", victim: "Armatore Ruggero Sali" },
      castello: { emoji: "\u{1F3F0}", place: "il Castello di Rocca Oscura, durante una cena di gala", victim: "Duca Amerigo Falconeri" },
      teatro: { emoji: "\u{1F3AD}", place: "il Teatro Lirico, dopo l'ultima replica della stagione", victim: "Maestro Ettore Bellandi" },
      hotel: { emoji: "\u{1F3E8}", place: "il Grand Hotel Aurora, nella notte di Capodanno del 1926", victim: "Magnate Cesare Lunardi" }
    }[amb] || { emoji: "\u{1F3DA}\uFE0F", place: "Villa Nebbiosa", victim: "Conte Aldo Ferraris" };

    const roles = [
      { name: "Alfred Moreau", role: "il maggiordomo" },
      { name: "Lady Victoria", role: "la contessa" },
      { name: "Dott. Sergio Vinci", role: "il medico di famiglia" },
      { name: "Rosa Vermiglia", role: "la cantante" },
      { name: "Col. Ugo Hastings", role: "il colonnello in pensione" },
      { name: "Marta Bruni", role: "la cuoca" },
      { name: "Tommaso Greco", role: "il giardiniere" },
      { name: "Avv. Ilaria Serpenti", role: "l'avvocato di famiglia" }
    ];
    const secrets = [
      "Hai rubato una somma di denaro dalla cassaforte e nessuno lo sa ancora.",
      "Sei legato alla vittima da una relazione che avevi giurato di tenere segreta.",
      "Hai falsificato un documento che ti avrebbe rovinato la carriera.",
      "Sei stato ricattato dalla vittima per mesi.",
      "Hai mentito sul tuo vero nome e sul tuo passato.",
      "Conosci il contenuto del nuovo testamento e non dovresti.",
      "Hai distrutto una prova poco prima che gli altri arrivassero.",
      "Devi una cifra enorme a persone molto pericolose."
    ];
    const motives = [
      "Un'eredita' che ti sfuggiva di mano.",
      "Una vendetta rimasta in sospeso da anni.",
      "Un segreto che la vittima stava per rivelare.",
      "Un amore tradito e mai dimenticato.",
      "Una carriera distrutta dalla vittima.",
      "Un debito impossibile da saldare.",
      "Una promessa infranta che ti ha rovinato la vita.",
      "Un documento che la vittima non doveva mai trovare."
    ];

    const n = playerNames.length;
    const killerIdx = Math.floor(Math.random() * n);
    const characters = playerNames.map((pn, i) => ({
      name: roles[i].name,
      playerAssigned: pn,
      publicRole: roles[i].role,
      privateBackground: "Conosci " + S.victim + " da molti anni. Il vostro rapporto era fatto di favori, silenzi e vecchi rancori. Stasera eri stato convocato senza una vera spiegazione.",
      secret: secrets[i],
      motive: motives[i],
      isKiller: i === killerIdx,
      personality: "Interpretalo con calma e ambiguita': rispondi alle domande, ma non dire mai tutto. Difendi il tuo segreto a ogni costo.",
      alibi: "Dichiari di esserti allontanato pochi minuti, da solo, senza testimoni."
    }));

    const allNames = characters.map(c => c.name);
    const pc = (idxs, texts) => {
      const o = {};
      idxs.forEach((ix, k) => { if (allNames[ix]) o[allNames[ix]] = texts[k]; });
      return o;
    };

    const phases = [
      {
        title: "\u{1F50D} La Scoperta",
        narrative: "Buonasera. Sono l'Agente TORMENTA e, come sempre, arrivo quando il peggio e' gia' successo. " + S.victim + " giace senza vita a " + S.place + ". La porta era chiusa dall'interno, il che e' seccante: significa che il colpevole e' ancora qui, tra voi, a fingere sorpresa.\n\nVi invito a parlarvi. A mentire, se proprio dovete. Io osservo.",
        clue: "Sul pavimento un bicchiere in frantumi e una lettera strappata che parla di un tradimento e di una grossa somma di denaro.",
        privateClues: pc([0, 1, 2], [
          "Hai visto qualcuno uscire dallo studio poco prima dell'allarme, ma non ne hai riconosciuto il volto.",
          "Il tuo nome compariva sulla lettera strappata. Speri che nessuno raccolga i pezzi.",
          "Hai notato che l'orologio della stanza era stato spostato indietro di venti minuti."
        ])
      },
      {
        title: "\u{1F5DD}\uFE0F Segreti Svelati",
        narrative: "Dietro una libreria, una stanza che nessuno doveva trovare. Dentro: documenti, fotografie e una contabilita' parallela. Curioso quanti di voi compaiano in quelle carte.\n\nVi consiglio di spiegare, prima che lo faccia io al posto vostro.",
        clue: "Un diario rivela che la vittima stava per modificare il testamento entro quarantotto ore.",
        privateClues: pc([3, 4, 1], [
          "Sapevi del nuovo testamento: ti avrebbe escluso completamente.",
          "Hai trovato un biglietto con la tua calligrafia in quella stanza. Non ricordi di averlo scritto.",
          "Uno degli altri ospiti ti ha chiesto di mentire sul suo alibi."
        ])
      },
      {
        title: "\u{1F9EA} L'Indizio Cruciale",
        narrative: "Il corpo racconta piu' di quanto facciate voi. Tracce di una sostanza rara, non di quelle che si comprano al mercato. Qualcuno qui sapeva esattamente quanto bastava.\n\nRestringiamo il cerchio: chi aveva accesso, chi aveva conoscenza, chi aveva fretta.",
        clue: "La sostanza usata proviene da una pianta coltivata proprio in questo luogo: pochi sapevano dove trovarla.",
        privateClues: pc([5, 6, 2], [
          "Sei l'unico ad avere le chiavi del luogo in cui cresce quella pianta.",
          "Hai visto qualcuno maneggiare una boccetta scura durante l'aperitivo.",
          "Sai riconoscere quella sostanza: l'hai gia' vista una volta, anni fa, in un caso mai chiarito."
        ])
      },
      {
        title: "\u26A1 La Resa dei Conti",
        narrative: "Ultimo atto. Le maschere iniziano a scivolare e il tempo, come al solito, gioca a mio favore e contro di voi.\n\nGuardatevi negli occhi: una sola persona in questa stanza sta recitando meglio delle altre.",
        clue: "Sul recipiente della sostanza c'e' un'impronta parziale: appartiene a una mano che questa sera ha toccato il bicchiere della vittima.",
        privateClues: pc([7, 0, 4], [
          "Hai mentito sull'orario in cui sei rientrato. Se lo scoprono, sei finito.",
          "Ricordi ora quel volto visto uscire: ti sembra somigliasse a chi meno sospetti.",
          "Qualcuno ha cercato di corromperti perche' tu accusassi un innocente."
        ])
      }
    ];

    const numPhases = (settings && settings.duration === 30) ? 3 : 4;

    return {
      setting: S.place + ". Una serata iniziata con un invito elegante e finita con un cadavere. Nessuno puo' uscire, nessuno puo' chiamare aiuto.",
      settingEmoji: S.emoji,
      introduction: "Buonasera, investigatori. Sono l'Agente TORMENTA.\n\nSiete stati invitati a " + S.place + " da " + S.victim + ", che purtroppo stasera non potra' ricevervi: e' stato assassinato. Le vie di fuga sono interrotte, le comunicazioni pure. Il che, ammettiamolo, rende la serata molto piu' interessante.\n\nUno di voi ha ucciso. Tutti voi avete un movente. Il mio compito e' guidarvi; il vostro e' non farvi ingannare. Cominciamo.",
      victim: S.victim,
      characters: characters,
      phases: phases.slice(0, numPhases),
      revelation: "Ed eccoci al momento che preferisco.\n\nL'assassino ha agito con freddezza: ha atteso che l'attenzione fosse altrove, ha versato la sostanza nel bicchiere della vittima e ha spostato l'orologio per costruirsi una finestra d'alibi. Un piano quasi elegante, rovinato da un dettaglio banale: chi mente sull'orario dimentica sempre di controllare chi lo stava guardando.\n\nIl movente era vecchio quanto il rancore che lo alimentava. E adesso, finalmente, e' scritto nero su bianco."
    };
  }
}

module.exports = AIEngine;
