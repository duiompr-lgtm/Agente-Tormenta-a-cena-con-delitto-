var socket=io();
var ROOM=localStorage.getItem("at_room");
var NAME=localStorage.getItem("at_name");
var DATA=JSON.parse(localStorage.getItem("at_gamedata")||"{}");
var timerRef=null;var soundOn=true;var audioCtx=null;

document.addEventListener("DOMContentLoaded",function(){
  if(!ROOM||!DATA.setting){window.location.href="/";return}
  socket.emit("reconnect-room",{roomId:ROOM,name:NAME},function(res){if(!res.ok){window.location.href="/";return}});
  showIntro();buildCharPanel();initVoiceDetection();
  document.addEventListener("click",function(){if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();playAmbient()}},{once:true});
});

function showIntro(){
  var nc=document.getElementById("narr-card");
  var playersHtml="";
  for(var i=0;i<DATA.allPlayers.length;i++){
    var p=DATA.allPlayers[i];
    playersHtml+='<p style="margin:4px 0"><strong style="color:var(--gold)">'+p.charName+'</strong> <span style="color:var(--text3)">('+p.charRole+')</span> — '+p.name+(p.name===NAME?" ⭐ Tu!":"")+"</p>";
  }
  nc.innerHTML='<h3>'+(DATA.settingImage||"🏰")+' Ambientazione</h3><p>'+DATA.setting+'</p><div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px"><p>'+DATA.intro+'</p></div><div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px"><h3>🎭 Personaggi</h3>'+playersHtml+'</div>';
  speak("Buonasera, investigatori. Sono l'Agente TORMENTA. "+(DATA.intro||"").substring(0,300));
  addSystemMsg("🕵️‍♀️ L'Agente TORMENTA vi dà il benvenuto. Il gioco ha inizio...");
  addSystemMsg("💡 Tocca 🕵️‍♀️ in alto a destra per chiedere indizi. Oppure di' \"Agente Tormenta\" ad alta voce!");
}

function buildCharPanel(){
  var c=DATA.yourChar;if(!c)return;
  var html='<div class="char-name-big"><span class="char-emoji">🎭</span><h2>'+c.name+'</h2><p>'+c.publicRole+'</p></div>';
  html+='<div class="char-section"><h4>📖 Background</h4><p>'+c.privateBackground+'</p></div>';
  html+='<div class="char-section"><h4>🎭 Personalità</h4><p>'+c.personality+'</p></div>';
  html+='<div class="char-section"><h4>🗣️ Alibi</h4><p>'+(c.alibi||"Nessun alibi")+'</p></div>';
  if(c.isKiller){
    html+='<div class="char-section danger"><h4>⚠️ SEI L\'ASSASSINO!</h4><p>'+c.secret+'</p><p style="margin-top:8px"><strong>Movente:</strong> '+c.motive+'</p><p style="margin-top:6px;color:var(--text2)">Devi depistare gli altri!</p></div>';
  }else{
    html+='<div class="char-section"><h4>🤫 Il Tuo Segreto</h4><p>'+c.secret+'</p><p style="margin-top:8px"><strong>Movente attribuibile:</strong> '+c.motive+'</p></div>';
  }
  document.getElementById("char-info").innerHTML=html;
}

function startTimer(seconds){
  var left=seconds;clearInterval(timerRef);var el=document.getElementById("timer");
  timerRef=setInterval(function(){
    left--;var m=Math.floor(left/60);var s=left%60;
    el.textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
    if(left<=60)el.classList.add("warn");else el.classList.remove("warn");
    if(left<=0)clearInterval(timerRef);
  },1000);
}

function sendMsg(){var inp=document.getElementById("chat-in");var t=inp.value.trim();if(!t)return;socket.emit("chat-msg",{roomId:ROOM,text:t});inp.value=""}

function addChatBubble(msg){
  var box=document.getElementById("chat-msgs");var isSelf=msg.playerName===NAME;var div=document.createElement("div");
  if(msg.type==="system"){div.className="chat-bubble system";div.innerHTML=msg.text}
  else{div.className="chat-bubble "+(isSelf?"self":"other");div.innerHTML='<span class="cb-name">'+msg.sender+"</span>"+msg.text}
  box.appendChild(div);box.scrollTop=box.scrollHeight;
}
function addSystemMsg(text){addChatBubble({text:text,type:"system"})}

