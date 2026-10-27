/* Amazon Trail (stage id 'jungle') map module. Visual upgrade only: road texture, forest floor, scenery,
   traffic models and obstacle models. Deterministic: only kit.mulberry(<fixed>) or the rng handed in is used. */
(function(){
'use strict';
if(!window.ApexKit||!window.THREE)return;
const T=window.THREE,PI=Math.PI,TAU=PI*2,SEED=5151,TEXLEN=20;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function h2(ix,iz,s){let h=Math.imul(ix,374761393)+Math.imul(iz,668265263)+Math.imul(s,1442695041);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967295;}
const rgb=c=>[(c>>16&255)/255,(c>>8&255)/255,(c&255)/255];
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
let KIT=null;
const STAT={calls:0,tris:0};

/* ================= baking helpers (merged, vertex coloured geometry) ================= */
function Bk(){return{p:[],n:[],c:[],u:[]};}
const _v=new T.Vector3(),_n=new T.Vector3(),_nm=new T.Matrix3(),_e=new T.Euler(),_q=new T.Quaternion(),_s1=new T.Vector3();
const _a=new T.Vector3(),_b=new T.Vector3(),_c=new T.Vector3(),_t=new T.Vector3();
function XF(x,y,z,rx,ry,rz,sx,sy,sz){
  _e.set(rx||0,ry||0,rz||0,'YXZ');_q.setFromEuler(_e);_v.set(x||0,y||0,z||0);
  if(sx===undefined){sx=1;sy=1;sz=1;}else if(sy===undefined){sy=sx;sz=sx;}
  _s1.set(sx,sy,sz);return new T.Matrix4().compose(_v,_q,_s1);
}
function put(b,g,m,col,jit,uvr){
  const gi=g.index?g.toNonIndexed():g;
  const P=gi.attributes.position,N=gi.attributes.normal,U=gi.attributes.uv,n=P.count;
  _nm.getNormalMatrix(m);
  let cr=1,cg=1,cb=1;if(typeof col==='number'){cr=(col>>16&255)/255;cg=(col>>8&255)/255;cb=(col&255)/255;}
  for(let i=0;i<n;i++){
    _v.fromBufferAttribute(P,i).applyMatrix4(m);_n.fromBufferAttribute(N,i).applyMatrix3(_nm).normalize();
    b.p.push(_v.x,_v.y,_v.z);b.n.push(_n.x,_n.y,_n.z);
    let r=cr,g_=cg,bb=cb;
    if(typeof col==='function'){const c=col(_n,_v);r=c[0];g_=c[1];bb=c[2];}
    if(jit){const h=1+(h2(Math.round(_v.x*40),Math.round(_v.y*40)+Math.round(_v.z*40)*1013,11)-.5)*2*jit;r*=h;g_*=h;bb*=h;}
    b.c.push(r,g_,bb);
    let uu=0,vv=0;if(U){uu=U.getX(i);vv=U.getY(i);}
    if(uvr){uu=uvr[0]+uu*uvr[2];vv=uvr[1]+vv*uvr[3];}
    b.u.push(uu,vv);
  }
}
function tri(b,m,A,B,C,ca,cb,cc){
  _a.set(A[0],A[1],A[2]).applyMatrix4(m);_b.set(B[0],B[1],B[2]).applyMatrix4(m);_c.set(C[0],C[1],C[2]).applyMatrix4(m);
  _n.subVectors(_b,_a);_t.subVectors(_c,_a);_n.cross(_t);const l=_n.length();if(l<1e-9)return;_n.divideScalar(l);
  b.p.push(_a.x,_a.y,_a.z,_b.x,_b.y,_b.z,_c.x,_c.y,_c.z);
  for(let i=0;i<3;i++)b.n.push(_n.x,_n.y,_n.z);
  b.c.push(ca[0],ca[1],ca[2],cb[0],cb[1],cb[2],cc[0],cc[1],cc[2]);b.u.push(0,0,0,0,0,0);
}
/* strip: leaf/frond ribbon along points, optional midrib fold */
function strip(b,m,pts,wid,c0,c1,fold,sv){
  c0=rgb(c0);c1=rgb(c1);const n=pts.length,S=[];
  for(let i=0;i<n;i++){
    const a=pts[i],p0=pts[Math.max(i-1,0)],p1=pts[Math.min(i+1,n-1)];let sx,sz;
    if(sv){sx=sv[0];sz=sv[1];}else{sx=p1[2]-p0[2];sz=-(p1[0]-p0[0]);const l=Math.hypot(sx,sz);if(l<1e-5){sx=1;sz=0;}else{sx/=l;sz/=l;}}
    const w=wid[i];S.push([[a[0]-sx*w,a[1]-fold*w,a[2]-sz*w],a,[a[0]+sx*w,a[1]-fold*w,a[2]+sz*w]]);
  }
  for(let i=0;i<n-1;i++){
    const ca=mixc(c0,c1,i/(n-1)),cb=mixc(c0,c1,(i+1)/(n-1));
    if(fold===0){const a=S[i][0],bq=S[i][2],c=S[i+1][2],d=S[i+1][0];tri(b,m,a,bq,c,ca,ca,cb);tri(b,m,a,c,d,ca,cb,cb);continue;}
    for(let k=0;k<2;k++){const a=S[i][k],bq=S[i][k+1],c=S[i+1][k+1],d=S[i+1][k];tri(b,m,a,bq,c,ca,ca,cb);tri(b,m,a,c,d,ca,cb,cb);}
  }
}
function fin(b){const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));
  g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.u,2));
  g.computeBoundingSphere();return g;}
const GEO=(t,...a)=>KIT.geo(t,...a);
const BX=(B,w,h,d,x,y,z,col,rx,ry,rz,jit,uvr)=>put(B,GEO('BoxGeometry',w,h,d),XF(x,y,z,rx,ry,rz),col,jit===undefined?.07:jit,uvr);
const CY=(B,r0,r1,h,sg,x,y,z,col,rx,ry,rz,jit,uvr,open)=>put(B,open?GEO('CylinderGeometry',r0,r1,h,sg,1,true):GEO('CylinderGeometry',r0,r1,h,sg),XF(x,y,z,rx,ry,rz),col,jit===undefined?.05:jit,uvr);
const EL=(B,a,b,c,x,y,z,col,jit,ry)=>put(B,GEO('IcosahedronGeometry',1,0),XF(x,y,z,0,ry||0,0,a,b,c),col,jit===undefined?.08:jit);
function ROD(B,a,c,r0,r1,sg,col,jit){
  const d=new T.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]),len=d.length();if(len<1e-6)return;
  const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  const m=new T.Matrix4().compose(new T.Vector3((a[0]+c[0])/2,(a[1]+c[1])/2,(a[2]+c[2])/2),q,new T.Vector3(1,len,1));
  put(B,GEO('CylinderGeometry',r0,r1,1,sg,1,true),m,col,jit===undefined?.05:jit);
}
function mk(g,mat,items,trisPer){
  if(!items.length)return null;
  const m=new T.InstancedMesh(g,mat,items.length),o=new T.Object3D(),c=new T.Color();o.rotation.order='YXZ';
  items.forEach((it,i)=>{o.position.set(it.x,it.y,it.z);o.rotation.set(it.rx||0,it.ry||0,it.rz||0);const sx=it.sx||1;
    o.scale.set(sx,it.sy===undefined?sx:it.sy,it.sz===undefined?sx:it.sz);o.updateMatrix();m.setMatrixAt(i,o.matrix);
    c.setHex(it.c===undefined?0xffffff:it.c);m.setColorAt(i,c);});
  m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;m.frustumCulled=false;
  STAT.calls++;STAT.tris+=trisPer*items.length;return m;
}
const triCount=g=>g.attributes.position.count/3;
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}

/* ================= textures ================= */
function lat(nx,ny,seed){const r=KIT.mulberry(seed);const a=new Float32Array(nx*ny);for(let i=0;i<a.length;i++)a[i]=r();return{a,nx,ny};}
function sm(l,u,v){const x=u*(l.nx-1),y=v*l.ny;let ix=Math.floor(x),iy=Math.floor(y);const fx=x-ix,fy=y-iy;
  if(ix>=l.nx-1)ix=l.nx-2;const iy1=(iy+1)%l.ny;iy=iy%l.ny;const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),a=l.a,nx=l.nx;
  return(a[ix+iy*nx]+(a[ix+1+iy*nx]-a[ix+iy*nx])*sx)*(1-sy)+(a[ix+iy1*nx]+(a[ix+1+iy1*nx]-a[ix+iy1*nx])*sx)*sy;}
const rutC=(sd,v)=>sd<0?-1.15+.10*Math.sin(TAU*2*v+.7)+.06*Math.sin(TAU*5*v+2.1):1.15+.09*Math.sin(TAU*2*v+3.9)+.06*Math.sin(TAU*4*v+.4);

