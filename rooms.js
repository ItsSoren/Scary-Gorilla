const relay='wss://clouddata.turbowarp.org';
const project='itssoren.github.io/Scary-Gorilla/v6/';
const names=Array.from({length:10},(_,i)=>'☁ ScaryPlayer'+i);
const timeout=4600;
const channels=new Set(names);
const finite=(value,limit)=>Number.isFinite(value)&&Math.abs(value)<=limit;
export function pack(state){
  return Array.from(JSON.stringify(state),char=>String(char.charCodeAt(0)).padStart(3,'0')).join('');
}
export function unpack(value){
  if(typeof value!=='string'||value.length>1800||value.length%3||!/^[0-9]+$/.test(value))return null;
  try{
    const state=JSON.parse(value.match(/.{3}/g).map(n=>String.fromCharCode(+n)).join(''));
    if(!state||!Number.isSafeInteger(state.id)||state.id<1000000||state.id>9999999||
      !Number.isSafeInteger(state.seq)||state.seq<1||!finite(state.x,26)||!finite(state.z,26)||
      !finite(state.y,4)||!finite(state.yaw,7)||(state.run!==0&&state.run!==1)||
      typeof state.light!=='boolean'||typeof state.protected!=='boolean'||
      !Number.isInteger(state.level)||state.level<0||state.level>2||
      !Number.isInteger(state.bl)||state.bl<0||state.bl>2||
      !Number.isInteger(state.mask)||state.mask<0||state.mask>63||
      !Number.isSafeInteger(state.beacon)||state.beacon<0||!finite(state.bx,26)||!finite(state.bz,26))return null;
    if(state.predators!==null&&(!Array.isArray(state.predators)||state.predators.length!==3||
      !state.predators.every(p=>Array.isArray(p)&&p.length===5&&finite(p[0],26)&&finite(p[1],26)&&finite(p[2],7)&&
        Number.isInteger(p[3])&&p[3]>=0&&p[3]<=2&&Number.isInteger(p[4])&&p[4]>=0&&p[4]<=5)))return null;
    return state;
  }catch{return null;}
}
export function createRooms(onStatus,{Socket=globalThis.WebSocket,clock=()=>performance.now()}={}){
  const peers=new Map();
  const id=1000000+crypto.getRandomValues(new Uint32Array(1))[0]%9000000;
  let socket=null,room='',lane=id%names.length,retryAt=Infinity,openedAt=Infinity,lastSend=-Infinity,seq=0;
  function disconnect(){
    const old=socket;socket=null;
    if(old)old.close();
    peers.clear();
  }
  function connect(){
    if(!room)return;
    retryAt=Infinity;openedAt=Infinity;lastSend=-Infinity;
    onStatus('Salon '+room+' · connexion…');
    let ws;
    try{ws=new Socket(relay);}catch{onStatus('TurboWarp indisponible');return;}
    socket=ws;
    ws.onopen=()=>{
      if(socket!==ws)return;
      openedAt=clock();
      ws.send(JSON.stringify({method:'handshake',project_id:project+'SALON'+room,user:'player'+id})+'\n');
      onStatus('Salon '+room+' · attente d’autres joueurs');
    };
    ws.onmessage=event=>{
      if(socket!==ws||typeof event.data!=='string'||event.data.length>30000)return;
      for(const line of event.data.split('\n')){
        if(!line.trim())continue;
        let packet;
        try{packet=JSON.parse(line);}catch{continue;}
        if(packet?.method!=='set'||!channels.has(packet.name))continue;
        const state=unpack(packet.value);
        if(!state||state.id===id)continue;
        const prior=peers.get(state.id);
        if(prior&&prior.state.seq>=state.seq)continue;
        if(!prior&&peers.size>=24)continue;
        const arrival=clock();
        const live=!!prior&&arrival-prior.arrival<timeout;
        peers.set(state.id,{state,arrival,live,lane:names.indexOf(packet.name)});
        if(live&&packet.name===names[lane]&&state.id<id){
          const occupied=new Set(Array.from(peers.values(),peer=>peer.lane));
          const free=names.findIndex((_,index)=>!occupied.has(index));
          if(free>=0)lane=free;
        }
      }
    };
    ws.onerror=()=>{if(socket===ws)onStatus('Salon '+room+' · relais indisponible');};
    ws.onclose=event=>{
      if(socket!==ws)return;
      socket=null;peers.clear();openedAt=Infinity;
      if([1000,1001,1005,1006,1011,1012,1013,1014,4003].includes(event.code)){
        retryAt=clock()+2500;
        onStatus('Salon '+room+' · reconnexion…');
      }else onStatus('Salon '+room+' · relais refusé ('+event.code+')');
    };
  }
  function join(next){
    disconnect();room=/^[123]$/.test(next)?next:'';
    lane=id%names.length;
    retryAt=openedAt=Infinity;
    if(room)connect();else onStatus('');
  }
  function activePeers(){
    const now=clock();
    for(const [key,peer] of peers)if(now-peer.arrival>timeout)peers.delete(key);
    return Array.from(peers.values()).filter(p=>p.live).map(p=>p.state);
  }
  function send(state){
    const now=clock();
    if(now>=retryAt)connect();
    if(socket?.readyState!==1||socket.bufferedAmount>8192||now-openedAt<120||now-lastSend<120)return;
    const value=pack({...state,id,seq:++seq});
    socket.send(JSON.stringify({method:'set',name:names[lane],value})+'\n');
    lastSend=now;
  }
  return {join,activePeers,send,id};
}
