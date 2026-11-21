import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from './three.js';
import {GorillaLocomotion} from './locomotion.js';

const floor={normal:new Vector3(0,1,0),height:.059,friction:.95};
const wall={normal:new Vector3(-1,0,0),height:-.5,friction:.95};
const settings={grip:5,slide:3,jump:5,weight:4};

function planeContact(from,to,rotation,planes,hit,normal){
  let nearest=Infinity,surface=null;
  for(const plane of planes){
    const start=from.dot(plane.normal)-plane.height;
    const end=to.dot(plane.normal)-plane.height;
    if(end>1e-8||end>=start-1e-8)continue;
    const fraction=start<=0?0:start/(start-end);
    if(fraction>=nearest)continue;
    hit.lerpVectors(from,to,fraction);
    hit.addScaledVector(plane.normal,plane.height-hit.dot(plane.normal));
    normal.copy(plane.normal);
    nearest=fraction;
    surface=plane;
  }
  return surface;
}

function simulator(hz=90,boxes=[floor]){
  const hands=[0,1].map(()=>({valid:false,target:new Vector3(),mesh:{quaternion:new Quaternion()}}));
  const control=new GorillaLocomotion(Vector3,hands,planeContact);
  const velocity=new Vector3(),position=new Vector3(),head=new Vector3(),movement=new Vector3(),applied=new Vector3();
  const dt=1/hz;
  function step(left,right=undefined){
    head.copy(position).y+=1.15;
    for(const [index,local] of [left,right].entries()){
      hands[index].valid=Boolean(local);
      if(local)hands[index].target.fromArray(local).add(position);
    }
    control.move({head,dt,gravity:13,settings,boxes,velocity,movement,reach:1.25});
    applied.copy(movement);
    applied.y=Math.max(-position.y,applied.y);
    position.add(applied);
    if(position.y===0&&velocity.y<0)velocity.y=0;
    return {...control.finish(applied,velocity),dx:applied.x,dy:applied.y};
  }
  return {control,hands,position,step,velocity};
}

test('In-air arm swings do not propel the player',()=>{
  const sim=simulator();
  sim.position.y=1;
  for(let frame=0;frame<15;frame++){
    const result=sim.step([Math.sin(frame)*.32,.42,0]);
    assert.equal(result.contacts,0);
    assert.equal(result.launched,false);
    assert.equal(result.dx,0);
  }
  assert.ok(sim.position.y<1);
});

test('A downward push launches in the same direction at 72, 90 and 120 Hz',()=>{
  const speeds=[72,90,120].map(hz=>{
    const sim=simulator(hz);
    for(let frame=0;frame<.2*hz;frame++){
      const result=sim.step([0,.18-3*frame/hz,0]);
      if(result.launched){
        assert.ok(sim.velocity.y>1);
        assert.equal(sim.velocity.x,0);
        return result.launchSpeed;
      }
    }
    assert.fail('The floor push did not lift the player');
  });
  assert.ok(Math.max(...speeds)-Math.min(...speeds)<1.2,`Speeds: ${speeds}`);
});

test('Two identical pushes share support without doubling displacement',()=>{
  const a=simulator(),b=simulator();
  for(let i=0;i<6;i++){
    const left=[-.2,.058-i*.005,0],right=[.2,.058-i*.005,0];
    const single=a.step(left),both=b.step(left,right);
    assert.equal(both.contacts,2);
    assert.ok(Math.abs(single.dy-both.dy)<1e-6);
    assert.equal(both.launched,false);
  }
});

test('Lifting a resting hand reduces sideways traction before letting go',()=>{
  const planted=simulator(),lifting=simulator();
  planted.step([0,.058,0]);
  lifting.step([0,.058,0]);
  const active=planted.step([-.025,.058,0]);
  const withdrawing=lifting.step([-.025,.085,0]);
  assert.ok(active.dx>.02);
  assert.ok(withdrawing.dx>0&&withdrawing.dx<active.dx*.4);
  assert.ok(withdrawing.dy<=0);
  assert.equal(lifting.step([-.025,.12,0]).contacts,0);
});

test('Pushing off a wall sends the body away and a returning palm can catch it immediately',()=>{
  const sim=simulator(90,[wall]);
  let launch;
  for(let i=0;i<12;i++){
    launch=sim.step([.35+i*.032,.7,0]);
    if(launch.launched)break;
  }
  assert.equal(launch.launched,true);
  assert.ok(sim.velocity.x< -1);
  const state=sim.control.hands[0];
  assert.ok(state.releaseTime>0);
  const outside=state.releasePoint.clone().addScaledVector(state.releaseNormal,.02);
  const inside=state.releasePoint.clone().addScaledVector(state.releaseNormal,-.02);
  assert.equal(sim.control.sweep(state,outside,inside),wall);
  assert.equal(state.releaseTime,0);
});