function buildRoad(st,kit){
  const TC=kit.TOUCH,W=TC?256:512,H=TC?512:1024,half=st.half,ppm=W/(2*half),ppv=H/TEXLEN;
  const c=cv(W,H),g=c.getContext('2d'),rnd=kit.mulberry(5101);
  const A=lat(6,14,1),B=lat(16,40,2),C=lat(48,120,3),D=lat(4,9,4),E=lat(7,22,5);
  const img=g.createImageData(W,H),d=img.data;
  for(let y=0;y<H;y++){
    const v=y/H;
    for(let x=0;x<W;x++){
      const u=(x+.5)/W,xm=(u-.5)*2*half;
      const n1=sm(A,u,v),n2=sm(B,u,v),n3=sm(C,u,v),n4=sm(D,u,v),n5=sm(E,u,v);
      let r,gg,b;const k=n1*.55+n2*.45;
      r=84+(112-84)*k;gg=56+(76-56)*k;b=40+(54-40)*k;
      const gr=.92+.16*n3;r*=gr;gg*=gr;b*=gr;r+=(n4-.5)*16;
      const wet=sstep(.58,.76,n1*.5+n4*.5);r+=(66-r)*wet*.45;gg+=(46-gg)*wet*.45;b+=(34-b)*wet*.45;
      // ruts
      const dm=Math.min(Math.abs(xm-rutC(-1,v)),Math.abs(xm-rutC(1,v)));
      const rd=1-sstep(.17,.42,dm+(n2-.5)*.12);
      r+=(50-r)*rd*.88;gg+=(35-gg)*rd*.88;b+=(27-b)*rd*.88;
      const ring=sstep(.38,.55,dm)*(1-sstep(.55,.8,dm))*(.5+n3*.5)*.45;
      r+=(140-r)*ring;gg+=(100-gg)*ring;b+=(72-b)*ring;
      // grass strip in patches
      const gs=(1-sstep(.18,.5,Math.abs(xm)+(n2-.5)*.4))*sstep(.35,.62,n5)*.85;
      const ga=.8+.4*n3;r+=(70*ga-r)*gs;gg+=(98*ga-gg)*gs;b+=(52*ga-b)*gs;
      // moss + dark edge
      const e=half-Math.abs(xm);
      const ms=(1-sstep(.12,.35+.8*n2,e))*.92,ma=.75+.5*n3;
      r+=(62*ma-r)*ms;gg+=(92*ma-gg)*ms;b+=(40*ma-b)*ms;
      const ed=(1-sstep(0,.2,e))*.7;r+=(36-r)*ed;gg+=(34-gg)*ed;b+=(24-b)*ed;
      const i=(y*W+x)*4;d[i]=r;d[i+1]=gg;d[i+2]=b;d[i+3]=255;
    }
  }
  g.putImageData(img,0,0);
  const X=m=>(m+half)*ppm,Y=m=>m*ppv,S=W/512;
  const WR=fn=>{for(const dy of[-H,0,H]){g.save();g.translate(0,dy);fn();g.restore();}};
  // tyre tread chevrons in ruts
  WR(()=>{g.strokeStyle='rgba(22,15,10,.2)';g.lineWidth=1.5*S;for(const sd of[-1,1])for(let yy=0;yy<H;yy+=12*S){const cx=X(rutC(sd,yy/H));g.beginPath();g.moveTo(cx-8*S,yy);g.lineTo(cx,yy+5*S);g.lineTo(cx+8*S,yy);g.stroke();}});
  // wet gravel patches
  const gcols=['#6e6a60','#57544e','#7c786c','#46443f','#6f6554','#8a867a'];
  for(let p=0;p<4;p++){
    const cx=X((rnd()*2-1)*half*.7),cy=rnd()*H,rx=(.5+rnd()*.6)*ppm,ry=(.8+rnd()*.8)*ppv;
    WR(()=>{
      const gd=g.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry));gd.addColorStop(0,'rgba(44,38,30,.55)');gd.addColorStop(1,'rgba(44,38,30,0)');
      g.fillStyle=gd;g.beginPath();g.ellipse(cx,cy,rx*1.2,ry*1.1,0,0,TAU);g.fill();
    });
    const rr=kit.mulberry(900+p);
    for(let i=0;i<140;i++){const a=rr()*TAU,q=Math.sqrt(rr()),px=cx+Math.cos(a)*rx*q,py=cy+Math.sin(a)*ry*q,s=(1.1+rr()*1.7)*S,col=gcols[(rr()*6)|0];
      WR(()=>{g.fillStyle='rgba(20,16,12,.55)';g.beginPath();g.ellipse(px+S,py+S,s,s*.8,0,0,TAU);g.fill();g.fillStyle=col;g.beginPath();g.ellipse(px,py,s,s*.8,0,0,TAU);g.fill();
        g.fillStyle='rgba(235,242,236,.22)';g.fillRect(px-s*.4,py-s*.5,Math.max(1,s*.4),Math.max(1,s*.3));});}
  }
  // puddles
  for(let i=0;i<11;i++){
    const inRut=i<7,sd=rnd()<.5?-1:1,vy=rnd(),cy=vy*H;
    const cx=X(inRut?rutC(sd,vy):(rnd()*2-1)*half*.75);
    const rx=(inRut?.2+rnd()*.12:.45+rnd()*.5)*ppm,ry=(inRut?.5+rnd()*.9:.4+rnd()*.7)*ppv,p1=rnd()*6,p2=rnd()*6;
    const path=()=>{g.beginPath();for(let k=0;k<=24;k++){const a=k/24*TAU,rr=1+.16*Math.sin(3*a+p1)+.09*Math.sin(5*a+p2);const px=cx+Math.cos(a)*rx*rr,py=cy+Math.sin(a)*ry*rr;k?g.lineTo(px,py):g.moveTo(px,py);}g.closePath();};
    WR(()=>{
      const gd=g.createLinearGradient(0,cy-ry,0,cy+ry);gd.addColorStop(0,'rgba(120,148,140,.92)');gd.addColorStop(.3,'rgba(56,68,64,.95)');gd.addColorStop(1,'rgba(30,31,28,.97)');
      path();g.fillStyle=gd;g.fill();g.lineWidth=2*S;g.strokeStyle='rgba(150,108,76,.5)';g.stroke();
      g.strokeStyle='rgba(236,246,240,.38)';g.lineWidth=1.5*S;g.beginPath();g.ellipse(cx-rx*.1,cy-ry*.55,rx*.5,ry*.18,0,Math.PI*1.05,Math.PI*1.95);g.stroke();
      g.fillStyle='rgba(240,248,244,.5)';g.fillRect(cx+rx*.2,cy+ry*.1,2*S,1.5*S);
    });
  }
  // exposed roots
  for(let i=0;i<6;i++){
    const sd=i%2?1:-1,sy=rnd()*H,len=(1.4+rnd()*1.4)*ppm,wd=(6+rnd()*6)*S,sx0=X(sd*(half+.15)),ex=sx0-sd*len,ey=sy+(rnd()-.5)*50*S,cxp=(sx0+ex)/2,cyp=sy+(rnd()-.5)*40*S;
    const mx=.25*sx0+.5*cxp+.25*ex,my=.25*sy+.5*cyp+.25*ey,bx=mx-sd*len*.45,by=my+(rnd()-.3)*60*S;
    WR(()=>{
      const dr=(w,col,ox)=>{g.strokeStyle=col;g.lineWidth=w;g.lineCap='round';g.beginPath();g.moveTo(sx0+ox,sy+ox);g.quadraticCurveTo(cxp+ox,cyp+ox,ex+ox,ey+ox);g.stroke();
        g.lineWidth=w*.55;g.beginPath();g.moveTo(mx+ox,my+ox);g.lineTo(bx+ox,by+ox);g.stroke();};
      dr(wd+4*S,'rgba(25,18,12,.55)',1);dr(wd,'#4b3626',0);dr(wd*.35,'#80603f',-wd*.15);
    });
  }
  // leaf litter
  const lc=['#8a5a1f','#a8742a','#6e4a1a','#5f7326','#b58a35','#7b3f1d','#97712b','#4e6a28','#c19a3f'];
  for(let i=0;i<330;i++){
    const edge=rnd()<.45,xm=edge?(rnd()<.5?-1:1)*(half-rnd()*1.3):(rnd()*2-1)*half,px=X(xm),py=rnd()*H,rx=(3+rnd()*5)*S,ang=rnd()*TAU,col=lc[(rnd()*lc.length)|0],al=.7+rnd()*.3;
    WR(()=>{g.save();g.translate(px,py);g.rotate(ang);g.globalAlpha=al;g.fillStyle=col;g.beginPath();g.ellipse(0,0,rx,rx*.45,0,0,TAU);g.fill();
      g.globalAlpha=al*.6;g.strokeStyle='rgba(40,24,10,.8)';g.lineWidth=.8*S;g.beginPath();g.moveTo(-rx,0);g.lineTo(rx,0);g.stroke();g.restore();});
  }
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
}
function mudTex(){
  const c=cv(256,256),g=c.getContext('2d'),r=KIT.mulberry(77);
  g.fillStyle='#f2eee2';g.fillRect(0,0,256,256);
  for(let i=0;i<500;i++){g.fillStyle='rgba(130,104,72,'+(.05+r()*.1)+')';g.fillRect(r()*256,r()*256,1+r()*2,1+r()*2);}
  const gd=g.createLinearGradient(0,256,0,110);gd.addColorStop(0,'rgba(86,58,38,.92)');gd.addColorStop(1,'rgba(86,58,38,0)');g.fillStyle=gd;g.fillRect(0,110,256,146);
  const dc=['#5a3d28','#6b4a30','#4a3322','#7a5636'];
  for(let i=0;i<800;i++){const yb=Math.pow(r(),3)*220,y=256-yb,rr=(1+r()*5)*(1+(1-yb/220)*.6);g.globalAlpha=.3+r()*.45;g.fillStyle=dc[(r()*4)|0];g.beginPath();g.arc(r()*256,y,rr,0,TAU);g.fill();}
  g.globalAlpha=.3;g.fillStyle='#5a3d28';for(let i=0;i<60;i++){g.fillRect(r()*256,150+r()*100,1+r()*2,10+r()*40);}
  g.globalAlpha=1;const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;
}
function woodTex(){
  const c=cv(256,256),g=c.getContext('2d'),r=KIT.mulberry(78);
  g.fillStyle='#a8875c';g.fillRect(0,0,256,192);
  for(let i=0;i<90;i++){g.fillStyle='rgba(70,48,28,'+(.15+r()*.3)+')';g.fillRect(r()*256,0,1+r()*2.5,192);}
  for(let i=0;i<8;i++){g.fillStyle='rgba(50,34,20,.5)';g.beginPath();g.ellipse(r()*256,r()*192,3+r()*4,6+r()*8,0,0,TAU);g.fill();}
  for(let i=0;i<260;i++){g.fillStyle='rgba(84,60,38,'+(.3+r()*.4)+')';g.fillRect(r()*256,r()*192,1+r()*3,1+r()*3);}
  g.fillStyle='#d8b985';g.fillRect(0,192,64,64);g.strokeStyle='#a98457';g.lineWidth=1.5;
  for(let k=4;k<31;k+=4.5){g.beginPath();g.arc(32,224,k,0,TAU);g.stroke();}
  g.fillStyle='#6a4a2c';g.beginPath();g.arc(32,224,2.5,0,TAU);g.fill();
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;
}
function signAtlas(){
  const c=cv(512,512),g=c.getContext('2d'),r=KIT.mulberry(79);
  const cells=[['CUIDADO','#f2c230','#111','tri'],['CURVA','#f2c230','#111','curve'],['PONTE','#f0a830','#111','bridge'],['CAMINHOES','#f2c230','#111','truck'],
    ['DEVAGAR','#f4f0e6','#c4281c','plain'],['LAMA','#f0a830','#111','wave'],['MAO DUPLA','#f2c230','#111','arrows'],['RIO >>','#7a5a3a','#f4f0e6','wood']];
  cells.forEach((q,i)=>{
    const cx=(i%2)*256,cy=((i/2)|0)*128;g.save();g.beginPath();g.rect(cx,cy,256,128);g.clip();g.translate(cx,cy);
    g.fillStyle=q[1];g.fillRect(0,0,256,128);
    if(q[3]==='wood'){for(let k=0;k<5;k++){g.fillStyle='rgba(30,18,8,.35)';g.fillRect(0,k*26,256,2);}}
    g.strokeStyle=q[3]==='plain'?'#c4281c':(q[3]==='wood'?'#3a2814':'#111');g.lineWidth=7;g.strokeRect(6,6,244,116);
    g.fillStyle=q[2];g.strokeStyle=q[2];g.lineWidth=6;g.textAlign='center';
    let tx=128;const sz=q[0].length>8?25:(q[0].length>5?32:42);
    if(q[3]==='tri'){tx=150;g.beginPath();g.moveTo(52,26);g.lineTo(88,92);g.lineTo(16,92);g.closePath();g.lineWidth=5;g.stroke();g.font='bold 40px sans-serif';g.fillText('!',52,86);}
    else if(q[3]==='curve'){tx=160;g.lineWidth=9;g.beginPath();g.arc(70,92,40,PI,PI*1.55);g.stroke();g.beginPath();g.moveTo(88,40);g.lineTo(60,30);g.lineTo(80,64);g.fill();}
    else if(q[3]==='bridge'){tx=160;g.lineWidth=6;g.beginPath();g.moveTo(14,86);g.quadraticCurveTo(52,30,92,86);g.stroke();g.beginPath();g.moveTo(10,92);g.lineTo(96,92);g.stroke();}
    else if(q[3]==='truck'){tx=150;g.fillRect(12,56,50,24);g.fillRect(62,48,20,32);g.beginPath();g.arc(26,86,8,0,TAU);g.arc(70,86,8,0,TAU);g.fill();for(let k=0;k<3;k++){g.beginPath();g.arc(22+k*14,48,7,0,TAU);g.fill();}}
    else if(q[3]==='wave'){tx=160;g.lineWidth=6;for(let k=0;k<3;k++){g.beginPath();g.moveTo(10,44+k*20);for(let x=0;x<80;x+=10)g.lineTo(10+x+5,44+k*20+(x%20?7:-7));g.stroke();}}
    else if(q[3]==='arrows'){tx=170;g.beginPath();g.moveTo(34,28);g.lineTo(52,50);g.lineTo(40,50);g.lineTo(40,96);g.lineTo(28,96);g.lineTo(28,50);g.lineTo(16,50);g.closePath();g.fill();
      g.beginPath();g.moveTo(74,100);g.lineTo(92,78);g.lineTo(80,78);g.lineTo(80,32);g.lineTo(68,32);g.lineTo(68,78);g.lineTo(56,78);g.closePath();g.fill();}
    g.font='bold '+sz+'px sans-serif';g.fillText(q[0],tx,q[3]==='plain'||q[3]==='wood'?78:80);
    const gd=g.createLinearGradient(0,80,0,128);gd.addColorStop(0,'rgba(80,56,36,0)');gd.addColorStop(1,'rgba(80,56,36,.6)');g.fillStyle=gd;g.fillRect(0,80,256,48);
    for(let k=0;k<70;k++){g.fillStyle='rgba(70,50,30,'+(.15+r()*.3)+')';g.beginPath();g.arc(r()*256,70+r()*58,1+r()*2.5,0,TAU);g.fill();}
    g.fillStyle='rgba(60,100,40,.45)';g.beginPath();g.arc(0,0,26,0,TAU);g.fill();
    g.restore();
  });
  return new T.CanvasTexture(c);
}
function waterTex(){
  const c=cv(128,256),g=c.getContext('2d'),r=KIT.mulberry(80);
  g.fillStyle='#3b5d55';g.fillRect(0,0,128,256);
  for(let i=0;i<46;i++){const x=r()*128,y=r()*256,l=10+r()*30;for(const dy of[-256,0,256]){g.strokeStyle='rgba(170,205,190,'+(.1+r()*.2)+')';g.lineWidth=1+r()*2;g.beginPath();g.moveTo(x,y+dy);g.quadraticCurveTo(x+4,y+dy+l/2,x,y+dy+l);g.stroke();}}
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;
}
function dotTex(s,soft){const c=cv(s,s),g=c.getContext('2d');const gd=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  gd.addColorStop(0,'rgba(255,255,255,1)');gd.addColorStop(soft,'rgba(255,255,255,.35)');gd.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gd;g.fillRect(0,0,s,s);return new T.CanvasTexture(c);}
function shaftTex(){const c=cv(64,256),g=c.getContext('2d'),im=g.createImageData(64,256);
  for(let y=0;y<256;y++)for(let x=0;x<64;x++){const a=Math.exp(-Math.pow((x-32)/16,2))*Math.pow(Math.sin(PI*(y+.5)/256),1.4);const i=(y*64+x)*4;im.data[i]=255;im.data[i+1]=255;im.data[i+2]=255;im.data[i+3]=a*255;}
  g.putImageData(im,0,0);return new T.CanvasTexture(c);}

