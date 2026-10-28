/* Canyon Motocross map module (stage id 'offroad').
   Visual upgrade only: textures, terrain look, scenery, race venue, obstacles, sky. Gameplay values are untouched.
   Everything that creates geometry is deterministic (fixed mulberry seeds / the rng the game hands over). */
(function(){
if(!window.ApexKit||typeof THREE==='undefined')return;
const PI=Math.PI,TAU=PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const sst=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function H(a,b,c){let h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263)+Math.imul(c|0,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967295;}
function seeded(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rgb(hex,m){m=m===undefined?1:m;return[((hex>>16)&255)/255*m,((hex>>8)&255)/255*m,(hex&255)/255*m];}
function mixHex(a,b,t){const A=rgb(a),B=rgb(b);return[lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t)];}
function wrapAng(d){while(d>PI)d-=TAU;while(d<-PI)d+=TAU;return d;}

/* ---------- low poly geometry builder (flat shaded, vertex coloured) ---------- */
function GB(){this.pos=[];this.col=[];this.m=new THREE.Matrix4();this.stack=[];}
GB.prototype={
  push(x,y,z,rx,ry,rz,sx,sy,sz){this.stack.push(this.m);const l=new THREE.Matrix4().compose(new THREE.Vector3(x||0,y||0,z||0),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx||0,ry||0,rz||0)),new THREE.Vector3(sx===undefined?1:sx,sy===undefined?1:sy,sz===undefined?1:sz));this.m=this.m.clone().multiply(l);return this;},
  pop(){this.m=this.stack.pop();return this;},
  tf(p){const e=this.m.elements,x=p[0],y=p[1],z=p[2];return[e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]];},
  tri(a,b,c,col){a=this.tf(a);b=this.tf(b);c=this.tf(c);this.pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);for(let i=0;i<3;i++)this.col.push(col[0],col[1],col[2]);},
  quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col);},
  /* frustum box: bottom w0 x d0 at y0, top w1 x d1 at y1, centred at cx,cz */
  prism(w0,d0,w1,d1,y0,y1,cx,cz,hex,sh){const c=rgb(hex,sh===undefined?1:sh);
    const b=[[cx-w0/2,y0,cz-d0/2],[cx+w0/2,y0,cz-d0/2],[cx+w0/2,y0,cz+d0/2],[cx-w0/2,y0,cz+d0/2]];
    const t=[[cx-w1/2,y1,cz-d1/2],[cx+w1/2,y1,cz-d1/2],[cx+w1/2,y1,cz+d1/2],[cx-w1/2,y1,cz+d1/2]];
    this.quad(b[3],b[2],t[2],t[3],c);this.quad(b[1],b[0],t[0],t[1],c);this.quad(b[2],b[1],t[1],t[2],c);this.quad(b[0],b[3],t[3],t[0],c);this.quad(t[3],t[2],t[1],t[0],c);},
  box(w,h,d,x,y,z,hex,sh){this.prism(w,d,w,d,y,y+h,x,z,hex,sh);},
  revolve(rings,seg,o){o=o||{};const P=[];
    for(let i=0;i<rings.length;i++){const row=[];for(let k=0;k<seg;k++){const a=k/seg*TAU;let r=rings[i].r;if(o.rj)r*=1+o.rj(k,i);row.push([r*Math.cos(a),rings[i].y,r*Math.sin(a)]);}P.push(row);}
    for(let i=0;i<rings.length-1;i++){const c0=rings[i].c;for(let k=0;k<seg;k++){const k2=(k+1)%seg,sh=o.fj?o.fj(k,i):1,col=rgb(c0,sh);
      this.tri(P[i][k],P[i+1][k],P[i+1][k2],col);this.tri(P[i][k],P[i+1][k2],P[i][k2],col);}}
    if(o.cap!==undefined){const n=rings.length-1,cy=rings[n].y+(o.apex||0),col=rgb(o.cap);for(let k=0;k<seg;k++){const k2=(k+1)%seg;this.tri([0,cy,0],P[n][k2],P[n][k],o.fj?rgb(o.cap,o.fj(k,n)):col);}}
  },
  cyl(r0,r1,h,seg,hex,center){const y0=center?-h/2:0;this.revolve([{y:y0,r:r0,c:hex},{y:y0+h,r:r1,c:hex}],seg,{cap:hex});},
  ell(rx,ry,seg,nr,hex,cy,hexTop){const rings=[];for(let i=0;i<=nr;i++){const ph=-PI/2+i/nr*PI;rings.push({y:(cy||0)+ry*Math.sin(ph),r:Math.max(.001,rx*Math.cos(ph)),c:(hexTop!==undefined&&i>=nr/2)?hexTop:hex});}this.revolve(rings,seg,{});},
  build(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.pos),3));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(this.col),3));g.computeVertexNormals();g.computeBoundingSphere();return g;}
};
let VMAT=null;
function vmat(){return VMAT||(VMAT=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));}

/* ---------- colour palettes ---------- */
const STRATA=[0xe3c9a0,0xd1a272,0xc98a4e,0xbe6b3a,0xa5502f,0x8a4130,0xeadbb8,0x9a6a48];
const STRATA_C=STRATA.map(h=>new THREE.Color(h));
const cSandA=new THREE.Color(0xe9cd9b),cSandB=new THREE.Color(0xdcb882),cScrub=new THREE.Color(0xb7a66a),cShoulder=new THREE.Color(0xa56f47),cKick=new THREE.Color(0xb88455),
  cPlate=new THREE.Color(0xd6c4a4),cCrack=new THREE.Color(0x9a8465),cTmp=new THREE.Color(),cTmp2=new THREE.Color(),cDry=new THREE.Color(0xf0d9aa);
let wd1=0,wd2=0;
function worley(x,z,s,sz){const cx=Math.floor(x/sz),cz=Math.floor(z/sz);let d1=9,d2=9,hid=0;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const gx=cx+a,gz=cz+b,px=gx+H(gx,gz,s),pz=gz+H(gx,gz,s+5),dx=x/sz-px,dz=z/sz-pz,d=Math.sqrt(dx*dx+dz*dz);
    if(d<d1){d2=d1;d1=d;hid=H(gx,gz,s+9);}else if(d<d2)d2=d;}
  wd1=d1;wd2=d2;return hid;}

/* ---------- periodic value noise for the seamless road texture ---------- */
function pfield(W,Hh,gx,gy,seed){const f=new Float32Array(W*Hh),lat=new Float32Array(gx*gy);for(let i=0;i<gx*gy;i++)lat[i]=H(i%gx,(i/gx)|0,seed);
  for(let y=0;y<Hh;y++){const fy=y/Hh*gy,iy=Math.floor(fy),ty=fy-iy,sy=ty*ty*(3-2*ty),y0=iy%gy,y1=(iy+1)%gy;
    for(let x=0;x<W;x++){const fx=x/W*gx,ix=Math.floor(fx),tx=fx-ix,sx=tx*tx*(3-2*tx),x0=ix%gx,x1=(ix+1)%gx;
      f[y*W+x]=lerp(lerp(lat[y0*gx+x0],lat[y0*gx+x1],sx),lerp(lat[y1*gx+x0],lat[y1*gx+x1],sx),sy);}}
  return f;}
