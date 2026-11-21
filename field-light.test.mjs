import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldLight,batteryCapacity,matchCapacity} from './field-light.js';

test('A match takes two seconds to light and burns for two seconds',()=>{
  const light=createFieldLight();
  assert.ok(light.strike(10));
  assert.equal(light.strike(11),false);
  assert.equal(light.read(11.999).phase,'striking');
  assert.equal(light.read(12).phase,'burning');
  assert.equal(light.strike(13),false);
  assert.equal(light.read(14).phase,'idle');
  assert.equal(light.read(14).matches,matchCapacity-1);
});

test('The counter restocks matches; extinguishing does not refund one',()=>{
  const light=createFieldLight();
  for(let i=0;i<matchCapacity;i++)assert.ok(light.strike(i*4));
  light.extinguish();
  assert.equal(light.read(20).phase,'idle');
  assert.equal(light.strike(20),false);
  light.restock();
  assert.ok(light.strike(20));
  light.reset();
  assert.equal(light.read(20).matches,matchCapacity);
  assert.equal(light.read(20).phase,'idle');
});

test('A depleted battery stays at zero until replaced',()=>{
  const light=createFieldLight();
  light.consume(35);
  assert.equal(light.read(72).battery,batteryCapacity-35);
  light.consume(batteryCapacity);
  assert.equal(light.read(73).battery,0);
  light.replaceBattery();
  assert.equal(light.read(74).battery,batteryCapacity);
});