function askTormenta(){
  var inp=document.getElementById("ai-in");var q=inp.value.trim();if(!q)return;inp.value="";
  var box=document.getElementById("ai-msgs");
  box.innerHTML+='<div class="ai-bubble user">'+q+'</div>';
  box.innerHTML+='<div class="ai-bubble bot" id="ai-loading">🤔 Mmh, lasciami riflettere...</div>';
  box.scrollTop=box.scrollHeight;
  socket.emit("ask-tormenta",{roomId:ROOM,question:q},function(res){
    var ld=document.getElementById("ai-loading");if(ld)ld.remove();
    var answer=res.ok?res.response:"Le mie sinapsi sono temporaneamente offuscate. Riprova.";
    box.innerHTML+='<div class="ai-bubble bot">'+answer+'</div>';box.scrollTop=box.scrollHeight;
    speak(answer);
  });
}

function voiceAskTormenta(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert("Microfono non supportato");return}
  var rec=new SR();rec.lang="it-IT";
  rec.onresult=function(e){document.getElementById("ai-in").value=e.results[0][0].transcript;askTormenta()};
  rec.start();
}

function speak(text){
  if(!soundOn||!window.speechSynthesis)return;
  window.speechSynthesis.cancel();
  var utt=new SpeechSynthesisUtterance(text);utt.lang="it-IT";utt.rate=0.92;utt.pitch=1.1;
  var voices=speechSynthesis.getVoices();
  var itV=voices.find(function(v){return v.lang.startsWith("it")});
  if(itV)utt.voice=itV;
  speechSynthesis.speak(utt);
}
if(window.speechSynthesis){speechSynthesis.onvoiceschanged=function(){speechSynthesis.getVoices()}}

var wakeRecognition=null;var wakeListening=false;
function initVoiceDetection(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return;
  wakeRecognition=new SR();wakeRecognition.lang="it-IT";wakeRecognition.continuous=true;wakeRecognition.interimResults=true;
  wakeRecognition.onresult=function(e){
    var last=e.results[e.results.length-1];var text=last[0].transcript.toLowerCase();
    if(text.indexOf("agente tormenta")!==-1&&last.isFinal){
      var parts=text.split("agente tormenta");var question=parts[parts.length-1].trim();
      if(question&&question.length>2){document.getElementById("ai-in").value=question;openPanel("panel-ai");askTormenta()}
      else{openPanel("panel-ai");speak("Dimmi, investigatore. Cosa vuoi sapere?")}
    }
  };
  wakeRecognition.onend=function(){if(wakeListening){try{wakeRecognition.start()}catch(e){}}};
  try{wakeRecognition.start();wakeListening=true}catch(e){}
}

function toggleMic(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("Microfono non supportato");return}
  var btn=document.getElementById("mic-btn");var rec=new SR();rec.lang="it-IT";
  btn.classList.add("active");
  rec.onresult=function(e){document.getElementById("chat-in").value=e.results[0][0].transcript;sendMsg()};
  rec.onend=function(){btn.classList.remove("active")};rec.start();
}

function openPanel(id){closeAllPanels();document.getElementById(id).classList.remove("hidden");document.getElementById("overlay").classList.remove("hidden")}
function closePanel(id){document.getElementById(id).classList.add("hidden");document.getElementById("overlay").classList.add("hidden")}
function closeAllPanels(){document.querySelectorAll(".panel").forEach(function(p){p.classList.add("hidden")});document.getElementById("overlay").classList.add("hidden")}

function playAmbient(){
  if(!audioCtx||!soundOn)return;
  var osc=audioCtx.createOscillator();var gain=audioCtx.createGain();osc.type="sine";osc.frequency.value=65;gain.gain.value=0.03;osc.connect(gain).connect(audioCtx.destination);osc.start();
  var osc2=audioCtx.createOscillator();var gain2=audioCtx.createGain();osc2.type="sine";osc2.frequency.value=98;gain2.gain.value=0.02;osc2.connect(gain2).connect(audioCtx.destination);osc2.start();
}
function toggleSound(){soundOn=!soundOn;document.getElementById("sound-toggle").textContent=soundOn?"🔊":"🔇";if(!soundOn){if(window.speechSynthesis)window.speechSynthesis.cancel();if(audioCtx)audioCtx.suspend()}else{if(audioCtx)audioCtx.resume()}}

