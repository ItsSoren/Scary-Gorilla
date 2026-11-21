import * as T from './three.js';
import {placard} from './station.js?v=service1';
import {addCaustics,addConcreteWear,createWaterMaterial} from './gallery-water.js?v=bassin3';
import {gallerySoundSources} from './gallery-audio.js';
import {archiveSheet,archiveSite} from './gallery-archives.js';
import {createVista,vistaRows,vistaSector} from './gallery-vista.js?v=service1';

export const sectorSeed=41729;
export const galleryStart=26.25;
const tile=3.5, width=9, span=width*tile;
export const poolEntry=galleryStart+tile*2.85;
export const vistaEntry=galleryStart+(vistaSector*width+4.5)*tile;
export const poolSurface=-.12;
const poolBottom=poolSurface-1.20, stepLength=tile/6;
const hashOf=(index,seed)=>{
  const hash=Math.imul(seed^index,0x45d9f3b);
  return (hash^(hash>>>16))>>>0;
};
const layouts=[
  ['###...###','##.....##','#.......#','#..#.#..#','#.......#','###...###','##.....##','###...###','###...###'],
  ['###...###','###...###','##.....##','#..#.#..#','#.......#','#..#.#..#','##.....##','###...###','###...###'],
  ['###...###','##.....##','##.....##','###...###','#.......#','#.......#','##.....##','##.....##','###...###'],
  ['###...###','##...####','##.######','##.##...#','##......#','#######.#','####....#','###...###','###...###'],
  ['###...###','##.....##','##.###.##','#..###..#','#..###..#','##.###.##','##.....##','###...###','###...###'],
];
const names=['Galerie des pompes','Réserve technique','Chambre de transfert','Coude de maintenance','Anneau de distribution'];
export const sectorIndex=z=>Math.floor((z-galleryStart)/span);
export function sectorLayout(index,seed=sectorSeed){
  const bits=hashOf(index,seed);
  const variant=index<2?bits%3:index===2?3:index===3?4:bits%layouts.length;
  const mirrored=(bits&16)!==0;
  const rows=mirrored?layouts[variant].map(row=>Array.from(row).reverse().join('')):layouts[variant];
  const markings=index<3?'numbered':index<7?'sparse':'none';
  return {name:names[variant],rows,markings};
}
function floodStart(index){
  if(index===0)return 3;
  const hash=hashOf(index,sectorSeed^0x19ab);
  return index>3&&(hash&7)<2?2+((hash>>>7)&1):-1;
}
export function galleryOpen(x,z){
  const index=sectorIndex(z);
  if(index<0)return false;
  const row=Math.floor((z-galleryStart-index*span)/tile),col=Math.floor(x/tile+width/2);
  return sectorLayout(index).rows[row]?.[col]==='.';
}
export function galleryWet(x,z){
  return galleryWaterHeight(x,z)!==0;
}
export function galleryGround(z){
  const index=sectorIndex(z),start=floodStart(index);
  if(start<0)return 0;
  const offset=z-galleryStart-index*span-start*tile;
  if(offset<0||offset>=4*tile)return 0;
  const distance=Math.min(offset,4*tile-offset);
  return poolBottom*Math.min(6,Math.floor(distance/stepLength))/6;
}
export function galleryWaterHeight(x,z){
  if(!galleryOpen(x,z))return 0;
  const index=sectorIndex(z);
  if(galleryGround(z)<poolSurface)return poolSurface;
  const row=Math.floor((z-galleryStart-index*span)/tile),col=Math.floor(x/tile+width/2);
  const layoutHash=hashOf(index,sectorSeed^0x45bd);
  const band=2+((layoutHash>>>4)%4);
  const cellHash=hashOf(row*31+col,layoutHash);
  const basinStart=floodStart(index);
  const scattered=index>0&&row>0&&row<8&&(basinStart<0||row!==basinStart&&row!==basinStart+3)&&
    (Math.abs(row-band)<=1?cellHash%5<2:cellHash%13===0);
  const localX=x-(col-4)*tile,localZ=z-galleryStart-index*span-(row+.5)*tile;
  return scattered&&Math.hypot(localX/1.4,localZ/1.51)<.96?.034+((layoutHash>>>12)&3)*.008:0;
}
export function createGallery(scene){
  const cached=new Map(),box=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4();
  // One face per tile keeps the continuous water surface free of internal faces.
  const top=box.clone();
  top.setDrawRange(12,6);
  const water=createWaterMaterial();
  const puddle=water.clone();
  puddle.uniforms={...water.uniforms,puddle:{value:1}};
  const wall=new T.MeshStandardMaterial({color:'#515449',roughness:.93}),
    floor=new T.MeshStandardMaterial({color:'#333935',roughness:.86}),
    ceiling=new T.MeshStandardMaterial({color:'#404341',roughness:1}),
    light=new T.MeshBasicMaterial({color:'#a7c5b5'}),
    stain=new T.MeshStandardMaterial({color:'#5b4537',roughness:.95}),
    pipe=new T.MeshStandardMaterial({color:'#765747',roughness:.74,metalness:.33}),
    basin=new T.MeshStandardMaterial({color:'#293d36',roughness:.79}),
    cabinet=new T.MeshStandardMaterial({color:'#4a5145',roughness:.78,metalness:.21});
  addCaustics(basin,water.uniforms.time);
  addConcreteWear(wall);
  const drops=new Float32Array(36*3),dropGeometry=new T.BufferGeometry();
  const dropPosition=new T.BufferAttribute(drops,3).setUsage(T.DynamicDrawUsage);
  dropGeometry.setAttribute('position',dropPosition);
  const particles=new T.Points(dropGeometry,new T.PointsMaterial({color:'#abc7b2',size:.036,transparent:true,opacity:.65,depthWrite:false}));
  particles.frustumCulled=false;
  particles.visible=false;
  scene.add(particles);
  let collision=[],sounds=[],active=-1;
  function build(index){
    const group=new T.Group(),solids=[],lamps=[],parts=new Map([wall,floor,basin,ceiling,light,water,puddle,stain,pipe,cabinet].map(material=>[material,[]]));
    let leak=null;
    const {rows,markings}=sectorLayout(index);
    const basinStart=floodStart(index);
    const lampColumns=rows.map(row=>[4,3,5,2,6,1,7].find(col=>row[col]==='.'));
    function block(material,x,y,z,w,h,d){
      parts.get(material).push([x,y,z,w,h,d]);
      if(material===light||material===water||material===puddle||material===stain||material===pipe||material===cabinet)return;
      solids.push({bounds:new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2)),friction:.88});
    }
    const base=galleryStart+index*span,seed=hashOf(index,sectorSeed);
    if(index===vistaSector){
      const z=vistaEntry;
      // An open pressure bulkhead frames the access without narrowing the walkable lane.
      block(cabinet,6.1,2.89,z,.4,.43,3.36);
      for(const side of [-1,1]){
        block(cabinet,6.1,1.44,z+side*1.55,.4,2.88,.31);
        block(pipe,4.7,2.72,z+side*1.38,4.8,.21,.22);
        block(cabinet,4.7,2.72,z+side*1.38,.22,.34,.34);
        block(pipe,6.49,.94,z+side*1.61,.45,.2,.17);
      }
      for(let stripe=0;stripe<7;stripe++){
        block(stripe%2?wall:pipe,6.1,.008,z+(stripe-3)*.42,.39,.012,.37);
      }
      const tag=placard('SAS 04 · SERVICE','#ceab72');
      tag.position.set(5.88,2.9,z);
      tag.rotation.y=-Math.PI/2;
      tag.scale.setScalar(.61);
      group.add(tag);
      lamps.push(new T.Vector3(6.0,2.81,z));
    }
    const site=archiveSite(index,rows,seed,(row,col)=>{
      const z=base+(row+.5)*tile;
      return row!==basinStart&&row!==basinStart+3&&galleryGround(z)===0&&!galleryWet((col-4)*tile,z);
    });
    if(site){
      const wallX=(site.col-4)*tile+site.side*tile/2,z=base+(site.row+.5)*tile;
      const sheet=archiveSheet(site.record);
      sheet.position.set(wallX-site.side*.025,1.51,z+.19);
      sheet.rotation.y=-site.side*Math.PI/2;
      group.add(sheet);
      block(cabinet,wallX-site.side*.14,.43,z,.28,.86,1.33);
      block(pipe,wallX-site.side*.287,.56,z,.03,.035,.61);
      block(pipe,wallX-site.side*.287,.27,z,.03,.035,.61);
      block(stain,wallX-site.side*.55,.01,z-.47,.41,.01,.63);
    }
    for(let row=0;row<width;row++)for(let col=0;col<width;col++){
      const x=(col-4)*tile,z=galleryStart+index*span+(row+.5)*tile;
      if(rows[row][col]==='#'){
        if(index===vistaSector&&col===8&&vistaRows.includes(row)){
          block(wall,x,.42,z,tile,.84,tile);
          block(wall,x,2.97,z,tile,.46,tile);
          block(wall,x-tile/2+.11,1.79,z-tile/2,.22,1.9,.14);
          continue;
        }
        const base=basinStart>=0&&row>=basinStart&&row<basinStart+4?poolBottom:0;
        block(wall,x,(3.2+base)/2,z,tile,3.2-base,tile);
      }else{
        const height=galleryWaterHeight(x,z);
        const stair=basinStart>=0&&(row===basinStart||row===basinStart+3);
        if(stair){
          for(let step=0;step<6;step++){
            const center=z-tile/2+(step+.5)*stepLength;
            const y=galleryGround(center);
            block(y<poolSurface?basin:floor,x,y-.16,center,tile,.32,stepLength);
            if(y<poolSurface)block(water,x,poolSurface-.01,center,tile,.02,stepLength);
          }
        }else{
          const y=galleryGround(z);
          block(height===poolSurface?basin:floor,x,y-.13,z,tile,.26,tile);
          if(height)block(height===poolSurface?water:puddle,x,height-.01,z,height===poolSurface?tile:2.8,.02,height===poolSurface?tile:3.02);
        }
        block(ceiling,x,3.3,z,tile,.26,tile);
        if(height){
          if(!leak&&col===lampColumns[row]){
            leak=new T.Vector3(x+.85,2.75,z);
            block(pipe,x+.85,2.83,z,.23,.22,3.4);
            block(pipe,x+.85,2.79,z,.39,.31,.26);
          }
        }else if((index+col*3+row*7)%11<2){
          block(stain,x-.55,.007,z+.5,.54,.008,.76);
          block(stain,x-.28,.006,z+.28,.38,.008,.57);
        }
        if((row===1||row===6||(basinStart>=0&&(row===basinStart||row===basinStart+2)))&&col===lampColumns[row]){
          block(light,x,3.13,z,.88,.045,.17);
          lamps.push(new T.Vector3(x,2.91,z));
        }
      }
    }
    if(markings!=='none'){
      const label=placard(markings==='numbered'?'SECTEUR '+String(index+1).padStart(2,'0'):'RETOUR','#99bdab');
      label.position.set(-1.48,2.34,galleryStart+index*span+.8);
      label.rotation.y=Math.PI;
      label.scale.setScalar(.68);
      group.add(label);
    }
    for(const [material,blocks] of parts){
      if(!blocks.length)continue;
      const geometry=material===water||material===puddle?top:box;
      const mesh=new T.InstancedMesh(geometry,material,blocks.length);
      blocks.forEach(([x,y,z,w,h,d],i)=>{
        matrix.makeScale(w,h,d).setPosition(x,y,z);
        mesh.setMatrixAt(i,matrix);
      });
      group.add(mesh);
    }
    const vista=index===vistaSector?createVista(vistaEntry):[];
    for(const mesh of vista)group.add(mesh);
    scene.add(group);
    const soundSources=gallerySoundSources(rows,base,tile,seed);
    return {group,solids,lamps,leak,soundSources,archive:Boolean(site),vista};
  }
  function update(z,enabled=true){
    const next=enabled&&z>galleryStart-12?Math.max(0,sectorIndex(z)):-1;
    if(next===active)return;
    active=next;
    for(const [key,sector] of cached){
      if(next>=0&&Math.abs(key-next)<=1)continue;
      scene.remove(sector.group);
      for(const mesh of sector.group.children){
        if(mesh.isInstancedMesh)mesh.dispose();
        else{
          mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
        }
      }
      if(sector.vista.length){
        sector.vista[0].geometry.dispose();
        for(const mesh of sector.vista)mesh.material.dispose();
      }
      cached.delete(key);
    }
    if(next>=0){
      for(let i=Math.max(0,next-1);i<=next+1;i++)if(!cached.has(i))cached.set(i,build(i));
    }
    collision=Array.from(cached.values()).flatMap(sector=>sector.solids);
    sounds=Array.from(cached.values()).flatMap(sector=>sector.soundSources);
  }
  function animate(time,enabled,head=null,immersion=0){
    const sector=enabled?cached.get(active):null,leak=sector?.leak;
    water.uniforms.time.value=time;
    water.uniforms.leak.value.set(leak?.x??0,leak?.y??-1,leak?.z??0);
    const spores=enabled&&active>=0&&active%3===1;
    const underwater=immersion>.05&&head;
    particles.visible=Boolean(leak||spores||underwater);
    if(!particles.visible)return;
    for(let i=0;i<36;i++){
      if(underwater){
        const x=head.x+Math.sin(i*37+time*.17)*3.2,z=head.z+Math.cos(i*23+time*.13)*3.2;
        drops[i*3]=x;
        const ground=galleryGround(z);
        drops[i*3+1]=galleryWaterHeight(x,z)===poolSurface?ground+.03+((i*.19+time*.085)%1)*(poolSurface-ground-.06):-3;
        drops[i*3+2]=z;
        continue;
      }
      if(spores){
        drops[i*3]=Math.sin(i*37+time*.24)*1.28;
        drops[i*3+1]=.28+((i*.19+time*.067)%1)*2.36;
        drops[i*3+2]=galleryStart+active*span+tile*1.5+Math.cos(i*23+time*.31)*1.32;
        continue;
      }
      const fall=(time*(.9+(i%4)*.17)+i*.131)%1;
      drops[i*3]=leak.x+Math.sin(i*31)*fall*.24;
      drops[i*3+1]=leak.y*(1-fall*fall)+galleryWaterHeight(leak.x,leak.z)*fall*fall;
      drops[i*3+2]=leak.z+Math.cos(i*25)*fall*.2;
    }
    dropPosition.needsUpdate=true;
  }
  function shade(fog,head,first,second,wake){
    water.uniforms.fogTint.value.copy(fog.color);
    water.uniforms.fogDensity.value=fog.density;
    water.uniforms.head.value.copy(head);
    water.uniforms.lampA.value.copy(first).y+=.22;
    water.uniforms.lampB.value.copy(second).y+=.22;
    water.uniforms.wake.value=wake;
  }
  return {update,animate,shade,get leak(){return cached.get(active)?.leak;},get particleCount(){return particles.visible?36:0;},
    get collision(){return collision;},get sounds(){return sounds;},get archive(){return cached.get(active)?.archive??false;},
    get lamps(){return cached.get(active)?.lamps;},get count(){return cached.size;}};
}
