const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const AIEngine = require("./ai-engine");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = new Map();

class GameRoom {
  constructor(hostName, settings) {
    this.id = uuidv4().substring(0, 6).toUpperCase();
    this.players = [];
    this.status = "lobby";
    this.currentPhase = -1;
    this.story = null;
    this.votes = {};
    this.chatHistory = [];
    this.ai = new AIEngine();
    this.settings = settings || { ambiance: "villa", duration: 60 };
    this.phaseTimer = null;
  }
  addPlayer(name, socketId) {
    if (this.players.length >= 8) return false;
    if (this.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return false;
    this.players.push({ id: socketId, name, character: null, isHost: this.players.length === 0 });
    return true;
  }
  removePlayer(socketId) { this.players = this.players.filter(p => p.id !== socketId); }
  getPlayer(socketId) { return this.players.find(p => p.id === socketId); }
}

io.on("connection", (socket) => {
  console.log("Connesso:", socket.id);

  socket.on("create-room", (data, cb) => {
    const room = new GameRoom(data.name, data.settings);
    room.addPlayer(data.name, socket.id);
    rooms.set(room.id, room);
    socket.join(room.id);
    cb({ ok: true, roomId: room.id, player: room.players[0] });
  });

  socket.on("join-room", (data, cb) => {
    const room = rooms.get(data.roomId.toUpperCase());
    if (!room) return cb({ ok: false, err: "Stanza non trovata!" });
    if (room.status !== "lobby") return cb({ ok: false, err: "Partita già in corso!" });
    if (room.players.length >= 8) return cb({ ok: false, err: "Stanza piena (max 8)!" });
    const added = room.addPlayer(data.name, socket.id);
    if (!added) return cb({ ok: false, err: "Nome già in uso!" });
    socket.join(room.id);
    io.to(room.id).emit("players-update", room.players);
    cb({ ok: true, roomId: room.id, player: room.players.find(p => p.id === socket.id) });
  });

  socket.on("reconnect-room", (data, cb) => {
    const room = rooms.get(data.roomId);
    if (!room) return cb({ ok: false });
    const player = room.players.find(p => p.name === data.name);
    if (player) { player.id = socket.id; socket.join(room.id); cb({ ok: true }); }
    else cb({ ok: false });
  });

  socket.on("start-game", async (roomId, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ ok: false, err: "Stanza non trovata!" });
    const player = room.getPlayer(socket.id);
    if (!player || !player.isHost) return cb({ ok: false, err: "Solo l'host può avviare!" });
    if (room.players.length < 3) return cb({ ok: false, err: "Servono almeno 3 giocatori!" });
    room.status = "generating";
    io.to(roomId).emit("game-generating");
    try {
      const names = room.players.map(p => p.name);
      const story = await room.ai.generateStory(names, room.settings);
      room.story = story;
      story.characters.forEach((char, i) => { if (room.players[i]) room.players[i].character = char; });
      room.status = "playing";
      room.players.forEach(p => {
        io.to(p.id).emit("game-started", {
          setting: story.setting, settingImage: story.settingEmoji || "🏰",
          intro: story.introduction, yourChar: p.character,
          allPlayers: room.players.map(pl => ({ name: pl.name, charName: pl.character?.name, charRole: pl.character?.publicRole })),
          totalPhases: story.phases.length, duration: room.settings.duration
        });
      });
      setTimeout(() => startPhase(roomId, 0), 15000);
      cb({ ok: true });
    } catch (e) {
      console.error("Errore AI:", e);
      room.status = "lobby";
      cb({ ok: false, err: "Errore generazione storia. Riprova!" });
    }
  });

  socket.on("chat-msg", (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;
    const player = room.getPlayer(socket.id);
    if (!player) return;
    const msg = { sender: player.character?.name || player.name, playerName: player.name, text: data.text, type: "player", time: Date.now() };
    room.chatHistory.push(msg);
    io.to(data.roomId).emit("chat-msg", msg);
  });

  socket.on("ask-tormenta", async (data, cb) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.story) return cb({ ok: false });
    const player = room.getPlayer(socket.id);
    if (!player) return cb({ ok: false });
    try {
      const response = await room.ai.askTormenta(room.story, player.character, data.question, room.currentPhase, room.chatHistory.slice(-20));
      cb({ ok: true, response });
    } catch (e) { cb({ ok: false, response: "Mmh... le mie sinapsi sono temporaneamente offuscate. Riprova." }); }
  });

  socket.on("vote", (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;
    const player = room.getPlayer(socket.id);
    if (!player) return;
    room.votes[player.name] = data.suspect;
    io.to(data.roomId).emit("vote-update", { count: Object.keys(room.votes).length, total: room.players.length });
    if (Object.keys(room.votes).length >= room.players.length) endGame(data.roomId);
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, roomId) => {
      const player = room.getPlayer(socket.id);
      if (player && room.status === "lobby") {
        room.removePlayer(socket.id);
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
      suspects: room.players.map(p => ({ name: p.name, charName: p.character?.name, charRole: p.character?.publicRole }))
    });
    return;
  }
  room.currentPhase = index;
  const phase = room.story.phases[index];
  const phaseDuration = room.settings.duration === 30 ? 4 * 60 * 1000 : 8 * 60 * 1000;
  io.to(roomId).emit("new-phase", { num: index + 1, total: room.story.phases.length, title: phase.title, narrative: phase.narrative, clue: phase.clue, duration: phaseDuration / 1000 });
  room.players.forEach(p => {
    const priv = phase.privateClues?.[p.character?.name];
    if (priv) io.to(p.id).emit("private-clue", { clue: priv, phase: index + 1 });
  });
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  setTimeout(() => { io.to(roomId).emit("system-msg", { text: "⏰ Attenzione! 1 minuto alla fine di questa fase!", type: "warning" }); }, phaseDuration - 60000);
  room.phaseTimer = setTimeout(() => { startPhase(roomId, index + 1); }, phaseDuration);
}

function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const killer = room.story.characters.find(c => c.isKiller);
  const killerPlayer = room.players.find(p => p.character?.name === killer?.name);
  const voteCounts = {};
  Object.values(room.votes).forEach(n => { voteCounts[n] = (voteCounts[n] || 0) + 1; });
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const mostVoted = sorted[0]?.[0];
  const won = mostVoted === killerPlayer?.name;
  io.to(roomId).emit("game-over", {
    won, killer: { player: killerPlayer?.name, char: killer?.name, motive: killer?.motive },
    revelation: room.story.revelation, votes: room.votes, voteCounts,
    stats: { totalMessages: room.chatHistory.length, duration: room.settings.duration }
  });
  room.status = "ended";
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => { console.log("🕵️‍♀️ Agente TORMENTA attiva sulla porta " + PORT); });
