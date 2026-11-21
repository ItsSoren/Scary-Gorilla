const profiles={
  pipe:{range:18,low:172,end:74,noise:580,time:.49,gain:.21},
  metal:{range:22,low:310,end:148,noise:1280,time:.31,gain:.18},
  echo:{range:29,low:420,end:233,noise:890,time:.69,gain:.16},
};

export function gallerySoundSources(rows,base,tile,seed){
  return Object.keys(profiles).map((kind,index)=>{
    const hash=(Math.imul(seed^(index+1),0x45d9f3b)>>>0);
    const row=2+hash%5;
    const columns=Array.from(rows[row].matchAll(/\./g),match=>match.index);
    const col=columns[(hash>>>12)%columns.length];
    return {kind,x:(col-4)*tile,y:kind==='pipe'?2.72:1.4,z:base+(row+.5)*tile};
  });
}

export function createGalleryAudio(random=Math.random){
  let due=null,last='',debug=null;
  return {
    get last(){return debug;},
    tick(time,active,sources,eye,heading,visible,tone,scrape){
      if(!active){due=null;last='';debug=null;return;}
      if(due===null)due=time+2+random()*3;
      if(time<due)return;
      const choices=sources.filter(source=>{
        const distance=Math.hypot(source.x-eye.x,source.z-eye.z);
        return distance>2&&distance<profiles[source.kind].range;
      });
      const varied=choices.filter(source=>source.kind!==last);
      const pool=varied.length?varied:choices;
      due=time+7+random()*9;
      if(!pool.length){due=time+2;return;}
      const source=pool[Math.floor(random()*pool.length)],profile=profiles[source.kind];
      const dx=source.x-eye.x,dz=source.z-eye.z,distance=Math.hypot(dx,dz);
      const clear=visible(eye,source),pan=Math.max(-1,Math.min(1,(-dx*heading.z+dz*heading.x)/distance));
      const gain=profile.gain*(1-distance/profile.range)**1.4*(clear?1:.31);
      const pitch=.84+random()*.32;
      tone(profile.low*pitch*(clear?1:.76),profile.end*pitch,profile.time,gain,'triangle',pan);
      scrape(profile.noise*pitch*(clear?1:.48),profile.time,gain*.72,pan);
      last=source.kind;
      debug={kind:last,distance,clear};
    },
  };
}
