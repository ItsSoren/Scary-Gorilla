import * as T from './three.js';

export const vistaSector=2;
export const vistaRows=[3,4,5,6];

export function createVista(z){
  const geometry=new T.BoxGeometry();
  const layers=new Map();
  const box=(color,x,y,offset,w,h,d)=>{
    if(!layers.has(color))layers.set(color,[]);
    layers.get(color).push([x,y,z+offset,w,h,d]);
  };

  box('#9ca5aa',119,14,0,1,124,190);
  box('#68747a',71,-15,0,108,1,145);
  box('#4d595f',46,-8,0,55,2,94);
  box('#313b42',22,-3.6,0,15,1.2,38);
  for(const [x,offset,width,height,color] of [
    [35,-18,12,48,'#242e37'],[51,9,15,66,'#35414a'],
    [69,-12,17,79,'#4a565e'],[94,22,23,93,'#657178'],
  ]){
    box(color,x,height/2-13,offset,width,height,width*.69);
    box(color,x,height-14,offset,width+8,3.2,width+10);
    box(color,x,height-10.8,offset,width+13,3.2,width+15);
    for(let i=0;i<8;i++){
      const rib=offset+(i-3.5)*width*.08;
      box('#536069',x-width/2-.12,height*.47-13,rib,.24,height*.9,.13);
      if(i%3===0)box('#c9a084',x-width/2-.27,2+i*1.1,rib,.08,.12,.37);
    }
  }
  const matrix=new T.Matrix4();
  return [...layers].map(([color,blocks])=>{
    const mesh=new T.InstancedMesh(geometry,new T.MeshBasicMaterial({color,fog:false}),blocks.length);
    blocks.forEach(([x,y,position,w,h,d],i)=>{
      matrix.makeScale(w,h,d).setPosition(x,y,position);
      mesh.setMatrixAt(i,matrix);
    });
    return mesh;
  });
}
