import * as T from './three.js';

export const cells = [
  '###############',
  '#S....#....A..#',
  '#.##..#.###...#',
  '#.....#...#...#',
  '###.#####.#.###',
  '#...#.....#..B#',
  '#.#.#.##..###.#',
  '#.#...#.......#',
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
export function open(col,row,level=0) {const cell=levels[level][row]?.[col];return !!cell&&cell!=='#';}
export function fits(x,z,r=.25,level=0) {
  const [left,top]=cellOf(x-r,z-r,level),[right,bottom]=cellOf(x+r,z+r,level);
  for(let row=top;row<=bottom;row++) for(let col=left;col<=right;col++) if(!open(col,row,level)) return false;
  return true;
}
const neighbors=[[1,0],[-1,0],[0,1],[0,-1]];
export function nextStep(from,to,level=0) {
  const [sx,sz]=cellOf(from.x,from.z,level),[tx,tz]=cellOf(to.x,to.z,level);
  if(sx===tx&&sz===tz)return to.clone();
  const visited=new Set([sz*15+sx]),queue=[[sx,sz,null]];
  for(let i=0;i<queue.length;i++){
    const [x,z,first]=queue[i];
    for(const [dx,dz] of neighbors){
      const col=x+dx,row=z+dz,key=row*15+col;
      if(!open(col,row,level)||visited.has(key))continue;
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
  const wide=[1.04,.77,1.16][type],height=[1,.79,1.13][type];
  piece(root,sphere,skin,0,1.32,0,.69*wide,.82,.43);
  piece(root,sphere,skin,0,1.8,.03,.84*wide,.43,.48);
  const head=new T.Group();
  head.position.set(0,1.96,.34);
  root.add(head);
  piece(head,sphere,skin,0,.15,0,.46*wide,.48,.4);
  piece(head,sphere,type===1?ceramic:skin,0,.05,.24,.35*wide,.32,.33);
  const jaw=piece(head,sphere,dark,0,-.12,.48,.27*wide,.15,.09);
  for(const side of [-1,1]){
    piece(head,sphere,glow,side*.17*wide,.14,.49,type===1?.1:.065,.035,.04);
    piece(head,limbs,ceramic,side*.15,-.12,.55,.035,.14,.036);
    piece(root,limbs,skin,side*.3,.51,-.08,.24,.85,.24).rotation.z=side*.13;
    piece(root,sphere,skin,side*.31,.14,.03,.29,.19,.34);
  }
  const arms=[-1,1].map(side=>{
    const arm=new T.Group();
    arm.position.set(side*.65*wide,1.73,0);
    root.add(arm);
    arm.rotation.z=side*[.29,.59,.45][type];
    piece(arm,limbs,skin,0,-.41,0,.25,.87,.26);
    piece(arm,limbs,skin,0,-1.02,.02,.2,.55,.23);
    piece(arm,sphere,skin,0,-1.3,.05,.23,.24,.19);
    for(let i=-1;i<=1;i++)piece(arm,limbs,ceramic,i*.1,-1.47,.11,.025,.14,.027);
    return arm;
  });
  if(type===0){
    for(let i=0;i<4;i++)piece(root,box,ceramic,0,1.23+i*.17,-.37,.39,.075,.09);
  }else if(type===1){
    piece(head,box,dark,0,.06,.51,.53,.085,.085);
    for(const side of [-1,1])piece(head,limbs,skin,side*.40,.33,-.03,.13,.48,.13).rotation.z=side*.42;
  }else{
    for(let i=-2;i<=2;i++)piece(root,limbs,ceramic,i*.19,2.04-Math.abs(i)*.08,-.24,.10,.42,.11).rotation.x=-.63;
  }
  root.scale.y=height;
  return {root,head,jaw,arms,height};
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
export function itemModel(kind){
  const root=new T.Group();
  if(kind==='lamp'){
    piece(root,limbs,paint('#9b7045',.5),0,0,0,.095,.42,.095).rotation.x=Math.PI/2;
    piece(root,limbs,paint('#dcded4'),0,0,-.18,.14,.16,.14).rotation.x=Math.PI/2;
    piece(root,sphere,new T.MeshBasicMaterial({color:'#fff3c3'}),0,0,-.277,.10,.10,.022);
  }else if(kind==='decoy'){
    piece(root,box,paint('#6f5541'),0,0,0,.32,.20,.27);
    piece(root,sphere,eyeMats[0],0,.12,0,.07,.045,.07);
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
function surfaceMap(kind){
  if(surfaceMaps.has(kind))return surfaceMaps.get(kind);
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const n=(Math.imul(x+19,73856093)^Math.imul(y+11,19349663))>>>0;
    let value=194+n%52+14*Math.sin(x/9)*Math.cos(y/13);
    if(kind==='floor'){
      const edge=Math.min(x%64,y%64);
      if(edge<2)value=58;
      else if(edge<4)value=144;
      else if((x%16+y%16)%16<2&&((x>>3)^(y>>3))%2)value-=29;
    }else{
      if(x<3||y<4||y>124)value*=.55;
      if((x===9||x===118)&&(y===9||y===118))value=45;
      if(kind==='wall'&&y>80)value*=.8;
      if(n%199<4)value*=.63;
    }
    const offset=(y*size+x)*4;
    data.set([value,value,value,255],offset);
  }
  const map=new T.DataTexture(data,size,size);
  map.colorSpace=T.SRGBColorSpace;
  map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;
  map.anisotropy=4;map.needsUpdate=true;surfaceMaps.set(kind,map);return map;
}
export function buildStation(scene,level){
  const size=levels[level].length;
  const solids=[],groups={floor:[],wall:[],ceiling:[],trim:[],rail:[],light:[]};
  const dummy=new T.Object3D();
  function batch(key,x,y,z,sx,sy,sz){groups[key].push([x,y,z,sx,sy,sz]);}
  function solid(x,y,z,sx,sy,sz){
    solids.push({bounds:new T.Box3(new T.Vector3(x-sx/2,y-sy/2,z-sz/2),new T.Vector3(x+sx/2,y+sy/2,z+sz/2)),friction:.88});
  }
  solid(0,-.22,0,size*tile,.44,size*tile);
  const lighting=[];
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const {x,z}=point(col,row,0,level);
    if(!open(col,row,level)){
      if(!neighbors.some(([dx,dz])=>open(col+dx,row+dz,level)))continue;
      batch('wall',x,1.6,z,tile,3.2,tile);
      batch('trim',x,.37,z,tile+.014,.12,tile+.014);
      batch('trim',x,2.65,z,tile+.015,.09,tile+.015);
      solid(x,1.6,z,tile,3.2,tile);
      continue;
    }
    batch('floor',x,-.045,z,tile-.025,.09,tile-.025);
    batch('ceiling',x,3.23,z,tile,.09,tile);
    for(const [dx,dz] of neighbors){
      if(open(col+dx,row+dz,level))continue;
      const edgeX=x+dx*(tile/2-.035),edgeZ=z+dz*(tile/2-.035);
      batch('rail',edgeX,2.54,edgeZ,dx?.085:tile-.13,.18,dz?.085:tile-.13);
      batch('light',edgeX-dx*.05,2.54,edgeZ-dz*.05,dx?.032:tile-.22,.061,dz?.032:tile-.22);
    }
    if((row+col*3)%3!==0)continue;
    batch('rail',x,3.11,z,.22,.11,2.55);
    batch('light',x,3.041,z,.12,.025,2.05);
    lighting.push(new T.Vector3(x,2.94,z));
  }
  const ledColor=['#ff6334','#39ddff','#81ffa0'][level];
  const palette={floor:'#808d88',wall:['#a4b2ae','#8299ab','#8da597'][level],ceiling:'#627279',trim:'#405053',rail:'#202831',light:ledColor};
  for(const [key,instances] of Object.entries(groups)){
    const material=key==='light'?new T.MeshBasicMaterial({color:palette[key]}):paint(palette[key]);
    if(['floor','wall','ceiling'].includes(key))material.map=surfaceMap(key);
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
    piece(scene,box,paint('#355b51'),exit.x,1.21,exit.z+1.69,2.14,2.42,.14);
    const exitSign=placard('SAS 04','#83e1c3');
    exitSign.position.copy(exit).add(new T.Vector3(0,2.66,1.57));exitSign.rotation.y=Math.PI;scene.add(exitSign);
    const start=where('S');
    const sign=placard('STATION ÉCHO');
    sign.position.copy(start).add(new T.Vector3(0,2.13,-1.71));scene.add(sign);
  }
  const lift=where('L',0,level);
  piece(scene,box,paint('#725e3a'),lift.x,.026,lift.z,2.4,.05,2.4);
  const liftSign=placard('ASCENSEUR · '+levelNames[level].toUpperCase());
  liftSign.position.copy(lift).add(new T.Vector3(0,2.26,-1.55));
  scene.add(liftSign);
  return {solids,lighting,ledColor,exit,lift,scene};
}