/* ================= streams (terrain valley + water) ================= */
let _S=null,_SL=-1;
function streams(kit){if(_S&&_SL===kit.L)return _S;const L=kit.L;_SL=L;
  _S=[{s0:L*.16,s1:L*.16+200,side:1,off:28,amp:3.2,ph:1.1},{s0:L*.58,s1:L*.58+200,side:-1,off:30,amp:3.6,ph:3.9}];return _S;}
const sc=(S,s)=>S.side*(S.off+S.amp*Math.sin((s-S.s0)*.025+S.ph));
const senv=(S,s)=>sstep(S.s0,S.s0+45,s)*(1-sstep(S.s1-45,S.s1,s));
function streamAt(kit,x,z,dn){
  if(dn<12||dn>58)return null;
  const S=streams(kit),r=kit.nearest(x,z);if(r.dist>1e8)return null;
  if(Math.abs(Math.abs(r.d)-r.dist)>2.5)return null;const s=r.f*kit.DS;
  for(const q of S){if(r.d*q.side<=0||s<q.s0-5||s>q.s1+5)continue;return{S:q,q:Math.abs(r.d-sc(q,s)),e:senv(q,s)};}
  return null;
}

/* ================= tree / plant geometry ================= */
const BARK=0x75624c;
function geoTreeA(){
  const b=Bk();
  CY(b,.55,.95,3.2,7,0,1.6,0,BARK,0,0,0,.12,null,true);CY(b,.36,.55,12.5,7,0,9.45,0,0x66543f,0,0,0,.12,null,true);
  for(let i=0;i<4;i++){const m=XF(0,0,0,0,i/4*TAU+.3,0),c=rgb(0x6b5843),H=3.6+(i%2)*1.2,R=1.9+(i%3)*.3;
    tri(b,m,[.35,0,0],[.45,H,0],[R,0,0],c,c,c);}
  const bl=[[0,18.5,0,4.8,2.6,4.6,0x2d6a2b],[3.6,17,1.8,3.6,2.2,3.5,0x37762f],[-3.4,17.4,-1.5,3.7,2.3,3.6,0x2a6128],[1,21.5,-1,3.9,2.2,3.8,0x438a38],[-1.2,24,.8,2.4,1.5,2.4,0x59a045]];
  bl.forEach((q,i)=>EL(b,q[3],q[4],q[5],q[0],q[1],q[2],q[6],.1,i*1.3));
  EL(b,.9,.4,.8,.3,.35,.3,0x4c7a2c,.1,1);
  return fin(b);
}
function geoTreeB(){
  const b=Bk();
  CY(b,.5,.85,1.6,6,0,.8,0,0x9a8a72,0,0,0,.1,null,true);CY(b,.28,.5,9,6,0,6,0,0x9a8a72,0,0,0,.1,null,true);
  for(let i=0;i<3;i++){const m=XF(0,0,0,0,i*2.1+.5,0),c=rgb(0x8b7b64);tri(b,m,[.3,0,0],[.35,2.4,0],[1.3,0,0],c,c,c);}
  const bl=[[0,11.5,0,5.5,1.5,5.5,0x3f8238],[2.5,12.4,-1,3.6,1.2,3.6,0x56984a],[-2.8,12.2,1.5,3.4,1.2,3.4,0x34702f]];
  bl.forEach((q,i)=>EL(b,q[3],q[4],q[5],q[0],q[1],q[2],q[6],.1,i*.9));
  return fin(b);
}
function geoTreeC(){
  const b=Bk();CY(b,.1,.2,8.8,5,0,4.4,0,0x6d5b45,0,0,0,.1,null,true);
  EL(b,1.9,1.0,1.9,0,9.2,0,0x4a8f3a,.1,0);EL(b,1.3,.8,1.3,.8,7.8,.5,0x3a7a30,.1,1);return fin(b);
}
function geoPalm(){
  const b=Bk(),pts=[];for(let i=0;i<=4;i++){const t=i/4;pts.push([1.4*t*t,8*t,0]);}
  for(let i=0;i<4;i++)ROD(b,pts[i],pts[i+1],.17-i*.02,.2-i*.02,5,0x8a7358,.1);
  const cx=pts[4][0],cy=pts[4][1];
  for(let i=0;i<7;i++){const a=i/7*TAU+(i%2)*.2,ca=Math.cos(a),sa=Math.sin(a),fp=[];
    for(let k=0;k<4;k++){const t=k/3;fp.push([cx+ca*3.4*t,cy+1.3*t-2*t*t+.2,sa*3.4*t]);}
    strip(b,XF(0,0,0),fp,[.1,.42,.4,.05],0x3a7a26,0x6aa23a,0);}
  return fin(b);
}
function geoBamboo(){
  const b=Bk(),r=KIT.mulberry(311);
  for(let i=0;i<5;i++){const a=r()*TAU,rad=r()*.9,H=7+r()*4,tl=.06+r()*.1,la=r()*TAU;
    const p0=[Math.cos(a)*rad,0,Math.sin(a)*rad],p1=[p0[0]+Math.cos(la)*H*tl,H,p0[2]+Math.sin(la)*H*tl];
    ROD(b,p0,p1,.035,.055,5,0x9cb34e,.1);
    for(let f=0;f<2;f++){const fa=f/2*TAU+r(),ll=1.5;strip(b,XF(0,0,0),[[p1[0],p1[1]-.2,p1[2]],[p1[0]+Math.cos(fa)*ll*.5,p1[1]+.1,p1[2]+Math.sin(fa)*ll*.5],[p1[0]+Math.cos(fa)*ll,p1[1]-.5,p1[2]+Math.sin(fa)*ll]],[.04,.16,.02],0x5d9034,0x86b043,0);}}
  return fin(b);
}
function geoFern(){
  const b=Bk(),r=KIT.mulberry(312);
  for(let i=0;i<8;i++){const a=i/8*TAU+r()*.4,L=1.4+r()*.5,fp=[];for(let k=0;k<3;k++){const t=k/2;fp.push([Math.cos(a)*L*t,.15+.9*t-1.0*t*t+.1,Math.sin(a)*L*t]);}
    strip(b,XF(0,0,0),fp,[.07,.17,.02],0x2f6a22,0x5aa03a,0);}
  return fin(b);
}
function geoBroad(){
  const b=Bk(),r=KIT.mulberry(313);
  for(let i=0;i<5;i++){const a=i/5*TAU+r()*.5,fp=[];for(let k=0;k<3;k++){const t=k/2;fp.push([Math.cos(a)*1.0*t,.4+1.9*t-.8*t*t,Math.sin(a)*1.0*t]);}
    strip(b,XF(0,0,0),fp,[.14,.46,.04],0x2f7a2a,0x5ab43e,0);}
  return fin(b);
}
function geoFlower(col){
  const b=Bk(),r=KIT.mulberry(314);
  for(let i=0;i<5;i++){const a=i/5*TAU,fp=[];for(let k=0;k<3;k++){const t=k/2;fp.push([Math.cos(a)*.6*t,.1+.45*t-.3*t*t,Math.sin(a)*.6*t]);}strip(b,XF(0,0,0),fp,[.04,.1,.01],0x2f6a22,0x4f8a30,0);}
  for(let i=0;i<4;i++){const a=r()*TAU,rad=r()*.3,h=.55+r()*.45,x=Math.cos(a)*rad,z=Math.sin(a)*rad;
    put(b,GEO('OctahedronGeometry',1,0),XF(x,h+.05,z,0,i,0,.1,.08,.1),col,.1);}
  return fin(b);
}
function geoMush(col){
  const b=Bk(),r=KIT.mulberry(315);
  for(let i=0;i<2;i++){const x=(r()-.5)*.35,z=(r()-.5)*.35,s=.7+r()*.6;
    CY(b,.03*s,.04*s,.18*s,5,x,.09*s,z,0xe8dcc0,0,0,0,.05,null,true);
    put(b,GEO('ConeGeometry',1,.7,6),XF(x,.2*s,z,0,0,0,.12*s,.1*s,.12*s),col,.08);}
  return fin(b);
}
function geoVine(){
  const b=Bk(),pts=[];for(let i=0;i<6;i++)pts.push([Math.sin(i*.9)*.25,-i*1.3,Math.cos(i*.7)*.15]);
  const m=XF(0,0,0),w=[.09,.09,.08,.07,.05,.03];
  strip(b,m,pts,w,0x3a5c2a,0x6a9a3a,0,[1,0]);strip(b,m,pts,w,0x3a5c2a,0x6a9a3a,0,[0,1]);
  for(let i=1;i<6;i+=2)put(b,GEO('OctahedronGeometry',1,0),XF(pts[i][0]+.1,pts[i][1],pts[i][2],0,i,0,.22,.3,.22),0x4f8a36,.12);
  return fin(b);
}
function geoFallen(){
  const b=Bk();
  CY(b,.42,.5,9,7,0,.45,0,0x5a4632,0,0,PI/2,.12,null,true);
  CY(b,1.3,1.0,.5,7,-4.6,.9,0,0x4a3a28,0,0,PI/2,.1);
  for(let i=0;i<3;i++){const a=i*2.1;ROD(b,[-4.7,.9,0],[-5.6,.9+Math.sin(a)*1.1,Math.cos(a)*1.1],.12,.05,4,0x4a3a28);}
  for(let i=0;i<3;i++)EL(b,.8,.22,.45,-2.5+i*2.2,.88,0,0x4f7f2c,.12,i);
  ROD(b,[1,.8,0],[1.5,1.6,.5],.08,.04,4,0x5a4632);ROD(b,[-1.5,.8,0],[-1.8,1.4,-.5],.08,.04,4,0x5a4632);
  return fin(b);
}
function geoBoulder(){
  const b=Bk();
  put(b,GEO('IcosahedronGeometry',1,1),XF(0,.6,0,0,0,0,1,.7,.9),(n)=>{const t=sstep(.25,.7,n.y);return[.4+(.2-.4)*t,.39+(.34-.39)*t,.35+(.13-.35)*t];},.12);
  return fin(b);
}
const treeCols=[0xffffff,0xe8f5d8,0xd6ecc4,0xf4ecd0,0xc9e0b8,0xf0ffe0];