function roadTex(st,kit){
  const S=kit.TOUCH?256:512,cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d');
  const img=g.createImageData(S,S),d=img.data;
  const fA=pfield(S,S,4,4,11),fB=pfield(S,S,10,10,12),fC=pfield(S,S,28,28,13);
  const cA=rgb(0x7c4d30),cB=rgb(0x9b6840),cM=rgb(0x5a3722),cE=rgb(0xa56f47);
  for(let y=0;y<S;y++){const ph=y/S*TAU*3;
    for(let x=0;x<S;x++){
      const i=y*S+x,u=((x+.5)/S)*12-6,eu=Math.abs(u);
      const t=clamp(fB[i]*.9+fC[i]*.25,0,1);
      let r=lerp(cA[0],cB[0],t),gg=lerp(cA[1],cB[1],t),b=lerp(cA[2],cB[2],t);
      const moist=sst(.58,.8,fA[i]);r=lerp(r,cM[0],moist*.6);gg=lerp(gg,cM[1],moist*.6);b=lerp(b,cM[2],moist*.6);
      let mult=1;
      for(let sg=-1;sg<=1;sg+=2){const u0=sg*2.2+.12*Math.sin(ph+sg),dd=u-u0,ad=Math.abs(dd);
        mult*=1-.4*Math.exp(-dd*dd/.157);const rr=ad-.62;mult+=.13*Math.exp(-rr*rr/.051);}
      mult+=.05*Math.exp(-u*u/2.4);
      mult*=1-.16*sst(4.7,5.5,eu);
      const l=sst(5.45,5.95,eu)*.55;r=lerp(r,cE[0],l);gg=lerp(gg,cE[1],l);b=lerp(b,cE[2],l);
      mult+=(H(x,y,5)-.5)*.1;
      const o=i*4;d[o]=clamp(r*mult,0,1)*255;d[o+1]=clamp(gg*mult,0,1)*255;d[o+2]=clamp(b*mult,0,1)*255;d[o+3]=255;}}
  g.putImageData(img,0,0);
  const k=S/512,px=u=>(u+6)/12*S,rnd=seeded(77);
  // tyre tread chevrons in the two ruts
  g.strokeStyle='rgba(38,22,10,.28)';g.lineWidth=1.6*k;
  for(let sg=-1;sg<=1;sg+=2)for(let y=0;y<S;y+=S/32){const xc=px(sg*2.2+.12*Math.sin(y/S*TAU*3+sg));
    g.beginPath();g.moveTo(xc-6*k,y);g.lineTo(xc,y+5*k);g.lineTo(xc+6*k,y);g.stroke();}
  // pebbles with a small shadow (wrapped vertically)
  const cols=['#c4a173','#d8bd91','#8d6a47','#6c4a30','#b58c5e'],n=S===512?280:110;
  for(let i=0;i<n;i++){const x=rnd()*S,y=rnd()*S,r=(1+rnd()*2.1)*k+.4,c=cols[(rnd()*cols.length)|0];
    for(const yy of[y,y-S,y+S]){if(yy<-6||yy>S+6)continue;g.fillStyle='rgba(30,16,8,.45)';g.beginPath();g.ellipse(x+k,yy+k,r,r*.8,0,0,TAU);g.fill();g.fillStyle=c;g.beginPath();g.ellipse(x,yy,r,r*.8,0,0,TAU);g.fill();}}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
}

/* ---------- shape builders ---------- */
function addBands(rings,y0,y1,r0,r1,n,rng,pal){
  const w=[];let tot=0;for(let i=0;i<n;i++){const t=.5+rng();w.push(t);tot+=t;}
  let y=y0;for(let i=0;i<n;i++){const ya=y,yb=y+(y1-y0)*w[i]/tot;y=yb;const c=pal[(rng()*pal.length)|0],hard=rng()<.4?.035:0;
    const ra=lerp(r0,r1,(ya-y0)/(y1-y0))+hard,rb=lerp(r0,r1,(yb-y0)/(y1-y0))+hard;rings.push({y:ya,r:ra,c:c},{y:yb,r:rb,c:c});}
}
function mesaGeo(seed,seg,kind){
  const rng=seeded(seed),gb=new GB(),rings=[],tal=0xd9b98a;
  const t1=kind===2?.16:.26,cr=kind===2?.3:.64;
  rings.push({y:0,r:1,c:tal},{y:t1*.45,r:lerp(1,cr,.45),c:0xcfa874},{y:t1,r:cr+.04,c:0xcfa874});
  if(kind===1){addBands(rings,t1,.55,cr,cr-.02,5,rng,STRATA);rings.push({y:.55,r:cr,c:0xcfa874},{y:.56,r:cr*.82,c:0xcfa874});addBands(rings,.56,.98,cr*.82,cr*.78,6,rng,STRATA);}
  else addBands(rings,t1,.97,cr,cr*(kind===2?.85:.92),kind===2?9:8,rng,STRATA);
  rings.push({y:1,r:rings[rings.length-1].r*.96,c:0x7a4f38});
  gb.revolve(rings,seg,{rj:(k,i)=>.16*(H(k,i>>1,seed)-.5)+.1*(H(k,0,seed+9)-.5),fj:(k,i)=>.9+.14*H(k,i,seed+3),cap:0xa7704a});
  return gb.build();
}
function hoodooGeo(seed,seg){
  const rng=seeded(seed),gb=new GB(),P=[[0,.95,0xdcb888],[.08,.62,0xd0a070],[.22,.4,0xc4824a],[.34,.5,0xe3c9a0],[.44,.34,0xb5603a],[.58,.42,0xd5a46e],[.7,.36,0xa5502f],[.76,.8,0x9a6a48],[.88,.78,0x8a4130],[.96,.5,0x7a4f38]];
  gb.revolve(P.map(p=>({y:p[0],r:p[1],c:p[2]})),seg,{rj:(k,i)=>.14*(H(k,i,seed)-.5),fj:(k,i)=>.9+.14*H(k,i,seed+2),cap:0xb0794d});
  return gb.build();
}
function archGeo(seed){
  const gb=new GB(),pts=[];
  for(let i=0;i<3;i++)pts.push([-1,-.5+i*.25]);
  for(let i=0;i<=20;i++){const a=PI-i/20*PI;pts.push([Math.cos(a),Math.sin(a)*.95]);}
  for(let i=2;i>=0;i--)pts.push([1,-.5+i*.25]);
  const n=pts.length,m=8,V=[];
  for(let i=0;i<n;i++){
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];const tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
    const nx=-ty,ny=tx,u=i/(n-1),th=lerp(.3,.13,Math.sin(u*PI)),dp=th*1.7,row=[];
    for(let k=0;k<m;k++){const an=k/m*TAU,j=1+.16*(H(i,k,seed)-.5),cs=Math.cos(an)*th*j,sn=Math.sin(an)*dp*j;row.push([pts[i][0]+nx*cs,pts[i][1]+ny*cs,sn]);}
    V.push(row);}
  for(let i=0;i<n-1;i++){const y=pts[i][1],ci=STRATA[((Math.floor((y+.6)*5.2+H(i,0,seed)*.8))%STRATA.length+STRATA.length)%STRATA.length];
    for(let k=0;k<m;k++){const k2=(k+1)%m,c=rgb(ci,.9+.12*H(i,k,seed+4));gb.tri(V[i][k],V[i+1][k],V[i+1][k2],c);gb.tri(V[i][k],V[i+1][k2],V[i][k2],c);}}
  return gb.build();
}
function saguaroGeo(seed,narms,seg){
  const gb=new GB(),r=seeded(seed),g1=0x4d7b3a,g2=0x5f8e46,th=4.2+r()*1.4,tr=.32,rj=k=>(k%2?-.07:.05),fj=k=>k%2?.84:1;
  gb.revolve([{y:0,r:tr*.9,c:g1},{y:.3,r:tr,c:g1},{y:th-.4,r:tr,c:g2},{y:th,r:tr*.7,c:g2},{y:th+.1,r:.12,c:g2}],seg,{rj,fj,cap:g2});
  for(let i=0;i<narms;i++){const sd=i%2?1:-1,hy=th*(.32+.25*r()),reach=.8+.4*r(),up=1+r()*1.2;
    gb.push(sd*tr*.6,hy,0,0,0,-sd*PI/2);gb.revolve([{y:0,r:.2,c:g1},{y:reach,r:.2,c:g1},{y:reach+.1,r:.14,c:g1}],seg,{rj,fj,cap:g1});gb.pop();
    gb.push(sd*(reach+tr*.6),hy,0);gb.revolve([{y:-.05,r:.2,c:g1},{y:up,r:.19,c:g2},{y:up+.12,r:.08,c:g2}],seg,{rj,fj,cap:g2});gb.pop();}
  return gb.build();
}
function barrelGeo(seg){
  const gb=new GB(),P=[[0,.18,0x56803e],[.15,.42,0x5d8a44],[.45,.5,0x5d8a44],[.75,.38,0x4f7a3a],[.92,.16,0x4f7a3a],[.98,.2,0xe8d34a]];
  gb.revolve(P.map(p=>({y:p[0],r:p[1],c:p[2]})),seg,{rj:k=>k%2?-.1:.04,fj:k=>k%2?.82:1,cap:0xe8d34a});return gb.build();
}
function pearGeo(seed){
  const gb=new GB(),r=seeded(seed),g=0x6f9a4a,pads=[[0,.55,0,0,.9],[.3,1.15,0,-.5,.75],[-.35,1.2,0,.55,.7],[.1,1.75,0,.1,.6]];
  for(const p of pads){gb.push(p[0],p[1],p[2],0,0,p[3],p[4],p[4],p[4]*.28);gb.ell(.55,.68,8,4,g,0);gb.pop();
    gb.box(.1,.1,.1,p[0]+Math.sin(p[3])*-.35,p[1]+.7*p[4],0,0xc2334a);}
  gb.box(.1,.1,.1,.4,1.3,.12,0xc2334a);return gb.build();
}
function shrubGeo(seed){
  const gb=new GB(),P=[[0,.5,0x7c8456],[.25,.85,0x8f9060],[.55,.7,0xa49b63],[.8,.3,0x8f9060],[.9,.05,0xa49b63]];
  gb.revolve(P.map(p=>({y:p[0],r:p[1],c:p[2]})),7,{rj:(k,i)=>.28*(H(k,i,seed)-.5),fj:(k,i)=>.85+.25*H(k,i,seed+1),cap:0xa49b63});return gb.build();
}
function tuftGeo(){
  const gb=new GB(),r=seeded(5);
  for(let i=0;i<7;i++){const a=i/7*TAU,l=.22+.1*r(),h=.55+.35*r(),c=rgb(i%2?0xcdb16a:0xb89a52);
    gb.tri([Math.cos(a)*.04-.03,0,Math.sin(a)*.04],[Math.cos(a)*.04+.03,0,Math.sin(a)*.04],[Math.cos(a)*l,h,Math.sin(a)*l],c);}
  return gb.build();
}
function skullSignGeo(){
  const gb=new GB();
  gb.box(.14,1.5,.14,0,0,0,0x6a4a2c);gb.box(.95,.4,.06,0,.95,.09,0xb48a56);gb.box(.9,.05,.07,0,1.0,.1,0x8c3a2a);
  gb.ell(.2,.16,8,4,0xefe6cf,1.52);gb.box(.12,.1,.08,0,1.35,.14,0xe3d9bd);gb.box(.06,.07,.05,-.07,1.55,.18,0x2a2018);gb.box(.06,.07,.05,.07,1.55,.18,0x2a2018);
  for(const s of[-1,1]){gb.push(s*.18,1.55,0,0,0,-s*1.0);gb.cyl(.045,.012,.42,5,0xe9dfc3);gb.pop();}
  return gb.build();
}
function bonesGeo(){
  const gb=new GB();
  for(const a of[.5,-.5]){gb.push(0,.05,0,0,a,PI/2);gb.cyl(.03,.03,.7,5,0xe6dcc2,true);gb.pop();gb.push(Math.sin(a)*.35,.05,Math.cos(a)*.35);gb.ell(.06,.05,5,3,0xe6dcc2,0);gb.pop();gb.push(-Math.sin(a)*.35,.05,-Math.cos(a)*.35);gb.ell(.06,.05,5,3,0xe6dcc2,0);gb.pop();}
  gb.ell(.2,.12,7,4,0xefe6cf,.12);gb.box(.13,.08,.1,0,.05,.22,0xe3d9bd);gb.box(.05,.06,.04,-.07,.18,.14,0x2a2018);gb.box(.05,.06,.04,.07,.18,.14,0x2a2018);
  for(let i=0;i<4;i++){gb.push(.6,0,-.1+i*.14,0,0,0);gb.box(.03,.26,.03,0,0,0,0xe6dcc2);gb.pop();}
  return gb.build();
}
function boulderGeo(seed){
  const gb=new GB(),P=[[0,.85,0xb8703f],[.18,1,0xa05a38],[.45,.95,0xc58a55],[.7,.66,0x8d4f31],[.84,.26,0xd2a16a]];
  gb.revolve(P.map(p=>({y:p[0]*.85,r:p[1]*.93,c:p[2]})),9,{rj:(k,i)=>.2*(H(k,i,seed)-.5),fj:(k,i)=>.88+.2*H(k,i,seed+1),cap:0xd8b27c});return gb.build();
}
function tyreGeo(c1,c2){
  const gb=new GB(),rings=[];for(let i=0;i<=8;i++){const ph=i/8*TAU;rings.push({y:.16+.16*Math.sin(ph),r:.34+.16*Math.cos(ph),c:(i===0||i===7)?c2:c1});}
  gb.revolve(rings,10,{});return gb.build();
}
function hayGeo(){
  const gb=new GB();gb.box(1.3,.7,.75,0,0,0,0xd9b45a);for(const x of[-.3,.3])gb.box(.05,.74,.79,x,-.02,0,0x8a6a2c);gb.box(1.2,.04,.65,0,.7,0,0xe6c878);return gb.build();
}
function flagPoleGeo(){const gb=new GB();gb.cyl(.07,.03,7,6,0xdcdcdc);gb.ell(.08,.08,6,3,0xe0c050,7.05);return gb.build();}
function lightPoleGeo(){const gb=new GB();gb.cyl(.14,.08,10,6,0x6e7379);gb.box(1.5,.16,.55,0,10,0,0x555a60);return gb.build();}
function lampGeo(){const gb=new GB();gb.box(1.3,.05,.45,0,9.95,0,0xfff3c8);return gb.build();}
function bannerFrameGeo(){const gb=new GB();for(const x of[-2,2])gb.box(.08,1.5,.08,x,0,0,0x555555);gb.box(4.1,.06,.06,0,1.45,0,0x444444);return gb.build();}
function bannerPlane(row){
  const g=new THREE.PlaneGeometry(3.9,1.0);g.translate(0,.8,0);const uv=g.attributes.uv,v0=1-(row+1)/4,v1=1-row/4;
  for(let i=0;i<uv.count;i++)uv.setY(i,v0+uv.getY(i)*(v1-v0));return g;
}
function bannerAtlas(){
  const cv=document.createElement('canvas');cv.width=cv.height=512;const g=cv.getContext('2d');
  const rows=[['NITRO CACTUS','#e8561a','#fff4d6','#ffd23a'],['MESA MOTO SUPPLY','#14305c','#ffd23a','#ffffff'],['RATTLER OIL','#17171a','#ff3b30','#f2f2f2'],['DUNE TYRES','#c61f26','#ffffff','#111111']];
  rows.forEach((r,i)=>{const y=i*128;g.fillStyle=r[1];g.fillRect(0,y,512,128);
    g.fillStyle=r[3];for(let x=0;x<512;x+=32){g.fillRect(x,y,16,10);g.fillRect(x+16,y+118,16,10);}
    g.fillStyle=r[2];g.textAlign='center';let fs=70;g.font='bold '+fs+'px Arial,Helvetica,sans-serif';while(g.measureText(r[0]).width>440&&fs>20){fs-=4;g.font='bold '+fs+'px Arial,Helvetica,sans-serif';}
    g.fillText(r[0],256,y+78);g.fillStyle=r[3];g.fillRect(24,y+96,464,5);});
  const t=new THREE.CanvasTexture(cv);t.anisotropy=4;return t;
}
function signTex(txt,bg,fg){
  const cv=document.createElement('canvas');cv.width=256;cv.height=64;const g=cv.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,256,64);g.fillStyle=fg;g.textAlign='center';g.font='bold 40px Arial,Helvetica,sans-serif';g.fillText(txt,128,46);return new THREE.CanvasTexture(cv);
}

