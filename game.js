import * as T from './three.js';
import {GorillaLocomotion} from './locomotion.js?v=appuis1';
import {batteryCapacity,createFieldLight,matchCapacity} from './field-light.js';
import {createGallery,galleryGround,galleryOpen,galleryStart,galleryWaterHeight,galleryWet,poolEntry,sectorIndex,sectorLayout,sectorSeed} from './sectors.js?v=bassin1';
import {createFlatControls,createKeyboardState} from './flat-controls.js';
import {createRooms} from './rooms.js?v=bunker2';
import {buildStation, cellOf, cryoVapor, fits, hazmatMonkey, inShelter, itemModel, levelNames, metalGrating, monsterOpen, nextStep, passageAt, placard, predator, where, woundModel} from './station.js?v=bunker6';
import {behavior, createHunt, huntingSpeed} from './hunt.js?v=extraction1';
import {createCreatureAudio} from './creature-audio.js?v=attaques1';

const el=id=>document.getElementById(id);
const canvas=el('game'),menu=el('menu'),hud=el('hud');
const scene=new T.Scene();
scene.background=new T.Color('#10191a');
scene.fog=new T.FogExp2('#10191a',.068);
const clearFog=new T.Color('#10191a'),coldFog=new T.Color('#537784'),waterFog=new T.Color('#254239');
let ventAt=0;
const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor?.(.8);
let xrPose=null,xrFrames=0,xrFailure='',xrStarting=false,xrLaunchSpeed=0;
const xrHeading=new T.Quaternion();
const view=new T.PerspectiveCamera(67,1,.06,45);
const rig=new T.Group();
scene.add(rig);
rig.add(view);
scene.add(new T.HemisphereLight('#a4bbb2','#463b34',.58));
const stations=levelNames.map((_,level)=>{
  const group=new T.Group();scene.add(group);group.visible=level===0;
  return buildStation(group,level);
});
const gallery=createGallery(stations[0].scene);
const corridorLights=Array.from({length:2},()=>new T.PointLight('#ff9d66',17,8,2));
scene.add(...corridorLights);
const flashlight=new T.SpotLight('#d4fff0',41,14,.48,.52,1.7);
scene.add(flashlight,flashlight.target);
const matchLight=new T.PointLight('#ffbb66',0,7,1.5);
matchLight.visible=false;
scene.add(matchLight);
const sight=new T.Vector3(),eye=new T.Vector3(),ray=new T.Vector3(),aux=new T.Vector3();
const velocity=new T.Vector3(),movement=new T.Vector3(),bodyDelta=new T.Vector3(),previous=new T.Vector3();
const groundRig=new T.Vector3();
const key=createKeyboardState();
const names=['Bélier','Voile','Écorce'];
const routes=['DEXA','BEL','CEL'];
const idlePositions=['A','B','C'].map((symbol,level)=>where(symbol,0,level));
const hunt=createHunt({visible:visibleBetween,lifts:stations.map(station=>station.lift),
  patrolPoints:routes.map((route,level)=>Array.from(route,symbol=>where(symbol,0,level)))});
const monsters=idlePositions.map((init,index)=>{
  const model=predator(index);
  scene.add(model.root);
  model.root.position.copy(init);
  return {...model,home:init,target:init.clone(),goal:init.clone(),route:0,phase:0,nextThink:0,level:index,mode:behavior.patrol,nextLift:0,
    charging:false,attackAt:0,voiceAt:0,stride:0,foot:0,lastPosition:init.clone(),lastLevel:index};
});
const items=[
  ...['A','B','C'].map((symbol,level)=>({name:'Cartouche '+(level+1),kind:'cell',symbol,bit:1<<level,level})),
  {name:'Lampe',kind:'lamp',symbol:'S',level:0}, {name:'Balise acoustique',kind:'decoy',symbol:'S',level:0},
  ...[0,1,2].map(level=>({name:'Échantillon '+(level+1),kind:'sample',symbol:level===0?'D':'E',bit:8<<level,level})),
].map(item=>{
  const mesh=itemModel(item.kind),home=where(item.symbol,.63,item.level);
  if(item.kind==='lamp'||item.kind==='decoy'){
    home.x+=item.kind==='lamp'?-.92:.92;home.z+=1.42;home.y=1.08;
  }
  scene.add(mesh);
  return {...item,mesh,home,homeLevel:item.level,owner:null};
});
const peersUI=new Map();
const session={play:false,mask:0,won:false,scare:null,immunity:0,run:false,light:false,beacon:0,room:'',level:0};
const lure={until:0,x:0,z:0,level:0};
const localBeacon={until:0,x:0,z:0,level:0};
const station=()=>stations[session.level];
const galleryEnabled=()=>expedition&&!session.room&&session.level===0;
function walkable(x,z,r,level){
  if(level!==0||z+r<22.75)return fits(x,z,r,level);
  for(const sx of [x-r,x+r])for(const sz of [z-r,z+r]){
    if(sz>=galleryStart){
      if(!galleryEnabled()||!galleryOpen(sx,sz))return false;
    }else if((sz>=22.75&&!galleryEnabled())||!fits(sx,sz,0,level))return false;
  }
  return true;
}
const seenBeacons=new Map();
const rooms=createRooms(status=>{el('connection').textContent=status;if(!session.play)el('status').textContent=status;});
const wrist=new T.Group();
const wristMessages=new Map();
let yaw=0,pitch=0,turnReady=true,previousTime=0,nearItem=null,serverText='',lastAudioStep=0,frameTime=0;
let nextDrip=0,nextPipe=0,immersion=0,wake=0;
let audio,master,noise,creatureAudio,waterFilter;
let grounded=true,touchCrouch=false;
const extractionSeconds=8;
let extractionCharge=0,extractionAlarm=false;
let expedition=false,credits=0,lampPurchased=false;
const fieldLight=createFieldLight();
let stickAssist=true;
const vrGrip={grip:5,slide:3,jump:5,weight:4};
const hands=[0,1].map(index=>{
  const input=renderer.xr.getController(index),grip=renderer.xr.getControllerGrip(index);
  const mesh=new T.Mesh(new T.IcosahedronGeometry(.09,1),new T.MeshStandardMaterial({color:index?'#b47142':'#799178'}));
  mesh.scale.set(.88,.58,1.3);
  grip.add(mesh);
  rig.add(input,grip);
  const hand={grip,input,mesh:{quaternion:new T.Quaternion()},target:new T.Vector3(),valid:false,held:null,source:null,scan:new T.Vector3()};
  input.addEventListener('connected',e=>{hand.source=e.data;});
  input.addEventListener('disconnected',()=>{release(hand);hand.source=null;hand.valid=false;});
  input.addEventListener('squeezestart',()=>{if(session.play){if(audio?.state!=='running')audioStart();grab(hand);}});
  input.addEventListener('selectstart',()=>{if(session.play){if(audio?.state!=='running')audioStart();use(hand);}});
  return hand;
});
const flatHand={held:null};
hands[0].grip.add(wrist);
wrist.position.set(0,.13,-.09);
wrist.rotation.x=-1.05;
wrist.scale.setScalar(.17);
const expanded=new T.Box3(),segment=new T.Ray();
function palmContact(from,to,rotation,solids,hit,normal){
  ray.subVectors(to,from);
  const length=ray.length();
  if(length<.00001)return null;
  segment.set(from,ray.divideScalar(length));
  let best=null,min=length+.0001;
  for(const wall of solids){
    expanded.copy(wall.bounds).expandByScalar(.059);
    if(expanded.distanceToPoint(from)>length)continue;
    const startedInside=expanded.containsPoint(from);
    // Keep the entry face when a fast push drives a tracked palm through a thin ledge.
    if(startedInside)aux.copy(from);
    else if(!segment.intersectBox(expanded,aux))continue;
    const dist=from.distanceTo(aux);
    if(dist>=min)continue;
    const faces=[aux.x-expanded.min.x,expanded.max.x-aux.x,aux.y-expanded.min.y,expanded.max.y-aux.y,aux.z-expanded.min.z,expanded.max.z-aux.z];
    const face=faces.indexOf(Math.min(...faces));
    if(face===0)aux.x=expanded.min.x;
    if(face===1)aux.x=expanded.max.x;
    if(face===2)aux.y=expanded.min.y;
    if(face===3)aux.y=expanded.max.y;
    if(face===4)aux.z=expanded.min.z;
    if(face===5)aux.z=expanded.max.z;
    const nx=face===0?-1:face===1?1:0,ny=face===2?-1:face===3?1:0,nz=face===4?-1:face===5?1:0;
    // A palm already inside a surface can leave it immediately.
    if(startedInside&&segment.direction.x*nx+segment.direction.y*ny+segment.direction.z*nz>0)continue;
    best=wall;min=dist;hit.copy(aux);normal.set(nx,ny,nz);
  }
  return best;
}
const locomotion=new GorillaLocomotion(T.Vector3,hands,palmContact);
function resize(){
  view.aspect=innerWidth/innerHeight;view.updateProjectionMatrix();
  if(!renderer.xr.isPresenting)renderer.setSize(innerWidth,innerHeight,false);
}
addEventListener('resize',resize);resize();

