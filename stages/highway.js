/* Skyline Highway map module (stages/highway.js).
   Visual upgrade only: road texture and road paint, terrain colour and far hills, city skyline, suburbs, industry,
   wind turbines, power pylons, sound barriers, billboards, tree variety, clouds, sky, a richer traffic fleet and a few
   road-works obstacles. Nothing here changes road width, lane layout, physics or the collision size of the existing kinds.
   Everything that builds geometry is a pure function of fixed seeds (kit.mulberry(n)) or of the rng handed in by the
   game, so every player builds the identical world. */
(function(){
if(!window.ApexKit)return;

/* ---------- small shared helpers ---------- */
const LANES=[-5.4,-1.8,1.8,5.4];
const hex2rgb=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function pick(rng,a){return a[(rng()*a.length)|0];}
/* tileable value noise (0..1); px,py = period in cells */
function tnoise(kit,x,y,px,py,s){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),h=kit.hash2;
  const x0=((ix%px)+px)%px,x1=(x0+1)%px,y0=((iy%py)+py)%py,y1=(y0+1)%py;
  return kit.lerp(kit.lerp(h(x0,y0,s),h(x1,y0,s),u),kit.lerp(h(x0,y1,s),h(x1,y1,s),u),v);
}

/* ---------- baker: collects triangles into one BufferGeometry (position, normal, optional uv and colour) ---------- */
function mkB(uv,col){return{p:[],n:[],u:uv?[]:null,c:col?[]:null,tris:0};}
function pushV(b,P,nx,ny,nz,uv,col){b.p.push(P[0],P[1],P[2]);b.n.push(nx,ny,nz);if(b.u)b.u.push(uv?uv[0]:0,uv?uv[1]:0);if(b.c){const c=col||[1,1,1];b.c.push(c[0],c[1],c[2]);}}
function tri(b,A,B,C,ua,ub,uc,col){
  const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz);if(l<1e-9)return;nx/=l;ny/=l;nz/=l;
  pushV(b,A,nx,ny,nz,ua,col);pushV(b,B,nx,ny,nz,ub,col);pushV(b,C,nx,ny,nz,uc,col);b.tris++;
}
function quad(b,A,B,C,D,uvs,col){uvs=uvs||[];tri(b,A,B,C,uvs[0],uvs[1],uvs[2],col);tri(b,A,C,D,uvs[0],uvs[2],uvs[3],col);}
function toGeo(b,THREE){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(b.p),3));
  g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(b.n),3));
  if(b.u)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(b.u),2));
  if(b.c)g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(b.c),3));
  g.computeBoundingSphere();g.computeBoundingBox();return g;
}
/* axis-aligned (yawed) box. y0 = base, h = height. o.bld = {tw,th,uo,vo}: facade uv in metres per texture tile;
   o.plain = [u,v] constant uv; o.top = false to skip the roof; o.front = [u0,v0,u1,v1] atlas rectangle for the +z face */
function boxB(b,cx,y0,cz,sx,h,sz,yaw,col,o){
  o=o||{};const cs=Math.cos(yaw),sn=Math.sin(yaw),hx=sx/2,hz=sz/2,y1=y0+h;
  const P=(lx,lz,y)=>[cx+lx*cs+lz*sn,y,cz-lx*sn+lz*cs];
  const pl=o.plain||[.01,.99];
  const faceUV=(wd,face)=>{
    if(o.bld){const u0=o.bld.uo||0,u1=u0+wd/o.bld.tw,v0=o.bld.vo||0,v1=v0+h/o.bld.th;return[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];}
    if(o.front&&face===0){const f=o.front;return[[f[0],f[1]],[f[2],f[1]],[f[2],f[3]],[f[0],f[3]]];}
    return[pl,pl,pl,pl];
  };
  quad(b,P(-hx,hz,y0),P(hx,hz,y0),P(hx,hz,y1),P(-hx,hz,y1),faceUV(sx,0),col);
  quad(b,P(hx,-hz,y0),P(-hx,-hz,y0),P(-hx,-hz,y1),P(hx,-hz,y1),faceUV(sx,1),col);
  quad(b,P(hx,hz,y0),P(hx,-hz,y0),P(hx,-hz,y1),P(hx,hz,y1),faceUV(sz,2),col);
  quad(b,P(-hx,-hz,y0),P(-hx,hz,y0),P(-hx,hz,y1),P(-hx,-hz,y1),faceUV(sz,3),col);
  if(o.top!==false)quad(b,P(-hx,-hz,y1),P(-hx,hz,y1),P(hx,hz,y1),P(hx,-hz,y1),[pl,pl,pl,pl],o.topCol||col);
}
/* vertical cylinder (frustum) with smooth side normals; axis = y */
function cylB(b,cx,y0,cz,r0,r1,h,seg,col,o){
  o=o||{};const pl=o.plain||[.01,.99],y1=y0+h;
  for(let i=0;i<seg;i++){
    const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const A=[cx+c0*r0,y0,cz+s0*r0],B=[cx+c1*r0,y0,cz+s1*r0],C=[cx+c1*r1,y1,cz+s1*r1],D=[cx+c0*r1,y1,cz+s0*r1];
    const slope=(r0-r1)/h;
    const u0=o.bld?(i/seg)*(Math.PI*2*r0)/o.bld.tw+(o.bld.uo||0):pl[0],u1=o.bld?((i+1)/seg)*(Math.PI*2*r0)/o.bld.tw+(o.bld.uo||0):pl[0];
    const v1=o.bld?(o.bld.vo||0)+h/o.bld.th:pl[1],v0=o.bld?(o.bld.vo||0):pl[1];
    // outward-facing winding: A,D,C,B seen from outside is clockwise in x/z so use B,A,D,C
    const n0=[c0,slope,s0],n1=[c1,slope,s1];
    const ln0=Math.hypot(n0[0],n0[1],n0[2]),ln1=Math.hypot(n1[0],n1[1],n1[2]);
    pushV(b,B,n1[0]/ln1,n1[1]/ln1,n1[2]/ln1,[u1,v0],col);pushV(b,A,n0[0]/ln0,n0[1]/ln0,n0[2]/ln0,[u0,v0],col);pushV(b,D,n0[0]/ln0,n0[1]/ln0,n0[2]/ln0,[u0,v1],col);
    pushV(b,B,n1[0]/ln1,n1[1]/ln1,n1[2]/ln1,[u1,v0],col);pushV(b,D,n0[0]/ln0,n0[1]/ln0,n0[2]/ln0,[u0,v1],col);pushV(b,C,n1[0]/ln1,n1[1]/ln1,n1[2]/ln1,[u1,v1],col);b.tris+=2;
    if(o.cap!==false&&r1>0){const T=[cx,y1,cz],t0=[cx+c0*r1,y1,cz+s0*r1],t1=[cx+c1*r1,y1,cz+s1*r1];tri(b,T,t1,t0,pl,pl,pl,o.capCol||col);}
  }
}
/* thin oriented bar from A to B (pylons, cranes, masts) */
function rodB(b,A,B,t,col,pl){
  pl=pl||[.01,.99];
  let dx=B[0]-A[0],dy=B[1]-A[1],dz=B[2]-A[2];const len=Math.hypot(dx,dy,dz);if(len<1e-6)return;dx/=len;dy/=len;dz/=len;
  let ux=0,uy=1,uz=0;if(Math.abs(dy)>.95){ux=1;uy=0;}
  let sx=dy*uz-dz*uy,sy=dz*ux-dx*uz,sz=dx*uy-dy*ux;let l=Math.hypot(sx,sy,sz);sx/=l;sy/=l;sz/=l;
  let tx=dy*sz-dz*sy,ty=dz*sx-dx*sz,tz=dx*sy-dy*sx;l=Math.hypot(tx,ty,tz);tx/=l;ty/=l;tz/=l;
  const h=t/2,V=(P,a,c)=>[P[0]+sx*h*a+tx*h*c,P[1]+sy*h*a+ty*h*c,P[2]+sz*h*a+tz*h*c];
  const a0=V(A,-1,-1),a1=V(A,1,-1),a2=V(A,1,1),a3=V(A,-1,1),b0=V(B,-1,-1),b1=V(B,1,-1),b2=V(B,1,1),b3=V(B,-1,1),u=[pl,pl,pl,pl];
  quad(b,a0,a1,b1,b0,u,col);quad(b,a1,a2,b2,b1,u,col);quad(b,a2,a3,b3,b2,u,col);quad(b,a3,a0,b0,b3,u,col);quad(b,a3,a2,a1,a0,u,col);quad(b,b0,b1,b2,b3,u,col);
}
/* house: walls + gable roof. ridge runs along local x */
function houseB(b,cx,y0,cz,sx,h,sz,yaw,wallCol,roofCol,rh,o){
  o=o||{};boxB(b,cx,y0,cz,sx,h,sz,yaw,wallCol,Object.assign({top:false},o));
  const cs=Math.cos(yaw),sn=Math.sin(yaw),hx=sx/2+.35,hz=sz/2+.35,y1=y0+h,y2=y1+rh,pl=(o.plain||[.01,.99]);
  const P=(lx,lz,y)=>[cx+lx*cs+lz*sn,y,cz-lx*sn+lz*cs],u=[pl,pl,pl,pl];
  quad(b,P(-hx,-hz,y1),P(-hx,0,y2),P(hx,0,y2),P(hx,-hz,y1),u,roofCol);
  quad(b,P(-hx,0,y2),P(-hx,hz,y1),P(hx,hz,y1),P(hx,0,y2),u,roofCol);
  tri(b,P(-hx+.35,hz-.35,y1),P(-hx+.35,0,y1+rh*.82),P(-hx+.35,-hz+.35,y1),pl,pl,pl,wallCol);
  tri(b,P(hx-.35,-hz+.35,y1),P(hx-.35,0,y1+rh*.82),P(hx-.35,hz-.35,y1),pl,pl,pl,wallCol);
}

