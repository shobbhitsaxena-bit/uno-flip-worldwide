const socket=io();
const $=id=>document.getElementById(id);
let me=null,roomCode=null,state=null,pendingCard=null,noticeTimer=null;
const COLORS={blue:'#2876d9',green:'#269e69',red:'#df3e4d',yellow:'#e7b92f',pink:'#e96ca8',teal:'#25b8b1',orange:'#e97d31',purple:'#8857db'};
const LABEL={draw1:'+1',draw5:'+5',reverse:'↔',skip:'⊘',skipAll:'⊘ ALL',flip:'↯',wild:'WILD',wildDraw2:'WILD +2',wildDrawColor:'WILD DRAW COLOR'};
function show(id){['lobby','room','game'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function name(){return $('playerName').value.trim().slice(0,18)||'Player';}
function error(t){$('lobbyError').textContent=t||'';}
function toast(t){$('gameNotice').textContent=t||'';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('gameNotice').textContent='',3600);}
function emitAck(event,data){return new Promise(resolve=>socket.emit(event,data,res=>resolve(res||{ok:false,error:'No response from server.'})));}
function enterRoom(res){if(!res.ok){error(res.error);return;}me=res.playerId;roomCode=res.code;localStorage.setItem('uf_player',me);localStorage.setItem('uf_room',roomCode);localStorage.setItem('uf_name',name());$('roomCodeLabel').textContent=roomCode;show('room');error('');}
$('createBtn').onclick=async()=>{error('');const r=await emitAck('createRoom',{name:name()});enterRoom(r);};
$('joinBtn').onclick=async()=>{error('');const r=await emitAck('joinRoom',{name:name(),code:$('roomCode').value});enterRoom(r);};
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
$('copyBtn').onclick=$('gameCopyBtn').onclick=()=>{const url=location.origin+'/?room='+roomCode;navigator.clipboard?.writeText(url).then(()=>toast('Invite link copied!')).catch(()=>toast('Room code: '+roomCode));};
$('startBtn').onclick=async()=>{const r=await emitAck('startGame');if(!r.ok)toast(r.error);};
$('leaveBtn').onclick=()=>{localStorage.removeItem('uf_player');localStorage.removeItem('uf_room');location.reload();};
$('drawBtn').onclick=async()=>{if(!state||state.turnId!==me)return;const r=await emitAck('drawCard');if(!r.ok)toast(r.error);};
$('passBtn').onclick=async()=>{const r=await emitAck('passTurn');if(!r.ok)toast(r.error);};
$('unoBtn').onclick=async()=>{const r=await emitAck('callUno');if(!r.ok)toast(r.error);};
$('againBtn').onclick=async()=>{const r=await emitAck('playAgain');if(!r.ok)toast(r.error);$('roundModal').classList.add('hidden');};
$('backLobbyBtn').onclick=()=>location.reload();
function renderLobby(s){$('roomCodeLabel').textContent=s.code;$('playerCount').textContent=s.players.length+' / 7';$('playerList').innerHTML=s.players.map((p,i)=>`<div class="player-row"><div class="avatar">${esc(p.name[0]||'?')}</div><div class="player-meta"><b>${esc(p.name)}</b><small>${p.connected?'Connected':'Reconnecting…'}</small></div>${i===0?'<span class="host-tag">HOST</span>':''}</div>`).join('');$('hostNote').textContent=s.players.length<2?'Waiting for at least one more player…':s.isHost?'Everyone is here. You can start the game.':'Waiting for the host to start…';$('startBtn').disabled=!s.isHost||s.players.length<2;}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function label(f){if(!f)return '?';return f.type==='number'?f.value:(LABEL[f.type]||f.value||'?');}
function cardEl(f,playable,side){const long=label(f).length>4;return `<div class="card ${f.color||'wild'} ${side==='dark'?'dark-side':'light-side'} ${playable?'playable':''}" data-card="${f.id}" title="${esc(label(f))}"><span class="card-value ${long?'long':''}">${esc(label(f))}</span></div>`;}
function isPlayable(f){if(!state.top)return true;if(['wild','wildDraw2','wildDrawColor'].includes(f.type))return true;return f.color===(state.chosenColor||state.top.color)||f.value===state.top.value||f.type===state.top.type;}
function renderGame(s){$('gameRoomCode').textContent=s.code;$('sideBadge').className='side-badge '+s.side;$('sideBadge').textContent=s.side==='light'?'☼ LIGHT SIDE':'☾ DARK SIDE';$('drawCount').textContent=s.drawCount+' cards';const current=s.players.find(p=>p.id===s.turnId);$('turnBanner').textContent=s.turnId===me?'YOUR TURN — PLAY A CARD OR DRAW':(current?current.name+' is thinking…':'Waiting…');$('myTurn').textContent=s.turnId===me?'YOUR TURN':'WAITING';$('myTurn').classList.toggle('active',s.turnId===me);$('myName').textContent='YOU';$('myCount').textContent=(s.you?.hand.length||0)+' cards';
 $('opponents').innerHTML=s.players.filter(p=>p.id!==me).map(p=>`<div class="opponent ${p.id===s.turnId?'active':''}"><b>${esc(p.name)}${p.uno?' · UNO':''}</b><small>${p.count} cards · ${p.score||0} pts</small><div class="mini-cards">${Array.from({length:Math.min(p.count,6)},()=>'<i class="mini-back"></i>').join('')}</div>${p.count===1&&!p.uno?`<button class="text-btn catch-btn" data-catch="${p.id}">CATCH UNO!</button>`:''}</div>`).join('');
 $('topCard').outerHTML=`<div id="topCard" class="card top-card ${s.top?.color||'wild'} ${s.side==='dark'?'dark-side':'light-side'}"><span class="card-value ${label(s.top).length>4?'long':''}">${esc(label(s.top))}</span></div>`;$('activeColor').textContent=s.chosenColor?'ACTIVE COLOUR: '+s.chosenColor.toUpperCase():'';
 $('myHand').innerHTML=(s.you?.hand||[]).map(f=>cardEl(f,s.turnId===me&&isPlayable(f),s.side)).join('');$('drawBtn').disabled=s.turnId!==me||!!s.drawnCard;$('drawnPrompt').classList.toggle('hidden',!s.drawnCard||s.turnId!==me);$('unoBtn').disabled=!(s.you&&s.you.hand.length===1);$('unoBtn').style.opacity=$('unoBtn').disabled?'.45':'1';
 $('myHand').querySelectorAll('[data-card]').forEach(el=>el.onclick=()=>{const card=(s.you?.hand||[]).find(c=>c.id===el.dataset.card);if(!card||s.turnId!==me||!isPlayable(card)||(s.drawnCard&&s.drawnCard.id!==card.id))return;playCard(card);});$('opponents').querySelectorAll('[data-catch]').forEach(el=>el.onclick=async()=>{const r=await emitAck('catchUno',{playerId:el.dataset.catch});if(!r.ok)toast(r.error);});
}
async function playCard(card){if(['wild','wildDraw2','wildDrawColor'].includes(card.type)){pendingCard=card;showColors();return;}const r=await emitAck('playCard',{cardId:card.id});if(!r.ok)toast(r.error);}
function showColors(){const colors=state.side==='light'?['blue','green','red','yellow']:['pink','teal','orange','purple'];$('colorOptions').innerHTML=colors.map(c=>`<button data-color="${c}" title="${c}" style="background:${COLORS[c]}"></button>`).join('');$('colorPicker').classList.remove('hidden');$('colorOptions').querySelectorAll('button').forEach(b=>b.onclick=async()=>{const r=await emitAck('playCard',{cardId:pendingCard.id,color:b.dataset.color});if(!r.ok)toast(r.error);pendingCard=null;$('colorPicker').classList.add('hidden');});}
socket.on('state',s=>{state=s;if(s.status==='lobby'){renderLobby(s);show('room');}else if(s.status==='playing'){show('game');$('roundModal').classList.add('hidden');renderGame(s);}else if(s.status==='roundover'){show('game');renderGame(s);}});
socket.on('notice',d=>toast(d.text));socket.on('unoPrompt',d=>toast(d.player+' has ONE card left — call UNO!'));
socket.on('roundover',d=>{$('roundTitle').textContent=d.gameWinner?'🏆 GAME WINNER!':d.winner+' wins the round!';$('roundText').textContent=d.winner+' scored '+d.points+' points this round. Total score: '+d.score+'. '+(d.gameWinner?'First to 500 points wins the game.':'Ready for another round?');$('againBtn').classList.toggle('hidden',d.gameWinner);$('roundModal').classList.remove('hidden');});
socket.on('connect',async()=>{const saved=localStorage.getItem('uf_player'),code=localStorage.getItem('uf_room');if(saved&&code){const r=await emitAck('rejoinRoom',{code,playerId:saved});if(!r.ok){localStorage.removeItem('uf_player');localStorage.removeItem('uf_room');}}});
$('playerName').value=localStorage.getItem('uf_name')||'';
const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite.toUpperCase();$('playerName').focus();}