/* ================= structures (huts, towers, bridges, sign posts) ================= */
function hut(B,x,gz,z,yaw,gh){
  // gh(lx,lz) -> ground height; local +z faces the road
  const G=XF(x,0,z,0,yaw,0),P=(g,lx,ly,lz,col,rx,ry,rz,sx,sy,sz,jit)=>put(B,g,G.clone().multiply(XF(lx,ly,lz,rx,ry,rz,sx,sy,sz)),col,jit===undefined?.08:jit);
  let top=-1e9;const cs=[[-1.35,-1.15],[1.35,-1.15],[-1.35,1.15],[1.35,1.15]];
  for(const c of cs)top=Math.max(top,gh(c[0],c[1]));const yf=top+1.2;
  for(const c of cs){const g0=gh(c[0],c[1]),h=yf+.1-g0+.3;P(GEO('CylinderGeometry',.1,.12,h,6),c[0],g0-.3+h/2,c[1],0x6a5238);}
  P(GEO('BoxGeometry',3.2,.14,2.8),0,yf,0,0x7a5c3c);
  P(GEO('BoxGeometry',2.9,1.45,2.5),0,yf+.8,0,0x8a6a46,0,0,0,1,1,1,.12);
  P(GEO('BoxGeometry',.8,1.15,.06),-.5,yf+.7,1.26,0x2a1e14);P(GEO('BoxGeometry',.6,.5,.06),.8,yf+1.0,1.26,0x2a1e14);
  P(GEO('BoxGeometry',.62,.06,.1),.8,yf+1.28,1.28,0x6a4a2a);
  P(GEO('ConeGeometry',2.7,1.9,4),0,yf+2.45,0,0xb99d55,0,PI/4,0,1.08,1,.95,.15);
  P(GEO('BoxGeometry',.1,.1,3.1),0,yf+3.4,0,0x5a4430);
  P(GEO('BoxGeometry',3.4,.08,.08),0,yf+.5,1.55,0x6a5238);P(GEO('BoxGeometry',.08,.5,.08),-1.6,yf+.3,1.55,0x6a5238);P(GEO('BoxGeometry',.08,.5,.08),1.6,yf+.3,1.55,0x6a5238);
  const g1=gh(.9,2.2);const a=[.9,g1,2.2],c=[.9,yf,1.5];
  for(const sx of[-.25,.25]){const A=new T.Vector3(a[0]+sx,a[1],a[2]).applyMatrix4(G),C=new T.Vector3(c[0]+sx,c[1],c[2]).applyMatrix4(G);ROD(B,[A.x,A.y,A.z],[C.x,C.y,C.z],.04,.04,4,0x6a5238);}
  for(let k=1;k<5;k++){const t=k/5;P(GEO('BoxGeometry',.5,.04,.05),.9,lerp(g1,yf,t),lerp(2.2,1.5,t),0x6a5238);}
  P(GEO('IcosahedronGeometry',1,0),1.2,yf+1.9,1.3,0xc6c13a,0,0,0,.18,.28,.15);
}
function tower(B,x,z,yaw,gh){
  const G=XF(x,0,z,0,yaw,0),W=(lx,ly,lz)=>{const v=new T.Vector3(lx,ly,lz).applyMatrix4(G);return[v.x,v.y,v.z];};
  const P=(g,lx,ly,lz,col,rx,ry,rz,sx,sy,sz)=>put(B,g,G.clone().multiply(XF(lx,ly,lz,rx,ry,rz,sx,sy,sz)),col,.08);
  const cs=[[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]];
  for(const c of cs){const g0=gh(c[0],c[1]);ROD(B,W(c[0],g0-.3,c[1]),W(c[0]*.8,8,c[1]*.8),.13,.11,6,0x6a5238);}
  const ys=[2.8,5.4];for(const y of ys){const k=1-.2*y/8;
    ROD(B,W(-1.2*k,y,-1.2*k),W(1.2*k,y,-1.2*k),.05,.05,4,0x7a6040);ROD(B,W(-1.2*k,y,1.2*k),W(1.2*k,y,1.2*k),.05,.05,4,0x7a6040);
    ROD(B,W(-1.2*k,y,-1.2*k),W(-1.2*k,y,1.2*k),.05,.05,4,0x7a6040);ROD(B,W(1.2*k,y,-1.2*k),W(1.2*k,y,1.2*k),.05,.05,4,0x7a6040);
    ROD(B,W(-1.2*k,y,1.2*k),W(1.2*k*.88,y+2.6,1.2*k*.88),.04,.04,4,0x7a6040);}
  P(GEO('BoxGeometry',2.5,.16,2.5),0,8,0,0x8a6a46);
  for(const [lx,lz,w,d] of[[0,1.2,2.5,.06],[0,-1.2,2.5,.06],[1.2,0,.06,2.4],[-1.2,0,.06,2.4]])P(GEO('BoxGeometry',w,.55,d),lx,8.4,lz,0x7a5c3c);
  for(const c of cs)P(GEO('CylinderGeometry',.06,.06,1.9,5),c[0]*.95,9.0,c[1]*.95,0x6a5238);
  P(GEO('ConeGeometry',2.3,1.2,4),0,10.4,0,0xb99d55,0,PI/4,0);
  const g1=gh(0,2.4);ROD(B,W(-.3,g1,2.4),W(-.3,8,1.2),.04,.04,4,0x6a5238);ROD(B,W(.3,g1,2.4),W(.3,8,1.2),.04,.04,4,0x6a5238);
  for(let k=1;k<10;k++){const t=k/10;P(GEO('BoxGeometry',.6,.04,.05),0,lerp(g1,8,t),lerp(2.4,1.2,t),0x6a5238);}
}
function bridge(B,A,Bp,kit,rr){
  const dx=Bp[0]-A[0],dz=Bp[2]-A[2],dy=Bp[1]-A[1],lh=Math.hypot(dx,dz),ln=Math.hypot(lh,dy),yaw=Math.atan2(dx,dz),pit=-Math.atan2(dy,lh);
  const C=[(A[0]+Bp[0])/2,(A[1]+Bp[1])/2,(A[2]+Bp[2])/2],G=XF(C[0],C[1],C[2],pit,yaw,0);
  const P=(g,lx,ly,lz,col,rx,ry,rz,sx,sy,sz)=>put(B,g,G.clone().multiply(XF(lx,ly,lz,rx,ry,rz,sx,sy,sz)),col,.1);
  const n=Math.floor(ln/.42);
  for(let i=0;i<n;i++)P(GEO('BoxGeometry',1.7,.07,.38),(rr()-.5)*.06,(rr()-.5)*.02,-ln/2+.21+i*(ln-.4)/(n-1),i%3?0x8a6a46:0x76593a,0,(rr()-.5)*.05,0);
  for(const sx of[-.7,.7])P(GEO('BoxGeometry',.12,.18,ln),sx,-.13,0,0x5a4430);
  for(const sx of[-.85,.85]){P(GEO('BoxGeometry',.07,.07,ln),sx,.95,0,0x7a5c3c);P(GEO('BoxGeometry',.05,.05,ln),sx,.55,0,0x7a5c3c);
    for(let z=-ln/2+.3;z<ln/2;z+=2)P(GEO('CylinderGeometry',.05,.05,1.0,5),sx,.5,z,0x6a5238);}
  for(const zl of[-ln/4,0,ln/4])for(const sx of[-.7,.7]){
    const top=new T.Vector3(sx,-.2,zl).applyMatrix4(G),g0=Math.min(kit.terrainH(top.x,top.z),top.y-.5)-.3;
    ROD(B,[top.x,g0,top.z],[top.x,top.y,top.z],.1,.1,6,0x5a4430);}
}

/* ================= vehicles ================= */
let VM=null;
function vmats(kit){
  if(VM)return VM;
  VM={body:new T.MeshStandardMaterial({map:mudTex(),vertexColors:true,roughness:.88,metalness:.1}),
    wood:new T.MeshStandardMaterial({map:woodTex(),vertexColors:true,roughness:.95,metalness:0}),
    glass:kit.glassM,tyre:kit.tyreM,red:kit.redL,white:kit.whiteL};return VM;
}
const WOOD=[0,.26,1,.74],ENDT=[0,0,.25,.25];
const pick=(r,a)=>a[(r()*a.length)|0];
function VBk(){return{body:Bk(),wood:Bk(),glass:Bk(),tyre:Bk(),red:Bk(),white:Bk()};}
function vfin(V,kit){const M=vmats(kit),g=new T.Group();
  for(const k in V){if(!V[k].p.length)continue;const m=new T.Mesh(fin(V[k]),M[k]);m.castShadow=true;g.add(m);}return g;}