function universeView(){
  rig.updateWorldMatrix(true,false);
  if(renderer.xr.isPresenting&&xrPose){
    const {position,orientation}=xrPose;
    eye.set(position.x,position.y,position.z).applyMatrix4(rig.matrixWorld);
    xrHeading.set(orientation.x,orientation.y,orientation.z,orientation.w);
    sight.set(0,0,-1).applyQuaternion(xrHeading).transformDirection(rig.matrixWorld);
    return;
  }
  view.getWorldPosition(eye);view.getWorldDirection(sight);
}
function moveRig(dx,dy,dz){
  if(galleryEnabled()&&galleryWet(eye.x,eye.z)){dx*=.78;dz*=.78;}
  const offsetX=eye.x-rig.position.x,offsetZ=eye.z-rig.position.z;
  previous.copy(rig.position);
  const area=station();
  const height=T.MathUtils.clamp(eye.y-previous.y,.48,2.25);
  const clear=(x,z)=>walkable(x,z,.24,session.level)&&!area.fixtures.some(box=>
    overlapsBody(box,x,z)&&previous.y<box.max.y-.015&&previous.y+height+.075>box.min.y);
  if(clear(previous.x+offsetX+dx,previous.z+offsetZ))rig.position.x+=dx;
  if(clear(rig.position.x+offsetX,previous.z+offsetZ+dz))rig.position.z+=dz;
  const x=rig.position.x+offsetX,z=rig.position.z+offsetZ;
  let floor=galleryEnabled()&&z>=galleryStart?galleryGround(z):0;
  let ceiling=3.17-height-.075;
  for(const box of area.fixtures){
    if(!overlapsBody(box,x,z))continue;
    if(previous.y>=box.max.y-.018)floor=Math.max(floor,box.max.y);
    if(previous.y+height<=box.min.y+.015)ceiling=Math.min(ceiling,box.min.y-height-.075);
  }
  rig.position.y=T.MathUtils.clamp(previous.y+dy,floor,Math.max(floor,ceiling));
  grounded=rig.position.y<=floor+.008;
  if((grounded&&velocity.y<0)||(rig.position.y>=ceiling-.008&&velocity.y>0))velocity.y=0;
  bodyDelta.subVectors(rig.position,previous);
}
function overlapsBody({min,max},x,z){
  return x>min.x-.24&&x<max.x+.24&&z>min.z-.24&&z<max.z+.24;
}
function resetBody(useLift=false){
  rig.position.copy(useLift?station().lift:where('S'));rig.rotation.set(0,0,0);
  if(renderer.xr.isPresenting&&!useLift)rig.rotation.y=Math.PI;
  view.position.set(0,1.62,0);
  yaw=useLift?-Math.PI/2:Math.PI;pitch=0;
  view.rotation.set(pitch,yaw,0,'YXZ');
  velocity.set(0,0,0);grounded=true;touchCrouch=false;locomotion.reset();
  xrLaunchSpeed=0;
}
function selectLevel(level){
  session.level=level;
  for(const [i,zone] of stations.entries())zone.scene.visible=i===level;
  for(const monster of monsters)monster.root.visible=monster.level===level;
  el('floor').textContent=(level+1)+' / 3 · '+levelNames[level];
}
function atLift(){
  return Math.hypot(eye.x-station().lift.x,eye.z-station().lift.z)<1.22;
}
function lift(direction){
  universeView();
  if(!atLift())return false;
  const next=session.level+direction;
  if(next<0||next>=stations.length)return false;
  selectLevel(next);
  resetBody(true);
  session.immunity=frameTime+3;
  tone(255,400,.26,.13,'triangle');
  return true;
}
function setXRMessage(text){
  if(!wristMessages.has(text))wristMessages.set(text,placard(text,'#82d7bc'));
  wrist.clear();wrist.add(wristMessages.get(text));
}
function showHint(text){el('hint').textContent=text;}
function atCargo(){
  const cargo=station().cargo;
  return cargo&&Math.hypot(eye.x-cargo.x,eye.z-cargo.z)<1.65;
}
function audioStart(){
  try{
    if(!audio){
      audio=new AudioContext();
      master=audio.createGain();
      waterFilter=audio.createBiquadFilter();
      waterFilter.type='lowpass';
      waterFilter.frequency.value=20000;
      waterFilter.Q.value=.1;
      master.connect(waterFilter).connect(audio.destination);
      creatureAudio=createCreatureAudio(audio,master);
      const hum=audio.createOscillator(),volume=audio.createGain();
      hum.type='triangle';hum.frequency.value=112;volume.gain.value=.13;
      hum.connect(volume).connect(master);hum.start();
      noise=audio.createBuffer(1,Math.floor(audio.sampleRate*.8),audio.sampleRate);
      const stream=noise.getChannelData(0);
      for(let i=0;i<stream.length;i++)stream[i]=Math.random()*2-1;
    }
    master.gain.value=Number(el('volume').value)*.0034;
    audio.resume().catch(()=>{});
  }catch{}
}
function tone(frequency,end,seconds,gain,type='sine',pan=0){
  if(!audio||audio.state!=='running')return;
  const now=audio.currentTime,osc=audio.createOscillator(),envelope=audio.createGain(),panner=audio.createStereoPanner?.();
  osc.type=type;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(end,now+seconds);
  envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(gain,now+.016);
  envelope.gain.exponentialRampToValueAtTime(.0001,now+seconds);
  osc.connect(envelope);
  if(panner){panner.pan.value=pan;envelope.connect(panner).connect(master);}
  else envelope.connect(master);
  osc.start(now);osc.stop(now+seconds+.02);
}
function scrape(frequency,seconds,gain,pan){
  if(!noise||audio.state!=='running')return;
  const now=audio.currentTime,source=audio.createBufferSource(),filter=audio.createBiquadFilter();
  const envelope=audio.createGain(),panner=audio.createStereoPanner?.();
  source.buffer=noise;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=2.2;
  envelope.gain.setValueAtTime(.001,now);envelope.gain.exponentialRampToValueAtTime(gain,now+.032);
  envelope.gain.exponentialRampToValueAtTime(.001,now+seconds);
  source.connect(filter).connect(envelope);
  if(panner){panner.pan.value=pan;envelope.connect(panner).connect(master);}
  else envelope.connect(master);
  source.start(now);source.stop(now+seconds);
}
function release(hand){
  const item=hand.held;
  if(!item)return;
  hand.held=null;item.owner=null;
  if(item.kind==='lamp')session.light=false;
  const dropX=item.mesh.position.x,dropZ=item.mesh.position.z;
  if(walkable(dropX,dropZ,.16,session.level)){
    item.level=session.level;
    item.mesh.position.y=.48;
  }else {
    item.level=item.homeLevel;
    item.mesh.position.copy(item.home);
  }
}
function findItem(position,look=null){
  let candidate=null,max=look?2.1:.38;
  for(const item of items){
    if(item.level!==session.level||!item.mesh.visible||item.owner)continue;
    if(expedition&&(item.kind==='cell'||item.kind==='lamp'&&!lampPurchased))continue;
    aux.subVectors(item.mesh.position,position);
    const distance=aux.length();
    if(distance>=max||(look&&aux.dot(look)<distance*.76)||!visibleBetween(position,item.mesh.position))continue;
    candidate=item;max=distance;
  }
  return candidate;
}
function grab(hand){
  if(session.won||session.scare)return;
  if(lift(1))return;
  if(hand.held){release(hand);return;}
  universeView();
  const inVR=hand!==flatHand;
  if(inVR)hand.grip.getWorldPosition(hand.scan);
  const item=inVR?findItem(hand.scan):findItem(eye,sight);
  if(!item)return;
  hand.held=item;item.owner=hand;
  tone(360,190,.15,.22,'triangle');
}
function use(hand){
  if(session.won||session.scare)return;
  if(lift(-1))return;
  const item=hand.held;
  if(!item){
    universeView();
    if(!expedition)return;
    if(atCargo()){
      const {matches}=fieldLight.read(frameTime);
      if(credits>0&&!lampPurchased){
        credits--;lampPurchased=true;
        tone(480,810,.27,.27,'triangle');
      }else if(matches<matchCapacity){
        fieldLight.restock();
        tone(380,490,.18,.2,'triangle');
      }
    }else if(fieldLight.strike(frameTime)){
      scrape(1600,.26,.24,0);
    }
    return;
  }
  if(item.kind==='lamp'){
    const {battery}=fieldLight.read(frameTime);
    if(expedition&&atCargo()&&battery<batteryCapacity&&credits>0&&!session.light){
      credits--;
      fieldLight.replaceBattery();
      tone(400,675,.2,.22,'triangle');
      return;
    }
    session.light=(!expedition||battery>0)&&!session.light;
  }
  if(item.kind==='decoy'){
    if(localBeacon.until>frameTime)return;
    lure.x=item.mesh.position.x;lure.z=item.mesh.position.z;
    lure.until=frameTime+7;lure.level=session.level;session.beacon++;
    Object.assign(localBeacon,lure);
    tone(720,480,.22,.35,'triangle');
    release(hand);
  }
  if(item.kind==='sample'&&!atCargo()){
    tone(185,148,.2,.22,'triangle');
    return;
  }
  if(item.kind==='cell'||item.kind==='sample'){
    if(expedition&&item.kind==='sample'&&!(session.mask&item.bit))credits++;
    session.mask|=item.bit;release(hand);item.mesh.visible=false;
    tone(370,850,.3,.28,'triangle');
    if(item.kind==='sample')tone(740,1110,.44,.25,'sine');
  }
}
const controls=createFlatControls({
  canvas,enabled:()=>session.play&&!renderer.xr.isPresenting,
  onLook(dx,dy,sensitivity){yaw-=dx*sensitivity;pitch=T.MathUtils.clamp(pitch-dy*sensitivity,-1.38,1.38);},
  onAction(action){
    if(action==='interact')grab(flatHand);
    else if(action==='use')use(flatHand);
    else if(action==='crouch')touchCrouch=!touchCrouch;
  },
});
addEventListener('keydown',event=>{
  if(!session.play||renderer.xr.isPresenting)return;
  if(event.code==='KeyF'||event.code==='KeyE'||event.code==='Space')event.preventDefault();
  key.down(event.code,event.repeat);
});
addEventListener('keyup',event=>key.up(event.code));
addEventListener('blur',()=>{key.clear();controls.clear();});

