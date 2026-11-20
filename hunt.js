import {cellOf, levels, open, point, tile} from './station.js';

const directions=[[1,0],[-1,0],[0,1],[0,-1]];
const key=(x,z)=>z*16+x;
const grids=levels.map((rows,level)=>{
  const nodes=new Map();
  for(let z=1;z<rows.length-1;z++)for(let x=1;x<rows[z].length-1;x++){
    if(!open(x,z,level))continue;
    const next=directions.map(([dx,dz])=>[x+dx,z+dz]).filter(([x,z])=>open(x,z,level)).map(([x,z])=>key(x,z));
    nodes.set(key(x,z),{position:point(x,z,0,level),next});
  }
  return {nodes,distances:new Map()};
});
export const behavior={patrol:0,watch:1,flank:2,hide:3,charge:4,investigate:5};
export const huntingSpeed=[1.62,1.63,2.97,2.55,4.48,2.27];
const degrees=(a,b)=>a.x*b.x+a.z*b.z;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const idAt=(position,level)=>key(...cellOf(position.x,position.z,level));
function distances(grid,origin){
  if(grid.distances.has(origin))return grid.distances.get(origin);
  const result=new Map([[origin,0]]),queue=[origin];
  for(let i=0;i<queue.length;i++){
    const id=queue[i];
    for(const next of grid.nodes.get(id)?.next??[]){
      if(result.has(next))continue;
      result.set(next,result.get(id)+1);queue.push(next);
    }
  }
  grid.distances.set(origin,result);
  return result;
}
function targetHeading(player){
  return {x:Math.sin(player.yaw),z:Math.cos(player.yaw)};
}
function looking(player,position){
  const range=distance(player,position);
  if(range<.22)return true;
  return degrees(targetHeading(player),{x:position.x-player.x,z:position.z-player.z})>range*.43;
}
function corner(level,monster,mark,aim,role,visible,occupied){
  const grid=grids[level];
  const playerDistances=distances(grid,idAt(mark,level));
  const monsterDistances=distances(grid,idAt(monster,level));
  let best=null,bestScore=-Infinity;
  for(const [id,node] of grid.nodes){
    const radius=playerDistances.get(id),travel=monsterDistances.get(id);
    if(!Number.isFinite(travel)||!Number.isFinite(radius)||radius<1||radius>5||occupied.has(id))continue;
    const spot=node.position,cross=visible(mark,spot,level);
    const runAhead=degrees(aim,{x:spot.x-mark.x,z:spot.z-mark.z})/tile;
    const score=role===behavior.watch
      ? 12-2*Math.abs(radius-2)-.6*travel+(cross?4:0)-(looking(mark,spot)?7:0)
      : 15-2*Math.abs(radius-(role===behavior.flank?3:2))-.55*travel+(cross?-8:5)
        + Math.min(5,runAhead*2)-(node.next.length===1?6:0);
    if(score>bestScore){bestScore=score;best={id,spot};}
  }
  if(best)occupied.add(best.id);
  return best?.spot??mark;
}
export function createHunt({visible,lifts,patrolPoints}){
  const dossiers=new Map();
  let lastPlan=-Infinity;
  const occupied=new Set();
  function reset(){
    lastPlan=-Infinity;
    dossiers.clear();
  }
  function plan(time,monsters,players,lure){
    if(time-lastPlan<.26)return;
    lastPlan=time;
    const samples=new Map(players.map(player=>[player.id,player]));
    for(const [id,mark] of dossiers)if(time-mark.lastSeen>16||!samples.has(id))dossiers.delete(id);
    for(const player of players){
      if(player.protected)continue;
      let nearest=Infinity;
      for(const [i,m] of monsters.entries()){
        if(m.level!==player.level)continue;
        const p=m.root.position,range=distance(player,p);
        const vision=range<[10,13,8][i]+(player.light?5:0)&&visible(player,p,m.level);
        const hearing=player.run&&range<[11,8,18][i]&&
          (distances(grids[m.level],idAt(p,m.level)).get(idAt(player,m.level))??Infinity)<(i===2?9:5);
        if(vision||hearing)nearest=Math.min(nearest,range);
      }
      const prior=dossiers.get(player.id);
      if(nearest===Infinity){
        if(prior&&prior.level!==player.level&&time-prior.lastSeen<4.5&&distance(prior,lifts[prior.level])<5){
          // The elevator reveals the destination; the last known location is its landing.
          dossiers.set(player.id,{...prior,x:lifts[player.level].x,z:lifts[player.level].z,
            level:player.level,lastSeen:time,certainty:9});
        }
        continue;
      }
      const moved=prior?.level===player.level&&distance(prior,player)>.32;
      let heading=moved?{x:player.x-prior.x,z:player.z-prior.z}:prior?.heading??targetHeading(player);
      const magnitude=Math.hypot(heading.x,heading.z)||1;
      heading={x:heading.x/magnitude,z:heading.z/magnitude};
      dossiers.set(player.id,{...player,heading,firstSeen:prior?.firstSeen??time,lastSeen:time,certainty:nearest});
    }
    const mark=[...dossiers.values()].filter(m=>!samples.get(m.id)?.protected)
      .sort((a,b)=>(time-a.lastSeen)*2+a.certainty*.28-(time-b.lastSeen)*2-b.certainty*.28)[0];
    const age=mark?time-mark.firstSeen:0;
    const trail=mark?time-mark.lastSeen:Infinity;
    const team=!!mark&&age>3.8&&trail<9;
    const assault=!!mark&&age>6.3&&trail<4.2;
    occupied.clear();
    const members=monsters.map((m,i)=>({m,i})).sort((a,b)=>{
      if(!mark)return a.i-b.i;
      const rank=({m})=>Math.abs(m.level-mark.level)*80+distance(m.root.position,mark);
      return rank(a)-rank(b);
    });
    for(const [rank,{m,i}] of members.entries()){
      const position=m.root.position;
      const nearLure=lure.until>time&&lure.level===m.level&&distance(position,lure)<(i===2?28:20);
      if(nearLure&&rank===0&&(!assault||trail>1.2)){
        m.mode=behavior.investigate;m.goal.set(lure.x,0,lure.z);
        continue;
      }
      if(mark&&trail<10&&m.level!==mark.level&&team&&(rank<2||age>10)){
        const lift=lifts[m.level];
        m.mode=behavior.flank;m.goal.copy(lift);
        if(distance(position,lift)<.62&&time>=m.nextLift){
          m.level+=Math.sign(mark.level-m.level);
          m.nextLift=time+2.1;
          m.root.position.copy(lifts[m.level]);
          m.target.copy(m.root.position);m.goal.copy(m.root.position);
        }
        continue;
      }
      if(mark&&trail<10&&m.level===mark.level&&(team||rank===0)){
        const sees=trail<.42&&visible(position,mark,m.level);
        const range=distance(position,mark);
        const blindSide=sees&&!looking(mark,position);
        const lead=members[0].m.root.position;
        const canStrike=assault&&(rank===0||range<4.6&&blindSide&&distance(position,lead)>2.4);
        if(canStrike){
          m.mode=behavior.charge;m.goal.set(mark.x,0,mark.z);
        }else{
          m.mode=rank===0?behavior.watch:rank===1?behavior.flank:behavior.hide;
          if(rank===2&&range<6&&!sees&&distance(position,m.goal)<1)m.goal.copy(position);
          else m.goal.copy(corner(m.level,position,mark,mark.heading,m.mode,visible,occupied));
        }
        continue;
      }
      if(nearLure){
        m.mode=behavior.investigate;m.goal.set(lure.x,0,lure.z);
        continue;
      }
      if(m.level!==i&&time>=m.nextLift){
        const lift=lifts[m.level];
        m.mode=behavior.patrol;m.goal.copy(lift);
        if(distance(position,lift)<.62){
          m.level+=Math.sign(i-m.level);m.nextLift=time+2.2;
          m.root.position.copy(lifts[m.level]);m.target.copy(m.root.position);m.goal.copy(m.root.position);
        }
        continue;
      }
      if(m.mode!==behavior.patrol||distance(position,m.goal)<.48||time>m.phase){
        const points=patrolPoints[m.level];m.goal.copy(points[m.route++%points.length]);m.phase=time+15;
      }
      m.mode=behavior.patrol;
    }
  }
  return {reset,plan};
}
