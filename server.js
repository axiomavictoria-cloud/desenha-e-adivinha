const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const rooms = new Map();
const MAX = 35, ROUNDS = 9, SECONDS = 45;
const clean = value => String(value || "").trim().slice(0, 24);
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();

function state(room) {
  return {
    code: room.code,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:p.score, connected:p.connected })),
    phase: room.phase, round: room.round, totalRounds: ROUNDS,
    secondsLeft: room.secondsLeft, drawerId: room.drawerId,
    drawerName: room.players.get(room.drawerId)?.name || "",
    wordLength: room.phase === "playing" ? room.word.length : 0,
    hostId: room.hostId
  };
}
function broadcast(room) { io.to(room.code).emit("state", state(room)); }
function stop(room) { if (room.timer) clearInterval(room.timer); room.timer = null; }
function nextRound(room) {
  stop(room);
  if (room.round >= ROUNDS) {
    room.phase = "finished"; room.secondsLeft = 0; room.drawerId = null; room.word = "";
    broadcast(room);
    io.to(room.code).emit("finished", [...room.players.values()].sort((a,b)=>b.score-a.score).map(p=>({name:p.name,score:p.score})));
    return;
  }
  const eligible = [...room.players.values()].filter(p => p.connected);
  if (!eligible.length) { room.phase = "waiting"; broadcast(room); return; }
  let pool = eligible.filter(p => !room.drawn.has(p.id));
  if (!pool.length) { room.drawn.clear(); pool = eligible; }
  const drawer = pool[Math.floor(Math.random()*pool.length)];
  room.drawn.add(drawer.id);
  room.round++;
  room.drawerId = drawer.id;
  room.word = room.words[(room.round-1) % room.words.length];
  room.guessed = new Set();
  room.messages = [];
  room.phase = "playing";
  room.secondsLeft = SECONDS;
  broadcast(room);
  io.to(drawer.id).emit("yourWord", room.word);
  io.to(room.code).emit("roundStarted", {round:room.round,seconds:SECONDS});
  room.timer = setInterval(() => {
    room.secondsLeft--;
    io.to(room.code).emit("tick", room.secondsLeft);
    if (room.secondsLeft <= 0) {
      io.to(room.code).emit("roundEnded", {word:room.word});
      setTimeout(() => nextRound(room), 1800);
      stop(room);
    }
  }, 1000);
}
io.on("connection", socket => {
  socket.on("createRoom", ({name,words}, cb=()=>{}) => {
    name = clean(name);
    const list = [...new Set((Array.isArray(words)?words:[]).map(w=>String(w).trim().slice(0,40)).filter(Boolean))];
    if (!name) return cb({error:"Digite seu apelido."});
    if (list.length < 9) return cb({error:"Cadastre pelo menos 9 palavras."});
    let id; do { id=code(); } while (rooms.has(id));
    const room = {code:id,hostId:socket.id,words:list,players:new Map(),phase:"waiting",round:0,secondsLeft:0,drawerId:null,word:"",guessed:new Set(),drawn:new Set(),messages:[],timer:null};
    rooms.set(id,room);
    room.players.set(socket.id,{id:socket.id,name,score:0,connected:true});
    socket.join(id); cb({ok:true,code:id}); broadcast(room);
  });
  socket.on("joinRoom", ({code:id,name}, cb=()=>{}) => {
    id=String(id||"").trim().toUpperCase(); name=clean(name);
    const room=rooms.get(id);
    if (!room) return cb({error:"Sala não encontrada."});
    if (!name) return cb({error:"Digite seu apelido."});
    if (room.players.size>=MAX) return cb({error:"A sala já atingiu 35 jogadores."});
    if (room.phase!=="waiting") return cb({error:"A partida já começou."});
    room.players.set(socket.id,{id:socket.id,name,score:0,connected:true});
    socket.join(id); cb({ok:true,code:id}); broadcast(room);
  });
  socket.on("startGame", ({code:id}, cb=()=>{}) => {
    const room=rooms.get(String(id||"").toUpperCase());
    if (!room || room.hostId!==socket.id) return cb({error:"Somente o anfitrião pode iniciar."});
    if (room.players.size<2) return cb({error:"É preciso ter pelo menos 2 jogadores."});
    if (room.phase!=="waiting") return cb({error:"A partida já foi iniciada."});
    room.drawn.clear(); room.round=0; room.players.forEach(p=>p.score=0);
    cb({ok:true}); nextRound(room);
  });
  socket.on("draw", ({code:id,data}) => {
    const room=rooms.get(String(id||"").toUpperCase());
    if (!room || room.phase!=="playing" || room.drawerId!==socket.id || !data || !["begin","move","end","clear"].includes(data.type)) return;
    io.to(room.code).emit("draw",{from:socket.id,data});
  });
  socket.on("guess", ({code:id,text}, cb=()=>{}) => {
    const room=rooms.get(String(id||"").toUpperCase());
    if (!room || room.phase!=="playing" || socket.id===room.drawerId || room.guessed.has(socket.id)) return;
    const player=room.players.get(socket.id), guess=clean(text);
    if (!player || !guess) return;
    if (guess.localeCompare(room.word,undefined,{sensitivity:"base"})===0) {
      room.guessed.add(socket.id);
      const points=Math.max(10,Math.round(room.secondsLeft/SECONDS*100));
      player.score+=points;
      io.to(room.code).emit("systemMessage",{text:player.name+" acertou! +"+points+" pontos."});
      cb({correct:true,points}); broadcast(room);
    } else {
      io.to(room.code).emit("chatMessage",{name:player.name,text:guess});
      cb({correct:false});
    }
  });
  socket.on("disconnect",()=>{
    for (const room of rooms.values()) {
      const p=room.players.get(socket.id);
      if (p) { p.connected=false; if (room.drawerId===socket.id && room.phase==="playing") { stop(room); io.to(room.code).emit("systemMessage",{text:"O desenhista saiu. Indo para a próxima rodada."}); setTimeout(()=>nextRound(room),1200); } broadcast(room); }
    }
  });
});
server.listen(PORT,()=>console.log("Jogo no ar na porta "+PORT));
