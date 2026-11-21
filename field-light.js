export const matchCapacity=3;
export const batteryCapacity=120;
const ignitionDelay=2;
const burnDuration=2;

export function createFieldLight(){
  let matches,battery,ignitesAt,expiresAt;
  function reset(){
    matches=matchCapacity;
    battery=batteryCapacity;
    extinguish();
  }
  function extinguish(){ignitesAt=expiresAt=-Infinity;}
  function strike(now){
    if(matches===0||now<expiresAt)return false;
    matches--;
    ignitesAt=now+ignitionDelay;
    expiresAt=ignitesAt+burnDuration;
    return true;
  }
  function consume(seconds){battery=Math.max(0,battery-seconds);}
  function restock(){matches=matchCapacity;}
  function replaceBattery(){battery=batteryCapacity;}
  function read(now){
    const phase=now>=expiresAt?'idle':now>=ignitesAt?'burning':'striking';
    return {matches,battery,phase,remaining:phase==='idle'?0:(phase==='striking'?ignitesAt:expiresAt)-now};
  }
  reset();
  return {reset,extinguish,strike,consume,restock,replaceBattery,read};
}
