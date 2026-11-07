/* Jasola Rider: detailed traffic vehicle family (window.ApexVehicles).
   Compact sedan, fastback sedan, hatchback, compact SUV, police car, taxi, panel van, ambulance,
   Indian cargo truck (tarp / slatted / logs), light Indian truck, European cab-over box truck and semi.
   No badges, logos or lettering; plates are blank.

   Contract: every builder is a pure function of the seeded rng it is given (no Math.random / Date), returns
   {obj, hw, hl} with EXACTLY the hw / hl of the kind it replaces, faces +z with its origin on the road, and lists
   its wheels through kit.addWheel (the game draws and rolls them). Geometry is cached per shape and shared by every
   vehicle of that shape; a vehicle is at most 6 meshes (paint, livery, glass, trim, chrome, lamps).
   The per-map entry points (highway, mountain, jungle, builtin) draw exactly as many values from the traffic rng as
   the model they replace did, so vehicle kinds and positions are the same as before.
   Loaded before index.html's game script; if it is missing, every map keeps its own models. */
(function(){
'use strict';
const T=window.THREE;
if(!T){window.ApexVehicles={ok(){return false;}};return;}
const PI=Math.PI;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pick=(r,a)=>a[(r()*a.length)|0];

/* ---------------- geometry buffers ---------------- */
const KEYS=['paint','liv','glass','trim','chrome','lamp'];
let CUR=[1,1,1],MUD=0;const MUDC=[.40,.33,.24];
function hx(h){return[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255];}
function Bk(){const b={tris:0};for(const k of KEYS)b[k]={p:[],n:[],c:[]};return b;}
function pv(B,k,x,y,z,nx,ny,nz,c){const a=B[k];a.p.push(x,y,z);a.n.push(nx,ny,nz);
  if(k==='liv'||k==='lamp'){let q=c||CUR;if(MUD&&k==='liv')q=[q[0]+(MUDC[0]-q[0])*MUD,q[1]+(MUDC[1]-q[1])*MUD,q[2]+(MUDC[2]-q[2])*MUD];a.c.push(q[0],q[1],q[2]);}}
function tri(B,k,a,b,c,col,na,nb,nc){
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz);if(l<1e-9)return;
  if(!na){na=nb=nc=[nx/l,ny/l,nz/l];}
  pv(B,k,a[0],a[1],a[2],na[0],na[1],na[2],col);pv(B,k,b[0],b[1],b[2],nb[0],nb[1],nb[2],col);pv(B,k,c[0],c[1],c[2],nc[0],nc[1],nc[2],col);B.tris++;}
// quad a,b,c,d; nh = outward hint, the winding is flipped to face it
function quad(B,k,a,b,c,d,col,nh){
  const px=c[0]-a[0],py=c[1]-a[1],pz=c[2]-a[2],qx=d[0]-b[0],qy=d[1]-b[1],qz=d[2]-b[2];
  const nx=py*qz-pz*qy,ny=pz*qx-px*qz,nz=px*qy-py*qx;
  if(nh&&nx*nh[0]+ny*nh[1]+nz*nh[2]<0){tri(B,k,a,c,b,col);tri(B,k,a,d,c,col);}else{tri(B,k,a,b,c,col);tri(B,k,a,c,d,col);}}
const PG={};function pg(name,args){const key=name+args.join(',');return PG[key]||(PG[key]=new T[name](...args).toNonIndexed());}
const _m=new T.Matrix4(),_q=new T.Quaternion(),_e=new T.Euler(),_p=new T.Vector3(),_s=new T.Vector3(),_v=new T.Vector3(),_n=new T.Vector3(),_nm=new T.Matrix3();
function addG(B,k,g,x,y,z,sx,sy,sz,rx,ry,rz,col){
  _e.set(rx||0,ry||0,rz||0);_q.setFromEuler(_e);_m.compose(_p.set(x,y,z),_q,_s.set(sx,sy,sz));_nm.getNormalMatrix(_m);
  const P=g.attributes.position,N=g.attributes.normal;
  for(let i=0;i<P.count;i++){_v.fromBufferAttribute(P,i).applyMatrix4(_m);_n.fromBufferAttribute(N,i).applyMatrix3(_nm).normalize();pv(B,k,_v.x,_v.y,_v.z,_n.x,_n.y,_n.z,col);}
  B.tris+=P.count/3;}
function bx(B,k,x,y,z,sx,sy,sz,col,rx,ry,rz){addG(B,k,pg('BoxGeometry',[1,1,1]),x,y,z,sx,sy,sz,rx,ry,rz,col);}
// box from corner ranges
function bxr(B,k,x0,x1,y0,y1,z0,z1,col){bx(B,k,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,x1-x0,y1-y0,z1-z0,col);}
// cylinder along z (axis z) or x
function cyz(B,k,seg,x,y,z,r,len,col){addG(B,k,pg('CylinderGeometry',[1,1,1,seg,1,false]),x,y,z,r,len,r,PI/2,0,0,col);}
function ell(B,k,seg,x,y,z,sx,sy,sz,col,ry){addG(B,k,pg('SphereGeometry',[1,seg,Math.max(3,seg-2)]),x,y,z,sx,sy,sz,0,ry||0,0,col);}
// flat quad facing +z (s=1) or -z (s=-1) at depth z
function zq(B,k,x0,x1,y0,y1,z,s,col){quad(B,k,[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],col,[0,0,s]);}
// flat quads on both flanks at |x|=xs, z0..z1, y0..y1
function xq2(B,k,xs,z0,z1,y0,y1,col){for(const s of[1,-1])quad(B,k,[s*xs,y0,z0],[s*xs,y0,z1],[s*xs,y1,z1],[s*xs,y1,z0],col,[s,0,0]);}
function fin(B){const out={};for(const k of KEYS){const a=B[k];if(!a.p.length)continue;const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(a.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(a.n,3));
  if(a.c.length)g.setAttribute('color',new T.Float32BufferAttribute(a.c,3));g.computeBoundingSphere();out[k]=g;}return out;}

/* ---------------- materials and assembly ---------------- */
let MT=null;
function mats(kit){if(MT)return MT;MT={liv:new T.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.2,envMapIntensity:.6}),glass:kit.glassM,
  trim:new T.MeshStandardMaterial({color:0x18191b,roughness:.7,metalness:.15}),chrome:new T.MeshStandardMaterial({color:0xc9cdd3,roughness:.3,metalness:.6,envMapIntensity:.9}),
  lamp:new T.MeshBasicMaterial({vertexColors:true})};return MT;}
