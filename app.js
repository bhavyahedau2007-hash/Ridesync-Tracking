(()=>{
'use strict';
const STRAGGLER_THRESHOLD=500,SYNC_INTERVAL=2000,STORAGE_PREFIX='ridesync_';
let S={screen:'home',myName:'',myId:genId(),myColor:randColor(),rideCode:'',isLeader:false,
map:null,watchId:null,syncTimer:null,timeTimer:null,myPos:null,riders:{},markers:{},
drawerOpen:true,dest:null,destName:'',destMarker:null,routePath:null,
myPath:[],pathLine:null,startTime:null,totalDist:0,scheduled:JSON.parse(localStorage.getItem('ridesync_scheduled')||'[]')};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);

function init(){initHomeMap();bindEvents();checkUrl();renderScheduled();}

function initHomeMap(){
const m=L.map('home-map-bg',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,touchZoom:false,doubleClickZoom:false}).setView([20.59,78.96],5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(m);
}

function bindEvents(){
$('#btn-create').onclick=()=>showScreen('screen-create');
$('#btn-join').onclick=()=>showScreen('screen-join');
$('#btn-scheduled').onclick=()=>showScreen('screen-scheduled');
$('#create-back').onclick=$('#create-backdrop').onclick=()=>showScreen('screen-home');
$('#join-back').onclick=$('#join-backdrop').onclick=()=>showScreen('screen-home');
$('#sched-back').onclick=$('#sched-backdrop').onclick=()=>showScreen('screen-home');
$('#create-name').oninput=valCreate;
$('#create-dest').oninput=debounce(searchDest,400);
$('#create-dest').onfocus=()=>{if($('#create-dest').value.length>1)searchDest();};
$('#join-name').oninput=valJoin;
$('#join-code').oninput=e=>{e.target.value=e.target.value.toUpperCase();valJoin();};
$('#btn-create-go').onclick=handleCreate;
$('#btn-join-go').onclick=handleJoin;
$('#btn-copy-link').onclick=copyLink;
$('#btn-share-start').onclick=startTracking;
$('#fab-center').onclick=centerGroup;
$('#fab-break').onclick=reqBreak;
$('#fab-end').onclick=endRide;
$('#drawer-handle').onclick=toggleDrawer;
$('#btn-share-stats').onclick=shareStats;
$('#btn-download-stats').onclick=downloadStats;
$('#btn-back-home').onclick=()=>showScreen('screen-home');
$('#create-name').onkeydown=e=>{if(e.key==='Enter')handleCreate();};
$('#join-code').onkeydown=e=>{if(e.key==='Enter')handleJoin();};
$('#timing-now').onclick=()=>{$('#timing-now').classList.add('active');$('#timing-later').classList.remove('active');$('#schedule-fields').classList.add('hidden');$('#create-btn-text').textContent='Create & Get Link';};
$('#timing-later').onclick=()=>{$('#timing-later').classList.add('active');$('#timing-now').classList.remove('active');$('#schedule-fields').classList.remove('hidden');$('#create-btn-text').textContent='Schedule Ride';setDefaultDateTime();};
}

function showScreen(id){$$('.screen').forEach(s=>s.classList.remove('active'));$('#'+id).classList.add('active');S.screen=id;}
function checkUrl(){const c=new URLSearchParams(location.search).get('ride');if(c){showScreen('screen-join');$('#join-code').value=c.toUpperCase();valJoin();}}
function valCreate(){$('#btn-create-go').disabled=!$('#create-name').value.trim();}
function valJoin(){$('#btn-join-go').disabled=!($('#join-name').value.trim()&&$('#join-code').value.trim().length>=6);}

function setDefaultDateTime(){
const now=new Date();now.setDate(now.getDate()+1);now.setHours(7,0,0,0);
$('#sched-date').value=now.toISOString().split('T')[0];$('#sched-time').value='07:00';
}

// DESTINATION SEARCH (Nominatim)
function searchDest(){
const q=$('#create-dest').value.trim();if(q.length<2){$('#dest-suggestions').classList.add('hidden');return;}
fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`)
.then(r=>r.json()).then(data=>{
const box=$('#dest-suggestions');
if(!data.length){box.classList.add('hidden');return;}
box.innerHTML=data.map(d=>`<div class="dest-sug-item" data-lat="${d.lat}" data-lng="${d.lon}">${d.display_name}</div>`).join('');
box.classList.remove('hidden');
box.querySelectorAll('.dest-sug-item').forEach(item=>{
item.onclick=()=>{
S.dest={lat:+item.dataset.lat,lng:+item.dataset.lng};
S.destName=item.textContent.split(',')[0];
$('#create-dest').value=S.destName;
box.classList.add('hidden');
};});
}).catch(()=>{});
}

// CREATE
function handleCreate(){
const name=$('#create-name').value.trim();if(!name)return;
S.myName=name;S.isLeader=true;S.rideCode=genCode();
const isScheduled=$('#timing-later').classList.contains('active');
if(isScheduled){
const d=$('#sched-date').value,t=$('#sched-time').value;
if(!d||!t){toast('danger','⚠️ Please set date and time');return;}
S.scheduled.push({code:S.rideCode,dest:S.destName||'Open ride',date:d,time:t,leader:name});
localStorage.setItem('ridesync_scheduled',JSON.stringify(S.scheduled));
renderScheduled();toast('success','📅 Ride scheduled!');showScreen('screen-home');return;
}
$('#share-code-display').textContent=S.rideCode;
$('#share-link').value=`${location.origin}${location.pathname}?ride=${S.rideCode}`;
if(S.destName){$('#share-dest-info').classList.remove('hidden');$('#share-dest-name').textContent=S.destName;}
else{$('#share-dest-info').classList.add('hidden');}
showScreen('screen-share');
}

function handleJoin(){
const name=$('#join-name').value.trim(),code=$('#join-code').value.trim().toUpperCase();
if(!name||code.length<6)return;S.myName=name;S.rideCode=code;S.isLeader=false;
// Try to load dest from leader's storage
loadDestFromStorage();startTracking();
}

function loadDestFromStorage(){
const prefix=`${STORAGE_PREFIX}${S.rideCode}_dest`;
try{const d=localStorage.getItem(prefix);if(d){const p=JSON.parse(d);S.dest=p.dest;S.destName=p.name;}}catch(e){}
}

function copyLink(){
navigator.clipboard.writeText($('#share-link').value).then(()=>{
const b=$('#btn-copy-link');b.classList.add('copied');
b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
setTimeout(()=>{b.classList.remove('copied');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';},2000);
});
}

// SCHEDULED LIST
function renderScheduled(){
const list=$('#sched-list');
if(!S.scheduled.length){list.innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><p>No scheduled rides yet.<br>Create one to get started!</p></div>';return;}
list.innerHTML=S.scheduled.map((s,i)=>{
const d=new Date(s.date+'T00:00');const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
return `<div class="sched-item"><div class="sched-date-badge"><div class="sdb-month">${months[d.getMonth()]}</div><div class="sdb-day">${d.getDate()}</div></div><div class="sched-info"><div class="si-dest">${s.dest}</div><div class="si-time">${s.time} · by ${s.leader}</div></div><span class="sched-code">${s.code}</span></div>`;
}).join('');
}

// START TRACKING
function startTracking(){
showScreen('screen-map');$('#topbar-code').textContent=S.rideCode;
S.riders[S.myId]={name:S.myName,color:S.myColor,lat:null,lng:null,speed:0,lastSeen:Date.now(),status:'online',isMe:true};
S.startTime=Date.now();S.totalDist=0;S.myPath=[];
// Save destination for joiners
if(S.dest&&S.isLeader){try{localStorage.setItem(`${STORAGE_PREFIX}${S.rideCode}_dest`,JSON.stringify({dest:S.dest,name:S.destName}));}catch(e){}}
initLiveMap();requestGPS();startSync();startTimer();
toast('info','📍 Waiting for GPS signal…');
}

function initLiveMap(){
if(S.map){S.map.remove();S.map=null;}
S.map=L.map('map',{zoomControl:false,attributionControl:false}).setView([20.59,78.96],5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(S.map);
L.control.zoom({position:'bottomleft'}).addTo(S.map);
setTimeout(()=>S.map.invalidateSize(),200);
// Add destination marker
if(S.dest){
const icon=L.divIcon({className:'',html:'<div class="dest-marker-label">📍 '+S.destName+'</div>',iconSize:[0,0],iconAnchor:[0,20]});
S.destMarker=L.marker([S.dest.lat,S.dest.lng],{icon}).addTo(S.map);
// Destination circle
L.circle([S.dest.lat,S.dest.lng],{radius:100,color:'#d93025',weight:2,fillColor:'#d93025',fillOpacity:.08}).addTo(S.map);
$('#topbar-dest-wrap').style.display='flex';$('#topbar-dest').textContent=S.destName;
}
// Path polyline
S.pathLine=L.polyline([],{color:'#1a73e8',weight:4,opacity:.7,smoothFactor:1}).addTo(S.map);
}

function requestGPS(){
if(!navigator.geolocation){toast('danger','⚠️ GPS not available');return;}
S.watchId=navigator.geolocation.watchPosition(pos=>{
const{latitude:lat,longitude:lng,speed}=pos.coords;
S.myPos={lat,lng};
const me=S.riders[S.myId];if(!me)return;
// Track distance
if(me.lat!==null){S.totalDist+=getDist(me.lat,me.lng,lat,lng);}
me.lat=lat;me.lng=lng;me.speed=Math.round((speed||0)*3.6);me.lastSeen=Date.now();
// Track path
S.myPath.push([lat,lng]);if(S.pathLine)S.pathLine.setLatLngs(S.myPath);
updateMarker(S.myId);saveStorage();updateLiveStats();
if(!S._firstFix){S._firstFix=true;
if(S.dest){S.map.fitBounds([[lat,lng],[S.dest.lat,S.dest.lng]],{padding:[80,80]});}
else{S.map.setView([lat,lng],16);}
toast('success','📍 GPS locked — tracking '+S.myName);
}
},err=>{toast('danger','⚠️ GPS: '+err.message);},{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}

// SYNC
function startSync(){
saveStorage();
window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(STORAGE_PREFIX+S.rideCode))loadStorage();});
S.syncTimer=setInterval(()=>{saveStorage();loadStorage();checkStragglers();renderRiders();updateStats();},SYNC_INTERVAL);
}

function saveStorage(){
const me=S.riders[S.myId];if(!me)return;
try{localStorage.setItem(`${STORAGE_PREFIX}${S.rideCode}_${S.myId}`,JSON.stringify({
id:S.myId,name:me.name,color:me.color,lat:me.lat,lng:me.lng,speed:me.speed,status:me.status,lastSeen:Date.now()
}));}catch(e){}
}

function loadStorage(){
const prefix=`${STORAGE_PREFIX}${S.rideCode}_`;
for(let i=0;i<localStorage.length;i++){
const key=localStorage.key(i);if(!key||!key.startsWith(prefix)||key.endsWith('_dest'))continue;
try{const d=JSON.parse(localStorage.getItem(key));
if(d.id===S.myId||Date.now()-d.lastSeen>60000)continue;
const isNew=!S.riders[d.id];
S.riders[d.id]={...d,isMe:false};updateMarker(d.id);
if(isNew)toast('info','👋 '+d.name+' joined the ride!');
}catch(e){}
}
}

function updateMarker(id){
const r=S.riders[id];if(!r||r.lat===null)return;
if(S.markers[id]){S.markers[id].setLatLng([r.lat,r.lng]);
const dot=document.getElementById('mk-'+id);if(dot)dot.className='marker-dot'+(r.status==='behind'?' behind':'');
}else{
const icon=L.divIcon({className:'',html:`<div style="position:relative"><div class="marker-label">${r.name}${r.isMe?' (You)':''}</div><div class="marker-dot" id="mk-${id}" style="background:${r.color}">${r.name.charAt(0).toUpperCase()}</div></div>`,iconSize:[32,32],iconAnchor:[16,16]});
S.markers[id]=L.marker([r.lat,r.lng],{icon}).addTo(S.map);
}}

function renderRiders(){
const list=$('#drawer-list');
const arr=Object.entries(S.riders).filter(([_,r])=>r.lat!==null).sort(([_,a],[__,b])=>(b.isMe?1:0)-(a.isMe?1:0));
$('#topbar-riders').textContent=arr.length+' rider'+(arr.length!==1?'s':'');
list.innerHTML=arr.map(([id,r])=>{
let bc='badge-online',bt='Online';
if(r.status==='behind'){bc='badge-behind';bt='Left Behind';}
else if(r.status==='break'){bc='badge-break';bt='Wants Break';}
const dist=r.isMe?'':(S.myPos?fmtDist(getDist(S.myPos.lat,S.myPos.lng,r.lat,r.lng)):'');
return `<div class="rider-item${r.status==='behind'?' warning':''}${r.status==='break'?' break-req':''}"><div class="rider-avatar" style="background:${r.color}">${r.name.charAt(0).toUpperCase()}${r.isMe?'<span class="rider-you-badge">YOU</span>':''}</div><div class="rider-info"><div class="rider-name">${r.name}</div><div class="rider-meta">${r.speed||0} km/h${dist?' · '+dist:''}</div></div><span class="rider-badge ${bc}">${bt}</span></div>`;
}).join('');
}

// STRAGGLER — only leader gets notification
function checkStragglers(){
const pos=Object.entries(S.riders).filter(([_,r])=>r.lat!==null&&r.status!=='behind');
if(pos.length<2)return;
const cLat=pos.reduce((s,[_,r])=>s+r.lat,0)/pos.length;
const cLng=pos.reduce((s,[_,r])=>s+r.lng,0)/pos.length;
Object.entries(S.riders).forEach(([id,r])=>{
if(r.lat===null)return;
const d=getDist(cLat,cLng,r.lat,r.lng);
if(d>STRAGGLER_THRESHOLD&&r.status!=='behind'){
r.status='behind';
if(!r._alerted&&S.isLeader){r._alerted=true;toast('danger','🚨 '+r.name+' is '+fmtDist(d)+' behind!');playAlert();}
updateMarker(id);
}else if(d<=STRAGGLER_THRESHOLD*.5&&r.status==='behind'){
r.status='online';r._alerted=false;
if(S.isLeader)toast('success','✅ '+r.name+' is back with the group');
updateMarker(id);
}});
}

function updateStats(){
const pos=Object.values(S.riders).filter(r=>r.lat!==null);let mx=0;
for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){const d=getDist(pos[i].lat,pos[i].lng,pos[j].lat,pos[j].lng);if(d>mx)mx=d;}
const el=$('#stat-spread');el.textContent='Spread: '+fmtDist(mx);el.style.color=mx>STRAGGLER_THRESHOLD?'var(--red)':'';
}

function updateLiveStats(){
$('#ls-dist').textContent=(S.totalDist/1000).toFixed(1);
const me=S.riders[S.myId];$('#ls-speed').textContent=me?me.speed||0:0;
if(S.dest&&S.myPos){const eta=getDist(S.myPos.lat,S.myPos.lng,S.dest.lat,S.dest.lng);$('#topbar-eta').textContent=fmtDist(eta)+' left';}
}

function startTimer(){
S.timeTimer=setInterval(()=>{if(!S.startTime)return;
const s=Math.floor((Date.now()-S.startTime)/1000);
const m=Math.floor(s/60),h=Math.floor(m/60);
$('#ls-time').textContent=h>0?`${h}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
},1000);
}