const WH=(V,x,y,z,r,w,hub)=>{CY(V.tyre,r,r,w,12,x,y,z,0xffffff,0,0,PI/2,0);CY(V.body,r*.55,r*.55,w+.02,8,x,y,z,hub||0x7a5a3a,0,0,PI/2,.1);};
const WD=(V,x,y,z,len,r,col,rx,ry,rz)=>{CY(V.wood,r,r*.96,len,10,x,y,z,col,rx,ry,rz,.08,WOOD,true);};
function logEnds(V,x,y,z,r,rot){ // end discs for a z-axis log
  put(V.wood,GEO('CircleGeometry',r,10),XF(x,y,z+rot*0,0,rot>0?0:PI,0),0xe0c690,.05,ENDT);}
function logger(rng,kit){
  const V=VBk(),col=pick(rng,[0xa8481a,0x4f6b3a,0xc29a2a,0x7d2f22]);
  BX(V.body,1.2,.32,10.4,0,.86,0,0x2b2824);
  BX(V.body,2.25,1.75,1.7,0,2.0,2.55,col);BX(V.body,1.9,1.0,1.8,0,1.45,4.25,col);BX(V.body,2.1,.3,.35,0,.95,5.3,0x3a3a38);
  BX(V.body,1.5,.7,.06,0,1.5,5.17,0x1c1c1c);BX(V.body,2.3,.12,1.8,0,2.93,2.55,col,0,0,0,.15);
  BX(V.glass,1.95,.75,.06,0,2.45,3.42);for(const sx of[-1,1])BX(V.glass,.06,.6,1.0,sx*1.14,2.5,2.55);
  CY(V.body,.07,.07,3.0,6,1.05,2.7,1.5,0x333030);
  for(const sx of[-1,1]){BX(V.body,.5,.4,.04,sx*.95,.55,-3.95,0x2a2a2a);BX(V.body,.5,.4,.04,sx*.95,.55,-2.35,0x2a2a2a);}
  for(const sx of[-1,1]){WH(V,sx*.97,.55,4.0,.55,.5);WH(V,sx*.97,.55,-1.7,.55,.5);WH(V,sx*.97,.55,-3.2,.55,.5);}
  BX(V.wood,2.3,.16,7.6,0,1.1,-1.65,0x6a4a30);
  for(const z of[.6,-3.8])for(const sx of[-1,1])BX(V.wood,.14,1.9,.16,sx*1.12,1.95,z,0x6a4a30);
  const rows=[[1.55,[-.78,0,.78]],[2.19,[-.39,.39]],[2.83,[0]]],bk=[0x7a5638,0x6a4a30,0x8b6a45,0x5e4430];
  for(const row of rows)for(const x of row[1]){const len=6.4+rng()*.6,zc=-1.95+(rng()-.5)*(6.9-len);
    WD(V,x,row[0],zc,len,.37,pick(rng,bk),PI/2,0,0);logEnds(V,x,row[0],zc+len/2,.37,1);logEnds(V,x,row[0],zc-len/2,.37,-1);}
  for(const z of[.2,-3.8])BX(V.body,1.5,.05,.08,0,3.22,z,0x1f1f1f);
  BX(V.body,.3,.25,.02,.4,2.9,-5.46,0xff6a1a,0);
  for(const sx of[-1,1]){BX(V.red,.35,.18,.05,sx*.9,1.0,-5.2);BX(V.white,.35,.22,.05,sx*.65,1.55,5.2);}
  return{obj:vfin(V,kit),hw:1.25,hl:5.5};
}
function jeep(rng,kit){
  const V=VBk(),col=pick(rng,[0x5b6e3c,0x9a3b24,0xc8962c,0x3b5f7a,0xd7d2c0]);
  BX(V.body,1.7,.5,3.5,0,.78,-.1,col);BX(V.body,1.55,.4,1.1,0,.95,1.3,col);BX(V.body,1.3,.4,.08,0,.95,1.86,0x222222);
  for(const sx of[-1,1])BX(V.body,.35,.12,1.0,sx*.8,1.15,1.35,col);
  BX(V.body,1.55,.06,.06,0,1.5,.7,0x222222);for(const sx of[-1,1]){BX(V.body,.05,.5,.05,sx*.78,1.25,.7,0x222222);BX(V.body,.05,.85,.05,sx*.75,1.35,-.9,0x222222);}
  BX(V.glass,1.5,.42,.04,0,1.27,.72,0xffffff,-.3);BX(V.body,1.55,.05,.05,0,1.78,-.9,0x222222);
  for(const sx of[-1,1]){BX(V.body,.55,.15,.5,sx*.38,.95,.2,0x4a3a2a);BX(V.body,.55,.45,.1,sx*.38,1.2,-.05,0x4a3a2a);}
  CY(V.tyre,.38,.38,.22,12,0,.95,-1.97,0xffffff,PI/2,0,0);BX(V.body,1.7,.15,.15,0,.55,-1.88,0x333333);
  for(const sx of[-1,1]){WH(V,sx*.84,.42,1.2,.42,.3);WH(V,sx*.84,.42,-1.2,.42,.3);}
  const shirt=[0xc23a2a,0x2a6ac2,0xe0c030,0x3a9a4a];
  for(const sx of[.38,-.38])if(sx>0||rng()<.6){BX(V.body,.4,.5,.25,sx,1.3,.1,pick(rng,shirt));EL(V.body,.13,.15,.13,sx,1.72,.1,0xb07a50,.05);}
  BX(V.wood,.6,.4,.5,-.4,1.05,-1.3,0x8a6a46);EL(V.body,.3,.2,.25,.4,1.0,-1.3,0xc7b58a);
  for(const sx of[-1,1]){BX(V.red,.2,.12,.04,sx*.7,.85,-1.86);BX(V.white,.22,.2,.05,sx*.55,1.0,1.91);}
  return{obj:vfin(V,kit),hw:1.0,hl:2.1};
}
function pickup(rng,kit){
  const V=VBk(),col=pick(rng,[0xa8481a,0x4f6b3a,0x3b5f7a,0xd7d2c0,0x8a2c24,0xc8962c]);
  BX(V.body,1.6,.3,5.0,0,.62,0,0x2b2824);BX(V.body,1.9,1.1,1.5,0,1.4,.35,col);BX(V.body,1.85,.5,1.3,0,1.0,1.75,col);
  for(const sx of[-1,1])BX(V.glass,.05,.45,1.05,sx*.96,1.55,.35);BX(V.glass,1.7,.45,.05,0,1.55,1.12);
  BX(V.body,1.4,.4,.06,0,.95,2.43,0x1c1c1c);BX(V.body,1.9,.22,.2,0,.62,2.5,0x3a3a38);
  BX(V.wood,1.8,.1,2.3,0,.82,-1.3,0x7a5a3a,0,0,0,.1,WOOD);
  for(const sx of[-1,1])BX(V.wood,.08,.45,2.3,sx*.9,1.1,-1.3,0x8a6a46,0,0,0,.1,WOOD);
  BX(V.wood,1.8,.45,.08,0,1.1,-.2,0x8a6a46,0,0,0,.1,WOOD);BX(V.wood,1.8,.4,.08,0,1.05,-2.45,0x8a6a46,0,0,.02,.1,WOOD);
  const cg=(rng()*4)|0;
  if(cg===0){for(let i=0;i<6;i++)EL(V.body,.38,.22,.28,-.45+(i%3)*.45,.98+((i/3)|0)*.35,-1.0-(i%2)*.8,pick(rng,[0xc7b58a,0xa89870,0xd0c3a0]));}
  else if(cg===1){for(let i=0;i<9;i++)EL(V.body,.2,.28,.18,-.5+(i%3)*.5,1.1+((i/3)|0)*.3,-0.8-(i%2)*.9,pick(rng,[0xc6c13a,0x9bb23a]));}
  else if(cg===2){for(let i=0;i<3;i++)BX(V.wood,.55,.45,.55,(i-1)*.55,1.1,-1.6+(i%2)*.7,0x8a6a46,0,i,0,.1,WOOD);BX(V.body,1.5,.12,1.6,0,1.45,-1.3,0x2c5b8a);}
  else{for(let i=0;i<9;i++){const x=-.55+(i%3)*.55,y=1.0+((i/3)|0)*.22;CY(V.wood,.1,.1,1.6,6,x,y,-1.3,0x7a5638,0,0,PI/2,.1,WOOD,true);}}
  for(const sx of[-1,1]){WH(V,sx*.86,.4,1.55,.4,.28);WH(V,sx*.86,.4,-1.4,.4,.28);BX(V.white,.3,.18,.05,sx*.65,.95,2.47);BX(V.red,.25,.15,.05,sx*.8,.95,-2.5);}
  return{obj:vfin(V,kit),hw:1.02,hl:2.6};
}
function bus(rng,kit){
  const V=VBk(),P=pick(rng,[[0x2f8a86,0xe0b030],[0xb8352c,0xefe6c8],[0x2c5a9a,0xe8892a],[0x3b7a3a,0xefefef]]);
  BX(V.body,1.8,.35,7.0,0,.62,0,0x2b2824);BX(V.body,2.15,1.85,5.6,0,1.78,-.7,P[0]);BX(V.body,2.17,.5,5.62,0,1.15,-.7,P[1],0,0,0,.05);BX(V.body,2.17,.14,5.62,0,2.45,-.7,P[1],0,0,0,.05);
  BX(V.body,1.9,1.05,1.4,0,1.35,2.8,P[0]);BX(V.body,1.4,.55,.06,0,1.3,3.52,0x1c1c1c);BX(V.body,2.1,.25,.2,0,.7,3.58,0x3a3a38);
  for(const sx of[-1,1])for(let k=0;k<5;k++)BX(V.glass,.06,.6,.8,sx*1.09,2.15,-2.9+k*1.0);
  BX(V.glass,1.75,.7,.06,0,2.2,2.13);BX(V.glass,1.5,.5,.06,0,2.2,-3.52);BX(V.body,2.1,.1,5.5,0,2.76,-.7,P[1]);
  BX(V.wood,2.0,.06,4.0,0,2.86,-1.0,0x7a5a3a,0,0,0,.1,WOOD);
  EL(V.body,.6,.4,.5,-.5,3.15,-.2,pick(rng,[0xc7b58a,0x8a6a46,0x2c5b8a]));BX(V.wood,.8,.5,.6,.5,3.15,-1.6,0x8a6a46,0,.2,0,.1,WOOD);EL(V.body,.45,.35,.5,.2,3.1,.8,0xc6c13a);
  BX(V.body,.06,1.8,.06,-.35,1.8,-3.55,0x333333);BX(V.body,.06,1.8,.06,.35,1.8,-3.55,0x333333);
  for(const sx of[-1,1]){WH(V,sx*.95,.5,2.3,.5,.32);WH(V,sx*.95,.5,-2.2,.5,.32);BX(V.white,.3,.2,.05,sx*.7,1.0,3.53);BX(V.red,.3,.2,.05,sx*.8,1.0,-3.52);}
  return{obj:vfin(V,kit),hw:1.12,hl:3.7};
}
function cart(rng,kit){
  const V=VBk(),col=pick(rng,[0x7d2f22,0x4f6b3a,0x3b5f7a,0xb89a3a]);
  BX(V.body,1.6,1.3,1.1,0,1.55,1.9,col);BX(V.body,1.5,.55,.8,0,1.1,2.55,col);BX(V.glass,1.4,.5,.05,0,1.9,2.46);BX(V.body,1.2,.4,.05,0,.95,2.96,0x1c1c1c);
  BX(V.wood,1.3,.2,5.6,0,.75,-.15,0x6a4a30,0,0,0,.1,WOOD);
  for(let i=0;i<9;i++)BX(V.wood,1.8,.08,.35,(rng()-.5)*.08,.9,-2.75+i*.5,i%2?0x8a6a46:0x76593a,0,(rng()-.5)*.1,0,.1,WOOD);
  for(const z of[-2.4,-1.2,0,1.0])for(const sx of[-1,1])BX(V.wood,.08,1.0,.08,sx*.9,1.4,z,0x7a5a3a,0,0,(rng()-.5)*.14,.1,WOOD);
  for(const sx of[-1,1]){BX(V.wood,.06,.06,3.6,sx*.92,1.9,-.7,0x7a5a3a,0,0,0,.1,WOOD);BX(V.wood,.06,.06,3.2,sx*.92,1.4,-.9,0x7a5a3a,.04,0,0,.1,WOOD);}
  BX(V.wood,1.7,.06,.3,0,.6,-2.85,0x7a5a3a,.5,0,0,.1,WOOD);
  const ld=(rng()*3)|0;
  if(ld===0){EL(V.body,.85,.6,1.6,0,1.75,-1.1,0xc9a94a);}
  else if(ld===1){for(let i=0;i<6;i++)EL(V.body,.4,.5,.35,-.45+(i%3)*.45,1.4+((i/3)|0)*.5,-1.5+(i%2)*.8,pick(rng,[0xc7b58a,0xa89870,0xd0c3a0]));}
  else{for(let i=0;i<6;i++){CY(V.wood,.07,.06,5.6,5,-.5+(i%3)*.5,1.1+((i/3)|0)*.2,-.15,0xa8b04e,PI/2,0,0,.08,WOOD,true);}}
  for(const sx of[-1,1]){WH(V,sx*.88,.52,1.6,.52,.22,0x6a4a30);WH(V,sx*.88,.52,-1.9,.52,.22,0x6a4a30);}
  BX(V.white,.2,.16,.05,0,1.0,2.97);for(const sx of[-1,1])BX(V.red,.2,.12,.04,sx*.7,.95,-2.97);
  return{obj:vfin(V,kit),hw:1.0,hl:3.0};
}

