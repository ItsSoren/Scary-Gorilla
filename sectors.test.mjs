import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from './three.js';
import {createGallery,galleryOpen,galleryStart,sectorIndex,sectorLayout} from './sectors.js';
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
    assert.equal(scene.children.length,3);
  }
  gallery.update(galleryStart+1);
  assert.deepEqual(gallery.collision.map(box=>box.bounds.min.toArray()),first);
  gallery.update(0,false);
  assert.equal(scene.children.length,0);
  assert.equal(gallery.collision.length,0);
});
