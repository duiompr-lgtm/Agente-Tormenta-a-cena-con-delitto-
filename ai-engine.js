const { GoogleGenerativeAI } = require("@google/generative-ai");

const AMBIANCE_MAP = {
  villa: "una villa gotica isolata sulle colline, notte di tempesta",
  treno: "l'Orient Express durante un viaggio notturno negli anni '30",
  nave: "una lussuosa nave da crociera in mezzo all'oceano",
  castello: "un antico castello medievale durante una cena di gala",
  teatro: "un teatro dell'opera abbandonato in una notte nebbiosa",
  hotel: "un hotel di lusso anni '20 durante una festa esclusiva"
};

class AIEngine {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async generateStory(playerNames, settings) {
    const ambDesc = AMBIANCE_MAP[settings.ambiance] || AMBIANCE_MAP.villa;
    const numPlayers = playerNames.length;
    const numPhases = settings.duration === 30 ? 3 : 4;

    const prompt = `Sei l'Agente TORMENTA, una detective brillante, sarcastica e misteriosa, simile a Sherlock Holmes ma donna.
Crea una storia per "Cena con Delitto" per ${numPlayers} giocatori.
Ambientazione: ${ambDesc}
Giocatori: ${playerNames.join(", ")}

RISPONDI SOLO in JSON valido con questa struttura ESATTA:
{
  "setting": "descrizione ambientazione dettagliata (3 frasi)",
  "settingEmoji": "un emoji che rappresenta l'ambientazione",
  "introduction": "narrazione iniziale drammatica dell'Agente TORMENTA che si presenta e descrive la scena del crimine (3 paragrafi, in prima persona come detective donna sarcastica e brillante)",
  "victim": "nome della vittima (un NPC)",
  "characters": [
    {
      "name": "Nome Personaggio",
      "playerAssigned": "nome giocatore",
      "publicRole": "ruolo pubblico (es: il maggiordomo)",
      "privateBackground": "background segreto dettagliato (3 frasi)",
      "secret": "segreto nascosto del personaggio",
      "motive": "movente credibile per l'omicidio",
      "isKiller": false,
      "personality": "come interpretare il personaggio (2 frasi)",
      "alibi": "il suo alibi dichiarato"
    }
  ],
  "phases": [
    {
      "title": "titolo fase con emoji",
      "narrative": "narrazione della fase in voce dell'Agente TORMENTA (sarcastica, drammatica, 2 paragrafi)",
      "clue": "indizio pubblico scoperto",
      "privateClues": {
        "Nome Personaggio": "indizio privato rivelato solo a questo personaggio"
      }
    }
  ],
  "revelation": "la rivelazione finale narrata dall'Agente TORMENTA con il suo stile sarcastico e brillante, spiegando come ha risolto il caso (3 paragrafi)"
}

REGOLE IMPORTANTI:
- ${numPlayers} personaggi, uno per giocatore
- ESATTAMENTE un assassino (isKiller: true per UNO solo)
- La vittima e' un NPC, NON un giocatore
- ${numPhases} fasi di gioco con difficolta' crescente
- OGNI personaggio deve avere un movente credibile
- Gli indizi privati devono essere distribuiti: ogni fase almeno 2-3 personaggi ricevono un indizio privato
- La storia deve avere colpi di scena
- Tutto in ITALIANO
- L'Agente TORMENTA narra con tono sarcastico ma brillante, tipo Sherlock Holmes al femminile
- Rispondi SOLO con il JSON, nessun altro testo`;

    const result = await this.model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const story = JSON.parse(clean);
    story.characters.forEach((c, i) => { c.playerAssigned = playerNames[i] || "Giocatore " + (i + 1); });
    const killers = story.characters.filter(c => c.isKiller);
    if (killers.length === 0) { story.characters[Math.floor(Math.random() * story.characters.length)].isKiller = true; }
    else if (killers.length > 1) { killers.slice(1).forEach(k => k.isKiller = false); }
    return story;
  }

  async askTormenta(story, character, question, phase, recentChat) {
    const chatContext = recentChat.map(m => m.sender + ": " + m.text).join("\n").substring(0, 1000);
    const prompt = `Sei l'Agente TORMENTA, una detective donna brillante, sarcastica, misteriosa e incredibilmente intelligente.
Il tuo stile e' simile a Sherlock Holmes ma con un tocco femminile e sarcastico. Parli sempre in italiano.
CASO IN CORSO: Ambientazione: ${story.setting} - Vittima: ${story.victim} - Fase attuale: ${phase + 1} di ${story.phases.length}
Il giocatore interpreta: ${character?.name} (${character?.publicRole})
Ultimi messaggi in chat: ${chatContext}
Il giocatore ti chiede: "${question}"
REGOLE: Rispondi IN PERSONAGGIO come l'Agente TORMENTA. Sii sarcastica, brillante, misteriosa.
Dai suggerimenti sottili, MAI la risposta diretta. Se chiedono come giocare, spiega brevemente.
Se chiedono un indizio, dai un suggerimento criptico. Massimo 4 frasi. Usa un linguaggio elegante e tagliente.`;
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

module.exports = AIEngine;