const CACHE={};let STATS={};
function cached(key,fn){if(CACHE[key])return CACHE[key];const saveC=CUR,saveM=MUD;const r=fn();CUR=saveC;MUD=saveM;r.geo=fin(r.B);r.tris=r.B.tris;r.B=null;STATS[key]=r.tris;return CACHE[key]=r;}
function assemble(kit,G,paint,hub,hw,hl){const m=mats(kit),g=new T.Group();
  for(const k of KEYS){const geo=G.geo[k];if(!geo)continue;const mesh=new T.Mesh(geo,k==='paint'?kit.vm(paint):m[k]);mesh.castShadow=(k==='paint'||k==='liv');g.add(mesh);}
  for(const w of G.wh)kit.addWheel(g,w[0],w[1],w[2],w[3],w[4],w[5]!==undefined?w[5]:hub);
  g.userData.apexKind=G.kind;return{obj:g,hw,hl};}

/* ================= CARS AND VANS: lofted body ================= */
function lerpT(tab,t){if(t<=tab[0][0])return tab[0][1];for(let i=1;i<tab.length;i++)if(t<=tab[i][0]){const a=tab[i-1],b=tab[i];return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return tab[tab.length-1][1];}
const BASE={sag:.03,fr:.07,rx:.94,crown:.035,p:8,s5x:.965,s6x:.9,gx0:.88,gx1:.72,flo:0,fhi:1};
const DEF={
 sedan:Object.assign({},BASE,{top:[[-1,.86],[-.985,.93],[-.95,.985],[-.88,1.01],[-.64,1.02],[.42,.98],[.62,.93],[.86,.85],[.95,.79],[.985,.74],[1,.70]],
   sill:.31,roof:1.45,ws:.44,rf:.12,rr:-.36,rw:-.64,bp:-.08,cq:-.44,rd:-.5,win:[[-.44,.44]],axle:.61,r:.33,front:'slim',rear:'bar',ledbar:1}),
 fastback:Object.assign({},BASE,{top:[[-1,.88],[-.985,.95],[-.95,1.0],[-.9,1.02],[.42,.98],[.62,.93],[.86,.86],[.95,.80],[.985,.75],[1,.71]],
   sill:.31,roof:1.44,ws:.44,rf:.10,rr:-.30,rw:-.86,bp:-.07,cq:-.56,rd:-.5,win:[[-.56,.44]],axle:.61,r:.33,front:'big',rear:'split'}),
 hatch:Object.assign({},BASE,{top:[[-1,.98],[-.985,1.0],[-.95,1.01],[-.85,1.01],[.45,.97],[.62,.92],[.86,.85],[.95,.79],[.985,.74],[1,.70]],
   sill:.32,roof:1.5,ws:.45,rf:.16,rr:-.82,rw:-.95,bp:-.03,cq:-.70,rd:-.62,win:[[-.70,.45]],gx1:.73,p:7,axle:.62,r:.32,front:'slim',rear:'split'}),
 csuv:Object.assign({},BASE,{top:[[-1,1.0],[-.985,1.06],[-.95,1.09],[-.85,1.11],[.45,1.07],[.62,1.03],[.86,.98],[.95,.93],[.985,.87],[1,.82]],
   sill:.44,roof:1.7,sag:.02,ws:.5,rf:.22,rr:-.84,rw:-.95,bp:0,cq:-.72,rd:-.66,dp:1,win:[[-.72,.5]],gx0:.9,gx1:.78,p:7,axle:.6,r:.37,clad:1,cl:.24,rails:1,front:'suv',rear:'bar'}),
 van:Object.assign({},BASE,{top:[[-1,1.12],[.70,1.16],[.80,1.14],[.92,1.06],[.985,.99],[1,.95]],
   sill:.42,roof:2.3,sag:.015,ws:.8,rf:.52,rr:-.995,rw:-1,bp:.415,cq:-1,rd:-.9,win:[[.43,.78]],gx0:.99,gx1:.975,rx:.985,fr:.06,crown:.03,p:10,
   axle:.64,r:.36,s5x:1,s6x:.995,flo:.26,fhi:.8,van:1,rearGlass:0,front:'van',rear:'van'})
};
function halfW(c,t){const u=Math.min(1,Math.abs(t));return c.W2*Math.pow(Math.max(0,1-Math.pow(u,c.d.p)),1/c.d.p);}
function gOf(d,t){if(t>=d.ws||t<=d.rw)return 0;if(t>d.rf){const u=(d.ws-t)/(d.ws-d.rf);return 1-Math.pow(1-u,1.7);}
  if(t<d.rr){const u=(t-d.rw)/(d.rr-d.rw);return d.van?u:1-Math.pow(1-u,1.5);}return 1;}
function roofY(d,t){const rc=(d.rf+d.rr)/2,rh=(d.rf-d.rr)/2,u=Math.max(-1,Math.min(1,(t-rc)/rh));return d.roof-d.sag*u*u;}
function sec(c,t){
  const d=c.d,w=halfW(c,t),top=lerpT(d.top,t);let yb=d.sill;
  for(const a of[d.axle,-d.axle]){const dz=(t-a)*c.hl,R=d.r+.07;if(Math.abs(dz)<R)yb=Math.max(yb,d.r+Math.sqrt(R*R-dz*dz));}
  yb=Math.min(yb,top-.14);const h=top-yb;
  const y2=yb+Math.min(.06,h*.15),y3=yb+Math.min(d.cl||.2,h*.35),y4=top-Math.min(.22,h*.45),y5=top-Math.min(.05,h*.12);
  const g=gOf(d,t),ry=roofY(d,t),gy=top+g*(ry-top),yg=top+g*(ry-d.fr-top);
  const P7=[w*d.gx0,top+g*.01],P8=[w*d.gx1,yg],L=(f)=>[P7[0]+(P8[0]-P7[0])*f,P7[1]+(P8[1]-P7[1])*f];
  return{g,w,top,yb,pts:[[0,yb],[w*.9,yb],[w*.985,y2],[w,y3],[w,y4],[w*d.s5x,y5],[w*d.s6x,top],P7,L(d.flo),L(d.fhi),P8,[w*d.gx1*d.rx,gy],[0,gy+(g>0?d.crown:.02)]]};}
function segMat(c,s,tm,gm){
  const d=c.d;
  if(s<=1)return'trim';
  if(s===2)return d.clad?'trim':'paint';
  if(s<=5)return'paint';
  if(gm<=1e-4)return'paint';
  if(s===6)return d.van?'paint':'trim';
  if(s===7||s===9)return'paint';
  if(s===8){if(d.bp!==undefined&&Math.abs(tm-d.bp)<c.bw)return'trim';for(const r of c.win)if(tm>r[0]&&tm<r[1])return'glass';return d.dp&&tm<d.cq?'trim':'paint';}
  const fr=tm>d.rf,re=tm<d.rr;
  if(s===10)return fr||re?'paint':(c.roofK||'paint');
  if(fr)return'glass';if(re)return d.rearGlass===0?'paint':'glass';return c.roofK||'paint';}
function stations(c){
  const d=c.d,lo=c.lo,s=[],N=lo?6:10;for(let i=0;i<=N;i++)s.push(-1+2*i/N);
  for(const e of lo?[.97,.995,1]:[.92,.97,.99,.997,1])s.push(e,-e);
  s.push(d.ws,d.rf,d.rr,d.rw,(d.ws+d.rf)/2,(d.rr+d.rw)/2,d.cq);if(!lo)s.push(d.ws*.3+d.rf*.7);
  if(d.bp!==undefined)s.push(d.bp-c.bw,d.bp+c.bw);for(const r of c.win)s.push(r[0],r[1]);
  const na=lo?3:5,R=(d.r+.07)/c.hl;for(const a of[d.axle,-d.axle])for(let k=0;k<=na;k++)s.push(a+R*Math.cos(PI*k/na));
  if(!lo)for(const q of d.top)s.push(q[0]);
  s.sort((a,b)=>a-b);const o=[];for(const t of s){if(t<-1||t>1)continue;if(!o.length||t-o[o.length-1]>.004)o.push(t);}
  if(o[o.length-1]<1)o.push(1);return o;}
function loft(B,c){
  const ts=stations(c),S=ts.map(t=>sec(c,t)),ns=S.length,np=S[0].pts.length,nseg=np-1;
  const P=S.map((s,i)=>s.pts.map(q=>[q[0],q[1],ts[i]*c.hl]));
  const FN=[],FM=[];
  for(let i=0;i<ns-1;i++){FN.push([]);FM.push([]);const tm=(ts[i]+ts[i+1])/2,gm=Math.max(S[i].g,S[i+1].g);
    for(let s=0;s<nseg;s++){const a=P[i][s],b=P[i][s+1],cc=P[i+1][s+1],dd=P[i+1][s];
      const px=cc[0]-a[0],py=cc[1]-a[1],pz=cc[2]-a[2],qx=dd[0]-b[0],qy=dd[1]-b[1],qz=dd[2]-b[2];
      const nx=py*qz-pz*qy,ny=pz*qx-px*qz,nz=px*qy-py*qx,l=Math.hypot(nx,ny,nz);
      FN[i].push(l<1e-7?null:[nx/l,ny/l,nz/l]);FM[i].push(segMat(c,s,tm,gm));}}
  for(let i=0;i<ns-1;i++)for(let s=0;s<nseg;s++){const fn=FN[i][s];if(!fn)continue;const k=FM[i][s];
    const cor=[[i,s],[i,s+1],[i+1,s+1],[i+1,s]];
    const nr=cor.map(([ii,kk])=>{let sx=0,sy=0,sz=0;for(const a of[ii-1,ii])for(const b of[kk-1,kk]){if(a<0||a>=ns-1||b<0||b>=nseg)continue;const f=FN[a][b];
        if(!f||FM[a][b]!==k||f[0]*fn[0]+f[1]*fn[1]+f[2]*fn[2]<.72)continue;sx+=f[0];sy+=f[1];sz+=f[2];}
      const l=Math.hypot(sx,sy,sz);return l>1e-6?[sx/l,sy/l,sz/l]:fn;});
    const V=cor.map(([ii,kk])=>P[ii][kk]);
    for(const sg of[1,-1]){const v=V.map(q=>[q[0]*sg,q[1],q[2]]),n=nr.map(q=>[q[0]*sg,q[1],q[2]]);
      if(sg>0){tri(B,k,v[0],v[1],v[2],null,n[0],n[1],n[2]);tri(B,k,v[0],v[2],v[3],null,n[0],n[2],n[3]);}
      else{tri(B,k,v[0],v[2],v[1],null,n[0],n[2],n[1]);tri(B,k,v[0],v[3],v[2],null,n[0],n[3],n[2]);}}}}
// surface helpers for detail parts
function zf(c,x){const u=Math.min(.999,Math.abs(x)/c.W2);return c.hl*Math.pow(1-Math.pow(u,c.d.p),1/c.d.p);}
function fq(B,c,k,x0,x1,y0,y1,sz,col,dz){dz=dz||.012;const n=Math.max(1,Math.ceil((x1-x0)/.2));
  for(let i=0;i<n;i++){const a=x0+(x1-x0)*i/n,b=x0+(x1-x0)*(i+1)/n,za=sz*(zf(c,a)+dz),zb=sz*(zf(c,b)+dz);quad(B,k,[a,y0,za],[b,y0,zb],[b,y1,zb],[a,y1,za],col,[0,0,sz]);}}
function fq2(B,c,k,x0,x1,y0,y1,sz,col,dz){fq(B,c,k,x0,x1,y0,y1,sz,col,dz);fq(B,c,k,-x1,-x0,y0,y1,sz,col,dz);}
function xAt(c,t,y){const p=sec(c,t).pts;for(let k=1;k<p.length-1;k++){const a=p[k],b=p[k+1];if(y>=a[1]&&y<=b[1]){const f=b[1]-a[1]>1e-6?(y-a[1])/(b[1]-a[1]):0;return a[0]+(b[0]-a[0])*f;}}return p[1][0];}
// side patch on both flanks following the body (t range, y range)
function sq(B,c,k,t0,t1,y0,y1,col,dx){dx=dx||.006;const n=Math.max(1,Math.ceil((t1-t0)*c.hl/.3));
  for(let i=0;i<n;i++){const ta=t0+(t1-t0)*i/n,tb=t0+(t1-t0)*(i+1)/n,za=ta*c.hl,zb=tb*c.hl;
    const ys=[y0];for(const q of sec(c,(ta+tb)/2).pts)if(q[1]>y0+.01&&q[1]<y1-.01)ys.push(q[1]);ys.push(y1);ys.sort((a,b)=>a-b);
    for(let j=0;j<ys.length-1;j++){const ya=ys[j],yb=ys[j+1],xa0=xAt(c,ta,ya)+dx,xb0=xAt(c,tb,ya)+dx,xb1=xAt(c,tb,yb)+dx,xa1=xAt(c,ta,yb)+dx;
      for(const s of[1,-1])quad(B,k,[s*xa0,ya,za],[s*xb0,ya,zb],[s*xb1,yb,zb],[s*xa1,yb,za],col,[s,0,0]);}}}
// flat shape on both flanks given (t,y) corner list, x following the body
function sshape(B,c,k,pts,col,dx){const v=pts.map(q=>[xAt(c,q[0],q[1])+dx,q[1],q[0]*c.hl]);
  for(const s of[1,-1])quad(B,k,[s*v[0][0],v[0][1],v[0][2]],[s*v[1][0],v[1][1],v[1][2]],[s*v[2][0],v[2][1],v[2][2]],[s*v[3][0],v[3][1],v[3][2]],col,[s,0,0]);}
function chequer(B,c,t0,t1,y0,rows,size,c1,c2){const n=Math.floor((t1-t0)*c.hl/size),dt=size/c.hl;
  for(let r=0;r<rows;r++)for(let i=0;i<n;i++)sq(B,c,'liv',t0+i*dt,t0+(i+1)*dt,y0+r*size,y0+(r+1)*size,(i+r)%2?c1:c2,.008);}
const WHITE=hx(0xf4f5f6),RED=hx(0xc81e1e),BLUE=hx(0x1d3fb8),YEL=hx(0xf5c518),BLACK=hx(0x141516),AMB=hx(0xff8a10),LRED=hx(0xc41010),LWHT=hx(0xf2f6ff),LBLU=hx(0x2a55ff),LHEAD=hx(0xdde6f0);

function buildCar(style,o){
  const d=DEF[style],B=Bk(),c={d,hl:o.hl,W2:o.hw-.01,lo:o.lo,bw:.045/o.hl,win:d.win.slice()};
  if(o.win)for(const r of o.win)c.win.push(r);
  if(o.liv==='pb'){c.roofK='liv';CUR=WHITE;}
  loft(B,c);
  const W=c.W2,lo=o.lo,yT=lerpT(d.top,1),yR=lerpT(d.top,-1),sl=d.sill;
  const fy=u=>sl+(yT-sl)*u,ry=u=>sl+(yR-sl)*u;
  /* front */
  if(d.front==='van'){
    fq(B,c,'trim',-.94*W,.94*W,sl,sl+.24,1);fq(B,c,'trim',-.48*W,.48*W,.6,.84,1);
    for(const y of lo?[.68,.76]:[.64,.70,.76,.82])fq(B,c,'chrome',-.44*W,.44*W,y,y+.018,1,null,.02);
    fq2(B,c,'trim',.55*W,.94*W,.80,.93,1);fq2(B,c,'lamp',.58*W,.86*W,.82,.91,1,LHEAD,.02);fq2(B,c,'lamp',.87*W,.93*W,.82,.91,1,AMB,.02);
    fq(B,c,'liv',-.27,.27,sl+.05,sl+.18,1,WHITE,.03);
  }else{
    fq(B,c,'trim',-.92*W,.92*W,sl,fy(d.front==='suv'?.32:.26),1);
    if(d.front==='slim'){fq(B,c,'trim',-.42*W,.42*W,fy(.4),fy(.7),1);if(!lo)for(const u of[.5,.6])fq(B,c,'chrome',-.4*W,.4*W,fy(u),fy(u)+.012,1,null,.02);
      fq2(B,c,'trim',.48*W,.93*W,fy(.78),fy(.97),1);fq2(B,c,'lamp',.52*W,.9*W,fy(.8),fy(.92),1,LHEAD,.02);fq2(B,c,'lamp',.46*W,.93*W,fy(.935),fy(.975),1,LWHT,.022);
      if(d.ledbar)fq(B,c,'lamp',-.48*W,.48*W,fy(.95),fy(.97),1,LWHT,.02);}
    else if(d.front==='big'){fq(B,c,'trim',-.56*W,.56*W,fy(.1),fy(.8),1);fq(B,c,'chrome',-.86*W,.86*W,fy(.82),fy(.86),1,null,.02);
      if(!lo)for(const u of[.3,.5])fq(B,c,'chrome',-.52*W,.52*W,fy(u),fy(u)+.01,1,null,.02);
      fq2(B,c,'trim',.6*W,.95*W,fy(.8),fy(.98),1);fq2(B,c,'lamp',.63*W,.92*W,fy(.84),fy(.94),1,LHEAD,.02);fq2(B,c,'lamp',.6*W,.94*W,fy(.95),fy(.98),1,LWHT,.022);}
    else{fq(B,c,'chrome',-.42*W,.42*W,sl+.02,sl+.08,1,null,.02);fq(B,c,'trim',-.52*W,.52*W,fy(.45),fy(.8),1);
      fq2(B,c,'lamp',.42*W,.95*W,fy(.9),fy(.95),1,LWHT,.02);fq2(B,c,'trim',.58*W,.9*W,fy(.5),fy(.74),1);fq2(B,c,'lamp',.61*W,.87*W,fy(.53),fy(.7),1,LHEAD,.02);}
    fq(B,c,'liv',-.26,.26,sl+.03,sl+.15,1,WHITE,.03);
  }
  /* rear */
  if(d.rear==='van'){
    fq(B,c,'trim',-.94*W,.94*W,sl,sl+.2,-1);fq(B,c,'liv',-.26,.26,sl+.26,sl+.38,-1,WHITE,.02);
    fq2(B,c,'lamp',.86*W,.97*W,.72,1.05,-1,LRED,.02);fq2(B,c,'lamp',.86*W,.97*W,1.05,1.12,-1,AMB,.02);
    const zb=-o.hl-.012;zq(B,'trim',-.008,.008,sl+.25,d.roof-.15,zb-.002,-1);
    for(const s of[1,-1])zq(B,'glass',Math.min(s*.1,s*.72*W),Math.max(s*.1,s*.72*W),1.45,2.0,zb,-1);
  }else{
    fq(B,c,'trim',-.92*W,.92*W,sl,ry(.3),-1);fq(B,c,'liv',-.26,.26,ry(.45),ry(.62),-1,WHITE,.015);
    fq2(B,c,'trim',.53*W,.96*W,ry(.76),ry(.98),-1);fq2(B,c,'lamp',.56*W,.94*W,ry(.79),ry(.95),-1,LRED,.02);
    fq2(B,c,'lamp',.86*W,.94*W,ry(.8),ry(.86),-1,AMB,.024);
    if(d.rear==='bar')fq(B,c,'lamp',-.56*W,.56*W,ry(.86),ry(.9),-1,LRED,.02);else fq(B,c,'chrome',-.5*W,.5*W,ry(.84),ry(.88),-1,null,.02);
    fq2(B,c,'lamp',.7*W,.8*W,sl+.08,sl+.12,-1,LRED,.02);
  }
  /* sides: door gaps, handles, mirrors */
  const s0=sec(c,0),yb0=s0.yb,y4=s0.pts[4][1],gw=.006/o.hl;
  const doors=d.van?[.43,.78,-.05]:[d.ws-.02,d.bp,d.rd];
  for(const t of doors){const s=sec(c,t);sq(B,c,'trim',t-gw,t+gw,s.yb+.06,s.top-.03,null,.004);}
  if(!lo){for(const t of d.van?[.5]:[d.bp+(d.ws-d.bp)*.22,d.rd+(d.bp-d.rd)*.22]){const x=xAt(c,t,y4-.04)+.012;for(const s of[1,-1])bx(B,'chrome',s*x,y4-.04,t*o.hl,.025,.035,.14);}}
  {const t=d.ws-.03,s=sec(c,t),x=s.w*d.gx0,y=s.top+.1,z=t*o.hl;for(const sg of[1,-1]){bx(B,'trim',sg*(x+.05),y-.04,z,.1,.03,.06);bx(B,'paint',sg*(x+.14),y,z-.02,.15,.12,.09);}}
  const roofMid=(d.rf+d.rr)/2,ry0=roofY(d,roofMid);
  if(d.rails)for(const s of[1,-1])bx(B,'trim',s*W*d.gx1*.86,ry0+.04,roofMid*o.hl,.04,.05,(d.rf-d.rr)*o.hl*.9);
  if(!d.van)bx(B,'trim',0,roofY(d,d.rr+.03)+.03,(d.rr+.05)*o.hl,.06,.06,.14);
  /* liveries */
  const zb=(d.rf*.6+d.rr*.4)*o.hl;
  if(o.liv==='pw'||o.liv==='pb'){
    const yc=(s0.pts[3][1]+s0.pts[4][1])/2,sz=lo?.13:.09;
    if(o.liv==='pb'){sq(B,c,'liv',d.rd-.02,d.ws-.04,s0.pts[3][1],s0.pts[5][1],WHITE,.007);chequer(B,c,d.rd,d.ws-.05,s0.pts[5][1]-sz-.01,1,sz,BLACK,WHITE);}
    else{chequer(B,c,d.rd-.06,d.ws-.03,yc-sz,2,sz,BLUE,WHITE);sq(B,c,'liv',-.97,.97,yb0+.04,yb0+.09,BLUE,.007);}
    bx(B,'trim',0,d.roof+.04,zb,W*1.1,.06,.3);bx(B,'lamp',W*.3,d.roof+.11,zb,W*.5,.1,.24,LRED);bx(B,'lamp',-W*.3,d.roof+.11,zb,W*.5,.1,.24,LBLU);bx(B,'chrome',0,d.roof+.11,zb,.1,.09,.2);
  }
  if(o.liv==='taxi'){bx(B,'trim',0,d.roof+.02,zb,.6,.04,.28);bx(B,'lamp',0,d.roof+.11,zb,.52,.15,.22,hx(0xffe39a));}
  if(o.liv==='amb'){
    chequer(B,c,-.97,.4,1.0,2,lo?.2:.15,RED,YEL);sq(B,c,'liv',-.98,.98,.86,.93,RED,.008);
    const zf0=(d.rf-.02)*o.hl,rt=d.roof;
    bx(B,'trim',0,rt+.03,zf0,W*1.2,.06,.3);bx(B,'lamp',W*.33,rt+.11,zf0,W*.55,.11,.24,LRED);bx(B,'lamp',-W*.33,rt+.11,zf0,W*.55,.11,.24,LBLU);bx(B,'chrome',0,rt+.11,zf0,.12,.1,.2);
    for(const s of[1,-1])bx(B,'lamp',s*W*.8,rt+.06,-o.hl+.15,.14,.1,.1,s>0?LRED:LBLU);
    // star of life on the box window: three bars at 0, 60 and 120 degrees
    const tc=-.27,yc=1.72,Lh=.2,Wh=.055;
    for(const a of[0,PI/3,2*PI/3]){const ca=Math.cos(a),sa=Math.sin(a),pz=(dz,dy)=>[tc+dz/o.hl,yc+dy];
      sshape(B,c,'liv',[pz(-Lh*ca+Wh*sa,-Lh*sa-Wh*ca),pz(Lh*ca+Wh*sa,Lh*sa-Wh*ca),pz(Lh*ca-Wh*sa,Lh*sa+Wh*ca),pz(-Lh*ca-Wh*sa,-Lh*sa+Wh*ca)],hx(0x1e5bd8),.014+a*.002);}
  }
  if(o.roof==='ski'||o.roof==='box'){const zr=(d.rf+d.rr)/2*o.hl,yr=ry0;
    for(const dz of[-.6,.6])bx(B,'trim',0,yr+.05,zr+dz,W*1.25,.04,.05);
    if(o.roof==='box')bx(B,'trim',0,yr+.25,zr,W*1.05,.34,1.9);
    else{const cs=[hx(0xc22b2b),hx(0x2860c0),hx(0xc22b2b)];[-.25,0,.25].forEach((x,i)=>bx(B,'liv',x,yr+.1,zr,.09,.04,1.9,cs[i]));}}
  const wh=[];const R=d.r;for(const s of[1,-1])for(const t of[d.axle,-d.axle])wh.push([s*(W-.12),R,t*o.hl,R,.22]);
  return{B,wh,kind:style+(o.liv?'-'+o.liv:'')};
}

/* ================= TRUCKS ================= */
// wheels: front single, rear axles dual (or wide single)
function axleW(wh,w,z,r,mode){for(const s of[1,-1]){if(mode==='dual'){wh.push([s*(w-.17),r,z,r,.26]);wh.push([s*(w-.47),r,z,r,.26]);}else if(mode==='wide')wh.push([s*(w-.24),r,z,r,.38]);else wh.push([s*(w-.2),r,z,r,.3]);}}
function chassis(B,o,w,k,zf,zr,y){bxr(B,'trim',-.5,-.3,y-.12,y+.12,zr,zf);bxr(B,'trim',.3,.5,y-.12,y+.12,zr,zf);}
// Indian cab: tall, flat front, painted crown, chrome grille; returns cab back z
function indCab(B,o,r,P){
  const W=2*o.hw-.04,w=W/2,k=o.light?.82:1,L=o.light?1.55:1.95,z1=o.hl-.14,z0=z1-L,lo=o.lo;
  const Cm=P.cm,Ca=P.ca,Cs=RED;
  bxr(B,'liv',-w,w,1.0*k,1.85*k,z0,z1,Cm);
  bxr(B,'liv',-w+.02,w-.02,1.85*k,2.55*k,z0,z1-.08,Ca);
  bxr(B,'liv',-w-.01,w+.01,2.55*k,2.92*k,z0,z1+.05,Cm);
  // crown pattern and the painted V between the windscreen panes
  const n=lo?6:10;for(let i=0;i<n;i++)zq(B,'liv',-w+i*W/n,-w+(i+1)*W/n,2.62*k,2.74*k,z1+.056,1,i%2?Ca:Cs);
  if(!lo)zq(B,'liv',-w,w,2.8*k,2.84*k,z1+.056,1,YEL);
  const zw=z1-.08+.008;for(const s of[1,-1])zq(B,'glass',s>0?.05:-w+.12,s>0?w-.12:-.05,1.92*k,2.48*k,zw,1);
  tri(B,'liv',[-.15,2.5*k,zw+.004],[0,2.26*k,zw+.004],[.15,2.5*k,zw+.004],hx(0xe8701a));
  xq2(B,'glass',w-.02+.008,z1-.85,z1-.22,1.95*k,2.45*k);
  // grille, bands, lamps, bumper, plate
  zq(B,'trim',-w*.55,w*.55,1.15*k,1.72*k,z1+.008,1);
  for(let i=0;i<(lo?3:5);i++)bx(B,'chrome',0,(1.2+i*.12)*k,z1+.025,W*.54,.035,.03);
  zq(B,'liv',-w,w,1.76*k,1.84*k,z1+.006,1,Ca);zq(B,'liv',-w,w,1.04*k,1.09*k,z1+.006,1,Cs);
  for(const s of[1,-1]){bx(B,'trim',s*(w-.27),1.4*k,z1+.02,.32,.25,.04);bx(B,'lamp',s*(w-.27),1.4*k,z1+.035,.25,.18,.03,LHEAD);bx(B,'lamp',s*(w-.27),1.62*k,z1+.02,.2,.07,.03,AMB);}
  bxr(B,'liv',-w-.02,w+.02,.62*k,.92*k,o.hl-.24,o.hl,hx(0x26272a));zq(B,'liv',-.28,.28,.69*k,.84*k,o.hl+.006,1,WHITE);
  for(const s of[1,-1])zq(B,'liv',s>0?w-.5:-w+.02,s>0?w-.02:-w+.5,.66*k,.72*k,o.hl+.006,1,YEL);
  // mirrors, steps, door gap, handle
  for(const s of[1,-1]){bx(B,'trim',s*(w+.06),2.2*k,z1-.15,.14,.03,.03);bx(B,'trim',s*(w+.12),2.15*k,z1-.15,.05,.36,.15);
    bx(B,'trim',s*(w-.05),.8*k,z1-.6,.12,.06,.5);if(!lo)bx(B,'chrome',s*(w+.008),1.62*k,z1-.75,.02,.03,.14);}
  xq2(B,'trim',w+.006,z1-.95,z1-.93,1.02*k,2.5*k);
  return z0;}
// European cab-over; small = box-truck cab
function euCab(B,o,r,P,small){
  const W=2*o.hw-.04,w=W/2,L=small?1.8:2.25,z1=o.hl-.08,z0=z1-L,H=small?2.75:3.3,lo=o.lo,Cc=P.cc;
  bxr(B,'liv',-w,w,1.0,H,z0,z1,Cc);
  if(!small){const a=w-.08,zf=z1-.45,zb=z0+.12,Ht=H+.55;
    quad(B,'liv',[-a,H,zf],[a,H,zf],[a,Ht,zb],[-a,Ht,zb],Cc,[0,1,.4]);
    for(const s of[1,-1])tri(B,'liv',[s*a,H,zf],[s*a,H,zb],[s*a,Ht,zb],Cc),tri(B,'liv',[s*a,H,zb],[s*a,H,zf],[s*a,Ht,zb],Cc);
    zq(B,'liv',-a,a,H,Ht,zb,-1,Cc);}
  zq(B,'trim',-w+.06,w-.06,H-1.25,H-.16,z1+.006,1);zq(B,'glass',-w+.13,w-.13,H-1.18,H-.24,z1+.012,1);
  bx(B,'trim',0,H-.08,z1+.1,W-.12,.07,.3);
  const g0=small?1.15:1.25,g1=H-1.35;zq(B,'trim',-w+.3,w-.3,g0,g1,z1+.006,1);
  for(let i=0;i<(lo?3:5);i++){const y=g0+.08+i*(g1-g0-.12)/((lo?3:5)-1);bx(B,P.bars,0,y,z1+.025,W-.7,.05,.04,P.bars==='liv'?Cc:null);}
  bxr(B,'liv',-w-.01,w+.01,.52,1.02,z1-.22,z1+.08,hx(0x2f3236));
  for(const s of[1,-1]){bx(B,'lamp',s*(w-.32),.86,z1+.085,.36,.15,.03,LHEAD);bx(B,'lamp',s*(w-.08),.86,z1+.085,.1,.12,.03,AMB);bx(B,'lamp',s*(w-.2),H+.03,z1-.12,.12,.05,.06,AMB);}
  zq(B,'liv',-.26,.26,.6,.73,z1+.086,1,WHITE);
  xq2(B,'glass',w+.006,z1-.95,z1-.2,H-1.1,H-.3);xq2(B,'trim',w+.006,z1-1.05,z1-1.03,1.0,H-.2);
  for(const s of[1,-1]){bx(B,'trim',s*(w+.06),H-.75,z1-.15,.14,.03,.03);bx(B,'trim',s*(w+.12),H-.8,z1-.15,.05,.5,.18);
    bx(B,'trim',s*(w-.05),.58,z1-.6,.12,.06,.5);bx(B,'trim',s*(w-.05),.82,z1-.6,.12,.06,.5);if(!lo)bx(B,'chrome',s*(w+.008),H-1.2,z1-.85,.02,.03,.16);}
  return z0;}
// Indian cargo bodies: 'tarp', 'open' (red slats with sacks) or 'logs'
function indBody(B,o,r,P,zb1,load){
  const W=2*o.hw-.04,w=W/2,zb0=-o.hl+.06,len=zb1-zb0,zc=(zb0+zb1)/2,lo=o.lo,k=o.light?.82:1,F=1.25*k,Hh=o.light?.75:1.45,Cr=P.cr,Cd=hx(0x5e1014);
  bxr(B,'liv',-w,w,F-.14,F,zb0,zb1,hx(0x3a2a1e));
  if(load==='logs'){
    for(const z of[zb1-.4,zc,zb0+.4])for(const s of[1,-1])bx(B,'liv',s*(w-.06),F+.85,z,.1,1.7,.12,hx(0x4a3424));
    xq2(B,'liv',w,zb0,zb1,F,F+.28,hx(0x5a3e28));
    const rows=[[.37,[-.78,0,.78]],[1.01,[-.39,.39]],[1.65,[0]]],bk=[hx(0x7a5638),hx(0x6a4a30),hx(0x8b6a45),hx(0x5e4430)],seg=lo?6:8;
    for(const row of rows)for(const x0 of row[1]){const x=x0*(w/1.2),rl=len-.2-r()*.4,z=zc+(r()-.5)*.3;cyz(B,'liv',seg,x,F+row[0],z,.36,rl,pick(r,bk));
      if(!lo)for(const sz of[1,-1])addG(B,'liv',pg('CircleGeometry',[1,seg]),x,F+row[0],z+sz*(rl/2+.005),.33,.33,1,0,sz>0?0:PI,0,hx(0xd9bd88));}
    return;}
  for(const s of[1,-1])bxr(B,'liv',s>0?w-.06:-w,s>0?w:-w+.06,F,F+Hh,zb0,zb1,Cr);
  bxr(B,'liv',-w,w,F,F+Hh+.25,zb1-.06,zb1,Cr);bxr(B,'liv',-w,w,F,F+Hh,zb0,zb0+.06,Cr);
  const nl=lo?2:4;for(let i=1;i<=nl;i++){const y=F+Hh*i/(nl+1);xq2(B,'liv',w+.006,zb0,zb1,y,y+.035,Cd);zq(B,'liv',-w,w,y,y+.035,zb0-.006,-1,Cd);}
  const step=lo?2.4:1.2;for(let z=zb0+.05;z<=zb1;z+=step)for(const s of[1,-1])bx(B,'liv',s*(w+.02),F+Hh/2,z,.05,Hh,.07,Cd);
  for(const s of[1,-1])bx(B,'liv',s*(w-.03),F+Hh+.02,zc,.09,.07,len,YEL);
  if(load==='tarp'){const Ht=o.light?.45:.6,Ct=P.ct,seg=lo?6:10;
    addG(B,'liv',pg('CylinderGeometry',[1,1,1,seg,1,true,PI/2,PI]),0,F+Hh,zc,w+.02,len-.02,Ht,PI/2,0,0,Ct);
    for(const sz of[1,-1])addG(B,'liv',pg('CircleGeometry',[1,seg,0,PI]),0,F+Hh,zc+sz*(len/2-.01),w+.02,Ht,1,0,sz>0?0:PI,0,Ct);
    xq2(B,'liv',w+.03,zb0,zb1,F+Hh-.3,F+Hh+.01,Ct);
    if(!lo)for(let z=zb0+.6;z<zb1-.3;z+=1.5)xq2(B,'liv',w+.035,z,z+.04,F+Hh-.3,F+Hh,hx(0x3a3020));}
  else{bxr(B,'liv',-w+.08,w-.08,F,F+Hh-.12,zb0+.1,zb1-.1,hx(0xcdbf98));
    if(!lo){const sc=[hx(0xe3dccb),hx(0xcbb98e),hx(0xd8cfb4)];for(let i=0;i<6;i++)ell(B,'liv',5,(i%3-1)*w*.55,F+Hh-.02,zc+((i/3|0)-.5)*Math.min(1.8,len*.4),w*.3,.18,.5,pick(r,sc),(i%2)*.4);}}}
function rearEnd(B,o,y){const w=o.hw-.02;bx(B,'trim',0,y,-o.hl+.12,2*w-.2,.12,.1);
  for(const s of[1,-1]){bx(B,'lamp',s*(w-.3),y+.15,-o.hl+.06,.3,.12,.04,LRED);bx(B,'lamp',s*(w-.1),y+.15,-o.hl+.06,.1,.12,.04,AMB);}}
function fuelTank(B,o,z,y){const w=o.hw-.02;cyz(B,'chrome',o.lo?6:10,w-.42,y,z,.25,1.0);}

function buildIndian(o,r,P,load,axles){
  const B=Bk(),w=o.hw-.02,k=o.light?.82:1;
  const z0=indCab(B,o,r,P);chassis(B,o,w,k,o.hl-.3,-o.hl+.3,.82*k);
  indBody(B,o,r,P,z0-.1,load);fuelTank(B,o,z0-.9,.78*k);rearEnd(B,o,.75*k);
  const wh=[],rf=o.light?.42:.5;axleW(wh,w,o.hl-(o.light?1.1:1.2),rf,'single');for(const z of axles)axleW(wh,w,z,rf,'dual');
  for(const z of axles.slice(-1))for(const s of[1,-1])bx(B,'trim',s*(w-.32),.45*k,z-rf-.12,.5,.6,.04);
  return{B,wh};}
function buildEuro(o,r,P,trailer,small,axles){
  const B=Bk(),w=o.hw-.02,W=2*w,lo=o.lo;
  const z0=euCab(B,o,r,P,small);chassis(B,o,w,1,o.hl-.4,-o.hl+.4,.82);
  const zt1=z0-(small?.08:.35),zt0=-o.hl+.05,len=zt1-zt0,zc=(zt0+zt1)/2,F=small?1.05:1.15,Y=small?3.2:3.85,Ct=P.ct;
  bxr(B,'trim',-w+.05,w-.05,F-.2,F,zt0,zt1);bxr(B,'liv',-w,w,F,Y,zt0,zt1,Ct);
  for(const yy of[F+.05,Y-.05])for(const s of[1,-1])bx(B,'chrome',s*(w+.02),yy,zc,.04,.1,len);
  if(trailer==='curtain'){const st=lo?1.4:.7,cd=hx(0x2e3338);for(let z=zt0+.3;z<zt1-.1;z+=st)xq2(B,'liv',w+.008,z,z+.05,F+.1,Y-.1,cd);}
  else{const st=lo?2.0:1.0,cd=[Ct[0]*.82,Ct[1]*.82,Ct[2]*.82];for(let z=zt0+.5;z<zt1-.1;z+=st)for(const s of[1,-1])bx(B,'liv',s*(w+.012),(F+Y)/2,z,.025,Y-F-.12,.06,cd);}
  zq(B,'trim',-.012,.012,F+.1,Y-.1,zt0-.006,-1);if(!lo)for(const y of[F+.5,(F+Y)/2,Y-.5])for(const s of[1,-1])zq(B,'chrome',s>0?.2:-.6,s>0?.6:-.2,y,y+.05,zt0-.008,-1);
  if(!small){for(const s of[1,-1]){bx(B,'trim',s*(w-.06),.7,zc+len*.12,.05,.12,len*.35);bx(B,'trim',s*.7,.75,zt1-1.4,.08,.6,.08);}}
  fuelTank(B,o,z0-.6,.75);rearEnd(B,o,.72);
  const wh=[];axleW(wh,w,o.hl-(small?1.0:1.2),.5,'single');axles.forEach((a,i)=>axleW(wh,w,a,.5,i===0&&!small?'dual':small?'dual':'wide'));
  return{B,wh};}

/* ================= kinds ================= */
const PAL=[0xeef0f2,0xeef0f2,0xb9bec5,0xb9bec5,0x121315,0x5d6268,0xa3141c,0x5a1220,0x1b2a4a];
const IND_CAB=[[0x2f9a3a,0xf2f0e6],[0xe0a020,0xf2f0e6],[0xd8601c,0xf5d020],[0x2a64b8,0xf2f0e6],[0xc22a2a,0xf5d020],[0x18a0a0,0xf2f0e6]];
const IND_BODY=[0xa8202a,0xa8202a,0x2a5aa8,0x3f7a34],TARP=[0xb08a3a,0xd8d2c0,0x2c5a9a,0x8a6a3a];
const EU_CAB=[0x1f4fae,0xf2c200,0xf2f3f4,0xb31d23,0x1f5a54],EU_BOX=[0xeef0f2,0xc8ccd2,0xf2c200,0x1f4fae],EU_CURT=[0x6f7d6e,0x8a96a3,0x2f4b3c,0xb8bcc0];
function car(kit,r,o){
  const lo=!!kit.TOUCH,style=o.style,paint=o.paint,hub=o.hub!==undefined?o.hub:(r()<.55?0x2a2d32:0xc9ced6);
  const key=['car',style,o.liv||'',o.roof||'',o.win?o.win.join(':'):'',o.hw,o.hl,lo].join('|');
  const G=cached(key,()=>buildCar(style,{hw:o.hw,hl:o.hl,lo,liv:o.liv,roof:o.roof,win:o.win}));
  return assemble(kit,G,paint,hub,o.hw,o.hl);}
function sedanLike(kit,r,hw,hl,style){return car(kit,r,{style,paint:PAL[(r()*PAL.length)|0],hw,hl});}
function police(kit,r,hw,hl){const b=r()<.5;return car(kit,r,{style:'sedan',liv:b?'pb':'pw',paint:b?0x131416:0xf2f3f4,hub:0xc9ced6,hw,hl});}
function van(kit,r,hw,hl,amb){
  if(amb)return car(kit,r,{style:'van',liv:'amb',paint:0xf4f5f6,hub:0xc9ced6,win:[[-.45,-.08]],hw,hl});
  const pas=r()<.5;return car(kit,r,{style:'van',paint:pick(r,[0xf4f5f6,0xf4f5f6,0xb9bec5,0x5d6268,0x1b2a4a]),hub:0xc9ced6,win:pas?[[-.86,-.1],[.0,.36]]:null,hw,hl});}
function indian(kit,r,hw,hl,load,axles,light,mud){
  const lo=!!kit.TOUCH,ci=(r()*IND_CAB.length)|0,bi=(r()*IND_BODY.length)|0,ti=(r()*TARP.length)|0,seed=(r()*4)|0;
  const key=['ind',ci,bi,load==='tarp'?ti:0,load,load==='logs'||load==='open'?seed:0,hw,hl,axles.join(':'),!!light,mud||0,lo].join('|');
  const G=cached(key,()=>{MUD=mud||0;const P={cm:hx(IND_CAB[ci][0]),ca:hx(IND_CAB[ci][1]),cr:hx(IND_BODY[bi]),ct:hx(TARP[ti])};
    const g=buildIndian({hw,hl,lo,light},mulberry(seed*977+ci),P,load,axles);g.kind='indian-'+load;return g;});
  return assemble(kit,G,0xffffff,0x9aa0a8,hw,hl);}
function euro(kit,r,hw,hl,small){
  const lo=!!kit.TOUCH,ci=(r()*EU_CAB.length)|0,curt=!small&&r()<.45,ti=(r()*4)|0;
  const key=['eu',ci,curt,ti,small,hw,hl,lo].join('|');
  const G=cached(key,()=>{const cc=EU_CAB[ci],P={cc:hx(cc),bars:cc===0xf2c200?'liv':'chrome',ct:hx(small?(ti<2?0xf4f5f6:EU_BOX[ti]):curt?EU_CURT[ti]:(ti===2&&cc===0xf2c200?0xf2c200:EU_BOX[ti]))};
    const axles=small?[-hl+1.55]:[hl-3.4,-hl+2.25,-hl+1.0];const g=buildEuro({hw,hl,lo},mulberry(ci),P,curt?'curtain':'box',small,axles);g.kind=small?'boxtruck':'semi';return g;});
  return assemble(kit,G,0xffffff,0xc9ced6,hw,hl);}
// draw n values from the traffic rng (as the replaced model did) and seed a private generator from them
function sub(rng,n,extra){let h=2166136261>>>0,last=0;const eat=()=>{last=rng();h=Math.imul(h^Math.floor(last*4294967296),16777619)>>>0;h^=h>>>15;};
  for(let i=0;i<n;i++)eat();if(extra){const m=extra(last);for(let i=0;i<m;i++)eat();}return mulberry(h);}

/* per-map tables: [values the replaced model drew, hw, hl, builder] (hw/hl are the replaced model's exact values) */
const MAPS={
 highway:{
  sedan:[2,.93,2.3,(k,r,a,b)=>sedanLike(k,r,a,b,r()<.5?'sedan':'fastback')],
  hatch:[2,.89,1.975,(k,r,a,b)=>sedanLike(k,r,a,b,'hatch')],
  suv:[2,.98,2.35,(k,r,a,b)=>sedanLike(k,r,a,b,'csuv')],
  taxi:[2,.93,2.3,(k,r,a,b)=>car(k,r,{style:'sedan',liv:'taxi',paint:0xf2b705,hub:0xc9ced6,hw:a,hl:b})],
  police:[2,.93,2.3,police],
  van:[2,1.0,2.6,(k,r,a,b)=>van(k,r,a,b,r()<.6)],
  delivery:[2,1.25,3.7,(k,r,a,b)=>r()<.5?euro(k,r,a,b,true):indian(k,r,a,b,r()<.5?'tarp':'open',[-b+1.5])],
  container:[2,1.3,6.2,(k,r,a,b)=>r()<.6?euro(k,r,a,b,false):indian(k,r,a,b,r()<.55?'tarp':'open',[-b+2.55,-b+1.3])]},
 mountain:{
  hatch:[1,.9,1.98,(k,r,a,b)=>sedanLike(k,r,a,b,r()<.5?'hatch':'csuv')],
  skicar:[2,.95,2.3,(k,r,a,b)=>r()<1/6?police(k,r,a,b):car(k,r,{style:pick(r,['sedan','fastback','csuv']),paint:PAL[(r()*PAL.length)|0],roof:r()<.5?'ski':'box',hw:a,hl:b})]},
 jungle:{
  logger:[19,1.25,5.5,(k,r,a,b)=>{const u=r();return indian(k,r,a,b,u<.6?'logs':u<.8?'tarp':'open',[-1.7,-3.2],false,.22);}],
  cart:[28,1.0,3.0,(k,r,a,b)=>indian(k,r,a,b,r()<.5?'tarp':'open',[-1.75],true,.22),last=>((last*3)|0)===1?6:0]},
 builtin:{
  car:[1,.92,2.2,(k,r,a,b)=>sedanLike(k,r,a,b,pick(r,['sedan','fastback','hatch']))],
  van:[1,.98,2.5,(k,r,a,b)=>van(k,r,a,b,r()<.4)],
  jeep:[1,.95,2.0,(k,r,a,b)=>sedanLike(k,r,a,b,'csuv')],
  truck:[1,1.3,5.8,(k,r,a,b)=>euro(k,r,a,b,false)]}
};
// rare ambulance in place of an Alpine camper: draws the camper's one value and hands it back if it stays a camper
function camper(kind,rng,kit){const u=rng(),r=mulberry(Math.floor(u*4294967296)^0x5bd1e995);
  if(r()<.3)return van(kit,r,1.08,2.8,true);let used=false;return{rng:()=>{if(!used){used=true;return u;}return rng();}};}

window.ApexVehicles={
  version:1,ok(){return true;},
  /* map: 'highway' | 'mountain' | 'jungle' | 'builtin'. Returns {obj,hw,hl}, or {rng} (use it in place of rng for the
     map's own model), or null without drawing anything when the kind is not replaced. */
  map(map,kind,rng,kit){
    if(map==='mountain'&&kind==='camper')return camper(kind,rng,kit);
    const e=MAPS[map]&&MAPS[map][kind];if(!e)return null;
    return e[3](kit,sub(rng,e[0],e[4]),e[1],e[2]);},
  get stats(){return STATS;}
};
})();