/* ---------- vehicles for the pit area (static scenery) ---------- */
function addWheel(gb,x,y,z,r,w){gb.push(x,y,z,0,0,PI/2);gb.cyl(r,r,w,10,0x1b1b1b,true);gb.cyl(r*.55,r*.55,w+.02,8,0x9a9ea3,true);gb.pop();}
function addBike(gb,x,y,z,yaw,col){
  gb.push(x,y,z,0,yaw,0);addWheel(gb,0,.33,.62,.33,.1);addWheel(gb,0,.33,-.62,.33,.1);
  gb.box(.16,.35,.9,0,.4,-.05,0x2a2a2e);gb.box(.22,.22,.5,0,.72,.1,col);gb.box(.18,.1,.6,0,.7,-.35,0x1a1a1a);gb.box(.7,.04,.05,0,.97,.5,0x333333);
  gb.box(.06,.62,.06,0,.35,.62,0xb8bcc2);gb.box(.12,.04,.45,0,.72,.7,col);gb.box(.12,.04,.4,0,.6,-.75,col);gb.pop();
}
function addPickup(gb,col){
  gb.box(1.9,.5,4.8,0,.5,0,col);gb.prism(1.86,1.8,1.5,1.0,1.0,1.75,0,.55,col);gb.box(1.9,.42,1.2,0,1.12,.6,0x26323f);
  gb.box(.08,.35,1.9,-.9,1,-1.45,col);gb.box(.08,.35,1.9,.9,1,-1.45,col);gb.box(1.9,.35,.08,0,1,-2.4,col);gb.box(1.2,.12,.25,0,1.75,.4,0xff9a1f);
  gb.box(1.9,.2,.2,0,.45,2.45,0x2a2a2a);for(const sx of[-1,1])for(const z of[-1.5,1.5])addWheel(gb,sx*.95,.4,z,.4,.3);
}
function addTransporter(gb,col,accent){
  gb.box(2.4,.4,9.4,0,.5,0,0x3a3d42);gb.box(2.5,2.8,6.2,0,.9,-1.3,col);gb.prism(2.35,2.0,2.3,1.5,.9,2.9,0,3.1,col);gb.box(2.3,.9,.12,0,1.9,3.9,0x26323f);
  gb.box(2.54,.5,4.2,0,2.0,-1.7,accent);gb.box(2.54,.12,6.0,0,3.0,-1.3,accent);gb.box(2.2,.1,2.3,0,.5,-5.5,0x8d8f94);
  for(const sx of[-1,1])for(const z of[3.1,-2.2,-3.8])addWheel(gb,sx*1.25,.55,z,.55,.35);
}
function addTrailer(gb,col){
  gb.box(2.2,.18,4.6,0,.6,0,0x55585e);gb.box(2.25,.4,.1,0,.78,1.8,0x55585e);gb.box(.15,.15,1.6,0,.65,3.2,0x44474c);
  for(const sx of[-1,1])addWheel(gb,sx*1.15,.4,-.4,.4,.25);addBike(gb,0,.78,.9,PI/2,col);addBike(gb,0,.78,-.7,PI/2,0x1f6fd1);
}
function addQuad(gb,col){
  gb.box(.9,.3,1.5,0,.4,0,col);gb.box(.6,.15,.7,0,.72,-.2,0x1c1c1c);gb.box(.8,.06,.5,0,.7,.6,0x333333);gb.box(.8,.04,.05,0,.95,.45,0x333333);
  for(const sx of[-1,1])for(const z of[-.55,.6])addWheel(gb,sx*.58,.3,z,.3,.22);gb.box(1.1,.08,.5,0,.55,.85,col);
}
function addTanker(gb){
  gb.box(2.3,.4,7.4,0,.5,0,0x3a3d42);gb.prism(2.3,2.0,2.2,1.3,.9,2.7,0,2.7,0xd4d8de);gb.box(2.2,.8,.12,0,1.8,3.4,0x26323f);
  gb.push(0,1.75,-.9,PI/2,0,0);gb.cyl(.95,.95,4.4,12,0xe8e9ea,true);gb.pop();gb.box(.9,.12,.4,0,2.7,-.9,0xc0392b);
  for(const sx of[-1,1])for(const z of[2.7,-1.8,-3.1])addWheel(gb,sx*1.15,.5,z,.5,.32);
}
function addTent(gb,col,rng){
  gb.prism(5.5,5.5,.6,.6,2.7,3.7,0,0,col);gb.box(5.5,.35,5.5,0,2.4,0,col,.92);
  for(const sx of[-1,1])for(const sz of[-1,1])gb.box(.1,2.5,.1,sx*2.6,0,sz*2.6,0xcfd2d6);
  gb.box(5.2,2.3,.06,0,0,-2.6,0xe8e8e8);gb.box(2.2,.9,.8,0,0,-1.6,0x7a7d83);gb.box(.9,.5,.5,1.4,.9,-1.6,0xc23b2a);
  if(rng()<.8)addBike(gb,-1.4,0,.2,PI/2+(rng()-.5)*.4,[0xff6a00,0xd81e1e,0x1f6fd1,0x1fa34a][(rng()*4)|0]);
}
function pitGeometry(kit,rng,R){
  const gb=new GB(),dirt=0x9a7448;
  gb.revolve([{y:-6,r:R+9,c:dirt},{y:-.7,r:R+3,c:0x93703f},{y:0,r:R,c:0xb59468}],22,{cap:0xb59468,rj:k=>.03*(H(k,1,3)-.5)});
  // parking lines
  for(let i=-3;i<=3;i++)gb.box(.12,.02,4.2,i*5,.02,-18,0xeeeeee);
  const tc=[0xd81e1e,0x1f6fd1,0xffffff,0xe8561a,0x1fa34a];
  for(let i=0;i<5;i++){gb.push(-14+i*7,0,14,0,0,0);addTent(gb,tc[i],rng);gb.pop();}
  gb.push(-16,0,-12,0,.2,0);addTransporter(gb,0xf2f2f2,0xe8561a);gb.pop();
  gb.push(8,0,-14,0,-.35,0);addPickup(gb,0xc92a2a);gb.pop();
  gb.push(8.8,0,-21,0,-.35,0);addTrailer(gb,0xff6a00);gb.pop();
  gb.push(-3,0,-2,0,.6,0);addQuad(gb,0xd81e1e);gb.pop();gb.push(2,0,-4,0,-.4,0);addQuad(gb,0x1f6fd1);gb.pop();
  gb.push(22,0,-8,0,-.9,0);addTanker(gb);gb.pop();
  gb.push(26,0,6,0,.3,0);addPickup(gb,0xe8e8e8);gb.pop();
  for(let i=0;i<4;i++)gb.box(1.3,2.3,1.3,-31,0,-2+i*1.6,0x2f76c8);
  for(let i=0;i<7;i++){const c=[0xc0392b,0x2c6fb8,0xe0b030][i%3];gb.cyl(.4,.4,.95,8,c);}
  for(let i=0;i<6;i++){gb.push(-24+i*.9,0,-16+(i%2)*.6);gb.cyl(.4,.4,.95,8,[0xc0392b,0x2c6fb8,0xe0b030][i%3]);gb.pop();}
  for(let i=0;i<5;i++)gb.box(1,1,1,-30+i*1.2,0,-20,0xb88a52);
  for(const p of[[-30,6],[30,-14],[-12,-30],[16,-30]]){gb.box(.25,10,.25,p[0],0,p[1],0x6e7379);gb.box(1.5,.2,.6,p[0],10,p[1],0xfff3c8);}
  return gb.build();
}
function grandstandGeometry(rng,W,rows,dense){
  const gb=new GB(),crowd=[0xd81e1e,0x1f6fd1,0xffffff,0xf0b21a,0x2a9d4a,0x111111,0xe8561a,0x8a3ec9],skin=[0xf0c8a0,0xd9a070,0x9a6a44,0x6a4228];
  gb.prism(W+20,40,W+4,16,-6,0,0,-6,0x9a7448);
  for(let r=0;r<rows;r++){const y=r*.55,z=-r*1.05;
    gb.box(W,.5,1.05,0,y,z,0x9c9fa4);gb.box(W,.06,1.05,0,y+.5,z,0xb8bbc0);
    for(let x=-W/2+.6;x<W/2-.3;x+=.95){if(rng()>dense)continue;
      const c=crowd[(rng()*crowd.length)|0];gb.box(.55,.62,.35,x,y+.55,z-.05,c);gb.box(.26,.26,.26,x,y+1.15,z-.05,skin[(rng()*4)|0]);}}
  const topY=(rows-1)*.55+.5;
  gb.box(W,topY+.2,.3,0,0,-(rows-1)*1.05-.8,0x7a7d83);
  gb.box(W,.9,.1,0,0,.65,0xe8561a);gb.box(W,.12,.14,0,.9,.65,0xffffff);
  const rz=-(rows-1)*1.05-.4;
  for(let i=0;i<=6;i++){gb.box(.2,topY+4.2,.2,-W/2+i*W/6,0,rz,0xcfd2d6);gb.box(.2,2.8,.2,-W/2+i*W/6,0,1.1,0xcfd2d6);}
  gb.push(0,topY+3.6,0,0,0,0);gb.prism(W+1.2,rows*1.05+3.2,W+1.2,rows*1.05+3.2,0,.18,0,-(rows*1.05)/2+.5,0xf2f2f2);gb.pop();
  gb.box(W+1.2,.5,.12,0,topY+3.4,2.2,0xd81e1e);
  return gb.build();
}
function towerGeometry(){
  const gb=new GB(),body=0xe9e4d6,glass=0x2c4a66;
  gb.prism(9,9,8,8,-4,0,0,0,0x9a7448);
  gb.box(5,3,5,0,0,0,body);gb.box(5.8,.3,5.8,0,3,0,0x555a60);gb.box(5,3,5,0,3.3,0,body);gb.box(5.8,.3,5.8,0,6.3,0,0x555a60);gb.box(5,3,5,0,6.6,0,body);
  for(const y of[.8,4.1,7.4]){gb.box(5.06,1.3,4,0,y,0,glass);gb.box(4,1.3,5.06,0,y,0,glass);}
  gb.box(5.8,.12,5.8,0,9.6,0,0xd81e1e);gb.box(.12,3.5,.12,2,9.6,2,0x888888);gb.box(.6,.4,.05,2.3,12.5,2,0xffffff);
  gb.box(.1,.9,5.8,2.85,3.3,0,0x888888,.9);gb.box(.1,.9,5.8,2.85,6.6,0,0x888888,.9);
  gb.box(1.4,.3,1,0,.001,3.2,0xcfd2d6);
  return gb.build();
}