// ACTIONS
function centerGroup(){
const pos=Object.values(S.riders).filter(r=>r.lat!==null);if(!pos.length)return;
const pts=pos.map(r=>[r.lat,r.lng]);if(S.dest)pts.push([S.dest.lat,S.dest.lng]);
S.map.fitBounds(L.latLngBounds(pts),{padding:[60,60],maxZoom:16});
}

function reqBreak(){
const me=S.riders[S.myId];if(!me)return;const fab=$('#fab-break');
if(me.status==='break'){me.status='online';fab.classList.remove('active');toast('info','☕ Break cancelled');}
else{me.status='break';fab.classList.add('active');toast('warning','☕ '+S.myName+' is requesting a break!');}
saveStorage();renderRiders();
}

function endRide(){
if(!confirm('End this ride?'))return;
const elapsed=S.startTime?Math.floor((Date.now()-S.startTime)/1000):0;
const dist=S.totalDist;const avgSpd=elapsed>0?((dist/1000)/(elapsed/3600)).toFixed(0):0;
const riderCount=Object.keys(S.riders).length;
// Stop everything
if(S.watchId)navigator.geolocation.clearWatch(S.watchId);
if(S.syncTimer)clearInterval(S.syncTimer);
if(S.timeTimer)clearInterval(S.timeTimer);
try{localStorage.removeItem(`${STORAGE_PREFIX}${S.rideCode}_${S.myId}`);}catch(e){}
// Show summary
showSummary(dist,avgSpd,elapsed,riderCount);
}