function resetGame(){
  session.mask=0;session.won=false;session.immunity=frameTime+5;
  extractionCharge=0;extractionAlarm=false;
  credits=0;lampPurchased=false;
  fieldLight.reset();
  session.light=false;
  clearScare();
  lure.until=0;localBeacon.until=0;seenBeacons.clear();hunt.reset();
  for(const hand of [...hands,flatHand])release(hand);
  for(const item of items){
    item.level=item.homeLevel;
    if(item.kind==='sample'&&item.homeLevel===0)item.home.copy(where(expedition?'D':'E',.63));
    item.mesh.position.copy(item.home);item.mesh.rotation.set(0,0,0);item.mesh.visible=true;
  }
  monsters.forEach((m,i)=>{
    m.root.position.copy(m.home);m.target.copy(m.home);m.goal.copy(m.home);m.nextThink=0;m.route=i;
    m.level=i;m.mode=behavior.patrol;m.nextLift=0;m.phase=0;
    m.charging=false;m.stride=0;m.foot=0;m.voiceAt=0;m.lastLevel=i;m.lastPosition.copy(m.home);
  });
  selectLevel(0);
  resetBody();
}
function removePeers(){
  for(const p of peersUI.values())scene.remove(p.root);
  peersUI.clear();
}
function start(){
  expedition=el('game-mode').value==='explore';
  stickAssist=el('vr-motion').value!=='arms';
  session.play=true;session.room=el('room').value;resetGame();
  menu.hidden=true;hud.hidden=false;
  audioStart();rooms.join(session.room,expedition?'explore':'mission');serverText='';
  audio?.resume().then(()=>{tone(640,390,.24,.45,'triangle');scrape(480,.5,.23,0);}).catch(()=>{});
}
function stop(){
  if(!session.play)return;
  matchLight.visible=false;
  fieldLight.extinguish();
  session.play=false;rooms.join('');removePeers();
  if(audio?.state==='running')audio.suspend().catch(()=>{});
  clearScare();
  key.clear();controls.clear();
  selectLevel(0);
  menu.hidden=false;hud.hidden=true;resetBody();
}
el('back').onclick=stop;
el('start').onclick=start;
el('debug-pool').onclick=()=>{
  if(!session.play||!galleryEnabled()||renderer.xr.isPresenting)return;
  rig.position.set(0,0,poolEntry);
  yaw=Math.PI;pitch=-.12;view.rotation.set(pitch,yaw,0,'YXZ');
  velocity.set(0,0,0);
  touchCrouch=false;
  grounded=true;
  universeView();
};
el('volume').oninput=()=>{if(master)master.gain.value=Number(el('volume').value)*.0034;};
el('audio-test').onclick=()=>{
  audioStart();
  if(!audio){el('status').textContent='Audio indisponible dans ce navigateur.';return;}
  audio.resume().then(()=>{
    if(Number(el('volume').value)===0){el('status').textContent='Volume à zéro.';return;}
    tone(550,320,.38,.52,'triangle');scrape(650,.45,.24,0);
    el('status').textContent='Signal audio joué.';
  }).catch(()=>{el('status').textContent='Le navigateur a bloqué le démarrage du son.';});
};
el('vr').onclick=async()=>{
  el('vr').disabled=true;
  xrStarting=true;xrFrames=0;xrFailure='';xrPose=null;
  try{
    if(!window.isSecureContext||!navigator.xr){
      throw new Error('ouvre la page HTTPS directement dans le navigateur du Quest');
    }
    const request=navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
    audioStart();
    const xr=await request;
    try{
      const xrFloor=await xr.requestReferenceSpace('local-floor').then(()=>true,()=>false);
      renderer.xr.setReferenceSpaceType(xrFloor?'local-floor':'local');
      await renderer.xr.setSession(xr);
      if(!xrFloor){
        const space=renderer.xr.getReferenceSpace();
        renderer.xr.setReferenceSpace(space.getOffsetReferenceSpace(new XRRigidTransform({x:0,y:-1.62,z:0})));
      }
    }
    catch(error){await xr.end().catch(()=>{});throw error;}
    document.body.classList.add('immersive');start();
  }catch(error){
    if(audio?.state==='running')audio.suspend().catch(()=>{});
    el('status').textContent='Impossible de lancer la VR · '+error.message;
    el('vr').disabled=false;
  }finally{xrStarting=false;}
};
renderer.xr.addEventListener('sessionend',()=>{
  const message=xrFailure||(xrFrames===0?'Session fermée avant la première image VR.':'Session VR fermée après '+xrFrames+' images.');
  xrPose=null;
  document.body.classList.remove('immersive');el('vr').disabled=false;
  stop();resize();
  if(!xrStarting)el('status').textContent=message;
});
el('start').disabled=false;
el('status').textContent='Mode écran disponible. Vérification du casque…';
Promise.resolve(navigator.xr?.isSessionSupported('immersive-vr')).then(supported=>{
  el('vr').disabled=false;
  if(!session.play)el('status').textContent=supported?'Casque WebXR détecté.':'VR disponible depuis un navigateur de casque compatible, en HTTPS.';
}).catch(()=>{el('vr').disabled=false;if(!session.play)el('status').textContent='Mode écran disponible.';});

