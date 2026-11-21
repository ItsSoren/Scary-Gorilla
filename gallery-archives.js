import * as T from './three.js';

const records=[
  ['SERVICE DES POMPES','03:17 – La conduite nord tape.','Couper P-2 avant la relève.','Viktor, laisse les clés ici.'],
  ['REGISTRE DES RONDES','Il manque une signature.','Même heure, trois nuits de suite.','La porte était fermée de l’intérieur.'],
  ['TRANSFERT / BORDEREAU','Chariot arrivé vide.','Ne pas effacer les marques au sol.','Le chef de quart est prié de rappeler.'],
  ['VEILLE / NOTE À LA MAIN','Le bruit revient après la coupure.','J’ai laissé la lampe à l’angle.','Ne m’attendez pas au poste.'],
  ['RELEVÉ DE PRESSION','P-2 : arrêtée depuis deux jours.','Manomètre : encore en hausse.','Le cadran est froid au toucher.'],
  ['FEUILLET SANS DATE','Une seule paire de bottes.','Deux séries de traces.','Elles s’arrêtent au même mur.'],
];

export function archiveSite(index,rows,seed,isDry){
  if(index>=3&&seed%4!==0)return null;
  const candidates=[];
  for(let row=1;row<8;row++){
    for(let col=1;col<8;col++){
      if(rows[row][col]!=='.'||!isDry(row,col))continue;
      for(const side of [-1,1]){
        if(rows[row][col+side]==='#')candidates.push({row,col,side});
      }
    }
  }
  if(!candidates.length)return null;
  const entrance=candidates.filter(site=>site.row===1);
  const pool=index===0&&entrance.length?entrance:candidates;
  return {...pool[seed%pool.length],record:index<3?index:3+((seed>>>12)%3)};
}

export function archiveSheet(record){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=320;
  const context=canvas.getContext('2d');
  context.fillStyle='#b5a17a';
  context.fillRect(0,0,512,320);
  for(let i=0;i<96;i++){
    context.fillStyle=i%3?'rgba(75,48,29,.09)':'rgba(228,208,159,.2)';
    context.fillRect((i*179)%512,(i*73)%320,9+(i*11)%49,1+(i*13)%15);
  }
  context.fillStyle='#6d3d32';
  context.font='bold 24px monospace';
  context.fillText(records[record][0],24,58,464);
  context.fillRect(24,76,464,2);
  context.fillStyle='#292520';
  context.font='24px monospace';
  records[record].slice(1).forEach((line,index)=>context.fillText(line,24,124+index*46,464));
  const map=new T.CanvasTexture(canvas);
  map.colorSpace=T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(1.04,.65),new T.MeshStandardMaterial({
    map,roughness:1,emissive:'#514335',emissiveIntensity:.18,
  }));
}
