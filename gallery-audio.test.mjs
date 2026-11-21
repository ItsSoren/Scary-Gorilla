import test from 'node:test';
import assert from 'node:assert/strict';
import {createGalleryAudio,gallerySoundSources} from './gallery-audio.js';
import {galleryOpen,galleryStart,sectorLayout} from './sectors.js';

test('Seeded sound sources are repeatable and placed in open gallery cells',()=>{
  for(let index=0;index<60;index++){
    const rows=sectorLayout(index).rows,base=galleryStart+index*31.5;
    const sources=gallerySoundSources(rows,base,3.5,index);
    assert.deepEqual(sources,gallerySoundSources(rows,base,3.5,index));
    assert.ok(sources.every(({x,z})=>galleryOpen(x,z)));
  }
});

test('Gallery sounds wait, alternate, pan and soften through walls',()=>{
  const audio=createGalleryAudio(()=>0),events=[];
  const sources=[{kind:'pipe',x:5,z:0},{kind:'metal',x:-5,z:0}];
  const play=(time,active=true,clear=true)=>audio.tick(time,active,sources,{x:0,z:0},{x:0,z:-1},()=>clear,
    (...args)=>events.push(args),()=>{});
  play(0);play(1);
  assert.equal(events.length,0);
  play(2);
  assert.equal(audio.last.kind,'pipe');
  assert.equal(events[0].at(-1),1);
  play(9,true,false);
  assert.equal(audio.last.kind,'metal');
  assert.equal(events[1].at(-1),-1);
  assert.ok(events[1][3]<events[0][3]*.4);
  play(10,false);
  assert.equal(audio.last,null);
  play(99);
  assert.equal(events.length,2);
});
