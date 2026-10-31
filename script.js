const W=960,H=540,PW=26,PH=34,MAXP=10,SPEED=5.4;
const COLORS=['#f87171','#60a5fa','#4ade80','#facc15','#c084fc','#fb923c','#2dd4bf','#f472b6','#a3e635','#38bdf8'];
const MAPS=[
 {n:'🌲 숲',g:.6,jv:-12.5,ice:0,bg:['#7dd3fc','#bbf7d0'],pc:'#6b4226',tc:'#4ade80',amb:'leaf',
  p:[[0,500,960,40],[120,400,160,16],[400,360,160,16],[680,400,160,16],[260,270,140,16],[560,270,140,16],[410,170,140,16]]},
 {n:'❄️ 얼음',g:.6,jv:-12.5,ice:1,bg:['#1e3a8a','#bae6fd'],pc:'#7dd3fc',tc:'#e0f2fe',amb:'snow',
  p:[[0,500,960,40],[60,410,200,16],[700,410,200,16],[330,330,300,16],[100,230,180,16],[680,230,180,16],[400,140,160,16]]},
 {n:'🌋 용암',g:.6,jv:-12.5,ice:0,bg:['#450a0a','#f97316'],pc:'#3f3f46',tc:'#a1a1aa',amb:'ember',lava:1,
  p:[[0,470,140,70],[820,470,140,70],[220,420,110,16],[400,360,110,16],[580,420,110,16],[300,260,110,16],[520,260,110,16],[410,160,110,16]]},
 {n:'🌌 우주',g:.28,jv:-9.5,ice:0,bg:['#020617','#4c1d95'],pc:'#334155',tc:'#a78bfa',amb:'star',wrap:1,
  p:[[0,490,200,50],[760,490,200,50],[380,430,200,16],[100,320,150,16],[710,320,150,16],[400,220,160,16],[150,130,130,16],[680,130,130,16]]}
];
const $=id=>document.getElementById(id),cv=$('c'),ctx=cv.getContext('2d');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fit(){const s=Math.min(innerWidth/W,innerHeight/H)*.98;cv.style.width=W*s+'px';cv.style.height=H*s+'px'}
addEventListener('resize',fit);fit();
document.body.dataset.ph='menu';

let peer,isHost=false,myId=null,hostConn=null,conns={},P={},inputs={},colorN=0;
let S={ph:'menu',m:0,sel:-1,tm:0,cl:0,it:null,pl:[],code:'',et:0};
let keys={},rp={},parts=[],amb=[],lastIt=null,shake=0;

/* ---------- 입력: PC 키보드 + 모바일 터치 ---------- */
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
  keys[e.code]=1;
});
addEventListener('keyup',e=>keys[e.code]=0);
addEventListener('blur',()=>{keys={};document.querySelectorAll('#pad button.on').forEach(b=>b.classList.remove('on'))});
const setTouch=()=>document.body.classList.add('touch');
if(matchMedia('(pointer:coarse)').matches||'ontouchstart' in window)setTouch();
addEventListener('touchstart',setTouch,{once:true,passive:true});
document.querySelectorAll('#pad button').forEach(b=>{
  const k=b.dataset.k;
  const on=e=>{e.preventDefault();keys[k]=1;b.classList.add('on');try{b.setPointerCapture(e.pointerId)}catch(_){}};
  const off=e=>{e.preventDefault();keys[k]=0;b.classList.remove('on')};
  b.addEventListener('pointerdown',on);
  b.addEventListener('pointerup',off);
  b.addEventListener('pointercancel',off);
  b.addEventListener('lostpointercapture',off);
  b.addEventListener('contextmenu',e=>e.preventDefault());
});
const getIn=()=>({t:'i',l:keys.ArrowLeft?1:0,r:keys.ArrowRight?1:0,j:keys.Space||keys.ArrowUp?1:0});
const nick=()=>($('name').value.trim().slice(0,8)||'플레이어'+(Math.random()*90+10|0));
const msg=t=>$('msg').textContent=t;