function playEffect(type){
  if(!audioCtx||!soundOn)return;var osc=audioCtx.createOscillator();var gain=audioCtx.createGain();
  if(type==="clue"){osc.frequency.value=523;gain.gain.value=0.1;osc.type="sine"}
  else if(type==="phase"){osc.frequency.value=330;gain.gain.value=0.12;osc.type="triangle"}
  else if(type==="vote"){osc.frequency.value=440;gain.gain.value=0.15;osc.type="sine"}
  osc.connect(gain).connect(audioCtx.destination);osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+1.5);osc.stop(audioCtx.currentTime+1.5);
}

function showVoting(data){
  document.getElementById("vote-box").classList.remove("hidden");
  var cb=document.querySelector(".chat-box");if(cb)cb.classList.add("hidden");
  var tb=document.querySelector(".timer-box");if(tb)tb.classList.add("hidden");
  playEffect("vote");speak("È giunto il momento della verità. Chi di voi è l'assassino? Votate ora!");
  var html="";
  for(var i=0;i<data.suspects.length;i++){var s=data.suspects[i];
    html+='<div class="vote-card" onclick="castVote(\''+s.name+'\',this)"><div class="vc-char">'+s.charName+'</div><div class="vc-role">'+s.charRole+'</div><div class="vc-name">'+s.name+'</div></div>';
  }
  document.getElementById("vote-grid").innerHTML=html;
}
function castVote(name,el){document.querySelectorAll(".vote-card").forEach(function(c){c.classList.remove("chosen")});el.classList.add("chosen");socket.emit("vote",{roomId:ROOM,suspect:name})}

function showResult(data){
  document.getElementById("vote-box").classList.add("hidden");document.getElementById("result-box").classList.remove("hidden");
  wakeListening=false;if(wakeRecognition)wakeRecognition.stop();
  var voteList="";var keys=Object.keys(data.votes);for(var i=0;i<keys.length;i++){voteList+="<p>"+keys[i]+" → <strong>"+data.votes[keys[i]]+"</strong></p>"}
  document.getElementById("result-content").innerHTML='<div class="res-card"><h2>'+(data.won?"🎉 CASO RISOLTO!":"😈 L\'ASSASSINO SFUGGE!")+'</h2><p class="'+(data.won?"res-won":"res-lost")+'">'+(data.won?"Brillante! Avete smascherato l\'assassino!":"L\'assassino vi ha ingannati tutti...")+'</p><div class="res-section"><h4>🔪 L\'assassino era:</h4><p style="font-size:1.3rem;color:var(--gold);margin:6px 0"><strong>'+data.killer.char+'</strong></p><p style="color:var(--text2)">Interpretato da <strong>'+data.killer.player+'</strong></p><p style="margin-top:6px">Movente: '+data.killer.motive+'</p></div><div class="res-section"><h4>📖 La Rivelazione dell\'Agente TORMENTA</h4><p>'+data.revelation+'</p></div><div class="res-section"><h4>🗳️ I Voti</h4>'+voteList+'</div><div class="res-section"><h4>📊 Statistiche</h4><p>Messaggi totali: '+(data.stats?.totalMessages||0)+'</p></div><button class="btn gold-btn full-btn" style="margin-top:18px" onclick="window.location.href=\'/\'">🏠 NUOVA PARTITA</button></div>';
  speak(data.revelation);
}

socket.on("chat-msg",addChatBubble);
socket.on("system-msg",function(data){addSystemMsg(data.text);if(data.type==="warning")playEffect("phase")});
socket.on("new-phase",function(data){
  document.getElementById("phase-tag").textContent="Fase "+data.num+"/"+data.total;
  document.getElementById("narr-card").innerHTML="<h3>"+data.title+"</h3><p>"+data.narrative+"</p>";
  document.getElementById("clue-text").textContent=data.clue;
  document.getElementById("clue-card").classList.remove("hidden");
  document.getElementById("priv-card").classList.add("hidden");
  startTimer(data.duration);playEffect("phase");addSystemMsg("📍 "+data.title);speak(data.narrative);
});
socket.on("private-clue",function(data){
  document.getElementById("priv-text").textContent=data.clue;
  document.getElementById("priv-card").classList.remove("hidden");
  playEffect("clue");if(navigator.vibrate)navigator.vibrate([200,100,200]);
  speak("Attenzione. Ho un indizio riservato solo per te. "+data.clue);
});
socket.on("voting-time",showVoting);
socket.on("vote-update",function(data){document.getElementById("vote-status").textContent="Voti: "+data.count+"/"+data.total});
socket.on("game-over",showResult);
