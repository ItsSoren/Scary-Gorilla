import * as T from './three.js';
import {GorillaLocomotion} from './locomotion.js';
import {createFlatControls,createKeyboardState} from './flat-controls.js';
import {createRooms} from './rooms.js';
import {buildStation, fits, itemModel, levelNames, nextStep, placard, predator, where, woundModel} from './station.js';
import {behavior, createHunt, huntingSpeed} from './hunt.js';

const el=id=>document.getElementById(id);
const canvas=el('game'),menu=el('menu'),hud=el('hud');
const scene=new T.Scene();
scene.background=new T.Color('#10191a');
scene.fog=new T.FogExp2('#10191a',.068);
const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
const view=new T.PerspectiveCamera(67,1,.06,45);
const rig=new T.Group();
scene.add(rig);
rig.add(view);
scene.add(new T.HemisphereLight('#a4bbb2','#463b34',.58));
const stations=levelNames.map((_,level)=>{
  const group=new T.Group();scene.add(group);group.visible=level===0;
  return buildStation(group,level);
});
const corridorLights=Array.from({length:2},()=>new T.PointLight('#ff9d66',17,8,2));
scene.add(...corridorLights);
const flashlight=new T.SpotLight('#d4fff0',41,14,.48,.52,1.7);
scene.add(flashlight,flashlight.target);
const sight=new T.Vector3(),eye=new T.Vector3(),ray=new T.Vector3(),aux=new T.Vector3();
const velocity=new T.Vector3(),movement=new T.Vector3(),bodyDelta=new T.Vector3(),previous=new T.Vector3();
const groundRig=new T.Vector3();
const key=createKeyboardState();
const names=['Bélier','Voile','Écorce'];
const routes=['DESA','BEL','CEL'];
const idlePositions=['A','B','C'].map((symbol,level)=>where(symbol,0,level));
const hunt=createHunt({visible:visibleBetween,lifts:stations.map(station=>station.lift),
  patrolPoints:routes.map((route,level)=>Array.from(route,symbol=>where(symbol,0,level)))});
