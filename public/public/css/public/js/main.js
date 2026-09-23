var socket=io();var myRoom=null;var myPlayer=null;var selectedAmb="villa";var selectedDur=30;

function goTo(id){document.querySelectorAll(".screen").forEach(function(s){s.classList.remove("active")});document.getElementById(id).classList.add("active")}

function selectAmb(el){document.querySelectorAll(".amb-card").forEach(function(c){c.classList.remove("selected")});el.classList.add("selected");selectedAmb=el.dataset.amb}

function selectDur(el){document.querySelectorAll(".dur-btn").forEach(function(b){b.classList.remove("selected")});el.classList.add("selected");selectedDur=parseInt(el.dataset.dur)}

function createRoom(){
  var name=document.getElementById("host-name").value.trim();
  if(!name){document.getElementById("create-err").textContent="Inserisci il tuo nome!";return}
  document.getElementById("create-err").textContent="";
  socket.emit("create-room",{name:name,settings:{ambiance:selectedAmb,duration:selectedDur}},function(res){
    if(res.ok){myRoom=res.roomId;myPlayer=res.player;save();showLobby(true)}
    else{document.getElementById("create-err").textContent=res.err}
  });
}

function joinRoom(){
  var name=document.getElementById("join-name").value.trim();
  var code=document.getElementById("join-code").value.trim().toUpperCase();
  if(!name||!code){document.getElementById("join-err").textContent="Compila tutti i campi!";return}
  document.getElementById("join-err").textContent="";
  socket.emit("join-room",{name:name,roomId:code},function(res){
    if(res.ok){myRoom=res.roomId;myPlayer=res.player;save();showLobby(false)}
    else{document.getElementById("join-err").textContent=res.err}
  });
}

function showLobby(isHost){
  goTo("screen-lobby");
  document.getElementById("lobby-code").textContent=myRoom;
  if(isHost){document.getElementById("host-area").classList.remove("hidden");document.getElementById("guest-area").classList.add("hidden")}
  else{document.getElementById("host-area").classList.add("hidden");document.getElementById("guest-area").classList.remove("hidden")}
}

function renderPlayers(players){
  var emojis=["🎭","🗡️","🔍","💎","🕯️","🗝️","📜","⚗️"];
  var html="";
  for(var i=0;i<players.length;i++){
    html+='<div class="p-item"><span class="p-name">'+(emojis[i]||"👤")+" "+players[i].name+"</span>";
    if(players[i].isHost)html+='<span class="p-badge">HOST</span>';
    html+="</div>";
  }
  document.getElementById("players-list").innerHTML=html;
  var btn=document.getElementById("start-btn");
  if(btn){btn.disabled=players.length<3;btn.textContent="🎮 AVVIA PARTITA ("+players.length+"/8)";btn.style.opacity=players.length<3?"0.5":"1"}
}

function copyCode(){navigator.clipboard.writeText(myRoom).then(function(){var b=document.querySelector(".copy-btn");b.textContent="✅";setTimeout(function(){b.textContent="📋"},2000)})}

function startGame(){socket.emit("start-game",myRoom,function(res){if(!res.ok)alert(res.err)})}

function save(){localStorage.setItem("at_room",myRoom);localStorage.setItem("at_name",myPlayer.name)}

var tips=["Osservate i dettagli... ogni parola può essere un indizio.","L'assassino è tra voi. Fidatevi del vostro istinto.","Preparatevi a mentire... o a smascherare chi mente.","L'Agente TORMENTA vede tutto. Quasi tutto.","Ogni personaggio ha un segreto. Scopriteli.","Non è sempre chi sembra più colpevole..."];
var tipIndex=0;

socket.on("players-update",renderPlayers);
socket.on("game-generating",function(){
  goTo("screen-loading");
  setInterval(function(){tipIndex=(tipIndex+1)%tips.length;var el=document.getElementById("loading-tip");if(el)el.textContent=tips[tipIndex]},4000);
});
socket.on("game-started",function(data){localStorage.setItem("at_gamedata",JSON.stringify(data));window.location.href="/game.html"});