function updateBody(dt){
  const vr=renderer.xr.isPresenting;
  groundRig.copy(rig.position);
  if(vr){
    rig.updateMatrixWorld(true);
    for(const hand of hands){
      hand.valid=hand.grip.visible&&!!hand.source;
      if(hand.valid){
        hand.grip.getWorldPosition(hand.target);
        hand.grip.getWorldQuaternion(hand.mesh.quaternion);
      }
    }
    universeView();
    const right=hands.find(hand=>hand.source?.handedness==='right');
    const left=hands.find(hand=>hand.source?.handedness==='left');
    const turn=right?.source?.gamepad?.axes?.[2]??0;
    if(Math.abs(turn)<.34)turnReady=true;
    if(turnReady&&Math.abs(turn)>.72){
      turnReady=false;
      const pivot=eye.clone().sub(rig.position),angle=-Math.sign(turn)*Math.PI/4;
      const spun=pivot.clone().applyAxisAngle(T.Object3D.DEFAULT_UP,angle);
      rig.position.add(pivot).sub(spun);rig.rotation.y+=angle;
      rig.updateMatrixWorld(true);
      universeView();
      for(const hand of hands)if(hand.valid){
        hand.grip.getWorldPosition(hand.target);
        hand.grip.getWorldQuaternion(hand.mesh.quaternion);
      }
      locomotion.reset();
    }
    const axes=left?.source?.gamepad?.axes;
    const horizontal=stickAssist&&Math.abs(axes?.[2]??0)>.18?axes[2]:0;
    const forward=stickAssist&&Math.abs(axes?.[3]??0)>.18?axes[3]:0;
    const solids=station().solids;
    const boxes=galleryEnabled()&&gallery.count?solids.concat(gallery.collision):solids;
    locomotion.move({head:eye,dt,gravity:13,settings:vrGrip,boxes,velocity,movement,reach:1.25});
    for(const hand of hands){
      const groundedPalm=Boolean(hand.surface);
      if(groundedPalm&&!hand.touching){
        hand.source?.gamepad?.hapticActuators?.[0]?.pulse?.(.2,32)?.catch?.(()=>{});
      }
      hand.touching=groundedPalm;
    }
    ray.set(sight.x,0,sight.z).normalize();
    movement.x+=(ray.x*-forward-ray.z*horizontal)*dt*2.5;
    movement.z+=(ray.z*-forward+ray.x*horizontal)*dt*2.5;
    moveRig(movement.x,movement.y,movement.z);
    const push=locomotion.finish(bodyDelta,velocity);
    if(push.launched)xrLaunchSpeed=push.launchSpeed;
    if(push.launched&&push.launchSpeed>2.5){
      for(const hand of hands)if(hand.touching)hand.source?.gamepad?.hapticActuators?.[0]?.pulse?.(.37,46)?.catch?.(()=>{});
    }
    session.run=Math.hypot(bodyDelta.x,bodyDelta.z)/dt>2.85;
  }else{
    view.rotation.set(pitch,yaw,0,'YXZ');
    const held=(...codes)=>codes.some(code=>key.held.has(code));
    if(key.pressed.delete('KeyC'))touchCrouch=!touchCrouch;
    const crouch=touchCrouch||
      station().fixtures.some(box=>overlapsBody(box,rig.position.x,rig.position.z)&&box.min.y>rig.position.y+.58&&box.min.y<rig.position.y+1.71);
    view.position.set(0,T.MathUtils.lerp(view.position.y,crouch?.96:1.62,1-Math.exp(-dt*22)),0);
    universeView();
    const x=Number(held('KeyD','ArrowRight'))-Number(held('KeyA','KeyQ','ArrowLeft'))+controls.movement.x;
    const z=Number(held('KeyS','ArrowDown'))-Number(held('KeyW','KeyZ','ArrowUp'))+controls.movement.z;
    const speed=crouch?1.65:held('ShiftLeft','ShiftRight')?4.6:2.55;
    const step=dt*speed/Math.max(1,Math.hypot(x,z));
    const wantsJump=key.pressed.delete('Space')||controls.consumeJump();
    if(wantsJump&&grounded&&!crouch)velocity.y=5.65;
    if(!grounded||velocity.y>0)velocity.y-=13*dt;
    moveRig((Math.cos(yaw)*x+Math.sin(yaw)*z)*step,velocity.y*dt,(-Math.sin(yaw)*x+Math.cos(yaw)*z)*step);
    session.run=speed>3&&bodyDelta.lengthSq()>.00001;
    if(key.pressed.delete('KeyE'))grab(flatHand);
    if(key.pressed.delete('KeyF'))use(flatHand);
    key.pressed.clear();
  }
  rig.updateMatrixWorld(true);universeView();
  const grating=metalGrating(...cellOf(eye.x,eye.z,session.level),session.level);
  const wet=galleryEnabled()&&galleryWet(eye.x,eye.z);
  const speedInWater=Math.hypot(bodyDelta.x,bodyDelta.z)/dt;
  wake=T.MathUtils.lerp(wake,wet?Math.min(1,speedInWater/2):0,1-Math.exp(-dt*6));
  if(grating&&Math.hypot(bodyDelta.x,bodyDelta.z)/dt>2.15)session.run=true;
  if((rig.position.distanceToSquared(groundRig)>dt*dt*.9)&&frameTime-lastAudioStep>(session.run?.28:.47)){
    lastAudioStep=frameTime;
    tone(wet?290:grating?560:135,wet?72:grating?220:54,grating?.27:.19,session.run?.32:.22,'triangle');
    scrape(wet?1190:grating?1700:640,wet?.24:.15,wet?.29:session.run?.22:.12,0);
  }
}
function visibleBetween(from,to,level=session.level){
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  const count=Math.max(1,Math.ceil(length/.4));
  for(let i=1;i<count;i++){
    const t=i/count,x=T.MathUtils.lerp(from.x,to.x,t),z=T.MathUtils.lerp(from.z,to.z,t);
    if(!walkable(x,z,.015,level))return false;
    const y=T.MathUtils.lerp(from.y||1.42,to.y||1.42,t);
    if(stations[level].fixtures.some(({min,max})=>x>min.x&&x<max.x&&z>min.z&&z<max.z&&y>min.y&&y<max.y))return false;
  }
  return true;
}
const attackProfiles=[
  {duration:1.22,windup:.16,impact:.31,near:.74,far:1.62,tilt:.09,reach:.9,noise:460,rate:.84},
  {duration:1.14,windup:.24,impact:.46,near:.82,far:1.45,tilt:.37,reach:.43,noise:2480,rate:1.12},
  {duration:1.02,windup:.10,impact:.25,near:.76,far:1.55,tilt:.21,reach:1.05,noise:1620,rate:1},
];
function makeScare(index){
  fieldLight.extinguish();
  const model=predator(index);
  const profile=attackProfiles[index];
  const intense=el('shock').value==='full';
  const direction=sight.clone();direction.y=0;
  if(direction.lengthSq()<.001)direction.set(0,0,-1);
  direction.normalize();
  model.root.position.copy(eye).addScaledVector(direction,intense?1.23:1.52);
  model.root.position.y=eye.y-1.78*model.height;
  model.root.rotation.y=Math.atan2(-direction.x,-direction.z);
  model.root.traverse(part=>{
    if(part.isMesh){
      part.material=part.material.clone();part.userData.disposeMaterial=true;
      part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=11;
      if(!part.material.isMeshStandardMaterial)return;
      part.material.emissive.set('#431a12');part.material.emissiveIntensity=.9;
    }
  });
  const spray=intense?woundModel(model,index):[];
  for(const {drop} of spray)drop.visible=false;
  model.head.traverse(part=>{if(part.isMesh&&!part.userData.disposeMaterial)part.renderOrder=Math.max(12,part.renderOrder);});
  model.jaw.scale.y*=2.3;
  scene.add(model.root);
  session.scare={...model,spray,direction,profile,index,impacted:false,start:frameTime,end:frameTime+(intense?profile.duration:.65),intense};
  tone([96,440,185][index],[55,302,105][index],.21,intense?.23:.07,'triangle');
  showHint(names[index]+' t’a trouvé.');
}
function clearScare(){
  if(!session.scare)return;
  session.scare.root.traverse(part=>{if(part.userData.disposeMaterial)part.material.dispose();});
  scene.remove(session.scare.root);session.scare=null;
}
function scareTick(){
  if(!session.scare)return false;
  const scare=session.scare;
  if(frameTime<scare.end){
    const elapsed=frameTime-scare.start;
    const {index,profile,intense}=scare;
    const windup=T.MathUtils.clamp(elapsed/profile.windup,0,1);
    const progress=T.MathUtils.clamp((elapsed-profile.windup)/(profile.impact-profile.windup),0,1);
    const lunge=progress**(index===1?1.4:2.5);
    const sinceImpact=Math.max(0,elapsed-profile.impact);
    const recoil=(1-Math.exp(-sinceImpact*8))*.15;
    const side=index===1?.52*(1-lunge)*windup:index===2?Math.sin(elapsed*21)*.11*(1-lunge):0;
    scare.root.position.copy(eye).addScaledVector(scare.direction,(intense?profile.far:1.65)+(profile.near-(intense?profile.far:1.65))*lunge*(intense?1:.44)+recoil);
    scare.root.position.x-=scare.direction.z*side;scare.root.position.z+=scare.direction.x*side;
    scare.root.position.y=eye.y-1.78*scare.height-(index===2?.37:0)*(1-lunge);
    scare.body.rotation.x=(index===0?-.23:.12)*windup*(1-lunge)+.16*lunge;
    scare.head.rotation.z=profile.tilt*(index===1?windup*(1-lunge):Math.sin(elapsed*29)*lunge);
    scare.jaw.scale.y=.15+(index===2?.13+.08*Math.sin(elapsed*28):.18)*lunge;
    scare.arms.forEach((arm,i)=>{arm.rotation.x=-profile.reach*lunge*(index===1&&i===0?.32:1);});
    if(elapsed>=profile.impact&&!scare.impacted){
      scare.impacted=true;
      creatureAudio?.play(index,true,intense?1.08:.31,0,false,profile.rate);
      tone([130,515,230][index],[37,170,64][index],.29,intense?.24:.06,'triangle');
      if(intense)scrape(profile.noise,index===0?.42:.32,.53,0);
    }
    for(const {drop,x,y,z} of scare.spray){
      drop.visible=scare.impacted;
      drop.position.set(x*sinceImpact*2.1,-.15+y*sinceImpact*1.8-sinceImpact**2*.76,.57+z*sinceImpact*1.65);
    }
    return true;
  }
  clearScare();
  for(const hand of [...hands,flatHand])release(hand);
  selectLevel(0);
  resetBody();session.immunity=frameTime+6;showHint('');
  return false;
}
function patrol(dt,peers,host){
  const local={id:rooms.id,x:eye.x,y:eye.y,z:eye.z,yaw:Math.atan2(sight.x,sight.z),
    run:session.run,light:session.light,level:session.level,
    protected:frameTime<session.immunity||session.won||!!session.scare||inShelter(eye.x,eye.z,session.level)};
  if(host)hunt.plan(frameTime,monsters,[local,...peers],lure,(session.mask&7)===7);
  for(const [i,m] of monsters.entries()){
    const pos=m.root.position;
    const charging=m.mode===behavior.charge;
    const hiding=m.mode===behavior.hide||m.mode===behavior.watch;
    const newCharge=charging&&!m.charging;
    const windup=[.56,.38,.27][i];
    if(newCharge)m.attackAt=frameTime+windup;
    const winding=charging&&frameTime<m.attackAt;
    const striking=charging&&!winding;
    if(host&&frameTime>=m.nextThink){
      m.nextThink=frameTime+.17+(i*.018);
      m.target.copy(nextStep(pos,m.goal,m.level,true));
    }
    if(host){
      const dx=m.target.x-pos.x,dz=m.target.z-pos.z,dist=Math.hypot(dx,dz);
      if(dist>.045){
        const burst=striking&&frameTime-m.attackAt<[.86,.42,.25][i];
        const speed=winding?.64:burst?[6.1,5.45,5.6][i]:huntingSpeed[m.mode]*[.91,.94,1.06][i];
        const step=Math.min(dist,speed*dt)/dist;
        const clear=(x,z)=>fits(x,z,.34,m.level)&&monsterOpen(...cellOf(x,z,m.level),m.level)&&!inShelter(x,z,m.level);
        if(clear(pos.x+dx*step,pos.z))pos.x+=dx*step;
        if(clear(pos.x,pos.z+dz*step))pos.z+=dz*step;
        m.root.rotation.y=Math.atan2(dx,dz);
      }
    }
    const travelled=m.lastLevel===m.level?Math.min(.32,pos.distanceTo(m.lastPosition)):0;
    m.lastLevel=m.level;m.lastPosition.copy(pos);
    m.stride+=travelled*[4.7,6.3,7.9][i];
    const foot=Math.floor(m.stride/Math.PI),footfall=foot!==m.foot;
    m.foot=foot;
    m.root.visible=m.level===session.level;
    const pace=T.MathUtils.clamp(travelled/dt*.31,0,1);
    const gait=Math.sin(m.stride),breath=Math.sin(frameTime*3.8+i);
    m.body.position.y=(hiding?[-.21,-.39,-.32][i]:winding?-.25:0)+Math.abs(gait)*pace*[.15,.085,.1][i];
    m.body.rotation.x=(hiding?[.26,.25,.42][i]:striking?[.39,.36,.48][i]:i===0?.13:.03)+breath*.026;
    if(i===0){
      m.body.position.y-=.12;
      m.head.position.z=.38+pace*.12;
    }
    m.body.rotation.z=gait*pace*[.095,.18,.11][i];
    m.head.rotation.x=.04+breath*.07-(striking?.13:0);
    m.head.rotation.z=hiding?Math.sin(frameTime*2+i)*[.13,.34,.23][i]:0;
    m.jaw.scale.y=.12+(winding||striking?.18:.04)*(.63+.37*breath);
    for(const [side,arm] of m.arms.entries()){
      const swing=gait*(side===0?-1:1);
      arm.rotation.x=swing*pace*[.68,.83,.94][i]-(winding?.21:0);
      m.elbows[side].rotation.x=-.12-Math.abs(swing)*pace*.44-(striking?.23:0);
      m.legs[side].rotation.x=-swing*pace*[.63,.51,.55][i];
    }
    m.charging=charging;
    if(!m.root.visible||session.scare||session.won)continue;
    const dx=pos.x-eye.x,dz=pos.z-eye.z,distance=Math.hypot(dx,dz);
    if(distance>20)continue;
    const pan=T.MathUtils.clamp((-dx*sight.z+dz*sight.x)/Math.max(1,distance),-1,1);
    const visible=visibleBetween(pos,eye);
    const gain=Math.max(0,1-distance/20)*(visible?1:.56);
    if(footfall&&distance<13){
      tone([115,170,215][i],57,.17,gain*(striking?.32:.18),'triangle',pan);
      if(i!==0&&striking)scrape(i===1?690:1450,.16,gain*.12,pan);
    }
    const listening=i===0&&hiding&&!newCharge;
    if(listening&&distance<9&&frameTime>m.voiceAt){
      m.voiceAt=frameTime+4.8;
      scrape(280,.36,gain*.17,pan);
    }else if(!listening&&(newCharge||frameTime>m.voiceAt)){
      m.voiceAt=frameTime+(charging?[1.9,2.6,1.54][i]:hiding?[4.1,3.1,2.7][i]:[5.5,6.5,4.5][i]);
      creatureAudio?.play(i,charging,gain*(charging?.95:hiding?.56:.47),pan,!visible);
    }
    if(striking&&!local.protected&&!passageAt(eye.x,eye.z,session.level)&&distance<[1.45,1.15,1.29][i]&&visible)makeScare(i);
  }
}
function updateHeld(dt){
  for(const [i,item] of items.entries()){
    if(expedition&&(item.kind==='cell'||item.kind==='lamp'&&!lampPurchased)){
      item.mesh.visible=false;continue;
    }
    if(item.bit&&(session.mask&item.bit)){
      if(item.owner)release(item.owner);
      item.mesh.visible=false;continue;
    }
    item.mesh.visible=!!item.owner||item.level===session.level;
    if(item.owner===flatHand){
      item.mesh.position.copy(eye).addScaledVector(sight,.73);
      item.mesh.position.add(aux.set(1,0,0).applyQuaternion(view.quaternion).multiplyScalar(.29));
      item.mesh.position.y-=.32;
      item.mesh.quaternion.copy(view.quaternion);
    }else if(item.owner){
      item.owner.grip.getWorldQuaternion(item.mesh.quaternion);
      item.owner.grip.getWorldPosition(item.mesh.position);
      item.mesh.position.add(aux.set(0,-.04,-.12).applyQuaternion(item.mesh.quaternion));
    }else{
      item.mesh.rotation.y=frameTime*(.8+i*.12);
    }
  }
  const lamp=items[3];
  if(expedition&&session.light&&lamp.owner&&!session.scare){
    fieldLight.consume(dt);
    if(fieldLight.read(frameTime).battery===0){
      session.light=false;
      tone(320,105,.26,.18,'triangle');
    }
  }
  flashlight.visible=session.light&&!!lamp.owner&&!session.scare;
  flashlight.position.copy(lamp.mesh.position);
  flashlight.target.position.copy(flashlight.position)
    .add(lamp.owner===flatHand?sight:aux.set(0,0,-1).applyQuaternion(lamp.mesh.quaternion));
}
const quantize=n=>Math.round(n*100)/100;
function peerAvatars(peers,dt){
  const ids=new Set();
  for(const p of peers){
    if(p.level!==session.level)continue;
    ids.add(p.id);
    let avatar=peersUI.get(p.id);
    if(!avatar){
      avatar=hazmatMonkey();
      scene.add(avatar.root);avatar.root.position.set(p.x,Math.max(0,p.y-1.6),p.z);
      peersUI.set(p.id,avatar);
    }
    avatar.root.position.lerp(aux.set(p.x,Math.max(0,p.y-1.6),p.z),Math.min(1,dt*10));
    avatar.root.rotation.y=p.yaw;
  }
  for(const [id,avatar] of peersUI)if(!ids.has(id)){scene.remove(avatar.root);peersUI.delete(id);}
}
function syncWorld(peers,dt){
  for(const p of peers){
    session.mask|=p.mask;
    if(p.beacon>(seenBeacons.get(p.id)||0)){
      seenBeacons.set(p.id,p.beacon);lure.x=p.bx;lure.z=p.bz;lure.until=frameTime+6.5;lure.level=p.bl;
    }
  }
  const leader=peers.reduce((min,p)=>Math.min(min,p.id),rooms.id);
  const host=leader===rooms.id;
  const remote=peers.find(p=>p.id===leader)?.predators;
  if(!host&&remote)remote.forEach(([x,z,angle,level,mode],i)=>{
    const m=monsters[i];
    if(m.level!==level)m.root.position.set(x,0,z);
    else m.root.position.lerp(aux.set(x,0,z),Math.min(1,dt*8));
    m.root.rotation.y=angle;m.level=level;m.mode=mode;
  });
  patrol(dt,peers,host);
  if(!session.room)return;
  peerAvatars(peers,dt);
  const text=peers.length?'Salon '+session.room+' · '+(peers.length+1)+' joueurs':'';
  if(text!==serverText){if(text)el('connection').textContent=text;else el('connection').textContent='Salon '+session.room+' · attente d’autres joueurs';serverText=text;}
  rooms.send({
    x:quantize(eye.x),y:quantize(eye.y),z:quantize(eye.z),yaw:quantize(Math.atan2(sight.x,sight.z)),
    run:Number(session.run),light:session.light,mask:session.mask,level:session.level,
    protected:frameTime<session.immunity||session.won||!!session.scare||inShelter(eye.x,eye.z,session.level),
    beacon:localBeacon.until>frameTime?session.beacon:0,bx:quantize(localBeacon.x),bz:quantize(localBeacon.z),bl:localBeacon.level,
    predators:host?monsters.map(({root,level,mode})=>[quantize(root.position.x),quantize(root.position.z),quantize(Math.atan2(Math.sin(root.rotation.y),Math.cos(root.rotation.y))),level,mode]):null,
  });
}