function showSummary(dist,avgSpd,elapsed,riderCount){
const m=Math.floor(elapsed/60),h=Math.floor(m/60);
const timeStr=h>0?`${h}h ${m%60}m`:`${m}m ${elapsed%60}s`;
$('#sum-dist').textContent=(dist/1000).toFixed(1);
$('#sum-speed').textContent=avgSpd;
$('#sum-time').textContent=timeStr;
$('#sum-riders').textContent=riderCount;
if(S.destName){$('#sum-dest-row').style.display='flex';$('#sum-dest-name').textContent=S.destName;}
const now=new Date();$('#sum-date').textContent=now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
// Render path on summary map
setTimeout(()=>{
const smap=L.map('summary-map',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,touchZoom:false,doubleClickZoom:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(smap);
if(S.myPath.length>1){
const line=L.polyline(S.myPath,{color:'#1a73e8',weight:4,opacity:.8}).addTo(smap);
smap.fitBounds(line.getBounds(),{padding:[20,20]});
}else if(S.myPos){smap.setView([S.myPos.lat,S.myPos.lng],14);}
else{smap.setView([20.59,78.96],5);}
if(S.dest)L.circleMarker([S.dest.lat,S.dest.lng],{radius:6,color:'#d93025',fillColor:'#d93025',fillOpacity:1}).addTo(smap);
},300);
// Cleanup state
if(S.map){S.map.remove();S.map=null;}
S.markers={};S.riders={};S.myPos=null;S._firstFix=false;S.rideCode='';S.dest=null;S.destName='';
window.history.replaceState({},'',location.pathname);
showScreen('screen-summary');
}

function shareStats(){
const card=$('#summary-card');
if(navigator.share){
html2canvas(card,{backgroundColor:'#fff',scale:2}).then(canvas=>{
canvas.toBlob(blob=>{
const file=new File([blob],'ridesync-stats.png',{type:'image/png'});
navigator.share({title:'My RideSync Stats',text:'Check out my ride! #RideSync',files:[file]}).catch(()=>{});
},'image/png');
});
}else{downloadStats();}
}

function downloadStats(){
const card=$('#summary-card');
html2canvas(card,{backgroundColor:'#fff',scale:2}).then(canvas=>{
const a=document.createElement('a');a.href=canvas.toDataURL('image/png');
a.download='ridesync-ride-'+Date.now()+'.png';a.click();
toast('success','📸 Image saved!');
});
}

function toggleDrawer(){S.drawerOpen=!S.drawerOpen;$('#rider-drawer').classList.toggle('collapsed',!S.drawerOpen);}

// TOASTS
function toast(type,msg){
const c=$('#toasts');if(!c)return;
const el=document.createElement('div');el.className='toast '+type;
el.innerHTML=`<span class="toast-msg">${msg}</span><button class="toast-close">×</button>`;
el.querySelector('.toast-close').onclick=()=>rmToast(el);c.appendChild(el);
setTimeout(()=>rmToast(el),5000);
}
function rmToast(el){if(!el.parentElement)return;el.classList.add('removing');setTimeout(()=>el.remove(),200);}

function playAlert(){
try{const c=new(window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();
o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.value=800;
g.gain.setValueAtTime(.1,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.4);
o.start();o.stop(c.currentTime+.4);}catch(e){}
}

// UTILS
function genId(){return 'r_'+Date.now().toString(36)+Math.random().toString(36).substr(2,5)}
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='SYNC-';for(let i=0;i<4;i++)r+=c[Math.floor(Math.random()*c.length)];return r}
function randColor(){return['#1a73e8','#188038','#d93025','#e37400','#7b1fa2','#00897b','#c2185b','#1565c0'][Math.floor(Math.random()*8)]}
function getDist(a,b,c,d){const R=6371000,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180;const x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function fmtDist(m){return m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+'m'}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}}

document.addEventListener('DOMContentLoaded',init);
})();
