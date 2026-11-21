import * as T from './three.js';
import {placard} from './station.js?v=bunker4';

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
export function createGallery(scene){
  const cached=new Map(),box=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4();
  const wall=new T.MeshStandardMaterial({color:'#515449',roughness:.93}),
    floor=new T.MeshStandardMaterial({color:'#333935',roughness:.86}),
    ceiling=new T.MeshStandardMaterial({color:'#404341',roughness:1}),
    light=new T.MeshBasicMaterial({color:'#a7c5b5'});
  let collision=[],active=-1;
  function build(index){
    const group=new T.Group(),solids=[],lamps=[],parts=new Map([[wall,[]],[floor,[]],[ceiling,[]],[light,[]]]);
    const {rows,markings}=sectorLayout(index);
    const lampColumns=rows.map(row=>[4,3,5,2,6,1,7].find(col=>row[col]==='.'));
    function block(material,x,y,z,w,h,d){
      parts.get(material).push([x,y,z,w,h,d]);
      if(material===light)return;
      solids.push({bounds:new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2)),friction:.88});
    }
    for(let row=0;row<width;row++)for(let col=0;col<width;col++){
      const x=(col-4)*tile,z=galleryStart+index*span+(row+.5)*tile;
      if(rows[row][col]==='#'){
        block(wall,x,1.6,z,tile,3.2,tile);
      }else{
        block(floor,x,-.13,z,tile,.26,tile);
        block(ceiling,x,3.3,z,tile,.26,tile);
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
      const mesh=new T.InstancedMesh(box,material,blocks.length);
      blocks.forEach(([x,y,z,w,h,d],i)=>{
        matrix.makeScale(w,h,d).setPosition(x,y,z);
        mesh.setMatrixAt(i,matrix);
      });
      group.add(mesh);
    }
    scene.add(group);
    return {group,solids,lamps};
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
  return {update,get collision(){return collision;},get lamps(){return cached.get(active)?.lamps;},get count(){return cached.size;}};
}
