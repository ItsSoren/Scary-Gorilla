import * as T from './three.js';
import {placard} from './station.js?v=bunker6';

export const sectorSeed=41729;
export const galleryStart=26.25;
const tile=3.5, width=9, span=width*tile;
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
  const hash=Math.imul(seed^index,0x45d9f3b);
  const bits=(hash^(hash>>>16))>>>0;
  const variant=index<2?bits%3:index===2?3:index===3?4:bits%layouts.length;
  const mirrored=(bits&16)!==0;
  const rows=mirrored?layouts[variant].map(row=>Array.from(row).reverse().join('')):layouts[variant];
  const markings=index<3?'numbered':index<7?'sparse':'none';
  return {name:names[variant],rows,markings};
}
export function galleryOpen(x,z){
  const index=sectorIndex(z);
  if(index<0)return false;
  const row=Math.floor((z-galleryStart-index*span)/tile),col=Math.floor(x/tile+width/2);
  return sectorLayout(index).rows[row]?.[col]==='.';
}
export function galleryWet(x,z){
  const index=sectorIndex(z);
  if(index<0)return false;
  const row=Math.floor((z-galleryStart-index*span)/tile);
  return (index%3===0?row>=3&&row<=6:index%3===2&&row===4)&&galleryOpen(x,z);
}
export function createGallery(scene){
  const cached=new Map(),box=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4();
  const wall=new T.MeshStandardMaterial({color:'#515449',roughness:.93}),
    floor=new T.MeshStandardMaterial({color:'#333935',roughness:.86}),
    ceiling=new T.MeshStandardMaterial({color:'#404341',roughness:1}),
    light=new T.MeshBasicMaterial({color:'#a7c5b5'}),
    water=new T.MeshStandardMaterial({color:'#3d5b53',roughness:.22,metalness:.33}),
    stain=new T.MeshStandardMaterial({color:'#5b4537',roughness:.95}),
    pipe=new T.MeshStandardMaterial({color:'#765747',roughness:.74,metalness:.33});
  const drops=new Float32Array(36*3),dropGeometry=new T.BufferGeometry();
  const dropPosition=new T.BufferAttribute(drops,3).setUsage(T.DynamicDrawUsage);
  dropGeometry.setAttribute('position',dropPosition);
  const particles=new T.Points(dropGeometry,new T.PointsMaterial({color:'#abc7b2',size:.036,transparent:true,opacity:.65,depthWrite:false}));
  particles.frustumCulled=false;
  particles.visible=false;
  scene.add(particles);
  let collision=[],active=-1;
  function build(index){
    const group=new T.Group(),solids=[],lamps=[],parts=new Map([wall,floor,ceiling,light,water,stain,pipe].map(material=>[material,[]]));
    let leak=null;
    const {rows,markings}=sectorLayout(index);
    const lampColumns=rows.map(row=>[4,3,5,2,6,1,7].find(col=>row[col]==='.'));
    function block(material,x,y,z,w,h,d){
      parts.get(material).push([x,y,z,w,h,d]);
      if(material===light||material===water||material===stain||material===pipe)return;
      solids.push({bounds:new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2)),friction:.88});
    }
    for(let row=0;row<width;row++)for(let col=0;col<width;col++){
      const x=(col-4)*tile,z=galleryStart+index*span+(row+.5)*tile;
      if(rows[row][col]==='#'){
        block(wall,x,1.6,z,tile,3.2,tile);
      }else{
        block(floor,x,-.13,z,tile,.26,tile);
        block(ceiling,x,3.3,z,tile,.26,tile);
        const wet=galleryWet(x,z);
        if(wet){
          block(water,x,.016,z,tile-.018,.025,tile-.018);
          if(!leak&&col===lampColumns[row]){
            leak=new T.Vector3(x+.85,2.75,z);
            block(pipe,x+.85,2.83,z,.23,.22,3.4);
            block(pipe,x+.85,2.79,z,.39,.31,.26);
          }
        }else if((index+col*3+row*7)%11<2){
          block(stain,x-.55,.007,z+.5,.54,.008,.76);
          block(stain,x-.28,.006,z+.28,.38,.008,.57);
        }
        if((row===1||row===6)&&col===lampColumns[row]){
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
      const mesh=new T.InstancedMesh(box,material,blocks.length);
      blocks.forEach(([x,y,z,w,h,d],i)=>{
        matrix.makeScale(w,h,d).setPosition(x,y,z);
        mesh.setMatrixAt(i,matrix);
      });
      group.add(mesh);
    }
    scene.add(group);
    return {group,solids,lamps,leak};
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
      cached.delete(key);
    }
    if(next>=0){
      for(let i=Math.max(0,next-1);i<=next+1;i++)if(!cached.has(i))cached.set(i,build(i));
    }
    collision=Array.from(cached.values()).flatMap(sector=>sector.solids);
  }
  function animate(time,enabled){
    const leak=enabled?cached.get(active)?.leak:null;
    const spores=enabled&&active>=0&&active%3===1;
    particles.visible=Boolean(leak)||spores;
    if(!particles.visible)return;
    for(let i=0;i<36;i++){
      if(spores){
        drops[i*3]=Math.sin(i*37+time*.24)*1.28;
        drops[i*3+1]=.28+((i*.19+time*.067)%1)*2.36;
        drops[i*3+2]=galleryStart+active*span+tile*1.5+Math.cos(i*23+time*.31)*1.32;
        continue;
      }
      const fall=(time*(.9+(i%4)*.17)+i*.131)%1;
      drops[i*3]=leak.x+Math.sin(i*31)*fall*.24;
      drops[i*3+1]=leak.y*(1-fall*fall);
      drops[i*3+2]=leak.z+Math.cos(i*25)*fall*.2;
    }
    dropPosition.needsUpdate=true;
  }
  return {update,animate,get leak(){return cached.get(active)?.leak;},get particleCount(){return particles.visible?36:0;},
    get collision(){return collision;},get lamps(){return cached.get(active)?.lamps;},get count(){return cached.size;}};
}
