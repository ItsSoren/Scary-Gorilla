const voices=[
  {pitch:76,length:1.23,formants:[290,580,1320],breath:.25},
  {pitch:174,length:1.42,formants:[480,1510,2470],breath:.62},
  {pitch:112,length:.94,formants:[350,1040,2080],breath:.48},
];
const rates=[24000,24000,24000];

function voiceClip(audio,type,attack){
  const profile=voices[type],rate=rates[type],length=attack?profile.length*.78:profile.length;
  const buffer=audio.createBuffer(1,Math.round(rate*length),rate),out=buffer.getChannelData(0);
  const filters=profile.formants.map((hz,i)=>{
    const decay=Math.exp(-Math.PI*(120+i*81)/rate);
    return {a:2*decay*Math.cos(2*Math.PI*hz/rate),b:decay*decay,dry:1-decay,prev:0,last:0};
  });
  let seed=15317+type*439,phase=0,noise=0,max=.01;
  for(let i=0;i<out.length;i++){
    const t=i/rate,p=t/length;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const white=seed/2147483648-1;
    noise+=(white-noise)*.11;
    const sweep=(attack?1.45:1.04)*(1+.27*Math.sin(p*Math.PI)-.29*p);
    phase=(phase+profile.pitch*sweep*(1+.045*Math.sin(t*55)+noise*.12)/rate)%1;
    const pulse=phase<.28?Math.sin(phase*Math.PI/.28):-.21;
    const flutter=[.66+.34*Math.sin(t*35)**2,.6+.4*Math.sin(t*21+1)**2,.16+.84*Math.max(0,Math.sin(t*27))**6][type];
    const texture=pulse*(1-profile.breath)+(white-noise)*profile.breath;
    let resonances=0;
    for(const filter of filters){
      const next=filter.a*filter.last-filter.b*filter.prev+texture*filter.dry;
      filter.prev=filter.last;filter.last=next;resonances+=next;
    }
    const edge=Math.min(1,p*(attack?25:7),(1-p)*6);
    const sound=Math.tanh(resonances*.8+pulse*.22+noise*.68)*Math.max(0,edge)*flutter;
    out[i]=sound;max=Math.max(max,Math.abs(sound));
  }
  for(let i=0;i<out.length;i++)out[i]*=.85/max;
  return buffer;
}
export function createCreatureAudio(audio,output){
  const cache=new Map();
  function play(type,attack,gain,pan,occluded){
    if(audio.state!=='running'||gain<=0)return;
    const key=type*2+Number(attack);
    if(!cache.has(key))cache.set(key,voiceClip(audio,type,attack));
    const node=audio.createBufferSource(),amp=audio.createGain();
    node.buffer=cache.get(key);amp.gain.value=gain;
    node.playbackRate.value=attack?1:.94+Math.random()*.12;
    node.connect(amp);
    let tail=amp;
    if(occluded){
      const filter=audio.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=460;tail=amp.connect(filter);
    }
    const panner=audio.createStereoPanner?.();
    if(panner){panner.pan.value=pan;tail=tail.connect(panner);}
    tail.connect(output);
    node.start();
  }
  return {play};
}
