import * as T from './three.js';

export const cells = [
  '###############',
  '#..S..#....A..#',
  '#.....#.###...#',
  '#.....#...#...#',
  '###.#####.#.###',
  '#...V.....#..B#',
  '#.#.#.##..###.#',
  '#.#...T.......#',
  '#.#####.####..#',
  '#...L...#.....#',
  '#.#.###.#.###.#',
  '#.#....E#....C#',
  '#D#.###...#..X#',
  '#.............#',
  '###############',
];
export const levels=[
  cells,
  [
    '###########',
    '#L...#...B#',
    '#.##.#.#..#',
    '#....#.#..#',
    '###.##.##.#',
    '#...E.....#',
    '#.#.###.#.#',
    '#.#...#...#',
    '#.###.###.#',
    '#.........#',
    '###########',
  ],
  [
    '###########',
    '#L..#.....#',
    '###.#.###.#',
    '#...#.#C..#',
    '#.###.###.#',
    '#.......#.#',
    '#.#####.#.#',
    '#....E#...#',
    '####..###.#',
    '#.........#',
    '###########',
  ],
];
export const levelNames=['Réception','Cryogénie','Incubation'];
export const tile = 3.5;
const center=level=>(levels[level].length-1)/2;
export const point = (col,row,y=0,level=0) => new T.Vector3((col-center(level))*tile,y,(row-center(level))*tile);
export function where(symbol,y=0,level=0) {
  const rows=levels[level],row=rows.findIndex(line=>line.includes(symbol));
  return point(rows[row].indexOf(symbol),row,y,level);
}
export function cellOf(x,z,level=0) {return [Math.round(x/tile+center(level)),Math.round(z/tile+center(level))];}
export function cryoVapor(x,z,level){
  if(level!==1)return 0;
  const distance=Math.hypot(x+2.8,z);
  return T.MathUtils.clamp((8.7-distance)/4.7,0,1);
}
export function metalGrating(col,row,level){
  return level===2&&((col>=2&&col<=5&&row>=5&&row<=8)||(col>=7&&row===3));
}
export function inShelter(x,z,level){
  if(level!==0)return false;
  const [column,row]=cellOf(x,z,level);
  return column>=1&&column<=5&&row>=1&&row<=3;
}
export function open(col,row,level=0) {const cell=levels[level][row]?.[col];return !!cell&&cell!=='#';}
export function monsterOpen(col,row,level){
  const cell=levels[level][row]?.[col];
  return open(col,row,level)&&cell!=='V'&&cell!=='T';
}
export function passageAt(x,z,level){
  const [col,row]=cellOf(x,z,level);
  const cell=levels[level][row]?.[col];
  return cell==='V'||cell==='T'?{kind:cell,col,row}:null;
}
export function fits(x,z,r=.25,level=0) {
  const [left,top]=cellOf(x-r,z-r,level),[right,bottom]=cellOf(x+r,z+r,level);
  for(let row=top;row<=bottom;row++) for(let col=left;col<=right;col++) if(!open(col,row,level)) return false;
  return true;
}
const neighbors=[[1,0],[-1,0],[0,1],[0,-1]];
export function nextStep(from,to,level=0,forMonster=false) {
  const [sx,sz]=cellOf(from.x,from.z,level),[tx,tz]=cellOf(to.x,to.z,level);
  if(sx===tx&&sz===tz)return to.clone();
  const visited=new Set([sz*15+sx]),queue=[[sx,sz,null]];
  for(let i=0;i<queue.length;i++){
    const [x,z,first]=queue[i];
    for(const [dx,dz] of neighbors){
      const col=x+dx,row=z+dz,key=row*15+col;
      if(!(forMonster?monsterOpen(col,row,level):open(col,row,level))||visited.has(key))continue;
      const step=first??point(col,row,from.y,level);
      if(col===tx&&row===tz)return step;
      visited.add(key);
      queue.push([col,row,step]);
    }
  }
  return from.clone();
}
const box = new T.BoxGeometry(1,1,1);
const sphere = new T.IcosahedronGeometry(1,1);
const muscle = new T.SphereGeometry(1,14,10);
const limbs = new T.CylinderGeometry(.72,1,1,7);
const skins=[
  new T.MeshStandardMaterial({color:'#4a352f',roughness:.93}),
  new T.MeshStandardMaterial({color:'#353b49',roughness:.76}),
  new T.MeshStandardMaterial({color:'#4a4a32',roughness:.95}),
];
const ceramic = new T.MeshStandardMaterial({color:'#aaa693',roughness:.75});
const dark = new T.MeshStandardMaterial({color:'#110e12',roughness:1});
const eyeMats=['#ff8c37','#aff3e9','#f2dc4d'].map(color=>new T.MeshBasicMaterial({color}));