const monsters=idlePositions.map((init,index)=>{
  const model=predator(index);
  scene.add(model.root);
  model.root.position.copy(init);
  return {...model,home:init,target:init.clone(),goal:init.clone(),route:0,phase:0,nextThink:0,level:index,mode:behavior.patrol,nextLift:0};
});
const items=[
  ...['A','B','C'].map((symbol,level)=>({name:'Cartouche '+(level+1),kind:'cell',symbol,bit:1<<level,level})),
  {name:'Lampe',kind:'lamp',symbol:'S',level:0}, {name:'Balise acoustique',kind:'decoy',symbol:'D',level:0},
].map((item,index)=>{
  const mesh=itemModel(item.kind),home=where(item.symbol,.63,item.level);
  if(index===3)home.x+=.82;
  scene.add(mesh);
  return {...item,mesh,home,homeLevel:item.level,owner:null};
});
const peersUI=new Map();
const session={play:false,mask:0,won:false,scare:null,immunity:0,run:false,light:false,beacon:0,room:'',level:0};
const lure={until:0,x:0,z:0,level:0};
const localBeacon={until:0,x:0,z:0,level:0};
const station=()=>stations[session.level];
const seenBeacons=new Map();
const rooms=createRooms(status=>{el('connection').textContent=status;if(!session.play)el('status').textContent=status;});
const wrist=new T.Group();
const wristMessages=new Map();
let yaw=0,pitch=0,turnReady=true,previousTime=0,nearItem=null,serverText='',lastAudioStep=0,lastAtmos=0,frameTime=0;
let audio,master,noise;
const hands=[0,1].map(index=>{
  const input=renderer.xr.getController(index),grip=renderer.xr.getControllerGrip(index);
  const mesh=new T.Mesh(new T.IcosahedronGeometry(.09,1),new T.MeshStandardMaterial({color:index?'#b47142':'#799178'}));
  mesh.scale.set(.88,.58,1.3);
  grip.add(mesh);
  rig.add(input,grip);
  const hand={grip,input,mesh:{quaternion:new T.Quaternion()},target:new T.Vector3(),valid:false,held:null,source:null,scan:new T.Vector3()};
  input.addEventListener('connected',e=>{hand.source=e.data;});
  input.addEventListener('disconnected',()=>{release(hand);hand.source=null;hand.valid=false;});
  input.addEventListener('squeezestart',()=>{if(session.play)grab(hand);});
  input.addEventListener('selectstart',()=>{if(session.play)use(hand);});
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
    if(expanded.containsPoint(from)){
      aux.copy(from);
      if(expanded.containsPoint(to))aux.copy(to);
    }else if(!segment.intersectBox(expanded,aux))continue;
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
    if(expanded.containsPoint(from)&&segment.direction.x*nx+segment.direction.y*ny+segment.direction.z*nz>0)continue;
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
  if(renderer.xr.isPresenting)renderer.xr.updateCamera(view);
  view.getWorldPosition(eye);view.getWorldDirection(sight);
}
function moveRig(dx,dy,dz){
  const offsetX=eye.x-rig.position.x,offsetZ=eye.z-rig.position.z;
  previous.copy(rig.position);
  if(fits(rig.position.x+offsetX+dx,rig.position.z+offsetZ,.25,session.level))rig.position.x+=dx;
  if(fits(rig.position.x+offsetX,rig.position.z+offsetZ+dz,.25,session.level))rig.position.z+=dz;
  rig.position.y=T.MathUtils.clamp(rig.position.y+dy,0,1);
  if(rig.position.y===0&&velocity.y<0)velocity.y=0;
  bodyDelta.subVectors(rig.position,previous);
}
function resetBody(useLift=false){
  rig.position.copy(useLift?station().lift:where('S'));rig.rotation.set(0,0,0);
  view.position.set(0,1.62,0);
  yaw=-Math.PI/2;pitch=0;
  view.rotation.set(pitch,yaw,0,'YXZ');
  velocity.set(0,0,0);locomotion.reset();
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
function audioStart(){
  try{
    if(!audio){
      audio=new AudioContext();master=audio.createGain();master.connect(audio.destination);
      const hum=audio.createOscillator(),volume=audio.createGain();
      hum.type='sine';hum.frequency.value=49;volume.gain.value=.075;
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
  const now=audio.currentTime,osc=audio.createOscillator(),envelope=audio.createGain(),panner=audio.createStereoPanner();
  osc.type=type;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(end,now+seconds);
  envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(gain,now+.016);
  envelope.gain.exponentialRampToValueAtTime(.0001,now+seconds);
  panner.pan.value=pan;
  osc.connect(envelope).connect(panner).connect(master);
  osc.start(now);osc.stop(now+seconds+.02);
}
function scrape(frequency,seconds,gain,pan){
  if(!noise||audio.state!=='running')return;
  const now=audio.currentTime,source=audio.createBufferSource(),filter=audio.createBiquadFilter();
  const envelope=audio.createGain(),panner=audio.createStereoPanner();
  source.buffer=noise;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=2.2;
  envelope.gain.setValueAtTime(.001,now);envelope.gain.exponentialRampToValueAtTime(gain,now+.032);
  envelope.gain.exponentialRampToValueAtTime(.001,now+seconds);panner.pan.value=pan;
  source.connect(filter).connect(envelope).connect(panner).connect(master);
  source.start(now);source.stop(now+seconds);
}
function release(hand){
  const item=hand.held;
  if(!item)return;
  hand.held=null;item.owner=null;
  if(item.kind==='lamp')session.light=false;
  const dropX=item.mesh.position.x,dropZ=item.mesh.position.z;
  if(fits(dropX,dropZ,.16,session.level)){
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
    aux.subVectors(item.mesh.position,position);
    const distance=aux.length();
    if(distance>=max||(look&&aux.dot(look)<distance*.77)||!visibleBetween(position,item.mesh.position))continue;
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
  if(!item)return;
  if(item.kind==='lamp')session.light=!session.light;
  if(item.kind==='decoy'){
    lure.x=item.mesh.position.x;lure.z=item.mesh.position.z;
    lure.until=frameTime+7;lure.level=session.level;session.beacon++;
    Object.assign(localBeacon,lure);
    tone(720,480,.22,.35,'triangle');
    release(hand);
  }
  if(item.kind==='cell'){
    session.mask|=item.bit;release(hand);item.mesh.visible=false;
    tone(370,850,.3,.28,'triangle');
  }
}
const controls=createFlatControls({
  canvas,enabled:()=>session.play&&!renderer.xr.isPresenting,
  onLook(dx,dy,sensitivity){yaw-=dx*sensitivity;pitch=T.MathUtils.clamp(pitch-dy*sensitivity,-1.38,1.38);},
  onAction(action){if(action==='interact')grab(flatHand);else if(action==='use')use(flatHand);},
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
  session.light=false;
  clearScare();
  lure.until=0;localBeacon.until=0;seenBeacons.clear();hunt.reset();
  for(const hand of [...hands,flatHand])release(hand);
  for(const item of items){
    item.level=item.homeLevel;
    item.mesh.position.copy(item.home);item.mesh.rotation.set(0,0,0);item.mesh.visible=true;
  }
  monsters.forEach((m,i)=>{
    m.root.position.copy(m.home);m.target.copy(m.home);m.goal.copy(m.home);m.nextThink=0;m.route=i;
    m.level=i;m.mode=behavior.patrol;m.nextLift=0;m.phase=0;
  });
  selectLevel(0);
  resetBody();
}
function removePeers(){
  for(const p of peersUI.values())scene.remove(p.root);
  peersUI.clear();
}
function start(){
  session.play=true;session.room=el('room').value;resetGame();
  menu.hidden=true;hud.hidden=false;
  audioStart();rooms.join(session.room);serverText='';
}
function stop(){
  if(!session.play)return;
  session.play=false;rooms.join('');removePeers();
  if(audio?.state==='running')audio.suspend().catch(()=>{});
  clearScare();
  key.clear();controls.clear();
  selectLevel(0);
  menu.hidden=false;hud.hidden=true;resetBody();
}
el('back').onclick=stop;
el('start').onclick=start;
el('volume').oninput=()=>{if(master)master.gain.value=Number(el('volume').value)*.0034;};
el('vr').onclick=async()=>{
  el('vr').disabled=true;
  try{
    audioStart();
    const xr=await navigator.xr.requestSession('immersive-vr');
    try{await renderer.xr.setSession(xr);}
    catch(error){await xr.end().catch(()=>{});throw error;}
    document.body.classList.add('immersive');start();
  }catch(error){
    if(audio?.state==='running')audio.suspend().catch(()=>{});
    el('status').textContent='Impossible de lancer la VR · '+error.message;
    el('vr').disabled=false;
  }
};
renderer.xr.addEventListener('sessionend',()=>{
  document.body.classList.remove('immersive');el('vr').disabled=false;
  stop();resize();
});
el('start').disabled=false;
el('status').textContent='Mode écran disponible. Vérification du casque…';
Promise.resolve(navigator.xr?.isSessionSupported('immersive-vr')).then(supported=>{
  el('vr').disabled=!supported;
  if(!session.play)el('status').textContent=supported?'Casque WebXR détecté.':'VR disponible depuis un navigateur de casque compatible, en HTTPS.';
}).catch(()=>{if(!session.play)el('status').textContent='Mode écran disponible.';});

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
    const horizontal=Math.abs(axes?.[2]??0)>.18?axes[2]:0;
    const forward=Math.abs(axes?.[3]??0)>.18?axes[3]:0;
    locomotion.move({head:eye,dt,gravity:13,settings:{grip:4,slide:3,jump:3,weight:4},boxes:station().solids,velocity,movement,reach:1.25});
    ray.set(sight.x,0,sight.z).normalize();
    movement.x+=(ray.x*-forward-ray.z*horizontal)*dt*2.5;
    movement.z+=(ray.z*-forward+ray.x*horizontal)*dt*2.5;
    moveRig(movement.x,movement.y,movement.z);
    locomotion.finish(bodyDelta,velocity);
    session.run=bodyDelta.length()/dt>2.85;
  }else{
    view.rotation.set(pitch,yaw,0,'YXZ');
    view.position.set(0,1.62,0);
    universeView();
    const held=(...codes)=>codes.some(code=>key.held.has(code));
    const x=Number(held('KeyD','ArrowRight'))-Number(held('KeyA','KeyQ','ArrowLeft'))+controls.movement.x;
    const z=Number(held('KeyS','ArrowDown'))-Number(held('KeyW','KeyZ','ArrowUp'))+controls.movement.z;
    const speed=held('ShiftLeft','ShiftRight')?4.6:2.55;
    const step=dt*speed/Math.max(1,Math.hypot(x,z));
    moveRig((Math.cos(yaw)*x+Math.sin(yaw)*z)*step,0,(-Math.sin(yaw)*x+Math.cos(yaw)*z)*step);
    session.run=speed>3&&bodyDelta.lengthSq()>.00001;
    if(key.pressed.delete('KeyE'))grab(flatHand);
    if(key.pressed.delete('KeyF'))use(flatHand);
    key.pressed.clear();
  }
  rig.updateMatrixWorld(true);universeView();
  if((rig.position.distanceToSquared(groundRig)>dt*dt*.9)&&frameTime-lastAudioStep>(session.run?.28:.47)){
    lastAudioStep=frameTime;tone(83,37,.15,session.run?.20:.10,'triangle');
  }
}
function visibleBetween(from,to,level=session.level){
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  const count=Math.max(1,Math.ceil(length/.4));
  for(let i=1;i<count;i++){
    if(!fits(T.MathUtils.lerp(from.x,to.x,i/count),T.MathUtils.lerp(from.z,to.z,i/count),.015,level))return false;
  }
  return true;
}
function makeScare(index){
  const model=predator(index);
  const intense=el('shock').value==='full';
  const direction=sight.clone();direction.y=0;direction.normalize();
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
  model.head.traverse(part=>{if(part.isMesh&&!part.userData.disposeMaterial)part.renderOrder=Math.max(12,part.renderOrder);});
  model.jaw.scale.y*=2.3;
  scene.add(model.root);
  session.scare={...model,spray,direction,start:frameTime,end:frameTime+(intense?1.05:.52),intense};
  tone([190,520,91][index],36,.55,intense?.49:.13,'sawtooth');
  tone([961,393,731][index],204,.39,intense?.30:.08,'triangle');
  if(intense)scrape(1380,.63,.78,0);
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
    const lunge=Math.min(1,elapsed/.22);
    scare.root.position.copy(eye).addScaledVector(scare.direction,scare.intense?1.23-.51*lunge:1.52-.18*lunge);
    scare.root.position.y=eye.y-1.78*scare.height;
    scare.head.rotation.z=Math.sin(elapsed*41)*.16*lunge;
    scare.jaw.scale.y=.31+Math.sin(elapsed*18)*.08;
    for(const {drop,x,y,z} of scare.spray)drop.position.set(x*elapsed,-.15+y*elapsed-elapsed**2*.55,.57+z*elapsed);
    return true;
  }
  clearScare();
  for(const hand of [...hands,flatHand])release(hand);
  selectLevel(0);
  resetBody();session.immunity=frameTime+6;showHint('');
  return false;
}
function patrol(dt,peers,host){
  const local={id:rooms.id,x:eye.x,z:eye.z,yaw:Math.atan2(sight.x,sight.z),
    run:session.run,light:session.light,level:session.level,
    protected:frameTime<session.immunity||session.won||!!session.scare};
  if(host)hunt.plan(frameTime,monsters,[local,...peers],lure);
  for(const [i,m] of monsters.entries()){
    const pos=m.root.position;
    if(host&&frameTime>=m.nextThink){
      m.nextThink=frameTime+.17+(i*.018);
      m.target.copy(nextStep(pos,m.goal,m.level));
    }
    if(host){
      const dx=m.target.x-pos.x,dz=m.target.z-pos.z,dist=Math.hypot(dx,dz);
      if(dist>.045){
        const step=Math.min(dist,huntingSpeed[m.mode]*[1,.94,1.04][i]*dt)/dist;
        if(fits(pos.x+dx*step,pos.z,.34,m.level))pos.x+=dx*step;
        if(fits(pos.x,pos.z+dz*step,.34,m.level))pos.z+=dz*step;
        m.root.rotation.y=Math.atan2(dx,dz);
      }
    }
    const charging=m.mode===behavior.charge, hiding=m.mode===behavior.hide||m.mode===behavior.watch;
    m.root.visible=m.level===session.level;
    m.root.scale.y=T.MathUtils.lerp(m.root.scale.y,m.height*(hiding?.78:1),Math.min(1,dt*6));
    m.head.rotation.x=.07+Math.sin(frameTime*4+i)*(hiding?.035:.11);
    m.head.rotation.z=hiding?Math.sin(frameTime*2+i)*.24:0;
    for(const [side,arm] of m.arms.entries())arm.rotation.x=Math.sin(frameTime*(charging?12:5)+side*Math.PI+i)*(hiding?.09:.4);
    if(m.root.visible&&charging&&!local.protected&&!session.scare&&Math.hypot(pos.x-eye.x,pos.z-eye.z)<1.23&&visibleBetween(pos,eye))makeScare(i);
  }
}
function updateHeld(){
  for(const [i,item] of items.entries()){
    if(item.bit&&(session.mask&item.bit)){
      if(item.owner)release(item.owner);
      item.mesh.visible=false;continue;
    }
    item.mesh.visible=!!item.owner||item.level===session.level;
    if(item.owner===flatHand){
      item.mesh.position.copy(eye).addScaledVector(sight,.73);
      item.mesh.position.y-=.24;
      item.mesh.rotation.set(.08,yaw,0);
    }else if(item.owner){
      item.owner.grip.getWorldQuaternion(item.mesh.quaternion);
      item.owner.grip.getWorldPosition(item.mesh.position);
      item.mesh.position.add(aux.set(0,-.04,-.12).applyQuaternion(item.mesh.quaternion));
    }else{
      item.mesh.rotation.y=frameTime*(.8+i*.12);
    }
  }
  const lamp=items[3];
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
      avatar=predator(1);
      avatar.root.scale.setScalar(.69);
      avatar.root.traverse(mesh=>{
        if(mesh.isMesh&&mesh.material.isMeshStandardMaterial){
          mesh.material=mesh.material.clone();mesh.material.color.set('#4f6672');
        }
      });
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
    protected:frameTime<session.immunity||session.won||!!session.scare,
    beacon:localBeacon.until>frameTime?session.beacon:0,bx:quantize(localBeacon.x),bz:quantize(localBeacon.z),bl:localBeacon.level,
    predators:host?monsters.map(({root,level,mode})=>[quantize(root.position.x),quantize(root.position.z),quantize(Math.atan2(Math.sin(root.rotation.y),Math.cos(root.rotation.y))),level,mode]):null,
  });
}

selectLevel(0);resetBody();
renderer.setAnimationLoop(time=>{
  const dt=Math.min(.05,Math.max(.001,(time-previousTime)/1000));previousTime=time;frameTime=time/1000;
  universeView();
  if(session.play){
    const scared=scareTick();
    if(!scared&&!session.won)updateBody(dt);
    const peers=rooms.activePeers();
    syncWorld(peers,dt);
    updateHeld();
    const exit=station().exit;
    if(exit&&session.mask===7&&Math.hypot(eye.x-exit.x,eye.z-exit.z)<1.44&&!session.won&&!session.scare){
      session.won=true;
      tone(216,432,.7,.4,'triangle');
    }
    const count=(session.mask&1)+Number(Boolean(session.mask&2))+Number(Boolean(session.mask&4));
    el('counter').textContent='CARTOUCHES '+count+' / 3';
    if(session.won)showHint('Confinement rétabli · mission réussie. Retour au menu pour rejouer.');
    else if(!session.scare){
      nearItem=renderer.xr.isPresenting?null:findItem(eye,sight);
      const held=flatHand.held;
      const liftHint=['E · monter','E · monter / F · descendre','F · descendre'][session.level];
      showHint(atLift()?liftHint:held?'E · lâcher / F · utiliser '+held.name:nearItem?'E · saisir '+nearItem.name:session.mask===7?'Rejoins le sas 04, niveau 1.':'');
    }
    const liftMessage=['GRIP · MONTER','GRIP ↑  /  GÂCHETTE ↓','GÂCHETTE · DESCENDRE'][session.level];
    const message=session.won?'MISSION RÉUSSIE':session.scare?'CONFINEMENT ROMPU':atLift()?liftMessage:count===3?'SAS 04 · NIVEAU 1':'N'+(session.level+1)+' · CARTOUCHES '+count+' / 3';
    if(renderer.xr.isPresenting&&wrist.userData.message!==message){wrist.userData.message=message;setXRMessage(message);}
    if(!session.scare&&!session.won&&frameTime>lastAtmos){
      const closest=monsters.filter(m=>m.level===session.level)
        .sort((a,b)=>a.root.position.distanceToSquared(eye)-b.root.position.distanceToSquared(eye))[0];
      if(closest){
        const p=closest.root.position,distance=Math.hypot(p.x-eye.x,p.z-eye.z);
        const pan=T.MathUtils.clamp(((p.x-eye.x)*-sight.z+(p.z-eye.z)*sight.x)/Math.max(1,distance),-1,1);
        const watch=closest.mode!==behavior.patrol;
        if(distance<16){
          tone(watch?70:53,32,.42,.07+(16-distance)*.009,'triangle',pan);
          if(watch)scrape(closest.mode===behavior.charge?700:370,.35,.15,pan);
        }
        lastAtmos=frameTime+(watch?1.05:3.5)+Math.random()*.8;
      }else lastAtmos=frameTime+1;
    }
  }
  let first=null,second=null,firstDistance=Infinity,secondDistance=Infinity;
  for(const position of station().lighting){
    const distance=position.distanceToSquared(eye);
    if(distance<firstDistance){
      second=first;secondDistance=firstDistance;first=position;firstDistance=distance;
    }else if(distance<secondDistance){second=position;secondDistance=distance;}
  }
  corridorLights.forEach((light,i)=>{
    light.position.copy(i===0?first:second);
    light.intensity=(session.scare?.intense?25:18)+(Math.sin(frameTime*8+i)+Math.sin(frameTime*28-i))*.72;
  });
  renderer.render(scene,view);
});