/* ---------- 네트워크 ---------- */
function makeCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=a[Math.random()*a.length|0];return s}
function killPeer(){if(peer){try{peer.destroy()}catch(_){}peer=null}}
function createRoom(){
  killPeer();
  const code=makeCode();msg('방 생성 중...');
  peer=new Peer('tagroom-'+code);
  peer.on('error',e=>{if(e.type==='unavailable-id')createRoom();else msg('오류: '+e.type)});
  peer.on('disconnected',()=>{try{peer.reconnect()}catch(_){}});
  peer.on('open',id=>{
    if(isHost)return;
    isHost=true;myId=id;S.code=code;S.ph='lobby';S.sel=-1;
    addPlayer(id,nick());rollMap();enterLobby();
  });
  peer.on('connection',c=>{
    c.on('data',d=>{
      if(d.t==='join'){
        if(P[c.peer])return;
        if(Object.keys(P).length>=MAXP){c.send({t:'full'});setTimeout(()=>c.close(),300);return}
        conns[c.peer]=c;addPlayer(c.peer,String(d.n||'').slice(0,8)||'플레이어');
      }else if(d.t==='i')inputs[c.peer]=d;
    });
    c.on('close',()=>leave(c.peer));
  });
}
function joinRoom(){
  const code=$('code').value.trim().toUpperCase();if(code.length<5)return msg('코드 5자리를 입력하세요');
  killPeer();msg('접속 중...');peer=new Peer();
  peer.on('error',e=>msg(e.type==='peer-unavailable'?'방을 찾을 수 없어요':'오류: '+e.type));
  peer.on('disconnected',()=>{try{peer.reconnect()}catch(_){}});
  peer.on('open',id=>{
    myId=id;hostConn=peer.connect('tagroom-'+code);
    hostConn.on('open',()=>{hostConn.send({t:'join',n:nick()});S.code=code;
      setInterval(()=>hostConn.open&&hostConn.send(getIn()),33)});
    hostConn.on('data',d=>{
      if(d.t==='full'){msg('방이 가득 찼어요 (최대 10명)');return}
      if(d.t==='s'){S=d;enterLobby()}
    });
    hostConn.on('close',()=>{alert('호스트와 연결이 끊겼어요');location.reload()});
  });
}
function leave(id){
  delete P[id];delete conns[id];delete inputs[id];
  if(S.it===id)S.it=Object.keys(P)[0]||null;
}

/* ---------- 호스트 시뮬레이션 ---------- */
function addPlayer(id,n){P[id]={i:id,n,x:0,y:0,vx:0,vy:0,c:COLORS[colorN++%COLORS.length],s:0,on:false,f:1};placeRandom(P[id])}
function placeRandom(p){const q=MAPS[S.m].p,r=q[Math.random()*q.length|0];p.x=r[0]+Math.random()*(r[2]-PW);p.y=r[1]-PH-2;p.vx=p.vy=0}
function resetPos(){Object.values(P).forEach(placeRandom)}
// 다음 맵 정하기: 랜덤 모드면 직전 맵과 다른 맵을 뽑음
function rollMap(){
  if(S.sel<0){let n;do{n=Math.random()*MAPS.length|0}while(n===S.m&&MAPS.length>1);S.m=n}
  else S.m=S.sel;
  resetPos();
}
function startGame(){
  const ids=Object.keys(P);S.it=ids[Math.random()*ids.length|0];S.tm=90;S.cl=2;S.ph='play';
  ids.forEach(i=>P[i].s=0);resetPos();
}
function step(p,inp,m){
  const tg=((inp.r||0)-(inp.l||0))*SPEED;if(tg)p.f=tg>0?1:-1;
  p.vx+=(tg-p.vx)*(m.ice?.04:.3);p.vy=Math.min(p.vy+m.g,14);
  if(inp.j&&p.on){p.vy=m.jv;p.on=false}
  p.x+=p.vx;
  for(const r of m.p)if(p.x<r[0]+r[2]&&p.x+PW>r[0]&&p.y<r[1]+r[3]&&p.y+PH>r[1]){p.x=p.vx>0?r[0]-PW:r[0]+r[2];p.vx=0}
  p.x=Math.max(0,Math.min(W-PW,p.x));
  p.y+=p.vy;p.on=false;
  for(const r of m.p)if(p.x<r[0]+r[2]&&p.x+PW>r[0]&&p.y<r[1]+r[3]&&p.y+PH>r[1]){
    if(p.vy>0){p.y=r[1]-PH;p.on=true}else p.y=r[1]+r[3];p.vy=0}
  if(p.y>H+40){if(m.wrap){p.y=-50}else placeRandom(p)}
}
function tick(dt){
  const m=MAPS[S.m];
  for(const id in P)step(P[id],id===myId?getIn():(inputs[id]||{}),m);
  if(S.ph==='play'){
    S.tm-=dt;S.cl=Math.max(0,S.cl-dt);
    const it=P[S.it];
    if(it){
      for(const id in P)if(id!==S.it)P[id].s+=dt;
      if(S.cl<=0)for(const id in P){const q=P[id];
        if(id!==S.it&&it.x<q.x+PW&&it.x+PW>q.x&&it.y<q.y+PH&&it.y+PH>q.y){S.it=id;S.cl=1.5;break}}
    }
    if(S.tm<=0){S.ph='end';S.et=8}
  }else if(S.ph==='end'){S.et-=dt;if(S.et<=0){S.ph='lobby';rollMap()}}
}
function broadcast(){
  S.pl=Object.values(P).map(p=>({i:p.i,n:p.n,x:+p.x.toFixed(1),y:+p.y.toFixed(1),vy:+p.vy.toFixed(1),f:p.f,c:p.c,s:+p.s.toFixed(1)}));
  const pkt={t:'s',ph:S.ph,m:S.m,sel:S.sel,tm:S.tm,cl:S.cl,it:S.it,pl:S.pl,code:S.code,et:S.et};
  for(const id in conns)if(conns[id].open)conns[id].send(pkt);
}

