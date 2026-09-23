var socket = io();
var myRoom = null, myPlayer = null, selectedAmb = "villa", selectedDur = 30;

/* ---- indicatore di connessione ---- */
var bar = document.createElement("div");
bar.style.cssText = "position:fixed;top:0;left:0;right:0;padding:6px;text-align:center;font-size:12px;z-index:9999;font-family:sans-serif";
document.body.appendChild(bar);
function status(txt, color) { bar.textContent = txt; bar.style.background = color; bar.style.color = "#000"; }
status("Collegamento al server...", "#c9a84c");

socket.on("connect", function () { status("\u2705 Connesso al server", "#27ae60"); setTimeout(function () { bar.style.display = "none"; }, 2000); });
socket.on("disconnect", function () { bar.style.display = "block"; status("\u26A0\uFE0F Connessione persa, riprovo...", "#c0392b"); });
socket.on("connect_error", function (e) { bar.style.display = "block"; status("\u274C Errore connessione: " + e.message, "#c0392b"); });
socket.on("fatal-error", function (m) { alert("Errore: " + m); location.href = "/"; });

/* ---- navigazione ---- */
function goTo(id) {
  var s = document.querySelectorAll(".screen");
  for (var i = 0; i < s.length; i++) s[i].classList.remove("active");
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

function selectAmb(el) {
  var c = document.querySelectorAll(".amb-card");
  for (var i = 0; i < c.length; i++) c[i].classList.remove("selected");
  el.classList.add("selected");
  selectedAmb = el.getAttribute("data-amb");
  if (navigator.vibrate) navigator.vibrate(30);
}

function selectDur(el) {
  var b = document.querySelectorAll(".dur-btn");
  for (var i = 0; i < b.length; i++) b[i].classList.remove("selected");
  el.classList.add("selected");
  selectedDur = parseInt(el.getAttribute("data-dur"), 10);
  if (navigator.vibrate) navigator.vibrate(30);
}

/* ---- emit con timeout: se il server non risponde lo dice ---- */
function emitSafe(event, payload, errBoxId, onOk) {
  var done = false;
  var t = setTimeout(function () {
    if (!done) {
      var eb = document.getElementById(errBoxId);
      if (eb) eb.textContent = "Il server non risponde. Attendi 30 secondi (si sta svegliando) e riprova.";
    }
  }, 10000);
  socket.emit(event, payload, function (res) {
    done = true; clearTimeout(t);
    if (!res) { document.getElementById(errBoxId).textContent = "Nessuna risposta dal server."; return; }
    if (res.ok) onOk(res);
    else document.getElementById(errBoxId).textContent = res.err || "Errore sconosciuto.";
  });
}

function createRoom() {
  var name = document.getElementById("host-name").value.trim();
  var eb = document.getElementById("create-err");
  if (!name) { eb.textContent = "Inserisci il tuo nome!"; return; }
  if (!socket.connected) { eb.textContent = "Non ancora connesso. Attendi qualche secondo..."; return; }
  eb.textContent = "Creazione stanza in corso...";
  emitSafe("create-room", { name: name, settings: { ambiance: selectedAmb, duration: selectedDur } }, "create-err", function (res) {
    eb.textContent = "";
    myRoom = res.roomId; myPlayer = res.player; save();
    showLobby(true);
    if (res.players) renderPlayers(res.players);
  });
}

function joinRoom() {
  var name = document.getElementById("join-name").value.trim();
  var code = document.getElementById("join-code").value.trim().toUpperCase();
  var eb = document.getElementById("join-err");
  if (!name || !code) { eb.textContent = "Compila tutti i campi!"; return; }
  if (!socket.connected) { eb.textContent = "Non ancora connesso. Attendi qualche secondo..."; return; }
  eb.textContent = "Ingresso in corso...";
  emitSafe("join-room", { name: name, roomId: code }, "join-err", function (res) {
    eb.textContent = "";
    myRoom = res.roomId; myPlayer = res.player; save();
    showLobby(false);
    if (res.players) renderPlayers(res.players);
  });
}

function showLobby(isHost) {
  goTo("screen-lobby");
  document.getElementById("lobby-code").textContent = myRoom;
  document.getElementById("host-area").classList[isHost ? "remove" : "add"]("hidden");
  document.getElementById("guest-area").classList[isHost ? "add" : "remove"]("hidden");
}

function renderPlayers(players) {
  var emojis = ["\u{1F3AD}", "\u{1F5E1}\uFE0F", "\u{1F50D}", "\u{1F48E}", "\u{1F56F}\uFE0F", "\u{1F5DD}\uFE0F", "\u{1F4DC}", "\u2697\uFE0F"];
  var html = "";
  for (var i = 0; i < players.length; i++) {
    html += '<div class="p-item"><span class="p-name">' + (emojis[i] || "\u{1F464}") + " " + players[i].name + "</span>";
    if (players[i].isHost) html += '<span class="p-badge">HOST</span>';
    html += "</div>";
  }
  document.getElementById("players-list").innerHTML = html;
  var btn = document.getElementById("start-btn");
  if (btn) {
    btn.disabled = players.length < 3;
    btn.textContent = "\u{1F3AE} AVVIA PARTITA (" + players.length + "/8)";
    btn.style.opacity = players.length < 3 ? "0.5" : "1";
  }
}

function copyCode() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(myRoom);
    var b = document.querySelector(".copy-btn");
    b.textContent = "\u2705";
    setTimeout(function () { b.textContent = "\u{1F4CB}"; }, 2000);
  } else { prompt("Copia il codice:", myRoom); }
}

function startGame() {
  var btn = document.getElementById("start-btn");
  btn.textContent = "Avvio in corso...";
  socket.emit("start-game", myRoom, function (res) {
    if (res && !res.ok) { alert(res.err); btn.textContent = "\u{1F3AE} AVVIA PARTITA"; }
  });
}

function save() {
  localStorage.setItem("at_room", myRoom);
  localStorage.setItem("at_name", myPlayer.name);
}

var tips = [
  "Osservate i dettagli: ogni parola puo' essere un indizio.",
  "L'assassino e' tra voi. Fidatevi del vostro istinto.",
  "Preparatevi a mentire... o a smascherare chi mente.",
  "L'Agente TORMENTA vede tutto. Quasi tutto.",
  "Ogni personaggio ha un segreto. Scopriteli.",
  "Non e' sempre chi sembra piu' colpevole..."
];
var tipIndex = 0;

socket.on("players-update", renderPlayers);

socket.on("game-generating", function () {
  goTo("screen-loading");
  setInterval(function () {
    tipIndex = (tipIndex + 1) % tips.length;
    var el = document.getElementById("loading-tip");
    if (el) el.textContent = tips[tipIndex];
  }, 4000);
});

socket.on("game-started", function (data) {
  localStorage.setItem("at_gamedata", JSON.stringify(data));
  window.location.href = "/game.html";
});