selectLevel(0);resetBody();
function tickExtraction(dt){
  if(expedition)return 0;
  const ready=(session.mask&7)===7;
  if(ready&&!extractionAlarm){
    extractionAlarm=true;
    tone(510,735,.45,.31,'triangle');
  }
  if(session.won)return 0;
  const exit=station().exit;
  if(!ready||!exit||session.scare||Math.hypot(eye.x-exit.x,eye.z-exit.z)>=1.44){
    extractionCharge=0;
    return 0;
  }
  const previous=Math.floor(extractionCharge);
  extractionCharge+=dt;
  if(extractionCharge+1e-6>=extractionSeconds){
    session.won=true;
    tone(216,432,.7,.4,'triangle');
  }else if(Math.floor(extractionCharge)>previous){
    tone(342,420,.14,.19,'triangle');
  }
  return Math.max(0,Math.ceil(extractionSeconds-extractionCharge));
}
function drawFrame(time){
  const dt=Math.min(.05,Math.max(.001,(time-previousTime)/1000));previousTime=time;frameTime=time/1000;
  universeView();
  gallery.update(eye.z,session.play&&galleryEnabled());
  stations[0].galleryGate.visible=!(session.play&&galleryEnabled());
  if(session.play){
    const scared=scareTick();
    if(!scared&&!session.won)updateBody(dt);
    gallery.update(eye.z,galleryEnabled());
    const peers=rooms.activePeers();
    syncWorld(peers,dt);
    updateHeld(dt);
    const surface=galleryEnabled()?galleryWaterHeight(eye.x,eye.z):0;
    const target=surface&&eye.y<surface?T.MathUtils.smoothstep(surface-eye.y,0,.13):0;
    immersion=T.MathUtils.lerp(immersion,target,1-Math.exp(-dt*15));
    const supply=fieldLight.read(frameTime);
    matchLight.visible=expedition&&supply.phase==='burning'&&!session.scare;
    if(matchLight.visible){
      matchLight.position.copy(eye).addScaledVector(sight,.42);
      matchLight.position.y-=.28;
      matchLight.intensity=15+Math.sin(frameTime*42)*1.8;
    }
    el('supplies').textContent=expedition?'ALLUMETTES '+supply.matches+(lampPurchased?' · PILE '+Math.ceil(supply.battery/batteryCapacity*100)+' %':''):'';
    if(el('debug').open&&Math.floor(frameTime*4)!==Math.floor((frameTime-dt)*4)){
      el('debug-light').textContent=[
        'Mode : '+(expedition?'exploration':'mission'),
        'Niveau : '+(session.level+1)+' · Comptoir : '+(atCargo()?'oui':'non'),
        'Allumette : '+supply.phase+' · '+supply.remaining.toFixed(2)+' s',
        'Piles : '+supply.battery.toFixed(1)+' / '+batteryCapacity+' s',
        'Lampe : '+(flashlight.visible?'allumée':'éteinte')+' · Crédits : '+credits,
        'XR : '+(renderer.xr.isPresenting?'actif':'inactif')+' · Séquence : '+xrFrames+' images',
        ...(renderer.xr.isPresenting?[
          'Mains : '+hands.map(hand=>{
            const side=hand.source?.handedness==='left'?'G':hand.source?.handedness==='right'?'D':'—';
            return side+' '+(hand.valid?(hand.surface?(hand.groundContact?'sol':'paroi'):'libre'):'non suivie');
          }).join(' / '),
          'Dernière poussée : '+xrLaunchSpeed.toFixed(2)+' m/s',
        ]:[]),
        'Graine : '+sectorSeed+' · Secteurs chargés : '+gallery.count,
        'Sol : '+(galleryEnabled()&&galleryWet(eye.x,eye.z)?'inondé':'sec')+' · Fuite : '+(gallery.leak?'présente':'absente'),
        'Eau : '+(surface?Math.max(0,surface-galleryGround(eye.z)).toFixed(2)+' m':'hors bassin')+' · Vue sous l’eau : '+Math.round(immersion*100)+' %',
        'Acoustique : '+(waterFilter?Math.round(waterFilter.frequency.value)+' Hz':'audio inactif'),
        'Signalétique : '+(eye.z>=galleryStart?({numbered:'numérotée',sparse:'rare',none:'absente'})[sectorLayout(sectorIndex(eye.z)).markings]:'s.o.'),
        'Secteur : '+(galleryEnabled()&&eye.z>=galleryStart?sectorIndex(eye.z)+' · '+sectorLayout(sectorIndex(eye.z)).name:'bunker fixe'),
      ].join('\n');
    }
    const remaining=tickExtraction(dt);
    const count=(session.mask&1)+Number(Boolean(session.mask&2))+Number(Boolean(session.mask&4));
    const salvage=Number(Boolean(session.mask&8))+Number(Boolean(session.mask&16))+Number(Boolean(session.mask&32));
    el('counter').textContent=expedition?'CRÉDITS '+credits:'CARTOUCHES '+count+' / 3';
    el('salvage').textContent='ÉCHANTILLONS '+salvage+' / 3';
    if(session.won)showHint('Confinement rétabli · mission réussie. Retour au menu pour rejouer.');
    else if(!session.scare){
      nearItem=renderer.xr.isPresenting?null:findItem(eye,sight);
      const held=flatHand.held;
      const liftHint=['E · monter','E · monter / F · descendre','F · descendre'][session.level];
      showHint(remaining?'SAS 04 · Reste dans la zone · '+remaining+' s':atLift()?liftHint:held?.kind==='sample'?(atCargo()?'F · déposer '+held.name:'Rapporte '+held.name+' au refuge, niveau 1.'):
        held?.kind==='lamp'&&expedition&&atCargo()&&!session.light&&supply.battery<batteryCapacity&&credits?'F · Remplacer la pile (1 crédit)':
        held?'E · lâcher / F · utiliser '+held.name:
        expedition&&atCargo()&&credits&&!lampPurchased?'F · Acheter la lampe (1 crédit)':
        expedition&&atCargo()&&supply.matches<matchCapacity?'F · Reprendre des allumettes (gratuit)':
        nearItem?'E · saisir '+nearItem.name:
        expedition&&supply.phase==='striking'?'Allumage · '+supply.remaining.toFixed(1)+' s':
        expedition&&!atCargo()&&supply.matches?'F · Craquer une allumette':
        !expedition&&count===3?'Rejoins le sas 04, niveau 1.':inShelter(eye.x,eye.z,session.level)?'REFUGE · Prends ton matériel et suis le balisage.':'');
    }
    const liftMessage=['GRIP · MONTER','GRIP ↑  /  GÂCHETTE ↓','GÂCHETTE · DESCENDRE'][session.level];
    const sample=hands.some(hand=>hand.held?.kind==='sample');
    const message=session.won?'MISSION RÉUSSIE':session.scare?'CONFINEMENT ROMPU':remaining?'EXTRACTION · '+remaining+' s':atLift()?liftMessage:
      sample?(atCargo()?'GÂCHETTE · DÉPOSER':'ÉCHANTILLON → REFUGE'):
      expedition?(atCargo()&&hands.some(hand=>hand.held?.kind==='lamp')&&!session.light&&supply.battery<batteryCapacity&&credits?'PILE · 1 CRÉDIT · GÂCHETTE':
        atCargo()&&credits&&!lampPurchased?'LAMPE · 1 CRÉDIT · GÂCHETTE':
        atCargo()&&supply.matches<matchCapacity?'ALLUMETTES GRATUITES · GÂCHETTE':
        'ALLUMETTES '+supply.matches+(lampPurchased?' · PILE '+Math.ceil(supply.battery/12)*10+' %':'')):
      count===3?'SAS 04 · NIVEAU 1':'N'+(session.level+1)+' · CARTOUCHES '+count+' / 3';
    if(renderer.xr.isPresenting&&wrist.userData.message!==message){wrist.userData.message=message;setXRMessage(message);}
  }
  if(!session.play)immersion=0;
  if(waterFilter)waterFilter.frequency.setTargetAtTime(20000*Math.pow(.021,immersion),audio.currentTime,.04);
  let first=null,second=null,firstDistance=Infinity,secondDistance=Infinity;
  const outside=session.play&&galleryEnabled()&&eye.z>=galleryStart;
  const depth=outside?sectorIndex(eye.z):-1;
  gallery.animate(frameTime,outside,eye,immersion);
  const leak=outside?gallery.leak:null;
  if(leak&&session.play&&frameTime>=nextDrip){
    const dx=leak.x-eye.x,dz=leak.z-eye.z;
    const distance=Math.hypot(dx,dz);
    if(distance<12){
      const pan=T.MathUtils.clamp((-dx*sight.z+dz*sight.x)/Math.max(1,distance),-1,1);
      const clear=visibleBetween(eye,leak);
      tone(clear?1120:390,clear?490:185,.13,.24*(1-distance/12)*(clear?1:.28),'sine',pan);
      if(clear)scrape(1870,.085,.079*(1-distance/12),pan);
    }
    nextDrip=frameTime+.69+Math.sin(frameTime*7)**2*.31;
  }
  if(outside&&frameTime>=nextPipe){
    const source=gallery.lamps?.at(-1);
    if(source){
      const dx=source.x-eye.x,dz=source.z-eye.z,distance=Math.hypot(dx,dz);
      const gain=.19*Math.max(0,1-distance/20)*(visibleBetween(eye,source)?1:.21);
      if(gain>.004){
        const pan=T.MathUtils.clamp((-dx*sight.z+dz*sight.x)/Math.max(1,distance),-1,1);
        tone(174,81,.53,gain,'triangle',pan);
        scrape(610,.43,gain*.53,pan);
      }
    }
    nextPipe=frameTime+5.7+Math.sin(frameTime*1.35)**2*4.2;
  }
  el('floor').textContent=outside?(depth<3?'GALERIE '+(depth+1)+' · '+sectorLayout(depth).name:'GALERIE DE SERVICE'):
    (session.level+1)+' / 3 · '+levelNames[session.level];
  for(const position of (outside?gallery.lamps:undefined)??station().lighting){
    const distance=position.distanceToSquared(eye);
    if(distance<firstDistance){
      second=first;secondDistance=firstDistance;first=position;firstDistance=distance;
    }else if(distance<secondDistance){second=position;secondDistance=distance;}
  }
  const vapor=cryoVapor(eye.x,eye.z,session.level);
  scene.fog.color.copy(clearFog).lerp(coldFog,vapor*.76);
  scene.fog.density=.068+vapor*(.17+.021*Math.sin(frameTime*.72));
  scene.fog.color.lerp(waterFog,immersion*.93);
  scene.fog.density+=immersion*.31;
  scene.background.copy(scene.fog.color);
  if(session.play&&vapor>.25&&frameTime>ventAt){
    scrape(930,.69,vapor*.26,.2);
    ventAt=frameTime+2.35;
  }
  const safeLight=inShelter(eye.x,eye.z,session.level);
  if(outside&&first&&second)gallery.shade(scene.fog,eye,first,second,wake);
  corridorLights.forEach((light,i)=>{
    light.position.copy(i===0?first:second);
    light.color.set(safeLight?'#e1ffe1':station().ledColor);
    light.intensity=safeLight?66:(session.scare?.intense?45:34)+(Math.sin(frameTime*8+i)+Math.sin(frameTime*28-i))*.72;
  });
  station().updateExterior?.(frameTime);
  renderer.render(scene,view);
}
renderer.setAnimationLoop((time,frame)=>{
  if(!renderer.xr.isPresenting){drawFrame(time);return;}
  try{
    const space=renderer.xr.getReferenceSpace();
    const pose=space&&frame?.getViewerPose(space);
    if(!pose?.views.length)return;
    xrPose=pose.transform;
    drawFrame(time);
    xrFrames++;
  }catch(error){
    if(xrFailure)return;
    xrFailure='Erreur VR après '+xrFrames+' images · '+(error.message||error);
    console.error(xrFailure,error);
    renderer.xr.getSession()?.end().catch(()=>{});
  }
});