/* ---------- obstacle meshes ---------- */
let OB=null;
function obGeos(){
  if(OB)return OB;OB={};
  OB.rock=[boulderGeo(1),boulderGeo(2),boulderGeo(3)];
  let gb=new GB();for(let i=0;i<3;i++){gb.push(0,i*.3,0,0,i*.7,0);gb.revolve((()=>{const r=[];for(let q=0;q<=8;q++){const ph=q/8*TAU;r.push({y:.16+.16*Math.sin(ph),r:.34+.16*Math.cos(ph),c:(q===0||q===7)?0xe8e8e8:0x24262a});}return r;})(),10,{});gb.pop();}
  OB.tire=gb.build();
  gb=new GB();for(let i=0;i<4;i++){gb.push(0,i*.3,0,0,i*.9,0);gb.revolve((()=>{const r=[];for(let q=0;q<=8;q++){const ph=q/8*TAU;r.push({y:.16+.16*Math.sin(ph),r:.34+.16*Math.cos(ph),c:(i%2)?0xd81e1e:0xf2f2f2});}return r;})(),10,{});gb.pop();}
  OB.tyrered=gb.build();
  gb=new GB();gb.box(1.3,.7,.75,0,0,0,0xd9b45a);gb.box(.75,.7,1.3,0,.7,0,0xe0bd62);for(const x of[-.3,.3])gb.box(.05,.74,.79,x,-.02,0,0x8a6a2c);for(const z of[-.3,.3])gb.box(.79,.74,.05,0,.68,z,0x8a6a2c);gb.box(.65,.04,1.2,0,1.4,0,0xeed184);
  OB.hay=gb.build();
  gb=new GB();for(const x of[-.42,.42]){gb.cyl(.4,.4,.95,10,0xc0392b);}OB.barrel=null;
  gb=new GB();for(const p of[[-.42,0xc0392b],[.42,0x2c6fb8]]){gb.push(p[0],0,0);gb.cyl(.4,.4,.95,10,p[1]);gb.cyl(.42,.42,.07,10,0x333333);gb.push(0,.4,0);gb.cyl(.42,.42,.07,10,0x333333);gb.pop();gb.pop();}
  gb.push(0,.96,0);gb.cyl(.38,.38,.04,10,0x222222);gb.pop();OB.barrel=gb.build();
  gb=new GB();gb.box(1.1,1.1,1.1,0,0,0,0xb88a52);for(const s of[-.5,.5]){gb.box(.12,1.14,1.14,s,-.02,0,0x8a6438);gb.box(1.14,.12,1.14,0,s*.9+.52,0,0x8a6438);}
  gb.push(0,.55,.56);gb.box(.1,1.3,.04,0,-.65,0,0x7a5430);gb.pop();gb.box(.7,.7,.7,.1,1.1,.05,0xc29a62);OB.crate=gb.build();
  gb=new GB();gb.push(0,.24,0,0,0,PI/2);gb.cyl(.22,.22,5.2,8,0x6e5035,true);gb.pop();
  gb.box(.28,.3,1.2,-1.9,.34,0,0x5a4026);gb.ell(.07,.1,5,3,0xd8e2e8,.62);gb.push(-1.9,.5,.5);gb.ell(.07,.1,5,3,0xd8e2e8,.2);gb.pop();gb.push(-1.9,.5,-.5);gb.ell(.07,.1,5,3,0xd8e2e8,.2);gb.pop();
  gb.box(.1,.1,.5,2.55,.12,0,0xcbb48a);OB.log=gb.build();
  return OB;
}
function holder(geo,sx,sy,sz){const g=new THREE.Group(),m=new THREE.Mesh(geo,vmat());m.castShadow=true;if(sx)m.scale.set(sx,sy,sz);g.add(m);return g;}

