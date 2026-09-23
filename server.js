const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const AIEngine = require("./ai-engine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  const k = (process.env.GEMINI_API_KEY || "").trim();
  res.json({
    stato: "ONLINE",
    chiaveApiPresente: k.length > 10,
    lunghezzaChiave: k.length,
    stanzeAttive: rooms.size,
    ora: new Date().toISOString()
  });
});

const rooms = new Map();
const sharedAI = new AIEngine();

class GameRoom {
  constructor(settings) {
    this.id = uuidv4().substring(0, 6).toUpperCase();
    this.players = [];
    this.status = "lobby";
    this.currentPhase = -1;
    this.story = null;
    this.votes = {};
    this.chatHistory = [];
    this.settings = settings || { ambiance: "villa", duration: 30 };
    this.phaseTimer = null;
  }
  addPlayer(name, socketId) {
    if (this.players.length >= 8) return false;
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return false;
    this.players.push({ id: socketId, name: name, character: null, isHost: this.players.length === 0 });
    return true;
  }
  removePlayer(socketId) { this.players = this.players.filter(p => p.id !== socketId); }
  getPlayer(socketId) { return this.players.find(p => p.id === socketId); }
}

function reply(cb, data) { if (typeof cb === "function") cb(data); }

io.on("connection", (socket) => {
  console.log("Connesso:", socket.id);

  socket.on("create-room", (data, cb) => {
    try {
      const name = (data && data.name ? String(data.name) : "").trim();
      if (!name) return reply(cb, { ok: false, err: "Nome mancante!" });
      const room = new GameRoom(data.settings);
      room.addPlayer(name, socket.id);
      rooms.set(room.id, room);
      socket.join(room.id);
      console.log("Stanza creata:", room.id, "da", name);
      reply(cb, { ok: true, roomId: room.id, player: room.players[0], players: room.players });
      io.to(room.id).emit("players-update", room.players);
    } catch (e) {
      console.error("create-room:", e);
      reply(cb, { ok: false, err: "Errore server: " + e.message });
    }
  });

  socket.on("join-room", (data, cb) => {
    try {
      const name = (data && data.name ? String(data.name) : "").trim();
      const code = (data && data.roomId ? String(data.roomId) : "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return reply(cb, { ok: false, err: "Stanza non trovata!" });
      if (room.status !== "lobby") return reply(cb, { ok: false, err: "Partita gia' in corso!" });
      if (!room.addPlayer(name, socket.id)) return reply(cb, { ok: false, err: "Nome gia' in uso o stanza piena!" });
      socket.join(room.id);
      io.to(room.id).emit("players-update", room.players);
      reply(cb, { ok: true, roomId: room.id, player: room.getPlayer(socket.id), players: room.players });
    } catch (e) {
      console.error("join-room:", e);
      reply(cb, { ok: false, err: "Errore server: " + e.message });
    }
  });

  socket.on("reconnect-room", (data, cb) => {
    try {
      const room = rooms.get(data && data.roomId);
      if (!room) return reply(cb, { ok: false });
      const player = room.players.find(p => p.name === data.name);
      if (!player) return reply(cb, { ok: false });
      player.id = socket.id;
      socket.join(room.id);
      reply(cb, { ok: true });
    } catch (e) { reply(cb, { ok: false }); }
  });

  socket.on("start-game", async (roomId, cb) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return reply(cb, { ok: false, err: "Stanza non trovata!" });
      const player = room.getPlayer(socket.id);
      if (!player || !player.isHost) return reply(cb, { ok: false, err: "Solo l'host puo' avviare!" });
      if (room.players.length < 3) return reply(cb, { ok: false, err: "Servono almeno 3 giocatori!" });
      if (room.status !== "lobby") return reply(cb, { ok: false, err: "Partita gia' avviata!" });

      room.status = "generating";
      io.to(roomId).emit("game-generating");
      reply(cb, { ok: true });

      const names = room.players.map(p => p.name);
      const story = await sharedAI.generateStory(names, room.settings);
      room.story = story;
      story.characters.forEach((c, i) => { if (room.players[i]) room.players[i].character = c; });
      room.status = "playing";

      room.players.forEach(p => {
        io.to(p.id).emit("game-started", {
          setting: story.setting,
          settingImage: story.settingEmoji || "\u{1F3F0}",
          intro: story.introduction,
          yourChar: p.character,
          allPlayers: room.players.map(pl => ({
            name: pl.name,
            charName: pl.character && pl.character.name,
            charRole: pl.character && pl.character.publicRole
          })),
          totalPhases: story.phases.length,
          duration: room.settings.duration
        });
      });
      setTimeout(() => startPhase(roomId, 0), 15000);
    } catch (e) {
      console.error("start-game:", e);
      const room = rooms.get(roomId);
      if (room) room.status = "lobby";
      io.to(roomId).emit("fatal-error", "Errore nell'avvio: " + e.message);
    }
  });

  socket.on("chat-msg", (data) => {
    try {
      const room = rooms.get(data.roomId);
      if (!room) return;
      const player = room.getPlayer(socket.id);
      if (!player) return;
      const msg = {
        sender: (player.character && player.character.name) || player.name,
        playerName: player.name,
        text: String(data.text).substring(0, 500),
        type: "player",
        time: Date.now()
      };
      room.chatHistory.push(msg);
      io.to(data.roomId).emit("chat-msg", msg);
    } catch (e) { console.error("chat-msg:", e); }
  });

  socket.on("ask-tormenta", async (data, cb) => {
    try {
      const room = rooms.get(data.roomId);
      if (!room || !room.story) return reply(cb, { ok: false, response: "Il caso non e' ancora aperto." });
      const player = room.getPlayer(socket.id);
      const response = await sharedAI.askTormenta(
        room.story, player && player.character, data.question, room.currentPhase, room.chatHistory.slice(-15)
      );
      reply(cb, { ok: true, response: response });
    } catch (e) {
      console.error("ask-tormenta:", e);
      reply(cb, { ok: false, response: "Le mie sinapsi sono offuscate. Riprovate tra poco." });
    }
  });

  socket.on("vote", (data) => {
    try {
      const room = rooms.get(data.roomId);
      if (!room) return;
      const player = room.getPlayer(socket.id);
      if (!player) return;
      room.votes[player.name] = data.suspect;
      io.to(data.roomId).emit("vote-update", { count: Object.keys(room.votes).length, total: room.players.length });
      if (Object.keys(room.votes).length >= room.players.length) endGame(data.roomId);
    } catch (e) { console.error("vote:", e); }
  });

  socket.on("force-end", (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.getPlayer(socket.id);
    if (p && p.isHost && room.status === "playing") {
      if (room.phaseTimer) clearTimeout(room.phaseTimer);
      startPhase(roomId, room.story.phases.length);
    }
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, roomId) => {
      const player = room.getPlayer(socket.id);
      if (player && room.status === "lobby") {
        room.removePlayer(socket.id);
        if (room.players.length > 0) room.players[0].isHost = true;
        io.to(roomId).emit("players-update", room.players);
        if (room.players.length === 0) rooms.delete(roomId);
      }
    });
  });
});

