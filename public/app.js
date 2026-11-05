const socket=io(),$=id=>document.getElementById(id);
let code="",me="",isHost=false,drawerId=null,canDraw=false,drawing=false,eraseMode=false;
const canvas=$("board"),ctx=canvas.getContext("2d");ctx.lineCap=ctx.lineJoin="round";
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2300)}
// Efeitos sonoros sintetizados no navegador: não precisam de arquivos externos.
let audioContext;
function playFeedback(kind){
  try {
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    audioContext ||= new AudioCtx();
    if(audioContext.state==="suspended") audioContext.resume();
    const now=audioContext.currentTime;
    const notes=kind==="correct"?[523.25,659.25,783.99]:[220,174.61];
    notes.forEach((freq,i)=>{
      const osc=audioContext.createOscillator(), gain=audioContext.createGain();
      osc.type=kind==="correct"?"sine":"triangle";
      osc.frequency.setValueAtTime(freq,now+i*0.13);
      gain.gain.setValueAtTime(0.0001,now+i*0.13);
      gain.gain.exponentialRampToValueAtTime(0.16,now+i*0.13+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+i*0.13+0.19);
      osc.connect(gain);gain.connect(audioContext.destination);
      osc.start(now+i*0.13);osc.stop(now+i*0.13+0.2);
    });
  } catch(e) { /* áudio opcional: o jogo continua mesmo se o navegador bloquear */ }
}
function showGame(c){code=c;$("home").hidden=true;$("game").hidden=false;$("codeLabel").textContent=c}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));$("createPane").hidden=b.dataset.tab!=="create";$("joinPane").hidden=b.dataset.tab!=="join";$("homeError").textContent=""});
$("createBtn").onclick=()=>{const words=$("words").value.split(/[\n,;]/).map(x=>x.trim()).filter(Boolean);socket.emit("createRoom",{name:$("hostName").value,words},r=>{if(r.error){$("homeError").textContent=r.error;return}me=socket.id;isHost=true;showGame(r.code);toast("Sala criada! Compartilhe o código.")})};
$("joinBtn").onclick=()=>socket.emit("joinRoom",{name:$("playerName").value,code:$("roomCode").value},r=>{if(r.error){$("homeError").textContent=r.error;return}me=socket.id;showGame(r.code)});
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+" — Código: "+code);toast("Convite copiado!")}catch{toast("Código da sala: "+code)}};
$("startBtn").onclick=()=>socket.emit("startGame",{code},r=>{if(r?.error)toast(r.error)});
function renderPlayers(players){$("count").textContent=players.length+"/35";$("players").innerHTML="";players.sort((a,b)=>b.score-a.score).forEach(p=>{const d=document.createElement("div");d.className="player"+(p.id===drawerId?" drawer":"");d.textContent=(p.id===drawerId?"✏️ ":"")+p.name+(p.connected?"":" (saiu)");const s=document.createElement("b");s.textContent=p.score+" pts";d.append(s);$("players").append(d)})}
function message(name,text,system=false){const d=document.createElement("div");d.className=system?"system":"msg";if(!system){const b=document.createElement("b");b.textContent=name+": ";d.append(b)}d.append(document.createTextNode(text));$("chat").append(d);$("chat").scrollTop=$("chat").scrollHeight}
socket.on("state",s=>{code=s.code;drawerId=s.drawerId;renderPlayers(s.players);$("phaseLabel").textContent=s.phase==="waiting"?"Aguardando jogadores":s.phase==="finished"?"Partida encerrada":"Partida em andamento";$("roundLabel").textContent=s.phase==="playing"?"Rodada "+s.round+" de "+s.totalRounds:s.phase==="finished"?"Finalizada":"Preparando";$("startBtn").hidden=!(s.hostId===socket.id&&s.phase==="waiting");canDraw=s.phase==="playing"&&drawerId===socket.id;$("tools").hidden=!canDraw;$("guessArea").hidden=s.phase!=="playing"||canDraw;if(s.phase==="waiting")$("notice").textContent="Compartilhe o código da sala. O anfitrião inicia quando todos estiverem prontos.";if(s.phase==="playing")$("notice").textContent=canDraw?"Você foi sorteado! Desenhe a palavra secreta.":"Observe o desenho e tente adivinhar!";if(s.phase==="finished")$("results").hidden=false});
socket.on("yourWord",w=>{$("wordHint").innerHTML="Sua palavra: <strong></strong>";$("wordHint").querySelector("strong").textContent=w});
socket.on("roundStarted",r=>{ctx.clearRect(0,0,canvas.width,canvas.height);$("chat").innerHTML="";message("Sistema","Rodada "+r.round+" começou!",true)});
socket.on("tick",n=>$("timer").textContent="00:"+String(n).padStart(2,"0"));
socket.on("roundEnded",r=>{message("Sistema","Tempo esgotado! Palavra: "+r.word,true);$("wordHint").textContent="Próxima rodada em instantes..."});
socket.on("chatMessage",m=>message(m.name,m.text));socket.on("systemMessage",m=>message("Sistema",m.text,true));
socket.on("finished",list=>{$("results").hidden=false;$("ranking").innerHTML="";list.forEach((p,i)=>{const d=document.createElement("div");d.className="rank";d.textContent=(i+1)+"º — "+p.name+" — "+p.score+" pontos";$("ranking").append(d)})});
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function send(type,data){socket.emit("draw",{code,data:{type,...data}})}
canvas.addEventListener("pointerdown",e=>{if(!canDraw)return;drawing=true;const p=pos(e);canvas.setPointerCapture(e.pointerId);send("begin",{...p,color:eraseMode?"#ffffff":$("color").value,width:eraseMode?28:Number($("width").value)})});
canvas.addEventListener("pointermove",e=>{if(!drawing||!canDraw)return;send("move",pos(e))});
function end(){if(drawing){drawing=false;send("end",{})}}
canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
socket.on("draw",({data})=>{if(data.type==="clear"){ctx.clearRect(0,0,canvas.width,canvas.height);return}if(data.type==="begin"){ctx.beginPath();ctx.strokeStyle=data.color;ctx.lineWidth=data.width;ctx.moveTo(data.x,data.y)}if(data.type==="move"){ctx.lineTo(data.x,data.y);ctx.stroke()}if(data.type==="end")ctx.closePath()});
$("color").oninput=()=>eraseMode=false;$("erase").onclick=()=>eraseMode=true;$("clear").onclick=()=>{if(canDraw){ctx.clearRect(0,0,canvas.width,canvas.height);send("clear",{})}};
function submit(){const text=$("guessInput").value.trim();if(!text)return;socket.emit("guess",{code,text},r=>{if(r?.correct){playFeedback("correct");toast("Acertou! +"+r.points+" pontos");$("guessInput").value=""}else if(r?.correct===false){playFeedback("wrong");$("guessInput").value=""}})}
$("guessBtn").onclick=submit;$("guessInput").addEventListener("keydown",e=>{if(e.key==="Enter")submit()});