/* ================= obstacles ================= */
let OM=null;
const omat=()=>OM||(OM=new T.MeshLambertMaterial({vertexColors:true}));
function ofin(B){const g=new T.Group(),m=new T.Mesh(fin(B),omat());m.castShadow=true;g.add(m);return g;}
function oLog(rng){
  const B=Bk(),hw=1.7+rng()*.5,r=.34+rng()*.05;
  CY(B,r,r*1.04,hw*2,10,0,r,0,0x5b4430,0,0,PI/2,.12);
  for(const s of[-1,1])put(B,GEO('CircleGeometry',r*1.02,10),XF(s*hw,r,0,0,s*PI/2,0),0xd9bc88,.06);
  for(let i=0;i<3;i++)EL(B,.5,.12,.2,(i-1)*hw*.5,r*1.9,0,0x4d7a2b,.1,i);
  ROD(B,[hw*.3,r*1.5,0],[hw*.35,r*1.5+.2,.12],.05,.03,4,0x5b4430);
  ROD(B,[-hw*.2,r*1.2,.1],[-hw*.25,r*1.2,.3],.05,.03,4,0x5b4430);
  ROD(B,[hw*.8,r*1.9,0],[hw*.8,r*1.9+.9,0],.015,.015,3,0x6a4a2a);BX(B,.22,.16,.02,hw*.8+.12,r*1.9+.8,0,0xff6a1a,0,0,0,0);
  return{obj:ofin(B),hw:hw,hl:.5};
}
function oBoulder(rng){
  const B=Bk(),r=.8+rng()*.35;
  put(B,GEO('IcosahedronGeometry',1,1),XF(0,r*.55,0,0,rng()*3,0,r*.98,r*.78,r*.94),(n)=>{const t=sstep(.25,.7,n.y);return[.4+(.2-.4)*t,.39+(.34-.39)*t,.35+(.13-.35)*t];},.12);
  return{obj:ofin(B),hw:r,hl:r};
}
function oRoots(rng){
  const B=Bk();
  EL(B,.85,.22,.8,0,.12,0,0x3d2c1f,.1,rng()*3);
  for(let i=0;i<5;i++){const R=.3+rng()*.2,a=rng()*TAU,d=rng()*.25;
    put(B,GEO('TorusGeometry',R,.1+rng()*.04,5,8,PI),XF(Math.cos(a)*d,.05,Math.sin(a)*d,0,rng()*PI,0),i%2?0x45301f:0x5e442c,.1);}
  return{obj:ofin(B),hw:.95,hl:.95};
}
function oDip(rng){
  const B=Bk();
  put(B,GEO('CylinderGeometry',1.2,1.2,.05,16),XF(0,.03,0,0,0,0,1,1,.78),0x2e2219,.05);
  put(B,GEO('CylinderGeometry',.9,.9,.05,14),XF(0,.06,0,0,0,0,1,1,.75),0x4d6860,.1);
  for(const sx of[-1,1])EL(B,.4,.16,.4,sx*.85,.1,0,0x5a4030,.1,sx);
  for(let i=0;i<4;i++)CY(B,.05,.05,.35,6,0,.2+i*.35,-.6,i%2?0xf2f2f2:0xd02a1a,0,0,0,0);
  BX(B,.5,.35,.04,0,1.45,-.6,0xd02a1a,0,0,0,0);BX(B,.3,.2,.045,0,1.45,-.6,0xf2f2f2,0,0,0,0);
  return{obj:ofin(B),hw:1.25,hl:.95};
}
function oFence(rng){
  const B=Bk(),w=0xa8926e;
  [[-1.2,.08],[0,-.1],[1.2,.12]].forEach((p,i)=>CY(B,.06,.07,1.1,6,p[0],.5,0,w,p[1]*.5,0,p[1],.15));
  BX(B,1.3,.08,.05,-.55,.8,.06,w,0,0,.03,.15);BX(B,1.3,.08,.05,-.5,.45,.06,w,0,0,-.04,.15);
  BX(B,1.1,.08,.05,.7,.35,.1,w,0,0,-.4,.15);BX(B,1.0,.07,.12,.2,.04,.18,w,0,.2,0,.15);
  BX(B,2.2,.05,.01,0,.95,.1,0xe5532a,0,0,.05,0);
  return{obj:ofin(B),hw:1.35,hl:.36};
}

