const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET','POST'] }, pingInterval: 25000, pingTimeout: 20000 });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const rooms = new Map();
const LIGHT = ['blue','green','red','yellow'];
const DARK = ['pink','teal','orange','purple'];
const uid = () => crypto.randomBytes(4).toString('hex');
const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
function makeDeck(){
  const deck=[]; let n=0;
  const pairs={blue:'pink',green:'teal',red:'orange',yellow:'purple'};
  for(const color of LIGHT){
    const darkColor=pairs[color];
    for(let v=1;v<=9;v++) for(let k=0;k<2;k++) deck.push({id:'c'+(++n),sides:{light:{color,value:String(v),type:'number'},dark:{color:darkColor,value:String(v),type:'number'}}});
    const actions=[['draw1','draw5'],['reverse','reverse'],['skip','skipAll'],['flip','flip']];
    for(const [lt,dt] of actions) for(let k=0;k<2;k++) deck.push({id:'c'+(++n),sides:{light:{color,value:lt,type:lt},dark:{color:darkColor,value:dt,type:dt}}});
  }
  for(let k=0;k<4;k++) deck.push({id:'c'+(++n),sides:{light:{color:'wild',value:'wild',type:'wild'},dark:{color:'wild',value:'wild',type:'wild'}}});
  for(let k=0;k<4;k++) deck.push({id:'c'+(++n),sides:{light:{color:'wild',value:'wildDraw2',type:'wildDraw2'},dark:{color:'wild',value:'wildDrawColor',type:'wildDrawColor'}}});
  return deck;
}
function face(card,side){return card.sides[side];}
function freshRoom(code,host){return {code,host,players:[],status:'lobby',side:'light',direction:1,draw:[],discard:[],turn:0,chosenColor:null,round:1,challenge:null,drawnCard:null,scores:{},created:Date.now()};}
function roomFor(socket){const code=socket.data.room; return code&&rooms.get(code);}
function publicState(r,forId){
 const top=r.discard[r.discard.length-1];
 return {code:r.code,isHost:r.host===r.players.find(p=>p.id===forId)?.socket,status:r.status,side:r.side,direction:r.direction,top:top?{...face(top,r.side),id:top.id}:null,chosenColor:r.chosenColor,drawCount:r.draw.length,turnId:r.players[r.turn]?.id,players:r.players.map(p=>({id:p.id,name:p.name,count:p.hand.length,connected:p.connected,score:r.scores[p.id]||0,uno:p.uno})),you:r.players.find(p=>p.id===forId)?{id:forId,hand:r.players.find(p=>p.id===forId).hand.map(c=>({...face(c,r.side),id:c.id,other:face(c,r.side==='light'?'dark':'light')})),uno:r.players.find(p=>p.id===forId).uno}:null,round:r.round,challenge:r.challenge?{challenger:r.challenge.challenger,offender:r.challenge.offender,type:r.challenge.type,chosen:r.challenge.chosen}:null,drawnCard:r.drawnCard&&r.drawnCard.player===forId?r.drawnCard.card:null};
}
function emitRoom(r){for(const p of r.players) if(p.socket) io.to(p.socket).emit('state',publicState(r,p.id));}
function broadcast(r,event,data){io.to(r.code).emit(event,data);}
function nextIndex(r,from=r.turn,steps=1){let i=from;for(let k=0;k<steps;k++)i=(i+r.direction+r.players.length)%r.players.length;return i;}
function recycle(r){if(r.draw.length===0&&r.discard.length>1){const top=r.discard.pop();r.draw=shuffle(r.discard);r.discard=[top];}}
function drawOne(r){recycle(r);return r.draw.pop()||null;}
function startRound(r){const deck=shuffle(makeDeck());r.side='light';r.direction=1;r.draw=deck;r.discard=[];r.players.forEach(p=>{p.hand=[];p.uno=false;for(let i=0;i<7;i++)p.hand.push(drawOne(r));});let first=drawOne(r);while(first&&['wildDraw2','wildDrawColor','wild'].includes(face(first,'light').type)){r.draw.unshift(first);first=drawOne(r);}r.discard=[first];r.turn=0;r.chosenColor=null;r.challenge=null;r.drawnCard=null;r.status='playing';r.round++;emitRoom(r);broadcast(r,'notice',{text:'Round started. Light Side is up!'});}
function canPlay(card,top,side,chosen){const f=face(card,side),t=face(top,side);if(f.type==='wild'||f.type==='wildDraw2'||f.type==='wildDrawColor')return true;return f.color===(chosen||t.color)||f.value===t.value||f.type===t.type;}
function advance(r,steps=1){r.turn=nextIndex(r,r.turn,steps);r.drawnCard=null;}
function finishRound(r,winner){r.status='roundover';let points=0;for(const p of r.players)if(p.id!==winner.id)for(const c of p.hand){const f=face(c,r.side);points+=f.type==='number'?Number(f.value):f.type==='wildDrawColor'?60:['wild','wildDraw2'].includes(f.type)?50:20;}r.scores[winner.id]=(r.scores[winner.id]||0)+points;broadcast(r,'roundover',{winner:winner.name,points,score:r.scores[winner.id],gameWinner:r.scores[winner.id]>=500});emitRoom(r);}
function applyCard(r,p,card,color){const f=face(card,r.side),type=f.type,oldSide=r.side;const idx=p.hand.findIndex(c=>c.id===card.id);if(idx<0)return false;
 if((type==='wildDraw2'||type==='wildDrawColor')&&r.discard.length){const active=r.chosenColor||face(r.discard[r.discard.length-1],r.side).color;const hasColor=p.hand.some(c=>c.id!==card.id&&face(c,r.side).color===active);if(hasColor)return 'illegal';}
 p.hand.splice(idx,1);r.drawnCard=null;r.discard.push(card);r.chosenColor=(type==='wild'||type==='wildDraw2'||type==='wildDrawColor')?color:null;
 if(type==='flip'){r.side=oldSide==='light'?'dark':'light';r.chosenColor=null;}
 if(p.hand.length===1)p.uno=false;
 if(type==='reverse'){r.direction*=-1;if(r.players.length===2)advance(r,2);else advance(r,1);}
 else if(type==='skip'||type==='draw1'||type==='draw5'||type==='wildDraw2'||type==='wildDrawColor'){
   const victim=r.players[nextIndex(r)];if(type==='draw1'||type==='draw5'){for(let i=0;i<(type==='draw1'?1:5);i++){const c=drawOne(r);if(c)victim.hand.push(c);}advance(r,2);}
   else if(type==='wildDraw2'){for(let i=0;i<2;i++){const c=drawOne(r);if(c)victim.hand.push(c);}advance(r,2);}
   else if(type==='wildDrawColor'){let c;do{c=drawOne(r);if(!c)break;victim.hand.push(c);}while(face(c,r.side).color!==color);advance(r,2);}
   else advance(r,2);
 }
 else if(type==='skipAll'){advance(r,r.players.length);}
 else advance(r,1);
 if(p.hand.length===0){finishRound(r,p);return true;}
 return true;
}
function validSocket(socket,r){return r&&r.players.some(p=>p.socket===socket.id);}
io.on('connection',socket=>{
 socket.on('createRoom',({name},cb)=>{name=String(name||'Player').trim().slice(0,18)||'Player';let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));const r=freshRoom(code,socket.id);const p={id:uid(),socket:socket.id,name,hand:[],connected:true,uno:false};r.players.push(p);r.scores[p.id]=0;rooms.set(code,r);socket.data.room=code;socket.join(code);cb?.({ok:true,code,playerId:p.id});emitRoom(r);});
 socket.on('joinRoom',({code,name},cb)=>{code=String(code||'').trim().toUpperCase();name=String(name||'Player').trim().slice(0,18)||'Player';const r=rooms.get(code);if(!r)return cb?.({ok:false,error:'Room not found. Check the code.'});if(r.status!=='lobby')return cb?.({ok:false,error:'This game has already started.'});if(r.players.length>=7)return cb?.({ok:false,error:'Room is full (7 players maximum).'});if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))name=name.slice(0,14)+'_'+Math.floor(Math.random()*90+10);const p={id:uid(),socket:socket.id,name,hand:[],connected:true,uno:false};r.players.push(p);r.scores[p.id]=0;socket.data.room=code;socket.join(code);cb?.({ok:true,code,playerId:p.id});emitRoom(r);broadcast(r,'notice',{text:name+' joined the room.'});});
 socket.on('rejoinRoom',({code,playerId},cb)=>{code=String(code||'').trim().toUpperCase();const r=rooms.get(code);const p=r&&r.players.find(x=>x.id===playerId);if(!r||!p)return cb?.({ok:false,error:'Your seat could not be restored. Join a new room.'});if(p.socket&&p.socket!==socket.id){const old=io.sockets.sockets.get(p.socket);if(old)old.disconnect(true);}if(r.host&&!io.sockets.sockets.has(r.host))r.host=socket.id;p.socket=socket.id;p.connected=true;socket.data.room=code;socket.join(code);if(!r.host)r.host=socket.id;cb?.({ok:true,code,playerId});broadcast(r,'notice',{text:p.name+' reconnected.'});emitRoom(r);});
 socket.on('startGame',cb=>{const r=roomFor(socket);if(!validSocket(socket,r))return cb?.({ok:false,error:'Join a room first.'});if(r.host!==socket.id)return cb?.({ok:false,error:'Only the room host can start.'});if(r.players.length<2)return cb?.({ok:false,error:'At least 2 players are required.'});if(r.players.length>7)return cb?.({ok:false,error:'Maximum 7 players.'});r.round=0;startRound(r);cb?.({ok:true});});
 socket.on('playCard',({cardId,color},cb)=>{const r=roomFor(socket);if(!validSocket(socket,r)||r.status!=='playing')return cb?.({ok:false,error:'Game is not active.'});const p=r.players.find(p=>p.socket===socket.id);if(r.players[r.turn].id!==p.id)return cb?.({ok:false,error:'It is not your turn.'});const card=p.hand.find(c=>c.id===cardId);if(r.drawnCard&&r.drawnCard.player===p.id&&r.drawnCard.card.id!==cardId)return cb?.({ok:false,error:'After drawing, you may only play the card you just drew.'});if(!card)return cb?.({ok:false,error:'Card not found.'});const top=r.discard[r.discard.length-1];if(!canPlay(card,top,r.side,r.chosenColor))return cb?.({ok:false,error:'That card does not match.'});const f=face(card,r.side);if(['wild','wildDraw2','wildDrawColor'].includes(f.type)&&!['blue','green','red','yellow','pink','teal','orange','purple'].includes(color))return cb?.({ok:false,error:'Choose a valid colour.'});const result=applyCard(r,p,card,color);if(result==='illegal')return cb?.({ok:false,error:'You cannot play that draw-wild card while holding a card of the current colour.'});if(p.hand.length===1){p.uno=false;broadcast(r,'unoPrompt',{player:p.name,id:p.id});}if(result){cb?.({ok:true});emitRoom(r);if(r.status==='playing')broadcast(r,'notice',{text:p.name+' played '+f.type+'.'});} });
 socket.on('drawCard',cb=>{const r=roomFor(socket);if(!validSocket(socket,r)||r.status!=='playing')return cb?.({ok:false,error:'Game is not active.'});const p=r.players.find(p=>p.socket===socket.id);if(r.players[r.turn].id!==p.id)return cb?.({ok:false,error:'Not your turn.'});if(r.drawnCard)return cb?.({ok:false,error:'You already drew a card.'});const c=drawOne(r);if(!c)return cb?.({ok:false,error:'No cards available.'});p.hand.push(c);r.drawnCard={player:p.id,card:{...face(c,r.side),id:c.id}};emitRoom(r);cb?.({ok:true,card:r.drawnCard.card});});
 socket.on('passTurn',cb=>{const r=roomFor(socket);if(!validSocket(socket,r)||r.status!=='playing')return cb?.({ok:false,error:'Game is not active.'});const p=r.players.find(p=>p.socket===socket.id);if(r.players[r.turn].id!==p.id)return cb?.({ok:false,error:'Not your turn.'});if(!r.drawnCard)return cb?.({ok:false,error:'Draw a card first.'});advance(r);emitRoom(r);cb?.({ok:true});});
 socket.on('callUno',cb=>{const r=roomFor(socket);if(!validSocket(socket,r))return cb?.({ok:false,error:'Join a room first.'});const p=r.players.find(p=>p.socket===socket.id);if(p.hand.length!==1)return cb?.({ok:false,error:'UNO is available when you have one card.'});p.uno=true;broadcast(r,'notice',{text:p.name+' called UNO!'});emitRoom(r);cb?.({ok:true});});
 socket.on('catchUno',({playerId},cb)=>{const r=roomFor(socket);if(!validSocket(socket,r)||r.status!=='playing')return cb?.({ok:false,error:'Game is not active.'});const target=r.players.find(p=>p.id===playerId);if(!target||target.hand.length!==1||target.uno||r.players[r.turn].id===target.id)return cb?.({ok:false,error:'Too late or player already called UNO.'});for(let i=0;i<2;i++){const c=drawOne(r);if(c)target.hand.push(c);}target.uno=true;broadcast(r,'notice',{text:target.name+' was caught! Draws 2 cards.'});emitRoom(r);cb?.({ok:true});});
 socket.on('playAgain',cb=>{const r=roomFor(socket);if(!validSocket(socket,r)||r.status!=='roundover')return cb?.({ok:false,error:'Round is still in progress.'});if(r.scores[r.players.find(p=>p.socket===socket.id).id]>=500)return cb?.({ok:false,error:'The game has a winner.'});startRound(r);cb?.({ok:true});});
 socket.on('disconnect',()=>{const r=roomFor(socket);if(!r)return;const p=r.players.find(p=>p.socket===socket.id);if(p){p.connected=false;p.socket=null;broadcast(r,'notice',{text:p.name+' disconnected. They can rejoin only by refreshing?'});emitRoom(r);setTimeout(()=>{const room=rooms.get(r.code);if(room&&room.status==='lobby'){room.players=room.players.filter(x=>x.id!==p.id);if(room.players.length===0)rooms.delete(room.code);else if(room.host===socket.id)room.host=room.players[0].socket;}},120000);}});
});
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`UNO Flip server listening on ${PORT}`));