function startPhase(roomId, index) {
  const room = rooms.get(roomId);
  if (!room || !room.story) return;

  if (index >= room.story.phases.length) {
    io.to(roomId).emit("voting-time", {
      suspects: room.players.map(p => ({
        name: p.name,
        charName: p.character && p.character.name,
        charRole: p.character && p.character.publicRole
      }))
    });
    return;
  }

  room.currentPhase = index;
  const phase = room.story.phases[index];
  const total = room.story.phases.length;
  const phaseMs = Math.round((room.settings.duration * 60 * 1000) / total);

  io.to(roomId).emit("new-phase", {
    num: index + 1, total: total, title: phase.title,
    narrative: phase.narrative, clue: phase.clue, duration: Math.round(phaseMs / 1000)
  });

  room.players.forEach(p => {
    const key = p.character && p.character.name;
    const priv = phase.privateClues && key ? phase.privateClues[key] : null;
    if (priv) io.to(p.id).emit("private-clue", { clue: priv, phase: index + 1 });
  });

  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  if (phaseMs > 70000) {
    setTimeout(() => {
      io.to(roomId).emit("system-msg", { text: "\u23F0 Un minuto alla fine di questa fase!", type: "warning" });
    }, phaseMs - 60000);
  }
  room.phaseTimer = setTimeout(() => startPhase(roomId, index + 1), phaseMs);
}

function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.story) return;
  const killer = room.story.characters.find(c => c.isKiller);
  const killerPlayer = room.players.find(p => p.character && p.character.name === (killer && killer.name));
  const voteCounts = {};
  Object.values(room.votes).forEach(n => { voteCounts[n] = (voteCounts[n] || 0) + 1; });
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const won = sorted.length > 0 && sorted[0][0] === (killerPlayer && killerPlayer.name);

  io.to(roomId).emit("game-over", {
    won: won,
    killer: {
      player: killerPlayer && killerPlayer.name,
      char: killer && killer.name,
      motive: killer && killer.motive
    },
    revelation: room.story.revelation,
    votes: room.votes,
    voteCounts: voteCounts,
    stats: { totalMessages: room.chatHistory.length, duration: room.settings.duration }
  });
  room.status = "ended";
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
}

process.on("uncaughtException", (e) => console.error("Eccezione non gestita:", e));
process.on("unhandledRejection", (e) => console.error("Promise rifiutata:", e));

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Agente TORMENTA attiva sulla porta " + PORT);
  console.log("Chiave API presente: " + ((process.env.GEMINI_API_KEY || "").trim().length > 10));
});
