import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from './three.js';
import {createGallery,galleryGround,galleryOpen,galleryStart,galleryWaterHeight,galleryWet,poolEntry,poolSurface,sectorIndex,sectorLayout} from './sectors.js';
globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};

test('Sector layouts are repeatable and the main passage stays connected',()=>{
  const original=sectorLayout(7);
  for(let n=0;n<300;n++){
    const {rows}=sectorLayout(n);
    assert.equal(rows.length,9);
    assert.ok(rows.every(row=>row.length===9));
    const queue=[[4,0]],seen=new Set(['4,0']);
    for(const [x,y] of queue)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,key=nx+','+ny;
      if(rows[ny]?.[nx]==='.'&&!seen.has(key)){seen.add(key);queue.push([nx,ny]);}
    }
    assert.ok(seen.has('4,8'));
    assert.equal(seen.size,rows.join('').replaceAll('#','').length);
    const seam=galleryStart+n*31.5;
    assert.ok(galleryOpen(0,seam+.1));
    assert.equal(galleryOpen(14,seam+.1),false);
    if(n)assert.ok(galleryOpen(0,seam-.1));
  }
  assert.deepEqual(sectorLayout(7),original);
  assert.equal(sectorLayout(2).rows[2][4],'#');
  assert.equal(sectorLayout(3).rows[4][4],'#');
  assert.deepEqual([0,4,8].map(i=>sectorLayout(i).markings),['numbered','sparse','none']);
});

test('Streaming retains at most three sectors and reloads the same collision layout',()=>{
  const scene=new Group(),gallery=createGallery(scene);
  gallery.update(galleryStart+1);
  const first=gallery.collision.map(box=>box.bounds.min.toArray());
  assert.equal(sectorIndex(galleryStart+1),0);
  assert.equal(gallery.count,2);
  for(let n=1;n<20;n++){
    gallery.update(galleryStart+n*31.5+1);
    assert.equal(gallery.count,3);
    assert.equal(scene.children.length,4);
  }
  gallery.update(galleryStart+1);
  assert.deepEqual(gallery.collision.map(box=>box.bounds.min.toArray()),first);
  gallery.update(0,false);
  assert.equal(scene.children.length,1);
  assert.equal(gallery.collision.length,0);
});

test('Water stays on walkable cells and particles switch off outside the gallery',()=>{
  const scene=new Group(),gallery=createGallery(scene);
  const z=galleryStart+3.5*4.5;
  assert.equal(galleryWet(0,z),true);
  assert.equal(galleryWet(14,z),false);
  assert.equal(galleryWet(0,galleryStart+31.5+.5),false);
  gallery.update(z);
  assert.ok(gallery.leak);
  gallery.animate(1,true);
  assert.equal(gallery.particleCount,36);
  gallery.update(z+31.5);
  gallery.animate(2,true);
  assert.equal(gallery.particleCount,36);
  gallery.animate(2,false);
  assert.equal(gallery.particleCount,0);
});

test('Procedural water varies by sector and never covers a wall',()=>{
  const patterns=new Set();
  let basins=0;
  for(let index=1;index<41;index++){
    const cells=[];
    for(let row=0;row<9;row++)for(let col=0;col<9;col++){
      const x=(col-4)*3.5,z=galleryStart+index*31.5+(row+.5)*3.5;
      const surface=galleryWaterHeight(x,z);
      if(surface)assert.ok(galleryOpen(x,z));
      cells.push(Math.sign(surface));
    }
    if(cells.includes(-1))basins++;
    patterns.add(cells.join(','));
  }
  assert.ok(basins>0&&basins<40);
  assert.ok(patterns.size>20);
});

test('Pump basin has two walkable stairs and a continuous submerged floor',()=>{
  assert.equal(galleryGround(poolEntry),0);
  assert.equal(galleryWaterHeight(0,poolEntry),0);
  const middle=galleryStart+3.5*5;
  assert.ok(Math.abs(poolSurface-galleryGround(middle)-1.2)<1e-9);
  assert.ok(galleryGround(middle)+.96<poolSurface);
  assert.ok(galleryGround(middle)+1.62>poolSurface);
  assert.equal(galleryWaterHeight(0,middle),poolSurface);
  assert.equal(galleryWaterHeight(14,middle),0);
  for(let z=poolEntry;z<galleryStart+3.5*7.1;z+=.1){
    assert.ok(galleryOpen(0,z));
    assert.ok(Math.abs(galleryGround(z+.1)-galleryGround(z))<.23);
  }
  assert.equal(galleryGround(galleryStart+3.5*7.1),0);
});