function piece(parent,geo,material,x,y,z,sx,sy,sz){
  const mesh=new T.Mesh(geo,material);
  mesh.position.set(x,y,z);
  mesh.scale.set(sx,sy,sz);
  parent.add(mesh);
  return mesh;
}
export function predator(type){
  const root=new T.Group(),skin=skins[type],glow=eyeMats[type];
  if(!skin.map){skin.map=surfaceMap('skin');skin.needsUpdate=true;}
  const wide=[1.04,.77,1.16][type],height=[1,.79,1.13][type];
  const body=new T.Group();
  root.add(body);
  piece(body,muscle,skin,0,1.32,0,.69*wide,.82,type===0?.57:.43);
  piece(body,muscle,skin,0,1.8,.03,.84*wide,.43,.48);
  if(type===0){
    for(const side of [-1,1]){
      piece(body,muscle,skin,side*.48,1.88,-.08,.48,.39,.49).rotation.z=side*.38;
      piece(body,muscle,skin,side*.29,1.53,.36,.36,.33,.22).rotation.z=-side*.24;
    }
    piece(body,muscle,skin,0,1.94,.16,.46,.34,.41);
  }
  const head=new T.Group();
  head.position.set(0,1.96,.34);
  body.add(head);
  piece(head,muscle,skin,0,.15,0,.46*wide,.48,.4);
  piece(head,muscle,type===1?ceramic:skin,0,.05,.24,.35*wide,.32,.33);
  const jaw=piece(head,sphere,dark,0,-.12,.48,.27*wide,.15,.09);
  for(const side of [-1,1]){
    if(type!==0){
      piece(head,sphere,glow,side*.17*wide,.14,.49,type===1?.1:.065,.035,.04);
      piece(head,limbs,ceramic,side*.15,-.12,.55,.035,.14,.036);
    }else{
      piece(head,muscle,dark,side*.17,.167,.48,.124,.079,.104);
      piece(head,muscle,glow,side*.166,.163,.571,.028,.019,.016);
      piece(head,muscle,skin,side*.171,.228,.493,.166,.069,.115).rotation.z=side*.27;
      piece(head,muscle,skin,side*.285,.005,.408,.147,.21,.17);
      piece(head,muscle,dark,side*.077,.023,.644,.049,.031,.021);
    }
  }
  const legs=[-1,1].map(side=>{
    const leg=new T.Group();
    leg.position.set(side*.32,.87,-.08);body.add(leg);
    piece(leg,muscle,skin,0,-.28,0,.245,.42,.235);
    piece(leg,muscle,skin,0,-.71,.12,.23,.15,.33);
    return leg;
  });
  const elbows=[];
  const arms=[-1,1].map(side=>{
    const arm=new T.Group();
    arm.position.set(side*.65*wide,1.73,0);
    body.add(arm);
    arm.rotation.z=side*[.29,.59,.45][type];
    piece(arm,muscle,skin,0,-.41,0,.25,.49,.26);
    const elbow=new T.Group();elbow.position.y=-.8;arm.add(elbow);elbows.push(elbow);
    piece(elbow,muscle,skin,0,-.24,.02,.2,.37,.23);
    piece(elbow,muscle,skin,0,-.53,.05,.23,.24,.19);
    for(let i=-1;i<=1;i++)piece(elbow,limbs,ceramic,i*.1,-.68,.11,.025,.14,.027);
    return arm;
  });
  if(type===0){
    piece(head,muscle,skin,0,.28,.016,.225,.28,.31);
    piece(head,muscle,skin,0,.051,.471,.219,.142,.177);
    piece(head,muscle,skin,0,-.239,.43,.273,.085,.146);
    for(let i=0;i<4;i++)piece(body,box,ceramic,0,1.23+i*.17,-.37,.39,.075,.09);
  }else if(type===1){
    piece(head,box,dark,0,.06,.51,.53,.085,.085);
    for(const side of [-1,1])piece(head,limbs,skin,side*.40,.33,-.03,.13,.48,.13).rotation.z=side*.42;
  }else{
    for(let i=-2;i<=2;i++)piece(body,limbs,ceramic,i*.19,2.04-Math.abs(i)*.08,-.24,.10,.42,.11).rotation.x=-.63;
  }
  root.scale.y=height;
  return {root,body,head,jaw,arms,elbows,legs,height};
}
const blood=new T.MeshBasicMaterial({color:'#81121c',depthTest:false,depthWrite:false});
const freshBlood=new T.MeshBasicMaterial({color:'#e6353a',depthTest:false,depthWrite:false});
const blackBlood=new T.MeshBasicMaterial({color:'#3a070d',depthTest:false,depthWrite:false});
const teeth=new T.MeshBasicMaterial({color:'#dec5ac',depthTest:false,depthWrite:false});
export function woundModel(model,type){
  const {head}=model;
  piece(head,sphere,blackBlood,0,-.119,.561,.29,.17,.068);
  for(let i=0;i<9;i++){
    const x=(i-4)*.059;
    const tooth=piece(head,limbs,teeth,x,-.024-Math.abs(x)*.24,.631,.019,i%3===0?.087:.052,.018);
    tooth.rotation.z=-x*.75;
    piece(head,limbs,teeth,x,-.225+Math.abs(x)*.21,.626,.017,.04,.017).rotation.x=Math.PI;
    piece(head,sphere,i%3===0?freshBlood:blood,x,-.26+Math.abs(x)*.27,.584,.032,.07+i%3*.032,.034);
  }
  for(let i=0;i<7;i++){
    const side=type===1?-1:1;
    const slice=piece(head,sphere,i%2?blood:blackBlood,side*(.12+i*.029),.32-i*.061,.491+i*.013,.078,.024,.021);
    slice.rotation.z=side*.91;
  }
  return Array.from({length:19},(_,i)=>{
    const drop=piece(head,sphere,i%2?freshBlood:blood,0,-.16,.65,.016,.028,.018);
    drop.renderOrder=13;
    return {drop,x:Math.sin(i*3.12)*(.46+i*.027),y:Math.cos(i*1.37)*.45,z:.21+i%6*.12};
  });
}
const paint=(color,metalness=.1)=>new T.MeshStandardMaterial({color,metalness,roughness:.82});
const barrel=new T.CylinderGeometry(1,1,1,16);
const itemShell=paint('#303d3e',.27),itemGrip=paint('#1b2326',.1),itemSteel=paint('#77868b',.55);
export function itemModel(kind){
  const root=new T.Group();
  if(kind==='lamp'){
    piece(root,barrel,itemShell,0,0,.03,.083,.43,.083).rotation.x=Math.PI/2;
    for(let i=0;i<7;i++)piece(root,barrel,itemGrip,0,0,.06+i*.021,.088,.011,.088).rotation.x=Math.PI/2;
    piece(root,limbs,itemSteel,0,0,-.16,.137,.18,.137).rotation.x=-Math.PI/2;
    piece(root,barrel,itemGrip,0,0,-.245,.121,.055,.121).rotation.x=Math.PI/2;
    piece(root,barrel,paint('#b1cbd0',.5),0,0,-.275,.099,.012,.099).rotation.x=Math.PI/2;
    piece(root,box,itemGrip,0,.085,.026,.049,.026,.085);
    piece(root,box,eyeMats[1],0,.099,.039,.024,.006,.019);
  }else if(kind==='decoy'){
    piece(root,box,itemShell,0,-.01,0,.34,.19,.27);
    piece(root,box,itemGrip,0,.095,0,.318,.03,.252);
    for(const x of [-.145,.145]){
      piece(root,box,itemSteel,x,-.012,0,.03,.205,.268);
      for(const z of [-.107,.107])piece(root,box,itemGrip,x,.108,z,.024,.011,.023);
    }
    for(let i=0;i<6;i++)piece(root,box,itemGrip,.084-i*.027,-.012,.142,.011,.11,.02);
    piece(root,barrel,itemSteel,0,.115,.047,.061,.019,.061);
    piece(root,barrel,eyeMats[0],0,.131,.047,.038,.012,.038);
  }else if(kind==='sample'){
    piece(root,limbs,paint('#3c514a',.38),0,0,0,.137,.38,.137);
    piece(root,limbs,new T.MeshBasicMaterial({color:'#b8ef65'}),0,.043,0,.099,.245,.099);
    piece(root,limbs,paint('#56554a',.45),0,.2,0,.137,.075,.137);
    piece(root,limbs,paint('#56554a',.45),0,-.15,0,.137,.07,.137);
  }else{
    piece(root,box,paint('#516566',.35),0,0,0,.21,.44,.17);
    piece(root,box,eyeMats[1],0,.03,.09,.096,.29,.02);
    piece(root,box,paint('#d77c36'),0,.22,0,.16,.06,.13);
  }
  return root;
}
export function placard(text,color='#ffb979'){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=128;
  const context=canvas.getContext('2d');
  context.fillStyle='#10191b';context.fillRect(0,0,512,128);
  context.strokeStyle=color;context.lineWidth=5;context.strokeRect(6,6,500,116);
  context.fillStyle=color;context.font='bold 54px monospace';context.textAlign='center';context.textBaseline='middle';
  context.fillText(text,256,67,470);
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(1.7,.425),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
}
const surfaceMaps=new Map();
const grain=(x,y)=>{
  const hash=Math.imul(x+653,197639)^Math.imul(y+2971,1500450271);
  return ((Math.imul(hash^(hash>>>15),2246822519)>>>0)%1024)/1023;
};
function mottling(x,y,scale){
  const gx=Math.floor(x/scale),gy=Math.floor(y/scale),u=x/scale-gx,v=y/scale-gy;
  return T.MathUtils.lerp(T.MathUtils.lerp(grain(gx,gy),grain(gx+1,gy),u),
    T.MathUtils.lerp(grain(gx,gy+1),grain(gx+1,gy+1),u),v);
}
function surfaceMap(kind){
  if(surfaceMaps.has(kind))return surfaceMaps.get(kind);
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const fine=grain(x,y),mottle=mottling(x,y,34),fineMottle=mottling(x,y,8);
    const edgeX=Math.min(x,size-1-x),edgeY=Math.min(y,size-1-y);
    let value=138+fine*22+mottle*67+fineMottle*22;
    if(kind==='skin'){
      const pores=Math.sin(x*.56+y*.18+mottle*8)*Math.sin(y*.81);
      value=105+mottle*93+fineMottle*38+pores*22;
    }else if(kind==='floor'){
      const edge=Math.min(x%128,127-x%128,y%128,127-y%128);
      if(edge<2)value=49+fine*21;
      else if(edge<4)value=126+fine*19;
      const treadX=(x+(y>>4)%2*10)%20-10,treadY=y%16-8;
      if(Math.abs(treadY-treadX*.37)<1.4&&Math.abs(treadX)<4)value+=17;
    }else{
      if(edgeX<3||edgeY<3)value*=.52;
      if((edgeX-13)**2+(edgeY-13)**2<14)value=70+fine*50;
      if(kind==='wall'&&y<92){value*=y<56?.58:.82;if(y>59&&y<64)value*=1.26;}
      if(kind==='wall'&&y<150)value-=Math.max(0,mottling(x,y*.12,6)-.48)*38*(1-y/186);
      if(kind==='ceiling'&&(x%50<2||y<7))value*=.64;
    }
    const offset=(y*size+x)*4;
    data[offset]=Math.min(255,value);data[offset+1]=Math.min(255,value*.984);
    data[offset+2]=Math.min(255,value*.955);data[offset+3]=255;
  }
  const map=new T.DataTexture(data,size,size);
  map.colorSpace=T.SRGBColorSpace;
  map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;
  map.anisotropy=4;map.needsUpdate=true;surfaceMaps.set(kind,map);return map;
}
const hazardMap=(()=>{
  const data=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const bright=(x+y)%32<17,wear=.75+grain(x,y)*.25,offset=(y*64+x)*4;
    data.set(bright?[226*wear,163*wear,49*wear,255]:[36*wear,40*wear,38*wear,255],offset);
  }
  const texture=new T.DataTexture(data,64,64);
  texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  return texture;
})();
function signAt(scene,text,color,x,y,z,rotation=0){
  const sign=placard(text,color);
  sign.position.set(x,y,z);sign.rotation.y=rotation;scene.add(sign);return sign;
}
function buildShelter(scene,lighting,furniture){
  const start=where('S'),cargo=where('S',0);
  cargo.z+=8;cargo.x-=4.1;
  const casing=paint('#273533',.38),shell=paint('#72847b',.38);
  const glow=new T.MeshBasicMaterial({color:'#b3ffbb'});
  // Wide muster room, warm overhead strips and color-coded supply stands.
  for(const side of [-1,1]){
    const x=start.x+side*.92,z=start.z+1.42;
    piece(scene,box,casing,x,.42,z,.66,.82,.57);
    piece(scene,box,shell,x,.87,z,.73,.09,.65);
    furniture(x,.45,z,.73,.9,.65);
    piece(scene,box,glow,x,.56,z-.3,.48,.029,.018);
    signAt(scene,side<0?'LAMPE':'BALISE','#d7efe1',x,1.33,z+.34,Math.PI).scale.setScalar(.42);
  }
  piece(scene,box,casing,cargo.x,.53,cargo.z,1.44,1.06,1.06);
  piece(scene,box,shell,cargo.x,1.07,cargo.z,1.56,.08,1.12);
  furniture(cargo.x,.55,cargo.z,1.56,1.1,1.12);
  piece(scene,box,glow,cargo.x,1.12,cargo.z,.86,.023,.56);
  signAt(scene,'DÉPÔT D’ÉCHANTILLONS','#b3ffbb',cargo.x,1.7,cargo.z+.55,Math.PI);
  const board=signAt(scene,'REFUGE 01 · STATION ÉCHO','#b3ffbb',start.x,2.2,start.z-1.62);
  board.position.x+=2.35;
  board.scale.setScalar(2.35);
  for(const [i,text] of ['01  PRENDS TON MATÉRIEL','02  RÉCUPÈRE 3 CARTOUCHES','03  REJOINS LE SAS 04'].entries()){
    signAt(scene,text,'#d8e9dc',start.x+2.35,1.78-i*.296,start.z-1.62).scale.setScalar(.95);
  }
  const gate=where('S',0);gate.z+=tile*2.5;
  for(const side of [-1,1]){
    piece(scene,box,shell,gate.x+side*1.55,1.48,gate.z,.24,2.94,.31);
    piece(scene,box,glow,gate.x+side*1.4,1.68,gate.z-.17,.055,2,.021);
  }
  piece(scene,box,new T.MeshStandardMaterial({map:hazardMap,roughness:.84}),gate.x,2.95,gate.z,3.1,.22,.34);
  signAt(scene,'ACCÈS LABORATOIRE','#ffd382',gate.x,2.65,gate.z-.18,Math.PI);
  signAt(scene,'REFUGE · ZONE SÛRE','#b3ffbb',gate.x,2.65,gate.z+.18);
  piece(scene,box,new T.MeshStandardMaterial({map:hazardMap,roughness:.84}),gate.x,.012,gate.z,3.13,.018,.29);
  lighting.push(new T.Vector3(start.x,2.89,start.z+.5),new T.Vector3(cargo.x,2.85,cargo.z));
  return cargo;
}
export function hazmatMonkey(){
  const root=new T.Group(),suit=paint('#b5a452'),rubber=paint('#283732'),glass=paint('#536f69',.48);
  piece(root,muscle,suit,0,1.02,0,.43,.53,.29);
  piece(root,muscle,suit,0,1.54,.04,.31,.34,.29);
  piece(root,muscle,rubber,0,1.53,.248,.252,.213,.124);
  piece(root,muscle,glass,0,1.55,.304,.215,.16,.096);
  piece(root,muscle,rubber,0,1.43,.36,.135,.07,.065);
  piece(root,box,rubber,0,1.05,.279,.025,.55,.02);
  for(const side of [-1,1]){
    piece(root,muscle,suit,side*.47,.91,.015,.15,.47,.156).rotation.z=side*.27;
    piece(root,muscle,rubber,side*.575,.5,.06,.127,.144,.115);
    piece(root,muscle,suit,side*.207,.4,0,.165,.37,.174);
    piece(root,muscle,rubber,side*.21,.125,.082,.172,.12,.245);
  }
  return {root};
}

