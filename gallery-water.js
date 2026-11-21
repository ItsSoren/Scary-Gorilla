import * as T from './three.js';

export function createWaterMaterial(){
  const uniforms={
    time:{value:0},fogTint:{value:new T.Color()},fogDensity:{value:0},
    lampA:{value:new T.Vector3()},lampB:{value:new T.Vector3()},
    leak:{value:new T.Vector3(0,-1,0)},head:{value:new T.Vector3()},wake:{value:0},
    puddle:{value:0},
  };
  return new T.ShaderMaterial({
    uniforms,transparent:true,side:T.DoubleSide,depthWrite:false,forceSinglePass:true,
    vertexShader:`
      varying vec3 world;
      varying vec2 waterUV;
      void main(){
        vec4 point = modelMatrix * instanceMatrix * vec4(position, 1.0);
        world = point.xyz;
        waterUV = uv;
        gl_Position = projectionMatrix * viewMatrix * point;
      }
    `,
    fragmentShader:`
      uniform float time, fogDensity, wake, puddle;
      uniform vec3 fogTint, lampA, lampB, leak, head;
      varying vec3 world;
      varying vec2 waterUV;
      float fixture(vec3 lamp, vec3 reflection){
        float t = (lamp.y - world.y) / max(.015, reflection.y);
        vec2 delta = world.xz + reflection.xz * t - lamp.xz;
        vec2 edge = max(abs(delta) - vec2(.43,.055), 0.0);
        return (exp(-dot(edge,edge)*26.0) + .23*exp(-dot(edge,edge)*2.2)) *
          smoothstep(.01,.12,reflection.y) * smoothstep(0.0,.8,lamp.y-world.y);
      }
      vec2 ripple(vec2 offset, float strength, float frequency){
        float d = length(offset);
        return offset / max(.025,d) * cos(d*frequency - time*8.0) * strength * exp(-d*1.15);
      }
      void main(){
        vec2 p = world.xz;
        vec2 slope = vec2(
          .026*cos(dot(p,vec2(5.1,2.4))+time*1.8) + .013*sin(p.y*11.0-time*2.8),
          .021*cos(dot(p,vec2(-1.9,5.6))-time*1.6) + .014*sin(p.x*9.0+time*2.3));
        slope += ripple(p-leak.xz,.12*step(0.0,leak.y),19.0);
        slope += ripple(p-head.xz,wake*.16,13.0);
        vec3 normal = normalize(vec3(slope.x,1.0,slope.y));
        vec3 look = normalize(cameraPosition-world);
        vec3 reflection = reflect(-vec3(look.x,abs(look.y),look.z),normal);
        float fresnel = pow(1.0-clamp(abs(dot(look,normal)),0.0,1.0),3.0);
        float lights = fixture(lampA,reflection) + fixture(lampB,reflection);
        bool under = cameraPosition.y < world.y;
        vec3 color = mix(vec3(.052,.106,.086),vec3(.15,.23,.21),fresnel);
        color += lights * vec3(.44,.64,.57);
        float alpha = clamp(mix(.24,.78,fresnel) + lights*.36,0.0,.92);
        if(puddle>.5){
          vec2 puddleOffset = (waterUV-.5)*2.0;
          float outline = length(puddleOffset) + .085*sin(p.x*7.0+p.y*5.0) + .045*cos(p.y*13.0);
          alpha *= 1.0-smoothstep(.83,1.0,outline);
        }
        if(under){
          color = mix(color-lights*vec3(.36,.52,.47),vec3(.07,.20,.16),.34);
          alpha = max(.28,alpha*.76);
        }
        float distanceToEye = length(world-cameraPosition);
        float fog = 1.0-exp(-fogDensity*fogDensity*distanceToEye*distanceToEye);
        gl_FragColor = vec4(mix(color,fogTint,fog),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function addCaustics(material,time){
  material.onBeforeCompile=shader=>{
    shader.uniforms.waterClock=time;
    shader.vertexShader='varying vec2 poolXZ; varying float poolFace;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      poolXZ = (modelMatrix * instanceMatrix * vec4(position,1.0)).xz;
      poolFace = abs(normal.y);
    `);
    shader.fragmentShader='uniform float waterClock; varying vec2 poolXZ; varying float poolFace;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>',`
      vec2 p = poolXZ * 5.7;
      p += vec2(sin(p.y*.21),cos(p.x*.19))*1.8;
      float wave = sin(p.x + sin(p.y*.87+waterClock*.9)*1.5 + waterClock*1.4);
      float crossWave = sin(p.y + sin(p.x*1.2-waterClock*1.1)*1.4);
      float lattice = pow(max(0.0, 1.0-abs(wave+crossWave)), 6.0);
      float shade = .65+.35*sin(poolXZ.x*1.4+cos(poolXZ.y*1.1));
      gl_FragColor.rgb += vec3(.013,.030,.023)*lattice*shade*mix(.12,1.0,poolFace);
      #include <tonemapping_fragment>
    `);
  };
}

export function addConcreteWear(material){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 concreteWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      concreteWorld = (modelMatrix * instanceMatrix * vec4(position,1.0)).xyz;
    `);
    shader.fragmentShader=`
      varying vec3 concreteWorld;
      float concreteHash(vec2 point){
        return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453);
      }
      float concreteNoise(vec2 point){
        vec2 cell = floor(point), blend = fract(point);
        blend = blend*blend*(3.0-2.0*blend);
        return mix(mix(concreteHash(cell),concreteHash(cell+vec2(1,0)),blend.x),
          mix(concreteHash(cell+vec2(0,1)),concreteHash(cell+vec2(1,1)),blend.x),blend.y);
      }
    `+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 concrete = vec2(concreteWorld.x+concreteWorld.z,concreteWorld.y);
      float aggregate = concreteNoise(concrete*54.0);
      float stains = concreteNoise(concrete*2.1);
      float drips = concreteNoise(concrete*vec2(16.0,.7));
      float wetBand = 1.0-smoothstep(.12,1.12,concrete.y+stains*.25);
      diffuseColor.rgb *= .57+aggregate*.32+stains*.38-wetBand*.22;
      diffuseColor.rgb *= 1.0-.22*smoothstep(.58,.9,drips)*stains;
      diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.72,1.06,.85),wetBand*.6);
    `);
  };
}