/* ---------- UI ---------- */
let uiKey='';
function enterLobby(){
  document.body.dataset.ph=S.ph;
  const inLobby=S.ph==='lobby';
  $('menu').hidden=true;$('lobby').hidden=!inLobby;
  const k=S.ph+S.m+S.sel+S.pl.map(p=>p.i+p.n).join();if(k===uiKey)return;uiKey=k;
  $('room').textContent=S.code;
  $('plist').innerHTML=S.pl.map(p=>`<span class="pl" style="background:${p.c}">${esc(p.n)}${p.i===myId?' (나)':''}</span>`).join('');
  const dis=isHost?'':'disabled';
  $('maps').innerHTML=`<button data-i="r" class="${S.sel<0?'on':''}" style="grid-column:1/-1" ${dis}>🎲 랜덤</button>`+
    MAPS.map((m,i)=>`<button data-i="${i}" class="${i===S.sel?'on':''}" ${dis}>${m.n}</button>`).join('');
  $('start').style.display=isHost?'block':'none';
  $('wait').style.color='#9ca3af';
  $('wait').textContent=`다음 맵: ${MAPS[S.m].n} · ${S.pl.length}/${MAXP}명`+(isHost?'':' · 호스트 대기 중');
}
$('maps').onclick=e=>{
  const b=e.target.closest('button');if(!b||!isHost)return;
  S.sel=b.dataset.i==='r'?-1:+b.dataset.i;rollMap();uiKey='';enterLobby();b.blur();
};
$('start').onclick=e=>{if(isHost){startGame();enterLobby();e.target.blur()}};
$('room').onclick=()=>navigator.clipboard&&navigator.clipboard.writeText(S.code);
$('create').onclick=createRoom;$('join').onclick=joinRoom;