/* ---------- road texture (tileable, 1024 desktop / 512 touch). u across the road, v along it (16 m per repeat) ---------- */
function makeRoadTexture(st,kit){
  const T=kit.TOUCH,W=T?512:1024,H=W,half=st.half,sx=W/(2*half),sy=H/16;
  const cv=mkCanvas(W,H),g=cv.getContext('2d'),rnd=kit.mulberry(2024);
  const U=lat=>(lat+half)*sx;                       // lateral metres -> px
  const wrap=fn=>{for(const dy of[0,-H,H])fn(dy);};
  // per-column wheel-track wear
  const wear=new Float32Array(W);
  for(let x=0;x<W;x++){const lat=(x+.5)/sx-half;let w=0;
    for(const c of LANES)for(const d of[-.8,.8]){const t=(lat-(c+d))/.36;w+=Math.exp(-t*t);}
    wear[x]=Math.min(w,1);}
  const img=g.createImageData(W,H),d=img.data;
  for(let y=0;y<H;y++){
    const fy=y/H;
    for(let x=0;x<W;x++){
      const lat=(x+.5)/sx-half;
      const b1=tnoise(kit,x/W*5,fy*5,5,5,3),b2=tnoise(kit,x/W*22,fy*22,22,22,9),b3=tnoise(kit,x/W*70,fy*70,70,70,21);
      let lum=1+(b1-.5)*.2+(b2-.5)*.13+(b3-.5)*.08;
      lum*=1-.17*wear[x]*(.65+.35*b2);
      const al=Math.abs(lat);if(al>7.0)lum*=1-.1*kit.sstep(7.0,7.6,al);
      let n=(rnd()-.5)*30;const r=rnd();if(r<.035)n+=34;else if(r<.07)n-=24;
      const i=(y*W+x)*4;
      d[i]=Math.max(0,Math.min(255,60*lum+n));d[i+1]=Math.max(0,Math.min(255,62*lum+n));d[i+2]=Math.max(0,Math.min(255,68*lum+n*1.02));d[i+3]=255;
    }
  }
  g.putImageData(img,0,0);
  // slab repairs (patches)
  for(let k=0;k<7;k++){
    const lane=LANES[(rnd()*4)|0],w=(1.1+rnd()*1.2)*sx,h=(2.5+rnd()*4)*sy,x0=U(lane+(rnd()-.5)*1.2)-w/2,y0=rnd()*H,dark=rnd()<.6;
    wrap(dy=>{g.fillStyle=dark?'rgba(30,31,36,.35)':'rgba(90,92,100,.16)';g.fillRect(x0,y0+dy,w,h);
      g.strokeStyle='rgba(12,12,14,.7)';g.lineWidth=1.4;g.strokeRect(x0,y0+dy,w,h);
      for(let i=0;i<w*h/90;i++){g.fillStyle=rnd()<.5?'rgba(120,122,130,.35)':'rgba(10,10,12,.3)';g.fillRect(x0+rnd()*w,y0+dy+rnd()*h,1.5,1.5);}});
  }
  // sealed longitudinal cracks (wavy, periodic)
  for(let k=0;k<7;k++){
    const x0=U(-7+rnd()*14),A=3+rnd()*5,ph=rnd()*6.28,fr=1+((rnd()*3)|0);
    g.strokeStyle='rgba(8,8,10,.55)';g.lineWidth=1.6;g.beginPath();
    for(let y=0;y<=H;y+=8){const x=x0+Math.sin(y/H*6.2832*fr+ph)*A;if(y===0)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();
  }
  // transverse and branching hairline cracks
  for(let k=0;k<26;k++){
    let x=U(-7+rnd()*14),y=rnd()*H;const n=4+((rnd()*6)|0),a0=rnd()*6.28;
    wrap(dy=>{g.strokeStyle='rgba(8,8,10,.5)';g.lineWidth=1;g.beginPath();let xx=x,yy=y+dy,a=a0;g.moveTo(xx,yy);
      for(let i=0;i<n;i++){a+=(rnd()-.5)*1.1;xx+=Math.cos(a)*(6+rnd()*14);yy+=Math.sin(a)*(6+rnd()*14);g.lineTo(xx,yy);}g.stroke();});
  }
  // oil drips on lane centres
  for(let k=0;k<22;k++){
    const lane=LANES[(rnd()*4)|0],cx=U(lane+(rnd()-.5)*.5),cy=rnd()*H,rx=(.1+rnd()*.22)*sx,ry=(.2+rnd()*.5)*sy;
    wrap(dy=>{g.save();g.translate(cx,cy+dy);g.scale(1,ry/rx);const gr=g.createRadialGradient(0,0,0,0,0,rx);
      gr.addColorStop(0,'rgba(6,6,9,.62)');gr.addColorStop(.6,'rgba(10,10,14,.32)');gr.addColorStop(1,'rgba(10,10,14,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,rx,0,6.2832);g.fill();g.restore();});
  }
  // expansion joint across the road (sealed), repeats every 16 m
  g.fillStyle='rgba(8,8,10,.6)';g.fillRect(0,H*.5-2,W,4);g.fillStyle='rgba(120,122,130,.22)';g.fillRect(0,H*.5+2,W,1.5);
  // rumble ticks just outside the edge lines
  for(const sd of[-1,1]){const xa=U(sd*7.43)-.5*sx*.12;for(let i=0;i<32;i++){g.fillStyle=i%2?'rgba(15,15,18,.35)':'rgba(130,130,135,.22)';g.fillRect(sd>0?U(7.38):U(-7.6),i*H/32,.22*sx,H/64+1);}}
  // paint: edge lines (solid) and lane dashes (4 m on, 12 m off), worn and with glass beads
  const paint=(x0,w,y0,h)=>{
    wrap(dy=>{
      g.fillStyle='rgba(0,0,0,.30)';g.fillRect(x0-1.5,y0+dy-1.5,w+3,h+3);
      g.fillStyle='#efeee8';g.fillRect(x0,y0+dy,w,h);
      const wn=w*h/60;for(let i=0;i<wn;i++){g.fillStyle='rgba(58,60,66,'+(.35+rnd()*.4)+')';g.fillRect(x0+rnd()*w,y0+dy+rnd()*h,1+rnd()*2.5,1+rnd()*3);}
      for(let i=0;i<wn*.6;i++){g.fillStyle='rgba(255,255,255,.9)';g.fillRect(x0+rnd()*w,y0+dy+rnd()*h,1,1);}
    });
  };
  const ew=.26*sx,dw=.24*sx;
  paint(U(-7.25)-ew/2,ew,0,H);paint(U(7.25)-ew/2,ew,0,H);
  for(const lx of[-3.6,0,3.6])paint(U(lx)-dw/2,dw,0,H/4);
  const t=new kit.THREE.CanvasTexture(cv);t.wrapS=t.wrapT=kit.THREE.RepeatWrapping;t.anisotropy=8;_roadTex=t;return t;
}
let _roadTex=null;
/* The game's ribbon() call for the road passes the texture length in the wrong argument slot, so the road uv.v is Infinity and
   the road shows one flat colour. Rebuild the road uv here (visual only, same mesh). */
function fixRoadUV(ctx){
  if(!_roadTex)return;const M=ctx.M,DS=ctx.DS,L=ctx.L,tl=L/Math.round(L/16);
  for(const o of ctx.grp.children){if(o.isMesh&&o.material&&o.material.map===_roadTex){const uv=o.geometry.attributes.uv;if(!uv||uv.count!==(M+1)*2)return;
    for(let j=0;j<=M;j++){const v=j*DS/tl;uv.array[j*4]=0;uv.array[j*4+1]=v;uv.array[j*4+2]=1;uv.array[j*4+3]=v;}uv.needsUpdate=true;return;}}
}

/* ---------- painted road arrows and speed numerals (decal quads laid on the road, alpha-tested) ---------- */
function makeMarkAtlas(kit){
  const cv=mkCanvas(256,256),g=cv.getContext('2d');
  g.clearRect(0,0,256,256);g.fillStyle='#f1f0ea';
  // cell A (0..128 x 0..256): straight arrow, tip at the top (far end)
  g.beginPath();g.moveTo(64,6);g.lineTo(112,84);g.lineTo(82,84);g.lineTo(82,250);g.lineTo(46,250);g.lineTo(46,84);g.lineTo(16,84);g.closePath();g.fill();
  // cell B (128..256 x 0..128): elongated "120"
  g.save();g.translate(128,0);g.fillStyle='#f1f0ea';g.font='bold 118px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('120',64,66,126);g.restore();
  // cell C (128..256 x 128..256): chevron band
  g.save();g.translate(128,128);g.strokeStyle='#f1f0ea';g.lineWidth=18;g.lineJoin='miter';for(let i=0;i<3;i++){g.beginPath();g.moveTo(14,50+i*34+22);g.lineTo(64,50+i*34-14);g.lineTo(114,50+i*34+22);g.stroke();}g.restore();
  const t=new kit.THREE.CanvasTexture(cv);t.anisotropy=8;return t;
}
function buildRoadMarks(ctx,kit,rng){
  const st=ctx.st,b=mkB(true,false),DS=ctx.DS,L=ctx.L,tex=makeMarkAtlas(kit);
  const strip=(s0,lenSegs,off,wd,uv)=>{ // uv=[u0,v0,u1,v1] ; far end = v1
    const n=Math.max(1,lenSegs),segLen=DS;
    for(let i=0;i<n;i++){
      const sa=s0+i*segLen,sb=sa+segLen,pa=kit.pose(sa,off-wd/2),pb=kit.pose(sb,off-wd/2),qa=kit.pose(sa,off+wd/2),qb=kit.pose(sb,off+wd/2);
      const va=uv[1]+(uv[3]-uv[1])*(i/n),vb=uv[1]+(uv[3]-uv[1])*((i+1)/n);
      const A=[pa.x,pa.y+.05,pa.z],B=[qa.x,qa.y+.05,qa.z],C=[qb.x,qb.y+.05,qb.z],D=[pb.x,pb.y+.05,pb.z];
      // pose off>0 = right of travel; A/D at off-wd/2 (left) , B/C right. viewed from above with travel forward: A=left-near
      quad(b,A,B,C,D,[[uv[0],va],[uv[2],va],[uv[2],vb],[uv[0],vb]],null);
    }
  };
  const nA=Math.floor(L/DS);
  const at=(s)=>Math.round(s/DS)*DS;
  // straight arrows on every lane, every ~420 m, and speed numerals every ~1100 m
  for(let s=260;s<L-260;s+=420){const sa=at(s);for(const ln of LANES)strip(sa,3,ln,1.5,[0,0,.5,1]);}
  for(let s=620;s<L-300;s+=1100){const sa=at(s);for(const ln of[-3.6,3.6])strip(sa,3,ln,2.6,[.5,.5,1,1]);}
  const m=new kit.THREE.Mesh(toGeo(b,kit.THREE),new kit.THREE.MeshLambertMaterial({map:tex,alphaTest:.45,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
  m.receiveShadow=false;m.frustumCulled=false;ctx.grp.add(m);
}

/* ---------- terrain ---------- */
function terrainFeatFn(x,z,rho,dn,kit){
  // closing ring of hills beyond the city loop (hides the edge of the world). rho = zone outside the loop;
  // dn = distance from the road centre line, so the hill bases never start on or next to the road.
  const h=kit.st.half;
  const rim=kit.sstep(1.12,1.65,rho)*kit.sstep(h+30,h+75,dn)*(24+22*(kit.fbm(x*.003,z*.003,901,3)*.5+.5));
  const bump=2.5*kit.fbm(x*.01,z*.01,905,3)*kit.sstep(1.0,1.2,rho)*kit.sstep(h+6,h+30,dn);
  return rim+bump;
}
const _tc1=[0,0,0];
function terrainColorFn(cc,x,z,h,sl,dn,n1,near,kit){
  const st=kit.st,half=st.half,sst=kit.sstep;
  // zone only (inside / outside the loop): kit.polarR follows the real track, including the custom loop
  const rho=Math.hypot(x,z)/kit.polarR(Math.atan2(z,x));
  const big=kit.fbm(x*.0025,z*.0025,77,3)*.5+.5,mid=kit.fbm(x*.012,z*.012,78,2)*.5+.5;
  // base lawn mix: lush -> dry
  cc.setHex(0x4a8838);cc.lerp(new kit.THREE.Color(0x3b7a33),sst(.3,.7,big)*.6);cc.lerp(new kit.THREE.Color(0x86a047),sst(.55,.85,mid)*.55);
  // farmland patches outside the loop
  if(rho>1.05&&dn>38){
    const cx=Math.floor((x+kit.fbm(x*.004,z*.004,5,2)*140)/105),cz=Math.floor((z+kit.fbm(x*.004,z*.004,6,2)*140)/105),hv=kit.hash2(cx,cz,31);
    const f=sst(1.05,1.18,rho)*sst(38,70,dn);
    const col=hv<.22?0xb3a458:hv<.4?0x6aa03a:hv<.55?0x9db14d:hv<.7?0x5b8f34:hv<.82?0xc2b072:0x78a643;
    cc.lerp(new kit.THREE.Color(col),f*.85);
  }
  // inside the loop: parkland to paved city floor
  if(rho<.9){const urban=sst(.82,.5,rho);cc.lerp(new kit.THREE.Color(0x8d9298),urban*.75);if(rho<.45)cc.lerp(new kit.THREE.Color(0x777b82),.4);}
  // hills: forest patches and bare ridges
  const hill=sst(1.18,1.55,rho);
  if(hill>0){const f=kit.fbm(x*.01,z*.01,90,3)*.5+.5;cc.lerp(new kit.THREE.Color(f>.5?0x2f5f2c:0x4b7a35),hill*.8);cc.lerp(new kit.THREE.Color(0x8a8578),sst(.4,.75,sl)*hill*.6);}
  // steep slope rock
  if(sl>.45)cc.lerp(new kit.THREE.Color(0x7a746a),.5);
  // road verge: gravel and concrete shoulder, then trimmed lawn
  if(near||dn<half+10){
    const t=sst(half+1.5,half+10,dn);
    const verge=new kit.THREE.Color(0x85817a);verge.lerp(new kit.THREE.Color(0x6e6b64),n1*.5);
    cc.lerp(verge,1-t);
    cc.lerp(new kit.THREE.Color(0x6aa044),sst(half+7,half+11,dn)*.25);
  }
}

/* ---------- sky shader ---------- */
function makeSkyMaterial(ctx,kit){
  const T=kit.THREE,st=ctx.st;
  return new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new T.Color(0x3c86f0)},mid:{value:new T.Color(0x78b2f6)},hor:{value:new T.Color(st.fog[0])},sunC:{value:new T.Color(st.sun[0])},sunD:{value:new T.Vector3(st.sun[1][0],st.sun[1][1],st.sun[1][2]).normalize()}},
    vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 top,mid,hor,sunC,sunD;varying vec3 vP;void main(){float h=clamp(vP.y,0.,1.);'
     +'vec3 c=mix(mid,top,smoothstep(.12,.85,h));c=mix(hor,c,smoothstep(0.,.32,h));'
     +'float haze=exp(-h*7.);c=mix(c,hor,haze*.55);'
     +'vec2 ha=normalize(vP.xz+1e-4),sa=normalize(sunD.xz);float az=max(dot(ha,sa),0.);c+=vec3(1.,.93,.78)*pow(az,5.)*exp(-h*5.5)*.16;'
     +'float sd=max(dot(vP,sunD),0.);c+=sunC*(pow(sd,700.)*2.+pow(sd,12.)*.2);if(vP.y<0.)c=hor;gl_FragColor=vec4(c,1.);}'});
}

/* ---------- clouds: low-poly cumulus (shaded lumps) and thin streaks, one draw call, drifting slowly ---------- */
function buildClouds(ctx,kit){
  const T=kit.THREE,rng=kit.mulberry(4242),b=mkB(false,true);
  const ico=new T.IcosahedronGeometry(1,1),ip=ico.attributes.position,tn=ip.count/3|0;
  const nC=kit.TOUCH?18:30;
  const lump=(cx,cy,cz,sx,sy,sz)=>{
    for(let t=0;t<tn;t++){
      const v=[];for(let k=0;k<3;k++){const x=ip.getX(t*3+k),y=ip.getY(t*3+k),z=ip.getZ(t*3+k);v.push([cx+x*sx,cy+Math.max(y,-.35)*sy,cz+z*sz,y]);}
      const col=v.map(q=>{const k=Math.max(0,Math.min(1,(q[3]+.5)/1.3));return[.80+.20*k,.86+.14*k,.95+.05*k];});
      const A=v[0],B=v[1],C=v[2];
      const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;
      for(let k=0;k<3;k++){b.p.push(v[k][0],v[k][1],v[k][2]);b.n.push(nx/l,ny/l,nz/l);b.c.push(col[k][0],col[k][1],col[k][2]);}
    }
  };
  for(let i=0;i<nC;i++){
    const a=rng()*6.2832,rd=900+rng()*2100,cx=Math.cos(a)*rd,cz=Math.sin(a)*rd,cy=380+rng()*260,n=4+((rng()*4)|0),big=.8+rng()*.9;
    for(let k=0;k<n;k++)lump(cx+(k-n/2)*55*big+rng()*30,cy+rng()*22,cz+rng()*60,(55+rng()*45)*big,(24+rng()*14)*big,(40+rng()*30)*big);
  }
  for(let i=0;i<(kit.TOUCH?5:9);i++){ // high thin streaks
    const a=rng()*6.2832,rd=1200+rng()*2000,cx=Math.cos(a)*rd,cz=Math.sin(a)*rd,cy=900+rng()*300;
    lump(cx,cy,cz,260+rng()*220,10,30+rng()*30);
  }
  const m=new T.Mesh(toGeo(b,T),new T.MeshBasicMaterial({vertexColors:true,fog:false}));
  m.frustumCulled=false;m.renderOrder=-.5;const grp=new T.Group();grp.add(m);ctx.grp.add(grp);
  kit.addUpdater(dt=>{grp.rotation.y+=dt*.0022;});
  return grp;
}

/* ---------- vehicles ---------- */
let _liveryTex=null,_lampM=null,_liveryM=null;
function liveryTexture(kit){
  if(_liveryTex)return _liveryTex;
  const T=kit.TOUCH,S=T?256:512,k=S/512,cv=mkCanvas(S,S),g=cv.getContext('2d');g.scale(k,k);
  const txt=(s,x,y,size,col,sc,al,wt)=>{g.save();g.translate(x,y);g.scale(sc||1,1);g.fillStyle=col;g.font=(wt||'bold')+' '+size+'px sans-serif';g.textAlign=al||'left';g.textBaseline='middle';g.fillText(s,0,0);g.restore();};
  // r0: container NORDIC FREIGHT (512x128)
  g.fillStyle='#1d4f91';g.fillRect(0,0,512,128);for(let x=0;x<512;x+=7){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x,0,2,128);g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x+2,0,1,128);}
  g.fillStyle='#ff8a1c';g.fillRect(0,96,512,12);txt('NORDIC FREIGHT',256,48,58,'#ffffff',1,'center');txt('COLD CHAIN  ·  24H',256,78,20,'#d6e6fb',1,'center','600');
  // r1: bus (512x128)
  g.fillStyle='#f4f4f2';g.fillRect(0,128,512,128);g.fillStyle='#c2262e';g.fillRect(0,128,512,16);g.fillRect(0,222,512,34);
  for(let i=0;i<9;i++){const x=14+i*52;if(i===2||i===6){g.fillStyle='#dfe8ef';g.fillRect(x,152,40,62);g.fillStyle='#4a6b86';g.fillRect(x+3,155,15,56);g.fillRect(x+22,155,15,56);}
    else{g.fillStyle='#22364a';g.fillRect(x,152,46,44);g.fillStyle='rgba(180,210,235,.45)';g.fillRect(x+2,154,20,18);g.fillStyle='#f4f4f2';g.fillRect(x,196,46,18);}}
  txt('CITYLINE 7  ·  Harbour – Central',256,239,22,'#ffffff',1,'center');
  // r2: vans (256x128 each)
  g.fillStyle='#f4efe2';g.fillRect(0,256,256,128);g.fillStyle='#c8602b';g.fillRect(0,340,256,22);g.fillStyle='#8a4a22';g.fillRect(0,362,256,6);txt('MILL & CRUMB',128,298,34,'#7a3b17',.82,'center');txt('fresh bakery daily',128,326,16,'#8a5a3a',.9,'center','600');
  g.fillStyle='#f2f4f7';g.fillRect(256,256,256,128);g.fillStyle='#1c69d4';g.beginPath();g.moveTo(256,350);g.lineTo(512,300);g.lineTo(512,384);g.lineTo(256,384);g.fill();txt('SWIFTBOX',384,290,40,'#143d7a',.82,'center');txt('couriers · same-day',384,318,16,'#37506f',.9,'center','600');
  // r3: delivery box (left) and tanker label (right)
  g.fillStyle='#f6f6f2';g.fillRect(0,384,256,128);g.fillStyle='#2e9a58';g.beginPath();g.moveTo(0,470);g.quadraticCurveTo(80,430,160,466);g.quadraticCurveTo(220,490,256,452);g.lineTo(256,512);g.lineTo(0,512);g.fill();txt('VERDE FRESH',128,420,36,'#1d6b3a',.82,'center');txt('farm to door',128,444,16,'#3a7a52',.9,'center','600');
  g.fillStyle='#d9dde2';g.fillRect(256,384,256,128);g.fillStyle='#0f56b3';g.fillRect(256,432,256,34);g.fillStyle='#ffffff';g.fillRect(256,466,256,5);txt('AQUA FUEL',384,449,28,'#ffffff',.5,'center');txt('liquid logistics',384,490,16,'#33485f',.5,'center','600');
  const t=new kit.THREE.CanvasTexture(cv);t.anisotropy=4;_liveryTex=t;return t;
}
const LV={container:[0,0,512,128],bus:[0,128,512,128],vanA:[0,256,256,128],vanB:[256,256,256,128],box:[0,384,256,128],tank:[256,384,256,128]};
function lvUV(c){return[c[0]/512,1-(c[1]+c[3])/512,(c[0]+c[2])/512,1-c[1]/512];}  // u0,vBottom,u1,vTop
/* decal on the +x and -x faces of a vehicle box, text reads left to right as seen from outside */
function sideDecals(Dc,x,zF,zR,y0,y1,cell){
  const u=lvUV(LV[cell]);
  quad(Dc,[x,y0,zF],[x,y0,zR],[x,y1,zR],[x,y1,zF],[[u[0],u[1]],[u[2],u[1]],[u[2],u[3]],[u[0],u[3]]]);
  quad(Dc,[-x,y0,zR],[-x,y0,zF],[-x,y1,zF],[-x,y1,zR],[[u[0],u[1]],[u[2],u[1]],[u[2],u[3]],[u[0],u[3]]]);
}
/* extrude a side profile (z,y points) across the vehicle width */
function extrudeB(b,kit,pts,width,bev,xoff){
  const T=kit.THREE,sh=new T.Shape();sh.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)sh.lineTo(pts[i][0],pts[i][1]);sh.closePath();
  const g=new T.ExtrudeGeometry(sh,{depth:width,bevelEnabled:bev>0,bevelThickness:bev,bevelSize:bev,bevelSegments:1,steps:1,curveSegments:1});
  const p=g.attributes.position,n=g.attributes.normal,o=xoff||0;
  for(let i=0;i<p.count;i++){const a=p.getX(i),bb=p.getY(i),e=p.getZ(i);b.p.push(width/2-e+o,bb,a);b.n.push(-n.getZ(i),n.getY(i),n.getX(i));if(b.u)b.u.push(0,0);if(b.c)b.c.push(1,1,1);}
  b.tris+=p.count/3;g.dispose();
}
/* body profile with wheel arches. o.top = list from front to rear; o.arch = [[zc,rx,ry],...] */
function bodyPts(o){
  const hl=o.L/2,pts=[[-hl,o.lo]];
  for(const a of o.arch){pts.push([a[0]-a[1]-.03,o.sill]);for(let k=0;k<=8;k++){const t=Math.PI-k*Math.PI/8;pts.push([a[0]+a[1]*Math.cos(t),o.sill+a[2]*Math.sin(t)]);}pts.push([a[0]+a[1]+.03,o.sill]);}
  pts.push([hl,o.lo]);for(const q of o.top)pts.push(q);
  return pts;
}
function cylXB(b,cx,cy,cz,r,w,seg,col){
  const xl=cx-w/2,xr=cx+w/2,pa=a=>[cy+r*Math.cos(a),cz+r*Math.sin(a)];
  for(let i=0;i<seg;i++){
    const a0=i/seg*6.2832,a1=(i+1)/seg*6.2832,p0=pa(a0),p1=pa(a1);
    const A=[xl,p0[0],p0[1]],B=[xr,p0[0],p0[1]],C=[xr,p1[0],p1[1]],D=[xl,p1[0],p1[1]];
    quad(b,A,D,C,B,null,col);tri(b,[xr,cy,cz],B,C,null,null,null,col);tri(b,[xl,cy,cz],D,A,null,null,null,col);
  }
}
function wheelsB(D,Lp,xs,zs,r,w){for(const x of xs)for(const z of zs){cylXB(D,x,r,z,r,w,12,null);const s=Math.sign(x);cylXB(Lp,x+s*(w/2-.005),r,z,r*.62,.03,10,[.62,.65,.7]);}}
function lampBox(Lp,cx,cy,cz,sx,sy,sz,hex){boxB(Lp,cx,cy-sy/2,cz,sx,sy,sz,0,hex2rgb(hex));}
function plateB(Lp,z,y,front){boxB(Lp,0,y-.07,z,.5,.14,.02,0,[.92,.92,.88]);}
/* horizontal tank along z with smooth normals; decal arcs (+/-) get uv from the livery cell */
function tankB(b,Dc,cx,cy,z0,z1,R,seg,col,cell){
  const cap=(z,nz)=>{for(let i=0;i<seg;i++){const a0=i/seg*6.2832,a1=(i+1)/seg*6.2832;
    const P=[cx,cy,z],Q=[cx+Math.cos(a0)*R,cy+Math.sin(a0)*R,z],S=[cx+Math.cos(a1)*R,cy+Math.sin(a1)*R,z];if(nz>0)tri(b,P,Q,S,null,null,null,col);else tri(b,P,S,Q,null,null,null,col);}};
  for(let i=0;i<seg;i++){
    const a0=i/seg*6.2832,a1=(i+1)/seg*6.2832,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const A=[cx+c0*R,cy+s0*R,z0],B=[cx+c1*R,cy+s1*R,z0],C=[cx+c1*R,cy+s1*R,z1],D=[cx+c0*R,cy+s0*R,z1];
    pushV(b,A,c0,s0,0,null,col);pushV(b,B,c1,s1,0,null,col);pushV(b,C,c1,s1,0,null,col);pushV(b,A,c0,s0,0,null,col);pushV(b,C,c1,s1,0,null,col);pushV(b,D,c0,s0,0,null,col);b.tris+=2;
  }
  cap(z1,1);cap(z0,-1);
  if(Dc&&cell){ // label band on both flanks, slightly proud of the shell
    const u=lvUV(LV[cell]),R2=R+.012,n=5,span=.62;
    for(const sd of[1,-1])for(let i=0;i<n;i++){
      const t0=-span+2*span*i/n,t1=-span+2*span*(i+1)/n,ang=t=>sd>0?t:Math.PI-t;
      const a0=ang(t0),a1=ang(t1),f0=i/n,f1=(i+1)/n;
      // viewed from outside: u runs front(z1)->rear(z0) on +x flank, rear->front on -x flank
      const zl=sd>0?z1:z0,zr=sd>0?z0:z1;
      const vb=u[1]+(u[3]-u[1])*.0,vt=u[3];
      const P0=[cx+Math.cos(a0)*R2,cy+Math.sin(a0)*R2],P1=[cx+Math.cos(a1)*R2,cy+Math.sin(a1)*R2];
      const vA=u[1]+(u[3]-u[1])*(i/n),vB=u[1]+(u[3]-u[1])*((i+1)/n);
      const lo=sd>0?P0:P1,hi=sd>0?P1:P0,vlo=sd>0?vA:vB,vhi=sd>0?vB:vA;
      quad(Dc,[lo[0],lo[1],zl],[lo[0],lo[1],zr],[hi[0],hi[1],zr],[hi[0],hi[1],zl],[[u[0],vlo],[u[2],vlo],[u[2],vhi],[u[0],vhi]]);
    }
  }
}

const PAL=[0xe9ecef,0xe9ecef,0xc3c8cf,0xc3c8cf,0x2b2f36,0x15171a,0x9aa1ab,0x1f4e9c,0xb3222a,0x2e6b46,0xd9c9a3,0xe07b1a,0x3a5a8a,0x6d6f75];
const SEDAN={L:4.6,W:1.82,lo:.4,sill:.30,r:.33,arch:[[-1.4,.46,.46],[1.4,.46,.46]],axles:[-1.4,1.4],
  top:[[2.3,.66],[2.1,.82],[1.3,.93],[-1.15,.97],[-2.15,.92],[-2.3,.74]],cab:[[1.0,.93],[.55,1.40],[-.75,1.40],[-1.2,.95]],roof:[-.75,.55,1.40],cabW:1.62};
const HATCH={L:3.95,W:1.74,lo:.4,sill:.30,r:.32,arch:[[-1.2,.44,.44],[1.2,.44,.44]],axles:[-1.2,1.2],
  top:[[1.97,.64],[1.8,.8],[1.15,.9],[-1.0,.96],[-1.9,.98],[-1.97,.72]],cab:[[.9,.9],[.5,1.44],[-1.45,1.46],[-1.85,.98]],roof:[-1.45,.5,1.46],cabW:1.55};
const SUV={L:4.7,W:1.92,lo:.5,sill:.38,r:.38,arch:[[-1.45,.54,.54],[1.45,.54,.54]],axles:[-1.45,1.45],
  top:[[2.35,.8],[2.2,1.0],[1.4,1.1],[-2.0,1.12],[-2.33,1.0],[-2.35,.8]],cab:[[1.15,1.08],[.8,1.74],[-1.95,1.76],[-2.2,1.1]],roof:[-1.95,.8,1.76],cabW:1.7};
function buildCar(S,o,kit){
  const P=mkB(0,0),P2=mkB(0,0),G=mkB(0,0),D=mkB(0,0),Lp=mkB(0,1);
  extrudeB(P,kit,bodyPts(S),S.W-.1,.05);
  extrudeB(G,kit,S.cab,S.cabW,.04);
  boxB(P,0,S.roof[2]-.01,(S.roof[0]+S.roof[1])/2,S.cabW-.14,.07,S.roof[1]-S.roof[0]+.06,0,null);
  const hl=S.L/2,x=S.W/2-.1;
  // pillars
  for(const sd of[-1,1])boxB(P,sd*(S.cabW/2),S.cab[0][1]+.02,(S.roof[0]+S.roof[1])/2-.05,.05,S.roof[2]-S.cab[0][1],.09,0,null);
  // bumpers, grille, skirts
  boxB(D,0,S.lo-.04,hl-.03,S.W-.1,.22,.12,0,null);boxB(D,0,S.lo-.04,-hl+.03,S.W-.1,.22,.12,0,null);
  boxB(D,0,S.lo+.2,hl-.02,.9,.16,.06,0,null);
  for(const sd of[-1,1])boxB(D,sd*(S.W/2-.04),S.sill-.04,0,.06,.14,S.L*.5,0,null);
  // lamps
  const hy=S.top[1][1]-.06,ty=S.top[S.top.length-2][1]-.12;
  for(const sd of[-1,1]){lampBox(Lp,sd*(S.W/2-.3),hy,hl+.0,.42,.11,.05,0xfff2c0);lampBox(Lp,sd*(S.W/2-.3),ty,-hl+.0,.5,.1,.05,0xd01818);lampBox(Lp,sd*(S.W/2-.12),ty+.14,-hl+.0,.12,.1,.05,0xff9a10);}
  lampBox(Lp,0,ty,-hl,S.W-.9,.04,.05,0x8a1010);
  plateB(Lp,-hl-.01,S.lo+.2);
  for(const sd of[-1,1])lampBox(Lp,sd*(S.cabW/2+.07),S.cab[0][1]+.05,S.cab[0][0]-.1,.05,.05,.12,0xfff2c0);
  wheelsB(D,Lp,[-x,x],S.axles,S.r,.24);
  if(o.taxi)boxB(Lp,0,S.roof[2]+.05,(S.roof[0]+S.roof[1])/2,.62,.17,.26,0,hex2rgb(0xfff0b0));
  if(o.police){
    boxB(Lp,-.28,S.roof[2]+.05,(S.roof[0]+S.roof[1])/2,.5,.1,.3,0,hex2rgb(0xe02020));boxB(Lp,.28,S.roof[2]+.05,(S.roof[0]+S.roof[1])/2,.5,.1,.3,0,hex2rgb(0x2050ff));
    for(const sd of[-1,1])boxB(P2,sd*(S.W/2-.04),S.sill+.2,0,.05,.5,S.L*.34,0,null);
  }
  if(o.stripe)boxB(P2,0,S.top[3][1]+.01,0,.34,.02,S.L*.55,0,null);
  return{P,P2,G,D,Lp,hw:S.W/2+.02,hl:hl};
}
function buildTruck(kind,kit){
  const P=mkB(0,0),P2=mkB(0,0),G=mkB(0,0),D=mkB(0,0),Lp=mkB(0,1),Dc=mkB(1,0);let hw,hl;
  const cabArch=(zc,r)=>[zc,r,r];
  if(kind==='van'||kind==='van2'){
    const S={L:5.2,W:1.98,lo:.45,sill:.34,arch:[cabArch(-1.65,.5),cabArch(1.7,.5)],top:[[2.6,.72],[2.55,.92],[2.1,1.05],[1.55,1.45],[.95,2.12],[-2.55,2.14],[-2.6,1.9],[-2.6,.7]]};
    extrudeB(P,kit,bodyPts(S),S.W-.1,.05);extrudeB(G,kit,[[1.64,1.42],[1.04,2.08],[.9,2.08],[.9,1.42]],S.W+.02,.02);
    sideDecals(Dc,S.W/2+.014,.82,-2.55,.6,2.0,kind==='van'?'vanA':'vanB');
    boxB(D,0,.28,2.55,S.W-.1,.24,.12,0,null);boxB(D,0,.28,-2.57,S.W-.1,.24,.12,0,null);
    for(const sd of[-1,1]){lampBox(Lp,sd*.78,.95,-2.62,.16,.5,.05,0xd01818);lampBox(Lp,sd*.7,.78,2.6,.34,.12,.05,0xfff2c0);}
    boxB(D,0,.5,-2.62,.04,1.5,.03,0,null);plateB(Lp,-2.64,.62);
    wheelsB(D,Lp,[-.88,.88],[-1.65,1.7],.36,.24);hw=1.0;hl=2.6;
  }else if(kind==='delivery'){
    const S={L:7.4,W:2.2,lo:.55,sill:.5,arch:[cabArch(-2.2,.62),cabArch(2.6,.62)],top:[[3.7,.8],[3.7,1.5],[3.3,2.4],[2.2,2.45],[2.1,1.0],[-3.7,1.0]]};
    extrudeB(P,kit,bodyPts(S),S.W-.1,.05);extrudeB(G,kit,[[3.34,1.55],[3.05,2.28],[2.9,2.28],[2.9,1.55]],S.W+.02,.02);
    boxB(P2,0,1.0,-.85,2.4,2.4,5.65,0,null);sideDecals(Dc,1.214,1.95,-3.65,1.1,3.3,'box');
    boxB(D,0,.4,3.65,S.W-.1,.25,.12,0,null);boxB(D,0,.4,-3.72,2.3,.25,.12,0,null);
    for(const sd of[-1,1]){lampBox(Lp,sd*1.0,1.2,-3.72,.18,.5,.05,0xd01818);lampBox(Lp,sd*.8,1.0,3.72,.4,.14,.05,0xfff2c0);}
    plateB(Lp,-3.74,.75);boxB(D,0,1.1,-3.72,.05,2.2,.03,0,null);
    wheelsB(D,Lp,[-.98,.98],[-2.2,2.6],.5,.32);hw=1.25;hl=3.7;
  }else if(kind==='bus'){
    const S={L:11,W:2.5,lo:.6,sill:.55,arch:[cabArch(-3.2,.7),cabArch(3.5,.7)],top:[[5.5,.8],[5.5,3.0],[5.3,3.18],[-5.3,3.18],[-5.5,3.0],[-5.5,.8]]};
    extrudeB(P,kit,bodyPts(S),S.W-.1,.06);sideDecals(Dc,S.W/2+.014,5.35,-5.35,.75,3.06,'bus');
    boxB(G,0,1.25,5.5,2.2,1.65,.05,0,null);boxB(G,0,1.75,-5.5,1.9,.9,.05,0,null);
    boxB(P2,0,3.2,.5,1.6,.3,2.4,0,null);
    boxB(D,0,.38,5.52,S.W-.1,.25,.12,0,null);boxB(D,0,.38,-5.54,S.W-.1,.25,.12,0,null);
    for(const sd of[-1,1]){lampBox(Lp,sd*1.0,.95,-5.56,.22,.45,.05,0xd01818);lampBox(Lp,sd*.9,.9,5.56,.4,.16,.05,0xfff2c0);}
    lampBox(Lp,0,2.9,5.54,1.5,.2,.04,0xffcf40);plateB(Lp,-5.58,.8);
    wheelsB(D,Lp,[-1.1,1.1],[-3.2,3.5],.5,.32);hw=1.28;hl=5.5;
  }else if(kind==='tanker'){
    const cab=[[5.75,.8],[5.75,2.45],[5.3,3.25],[3.9,3.25],[3.9,.8]];
    const S={L:11.5,W:2.4,lo:.8,sill:.7,arch:[cabArch(4.9,.62)],top:[[5.75,2.45],[5.3,3.25],[3.9,3.25],[3.9,.95],[-5.75,.95]]};
    extrudeB(P,kit,bodyPts(S),2.3,.05);extrudeB(G,kit,[[5.42,2.5],[5.12,3.1],[4.7,3.1],[4.7,2.5]],2.34,.02);
    boxB(D,0,.7,-.5,1.7,.28,11.4,0,null);
    tankB(P2,Dc,0,2.3,-5.65,3.4,1.12,14,null,'tank');
    boxB(D,0,.3,5.8,2.3,.3,.12,0,null);boxB(D,0,.55,-5.8,2.3,.2,.1,0,null);
    for(const sd of[-1,1]){lampBox(Lp,sd*1.0,.95,-5.78,.2,.18,.05,0xd01818);lampBox(Lp,sd*.85,1.0,5.8,.4,.14,.05,0xfff2c0);}
    wheelsB(D,Lp,[-1.0,1.0],[4.9,-4.2,-5.3],.5,.32);hw=1.25;hl=5.75;
  }else{ // container
    const S={L:12.4,W:2.4,lo:.8,sill:.7,arch:[cabArch(5.3,.62)],top:[[6.2,2.45],[5.75,3.25],[4.3,3.25],[4.3,.95],[-6.2,.95]]};
    extrudeB(P,kit,[[6.2,.8],[6.2,2.45],[5.75,3.25],[4.2,3.25],[4.2,.8]],2.3,.05);
    extrudeB(G,kit,[[5.88,2.5],[5.58,3.1],[5.1,3.1],[5.1,2.5]],2.34,.02);
    boxB(D,0,.85,-.9,1.7,.3,10.6,0,null);
    boxB(P2,0,1.3,-1.4,2.56,2.6,9.3,0,null);sideDecals(Dc,1.294,3.25,-6.05,1.4,3.85,'container');
    boxB(D,0,.4,6.23,2.3,.3,.12,0,null);boxB(D,0,.5,-6.28,2.3,.22,.1,0,null);
    for(const sd of[-1,1]){lampBox(Lp,sd*1.0,1.0,-6.3,.2,.2,.05,0xd01818);lampBox(Lp,sd*.85,1.0,6.24,.4,.14,.05,0xfff2c0);}
    for(let i=-2;i<=2;i++)boxB(D,i*.4,1.4,-6.07,.07,2.4,.04,0,null);
    wheelsB(D,Lp,[-1.0,1.0],[5.3,3.8,-4.7,-5.8],.5,.32);hw=1.3;hl=6.2;
  }
  return{P,P2,G,D,Lp,Dc,hw,hl};
}
const VCACHE={};
function vehGeo(kind,kit){
  if(VCACHE[kind])return VCACHE[kind];
  const T=kit.THREE;let r;
  if(kind==='sedan')r=buildCar(SEDAN,{},kit);else if(kind==='taxi')r=buildCar(SEDAN,{taxi:1},kit);else if(kind==='police')r=buildCar(SEDAN,{police:1},kit);
  else if(kind==='hatch')r=buildCar(HATCH,{stripe:0},kit);else if(kind==='suv')r=buildCar(SUV,{},kit);else r=buildTruck(kind,kit);
  const o={hw:r.hw,hl:r.hl};for(const k of['P','P2','G','D','Lp','Dc'])if(r[k]&&r[k].p.length)o[k]=toGeo(r[k],T);
  return VCACHE[kind]=o;
}
function vehMats(kit){
  if(_lampM)return;const T=kit.THREE;
  _lampM=new T.MeshBasicMaterial({vertexColors:true});
  _liveryM=new T.MeshLambertMaterial({map:liveryTexture(kit),side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
}
function makeVehicle(kind,rng,kit){
  vehMats(kit);const T=kit.THREE,c1=rng(),c2=rng();
  const k=(kind==='van'&&c2<.5)?'van2':kind,V=vehGeo(k,kit);if(!V||!V.P)return null;
  let col=PAL[(c1*PAL.length)|0],col2=0xf1f1ee;
  if(kind==='taxi')col=0xf0b800;else if(kind==='police'){col=0x16181c;col2=0xf1f1ee;}
  else if(kind==='van')col=0xf2f2ee;else if(kind==='delivery'){col=[0x2e9a58,0xc8602b,0x1f4e9c,0xb3222a][(c1*4)|0];col2=0xf6f6f2;}
  else if(kind==='bus'){col=0xf4f4f2;col2=0xe8e8e6;}else if(kind==='tanker'){col=[0x1f4e9c,0xb3222a,0x2b2f36,0xe9ecef][(c1*4)|0];col2=0xd5d9de;}
  else if(kind==='container'){col=[0x1f4e9c,0x2b2f36,0xb3222a,0xe9ecef][(c1*4)|0];col2=0x1d4f91;}
  const g=new T.Group(),add=(geo,mat,sh)=>{if(!geo)return;const m=new T.Mesh(geo,mat);m.castShadow=!!sh;g.add(m);};
  add(V.P,kit.vm(col),true);add(V.P2,kit.vm(col2),true);add(V.G,kit.glassM);add(V.D,kit.tyreM);add(V.Lp,_lampM);add(V.Dc,_liveryM);
  return{obj:g,hw:V.hw,hl:V.hl};
}

/* ---------- road-works obstacles: small, rotationally symmetric, always passable ---------- */
let _obsM=null;
const OCACHE={};
function obstGeo(kind,kit){
  if(OCACHE[kind])return OCACHE[kind];
  const b=mkB(false,true),O=hex2rgb(0xff6a14),W=hex2rgb(0xf4f4f0),K=hex2rgb(0x22262b),Y=hex2rgb(0xffb400);let hw;
  if(kind==='cones'){
    const n=5;hw=.85;
    for(let i=0;i<n;i++){const a=i/n*6.2832,x=Math.cos(a)*.55,z=Math.sin(a)*.55;
      boxB(b,x,0,z,.46,.04,.46,a,K);cylB(b,x,.04,z,.19,.12,.34,8,O);cylB(b,x,.38,z,.12,.07,.14,8,W);cylB(b,x,.52,z,.07,.03,.2,8,O);}
  }else if(kind==='drums'){
    hw=.75;
    for(const q of[[-.35,.1],[.38,-.2]]){cylB(b,q[0],0,q[1],.3,.3,.3,10,O);cylB(b,q[0],.3,q[1],.3,.3,.18,10,W);cylB(b,q[0],.48,q[1],.3,.3,.24,10,O,{cap:true});cylB(b,q[0],.72,q[1],.3,.3,.14,10,W);cylB(b,q[0],.86,q[1],.3,.3,.1,10,O);
      boxB(b,q[0],.96,q[1],.16,.14,.16,0,Y);}
  }else{ // worksign: tripod with diamond warning panel
    hw=.8;
    for(let i=0;i<3;i++){const a=i/3*6.2832+.5;rodB(b,[Math.cos(a)*.7,0,Math.sin(a)*.7],[0,1.15,0],.07,K);}
    boxB(b,0,.85,0,.08,.08,.08,0,K);
    // diamond: two thin rotated boxes forming a square panel turned 45 degrees (double-sided via material)
    boxB(b,0,1.0,0,1.05,.04,.04,0,O,{top:false});
    const c=[0,1.55,0],h=.62;quad(b,[c[0],c[1]-h,0],[c[0]+h,c[1],0],[c[0],c[1]+h,0],[c[0]-h,c[1],0],null,O);
    const h2=.5;quad(b,[0,c[1]-h2,.005],[h2,c[1],.005],[0,c[1]+h2,.005],[-h2,c[1],.005],null,Y);
    const h3=.28;quad(b,[0,c[1]-h3,.01],[h3,c[1],.01],[0,c[1]+h3,.01],[-h3,c[1],.01],null,K);
    quad(b,[0,c[1]-h3,-.005],[-h3,c[1],-.005],[0,c[1]+h3,-.005],[h3,c[1],-.005],null,K);
    boxB(b,0,1.98,0,.12,.1,.12,0,Y);
  }
  return OCACHE[kind]={geo:toGeo(b,kit.THREE),hw:hw};
}
function makeObstacle(kind,rng,kit){
  const T=kit.THREE;if(!_obsM)_obsM=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const o=obstGeo(kind==='drums'||kind==='worksign'?kind:'cones',kit),g=new T.Group(),m=new T.Mesh(o.geo,_obsM);m.castShadow=true;g.add(m);
  rng();return{obj:g,hw:o.hw,hl:o.hw};
}

/* ---------- building / barrier / billboard textures ---------- */
function glassTexture(kit){
  const k=kit.TOUCH?.5:1,cv=mkCanvas(256*k,512*k),g=cv.getContext('2d'),rnd=kit.mulberry(77);g.scale(k,k);
  g.fillStyle='#dfe5ea';g.fillRect(0,0,256,512);
  const cols=['#5c86ad','#6c97bd','#4f7699','#7ba5ca','#8bb2d4','#456a8c','#6f9cc2'];
  for(let r=0;r<8;r++)for(let c=0;c<4;c++){
    const x=c*64,y=r*64;g.fillStyle=cols[(rnd()*cols.length)|0];g.fillRect(x+3,y+3,58,51);
    const gr=g.createLinearGradient(0,y+3,0,y+54);gr.addColorStop(0,'rgba(255,255,255,.38)');gr.addColorStop(.6,'rgba(255,255,255,.05)');gr.addColorStop(1,'rgba(0,0,0,.18)');g.fillStyle=gr;g.fillRect(x+3,y+3,58,51);
    g.fillStyle='#c4cbd2';g.fillRect(x,y+54,64,10);
    if(rnd()<.07){g.fillStyle='rgba(240,222,160,.75)';g.fillRect(x+3,y+3,58,51);}
  }
  g.fillStyle='#dfe5ea';g.fillRect(0,0,6,6);
  const t=new kit.THREE.CanvasTexture(cv);t.wrapS=t.wrapT=kit.THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function wallTexture(kit){
  const k=kit.TOUCH?.5:1,cv=mkCanvas(256*k,256*k),g=cv.getContext('2d'),rnd=kit.mulberry(78);g.scale(k,k);
  g.fillStyle='#f1ede4';g.fillRect(0,0,256,256);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const x=c*64,y=r*64;g.fillStyle='#e1dcd1';g.fillRect(x,y+57,64,7);
    g.fillStyle='#b9b3a6';g.fillRect(x+11,y+46,42,4);
    const q=rnd();g.fillStyle=q<.08?'#e6cf8c':q<.3?'#8fa3b5':'#4d6275';g.fillRect(x+14,y+12,36,34);
    g.fillStyle='rgba(255,255,255,.25)';g.fillRect(x+14,y+12,36,10);
    g.strokeStyle='#d7d2c6';g.lineWidth=2;g.strokeRect(x+14,y+12,36,34);g.fillStyle='#d7d2c6';g.fillRect(x+31,y+12,2,34);
  }
  g.fillStyle='#f1ede4';g.fillRect(0,0,8,8);
  const t=new kit.THREE.CanvasTexture(cv);t.wrapS=t.wrapT=kit.THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function barrierTexture(kit){
  const k=kit.TOUCH?.5:1,cv=mkCanvas(256*k,128*k),g=cv.getContext('2d');g.scale(k,k);
  g.fillStyle='#6f8f88';g.fillRect(0,0,256,128);g.fillStyle='#7f9f98';g.fillRect(0,14,256,40);
  g.fillStyle='#3f464c';g.fillRect(0,0,256,14);g.fillStyle='#566a66';g.fillRect(0,96,256,32);
  for(let i=0;i<4;i++){g.fillStyle='#4f6e69';g.fillRect(i*64+30,14,2,82);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(i*64+33,14,2,82);}
  g.fillStyle='#383d42';g.fillRect(0,0,8,128);
  const t=new kit.THREE.CanvasTexture(cv);t.wrapS=t.wrapT=kit.THREE.RepeatWrapping;t.anisotropy=4;return t;
}
/* board atlas: plain strip (top), 3 adverts (512x112 each) and 2 green signs (256x112 each) in row 4 */
const AD_CELL=i=>[0,1-(16+i*120+112)/512,1,1-(16+i*120)/512];
const SIGN_CELL=i=>[i*.5,1-(16+3*120+112)/512,i*.5+.5,1-(16+3*120)/512];
function boardTexture(kit){
  const k=kit.TOUCH?.5:1,cv=mkCanvas(512*k,512*k),g=cv.getContext('2d');g.scale(k,k);
  const txt=(s,x,y,size,col,sc,al,wt)=>{g.save();g.translate(x,y);g.scale(sc||1,1);g.fillStyle=col;g.font=(wt||'bold')+' '+size+'px sans-serif';g.textAlign=al||'left';g.textBaseline='middle';g.fillText(s,0,0);g.restore();};
  g.fillStyle='#59606a';g.fillRect(0,0,512,512);
  let y=16,gr;
  gr=g.createLinearGradient(0,y,512,y);gr.addColorStop(0,'#0e1b3d');gr.addColorStop(1,'#1f4686');g.fillStyle=gr;g.fillRect(0,y,512,112);
  g.fillStyle='#e03030';g.beginPath();g.moveTo(0,y+88);g.quadraticCurveTo(250,y+50,512,y+96);g.lineTo(512,y+112);g.lineTo(0,y+112);g.fill();
  txt('ZENITH MOTORS',24,y+38,50,'#ffffff',.92);txt('built to chase the horizon',26,y+72,22,'#c8d8f4',1,'left','600');
  g.fillStyle='#f4f6fa';g.beginPath();g.moveTo(380,y+88);g.lineTo(396,y+66);g.lineTo(430,y+58);g.lineTo(470,y+62);g.lineTo(492,y+88);g.fill();g.fillStyle='#1a2a4c';g.fillRect(404,y+68,26,12);g.fillRect(436,y+66,26,14);
  g.fillStyle='#10131a';g.beginPath();g.arc(406,y+90,9,0,6.3);g.arc(470,y+90,9,0,6.3);g.fill();
  y=16+120;gr=g.createLinearGradient(0,y,0,y+112);gr.addColorStop(0,'#1a8fd6');gr.addColorStop(1,'#62cdf4');g.fillStyle=gr;g.fillRect(0,y,512,112);
  for(let i=0;i<9;i++){g.fillStyle='rgba(255,255,255,'+(.12+.05*(i%3))+')';g.beginPath();g.arc(30+i*58,y+20+(i*37%70),10+(i*7%14),0,6.3);g.fill();}
  txt('AQUA SPRING',256,y+44,58,'#ffffff',1,'center');txt('pure.  cold.  now.',256,y+86,26,'#e6f6ff',1,'center','600');
  y=16+240;g.fillStyle='#1a1030';g.fillRect(0,y,512,112);gr=g.createLinearGradient(0,y,512,y);gr.addColorStop(0,'#00e0c0');gr.addColorStop(1,'#a050ff');g.fillStyle=gr;g.fillRect(0,y+92,512,10);
  txt('NOVA FIBER',256,y+36,56,'#ffffff',1,'center');txt('1 Gbps  ·  home & office',256,y+70,24,'#d4c8f4',1,'center','600');
  y=16+360;
  const sign=(x,l1,l2,l3)=>{g.fillStyle='#0b6b3a';g.fillRect(x,y,256,112);g.strokeStyle='#ffffff';g.lineWidth=4;g.strokeRect(x+6,y+6,244,100);
    txt(l1,x+16,y+30,34,'#ffffff',1);txt(l2,x+16,y+64,22,'#ffffff',1,'left','600');txt(l3,x+16,y+90,18,'#bde8cf',1,'left','600');
    g.fillStyle='#ffffff';g.beginPath();g.moveTo(x+212,y+30);g.lineTo(x+236,y+54);g.lineTo(x+224,y+54);g.lineTo(x+224,y+88);g.lineTo(x+200,y+88);g.lineTo(x+200,y+54);g.lineTo(x+188,y+54);g.fill();};
  sign(0,'EXIT 14','Harbour District','2 km');sign(256,'EXIT 15','City Centre','5 km');
  const t=new kit.THREE.CanvasTexture(cv);t.anisotropy=4;return t;
}

/* ---------- scenery ---------- */
function lumpB(b,T,cx,cy,cz,sx,sy,sz,detail,flat){ // faceted lump (icosahedron) baked at a position
  const ico=new T.IcosahedronGeometry(1,detail),p=ico.attributes.position;
  for(let t=0;t<p.count/3;t++){
    const v=[];for(let k=0;k<3;k++)v.push([cx+p.getX(t*3+k)*sx,cy+Math.max(p.getY(t*3+k),flat===undefined?-9:flat)*sy,cz+p.getZ(t*3+k)*sz]);
    tri(b,v[0],v[1],v[2],null,null,null,null);
  }
  ico.dispose();
}
const GTINT=[0xffffff,0xe3eef8,0xc8dcec,0xd9e6e0,0xeadfce,0xf2f6fa,0xb9d0e2];
const WTINT=[0xf2eee6,0xd8cdbd,0xc9c4bc,0xe6e0d4,0xc89a80,0xdfd2b8,0xb8c2cc];
const ROOFC=[0x9a4a36,0x7a3a2e,0x5a5f66,0x8a5a3c,0x4a5058,0xa05a40];
function buildScenery(ctx){
  const kit=ctx.kit,T=kit.THREE,st=ctx.st,grp=ctx.grp,TOUCH=kit.TOUCH,L=ctx.L,DS=ctx.DS,half=st.half,rng=kit.mulberry(1357),tf=TOUCH?.6:1;
  // polarR / rhoOf are only used for coarse inside-the-loop zoning; every placement is checked against the real road
  const polarR=th=>kit.polarR(th);
  const rhoOf=(x,z)=>Math.hypot(x,z)/polarR(Math.atan2(z,x));
  const occ=new Map(),CELL=64,key=(i,j)=>i*100003+j;
  const free=(x,z,r)=>{const ci=Math.floor(x/CELL),cj=Math.floor(z/CELL);for(let i=ci-1;i<=ci+1;i++)for(let j=cj-1;j<=cj+1;j++){const a=occ.get(key(i,j));if(a)for(const o of a){const dx=o.x-x,dz=o.z-z,rr=o.r+r;if(dx*dx+dz*dz<rr*rr)return false;}}return true;};
  const take=(x,z,r)=>{const k=key(Math.floor(x/CELL),Math.floor(z/CELL));let a=occ.get(k);if(!a){a=[];occ.set(k,a);}a.push({x,z,r});};
  const gmin=(x,z,r)=>{let m=1e9;for(const q of[[0,0],[r,0],[-r,0],[0,r],[0,-r]])m=Math.min(m,kit.terrainH(x+q[0],z+q[1]));return m;};
  const dist=(x,z)=>kit.nearest(x,z).dist;
  const at=(s,off)=>kit.pose(s,off);
  // footprint of a building (conservative radius for any yaw, podiums included) must clear the road edge + 1.5 m
  const fp=(w,d)=>Math.hypot(w,d)*.8;
  const clear=(x,z,r)=>dist(x,z)>=half+1.5+r;
  const mats={};
  mats.glass=new T.MeshLambertMaterial({map:glassTexture(kit),vertexColors:true});
  mats.wall=new T.MeshLambertMaterial({map:wallTexture(kit),vertexColors:true});
  mats.plain=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const Bg=mkB(true,true),Bw=mkB(true,true),Bp=mkB(false,true),beacons=[];
  const rc=h=>hex2rgb(h);
  /* ---- towers, mid-rise, cranes ---- */
  const roofKit=(b,x,top,z,w,d,yaw,big)=>{
    boxB(b,x,top,z,w*.4,2.2,d*.4,yaw,rc(0x6b7078));
    if(rng()<.5)boxB(b,x+w*.25,top,z-d*.25,w*.2,1.2,d*.2,yaw,rc(0x9aa0a6));
    if(big&&rng()<.6){rodB(b,[x,top+2,z],[x,top+2+(big>1?34:14),z],.5,rc(0xc8ccd0));beacons.push([x,top+2+(big>1?34:14),z]);}
    else if(rng()<.4)cylB(b,x-w*.2,top,z+d*.2,1.7,1.7,2.6,8,rc(0x8a6a4a));
  };
  const tower=(x,z,w,d,H,yaw,tp)=>{
    const g0=gmin(x,z,Math.min(w,d)/2),y0=g0-4,top=g0+H,tint=rc(GTINT[(rng()*GTINT.length)|0]),uo=rng();
    const bl=m=>({bld:{tw:12,th:28.8,uo:uo,vo:0}});
    if(tp===1){ // stepped
      boxB(Bg,x,y0,z,w,H*.55+4,d,yaw,tint,bl());
      boxB(Bg,x,g0+H*.55,z,w*.72,H*.28,d*.72,yaw,tint,bl());
      boxB(Bg,x,g0+H*.83,z,w*.46,H*.17,d*.46,yaw,tint,bl());roofKit(Bp,x,top,z,w*.46,d*.46,yaw,2);
    }else if(tp===2){ // round
      const r=Math.min(w,d)/2;cylB(Bg,x,y0,z,r,r,H+4,16,tint,{bld:{tw:12,th:28.8,uo:uo,vo:0},capCol:rc(0xb4bcc4)});roofKit(Bp,x,top,z,r*1.6,r*1.6,yaw,H>150?2:1);
    }else if(tp===3){ // tower on podium
      boxB(Bw,x,y0,z,w*1.5,26,d*1.5,yaw,rc(WTINT[(rng()*WTINT.length)|0]),{bld:{tw:12.8,th:13.6,uo:uo,vo:0}});
      boxB(Bg,x+w*.1,g0+22,z,w*.7,H-22,d*.7,yaw,tint,bl());roofKit(Bp,x+w*.1,top,z,w*.7,d*.7,yaw,2);
    }else{
      boxB(Bg,x,y0,z,w,H+4,d,yaw,tint,bl());roofKit(Bp,x,top,z,w,d,yaw,H>120?2:1);
    }
  };
  const mid=(x,z,w,d,H,yaw)=>{
    const g0=gmin(x,z,Math.min(w,d)/2),y0=g0-3,col=rc(WTINT[(rng()*WTINT.length)|0]),uo=rng();
    const o={bld:{tw:12.8,th:13.6,uo:uo,vo:0}};
    if(rng()<.3){const w2=w*.55;boxB(Bw,x,y0,z,w,H+3,d*.5,yaw,col,o);const cs=Math.cos(yaw),sn=Math.sin(yaw);boxB(Bw,x+cs*(w/2-w2/2),y0,z-sn*(w/2-w2/2)+0,w2,H*.7+3,d,yaw,col,o);}
    else boxB(Bw,x,y0,z,w,H+3,d,yaw,col,o);
    if(rng()<.5)roofKit(Bp,x,g0+H,z,w,d,yaw,0);
  };
  const crane=(x,z,yaw)=>{
    const g0=kit.terrainH(x,z),Y=hex2rgb(0xe5b81c),H=62+rng()*30;
    rodB(Bp,[x,g0-1,z],[x,g0+H,z],1.5,Y);
    const cs=Math.cos(yaw),sn=Math.sin(yaw),P=(l,y)=>[x+cs*l,g0+y,z-sn*l];
    rodB(Bp,P(-16,H),P(46,H),1.1,Y);rodB(Bp,P(-16,H+.1),P(-16,H-4),1.1,Y);boxB(Bp,x-cs*14,g0+H-5.5,z+sn*14,4,3,3,yaw,rc(0x777c82));
    rodB(Bp,[x,g0+H,z],P(0,H+9),1.0,Y);rodB(Bp,P(0,H+9),P(46,H),.35,rc(0x555a60));rodB(Bp,P(0,H+9),P(-16,H),.35,rc(0x555a60));
    rodB(Bp,P(38,H),P(38,H-30),.18,rc(0x333333));boxB(Bp,x+cs*38,g0+H-31,z-sn*38,1.8,1.2,1.8,yaw,rc(0xd04020));
    boxB(Bp,x,g0+H-3,z,2.4,2.6,2.4,yaw,rc(0xf0f0f0));beacons.push([x,g0+H+9.8,z]);
  };
  // downtown
  {let n=Math.round(150*tf),made=0;
   for(let a=0;a<n*14&&made<n;a++){
    const th=rng()*6.2832,rr=Math.sqrt(rng())*.4*polarR(th),x=Math.cos(th)*rr,z=Math.sin(th)*rr,w=20+rng()*22,d=20+rng()*22,core=1-rr/(.4*polarR(th));
    const H=55+Math.pow(rng(),1.8)*(120+190*core),yaw=.35+(rng()-.5)*.18;
    if(!clear(x,z,fp(w,d))||!free(x,z,Math.max(w,d)*.72))continue;take(x,z,Math.max(w,d)*.72);
    const r=rng();tower(x,z,w,d,H,yaw,r<.18?1:r<.34?2:r<.46?3:0);made++;}}
  // mid-rise ring
  {let n=Math.round(240*tf),made=0;
   for(let a=0;a<n*14&&made<n;a++){
    const th=rng()*6.2832,pr=polarR(th),rho=.4+rng()*.4,x=Math.cos(th)*pr*rho,z=Math.sin(th)*pr*rho,w=18+rng()*26,d=18+rng()*24;
    if(dist(x,z)<half+60||!clear(x,z,fp(w,d)))continue;
    if(!free(x,z,Math.max(w,d)*.7))continue;take(x,z,Math.max(w,d)*.7);
    const yaw=.35+(rng()-.5)*.25;if(rng()<.22)tower(x,z,w,d,50+rng()*55,yaw,0);else mid(x,z,w,d,16+Math.pow(rng(),1.5)*60,yaw);made++;}}
  // corridor buildings beside the road
  const ZONES=[[0,.12,1],[.30,.46,1],[.62,.78,1],[.14,.24,.5],[.50,.60,.55]];
  const zoneD=f=>{for(const z of ZONES)if(f>=z[0]&&f<=z[1])return z[2];return 0;};
  {const step=24,cap=Math.round(210*tf);let made=0;
   for(let s=40;s<L-40&&made<cap;s+=step)for(const sd of[-1,1]){
    const dn=zoneD(s/L);if(rng()>dn*.8)continue;
    const off=sd*(half+34+rng()*55),p=at(s+rng()*step,off),w=18+rng()*22,d=18+rng()*22;
    if(dist(p.x,p.z)<half+28||!clear(p.x,p.z,fp(w,d)))continue;if(!free(p.x,p.z,Math.max(w,d)*.7))continue;take(p.x,p.z,Math.max(w,d)*.7);
    const H=14+Math.pow(rng(),1.4)*55;if(rng()<.2)tower(p.x,p.z,w,d,40+rng()*60,p.hd,0);else mid(p.x,p.z,w,d,H,p.hd);made++;}}
  // construction cranes
  {let n=Math.round(5*tf+1),made=0;for(let a=0;a<400&&made<n;a++){const th=rng()*6.2832,pr=polarR(th),rho=.42+rng()*.3,x=Math.cos(th)*pr*rho,z=Math.sin(th)*pr*rho;
    if(dist(x,z)<half+70||!free(x,z,18))continue;take(x,z,18);crane(x,z,rng()*6.28);made++;}}
  /* ---- suburbs ---- */
  {const nC=Math.round(11*tf)+1;let made=0;
   for(let a=0;a<300&&made<nC;a++){
    const s=rng()*L,sd=rng()<.5?-1:1,off=sd*(half+80+rng()*110),c=at(s,off);
    if(dist(c.x,c.z)<half+70||dist(c.x,c.z)>330)continue;
    const nx=3+((rng()*3)|0),nz=3+((rng()*3)|0),yaw=c.hd+(rng()<.5?0:1.5708);
    const cs=Math.cos(yaw),sn=Math.sin(yaw);let ok=0;
    for(let i=-nx;i<=nx;i++)for(let j=-nz;j<=nz;j++){
      if(rng()<.18)continue;const lx=i*17+(rng()-.5)*3,lz=j*21+(rng()-.5)*3,x=c.x+cs*lx+sn*lz,z=c.z-sn*lx+cs*lz;
      if(dist(x,z)<half+50||!free(x,z,9))continue;take(x,z,9);
      const gz=gmin(x,z,5),w=9+rng()*3,d=7+rng()*2.5,h=5.2+rng()*3.2,wc=rc(WTINT[(rng()*WTINT.length)|0]),rf=rc(ROOFC[(rng()*ROOFC.length)|0]);
      houseB(Bw,x,gz-1.5,z,w,h+1.5,d,yaw+(rng()<.5?0:1.5708),wc,rf,2.6+rng()*1.4,{bld:{tw:12.8,th:13.6,uo:rng(),vo:.3}});ok++;}
    if(ok)made++;}}
  /* ---- industry ---- */
  {const nI=Math.round(4*tf)+1;let made=0;const cc=[0xc0392b,0x2874a6,0x229954,0xd68910,0x7f8c8d,0xf4f4f0,0x8e44ad,0x1a5276];
   for(let a=0;a<300&&made<nI;a++){
    const s=rng()*L,sd=rng()<.5?-1:1,off=sd*(half+90+rng()*120),c=at(s,off);
    if(dist(c.x,c.z)<half+80||dist(c.x,c.z)>320||!free(c.x,c.z,70))continue;take(c.x,c.z,70);
    const yaw=c.hd,cs=Math.cos(yaw),sn=Math.sin(yaw),P=(lx,lz)=>[c.x+cs*lx+sn*lz,c.z-sn*lx+cs*lz];
    for(let i=0;i<3;i++){const q=P(-30+i*30+(rng()-.5)*6,-20),w=34+rng()*20,d=20+rng()*8,h=8+rng()*4,col=rc([0xb9bec4,0x9aa6b4,0xc8c2b4,0x8fa0b0][(rng()*4)|0]),gz=gmin(q[0],q[1],12);
      if(!clear(q[0],q[1],fp(w,d)))continue;
      boxB(Bp,q[0],gz-1.5,q[1],w,h+1.5,d,yaw,col);boxB(Bp,q[0],gz+h,q[1],w+.6,.5,d+.6,yaw,rc(0x70767c));
      for(let k=0;k<3;k++){const v=P(-30+i*30-w*.25+k*w*.25,-20+(rng()-.5)*d*.4);boxB(Bp,v[0],gz+h+.5,v[1],2.2,1.1,2.2,yaw,rc(0x8a9096));}}
    for(let i=0;i<6;i++){const q=P(-35+(i%3)*14,22+((i/3)|0)*16),r=4.2+rng()*2.4,h=9+rng()*5,gz=gmin(q[0],q[1],r);if(!clear(q[0],q[1],r+.5))continue;cylB(Bp,q[0],gz-1,q[1],r,r,h+1,14,rc(i%2?0xe9ecef:0xc8ccd2),{capCol:rc(0x9aa0a6)});}
    {const q=P(26,26),gz=gmin(q[0],q[1],3);if(clear(q[0],q[1],3)){cylB(Bp,q[0],gz-1,q[1],2.2,1.4,34,10,rc(0xc8c0b8));cylB(Bp,q[0],gz+22,q[1],1.9,1.5,4,10,rc(0xd04030));cylB(Bp,q[0],gz+28,q[1],1.6,1.4,3,10,rc(0xd04030));beacons.push([q[0],gz+34,q[1]]);}}
    for(let r=0;r<5;r++)for(let k=0;k<6;k++){if(rng()<.15)continue;const q=P(2+k*12.6,-4+r*5),gz=gmin(q[0],q[1],3),lv=1+((rng()*3)|0);if(!clear(q[0],q[1],fp(12.2,2.5)))continue;for(let u=0;u<lv;u++)boxB(Bp,q[0],gz+u*2.62,q[1],12.2,2.6,2.5,yaw,rc(cc[(rng()*cc.length)|0]));}
    made++;}}
  grp.add(mkMesh(Bg,mats.glass));grp.add(mkMesh(Bw,mats.wall));grp.add(mkMesh(Bp,mats.plain));
  function mkMesh(b,m){const mesh=new T.Mesh(toGeo(b,T),m);mesh.frustumCulled=false;return mesh;}
  /* ---- aircraft warning beacons (blink) ---- */
  if(beacons.length){
    const bm=new T.MeshBasicMaterial({color:0xff3030}),items=beacons.map(p=>({x:p[0],y:p[1],z:p[2],sx:1.6}));
    grp.add(kit.inst(new T.IcosahedronGeometry(1,0),bm,items));
    kit.addUpdater((dt,now)=>{bm.color.setHex(((now/900)|0)%2?0xff3030:0x501010);});
  }
  /* ---- roadside: billboards, signs, sound barriers ---- */
  const BARZ=[[.045,.115,0],[.19,.255,1],[.30,.40,-1],[.47,.575,0],[.66,.74,1],[.85,.95,0]];
  const barOn=(f,sd)=>{for(const z of BARZ)if(f>=z[0]&&f<=z[1]&&(z[2]===0||z[2]===sd))return true;return false;};
  {
    const Bb=mkB(true,false),face=(yaw,sd)=>yaw;
    const nB=Math.round(24*tf);let made=0;
    for(let a=0;a<nB*8&&made<nB;a++){
      const s=40+rng()*(L-80),sd=rng()<.5?-1:1;if(barOn(s/L,sd))continue;
      const off=sd*(half+10+rng()*5),p=at(s,off);if(!free(p.x,p.z,12))continue;take(p.x,p.z,12);
      const gy=kit.terrainH(p.x,p.z),yaw=p.hd+Math.PI-sd*.28,cs=Math.cos(yaw),sn=Math.sin(yaw),ad=(rng()*3)|0,c=AD_CELL(ad);
      for(const q of[-5.2,5.2])boxB(Bb,p.x+cs*q,gy-.5,p.z-sn*q,.5,6.4,.5,yaw,null);
      boxB(Bb,p.x,gy+5,p.z,15.4,4.6,.4,yaw,null);
      // advert on the +z face, slightly in front
      const o=.22,fx=p.x+sn*o,fz=p.z+cs*o;
      quad(Bb,[fx-cs*7.4,gy+5.15,fz+sn*7.4],[fx+cs*7.4,gy+5.15,fz-sn*7.4],[fx+cs*7.4,gy+9.45,fz-sn*7.4],[fx-cs*7.4,gy+9.45,fz+sn*7.4],[[c[0],c[1]],[c[2],c[1]],[c[2],c[3]],[c[0],c[3]]]);
      made++;
    }
    // green exit signs on posts, away from the sound barrier
    for(let a=0,m=0;a<200&&m<Math.round(10*tf);a++){
      const s=120+rng()*(L-240),sd=1;if(barOn(s/L,sd))continue;
      const off=sd*(half+5.5),p=at(s,off);if(!free(p.x,p.z,6))continue;take(p.x,p.z,6);
      const gy=p.y-.2,yaw=p.hd+Math.PI-sd*.1,cs=Math.cos(yaw),sn=Math.sin(yaw),c=SIGN_CELL(m%2);
      for(const q of[-2,2])boxB(Bb,p.x+cs*q,gy,p.z-sn*q,.18,4.6,.18,yaw,null);
      boxB(Bb,p.x,gy+2.4,p.z,5.6,2.6,.2,yaw,null);const o=.11,fx=p.x+sn*o,fz=p.z+cs*o;
      quad(Bb,[fx-cs*2.7,gy+2.5,fz+sn*2.7],[fx+cs*2.7,gy+2.5,fz-sn*2.7],[fx+cs*2.7,gy+4.8,fz-sn*2.7],[fx-cs*2.7,gy+4.8,fz+sn*2.7],[[c[0],c[1]],[c[2],c[1]],[c[2],c[3]],[c[0],c[3]]]);
      m++;
    }
    grp.add(mkMesh(Bb,new T.MeshLambertMaterial({map:boardTexture(kit),side:T.DoubleSide})));
  }
  { // sound barriers: wall + posts, uv tile 6 m
    const Bs=mkB(true,false),nJ=Math.floor(L/DS),offB=half+3.2;
    for(const sd of[-1,1]){
      for(let j=0;j<nJ;j++){
        const f=j*DS/L;if(!barOn(f,sd))continue;
        const a=at(j*DS,sd*offB),A=[a.x,a.y-.5,a.z],At=[a.x,a.y+3.4,a.z],b2=at((j+1)*DS,sd*offB),B=[b2.x,b2.y-.5,b2.z],Bt=[b2.x,b2.y+3.4,b2.z];
        const u0=j*DS/6,u1=(j+1)*DS/6;
        if(sd>0)quad(Bs,A,B,Bt,At,[[u0,0],[u1,0],[u1,1],[u0,1]]);else quad(Bs,B,A,At,Bt,[[u1,0],[u0,0],[u0,1],[u1,1]]);
        if(j%2===0)boxB(Bs,a.x,a.y-.5,a.z,.3,4.0,.3,a.hd,null);
      }
    }
    if(Bs.p.length)grp.add(mkMesh(Bs,new T.MeshLambertMaterial({map:barrierTexture(kit),side:T.DoubleSide})));
  }
  /* ---- trees (instanced: broadleaf, poplar, cypress) ---- */
  {
    const tIt={broad:[],broadTrunk:[],pop:[],cyp:[]},gr=[0x3c7a34,0x4a8a3a,0x2f6b2f,0x5a9a3c,0x6aa844,0x347232,0x84a83c],cg=[0x1f4a2a,0x275a30,0x1c3f26],pg=[0x4a8a3a,0x5a9a3c,0x6aa844,0x3c7a34];
    const addTree=(tp,x,z)=>{
      if(dist(x,z)<half+9||!free(x,z,3))return false;take(x,z,3);const y=kit.terrainH(x,z);
      if(tp===0){const s=.65+rng()*.45;tIt.broadTrunk.push({x:x,y:y-.3,z:z,sx:s,c:0x5a4630});tIt.broad.push({x:x,y:y-.3,z:z,sx:s,sy:s*(.85+rng()*.4),ry:rng()*6,c:gr[(rng()*gr.length)|0]});}
      else if(tp===1){const s=.75+rng()*.4;tIt.pop.push({x:x,y:y+1.2+s*6.5,z:z,sx:s*1.35,sy:s*6.5,sz:s*1.35,ry:rng()*6,c:pg[(rng()*pg.length)|0]});}
      else{const s=.6+rng()*.4;tIt.cyp.push({x:x,y:y-.2,z:z,sx:s*1.5,sy:s*8,sz:s*1.5,ry:rng()*6,c:cg[(rng()*cg.length)|0]});}
      return true;};
    const nCop=Math.round(60*tf);
    for(let c=0;c<nCop;c++){
      const s=rng()*L,sd=rng()<.5?-1:1,off=sd*(half+11+Math.pow(rng(),1.5)*120),p=at(s,off),R=8+rng()*18,mix=rng(),n=4+((rng()*9)|0);
      for(let i=0;i<n;i++){const a=rng()*6.28,r=Math.sqrt(rng())*R;addTree(mix<.55?0:mix<.8?(rng()<.5?0:1):2,p.x+Math.cos(a)*r,p.z+Math.sin(a)*r);}
    }
    for(let l=0;l<Math.round(8*tf)+1;l++){
      const s0=rng()*L,sd=rng()<.5?-1:1,off=sd*(half+13+rng()*4),len=140+rng()*140,tp=rng()<.6?1:2;
      for(let q=0;q<len;q+=9+rng()*3){const p=at(s0+q,off+sd*(rng()-.5)*2);addTree(tp,p.x,p.z);}
    }
    const mt=(m)=>new T.MeshLambertMaterial(m);
    const crown=mkB(false,false);lumpB(crown,T,0,6.6,0,3.0,2.9,3.0,1);lumpB(crown,T,1.5,5.6,.8,2.0,1.8,2.0,0);lumpB(crown,T,-1.4,5.9,-.6,1.9,1.7,1.9,0);
    if(tIt.broad.length){grp.add(kit.inst(kit.geo('CylinderGeometry',.22,.35,5.5,6).clone().translate(0,2.75,0),mt({}),tIt.broadTrunk));grp.add(kit.inst(toGeo(crown,T),mt({}),tIt.broad));}
    if(tIt.pop.length)grp.add(kit.inst(kit.geo('SphereGeometry',1,7,6),mt({}),tIt.pop));
    if(tIt.cyp.length)grp.add(kit.inst(kit.geo('ConeGeometry',1,1,7).clone().translate(0,.5,0),mt({}),tIt.cyp));
  }
  return{polarR,rhoOf,free,take,dist,mkMesh,mats,rng,tf,at};
}

/* ---------- far field: wind turbines, pylons with wires, viaduct with moving traffic ---------- */
function buildFar(ctx,S){
  const kit=ctx.kit,T=kit.THREE,grp=ctx.grp,rng=S.rng,tf=S.tf,half=ctx.st.half,dist=S.dist,free=S.free,take=S.take,at=S.at,L=ctx.L;
  const Bp=mkB(false,true),plain=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const W=hex2rgb(0xf0f2f4);
  // turbines: placed along the road at 190 to 360 m from the centre line (far hills beyond the city)
  const turb=[];const nT=Math.round(12*tf);
  for(let a=0;a<600&&turb.length<nT;a++){
    const s=rng()*L,sd=rng()<.5?-1:1,off=sd*(200+rng()*150),p=at(s,off),x=p.x,z=p.z,d=dist(x,z);
    if(d<190||d>360||!free(x,z,60))continue;take(x,z,60);
    const y=kit.terrainH(x,z),yaw=1.9+(rng()-.5)*.3;
    cylB(Bp,x,y-2,z,3.0,1.7,89,10,W);boxB(Bp,x,y+85,z,4.2,4.2,12,yaw,hex2rgb(0xdfe3e6));
    turb.push({x:x+Math.sin(yaw)*7,y:y+87,z:z+Math.cos(yaw)*7,yaw:yaw,ang:rng()*6.28,sp:.7+rng()*.5});
  }
  if(turb.length){
    const bb=mkB(false,true),c=hex2rgb(0xf4f6f8);
    for(let k=0;k<3;k++){const a=k*2.0944,ca=Math.cos(a),sa=Math.sin(a),R=(x,y)=>[x*ca-y*sa,x*sa+y*ca,0];
      const p=[R(-1.6,2),R(1.6,2),R(.45,50),R(-.45,50)];quad(bb,p[0],p[1],p[2],p[3],null,c);}
    grp.add(mkMeshS(Bp,plain));
    const im=kit.inst(toGeo(bb,T),plain,turb.map(t=>({x:t.x,y:t.y,z:t.z,sx:1})));
    const tmp=new T.Object3D();tmp.rotation.order='YZX';
    kit.addUpdater(dt=>{for(let i=0;i<turb.length;i++){const t=turb[i];t.ang+=t.sp*dt;tmp.position.set(t.x,t.y,t.z);tmp.rotation.set(0,t.yaw,t.ang);tmp.updateMatrix();im.setMatrixAt(i,tmp.matrix);}im.instanceMatrix.needsUpdate=true;});
    grp.add(im);
  }else grp.add(mkMeshS(Bp,plain));
  function mkMeshS(b,m){const mesh=new T.Mesh(toGeo(b,T),m);mesh.frustumCulled=false;return mesh;}
  // pylons
  {
    const g=mkB(false,true),col=hex2rgb(0x8a9098),lv=[[0,3.4],[10,2.6],[20,1.7],[28,1.0],[36,.65],[42,.3]];
    for(let i=0;i<lv.length-1;i++){const a=lv[i],b=lv[i+1];
      for(const sx of[-1,1])for(const sz of[-1,1])rodB(g,[sx*a[1],a[0],sz*a[1]],[sx*b[1],b[0],sz*b[1]],.45,col);
      rodB(g,[-a[1],a[0],a[1]],[a[1],a[0],a[1]],.25,col);rodB(g,[-a[1],a[0],-a[1]],[a[1],a[0],-a[1]],.25,col);rodB(g,[a[1],a[0],-a[1]],[a[1],a[0],a[1]],.25,col);rodB(g,[-a[1],a[0],-a[1]],[-a[1],a[0],a[1]],.25,col);
      rodB(g,[-a[1],a[0],a[1]],[b[1],b[0],-b[1]],.2,col);rodB(g,[a[1],a[0],a[1]],[-b[1],b[0],-b[1]],.2,col);}
    boxB(g,0,27.6,0,17,.6,.6,0,col);boxB(g,0,35.6,0,11,.6,.6,0,col);
    // one line of pylons running along the road, 170 m apart, on one side at about 195 m from the centre line
    const n=Math.round(12*tf),items=[],pts=[],side=rng()<.5?-1:1,s0=rng()*L;
    for(let i=0;i<n*3&&items.length<n&&i*170<L;i++){
      const p=at(s0+i*170,side*195),x=p.x,z=p.z,d=dist(x,z);
      if(d<170||d>365)continue;const y=kit.terrainH(x,z);items.push({x:x,y:y-1,z:z,sx:1,ry:p.hd});pts.push({x:x,y:y-1,z:z,yaw:p.hd});
    }
    if(items.length){
      grp.add(kit.inst(toGeo(g,T),plain,items));
      const lp=[],att=[[-8,28],[8,28],[0,42]];
      for(let i=0;i<pts.length-1;i++){const A=pts[i],B=pts[i+1];if(Math.hypot(A.x-B.x,A.z-B.z)>260)continue;
        for(const q of att){const w=(P)=>[P.x+Math.cos(P.yaw)*q[0],P.y+q[1],P.z-Math.sin(P.yaw)*q[0]],a=w(A),b=w(B);let pv=a;
          for(let k=1;k<=8;k++){const t=k/8,cur=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-5*4*t*(1-t),a[2]+(b[2]-a[2])*t];lp.push(pv[0],pv[1],pv[2],cur[0],cur[1],cur[2]);pv=cur;}}}
      if(lp.length){const lg=new T.BufferGeometry();lg.setAttribute('position',new T.BufferAttribute(new Float32Array(lp),3));const ls=new T.LineSegments(lg,new T.LineBasicMaterial({color:0x40464e}));ls.frustumCulled=false;grp.add(ls);}
    }
  }
  // viaduct
  for(let a=0;a<80;a++){
    // a 340 m span running beside the road, 200 m off the centre line on one side (high above, visual only)
    const s0=rng()*L,side=rng()<.5?-1:1,pa=at(s0,side*200),pb=at(s0+340,side*200),ax=pa.x,az=pa.z,bx=pb.x,bz=pb.z,mx=(ax+bx)/2,mz=(az+bz)/2;
    if([[ax,az],[bx,bz],[mx,mz]].some(q=>{const d=dist(q[0],q[1]);return d<170||d>350;}))continue;
    const len=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bx-ax,bz-az),cs=Math.cos(yaw),sn=Math.sin(yaw);
    let top=-1e9;for(let i=0;i<=10;i++){const t=i/10;top=Math.max(top,kit.terrainH(ax+(bx-ax)*t,az+(bz-az)*t));}top+=15;
    // ground piers must clear the road; the deck itself is high above it (visual only)
    {let ok=true;for(let q=-len/2+10;q<len/2;q+=30){if(dist(mx+sn*q,mz+cs*q)<half+4){ok=false;break;}}if(!ok)continue;}
    const V=mkB(false,true),cx=mx,cz=mz,conc=hex2rgb(0xb4b8bc);
    boxB(V,cx,top,cz,11,1.3,len,yaw,conc);boxB(V,cx+cs*5.5,top+1.3,cz-sn*5.5,.35,1.0,len,yaw,hex2rgb(0x9ea3a8));boxB(V,cx-cs*5.5,top+1.3,cz+sn*5.5,.35,1.0,len,yaw,hex2rgb(0x9ea3a8));
    for(let q=-len/2+10;q<len/2;q+=30){const px=cx+sn*q,pz=cz+cs*q,g0=kit.terrainH(px,pz);boxB(V,px,g0-1,pz,2.2,top-g0+1,2.2,yaw,conc);boxB(V,px,top-1.4,pz,8,1.4,2.4,yaw,conc);}
    take(cx,cz,len/2);grp.add(mkMeshS(V,plain));
    const nC=8,items=[];for(let i=0;i<nC;i++)items.push({x:0,y:0,z:0,sx:1.9,sy:1.4,sz:4,c:[0xd83030,0xe8e8e8,0x2060c0,0x303030,0xe0b020][i%5]});
    const im=kit.inst(kit.geo('BoxGeometry',1,1,1),new T.MeshLambertMaterial(),items),tmp=new T.Object3D(),sp=26;tmp.rotation.order='YXZ';
    kit.addUpdater((dt,now)=>{const t=now/1000;for(let i=0;i<nC;i++){let u=((t*sp/len+i/nC)%1);const lane=(i%2?1:-1)*2.0,s=(i%2?u:1-u)*len-len/2;
      tmp.position.set(cx+sn*s+cs*lane,top+2,cz+cs*s-sn*lane);tmp.rotation.set(0,yaw+(i%2?0:Math.PI),0);tmp.scale.set(1.9,1.4,4);tmp.updateMatrix();im.setMatrixAt(i,tmp.matrix);}im.instanceMatrix.needsUpdate=true;});
    grp.add(im);break;
  }
}

/* ---------- registration ---------- */
const KINDS=['sedan','sedan','sedan','hatch','hatch','suv','suv','taxi','taxi','police','van','van','delivery','bus','tanker','container'];
ApexKit.register('highway',{
  propScale:0,
  kinds:KINDS,
  nObst:4,
  obstKinds:['cones','drums','worksign'],
  // Non-circular loop: a long start/finish straight on the top (east-west), a 180 degree hairpin at the
  // east end, an S-chicane on the bottom straight and a fast sweeper at the west end.
  // Driving order: east along the top, round the hairpin, west along the bottom.
  trackShape(st,kit){
    return [
      [-700,150],[-500,150],[-300,150],[-100,150],[100,150], // top straight, start/finish at [-700,150]
      [300,150],[430,75],[430,-75],[300,-150],               // hairpin (R 150)
      [150,-150],[0,-190],[-150,-110],[-300,-150],           // chicane on the bottom straight
      [-450,-150],[-620,-190],[-760,-120],[-830,0],[-780,110] // fast west sweeper back to the top
    ];
  },
  roadTexture(st,kit){return makeRoadTexture(st,kit);},
  terrainFeat:terrainFeatFn,
  terrainColor:terrainColorFn,
  atmosphere(ctx){
    try{ctx.sky.material=makeSkyMaterial(ctx,ctx.kit);}catch(e){console.warn('[highway] sky',e);}
    ctx.hemi.color.setHex(0xc4dcff);
  },
  props(ctx){
    const kit=ctx.kit;
    // drop the built-in clouds and flat city (replaced below)
    const del=[];ctx.grp.children.forEach(o=>{
      if(o.isGroup&&o.children.length===4&&o.children[0].material&&o.children[0].material.isMeshBasicMaterial&&o.children[0].material.transparent)del.push(o);});
    let S=null;
    try{S=buildScenery(ctx);}catch(e){console.warn('[highway] scenery',e);}
    if(S){
      ctx.grp.children.forEach(o=>{if(o.isInstancedMesh&&o.count===150&&o.material&&o.material.map)del.push(o);});
      try{buildFar(ctx,S);}catch(e){console.warn('[highway] far',e);}
    }
    try{buildClouds(ctx,kit);if(S)for(const o of del)ctx.grp.remove(o);else if(del.length&&false)0;}catch(e){console.warn('[highway] clouds',e);}
    try{fixRoadUV(ctx);}catch(e){console.warn('[highway] uv',e);}
    try{buildRoadMarks(ctx,kit);}catch(e){console.warn('[highway] marks',e);}
  },
  vehicle(kind,rng,kit){return makeVehicle(kind,rng,kit);},
  obstacle(kind,rng,kit){return makeObstacle(kind,rng,kit);}
});
})();