/* ================= world scenery ================= */
function addProps(ctx){
  const kit=ctx.kit,grp=ctx.grp,st=kit.st,Q=kit.TOUCH?.45:1,L=kit.L,half=st.half;
  const S=streams(kit),add=m=>{if(m)grp.add(m);return m;};
  const cnt=n=>Math.max(1,Math.round(n*Q));
  const CB=[],CS=[];
  const sideV=(s,side)=>{const q=kit.pose(s,0);return{x:Math.cos(q.hd)*side,z:-Math.sin(q.hd)*side,hd:q.hd};}; // toward road for off=side*..
  const near=(x,z,off)=>{const r=kit.nearest(x,z);return r.dist>=Math.abs(off)-1.5&&r.dist<1e8;};
  /* ---- sites: bridges, huts, towers ---- */
  const bridges=[],huts=[],towers=[];
  S.forEach(q=>{const sb=(q.s0+q.s1)/2,c=Math.abs(sc(q,sb));
    bridges.push({q,s:sb,a:q.side*(c-6.5),b:q.side*(c+6.5),hut:q.side*(c+13)});});
  const hutDefs=[[.31,10],[.31+24/L,13],[.74,-11],[.74-20/L,-14]];
  hutDefs.forEach(h=>{const off=h[1],s=h[0]*L,p=kit.pose(s,off);if(near(p.x,p.z,off)){const v=sideV(s,Math.sign(off));huts.push({x:p.x,z:p.z,yaw:Math.atan2(v.x,v.z)});}});
  [[.45,-14],[.9,15]].forEach(t=>{const off=t[1],s=t[0]*L,p=kit.pose(s,off);if(near(p.x,p.z,off)){const v=sideV(s,Math.sign(off));towers.push({x:p.x,z:p.z,yaw:Math.atan2(v.x,v.z)});}});
  bridges.forEach(b=>{const p=kit.pose(b.s,b.hut),v=sideV(b.s,Math.sign(b.hut));huts.push({x:p.x,z:p.z,yaw:Math.atan2(-v.x,-v.z)});});
  huts.forEach(h=>CB.push({x:h.x,z:h.z,r:7}));towers.forEach(h=>CB.push({x:h.x,z:h.z,r:6}));
  huts.forEach(h=>CS.push({x:h.x,z:h.z,r:3.2}));towers.forEach(h=>CS.push({x:h.x,z:h.z,r:2.6}));
  bridges.forEach(b=>{for(let o=6;o<Math.abs(b.b)+2;o+=5.5){const p=kit.pose(b.s,Math.sign(b.b)*o);CB.push({x:p.x,z:p.z,r:5.5});}});
  S.forEach(q=>{for(let s=q.s0;s<=q.s1;s+=10){const p=kit.pose(s,sc(q,s));CB.push({x:p.x,z:p.z,r:11});}});
  /* ---- structures (single merged mesh) ---- */
  const SB=Bk(),rr=kit.mulberry(SEED+3);
  try{
    const gh=(h)=>(lx,lz)=>{const c=Math.cos(h.yaw),s=Math.sin(h.yaw);return kit.terrainH(h.x+c*lx+s*lz,h.z-s*lx+c*lz);};
    huts.forEach(h=>hut(SB,h.x,0,h.z,h.yaw,gh(h)));towers.forEach(h=>tower(SB,h.x,h.z,h.yaw,gh(h)));
    bridges.forEach(b=>{const pa=kit.pose(b.s,b.a),A=[pa.x,0,pa.z],pb=kit.pose(b.s,b.b),Bp=[pb.x,0,pb.z];
      A[1]=kit.terrainH(A[0],A[2])+.25;Bp[1]=kit.terrainH(Bp[0],Bp[2])+.25;bridge(SB,A,Bp,kit,rr);});
  }catch(e){console.warn('[jungle] structures',e);}
  /* ---- signs ---- */
  const signG=Bk(),atlas=signAtlas();
  try{
    const n=cnt(14)+(kit.TOUCH?2:0),sr=kit.mulberry(SEED+4);let ty=2;
    for(let i=0;i<n;i++){
      const s=(i+.5)*L/n+(sr()-.5)*30,q0=kit.pose(s,0),h0=q0.hd,q1=kit.pose(s+35,0);let dh=q1.hd-h0;dh=Math.atan2(Math.sin(dh),Math.cos(dh));
      let type=Math.abs(dh)>.3?1:[0,3,4,5,6,7,2][ty++%7];
      const off=5.9+sr()*.4,p=kit.pose(s,off);if(!near(p.x,p.z,off))continue;
      const y=kit.terrainH(p.x,p.z),ry=p.hd+PI,m=XF(p.x,y,p.z,0,ry,0);
      const u0=(type%2)*.5,v0=1-((type/2|0)+1)*.25;
      const pl=GEO('PlaneGeometry',1.5,.75),pg=pl.toNonIndexed();
      put(signG,pg,m.clone().multiply(XF(0,1.75,0)),0xffffff,0,[u0,v0,.5,.25]);
      for(const sx of[-.6,.6])put(SB,GEO('CylinderGeometry',.05,.06,2.1,5),m.clone().multiply(XF(sx,.95,-.05)),0x6a5238,.1);
      CS.push({x:p.x,z:p.z,r:1.5});CB.push({x:p.x,z:p.z,r:2.5});
    }
  }catch(e){console.warn('[jungle] signs',e);}
  if(SB.p.length){const m=new T.Mesh(fin(SB),new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));STAT.calls++;STAT.tris+=triCount(m.geometry);add(m);}
  if(signG.p.length){const sm_=new T.Mesh(fin(signG),new T.MeshLambertMaterial({map:atlas,side:T.DoubleSide}));STAT.calls++;STAT.tris+=triCount(sm_.geometry);add(sm_);}
  /* ---- placer ---- */
  const inCirc=(L_,x,z)=>{for(const c of L_){const dx=x-c.x,dz=z-c.z;if(dx*dx+dz*dz<c.r*c.r)return true;}return false;};
  const bandBlock=(s,off)=>{for(const q of S){if(off*q.side>0&&Math.abs(off)>9&&Math.abs(off)<q.off+14&&s>q.s0+15&&s<q.s1-15)return true;}return false;};
  function placer(seed,big){
    const r=kit.mulberry(seed);
    return(omin,omax,pw)=>{for(let t=0;t<5;t++){const s=r()*L,side=r()<.5?-1:1,off=side*(omin+(omax-omin)*Math.pow(r(),pw||1.5)),p=kit.pose(s,off);
      if(!near(p.x,p.z,off))continue;if(inCirc(CS,p.x,p.z))continue;if(big&&(inCirc(CB,p.x,p.z)||bandBlock(s,off)))continue;
      return{x:p.x,z:p.z,y:kit.terrainH(p.x,p.z),s,off,hd:p.hd,r:r()};}return null;};
  }
  const R=kit.mulberry(SEED+5),rv=()=>R();
  const solid=new T.MeshLambertMaterial({vertexColors:true}),leaf=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const gather=(pl,n,omin,omax,pw)=>{const o=[];for(let i=0;i<n;i++){const p=pl(omin,omax,pw);if(p)o.push(p);}return o;};
  const tint=()=>treeCols[(rv()*treeCols.length)|0];
  const tryAdd=(name,fn)=>{try{fn();}catch(e){console.warn('[jungle] '+name,e);}};
  tryAdd('treeA',()=>{const g=geoTreeA(),pl=placer(SEED+10,true);
    add(mk(g,solid,gather(pl,cnt(150),7.8,60,1.4).map(p=>{const s=.8+rv()*.55;return{x:p.x,y:p.y-.3,z:p.z,ry:rv()*6,sx:s,sy:s*(.9+rv()*.35),c:tint()};}),triCount(g)));});
  tryAdd('treeB',()=>{const g=geoTreeB(),pl=placer(SEED+11,true);
    add(mk(g,solid,gather(pl,cnt(190),6.9,48,1.4).map(p=>{const s=.8+rv()*.5;return{x:p.x,y:p.y-.3,z:p.z,ry:rv()*6,sx:s,sy:s*(.9+rv()*.3),c:tint()};}),triCount(g)));});
  tryAdd('treeC',()=>{const g=geoTreeC(),pl=placer(SEED+12,false);
    add(mk(g,solid,gather(pl,cnt(280),7.6,34,1.3).map(p=>{const s=.8+rv()*.5;return{x:p.x,y:p.y-.2,z:p.z,ry:rv()*6,sx:s,sy:s*(.9+rv()*.4),c:tint()};}),triCount(g)));});
  tryAdd('palm',()=>{const g=geoPalm(),pl=placer(SEED+13,false);
    add(mk(g,leaf,gather(pl,cnt(90),6.6,38,1.4).map(p=>{const s=.8+rv()*.5;return{x:p.x,y:p.y-.2,z:p.z,ry:rv()*6,sx:s,c:tint()};}),triCount(g)));});
  tryAdd('bamboo',()=>{const g=geoBamboo(),pl=placer(SEED+14,false);
    add(mk(g,leaf,gather(pl,cnt(70),7.5,40,1.3).map(p=>{const s=.8+rv()*.5;return{x:p.x,y:p.y-.2,z:p.z,ry:rv()*6,sx:s,c:tint()};}),triCount(g)));});
  tryAdd('fern',()=>{const g=geoFern(),pl=placer(SEED+15,false);
    add(mk(g,leaf,gather(pl,cnt(420),6.4,28,1.6).map(p=>{const s=.8+rv()*.6;return{x:p.x,y:p.y-.05,z:p.z,ry:rv()*6,sx:s,sy:s*(.8+rv()*.4),c:tint()};}),triCount(g)));});
  tryAdd('broad',()=>{const g=geoBroad(),pl=placer(SEED+16,false);
    add(mk(g,leaf,gather(pl,cnt(190),6.5,30,1.5).map(p=>{const s=.8+rv()*.5;return{x:p.x,y:p.y-.05,z:p.z,ry:rv()*6,sx:s,c:tint()};}),triCount(g)));});
  tryAdd('flowers',()=>{[0xe0402a,0xf2c230,0xd23a8c,0xff8a2a].forEach((col,i)=>{const g=geoFlower(col),pl=placer(SEED+20+i,false);
    add(mk(g,leaf,gather(pl,cnt(45),5.9,22,1.5).map(p=>{const s=.9+rv()*.7;return{x:p.x,y:p.y-.02,z:p.z,ry:rv()*6,sx:s};}),triCount(g)));});});
  tryAdd('mushrooms',()=>{[0xc4301f,0xe08a2a].forEach((col,i)=>{const g=geoMush(col),pl=placer(SEED+30+i,false);
    add(mk(g,solid,gather(pl,cnt(60),5.8,20,1.5).map(p=>{const s=1+rv()*.8;return{x:p.x,y:p.y-.02,z:p.z,ry:rv()*6,sx:s};}),triCount(g)));});});
  tryAdd('vines',()=>{const g=geoVine(),pl=placer(SEED+40,false);
    add(mk(g,leaf,gather(pl,cnt(170),8.5,30,1.4).map(p=>{const out=Math.sign(p.off),q=kit.pose(p.s,p.off+out*1.5);return{x:q.x,y:p.y+14+rv()*3,z:q.z,ry:rv()*6,sx:1,sy:.6+rv()*.7,c:tint()};}),triCount(g)));});
  tryAdd('fallen',()=>{const g=geoFallen(),pl=placer(SEED+41,false),items=[];
    for(let i=0,k=0;i<cnt(28)&&k<200;k++){const p=pl(7.5,35,1.2);if(!p)continue;const sx=.7+rv()*.5,ry=rv()*TAU,ca=Math.cos(ry),sa=Math.sin(ry),e=4.5*sx;
      const ax=p.x+ca*e*1,az=p.z-sa*e,bx=p.x-ca*e,bz=p.z+sa*e;
      const ok=[[ax,az],[bx,bz]].every(c=>{const r=kit.nearest(c[0],c[1]);return r.dist>5.8;});if(!ok)continue;
      const ya=kit.terrainH(ax,az),yb=kit.terrainH(bx,bz);
      items.push({x:p.x,y:(ya+yb)/2-.15,z:p.z,ry,rz:Math.atan2(ya-yb,2*e)*.9,sx,c:tint()});i++;}
    add(mk(g,solid,items,triCount(g)));});
  tryAdd('boulders',()=>{const g=geoBoulder(),pl=placer(SEED+42,false);
    add(mk(g,solid,gather(pl,cnt(60),7.5,40,1.3).map(p=>{const s=1+rv()*2.2;return{x:p.x,y:p.y-.2,z:p.z,ry:rv()*6,sx:s,sy:s*(.6+rv()*.3),c:tint()};}),triCount(g)));});
  /* ---- water ---- */
  tryAdd('water',()=>{
    const pos=[],uv=[],idx=[],wt=waterTex();let base=0;
    S.forEach(q=>{const pts=[];for(let s=q.s0+10;s<=q.s1-10;s+=5){const c=sc(q,s);let mn=1e9;for(let l=-5;l<=5;l+=2.5){const p=kit.pose(s,c+l);mn=Math.min(mn,kit.terrainH(p.x,p.z));}pts.push({s,c,y:mn});}
      const f1=pts.map((p,i)=>{let m=1e9;for(let k=-2;k<=2;k++)m=Math.min(m,pts[clamp(i+k,0,pts.length-1)].y);return m;});
      const f2=f1.map((_,i)=>{let a=0;for(let k=-1;k<=1;k++)a+=f1[clamp(i+k,0,f1.length-1)];return a/3;});
      pts.forEach((p,i)=>{const w=4.2+Math.sin(p.s*.07)*.5,y=f2[i]+.7,a=kit.pose(p.s,p.c-q.side*w),b=kit.pose(p.s,p.c+q.side*w);
        pos.push(a.x,y,a.z,b.x,y,b.z);uv.push(0,p.s/8,1,p.s/8);
        if(i<pts.length-1){const k=base+i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}});
      base+=pts.length*2;});
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();
    // normals may point down depending on winding: force up
    const nn=g.attributes.normal;for(let i=0;i<nn.count;i++)nn.setXYZ(i,0,1,0);
    const mt=new T.MeshLambertMaterial({map:wt,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:T.DoubleSide}),m=new T.Mesh(g,mt);
    m.frustumCulled=false;STAT.calls++;STAT.tris+=idx.length/3;grp.add(m);WATERTEX=wt;
    // trail ribbons: road edge to bridge and bridge to hut
    const tp=[],ti=[],tc=[];let tb=0;
    bridges.forEach(b=>{[[5.8,Math.abs(b.a)-.5],[Math.abs(b.b)+.5,Math.abs(b.hut)-2]].forEach(seg=>{const sg=Math.sign(b.a),n=Math.max(2,Math.round((seg[1]-seg[0])/2.5));
      for(let i=0;i<=n;i++){const o=sg*lerp(seg[0],seg[1],i/n);const pa=kit.pose(b.s-1.2,o),pb=kit.pose(b.s+1.2,o);
        tp.push(pa.x,kit.terrainH(pa.x,pa.z)+.12,pa.z,pb.x,kit.terrainH(pb.x,pb.z)+.12,pb.z);const sh=.8+h2(i,b.s|0,3)*.3;tc.push(.38*sh,.27*sh,.19*sh,.38*sh,.27*sh,.19*sh);
        if(i<n){const k=tb+i*2;ti.push(k,k+1,k+2,k+1,k+3,k+2);}}
      tb+=(n+1)*2;});});
    if(ti.length){const tg=new T.BufferGeometry();tg.setAttribute('position',new T.Float32BufferAttribute(tp,3));tg.setAttribute('color',new T.Float32BufferAttribute(tc,3));tg.setIndex(ti);tg.computeVertexNormals();
      const tm=new T.Mesh(tg,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));tm.frustumCulled=false;STAT.calls++;STAT.tris+=ti.length/3;grp.add(tm);}
  });
  /* ---- light shafts (one additive mesh) ---- */
  tryAdd('shafts',()=>{
    const sr=kit.mulberry(SEED+50),sd=new T.Vector3(.3,.7,.5).normalize(),pos=[],uv=[],idx=[];let n=0;
    for(let t=0;t<60&&n<(kit.TOUCH?3:7);t++){
      const s=sr()*L,side=sr()<.5?-1:1,off=side*(10+sr()*14),p=kit.pose(s,off);if(!near(p.x,p.z,off))continue;
      const y=kit.terrainH(p.x,p.z),H=22,k=H/sd.y,tx=p.x+sd.x*k,tz=p.z+sd.z*k;
      let ok=true;for(const f of[.25,.5,.75,1]){const r=kit.nearest(p.x+(tx-p.x)*f,p.z+(tz-p.z)*f);if(r.dist<half+3)ok=false;}if(!ok)continue;
      const top=[tx,y+H,tz],w=2.6,hx=Math.hypot(sd.x,sd.z),h1=[-sd.z/hx*w,0,sd.x/hx*w];
      const q1=[[p.x-h1[0],y,p.z-h1[2]],[p.x+h1[0],y,p.z+h1[2]],[top[0]+h1[0]*1.4,top[1],top[2]+h1[2]*1.4],[top[0]-h1[0]*1.4,top[1],top[2]-h1[2]*1.4]];
      [q1].forEach(q=>{const b0=pos.length/3;q.forEach((v,i)=>{pos.push(v[0],v[1],v[2]);uv.push(i===1||i===2?1:0,i<2?0:1);});idx.push(b0,b0+1,b0+2,b0,b0+2,b0+3);});
      // second plane: crossed, width along slant direction's horizontal axis
      const q3=[[p.x-sd.x/hx*w*.5,y,p.z-sd.z/hx*w*.5],[p.x+sd.x/hx*w*.5,y,p.z+sd.z/hx*w*.5],[top[0]+sd.x/hx*w*.7,top[1],top[2]+sd.z/hx*w*.7],[top[0]-sd.x/hx*w*.7,top[1],top[2]-sd.z/hx*w*.7]];
      {const b0=pos.length/3;q3.forEach((v,i)=>{pos.push(v[0],v[1],v[2]);uv.push(i===1||i===2?1:0,i<2?0:1);});idx.push(b0,b0+1,b0+2,b0,b0+2,b0+3);}
      n++;
    }
    if(!n)return;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);
    const m=new T.Mesh(g,new T.MeshBasicMaterial({map:shaftTex(),color:0xdfffc0,transparent:true,opacity:.2,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));
    m.frustumCulled=false;m.renderOrder=3;STAT.calls++;STAT.tris+=idx.length/3;grp.add(m);
  });
  /* ---- animated atmosphere: fog sprites, fireflies, birds ---- */
  tryAdd('anim',()=>{
    const ar=kit.mulberry(SEED+60),sprites=[],dot=dotTex(128,.3);
    const nS=kit.TOUCH?6:12;
    for(let i=0;i<nS;i++){
      let p=null,off=0,s=0;for(let t=0;t<20&&!p;t++){s=ar()*L;off=(ar()<.5?-1:1)*(11+ar()*14);const q=kit.pose(s,off);if(near(q.x,q.z,off))p={x:q.x,z:q.z,hd:q.hd};}
      if(!p)continue;
      const m=new T.Sprite(new T.SpriteMaterial({map:dot,color:0xd2e6d4,transparent:true,opacity:.24,depthWrite:false}));
      const y=kit.terrainH(p.x,p.z)+1.5+ar()*2.5;m.scale.set(22+ar()*14,8+ar()*5,1);m.position.set(p.x,y,p.z);grp.add(m);STAT.calls++;STAT.tris+=2;
      sprites.push({m,x:p.x,y,z:p.z,dx:Math.sin(p.hd),dz:Math.cos(p.hd),A:10+ar()*10,sp:.05+ar()*.05,ph:ar()*6});
    }
    // fireflies
    const nF=kit.TOUCH?50:120,fp=new Float32Array(nF*3),fb=[];
    for(let i=0;i<nF;i++){let q=null;for(let t=0;t<20&&!q;t++){const s=ar()*L,off=(ar()<.5?-1:1)*(6.5+ar()*9),p=kit.pose(s,off);if(near(p.x,p.z,off))q=p;}
      if(!q)q={x:0,z:0};const y=kit.terrainH(q.x,q.z)+.6+ar()*2.6;fb.push({x:q.x,y,z:q.z,ph:ar()*6,sp:.4+ar()*.6});fp[i*3]=q.x;fp[i*3+1]=y;fp[i*3+2]=q.z;}
    const fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));
    const fl=new T.Points(fg,new T.PointsMaterial({size:.5,map:dotTex(64,.2),color:0xd8ff7a,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false}));
    fl.frustumCulled=false;grp.add(fl);STAT.calls++;
    // birds
    const nB=kit.TOUCH?4:9,bg=new T.BufferGeometry();
    bg.setAttribute('position',new T.Float32BufferAttribute([0,0,.25,-1.1,.25,-.1,0,0,-.35,0,0,.25,0,0,-.35,1.1,.25,-.1],3));
    const bm=new T.InstancedMesh(bg,new T.MeshBasicMaterial({color:0x1d2a24,side:T.DoubleSide}),nB);bm.frustumCulled=false;grp.add(bm);STAT.calls++;STAT.tris+=2*nB;
    const birds=[];for(let i=0;i<nB;i++){const q=kit.pose(ar()*L,0);birds.push({x:q.x,z:q.z,y:kit.terrainH(q.x,q.z)+30+ar()*14,R:30+ar()*40,w:(.15+ar()*.15)*(ar()<.5?-1:1),ph:ar()*6});}
    const dm=new T.Object3D();
    kit.addUpdater((dt,now)=>{
      const t=now*.001;
      for(let i=0;i<sprites.length;i++){const o=sprites[i],k=Math.sin(t*o.sp+o.ph)*o.A;o.m.position.set(o.x+o.dx*k,o.y+Math.sin(t*.2+o.ph)*.4,o.z+o.dz*k);}
      for(let i=0;i<fb.length;i++){const o=fb[i];fp[i*3]=o.x+Math.sin(t*o.sp+o.ph)*.8;fp[i*3+1]=o.y+Math.sin(t*o.sp*1.7+o.ph)*.4;fp[i*3+2]=o.z+Math.cos(t*o.sp*.8+o.ph)*.8;}
      fg.attributes.position.needsUpdate=true;
      for(let i=0;i<birds.length;i++){const o=birds[i],a=o.ph+t*o.w;dm.position.set(o.x+Math.cos(a)*o.R,o.y+Math.sin(t*.7+o.ph)*2,o.z+Math.sin(a)*o.R);
        dm.rotation.set(0,-a+(o.w>0?0:PI),0);dm.scale.set(1,.3+.9*Math.abs(Math.sin(t*5+o.ph)),1);dm.updateMatrix();bm.setMatrixAt(i,dm.matrix);}
      bm.instanceMatrix.needsUpdate=true;
      if(WATERTEX)WATERTEX.offset.y=(t*.03)%1;
    });
  });
}
let WATERTEX=null;