/* ---------- 렌더링 ---------- */
function initAmb(){amb=[];for(let i=0;i<70;i++)amb.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+1,s:Math.random()*1+.3,o:Math.random()*6})}
initAmb();
function burst(x,y,c){for(let i=0;i<24;i++){const a=Math.random()*6.28,v=Math.random()*5+2;parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:1,c})}shake=10}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h)}
let T=0;
function draw(){
  T+=.016;const m=MAPS[S.m]||MAPS[0];
  ctx.save();
  if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.85}
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,m.bg[0]);g.addColorStop(1,m.bg[1]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle=m.amb==='star'?'#fff':m.amb==='snow'?'#fff':m.amb==='ember'?'#fdba74':'#86efac';
  for(const a of amb){
    if(m.amb==='ember')a.y-=a.s;else if(m.amb==='star'){}else a.y+=a.s;
    a.x+=Math.sin(T+a.o)*(m.amb==='star'?0:.5);
    if(a.y>H)a.y=0;if(a.y<0)a.y=H;
    ctx.globalAlpha=m.amb==='star'?.4+.6*Math.abs(Math.sin(T*2+a.o)):.7;
    ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,7);ctx.fill();
  }
  ctx.globalAlpha=1;
  if(m.lava){
    ctx.fillStyle='#ef4444';ctx.beginPath();ctx.moveTo(0,H);
    for(let x=0;x<=W;x+=20)ctx.lineTo(x,H-22+Math.sin(x/40+T*3)*6);
    ctx.lineTo(W,H);ctx.fill();
    ctx.fillStyle='#fbbf24aa';ctx.fillRect(0,H-6,W,6);
  }
  for(const r of m.p){
    ctx.fillStyle=m.pc;rr(r[0],r[1],r[2],r[3],5);ctx.fill();
    ctx.fillStyle=m.tc;rr(r[0],r[1],r[2],Math.min(7,r[3]),4);ctx.fill();
  }
  for(const p of S.pl){
    let q=rp[p.i];if(!q)q=rp[p.i]={x:p.x,y:p.y};
    q.x+=(p.x-q.x)*.4;q.y+=(p.y-q.y)*.4;
    const it=p.i===S.it&&S.ph!=='lobby',imm=it&&S.cl>0;
    const st=1+Math.min(Math.abs(p.vy)/40,.25);
    ctx.save();ctx.translate(q.x+PW/2,q.y+PH);
    ctx.scale(1/st,st);
    if(it){ctx.shadowColor='#ef4444';ctx.shadowBlur=18+6*Math.sin(T*8)}
    if(imm&&Math.sin(T*30)>0)ctx.globalAlpha=.4;
    ctx.fillStyle=it?'#dc2626':p.c;rr(-PW/2,-PH,PW,PH,8);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#fff';
    ctx.fillRect(-6+p.f*3,-PH+9,6,8);ctx.fillRect(3+p.f*3,-PH+9,6,8);
    ctx.fillStyle='#111';ctx.fillRect(-4+p.f*5,-PH+12,3,5);ctx.fillRect(5+p.f*5,-PH+12,3,5);
    ctx.restore();
    ctx.textAlign='center';ctx.font='bold 13px sans-serif';ctx.fillStyle='#fff';ctx.strokeStyle='#0008';ctx.lineWidth=3;
    const lb=p.n+(p.i===myId?' ★':'');ctx.strokeText(lb,q.x+PW/2,q.y-8);ctx.fillText(lb,q.x+PW/2,q.y-8);
    if(it){ctx.font='20px sans-serif';ctx.fillText('👹',q.x+PW/2,q.y-24+Math.sin(T*6)*2)}
  }
  if(S.it!==lastIt){const p=S.pl.find(x=>x.i===S.it);if(p&&lastIt&&S.ph==='play')burst(p.x+PW/2,p.y+PH/2,'#ef4444');lastIt=S.it}
  parts=parts.filter(p=>p.l>0);
  for(const p of parts){p.x+=p.vx;p.y+=p.vy;p.vy+=.2;p.l-=.03;ctx.globalAlpha=Math.max(p.l,0);ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,5,5)}
  ctx.globalAlpha=1;
  if(S.ph==='play'||S.ph==='end'){
    ctx.textAlign='center';ctx.fillStyle='#0007';rr(W/2-60,10,120,44,12);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 30px sans-serif';ctx.fillText(Math.max(0,Math.ceil(S.tm)),W/2,43);
    ctx.textAlign='left';ctx.font='bold 14px sans-serif';
    [...S.pl].sort((a,b)=>b.s-a.s).forEach((p,i)=>{
      ctx.fillStyle='#0006';rr(10,10+i*24,150,21,6);ctx.fill();
      ctx.fillStyle=p.c;ctx.fillRect(14,14+i*24,8,13);
      ctx.fillStyle='#fff';ctx.fillText((p.i===S.it?'👹 ':'')+p.n+'  '+(p.s|0)+'s',28,26+i*24)});
    if(S.it===myId&&S.ph==='play'){ctx.textAlign='center';ctx.fillStyle='#fecaca';ctx.font='bold 22px sans-serif';ctx.fillText('당신이 술래! 잡아라!',W/2,90)}
  }
  // 라운드 시작 시 맵 이름 표시
  if(S.ph==='play'&&S.tm>87.5){
    ctx.globalAlpha=Math.min(1,(S.tm-87.5)*1.2);ctx.textAlign='center';
    ctx.font='bold 54px sans-serif';ctx.fillStyle='#fff';ctx.strokeStyle='#000a';ctx.lineWidth=6;
    ctx.strokeText(m.n,W/2,H/2);ctx.fillText(m.n,W/2,H/2);ctx.globalAlpha=1;
  }
  if(S.ph==='end'){
    ctx.fillStyle='#000a';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#fbbf24';ctx.font='bold 40px sans-serif';ctx.fillText('🏆 결과',W/2,110);
    [...S.pl].sort((a,b)=>b.s-a.s).forEach((p,i)=>{ctx.fillStyle=p.c;ctx.font='bold 22px sans-serif';ctx.fillText(`${i+1}위  ${p.n}  ${p.s|0}초 생존`,W/2,165+i*32)});
  }
  if(S.ph==='lobby'){ctx.textAlign='center';ctx.fillStyle='#fff8';ctx.font='14px sans-serif';ctx.fillText('로비 — 맵 미리보기',W/2,H-12)}
  ctx.restore();
}

/* ---------- 메인 루프 ---------- */
let last=performance.now(),acc=0,fc=0;
function loop(now){
  requestAnimationFrame(loop);
  acc+=Math.min(now-last,100);last=now;
  if(isHost){
    while(acc>=16.67){tick(1/60);acc-=16.67;if(++fc%2===0)broadcast()}
    S.pl=Object.values(P).map(p=>({i:p.i,n:p.n,x:p.x,y:p.y,vy:p.vy,f:p.f,c:p.c,s:p.s}));
    enterLobby();
  }else acc=0;
  if(S.ph!=='menu')draw();else{ctx.fillStyle='#0b0d17';ctx.fillRect(0,0,W,H)}
}
requestAnimationFrame(loop);