/* ---------- placement helpers ---------- */
function mkSpot(kit,rng,reserved){
  return function(d0,d1,tries){
    for(let t=0;t<(tries||14);t++){
      const s=rng()*kit.L,side=rng()<.5?-1:1,off=side*(d0+rng()*(d1-d0)),p=kit.pose(s,off),x=p.x,z=p.z,nr=kit.nearest(x,z);
      if(nr.dist<d0-2)continue;let bad=false;for(const r of reserved)if(Math.hypot(x-r.x,z-r.z)<r.r){bad=true;break;}if(bad)continue;
      return{x,z,y:kit.terrainH(x,z),s,side,dist:nr.dist};}
    return null;};
}
function groundMax(kit,cx,cz,yaw,w,d){
  let m=-1e9;const c=Math.cos(yaw),s=Math.sin(yaw);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const lx=i*w/2,lz=j*d/2;m=Math.max(m,kit.terrainH(cx+lx*c+lz*s,cz-lx*s+lz*c));}
  return m;
}
const faceYaw=(hd,side)=>hd+(side>0?PI/2:-PI/2);

/* ---------- module state ---------- */
const UT={value:0};

ApexKit.register('offroad',{
  texLen:12,
  propScale:.15,
  obstKinds:['rock','rock','tire','hay','barrel','crate','tyrered','rock','log'],

  roadTexture(st,kit){return roadTex(st,kit);},

  // Motocross circuit: long start/finish straight (east), fast south-east sweeper, a tight hairpin,
  // a short chicane on the south side, a west hairpin and a return loop back to the line.
  trackShape(st,kit){
    return [
      [-100,200],[0,200],[100,200],          // start/finish straight
      [180,175],[225,110],                   // downhill sweeper
      [215,40],[185,-5],[140,-40],           // hairpin
      [100,-52],[60,-60],[20,-44],[-20,-60],[-70,-70], // chicane
      [-125,-60],[-165,-25],[-165,20],       // west hairpin
      [-135,70],[-125,135]                   // return loop
    ];
  },

  terrainFeat(x,z,rho,dn,kit){
    const f=kit.fbm,sd=37;
    // wind-blown dunes
    const q=(x*.82+z*.57+24*f(x*.004,z*.004,911,2))/64,a=TAU*q;
    const prof=Math.pow(.5+.5*Math.sin(a+.8*Math.sin(a)),1.4);
    const env=.45+.55*(f(x*.003,z*.003,923,2)*.5+.5);
    let e=4.2*prof*env;
    // canyon wall rising beyond the outer rim, with ledges
    const edge=1.33+.08*f(x*.004,z*.004,sd+77,2);
    const w=sst(edge,edge+.17,rho);
    const steps=w*3,fl=Math.floor(steps),stp=(fl+sst(.55,.9,steps-fl))/3;
    e+=30*stp+4*(w-stp)*0;
    return e;
  },

  terrainColor(cc,x,z,h,sl,dn,n1,near,kit,waterY){
    const half=kit.st.half,f=kit.fbm,sd=kit.st.seed,td=dn-half;
    cc.copy(cSandA).lerp(cSandB,n1);
    const rp=Math.sin((x*.93+z*.37)/5.2+4*f(x*.006,z*.006,sd+61,2))*.025;cc.r+=rp;cc.g+=rp;cc.b+=rp*.9;
    const sc=f(x*.012,z*.012,sd+55,3);if(sc>.12)cc.lerp(cScrub,sst(.12,.45,sc)*.5);
    // dry cracked mud pans
    const mm=f(x*.0035,z*.0035,sd+31,2),mask=sst(.12,.34,mm)*(1-sst(.08,.3,sl))*sst(12,30,td);
    if(mask>.02){const hid=worley(x,z,sd+41,18),e=wd2-wd1;cTmp.copy(cPlate);const sh=(hid-.5)*.08;cTmp.r+=sh;cTmp.g+=sh;cTmp.b+=sh;if(e<.16)cTmp.lerp(cCrack,.9);cc.lerp(cTmp,mask*.85);}
    // pale dust on the dune crests
    const dust=sst(.5,.9,f(x*.01,z*.01,sd+81,2)*.5+.5);cc.lerp(cDry,dust*.18*(1-sst(.1,.3,sl)));
    // strata on steep canyon faces
    const rel=h-15,mk=sst(.3,.62,sl)*sst(8,22,rel);
    if(mk>.01){const kk=h*.17+f(x*.01,z*.01,sd+71,2)*1.4,ki=Math.floor(kk),kf=kk-ki,n=STRATA_C.length;
      cTmp.copy(STRATA_C[((ki%n)+n)%n]);cTmp2.copy(STRATA_C[(((ki+1)%n)+n)%n]);cTmp.lerp(cTmp2,sst(.4,.6,kf));cc.lerp(cTmp,mk);}
    // trampled dirt shoulder next to the track
    const sh1=1-sst(1.5,13,td+(n1-.5)*5);
    if(sh1>0){cTmp.copy(cShoulder).lerp(cKick,n1*.7);cc.lerp(cTmp,clamp(sh1,0,1)*.95);}
    const hs=(H(Math.round(x),Math.round(z),5)-.5)*.05;cc.r+=hs;cc.g+=hs;cc.b+=hs;
  },

  atmosphere(ctx){
    const kit=ctx.kit,scene=ctx.scene,grp=ctx.grp,u=ctx.sky&&ctx.sky.material&&ctx.sky.material.uniforms;
    OB=null;VMAT=null;
    if(u){u.top.value.setHex(0x3f93ee);u.hor.value.setHex(0xffe9c4);}
    if(scene.fog)scene.fog.color.setHex(0xf3d9ae);
    if(scene.background&&scene.background.setHex)scene.background.setHex(0xf3d9ae);
    // cirrus streaks
    {const cv=document.createElement('canvas');cv.width=512;cv.height=64;const g=cv.getContext('2d'),r=seeded(8);
      for(let i=0;i<16;i++){const x=40+r()*430,y=10+r()*44,w=60+r()*150;g.save();g.translate(x,y);g.scale(w/20,1);const gr=g.createRadialGradient(0,0,0,0,0,20);gr.addColorStop(0,'rgba(255,255,255,'+(.35+r()*.35)+')');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,20,0,TAU);g.fill();g.restore();}
      const t=new THREE.CanvasTexture(cv),gm=new THREE.PlaneGeometry(1,1);gm.rotateX(-PI/2);
      const rr=seeded(81),items=[];for(let i=0;i<(kit.TOUCH?8:14);i++){const a=rr()*TAU,d=300+rr()*1700;items.push({x:Math.cos(a)*d,y:650+rr()*250,z:Math.sin(a)*d,sx:500+rr()*700,sy:1,sz:90+rr()*140,ry:rr()*TAU});}
      const m=kit.inst(gm,new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:.6,depthWrite:false,fog:false}),items);grp.add(m);}
    // horizon heat haze
    {const cv=document.createElement('canvas');cv.width=8;cv.height=128;const g=cv.getContext('2d'),gr=g.createLinearGradient(0,0,0,128);
      gr.addColorStop(0,'rgba(255,236,200,0)');gr.addColorStop(.55,'rgba(255,236,200,.1)');gr.addColorStop(1,'rgba(255,236,200,.5)');g.fillStyle=gr;g.fillRect(0,0,8,128);
      const m=new THREE.Mesh(new THREE.CylinderGeometry(1800,1800,240,32,1,true),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,fog:false,side:THREE.BackSide}));
      m.position.y=20;m.frustumCulled=false;m.renderOrder=-1;grp.add(m);}
  },

  props(ctx){
    const kit=ctx.kit,grp=ctx.grp,T=kit.TOUCH,half=kit.st.half,L=kit.L,rng=seeded(2027),tk=T?.6:1;
    const reserved=[],spot=mkSpot(kit,rng,reserved);
    const mat=vmat();
    // remove the plain built-in mesa boxes (replaced by banded mesas below)
    for(const c of grp.children.slice()){if(c.isInstancedMesh&&c.count===24&&c.geometry&&c.geometry.attributes.position.count===24){grp.remove(c);}}

    /* ===== race venue ===== */
    // timing tower + grandstand near start/finish, pit area before the line
    {const sT=-12,pT=kit.pose(sT,22);const yaw=faceYaw(pT.hd,1);
      const y=groundMax(kit,pT.x,pT.z,yaw,6,6)+.1;const m=new THREE.Mesh(towerGeometry(),mat);m.position.set(pT.x,y,pT.z);m.rotation.y=yaw;grp.add(m);reserved.push({x:pT.x,z:pT.z,r:12});}
    {const rng2=seeded(404),rows=T?5:8,W=36;const p=kit.pose(26,-21);const yaw=faceYaw(p.hd,-1);
      const cx=p.x+Math.sin(yaw)*0,cz=p.z;const y=groundMax(kit,cx,cz,yaw,W,(rows*1.05)+2)+.1;
      const m=new THREE.Mesh(grandstandGeometry(rng2,W,rows,T?.55:.72),mat);m.position.set(cx,y,cz);m.rotation.y=yaw;grp.add(m);reserved.push({x:cx,z:cz,r:30});
      // sponsor board above the stand
      const sm=new THREE.Mesh(new THREE.PlaneGeometry(12,3),new THREE.MeshBasicMaterial({map:signTex('CANYON MX','#e8561a','#fff4d6'),side:THREE.DoubleSide}));
      sm.position.set(0,rows*.55+6.6,1.9);sm.rotation.y=0;const holderG=new THREE.Group();holderG.position.set(cx,y,cz);holderG.rotation.y=yaw;holderG.add(sm);grp.add(holderG);}
    {let placed=false;const rng3=seeded(606);
      for(const [off,sg] of [[62,1],[78,1],[62,-1],[78,-1],[95,1]]){const s0=L-95,p=kit.pose(s0,sg*off),nr=kit.nearest(p.x,p.z);if(nr.dist<48)continue;
        const yaw=faceYaw(p.hd,sg),R=36,sm=[];for(let a=0;a<8;a++)sm.push(kit.terrainH(p.x+Math.cos(a)*R*.6,p.z+Math.sin(a)*R*.6));
        const y=Math.max.apply(null,sm)+.3;const m=new THREE.Mesh(pitGeometry(kit,rng3,R),mat);m.position.set(p.x,y,p.z);m.rotation.y=yaw;grp.add(m);reserved.push({x:p.x,z:p.z,r:R+12});
        // PITS sign
        const sg2=new THREE.Group();sg2.position.set(p.x,y,p.z);sg2.rotation.y=yaw;const sp=new THREE.Mesh(new THREE.PlaneGeometry(8,2),new THREE.MeshBasicMaterial({map:signTex('PIT AREA','#14305c','#ffd23a'),side:THREE.DoubleSide}));sp.position.set(0,8.5,20);
        const bar=new THREE.Mesh(new THREE.BoxGeometry(.3,8.5,.3),new THREE.MeshLambertMaterial({color:0x555a60}));bar.position.set(-4,4.2,20);const bar2=bar.clone();bar2.position.x=4;sg2.add(sp,bar,bar2);grp.add(sg2);placed=true;break;}
    }

    /* ===== banners, flags, light poles along the track ===== */
    {const atlas=bannerAtlas(),bm=new THREE.MeshBasicMaterial({map:atlas,side:THREE.DoubleSide}),perRow=[[],[],[],[]],frames=[],step=T?56:28;
      let n=0;for(let s=14;s<L-10;s+=step){for(const sd of[-1,1]){const p=kit.pose(s+(sd>0?step/2:0),sd*(half+9.2));if(Math.hypot(p.x-0,p.z-0)<0)continue;
        let near=false;for(const r of reserved)if(Math.hypot(p.x-r.x,p.z-r.z)<r.r*.7){near=true;break;}if(near)continue;
        const y=kit.terrainH(p.x,p.z)-.05,ry=faceYaw(p.hd,sd);perRow[n%4].push({x:p.x,y,z:p.z,sx:1,ry});frames.push({x:p.x,y,z:p.z,sx:1,ry});n++;}}
      for(let i=0;i<4;i++)if(perRow[i].length)grp.add(kit.inst(bannerPlane(i),bm,perRow[i]));
      if(frames.length)grp.add(kit.inst(bannerFrameGeo(),mat,frames));}
    {const poles=[],flags=[],chk=[];const fs=T?160:80;
      for(let s=30;s<L-20;s+=fs){for(const sd of[-1,1]){const p=kit.pose(s+(sd>0?fs/2:0),sd*(half+11.5));let near=false;for(const r of reserved)if(Math.hypot(p.x-r.x,p.z-r.z)<r.r*.8){near=true;break;}if(near)continue;
        const y=kit.terrainH(p.x,p.z)-.05;poles.push({x:p.x,y,z:p.z,sx:1});flags.push({x:p.x,y:y+6.9,z:p.z,sx:1,ry:-.29+(H(Math.round(p.x),Math.round(p.z),3)-.5)*.3,c:[0xe8561a,0xd81e1e,0xf2f2f2,0x1f6fd1,0xffd23a][((s/fs)|0)%5]});}}
      for(const r of reserved){const k=T?4:8;for(let i=0;i<k;i++){const a=i/k*TAU,x=r.x+Math.cos(a)*(r.r-10),z=r.z+Math.sin(a)*(r.r-10);poles.push({x,y:kit.terrainH(x,z)-.05,z,sx:1});flags.push({x,y:kit.terrainH(x,z)+6.9,z,sx:1,ry:-.29,c:[0xe8561a,0xd81e1e,0xf2f2f2,0x1f6fd1][i%4]});}}
      if(poles.length){grp.add(kit.inst(flagPoleGeo(),mat,poles));
        const fm=new THREE.MeshLambertMaterial({side:THREE.DoubleSide});
        fm.onBeforeCompile=function(sh){sh.uniforms.uT=UT;sh.vertexShader='uniform float uT;\n'+sh.vertexShader.replace('#include <begin_vertex>','vec3 transformed=vec3(position);float ph=uT*4.0+instanceMatrix[3].x*0.21+instanceMatrix[3].z*0.17;transformed.z+=sin(ph+position.x*3.2)*0.16*position.x;transformed.y+=sin(ph*1.3+position.x*2.1)*0.05*position.x;');};
        const fg=new THREE.PlaneGeometry(1.5,.9,10,2);fg.translate(.75,-.45,0);grp.add(kit.inst(fg,fm,flags));
        kit.addUpdater((dt,now)=>{UT.value=now*.001;});}}
    {const poles=[],heads=[],ls=T?140:70;
      for(let s=10;s<L;s+=ls){const sd=((s/ls)|0)%2?1:-1,p=kit.pose(s,sd*(half+13));let near=false;for(const r of reserved)if(Math.hypot(p.x-r.x,p.z-r.z)<r.r){near=true;break;}if(near)continue;
        const y=kit.terrainH(p.x,p.z)-.05,ry=faceYaw(p.hd,sd)+PI;poles.push({x:p.x,y,z:p.z,sx:1,ry});heads.push({x:p.x,y,z:p.z,sx:1,ry});}
      if(poles.length){grp.add(kit.inst(lightPoleGeo(),mat,poles));grp.add(kit.inst(lampGeo(),new THREE.MeshBasicMaterial({color:0xfff3c8}),heads));}}

    /* ===== tyre walls and hay bales on the outside of the sharpest corners ===== */
    {const cand=[];for(let s=0;s<L;s+=8){const a=kit.pose(s-18,0).hd,b=kit.pose(s+18,0).hd,dh=wrapAng(b-a);cand.push({s,k:Math.abs(dh),side:dh>0?1:-1});}
      cand.sort((p,q)=>q.k-p.k);const pick=[];
      for(const c of cand){if(c.s<110||c.s>L-110)continue;let ok=true;for(const q of pick){let ds=Math.abs(c.s-q.s);ds=Math.min(ds,L-ds);if(ds<130){ok=false;break;}}if(ok)pick.push(c);if(pick.length>=(T?6:10))break;}
      const tyres=[],hay=[],tcol=[0x2a2a2a,0x2a2a2a,0xd81e1e,0x2a2a2a,0xf2f2f2,0x2a2a2a];
      pick.forEach((c,idx)=>{const useTyre=idx<(T?4:6),len=useTyre?(T?9:13):(T?5:8);
        for(let i=-len;i<=len;i++){const p=kit.pose(c.s+i*1.05,c.side*(half+11.4)),y=kit.terrainH(p.x,p.z)-.05;
          if(useTyre){const rows=T?2:3;for(let r=0;r<rows;r++)tyres.push({x:p.x,y:y+r*.31,z:p.z,sx:1,ry:(i+r)*.9,c:tcol[(i+r*2+idx*3+60)%6]});}
          else if(i%2===0){hay.push({x:p.x,y,z:p.z,sx:1,ry:p.hd+PI/2});if(i%4===0)hay.push({x:p.x,y:y+.7,z:p.z,sx:1,ry:p.hd+PI/2});}}});
      if(tyres.length)grp.add(kit.inst(tyreGeo(0x777777,0xdddddd),new THREE.MeshLambertMaterial({vertexColors:true}),tyres));
      if(hay.length)grp.add(kit.inst(hayGeo(),mat,hay));}

    /* ===== dust on the jump tops, chalk start line ===== */
    {const DS=kit.DS,pos=[],uv=[],idx=[];let vi=0;
      for(const f of[.1,.32,.5,.7,.9]){const j0=Math.floor((f*L+3)/DS),j1=Math.ceil((f*L+23)/DS),base=vi;
        for(let j=j0;j<=j1;j++){const s=j*DS,a=kit.pose(s,-half),b=kit.pose(s,half),v=(j-j0)/(j1-j0);pos.push(a.x,a.y+.06,a.z,b.x,b.y+.06,b.z);uv.push(0,v,1,v);vi+=2;}
        for(let j=0;j<j1-j0;j++){const i=base+j*2;idx.push(i,i+1,i+2,i+1,i+3,i+2);}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(uv),2));g.setIndex(idx);
      const cv=document.createElement('canvas');cv.width=cv.height=128;const c2=cv.getContext('2d'),im=c2.createImageData(128,128);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){const u=x/127,v=y/127,ev=Math.exp(-Math.pow((v-.42)/.28,2)),eu=sst(0,.2,u)*sst(1,.8,u),nz=.45+.55*H(x>>1,y>>1,7),a=ev*eu*nz*.6;const o=(y*128+x)*4;im.data[o]=226;im.data[o+1]=192;im.data[o+2]=146;im.data[o+3]=a*255;}
      c2.putImageData(im,0,0);const tex=new THREE.CanvasTexture(cv);
      const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,fog:true}));
      m.frustumCulled=false;grp.add(m);
      // start line
      const sp=[],a1=kit.pose(-.3,-half+.2),b1=kit.pose(-.3,half-.2),a2=kit.pose(.3,-half+.2),b2=kit.pose(.3,half-.2);
      sp.push(a1.x,a1.y+.06,a1.z,b1.x,b1.y+.06,b1.z,a2.x,a2.y+.06,a2.z,b2.x,b2.y+.06,b2.z);
      const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(sp),3));lg.setIndex([0,1,2,1,3,2]);
      const lm=new THREE.Mesh(lg,new THREE.MeshBasicMaterial({color:0xf4efe0,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));lm.frustumCulled=false;grp.add(lm);}

    /* ===== layered mesas, buttes, spires, arches, hoodoos, canyon rim ===== */
    {const rm=seeded(55),seg=T?10:14,mg=[mesaGeo(11,seg,0),mesaGeo(12,seg,1),mesaGeo(13,seg,2)],lists=[[],[],[]],tint=[0xffffff,0xf6e6d4,0xffe0c8,0xf0d8c0];
      const nM=T?20:34;for(let i=0;i<nM;i++){const a=rm()*TAU,r=420+rm()*220,x=Math.cos(a)*r,z=Math.sin(a)*r,kd=rm()<.45?1:(rm()<.5?0:2);
        const wdt=kd===2?14+rm()*14:40+rm()*55,ht=kd===2?70+rm()*60:35+rm()*60;
        lists[kd].push({x,y:kit.terrainH(x,z)-3,z,sx:wdt,sy:ht,sz:wdt*(.7+rm()*.5),ry:rm()*TAU,c:tint[(rm()*4)|0]});}
      // closer buttes inside and outside the loop
      for(let i=0;i<(T?8:14);i++){const p=spot(95,330,30);if(!p)continue;const kd=i%3===1?2:0,wdt=kd===2?7+rm()*6:16+rm()*22,ht=kd===2?32+rm()*26:18+rm()*26;
        lists[kd].push({x:p.x,y:p.y-2,z:p.z,sx:wdt,sy:ht,sz:wdt*(.8+rm()*.4),ry:rm()*TAU,c:tint[(rm()*4)|0]});}
      for(let i=0;i<3;i++)if(lists[i].length)grp.add(kit.inst(mg[i],mat,lists[i]));
      // arches
      const ar=[];for(let i=0;i<(T?2:4);i++){const p=spot(160,420,40);if(!p)continue;const s=15+rm()*10;ar.push({x:p.x,y:p.y-.5,z:p.z,sx:s,sy:s*(.9+rm()*.4),sz:s,ry:rm()*TAU,c:0xffffff});}
      if(ar.length)grp.add(kit.inst(archGeo(3),mat,ar));
      // hoodoos
      const hd=[];for(let i=0;i<(T?24:46);i++){const p=spot(50,360,20);if(!p)continue;const s=1.4+rm()*2.2;hd.push({x:p.x,y:p.y-.3,z:p.z,sx:s,sy:s*(4.5+rm()*3),sz:s,ry:rm()*TAU,c:tint[(rm()*4)|0]});}
      if(hd.length)grp.add(kit.inst(hoodooGeo(5,T?7:9),mat,hd));}

    /* ===== boulders and pebbles ===== */
    {const rb=seeded(66),bg=[boulderGeo(21),boulderGeo(22)],lists=[[],[]],n=Math.round(110*tk);
      for(let i=0;i<n;i++){const p=spot(17,260,10);if(!p)continue;const s=.8+Math.pow(rb(),2)*4.2;lists[i%2].push({x:p.x,y:p.y-.2*s,z:p.z,sx:s*(1+rb()*.4),sy:s*(.7+rb()*.5),sz:s,ry:rb()*TAU,c:[0xffffff,0xf4dcc4,0xe8c8aa][(rb()*3)|0]});}
      for(let i=0;i<2;i++)if(lists[i].length)grp.add(kit.inst(bg[i],mat,lists[i]));
      const peb=[],np=Math.round(520*tk);
      for(let i=0;i<np;i++){const s=rb()*L,sd=rb()<.5?-1:1,off=sd*(half+1.8+rb()*5.2),p=kit.pose(s,off),y=kit.terrainH(p.x,p.z),sz=.07+rb()*.17;
        peb.push({x:p.x,y:y-.02,z:p.z,sx:sz,sy:sz*.6,sz:sz*(.8+rb()*.5),ry:rb()*TAU,c:[0xb08a5e,0x8d6a47,0xc9a87c,0x7a5a3c][(rb()*4)|0]});}
      grp.add(kit.inst(kit.geo('IcosahedronGeometry',1,0),new THREE.MeshLambertMaterial(),peb));}

    /* ===== desert plants ===== */
    {const rc=seeded(77),seg=T?6:8;
      const sg=[saguaroGeo(1,3,seg),saguaroGeo(2,2,seg)],sl=[[],[]],ns=Math.round(46*tk);
      for(let i=0;i<ns;i++){const p=spot(18,300,10);if(!p)continue;const s=.9+rc()*.7;sl[i%2].push({x:p.x,y:p.y-.15,z:p.z,sx:s,ry:rc()*TAU,c:[0xffffff,0xeef3e6,0xf4f8ee][(rc()*3)|0]});}
      for(let i=0;i<2;i++)if(sl[i].length)grp.add(kit.inst(sg[i],mat,sl[i]));
      const bc=[],nb=Math.round(80*tk);for(let i=0;i<nb;i++){const p=spot(16,260,10);if(!p)continue;const s=.7+rc()*.8;bc.push({x:p.x,y:p.y-.1,z:p.z,sx:s,sy:s*(.8+rc()*.5),ry:rc()*TAU,c:0xffffff});}
      if(bc.length)grp.add(kit.inst(barrelGeo(T?6:8),mat,bc));
      const pp=[],npp=Math.round(70*tk);for(let i=0;i<npp;i++){const p=spot(16,260,10);if(!p)continue;const s=.7+rc()*.7;pp.push({x:p.x,y:p.y-.05,z:p.z,sx:s,ry:rc()*TAU,c:0xffffff});}
      if(pp.length)grp.add(kit.inst(pearGeo(4),mat,pp));
      const sh=[],nsh=Math.round(260*tk);for(let i=0;i<nsh;i++){const p=spot(16,240,10);if(!p)continue;const sc=kit.fbm(p.x*.012,p.z*.012,92,3);if(sc<-.1&&rc()<.6)continue;const s=.7+rc()*1.1;sh.push({x:p.x,y:p.y-.05,z:p.z,sx:s,sy:s*(.6+rc()*.5),ry:rc()*TAU,c:[0xffffff,0xe9e2c4,0xd8d0a8][(rc()*3)|0]});}
      if(sh.length)grp.add(kit.inst(shrubGeo(8),mat,sh));
      const tf=[],ntf=Math.round(300*tk);for(let i=0;i<ntf;i++){const p=spot(15,200,8);if(!p)continue;const s=.8+rc()*.9;tf.push({x:p.x,y:p.y-.02,z:p.z,sx:s,sy:s*(.7+rc()*.6),ry:rc()*TAU,c:0xffffff});}
      if(tf.length)grp.add(kit.inst(tuftGeo(),mat,tf));
      // skull signs and bones
      const sk=[],nsk=T?6:12;for(let i=0;i<nsk;i++){const p=kit.pose((i+.5)/nsk*L+(rc()-.5)*60,(i%2?1:-1)*(half+11.8)),y=kit.terrainH(p.x,p.z)-.05;sk.push({x:p.x,y,z:p.z,sx:1,ry:faceYaw(p.hd,i%2?1:-1)});}
      grp.add(kit.inst(skullSignGeo(),mat,sk));
      const bn=[],nbn=T?6:12;for(let i=0;i<nbn;i++){const p=spot(20,200,10);if(!p)continue;bn.push({x:p.x,y:p.y,z:p.z,sx:1.2+rc(),ry:rc()*TAU});}
      if(bn.length)grp.add(kit.inst(bonesGeo(),mat,bn));
      // tumbleweeds (animated, far from the track)
      const tw=[],tms=T?6:10;for(let i=0;i<tms;i++){const p=spot(70,260,20);if(!p)continue;tw.push({x:p.x,z:p.z,ph:rc(),sp:3+rc()*3,r:.6+rc()*.5});}
      if(tw.length){const twM=new THREE.InstancedMesh(kit.geo('IcosahedronGeometry',1,1),new THREE.MeshLambertMaterial({color:0x9a7a46,wireframe:true}),tw.length);twM.frustumCulled=false;grp.add(twM);
        const o=new THREE.Object3D(),dx=.96,dz=.29,D=70;
        kit.addUpdater((dt,now)=>{const t=now*.001;for(let i=0;i<tw.length;i++){const w=tw[i],u=((t*w.sp/D)+w.ph)%1,dist=(u-.5)*D,x=w.x+dx*dist,z=w.z+dz*dist,sc=w.r*sst(0,.08,u)*sst(0,.08,1-u);
          o.position.set(x,kit.terrainH(x,z)+sc+.15*Math.abs(Math.sin(t*3+i)),z);o.rotation.set(0,0,-dist/Math.max(.3,w.r));o.scale.set(sc,sc,sc);o.updateMatrix();twM.setMatrixAt(i,o.matrix);}twM.instanceMatrix.needsUpdate=true;});}
      // dust devils
      const dd=[],nd=T?2:3;for(let i=0;i<nd;i++){const p=spot(110,300,30);if(p)dd.push({x:p.x,z:p.z,ph:i*2.1});}
      if(dd.length){
        const cv=document.createElement('canvas');cv.width=128;cv.height=256;const g=cv.getContext('2d'),r2=seeded(9);
        for(let i=0;i<46;i++){const x=r2()*128,w=2+r2()*6;g.fillStyle='rgba(222,190,140,'+(.15+r2()*.4)+')';g.fillRect(x,0,w,256);}
        const gr=g.createLinearGradient(0,0,0,256);g.globalCompositeOperation='destination-in';gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.25,'rgba(0,0,0,.8)');gr.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=gr;g.fillRect(0,0,128,256);
        const dt0=new THREE.CanvasTexture(cv);dt0.wrapS=THREE.RepeatWrapping;
        const cm=new THREE.MeshBasicMaterial({map:dt0,transparent:true,depthWrite:false,side:THREE.DoubleSide,opacity:.7}),cg=new THREE.CylinderGeometry(9,2.2,70,14,1,true);cg.translate(0,35,0);
        const meshes=dd.map(()=>{const m=new THREE.Mesh(cg,cm);m.frustumCulled=false;grp.add(m);return m;});
        kit.addUpdater((dt,now)=>{const t=now*.001;for(let i=0;i<dd.length;i++){const d=dd[i],m=meshes[i],x=d.x+Math.sin(t*.07+d.ph)*30,z=d.z+Math.cos(t*.05+d.ph*1.3)*30;
          m.position.set(x,kit.terrainH(x,z)-.5,z);m.rotation.y=t*2.2+d.ph;const s=1+.15*Math.sin(t*.6+d.ph);m.scale.set(s,1,s);}});}
    }
  },

  /* obstacles: honest hw/hl, never wider than the original rocks (about 1.2 m) except the pole segment */
  obstacle(kind,rng,kit){
    const G=obGeos();
    if(kind==='rock'){const r=.7+rng()*.5,v=(rng()*3)|0,sy=r*(.85+rng()*.3);return{obj:holder(G.rock[v],r,sy,r*(.92+rng()*.1)),hw:r,hl:r};}
    if(kind==='tire')return{obj:holder(G.tire),hw:.6,hl:.6};
    if(kind==='tyrered')return{obj:holder(G.tyrered),hw:.6,hl:.6};
    if(kind==='hay')return{obj:holder(G.hay),hw:.68,hl:.68};
    if(kind==='barrel')return{obj:holder(G.barrel),hw:.85,hl:.45};
    if(kind==='crate')return{obj:holder(G.crate),hw:.58,hl:.58};
    if(kind==='log')return{obj:holder(G.log),hw:2.65,hl:.5};
    return null;
  }
});
})();