/* ================= terrain colour ================= */
const COL={fern:new T.Color(0x2c4a1f),litter:new T.Color(0x6a4a24),moss:new T.Color(0x35572a),soil:new T.Color(0x2b2218),rock:new T.Color(0x4a4a3e),
  bank:new T.Color(0x3d2d20),bmoss:new T.Color(0x35581f),wet:new T.Color(0x34291d),peb:new T.Color(0x8a867a)};

ApexKit.register('jungle',{
  texLen:TEXLEN,
  propScale:.05,
  kinds:['logger','jeep','pickup','bus','cart','jeep','pickup','logger'],
  obstKinds:['log','boulder','roots','dip','fence','log','boulder','log'],
  nObst:9,
  roadTexture(st,kit){KIT=kit;return buildRoad(st,kit);},
  terrainFeat(x,z,rho,dn,kit){
    KIT=kit;let f=1.3*kit.fbm(x*.035,z*.035,SEED+9,2);
    const a=streamAt(kit,x,z,dn);
    if(a&&a.e>0){const w=sstep(kit.st.half+8,kit.st.half+60,dn);if(w>.05){const k=a.q/6.2;f+=-4.6*a.e*Math.exp(-k*k)/w;}}
    return f;
  },
  terrainColor(cc,x,z,h,slope,dn,n1,near,kit){
    KIT=kit;const half=kit.st.half;
    const a=kit.fbm(x*.05,z*.05,SEED+21,3)*.5+.5,b=kit.fbm(x*.11,z*.11,SEED+33,2)*.5+.5,c=kit.fbm(x*.02,z*.02,SEED+47,2)*.5+.5;
    cc.setHex(0x1f3a1b);
    cc.lerp(COL.fern,sstep(.35,.75,a)*.6);cc.lerp(COL.litter,sstep(.5,.78,b)*.55);cc.lerp(COL.moss,sstep(.55,.8,c)*.6);cc.lerp(COL.soil,sstep(.62,.85,1-a)*.5);
    if(slope>.35)cc.lerp(COL.rock,sstep(.35,.9,slope)*.6);
    const bank=1-sstep(half+1.2,half+8,dn);
    if(bank>0){cc.lerp(COL.bank,bank*.6);cc.lerp(COL.bmoss,bank*sstep(.4,.7,b)*.6);}
    const sa=streamAt(kit,x,z,dn);
    if(sa&&sa.e>0){const w=sstep(0,1,1-sa.q/9);cc.lerp(COL.wet,w*.8*sa.e);cc.lerp(COL.peb,sstep(.5,.9,1-sa.q/5)*.4*sa.e*b);}
  },
  atmosphere(ctx){
    KIT=ctx.kit;const f=ctx.scene.fog;f.density=.0059;f.color.setHex(0xa2bba8);ctx.scene.background.setHex(0xa2bba8);
    ctx.hemi.color.setHex(0xbcd8b4);ctx.hemi.groundColor.setHex(0x3c4a2a);ctx.hemi.intensity=.95;ctx.sunLight.color.setHex(0xf1f2c8);
    const u=ctx.sky.material.uniforms;if(u){u.top.value.setHex(0x6d9a8a);u.hor.value.setHex(0xa2bba8);}
  },
  props(ctx){KIT=ctx.kit;STAT.calls=0;STAT.tris=0;WATERTEX=null;addProps(ctx);},
  vehicle(kind,rng,kit){KIT=kit;
    switch(kind){case'logger':return logger(rng,kit);case'jeep':return jeep(rng,kit);case'pickup':return pickup(rng,kit);case'bus':return bus(rng,kit);case'cart':return cart(rng,kit);}
    return null;},
  obstacle(kind,rng,kit){KIT=kit;
    switch(kind){case'log':return oLog(rng);case'boulder':return oBoulder(rng);case'roots':return oRoots(rng);case'dip':return oDip(rng);case'fence':return oFence(rng);}
    return null;}
});
})();