function rainyExterior(scene,x,z){
  const steel=paint('#374440',.45),concrete=paint('#49534c');
  piece(scene,box,concrete,x-.94,1.6,z,.78,3.2,3.5);
  piece(scene,box,concrete,x+1.04,1.6,z,.73,3.2,3.5);
  piece(scene,box,concrete,x,2.86,z,1.29,.68,3.5);
  piece(scene,box,steel,x-.19,1.22,z+1.46,.94,2.44,.24).rotation.y=-.14;
  piece(scene,box,steel,x+.12,1.06,z+1.62,.16,.065,.22);

  const ground=paint('#283931',.4);ground.map=surfaceMap('wall');ground.roughness=.41;
  piece(scene,box,ground,x,-.14,z-16,39,.25,32);
  const puddle=paint('#627471',.64);puddle.roughness=.21;
  piece(scene,muscle,puddle,x+.65,.003,z-4,1.6,.009,2.13);
  piece(scene,box,new T.MeshBasicMaterial({color:'#647775'}),x,4,z-35,55,20,.1);
  const crowns=new T.InstancedMesh(new T.ConeGeometry(1,1,6),new T.MeshBasicMaterial({color:'#ffffff'}),138);
  const trunks=new T.InstancedMesh(box,new T.MeshBasicMaterial({color:'#354139'}),46);
  const part=new T.Object3D();
  for(let i=0;i<46;i++){
    const tx=x+(grain(i,47)-.5)*36,tz=z-2.7-grain(i,83)*28,h=3.8+grain(i,9)*5.7;
    if(Math.abs(tx-x)<1.6&&tz>z-8)part.position.set(tx+2.9,h*.32,tz);
    else part.position.set(tx,h*.32,tz);
    const px=part.position.x;
    part.scale.set(.16,h*.69,.17);part.updateMatrix();trunks.setMatrixAt(i,part.matrix);
    for(let j=0;j<3;j++){
      part.position.set(px,h*(.43+j*.173),tz);
      part.scale.set(h*(.22-j*.039),h*.52,h*(.22-j*.039));part.updateMatrix();
      crowns.setMatrixAt(i*3+j,part.matrix);
      crowns.setColorAt(i*3+j,new T.Color('#152a22').lerp(new T.Color('#70827a'),Math.min(.74,(z-tz)/42)));
    }
  }
  scene.add(trunks,crowns);
  const rain=new Float32Array(180*6),geometry=new T.BufferGeometry();
  const attribute=new T.BufferAttribute(rain,3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position',attribute);
  const streaks=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#b6d2cc',transparent:true,opacity:.44,depthWrite:false}));
  streaks.frustumCulled=false;scene.add(streaks);
  return time=>{
    for(let i=0;i<180;i++){
      const y=((grain(i,122)*5-time*(4+grain(i,113)*4))%5+5)%5;
      const rx=x+(grain(i,123)-.5)*10+y*.09,rz=z-1.8-grain(i,124)*13;
      rain.set([rx,y,rz,rx-.024,y-.24,rz],i*6);
    }
    attribute.needsUpdate=true;
  };
}
function buildSectorLandmark(scene,level,color){
  const origin=where('E',0,level),[col,row]=cellOf(origin.x,origin.z,level);
  const wall=neighbors.find(([x,z])=>!open(col+x,row+z,level));
  if(!wall)return;
  const panel=new T.Group(),[dx,dz]=wall;
  panel.position.copy(origin);panel.position.x+=dx*1.65;panel.position.z+=dz*1.65;
  panel.rotation.y=Math.atan2(-dx,-dz);scene.add(panel);
  const steel=paint('#4f6568',.43),black=paint('#1b292d',.3);
  const lit=new T.MeshBasicMaterial({color});
  piece(panel,box,steel,0,1.48,-.015,2.44,2.12,.22);
  piece(panel,box,black,0,1.48,.105,2.24,1.93,.028);
  if(level===0){
    for(let i=-1;i<=1;i++){
      piece(panel,box,steel,i*.64,1.51,.145,.49,.96,.068);
      piece(panel,box,lit,i*.64,1.75,.186,.33,.24,.022);
      for(let j=0;j<4;j++)piece(panel,box,black,i*.64,1.44-j*.097,.189,.28,.025,.011);
    }
  }else{
    for(let i=-1;i<=1;i++){
      const column=level===1?new T.MeshStandardMaterial({color:'#408699',roughness:.22,metalness:.26,emissive:'#276377',emissiveIntensity:.37}):paint('#647951',.38);
      piece(panel,limbs,column,i*.59,1.42,.174,.36,1.11,.15);
      piece(panel,box,lit,i*.59,2.04,.155,.29,.07,.035);
      piece(panel,box,steel,i*.59,.82,.155,.48,.17,.13);
    }
  }
  signAt(panel,['CONTRÔLE DES SAS','BANQUE CRYOGÉNIQUE','CULTURES · BIOCONFINEMENT'][level],color,0,2.69,.07).scale.setScalar(1.31);
}
function buildCryoLeak(scene){
  const point=where('E',0,1);
  const steel=paint('#587685',.48),rubber=paint('#232c33',.15);
  const ice=new T.MeshBasicMaterial({color:'#abebfa'});
  piece(scene,barrel,steel,point.x+.5,2.74,point.z, .11,3.2,.11).rotation.z=Math.PI/2;
  for(let i=0;i<3;i++){
    const x=point.x- .45+i*.8;
    piece(scene,barrel,rubber,x,2.74,point.z,.15,.09,.15).rotation.z=Math.PI/2;
    piece(scene,box,ice,x,2.64,point.z,.26,.013,.034);
  }
  signAt(scene,'FUITE CRYOGÉNIQUE','#b5f0ff',point.x,2.31,point.z+.55,Math.PI).scale.setScalar(.95);
}
function buildPassage(scene,x,z,kind,furniture){
  const vault=kind==='V',low=vault?2.92:1.18;
  const shell=paint(vault?'#536774':'#506360',.34),lining=paint('#273638',.28);
  shell.map=surfaceMap('wall');
  const strip=new T.MeshBasicMaterial({color:vault?'#e9ac54':'#63b4d3'});
  piece(scene,box,shell,x,(low+3.2)/2,z,tile,3.2-low,tile);
  furniture(x,(low+3.2)/2,z,tile,3.2-low,tile);
  if(vault){
    const deck=piece(scene,box,shell,x,.39,z,tile,.78,tile);
    deck.material=paint('#7e8781',.35);deck.material.map=surfaceMap('floor');
    furniture(x,.39,z,tile,.78,tile);
  }else{
    for(let i=0;i<5;i++){
      piece(scene,box,lining,x-1.4+i*.7,1.15,z,.048,.055,3.19);
      piece(scene,box,strip,x-1.4+i*.7,1.109,z,.022,.012,.83);
    }
  }
  for(const side of [-1,1]){
    const edge=x+side*(tile/2+.034),angle=side*Math.PI/2;
    const sign=signAt(scene,vault?'PASSERELLE · SAUTE':'GAINE · ACCROUPIS-TOI',vault?'#ffcf82':'#a7e4ff',
      edge,vault?2.78:1.53,z,angle);
    sign.scale.setScalar(1.28);
    piece(scene,box,strip,edge,vault?.715:1.22,z,.034,.062,tile-.13);
  }
}
export function buildStation(scene,level){
  const size=levels[level].length;
  const solids=[],fixtures=[],groups={floor:[],wall:[],ceiling:[],trim:[],rail:[],light:[],service:[],vent:[],floorStripe:[]};
  const dummy=new T.Object3D();
  function batch(key,x,y,z,sx,sy,sz){groups[key].push([x,y,z,sx,sy,sz]);}
  function solid(x,y,z,sx,sy,sz){
    const bounds=new T.Box3(new T.Vector3(x-sx/2,y-sy/2,z-sz/2),new T.Vector3(x+sx/2,y+sy/2,z+sz/2));
    solids.push({bounds,friction:.88});
    return bounds;
  }
  solid(0,-.22,0,size*tile,.44,size*tile);
  const lighting=[];
  let updateExterior=null;
  const furniture=(...args)=>fixtures.push(solid(...args));
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const {x,z}=point(col,row,0,level);
    if(!open(col,row,level)){
      if(!neighbors.some(([dx,dz])=>open(col+dx,row+dz,level)))continue;
      if(level===0&&row===0&&col===3){
        updateExterior=rainyExterior(scene,x,z);
        solid(x,1.6,z,tile,3.2,tile);
        continue;
      }
      batch('wall',x,1.6,z,tile,3.2,tile);
      batch('trim',x,.37,z,tile+.014,.12,tile+.014);
      batch('trim',x,2.65,z,tile+.015,.09,tile+.015);
      solid(x,1.6,z,tile,3.2,tile);
      continue;
    }
    batch('floor',x,-.045,z,tile-.025,.09,tile-.025);
    if(metalGrating(col,row,level)){
      batch('service',x,.006,z,3.28,.012,3.28);
      for(let i=-5;i<=5;i++)batch('vent',x+i*.28,.017,z,.15,.012,3.13);
    }
    batch('ceiling',x,3.23,z,tile,.09,tile);
    const marker=levels[level][row][col];
    if(marker==='V'||marker==='T'){
      buildPassage(scene,x,z,marker,furniture);
      continue;
    }
    if(!inShelter(x,z,level)&&(row+col)%6===0)batch('floorStripe',x,.006,z,1.45,.008,.29);
    for(const [dx,dz] of neighbors){
      if(open(col+dx,row+dz,level))continue;
      const edgeX=x+dx*(tile/2-.035),edgeZ=z+dz*(tile/2-.035);
      batch('rail',edgeX,2.54,edgeZ,dx?.085:tile-.13,.18,dz?.085:tile-.13);
      batch('light',edgeX-dx*.05,2.54,edgeZ-dz*.05,dx?.032:tile-.22,.061,dz?.032:tile-.22);
      if((row*7+col*3+dx+dz+level*3+24)%5!==0)continue;
      batch('service',edgeX-dx*.07,1.45,edgeZ-dz*.07,dx?.14:1.54,.85,dz?.14:1.54);
      for(let i=0;i<5;i++){
        batch('vent',edgeX-dx*.153,1.19+i*.123,edgeZ-dz*.153,dx?.032:1.21,.045,dz?.032:1.21);
      }
    }
    if((row+col*3)%3!==0)continue;
    batch('rail',x,3.11,z,.22,.11,2.55);
    batch('light',x,3.041,z,.12,.025,2.05);
    lighting.push(new T.Vector3(x,2.94,z));
  }
  const ledColor=['#ff6334','#39ddff','#81ffa0'][level];
  const palette={floor:'#929a92',wall:['#c2c7bb','#a3bbc9','#99ac96'][level],ceiling:'#78848a',trim:'#465154',rail:'#202831',light:ledColor,service:'#667570',vent:'#252c2f',floorStripe:'#ffffff'};
  for(const [key,instances] of Object.entries(groups)){
    if(!instances.length)continue;
    const material=key==='light'?new T.MeshBasicMaterial({color:palette[key]}):paint(palette[key]);
    if(['floor','wall','ceiling'].includes(key))material.map=surfaceMap(key);
    if(key==='floorStripe')material.map=hazardMap;
    const mesh=new T.InstancedMesh(box,material,instances.length);
    instances.forEach(([x,y,z,sx,sy,sz],i)=>{
      dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(key==='wall'||key==='floor'){
        const value=.76+((i*17)%21)/75;
        mesh.setColorAt(i,new T.Color().setRGB(value,value,value));
      }
    });
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  const exit=level===0?where('X'):null;
  if(exit){
    const extractionZone=new T.Mesh(new T.RingGeometry(1.35,1.43,48),
      new T.MeshBasicMaterial({color:'#9eeab6',side:T.DoubleSide}));
    extractionZone.rotation.x=-Math.PI/2;
    extractionZone.position.copy(exit);extractionZone.position.y=.024;
    scene.add(extractionZone);
    piece(scene,box,paint('#355b51'),exit.x,1.21,exit.z+1.69,2.14,2.42,.14);
    const exitSign=placard('SAS 04','#83e1c3');
    exitSign.position.copy(exit).add(new T.Vector3(0,2.66,1.57));exitSign.rotation.y=Math.PI;scene.add(exitSign);
  }
  const cargo=level===0?buildShelter(scene,lighting,furniture):null;
  buildSectorLandmark(scene,level,ledColor);
  if(level===0){
    const post=where('E');
    signAt(scene,'ARCHIVE 04 · LIAISON PERDUE','#ffa873',post.x,2.45,post.z-.79).scale.setScalar(1.1);
  }
  if(level===2){
    const entry=where('L',0,2);
    signAt(scene,'CAILLEBOTIS · MARCHE LENTEMENT','#ccf3af',entry.x,1.72,entry.z-1.65).scale.setScalar(1.38);
  }
  if(level===1)buildCryoLeak(scene);
  const lift=where('L',0,level);
  piece(scene,box,paint('#725e3a'),lift.x,.026,lift.z,2.4,.05,2.4);
  const liftSign=placard('ASCENSEUR · '+levelNames[level].toUpperCase());
  liftSign.position.copy(lift).add(new T.Vector3(0,2.26,-1.55));
  scene.add(liftSign);
  return {solids,fixtures,lighting,ledColor,exit,lift,scene,cargo,updateExterior};
}
