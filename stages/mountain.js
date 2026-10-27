/* Alpine Pass & Valley: map module (visual upgrades only, no gameplay changes).
   Everything here is deterministic: seeded generators only, no Math.random / Date for geometry. */
(function(){
  if(!window.ApexKit)return;
  const PI=Math.PI,TAU=PI*2;
  const HALF=4.7;                       // road half width (matches the stage entry)
  const TEXLEN=2*HALF*1024/512;         // metres per texture repeat: square texels (512x1024 or 256x512)
  let waterYc=null;                     // captured from terrainColor (exact lake level)

  /* ---------- small helpers ---------- */
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const hexRGB=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
  const mixC=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  let PAL=null;
  function pal(THREE){
    if(PAL)return PAL;
    const C=h=>new THREE.Color(h);
    PAL={tmp:new THREE.Color(),
      meadowA:C(0x5f8b3a),meadowB:C(0x84a047),meadowC:C(0x4a7236),dry:C(0x9a9560),tundra:C(0x8a8461),
      floor:C(0x2d4426),needles:C(0x4a4026),
      flowerY:C(0xe9d23c),flowerP:C(0xc7a6e0),flowerW:C(0xf1ede2),flowerR:C(0xd9604a),
      rockA:C(0x8d8478),rockB:C(0x625c56),rockC:C(0xa4875f),rockD:C(0xb2a99a),
      scree:C(0xaba293),snow:C(0xf3ecea),snowShade:C(0xc9d3e6),
      shoulder:C(0x8d8572),sand:C(0xa89c80),gravel:C(0x77736b),
      bed:C(0x2c5a66),wet:C(0x5e6a52),pebble:C(0xb9ad8f),reed:C(0x6d8645)};
    return PAL;
  }

  /* periodic value noise, wraps in both axes */
  function pnoise(w,h,cx,cy,seed,kit){
    const lat=new Float32Array(cx*cy);
    for(let i=0;i<lat.length;i++)lat[i]=kit.hash2(i%cx,(i/cx)|0,seed);
    const out=new Float32Array(w*h);
    for(let y=0;y<h;y++){
      const fy=y/h*cy,iy=fy|0,ty=fy-iy,uy=ty*ty*(3-2*ty),y0=iy%cy,y1=(iy+1)%cy;
      for(let x=0;x<w;x++){
        const fx=x/w*cx,ix=fx|0,tx=fx-ix,ux=tx*tx*(3-2*tx),x0=ix%cx,x1=(ix+1)%cx;
        const a=lat[y0*cx+x0],b=lat[y0*cx+x1],c=lat[y1*cx+x0],d=lat[y1*cx+x1];
        out[y*w+x]=(a+(b-a)*ux)*(1-uy)+(c+(d-c)*ux)*uy;
      }
    }
    return out;
  }
  function overlayNoise(g,n,w,h,W,H,rgb,amt,bias){
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cg=cv.getContext('2d');
    const im=cg.createImageData(w,h),d=im.data;
    for(let i=0;i<w*h;i++){d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=clamp((n[i]-bias)*amt,0,1)*255;}
    cg.putImageData(im,0,0);
    g.imageSmoothingEnabled=true;g.drawImage(cv,0,0,W,H);
  }

  /* ================= ROAD TEXTURE ================= */
  function roadTexture(st,kit){
    const THREE=kit.THREE,T=kit.TOUCH;
    const W=T?256:512,H=T?512:1024,half=st.half,ppm=W/(2*half);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
    const rnd=kit.mulberry(2301);
    const X=m=>(m+half)*ppm;                       // metres across the road -> pixel
    const px=Math.max(1,Math.round(ppm/54));       // 1 on desktop, 1 on touch (scaled below)
    const sc=W/512;
    const wrapY=(fn)=>{fn(0);fn(-H);fn(H);};
    // base asphalt
    g.fillStyle='#5d5e64';g.fillRect(0,0,W,H);
    // large blotches: dark wear and sun bleached patches
    const nw=T?64:128,nh=T?128:256;
    overlayNoise(g,pnoise(nw,nh,5,9,11,kit),nw,nh,W,H,[28,28,34],.9,.5);
    overlayNoise(g,pnoise(nw,nh,7,15,12,kit),nw,nh,W,H,[170,166,158],.7,.58);
    overlayNoise(g,pnoise(nw,nh,16,30,13,kit),nw,nh,W,H,[18,18,22],.55,.55);
    // wheel tracks (polished dark bands) in both lanes
    for(const lc of[-2.3,2.3])for(const o of[-.85,.85]){
      const cx=X(lc+o),wd=.42*ppm;const gr=g.createLinearGradient(cx-wd,0,cx+wd,0);
      gr.addColorStop(0,'rgba(15,15,20,0)');gr.addColorStop(.5,'rgba(15,15,20,.2)');gr.addColorStop(1,'rgba(15,15,20,0)');
      g.fillStyle=gr;g.fillRect(cx-wd,0,wd*2,H);
    }
    // patches of newer asphalt and a utility trench
    for(let i=0;i<6;i++){
      const w=(.7+rnd()*1.7)*ppm,l=(1.0+rnd()*2.6)*ppm,x=X(-4.3)+rnd()*(X(4.3)-X(-4.3)-w),y=rnd()*H;
      const tone=['#52535a','#57585e','#66676c','#4c4d53'][(rnd()*4)|0];
      wrapY(dy=>{g.fillStyle=tone;g.fillRect(x,y+dy,w,l);g.strokeStyle='rgba(20,20,24,.5)';g.lineWidth=1.2*sc;g.strokeRect(x,y+dy,w,l);
        g.strokeStyle='rgba(190,190,185,.14)';g.strokeRect(x+1.5,y+dy+1.5,w-3,l-3);});
    }
    {const x=X(-4.35),w=4.2*ppm,y=H*.18,l=1.1*ppm;
      g.fillStyle='#4c4d52';g.fillRect(x,y,w,l);g.strokeStyle='rgba(15,15,18,.9)';g.lineWidth=1.8*sc;g.strokeRect(x,y,w,l);
      g.strokeStyle='rgba(200,200,195,.15)';g.strokeRect(x+2,y+2,w-4,l-4);}
    // cracks: longitudinal, branching, plus a few transverse thermal cracks sealed with tar
    const crack=(x,y,ang,len,depth)=>{
      const pts=[[x,y]];let cx=x,cy=y,a=ang;
      for(let i=0;i<len;i++){a+=(rnd()-.5)*.7;cx+=Math.cos(a)*(2+rnd()*3)*sc;cy+=Math.sin(a)*(2+rnd()*3)*sc;pts.push([cx,cy]);
        if(depth<2&&rnd()<.06)crack(cx,cy,a+(rnd()<.5?-1:1)*(.7+rnd()*.7),(len*.4)|0,depth+1);}
      wrapY(dy=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]+dy);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]+dy);
        g.strokeStyle='rgba(16,16,20,.82)';g.lineWidth=(depth?1:1.5)*sc;g.stroke();
        g.translate(1,1);g.strokeStyle='rgba(200,198,190,.13)';g.lineWidth=1;g.stroke();g.translate(-1,-1);});
    };
    for(let i=0;i<9;i++)crack(X(-4.2)+rnd()*(X(4.2)-X(-4.2)),rnd()*H,PI/2+(rnd()-.5)*.5,28+((rnd()*40)|0),0);
    for(let i=0;i<4;i++){const y=rnd()*H;g.beginPath();g.moveTo(X(-4.5),y);
      let cy=y;for(let x=X(-4.5);x<X(4.5);x+=6*sc){cy+=(rnd()-.5)*4*sc;g.lineTo(x,cy);}
      g.strokeStyle='rgba(12,12,14,.7)';g.lineWidth=2.2*sc;g.stroke();}
    g.strokeStyle='rgba(12,12,14,.6)';g.lineWidth=1.6*sc;g.beginPath();g.moveTo(0,H*.62);g.lineTo(W,H*.62);g.stroke();
    g.strokeStyle='rgba(210,208,200,.16)';g.beginPath();g.moveTo(0,H*.62+2);g.lineTo(W,H*.62+2);g.stroke();
    // alligator cracking in two spots
    for(let k=0;k<2;k++){const bx=X(-3.3+k*4.4),by=H*(.35+k*.4);
      for(let i=0;i<26;i++){const x=bx+(rnd()-.5)*1.4*ppm,y=by+(rnd()-.5)*1.4*ppm,a=rnd()*TAU,l=(.15+rnd()*.35)*ppm;
        g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.strokeStyle='rgba(16,16,20,.7)';g.lineWidth=1.1*sc;g.stroke();}}
    // frost-bleached edges
    for(const sd of[-1,1]){
      const e=X(sd*half),inn=X(sd*(half-1.2));const gr=g.createLinearGradient(e,0,inn,0);
      gr.addColorStop(0,'rgba(214,210,200,.34)');gr.addColorStop(1,'rgba(214,210,200,0)');
      g.fillStyle=gr;g.fillRect(Math.min(e,inn),0,Math.abs(e-inn),H);
    }
    // sand and gravel wash at the edges, exponential falloff, plus fans washed into the lane
    for(let f=0;f<10;f++){
      const sd=f&1?1:-1,y0=rnd()*H,len=(.5+rnd()*.9)*ppm,w=(.25+rnd()*.5)*ppm,e=X(sd*half);
      wrapY(dy=>{g.beginPath();g.moveTo(e,y0-w+dy);g.lineTo(e-sd*len,y0+dy);g.lineTo(e,y0+w+dy);g.closePath();
        g.fillStyle='rgba(176,160,128,.17)';g.fill();});
    }
    const gcols=['#b8a98a','#8c8a84','#6e6c68','#a29478','#d0c6aa','#5c5a56'];
    const nG=Math.round(3200*W*H/(512*1024));
    for(let i=0;i<nG;i++){
      const sd=rnd()<.5?-1:1,d=-Math.log(1-rnd())*.5,x=sd<0?X(-half)+d*ppm:X(half)-d*ppm,y=rnd()*H,s=(rnd()<.12?2.4:1.2)*sc;
      g.fillStyle=gcols[(rnd()*gcols.length)|0];g.globalAlpha=.55+rnd()*.4;g.fillRect(x,y,s,s);
    }
    g.globalAlpha=1;
    // aggregate speckle
    const nS=Math.round(16000*W*H/(512*1024));
    for(let i=0;i<nS;i++){const l=rnd()<.5;g.fillStyle=l?'#9a9aa0':'#1d1d21';g.globalAlpha=(l?.25:.4)*rnd();g.fillRect(rnd()*W,rnd()*H,1.4*sc,1.4*sc);}
    g.globalAlpha=1;
    // oil stains in the wheel tracks
    for(let i=0;i<8;i++){const lc=rnd()<.5?-2.3:2.3,x=X(lc+(rnd()<.5?-.85:.85)),y=rnd()*H;
      wrapY(dy=>{g.beginPath();g.ellipse(x,y+dy,(.12+rnd()*.1)*ppm,(.3+rnd()*.5)*ppm,0,0,TAU);g.fillStyle='rgba(10,10,14,.28)';g.fill();});}
    // lane markings: crisp double yellow centre line, white edge lines
    const yel='#ecb918',wht='#ecebe4';
    const line=(x0,x1,col)=>{g.fillStyle=col;g.fillRect(X(x0),0,X(x1)-X(x0),H);};
    line(-.2,-.06,yel);line(.06,.2,yel);
    line(-half+.275,-half+.425,wht);line(half-.425,half-.275,wht);
    // wear chips on the paint
    g.fillStyle='rgba(88,88,94,.6)';
    for(let i=0;i<150*(W/512);i++){const l=[-.2,.06,-half+.275,half-.425][(rnd()*4)|0],x=X(l)+rnd()*.14*ppm,y=rnd()*H;g.fillRect(x,y,(1+rnd()*2.4)*sc,(1+rnd()*5)*sc);}
    // reflective studs: amber on the centre gap, white on the edges
    for(let k=0;k<3;k++){const y=k*H/3+H*.07;g.fillStyle='#fff3c0';g.fillRect(X(-.06),y,.12*ppm,.14*ppm);}
    for(let k=0;k<2;k++)for(const e of[-half+.35,half-.35]){const y=k*H/2+H*.13;g.fillStyle='#ffffff';g.fillRect(X(e)-.05*ppm,y,.1*ppm,.12*ppm);}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
  }

  /* ================= TERRAIN ================= */
  const forestAt=(kit,x,z)=>kit.fbm(x*.007,z*.007,931,3);

  function terrainFeat(x,z,rho,dn,kit){
    let a=0;
    const out=kit.sstep(1.04,1.3,rho);
    if(out>0){
      const r=1-Math.abs(kit.fbm(x*.011,z*.011,901,3));
      a+=out*(15*r*r*r-3)+out*2.6*kit.fbm(x*.05,z*.05,905,2);
    }
    const inn=kit.sstep(.97,.8,rho);
    if(inn>0)a+=inn*3*kit.fbm(x*.016,z*.016,907,3);
    return a;
  }

  function terrainColor(cc,x,z,h,slope,dn,n1,near,kit,waterY){
    waterYc=waterY;
    const P=pal(kit.THREE),tmp=P.tmp,sstep=kit.sstep,rel=h-(waterY+52),hw=h-waterY;
    const nA=kit.fbm(x*.045,z*.045,911,2),nB=kit.fbm(x*.09+30,z*.09,913,2);
    // alpine meadow base, sun-yellow patches and darker pockets
    cc.copy(P.meadowA).lerp(P.meadowB,clamp(nA*1.4+.5,0,1)*.7);
    if(nA<-.25)cc.lerp(P.meadowC,clamp((-.25-nA)*2.2,0,.7));
    // flowers and dry grass
    if(slope<.45&&rel<45&&hw>7){
      if(nB>.3)cc.lerp(P.flowerY,clamp((nB-.3)*1.6,0,.55));
      else if(nB<-.42)cc.lerp(nB<-.55?P.flowerW:P.flowerP,clamp((-.42-nB)*2.2,0,.45));
      if(nA>.3)cc.lerp(P.dry,clamp((nA-.3)*1.4,0,.45));
    }
    // tundra with altitude
    cc.lerp(P.tundra,sstep(35,85,rel)*.75);
    // forest floor where the conifer forest stands
    if(slope<1&&rel<80){
      const f=forestAt(kit,x,z);
      if(f>-.12)cc.lerp(nB>0?P.floor:P.needles,clamp((f+.12)*3.2,0,.85)*(1-sstep(55,80,rel)));
    }
    // rock strata on steep ground
    const rockAmt=sstep(.42,.9,slope);
    if(rockAmt>0){
      const band=Math.sin(h*.5+nA*3.2),band2=Math.sin(h*.19+nB*2);
      tmp.copy(band>.35?P.rockC:band<-.35?P.rockB:P.rockA);
      if(band2>.5)tmp.lerp(P.rockD,.4);
      cc.lerp(tmp,rockAmt);
    }
    // scree below crags
    if(slope>.28&&slope<.65&&nB>-.1)cc.lerp(P.scree,sstep(.28,.4,slope)*(1-sstep(.5,.65,slope))*.55);
    // snowline: warped, thinner on steep ground
    const sl=100+16*nA+8*nB;
    const sn=sstep(sl,sl+30,rel)*(1-sstep(.55,1.05,slope)*.85);
    if(sn>0){tmp.copy(P.snow).lerp(P.snowShade,clamp(slope*.9,0,.6));cc.lerp(tmp,sn);}
    // shoreline: wet bed, pebbles, reed fringe
    if(hw<8){
      if(hw<1.2)cc.lerp(P.bed,1);
      else if(hw<3.6)cc.lerp(P.pebble,.9).lerp(P.wet,sstep(2.4,1.2,hw)*.5);
      else cc.lerp(P.reed,(1-sstep(3.6,8,hw))*.65);
    }
    // road shoulder: sand wash, gravel and verge grass
    if(dn<kit.st.half+9){
      const w=1-sstep(kit.st.half+.6,kit.st.half+9,dn);
      tmp.copy(P.shoulder).lerp(P.sand,clamp(nA*1.3+.4,0,1)*.6);
      if(nB>.1)tmp.lerp(P.gravel,.45);
      cc.lerp(tmp,w*(slope<.7?.9:.5));
      if(dn>kit.st.half+3.5)cc.lerp(P.meadowB,clamp(nA+.2,0,.5)*sstep(kit.st.half+3.5,kit.st.half+8,dn)*w*.5);
    }
  }

  /* ================= ATMOSPHERE ================= */
  function atmosphere(ctx){
    const sky=ctx.sky,u=sky&&sky.material&&sky.material.uniforms;
    if(u){
      sky.material.fragmentShader=
        'uniform vec3 top,hor,sunC,sunD;varying vec3 vP;void main(){'+
        'float h=clamp(vP.y,0.,1.);'+
        'vec3 mid=mix(vec3(.80,.52,.62),top,.55);'+
        'vec3 c=mix(hor,mid,smoothstep(0.,.30,h));c=mix(c,top,smoothstep(.25,.95,h));'+
        'float sd=max(dot(vP,sunD),0.);'+
        'float az=pow(sd,3.);'+
        'c+=vec3(1.,.55,.2)*az*.22*(1.-h*.7);'+
        'c+=vec3(1.,.62,.28)*pow(sd,10.)*.20;'+
        'c+=sunC*(pow(sd,900.)*2.4+pow(sd,26.)*.34);'+
        'c=mix(c,hor,exp(-h*14.)*.35);'+
        'if(vP.y<0.)c=hor;gl_FragColor=vec4(c,1.);}';
      sky.material.needsUpdate=true;
    }
    if(ctx.sunLight){ctx.sunLight.color.setHex(0xffc27c);ctx.sunLight.intensity=1.22;}
    if(ctx.hemi){ctx.hemi.color.setHex(0xa6b6dc);ctx.hemi.groundColor.setHex(0x7a604b);ctx.hemi.intensity=1.05;}
    if(ctx.scene&&ctx.scene.fog){ctx.scene.fog.color.setHex(0xe5b69d);if(ctx.scene.background&&ctx.scene.background.setHex)ctx.scene.background.setHex(0xe5b69d);}
  }

  let roadTex=null;
  const _rt=roadTexture;
  function roadTexture2(st,kit){roadTex=_rt(st,kit);return roadTex;}

  /* The game builds the road ribbon with a null texture-length argument, which leaves its V coordinates
     non-finite so no road texture is ever drawn. Repair the UVs of OUR road mesh only (no-op when fine). */
  function repairRoadUV(ctx){
    if(!roadTex)return;
    ctx.grp.traverse(o=>{
      if(!o.isMesh||!o.material||o.material.map!==roadTex)return;
      const uv=o.geometry&&o.geometry.attributes&&o.geometry.attributes.uv;if(!uv)return;
      if(isFinite(uv.array[1])&&isFinite(uv.array[uv.array.length-1]))return;
      const L=ctx.L,DS=ctx.DS,tl=L/Math.max(1,Math.round(L/TEXLEN)),n=uv.count>>1;
      for(let j=0;j<n;j++){const v=j*DS/tl;uv.array[j*4]=0;uv.array[j*4+1]=v;uv.array[j*4+2]=1;uv.array[j*4+3]=v;}
      uv.needsUpdate=true;
    });
  }

  /* ================= GEOMETRY BUILDER (vertex coloured, flat shaded, baked transforms) ================= */
  function Builder(kit){
    const P=[],N=[],C=[];
    let tx=0,ty=0,tz=0,cs=1,sn=0,k=1,ky=1,jit=0,jseed=0;
    const hsh=(x,y,z,o)=>kit.hash2(Math.round(x*40)*131+Math.round(y*40),Math.round(z*40)+o*977,jseed+o)-.5;
    const B={
      T(x,y,z,yaw,s,sy){tx=x;ty=y;tz=z;cs=Math.cos(yaw||0);sn=Math.sin(yaw||0);k=s||1;ky=sy||k;return B;},
      J(a,seed){jit=a;jseed=seed|0;return B;},
      get count(){return P.length/9;},
      tri(a,b,c,ca,cb,cc){
        const w=[a,b,c];const o=[0,0,0,0,0,0,0,0,0];
        for(let i=0;i<3;i++){let x=w[i][0],y=w[i][1],z=w[i][2];
          if(jit){x+=hsh(x,y,z,1)*jit;y+=hsh(x,y,z,2)*jit*.6;z+=hsh(x,y,z,3)*jit;}
          x*=k;z*=k;y*=ky;o[i*3]=x*cs+z*sn+tx;o[i*3+1]=y+ty;o[i*3+2]=-x*sn+z*cs+tz;}
        const ux=o[3]-o[0],uy=o[4]-o[1],uz=o[5]-o[2],vx=o[6]-o[0],vy=o[7]-o[1],vz=o[8]-o[2];
        let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
        for(let i=0;i<3;i++){P.push(o[i*3],o[i*3+1],o[i*3+2]);N.push(nx,ny,nz);const c=i===0?ca:i===1?cb:cc;C.push(c[0],c[1],c[2]);}
        return ny;
      },
      quad(a,b,c,d,ca,cb,cc,cd){B.tri(a,b,c,ca,cb,cc);B.tri(a,c,d,ca,cc,cd);},
      box(w,h,d,cx,cy,cz,cB,cT){
        cT=cT||cB;const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
        const dk=mixC(cB,[0,0,0],.35);
        B.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],cB,cB,cT,cT);
        B.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],cB,cB,cT,cT);
        B.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],cB,cB,cT,cT);
        B.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],cB,cB,cT,cT);
        B.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],cT,cT,cT,cT);
        B.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],dk,dk,dk,dk);
        return B;
      },
      cone(cx,cy,cz,r,h,seg,cB,cT,rot,jag){
        rot=rot||0;jag=jag||0;const tip=[cx,cy+h,cz];
        for(let i=0;i<seg;i++){
          const a0=rot+i/seg*TAU,a1=rot+(i+1)/seg*TAU,r0=r*((i&1)?1-jag:1),r1=r*(((i+1)&1)?1-jag:1);
          B.tri([cx+Math.sin(a0)*r0,cy,cz+Math.cos(a0)*r0],[cx+Math.sin(a1)*r1,cy,cz+Math.cos(a1)*r1],tip,cB,cB,cT);
        }
        return B;
      },
      cyl(cx,cy,cz,r0,r1,h,seg,cB,cT,capCol){
        for(let i=0;i<seg;i++){
          const a0=i/seg*TAU,a1=(i+1)/seg*TAU;
          const p0=[cx+Math.sin(a0)*r0,cy,cz+Math.cos(a0)*r0],p1=[cx+Math.sin(a1)*r0,cy,cz+Math.cos(a1)*r0];
          const q0=[cx+Math.sin(a0)*r1,cy+h,cz+Math.cos(a0)*r1],q1=[cx+Math.sin(a1)*r1,cy+h,cz+Math.cos(a1)*r1];
          B.quad(p0,p1,q1,q0,cB,cB,cT,cT);
          if(capCol)B.tri([cx,cy+h,cz],q0,q1,capCol,capCol,capCol);
        }
        return B;
      },
      gable(cx,cy,cz,w,d,h,cS,cR,cE){
        const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,yr=cy+h;
        B.quad([x0,cy,z0],[x0,cy,z1],[cx,yr,z1],[cx,yr,z0],cS,cS,cR,cR);
        B.quad([x1,cy,z1],[x1,cy,z0],[cx,yr,z0],[cx,yr,z1],cS,cS,cR,cR);
        B.tri([x0,cy,z1],[x1,cy,z1],[cx,yr,z1],cE,cE,cE);
        B.tri([x1,cy,z0],[x0,cy,z0],[cx,yr,z0],cE,cE,cE);
        return B;
      },
      blob(cx,cy,cz,rx,ry,rz,cB,cT,detail){
        const g=new kit.THREE.IcosahedronGeometry(1,detail||0),p=g.attributes.position.array;
        for(let i=0;i<p.length;i+=9){
          const v=[];for(let q=0;q<3;q++){v.push([cx+p[i+q*3]*rx,cy+p[i+q*3+1]*ry,cz+p[i+q*3+2]*rz]);}
          const col=v.map(a=>mixC(cB,cT,clamp((a[1]-cy)/ry*.5+.5,0,1)));
          const ny=B.tri(v[0],v[1],v[2],col[0],col[1],col[2]);
          if(ny>.7){const n=C.length;for(let q=0;q<9;q++)C[n-9+q]=Math.min(1,C[n-9+q]*1.12);}
        }
        g.dispose();return B;
      },
      /* half ring arch spanning along local x, thickness t, depth wd */
      arch(cx,cy,cz,R,t,wd,n,c){
        for(let i=0;i<n;i++){
          const a0=PI*i/n,a1=PI*(i+1)/n,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),z0=cz-wd/2,z1=cz+wd/2;
          const O0=[cx+c0*(R+t),cy+s0*(R+t)],O1=[cx+c1*(R+t),cy+s1*(R+t)],I0=[cx+c0*R,cy+s0*R],I1=[cx+c1*R,cy+s1*R];
          B.quad([O0[0],O0[1],z1],[O1[0],O1[1],z1],[O1[0],O1[1],z0],[O0[0],O0[1],z0],c,c,c,c);
          B.quad([I0[0],I0[1],z0],[I1[0],I1[1],z0],[I1[0],I1[1],z1],[I0[0],I0[1],z1],c,c,c,c);
          B.quad([I0[0],I0[1],z1],[I1[0],I1[1],z1],[O1[0],O1[1],z1],[O0[0],O0[1],z1],c,c,c,c);
          B.quad([O0[0],O0[1],z0],[O1[0],O1[1],z0],[I1[0],I1[1],z0],[I0[0],I0[1],z0],c,c,c,c);
        }
        return B;
      },
      build(){
        const g=new kit.THREE.BufferGeometry();
        g.setAttribute('position',new kit.THREE.BufferAttribute(new Float32Array(P),3));
        g.setAttribute('normal',new kit.THREE.BufferAttribute(new Float32Array(N),3));
        g.setAttribute('color',new kit.THREE.BufferAttribute(new Float32Array(C),3));
        g.computeBoundingSphere();return g;
      }
    };
    return B;
  }
  const vcMat=THREE=>new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});

  /* ================= SHARED WORLD INFO ================= */
  function worldInfo(kit){
    const L=kit.L;let sy=0,sx=0,sz=0,n=0;
    for(let s=0;s<L;s+=15){const p=kit.pose(s,0);sy+=p.y;sx+=p.x;sz+=p.z;n++;}
    const meanY=sy/n,WY=waterYc!==null?waterYc:meanY-52;
    return{WY,MY:WY+52,cx:sx/n,cz:sz/n};
  }
  const slopeAt=(kit,x,z)=>{const a=kit.terrainH(x+3,z)-kit.terrainH(x-3,z),b=kit.terrainH(x,z+3)-kit.terrainH(x,z-3);return Math.hypot(a,b)/6;};
  const dist2road=(kit,x,z)=>kit.nearest(x,z).dist;

  /* ================= TREES, SHRUBS, FLOWERS ================= */
  const GREENS=[[0x1b3a22,0x2a5a2e],[0x1d4026,0x2f6232],[0x203d20,0x34643a],[0x17352a,0x265446]];
  function spruceGeo(kit,tiers,seg,wide,snow,seed){
    const B=Builder(kit).J(.1,seed);const tr=hexRGB(0x4a3626),tr2=hexRGB(0x5a4531);
    B.cyl(0,0,0,.24,.15,1.8,5,tr,tr2);
    const g=GREENS[seed%GREENS.length];
    for(let i=0;i<tiers;i++){
      const t=i/(tiers-1),y=1.0+t*(tiers>3?5.6:4.6),r=(2.5-1.75*t)*wide,h=(3.1-.7*t)*(tiers>3?1:1.2);
      let cB=mixC(hexRGB(g[0]),hexRGB(g[1]),t),cT=mixC(hexRGB(g[1]),hexRGB(0x5d9a4a),.35+.2*t);
      if(snow){cB=mixC(cB,hexRGB(0xe8eef4),.28+.3*t);cT=hexRGB(0xf2f5f8);}
      B.cone(0,y,0,r,h,seg*2,cB,cT,t*1.1,.3);
    }
    return B.build();
  }
  function farTreeGeo(kit){
    const B=Builder(kit);
    for(let i=0;i<3;i++){const t=i/2;B.cone(0,.8+i*2.7,0,2.3-1.2*t,3.6,5,hexRGB(0x1c3d24),hexRGB(0x2f5e34),i);}
    return B.build();
  }
  function aspenGeo(kit,seed){ // golden larch
    const B=Builder(kit).J(.1,seed);const cols=[[0x8f7e2c,0xd0a83c],[0x7f8a30,0xbdb544],[0xa4642c,0xd08c40]][seed%3];
    B.cyl(0,0,0,.2,.14,1.6,5,hexRGB(0x4f3a28),hexRGB(0x5a4531));
    for(let i=0;i<4;i++){const t=i/3;B.cone(0,1.0+t*4.6,0,(2.3-1.5*t),3.0,10,hexRGB(cols[0]),hexRGB(cols[1]),t,.3);}
    return B.build();
  }
  function buildTrees(ctx,W){
    const kit=ctx.kit,THREE=kit.THREE,grp=ctx.grp,T=kit.TOUCH,D=T?.45:1,HF=HALF;
    const rng=kit.mulberry(7741),mat=vcMat(THREE);
    const mk=(geometry,items)=>{if(!items.length)return;const m=kit.inst(geometry,mat,items);m.castShadow=false;m.receiveShadow=false;grp.add(m);};
    const tints=[0xffffff,0xeef4e8,0xf4efdc,0xdfe9d6,0xe9eadf];
    const near={fir:[],spr:[],snow:[]},far=[],aspen=[],shr=[],flw=[];
    const target={near:Math.round(950*D),far:Math.round(1500*D)};
    const L=kit.L;
    const ok=(x,z,off,farMode)=>{
      const h=kit.terrainH(x,z),hw=h-W.WY,rel=h-W.MY;if(hw<5.5)return null;
      const sl=slopeAt(kit,x,z);if(sl>1.05)return null;
      const line=66+18*kit.fbm(x*.01,z*.01,917,2);if(rel>line)return null;
      const f=forestAt(kit,x,z);let dens=clamp((f+.1)*3.2,0,1);
      const e=off-HF;if(e<12)dens*=.5+e*.04;
      if(rng()>dens)return null;
      return{h,rel,sl};
    };
    let tries=0;
    while(near.fir.length+near.spr.length+near.snow.length<target.near&&tries++<26000){
      const s=rng()*L,side=rng()<.5?-1:1,off=HF+2.8+Math.pow(rng(),1.7)*(side<0?110:150);
      const p=kit.pose(s,side*off),x=p.x,z=p.z;
      if(dist2road(kit,x,z)<HF+2.4)continue;
      const r=ok(x,z,off);if(!r)continue;
      const sc=(.45+rng()*.5)*(1-.3*kit.sstep(30,90,r.rel)),it={x,y:r.h-.25,z,sx:sc,sy:sc*(.9+rng()*.5),ry:rng()*6.28,c:tints[(rng()*tints.length)|0]};
      const q=rng();
      if(r.rel>48&&q<.65)near.snow.push(it);else if(q<.55)near.fir.push(it);else near.spr.push(it);
    }
    tries=0;
    while(far.length<target.far&&tries++<30000){
      const s=rng()*L,side=rng()<.5?-1:1,off=HF+70+rng()*(side<0?380:300);
      const p=kit.pose(s,side*off),x=p.x,z=p.z;
      const r=ok(x,z,off,true);if(!r)continue;
      const sc=(.8+rng()*.9)*(1-.3*kit.sstep(30,90,r.rel));
      far.push({x,y:r.h-.3,z,sx:sc*1.1,sy:sc*(1.1+rng()*.5),ry:rng()*6.28,c:tints[(rng()*tints.length)|0]});
    }
    // golden aspens and larches in the valley and along streams
    tries=0;const nAs=Math.round(150*D);
    while(aspen.length<nAs&&tries++<6000){
      const s=rng()*L,side=rng()<.65?1:-1,off=HF+4+rng()*70;const p=kit.pose(s,side*off);
      if(dist2road(kit,p.x,p.z)<HF+3)continue;
      const h=kit.terrainH(p.x,p.z);if(h-W.WY<6)continue;if(slopeAt(kit,p.x,p.z)>.6||h-W.MY>40)continue;
      if(kit.fbm(p.x*.02,p.z*.02,919,2)<.05)continue;
      const sc=.35+rng()*.3;aspen.push({x:p.x,y:h-.2,z:p.z,sx:sc,sy:sc*(.9+rng()*.3),ry:rng()*6.28,c:0xffffff});
    }
    // roadside shrubs and wildflower tufts (never inside HALF+1.5)
    tries=0;const nSh=Math.round(420*D),nFl=Math.round(520*D);
    while((shr.length<nSh||flw.length<nFl)&&tries++<9000){
      const s=rng()*L,side=rng()<.5?-1:1,off=HF+2+Math.pow(rng(),1.5)*34;const p=kit.pose(s,side*off);
      const x=p.x,z=p.z;if(dist2road(kit,x,z)<HF+1.9)continue;
      const h=kit.terrainH(x,z);if(h-W.WY<6)continue;const sl=slopeAt(kit,x,z);if(sl>.7)continue;
      if(rng()<.45&&shr.length<nSh){const sc=.3+rng()*.6;shr.push({x,y:h,z,sx:sc*1.3,sy:sc*.75,sz:sc*1.3,ry:rng()*6,c:[0x4b6f38,0x5e7d3c,0x6d6b3a,0x3d5f35,0x7a5d3c][(rng()*5)|0]});}
      else if(flw.length<nFl&&sl<.45){const n=kit.fbm(x*.09+30,z*.09,913,2);
        const c=n>.15?0xeacb3a:n<-.2?0xd9d0ee:rng()<.5?0xe26b52:0xf3efe4;
        for(let q=0;q<3&&flw.length<nFl;q++){const a=rng()*6.28,d=rng()*1.6,sc=.07+rng()*.07;flw.push({x:x+Math.cos(a)*d,y:kit.terrainH(x+Math.cos(a)*d,z+Math.sin(a)*d)+.12,z:z+Math.sin(a)*d,sx:sc,sy:sc*.8,sz:sc,ry:rng()*6,c});}}
    }
    mk(spruceGeo(kit,4,3,1,false,0),near.fir);
    mk(spruceGeo(kit,4,3,.8,false,1),near.spr);
    mk(spruceGeo(kit,4,3,1,true,2),near.snow);
    mk(farTreeGeo(kit),far);
    mk(aspenGeo(kit,0),aspen.filter((_,i)=>i%3===0));mk(aspenGeo(kit,1),aspen.filter((_,i)=>i%3===1));mk(aspenGeo(kit,2),aspen.filter((_,i)=>i%3===2));
    const sh=new THREE.MeshLambertMaterial();
    if(shr.length){const m=kit.inst(kit.geo('IcosahedronGeometry',1,0),sh,shr);grp.add(m);}
    if(flw.length){const m=kit.inst(kit.geo('OctahedronGeometry',1,0),sh,flw);grp.add(m);}
  }

  /* ================= ROCKS, CRAGS AND BOULDERS (baked into the scenery mesh) ================= */
  const STRATA=[[0x8d8478,0x9d9487],[0x6b655e,0x7c756c],[0xa48a66,0xb59c78],[0x7a736b,0x8b847b],[0x5f5a55,0x706a64]];
  function addCrag(B,rng,x,y,z,yaw,sc,sy){
    B.T(x,y,z,yaw,sc,sy).J(.3,(rng()*1000)|0);
    const layers=4+((rng()*2)|0);let yy=-1.4,r=2.7+rng()*1.3;
    for(let i=0;i<layers;i++){
      const h=1.6+rng()*1.5,r1=r*(.7+rng()*.14),ox=(rng()-.5)*.9,oz=(rng()-.5)*.9,c=STRATA[(i+((rng()*5)|0))%5];
      B.cyl(ox,yy,oz,r,r1,h,6,hexRGB(c[0]),hexRGB(c[1]));yy+=h;r=r1;
    }
    B.cone(0,yy,0,r*.95,2+rng()*2.6,6,hexRGB(0x8d8478),hexRGB(0xc2b9aa),rng()*3,.3);
    if(rng()<.5){const c=STRATA[(rng()*5)|0];B.cyl(2.6,-1.4,.6,1.5,.9,3+rng()*3,5,hexRGB(c[0]),hexRGB(c[1]));}
  }
  function buildRocks(ctx,W,B){
    const kit=ctx.kit,rng=kit.mulberry(5521),L=kit.L,D=kit.TOUCH?.6:1;
    let n=0,tries=0;const nc=Math.round(64*D);
    while(n<nc&&tries++<4000){
      const s=rng()*L,side=rng()<.8?-1:1,off=HALF+(side<0?9+rng()*75:14+rng()*60),p=kit.pose(s,side*off);
      if(dist2road(kit,p.x,p.z)<HALF+7)continue;
      const h=kit.terrainH(p.x,p.z);if(h-W.WY<8)continue;
      const sl=slopeAt(kit,p.x,p.z);if(sl<(side<0?.4:.55))continue;
      const sc=.75+rng()*1.5;
      addCrag(B,rng,p.x,h,p.z,rng()*6.28,sc*1.15,sc*(.45+rng()*.55));n++;
    }
    // boulders and rockfall debris along the verges
    const nb=Math.round(190*D);n=0;tries=0;
    while(n<nb&&tries++<4000){
      const s=rng()*L,side=rng()<.55?-1:1,off=HALF+2.1+Math.pow(rng(),1.4)*(side<0?40:26),p=kit.pose(s,side*off);
      if(dist2road(kit,p.x,p.z)<HALF+1.9)continue;
      const h=kit.terrainH(p.x,p.z);if(h-W.WY<6)continue;
      const sc=.45+Math.pow(rng(),2)*2.1,c=STRATA[(rng()*5)|0];
      B.T(p.x,h+sc*.25,p.z,rng()*6.28,1).J(.18,(rng()*500)|0);
      B.blob(0,0,0,sc*(1+rng()*.5),sc*.7,sc*(.9+rng()*.4),hexRGB(c[0]),hexRGB(c[1]),0);n++;
    }
    B.J(0);
  }

  /* ================= STONE RETAINING WALLS AND PARAPETS ================= */
  function stoneTexture(kit){
    const THREE=kit.THREE,cv=document.createElement('canvas');cv.width=256;cv.height=256;const g=cv.getContext('2d'),r=kit.mulberry(311);
    g.fillStyle='#3d3a35';g.fillRect(0,0,256,256);
    const cols=['#8d867a','#9a9285','#7d776d','#a39a89','#6f6a62','#8a8272','#b0a690'];
    for(let row=0;row<8;row++){
      let x=-r()*30;const y=row*32;
      while(x<256){const w=36+r()*52,c=cols[(r()*cols.length)|0];
        const bx=Math.max(0,x),ex=Math.min(256,x+w);if(ex>bx){g.fillStyle=c;g.fillRect(bx+1.5,y+1.5,ex-bx-3,29);
          g.fillStyle='rgba(255,255,255,.1)';g.fillRect(bx+1.5,y+1.5,ex-bx-3,4);g.fillStyle='rgba(0,0,0,.12)';g.fillRect(bx+1.5,y+26,ex-bx-3,4);}
        x+=w;}
    }
    for(let i=0;i<1400;i++){g.fillStyle=r()<.5?'rgba(0,0,0,.14)':'rgba(255,255,255,.1)';g.fillRect(r()*256,r()*256,2,2);}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
  }
  function buildWalls(ctx,W){
    const kit=ctx.kit,THREE=kit.THREE,rng=kit.mulberry(6133),L=kit.L,DS=kit.DS;
    const segs=[];let guard=0;
    const nL=kit.TOUCH?7:11,nR=kit.TOUCH?3:5;
    const tryAdd=(side,minLen,maxLen,H0,H1)=>{
      for(let t=0;t<30;t++){
        const len=minLen+rng()*(maxLen-minLen),s0=80+rng()*(L-160-len);
        if(segs.some(q=>q.side===side&&s0<q.s1+30&&s0+len>q.s0-30))continue;
        segs.push({side,s0,s1:s0+len,H:H0+rng()*(H1-H0)});return;
      }
    };
    for(let i=0;i<nL;i++)tryAdd(-1,45,130,1.3,2.3);
    for(let i=0;i<nR;i++)tryAdd(1,35,90,.8,1.05);
    const pos=[],uv=[],idx=[];
    for(const sg of segs){
      const n=Math.max(2,Math.ceil((sg.s1-sg.s0)/3)),base=pos.length/3;
      const off0=sg.side*(HALF+1.7),off1=sg.side*(HALF+2.3);
      for(let i=0;i<=n;i++){
        const s=sg.s0+(sg.s1-sg.s0)*i/n,p=kit.pose(s,off0),q=kit.pose(s,off1),ed=Math.min(i,n-i)*3;
        const H=.12+sg.H*kit.sstep(0,14,ed),u=s/3;
        // front-bottom, front-top, back-top
        pos.push(p.x,p.y-.3,p.z, p.x,p.y+H,p.z, q.x,p.y+H,q.z);
        uv.push(u,0, u,(H+.3)/2.2, u,(H+.3)/2.2+.25);
      }
      for(let i=0;i<n;i++){
        const i0=base+i*3;
        idx.push(i0,i0+3,i0+1, i0+1,i0+3,i0+4, i0+1,i0+4,i0+2, i0+2,i0+4,i0+5);
      }
    }
    if(!pos.length)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
    g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(uv),2));
    g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:stoneTexture(kit),side:THREE.DoubleSide}));
    m.castShadow=false;m.receiveShadow=true;m.frustumCulled=false;ctx.grp.add(m);
  }

  /* ================= VILLAGES AND CHALETS ================= */
  const WOOD=[[0x6e4527,0x8b5a34],[0x7c5230,0x9c6b3e],[0x5f3d24,0x7a5030]],ROOF=[0x5b3a2c,0x7a3b2a,0x4d555f,0x6b4a34,0x8a4a30];
  const SHUT=[0xa3392b,0x2f6b46,0x2b4f8a,0x7a5a2a];
  function addChalet(B,rng,kit,x,z,yaw,sc){
    const w=6.4,d=5.4,cs=Math.cos(yaw),sn=Math.sin(yaw);
    let mn=1e9,mx=-1e9;
    for(const [lx,lz] of[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[0,0]]){
      const wx=x+(lx*cs+lz*sn)*sc,wz=z+(-lx*sn+lz*cs)*sc,h=kit.terrainH(wx,wz);mn=Math.min(mn,h);mx=Math.max(mx,h);
    }
    const yf=mx+.35,fh=yf-mn+.5;
    const wd=WOOD[(rng()*3)|0],plaster=rng()<.4,lit=rng()<.5,roof=hexRGB(ROOF[(rng()*ROOF.length)|0]),sh=hexRGB(SHUT[(rng()*SHUT.length)|0]);
    const stone=hexRGB(0x8a8478),stoneD=hexRGB(0x5f5a52),glass=hexRGB(0x25323f),glow=hexRGB(0xffd48a);
    const cLow=plaster?hexRGB(0xe3d9c3):hexRGB(wd[0]),cLow2=plaster?hexRGB(0xf0e8d6):hexRGB(wd[1]),cUp=hexRGB(wd[0]),cUp2=hexRGB(wd[1]);
    B.T(x,yf,z,yaw,sc);
    B.box(w+.5,fh,d+.5,0,-fh/2,0,stoneD,stone);
    B.box(w,2.5,d,0,1.25,0,cLow,cLow2);
    B.box(w+.6,2.2,d+.6,0,3.6,0,cUp,cUp2);
    B.box(w+1,.14,1.4,0,2.62,d/2+.9,hexRGB(wd[1]),hexRGB(wd[1]));
    B.box(w+1,.5,.08,0,2.95,d/2+1.55,hexRGB(wd[0]),hexRGB(wd[1]));
    B.gable(0,4.7,0,w+2.1,d+1.8,2.7,roof,mixC(roof,[1,1,1],.18),hexRGB(wd[1]));
    for(const sx of[-2,2]){
      B.box(.9,1,.06,sx,1.55,d/2+.04,lit?glow:glass);B.box(.3,1,.08,sx-.65,1.55,d/2+.05,sh);B.box(.3,1,.08,sx+.65,1.55,d/2+.05,sh);
    }
    B.box(.95,1.9,.08,0,.95,d/2+.04,hexRGB(0x4a2f1c));
    for(const sx of[-1.7,1.7]){
      B.box(.9,1,.06,sx,3.7,(d+.6)/2+.04,lit&&rng()<.7?glow:glass);B.box(.3,1,.08,sx-.65,3.7,(d+.6)/2+.05,sh);B.box(.3,1,.08,sx+.65,3.7,(d+.6)/2+.05,sh);
    }
    B.box(.55,1.7,.55,w/4,6.1,-d/4,stone,stone);
  }
  function addBarn(B,rng,kit,x,z,yaw){
    const w=8.4,d=6.4,cs=Math.cos(yaw),sn=Math.sin(yaw);let mn=1e9,mx=-1e9;
    for(const [lx,lz] of[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]]){const h=kit.terrainH(x+lx*cs+lz*sn,z-lx*sn+lz*cs);mn=Math.min(mn,h);mx=Math.max(mx,h);}
    const yf=mx+.2,fh=yf-mn+.5;B.T(x,yf,z,yaw,1);
    B.box(w+.4,fh,d+.4,0,-fh/2,0,hexRGB(0x5f5a52),hexRGB(0x8a8478));
    B.box(w,3.4,d,0,1.7,0,hexRGB(0x4f3320),hexRGB(0x6a4528));
    B.gable(0,3.4,0,w+1.4,d+1.2,2.4,hexRGB(0x5a4a3c),hexRGB(0x75624f),hexRGB(0x5a3a22));
    B.box(2.6,2.6,.1,0,1.3,d/2+.05,hexRGB(0x3a2616));
  }
  function addChurch(B,rng,kit,x,z,yaw){
    const cs=Math.cos(yaw),sn=Math.sin(yaw);let mn=1e9,mx=-1e9;
    for(let i=0;i<8;i++){const lx=(i&1?1:-1)*3.4,lz=(i&2?1:-1)*7+(i&4?0:0);const h=kit.terrainH(x+lx*cs+lz*sn,z-lx*sn+lz*cs);mn=Math.min(mn,h);mx=Math.max(mx,h);}
    const yf=mx+.3,fh=yf-mn+.6;B.T(x,yf,z,yaw,1);
    B.box(7.4,fh,15,0,-fh/2,0,hexRGB(0x5f5a52),hexRGB(0x8a8478));
    B.box(6.4,5.2,11,0,2.6,-1.5,hexRGB(0xe0d6c2),hexRGB(0xf1e9d8));
    B.gable(0,5.2,-1.5,7.4,12,3.2,hexRGB(0x9b4a35),hexRGB(0xb5604a),hexRGB(0xe9e0cd));
    B.box(4,12,4,0,6,5.2,hexRGB(0xe0d6c2),hexRGB(0xf1e9d8));
    B.box(1.4,2,.1,0,13.2,7.25,hexRGB(0x2a2622));
    B.cone(0,12,5.2,3,8,4,hexRGB(0x3c4a58),hexRGB(0x6a7d90),.78);
    B.box(.12,1.2,.12,0,20.4,5.2,hexRGB(0xd8b24a));B.box(.7,.12,.12,0,20.7,5.2,hexRGB(0xd8b24a));
    B.box(.9,1.6,.08,0,1.5,7.55,hexRGB(0x4a2f1c));
  }
  function findSites(kit,W,wantN){
    const L=kit.L,all=[];
    for(let s=0;s<L;s+=25)for(const off of[40,58,80,104,130]){
      const p=kit.pose(s,off);
      if(dist2road(kit,p.x,p.z)<HALF+28)continue;
      const h=kit.terrainH(p.x,p.z);if(h-W.WY<7||h>p.y-3)continue;
      let mn=h,mx=h;for(let k=0;k<8;k++){const a=k*PI/4,hh=kit.terrainH(p.x+Math.cos(a)*14,p.z+Math.sin(a)*14);mn=Math.min(mn,hh);mx=Math.max(mx,hh);}
      all.push({s,x:p.x,z:p.z,h,fl:mx-mn});
    }
    all.sort((a,b)=>a.fl-b.fl);const out=[];
    for(const c of all){if(c.fl>10||out.length>=wantN)break;if(out.every(o=>Math.hypot(o.x-c.x,o.z-c.z)>240))out.push(c);}
    return out;
  }
  function buildVillages(ctx,W,B){
    const kit=ctx.kit,rng=kit.mulberry(8811),sites=findSites(kit,W,kit.TOUCH?2:3);
    W.sites=sites;
    sites.forEach((si,k)=>{
      const placed=[];const target=kit.TOUCH?7:11;let tries=0;
      while(placed.length<target&&tries++<160){
        const first=placed.length===0,a=rng()*TAU,d=first?rng()*5:Math.sqrt(rng())*28;
        const x=si.x+Math.cos(a)*d,z=si.z+Math.sin(a)*d;
        if(placed.some(q=>Math.hypot(q.x-x,q.z-z)<(first?0:12)))continue;
        if(dist2road(kit,x,z)<HALF+24)continue;
        const h=kit.terrainH(x,z);if(h-W.WY<6.5)continue;
        const rg=Math.abs(kit.terrainH(x+5,z)-kit.terrainH(x-5,z))+Math.abs(kit.terrainH(x,z+5)-kit.terrainH(x,z-5));if(rg>(first?4:7))continue;
        const yaw=Math.atan2(W.cx-x,W.cz-z)+(rng()-.5)*.55;
        if(first&&k===0)addChurch(B,rng,kit,x,z,yaw);
        else if(!first&&rng()<.2)addBarn(B,rng,kit,x,z,yaw);
        else addChalet(B,rng,kit,x,z,yaw,.9+rng()*.35);
        placed.push({x,z});
      }
    });
  }

  /* ================= VIADUCTS (far, visual only) ================= */
  function addViaduct(B,kit,W,ang,shift){
    const dx=Math.cos(ang),dz=Math.sin(ang),Yd=W.WY+7;
    const px=W.cx-dz*shift,pz=W.cz+dx*shift;
    if(kit.terrainH(px,pz)>W.WY-1)return false;
    const walk=sgn=>{let t=0;for(;t<800;t+=5){const x=px+dx*sgn*t,z=pz+dz*sgn*t;if(kit.terrainH(x,z)>Yd-1)break;}return t;};
    const ta=walk(-1),tb=walk(1);const len=ta+tb;if(len<100||len>950)return false;
    for(let t=-ta;t<=tb;t+=10)if(dist2road(kit,px+dx*t,pz+dz*t)<90)return false;
    const stone=hexRGB(0xa89f8c),stoneD=hexRGB(0x6c665c),deck=hexRGB(0xc3bba9);
    const yaw=Math.atan2(-dz,dx),n=Math.max(3,Math.round((len+8)/19)),sp=(len+8)/n,x0=-ta-4;
    const at=t=>[px+dx*t,pz+dz*t];
    B.T(px,0,pz,yaw,1);
    const R=sp/2-1.5,tk=1.1,cy=Yd-1.5-R-tk;
    for(let i=0;i<n;i++){
      const tm=x0+sp*(i+.5);
      B.arch(tm,cy,0,R,tk,4.6,10,i&1?stone:mixC(stone,stoneD,.15));
    }
    for(let i=1;i<n;i++){
      const t=x0+sp*i,a=at(t),base=Math.min(kit.terrainH(a[0],a[1]),W.WY)-1.5;
      B.box(2.6,Yd-1.2-base,4.8,t,(Yd-1.2+base)/2,0,stoneD,stone);
    }
    B.box(len+8,1.3,5.6,(tb-ta)/2,Yd-.65,0,deck,deck);
    B.box(len+8,.85,.4,(tb-ta)/2,Yd+.45,2.6,stone,stone);B.box(len+8,.85,.4,(tb-ta)/2,Yd+.45,-2.6,stone,stone);
    return true;
  }
  function buildViaducts(ctx,W,B){
    const kit=ctx.kit;let made=0;
    for(const [ang,sh] of[[.35,-20],[1.9,30],[2.8,-60],[.9,70],[1.3,-110],[0,0],[1.57,0],[.6,40],[2.3,-40],[1.1,-30],[2.0,60],[.2,90],[2.6,50]]){
      if(addViaduct(B,kit,W,ang,sh)){made++;if(made>=(kit.TOUCH?1:2))break;}
    }
    W.viaducts=made;
  }

  /* ================= STREAMS, WATERFALLS, LAKE SHIMMER ================= */
  function flowTexture(kit){
    const THREE=kit.THREE,cv=document.createElement('canvas');cv.width=64;cv.height=256;const g=cv.getContext('2d'),r=kit.mulberry(77);
    for(let i=0;i<46;i++){const x=6+r()*52,y=r()*256,l=30+r()*90,a=.35+r()*.6;
      for(const dy of[-256,0,256]){const gr=g.createLinearGradient(0,y+dy,0,y+dy+l);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,'rgba(255,255,255,'+a+')');gr.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle=gr;g.fillRect(x,y+dy,1+r()*3,l);}}
    g.globalCompositeOperation='destination-in';const m=g.createLinearGradient(0,0,64,0);m.addColorStop(0,'rgba(0,0,0,0)');m.addColorStop(.25,'rgba(0,0,0,1)');m.addColorStop(.75,'rgba(0,0,0,1)');m.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=m;g.fillRect(0,0,64,256);
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
  }
  function descend(kit,x,z,maxSteps,stop){
    const pts=[[x,z]];let cx=x,cz=z;
    for(let i=0;i<maxSteps;i++){
      let best=null,bh=kit.terrainH(cx,cz);
      for(let k=0;k<8;k++){const a=k*PI/4,nx=cx+Math.cos(a)*4,nz=cz+Math.sin(a)*4,h=kit.terrainH(nx,nz);if(h<bh-.02){bh=h;best=[nx,nz];}}
      if(!best)break;cx=best[0];cz=best[1];pts.push(best);if(stop(cx,cz))break;
    }
    return pts;
  }
  function smoothPts(p){const o=[];for(let i=0;i<p.length;i++){let sx=0,sz=0,n=0;for(let k=-2;k<=2;k++){const q=p[clamp(i+k,0,p.length-1)];sx+=q[0];sz+=q[1];n++;}o.push([sx/n,sz/n]);}return o;}
  function buildWater(ctx,W,B){
    const kit=ctx.kit,THREE=kit.THREE,rng=kit.mulberry(4409),L=kit.L;
    const pos=[],uv=[],col=[],idx=[],ends=[];
    const ribbon=(pts,wBase,wSteep,c0,c1)=>{
      const base=pos.length/3;let v=0;
      for(let i=0;i<pts.length;i++){
        const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let tx=b[0]-a[0],tz=b[1]-a[1];const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
        const sl=slopeAt(kit,pts[i][0],pts[i][1]),w=wBase+(wSteep-wBase)*clamp((sl-.2)*2,0,1),nx=-tz,nz=tx;
        const lx=pts[i][0]+nx*w/2,lz=pts[i][1]+nz*w/2,rx=pts[i][0]-nx*w/2,rz=pts[i][1]-nz*w/2;
        pos.push(lx,kit.terrainH(lx,lz)+.2,lz,rx,kit.terrainH(rx,rz)+.2,rz);
        uv.push(0,v,1,v);if(i>0)v+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1])/6;
        const c=mixC(c0,c1,clamp((sl-.2)*2.2,0,1));col.push(c[0],c[1],c[2],c[0],c[1],c[2]);
        if(i<pts.length-1){const j=base+i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}
      }
    };
    // waterfalls down the rock wall to the road side
    const nF=kit.TOUCH?2:4;let found=0,tries=0;const used=[];
    while(found<nF&&tries++<260){
      const s=200+rng()*(L-400),off=-(HALF+26+rng()*60),p=kit.pose(s,off);
      if(used.some(u=>Math.abs(u-s)<350))continue;
      if(slopeAt(kit,p.x,p.z)<.35||kit.terrainH(p.x,p.z)-W.MY<10)continue;
      const path=descend(kit,p.x,p.z,70,(x,z)=>dist2road(kit,x,z)<HALF+5.5);
      const e=path[path.length-1];if(dist2road(kit,e[0],e[1])>=HALF+5.5||path.length<14)continue;
      if(kit.terrainH(p.x,p.z)-kit.terrainH(e[0],e[1])<16)continue;
      used.push(s);found++;ribbon(smoothPts(path),1.2,3.4,[.66,.82,.92],[1,1,1]);ends.push(e);
    }
    // meltwater streams running down the valley slope to the lake
    const nS=kit.TOUCH?2:4;found=0;tries=0;
    while(found<nS&&tries++<200){
      const s=rng()*L,p=kit.pose(s,HALF+8+rng()*6);
      if(dist2road(kit,p.x,p.z)<HALF+5||kit.terrainH(p.x,p.z)-W.WY<14)continue;
      const path=descend(kit,p.x,p.z,90,(x,z)=>kit.terrainH(x,z)<W.WY+1.2);
      if(path.length<18)continue;found++;ribbon(smoothPts(path),1.1,1.8,[.55,.76,.88],[.8,.9,.96]);
    }
    if(pos.length){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(uv),2));
      g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));g.setIndex(idx);g.computeBoundingSphere();
      const tex=flowTexture(kit);
      const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,vertexColors:true,transparent:true,opacity:.92,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
      m.frustumCulled=false;ctx.grp.add(m);
      kit.addUpdater(dt=>{tex.offset.y-=dt*.9;});
    }
    // stone culvert heads and mist where the falls reach the road
    const mc=document.createElement('canvas');mc.width=mc.height=64;const mg=mc.getContext('2d');
    const gr=mg.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(255,255,255,.8)');gr.addColorStop(1,'rgba(255,255,255,0)');mg.fillStyle=gr;mg.fillRect(0,0,64,64);
    const sm=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(mc),transparent:true,opacity:.26,depthWrite:false});
    for(const e of ends){
      const r=kit.nearest(e[0],e[1]),hd=kit.pose(r.f*kit.DS,0).hd,h=kit.terrainH(e[0],e[1]);
      B.T(e[0],h-.3,e[1],hd,1);B.box(3.6,1.4,1,0,.7,0,hexRGB(0x6c665c),hexRGB(0x9a9285));B.box(1.2,.9,.12,0,.5,.55*(r.d<0?1:-1),hexRGB(0x1c1a18));
      const sp=new THREE.Sprite(sm);sp.position.set(e[0],h+2,e[1]);sp.scale.set(5,3.5,1);ctx.grp.add(sp);
    }
  }
  function glintTexture(kit,seed,n){
    const THREE=kit.THREE,cv=document.createElement('canvas');cv.width=cv.height=256;const g=cv.getContext('2d'),r=kit.mulberry(seed);
    for(let i=0;i<n;i++){const x=r()*256,y=r()*256,w=3+r()*10,a=.25+r()*.7;
      for(const dx of[-256,0,256])for(const dy of[-256,0,256]){g.fillStyle='rgba(255,236,190,'+a+')';g.fillRect(x+dx,y+dy,w,1+r()*1.2);}}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
  }
  function buildLake(ctx,W){
    const kit=ctx.kit,THREE=kit.THREE;
    const mk=(seed,n,rep,op)=>{const t=glintTexture(kit,seed,n);t.repeat.set(rep,rep);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:op,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      m.rotation.x=-PI/2;m.position.set(W.cx,W.WY+.08,W.cz);m.frustumCulled=false;ctx.grp.add(m);return{t,m,op};};
    const a=mk(21,220,26,.5),b=mk(22,160,15,.4);
    kit.addUpdater((dt,now)=>{
      a.t.offset.x+=dt*.006;a.t.offset.y+=dt*.003;b.t.offset.x-=dt*.004;b.t.offset.y+=dt*.005;
      a.m.material.opacity=a.op*(.8+.2*Math.sin(now*.0013));b.m.material.opacity=b.op*(.8+.2*Math.sin(now*.0009+2));
    });
  }

  /* ================= DISTANT RIDGES, CLOUD BANDS, BIRDS ================= */
  function buildSkyline(ctx,W){
    const kit=ctx.kit,THREE=kit.THREE,pos=[],col=[],idx=[],N=180;
    const sunAz=Math.atan2(-.4,.8);
    const layers=[[3000,950,.22,0x59588a],[2450,760,.36,0x5a5a8c],[1900,560,.5,0x5d5b86]];
    const hor=hexRGB(0xe5b69d),glow=hexRGB(0xffc9a0);
    layers.forEach((ly,li)=>{
      const base=pos.length/3;
      for(let i=0;i<=N;i++){
        const a=i/N*TAU,ca=Math.cos(a),sa=Math.sin(a);
        const n=kit.fbm(ca*2.1+li*7,sa*2.1,951+li,4),rd=1-Math.abs(kit.fbm(ca*5+li*3,sa*5,961+li,3));
        const hh=ly[1]*(.45+.4*n+.5*rd*rd);
        const x=W.cx+ca*ly[0],z=W.cz+sa*ly[0];
        const lit=Math.pow(Math.max(0,Math.cos(a-sunAz)),2);
        let c=mixC(hexRGB(ly[3]),hor,1-ly[2]*1.4>0?clamp(1-ly[2]*1.6,0,.8):0);
        c=mixC(c,glow,lit*.45);
        const top=mixC(c,[1,.86,.78],.4*lit+.12),bot=mixC(c,hor,.7);
        pos.push(x,W.MY-250,z,x,W.MY+hh,z);col.push(bot[0],bot[1],bot[2],top[0],top[1],top[2]);
        if(i<N){const j=base+i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
      }
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
    g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));g.setIndex(idx);g.computeBoundingSphere();
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:false}));m.frustumCulled=false;ctx.grp.add(m);
    // streaky warm clouds on the horizon
    const cv=document.createElement('canvas');cv.width=512;cv.height=128;const c2=cv.getContext('2d'),r=kit.mulberry(3);
    for(let i=0;i<26;i++){const x=40+r()*430,y=30+r()*70,rx=30+r()*90,ry=6+r()*14;
      const gr=c2.createRadialGradient(x,y,1,x,y,rx);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');
      c2.save();c2.translate(x,y);c2.scale(1,ry/rx);c2.translate(-x,-y);c2.fillStyle=gr;c2.fillRect(x-rx,y-rx,rx*2,rx*2);c2.restore();}
    const ct=new THREE.CanvasTexture(cv),cp=[],cuv=[],cc=[],ci=[],cr=kit.mulberry(19);
    for(let i=0;i<16;i++){
      const a=cr()*TAU,rd=2300+cr()*500,y=W.MY+420+cr()*420,w=900+cr()*900,h=w*.2;
      const cx=W.cx+Math.cos(a)*rd,cz=W.cz+Math.sin(a)*rd,tx=-Math.sin(a),tz=Math.cos(a);
      const lit=Math.pow(Math.max(0,Math.cos(a-sunAz)),2),c=mixC([.78,.6,.74],[1,.72,.5],lit),b=cp.length/3;
      for(const [u,v] of[[-1,0],[1,0],[1,1],[-1,1]]){cp.push(cx+tx*w*u/2,y+v*h,cz+tz*w*u/2);cc.push(c[0],c[1],c[2]);}
      cuv.push(0,0,1,0,1,1,0,1);const k0=b;ci.push(k0,k0+1,k0+2,k0,k0+2,k0+3);
    }
    const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cp),3));cg.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(cuv),2));
    cg.setAttribute('color',new THREE.BufferAttribute(new Float32Array(cc),3));cg.setIndex(ci);cg.computeBoundingSphere();
    const cm=new THREE.Mesh(cg,new THREE.MeshBasicMaterial({map:ct,vertexColors:true,transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide}));cm.frustumCulled=false;ctx.grp.add(cm);
    // tint the built-in white clouds to golden-hour pink
    ctx.grp.traverse(o=>{if(o.isMesh&&o.material&&o.material.isMeshBasicMaterial&&o.material.transparent&&o.material.opacity===.85&&!o.material.map&&o.material.fog===false){o.material.color.setHex(0xffd9c2);}});
  }
  function buildBirds(ctx,W){
    const kit=ctx.kit,THREE=kit.THREE,rng=kit.mulberry(6001),n=kit.TOUCH?3:7;
    const frames=[0,1].map(f=>{const cv=document.createElement('canvas');cv.width=64;cv.height=32;const g=cv.getContext('2d');
      g.strokeStyle='#2b2230';g.lineWidth=3.2;g.lineCap='round';g.beginPath();const yw=f?4:20;g.moveTo(4,yw);g.quadraticCurveTo(20,f?12:8,32,18);g.quadraticCurveTo(44,f?12:8,60,yw);g.stroke();
      return new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false});});
    const birds=[];
    for(let i=0;i<n;i++){
      const s=rng()*kit.L,close=i<3,off=close?(45+rng()*40):(160+rng()*140),p=kit.pose(s,off);
      const sp=new THREE.Sprite(frames[0]);const sc=close?3.4:6;sp.scale.set(sc,sc*.5,1);ctx.grp.add(sp);
      birds.push({sp,cx:p.x,cz:p.z,y:p.y+(close?16+rng()*14:50+rng()*60),r:close?14+rng()*10:40+rng()*40,w:(close?.35:.2)*(rng()<.5?-1:1),ph:rng()*6,fl:6+rng()*3,f:0});
    }
    kit.addUpdater((dt,now)=>{
      const t=now*.001;
      for(let i=0;i<birds.length;i++){const b=birds[i],a=b.ph+t*b.w;
        b.sp.position.set(b.cx+Math.cos(a)*b.r,b.y+Math.sin(t*.7+b.ph)*3,b.cz+Math.sin(a)*b.r);
        const f=Math.sin(t*b.fl+b.ph)>0?1:0;if(f!==b.f){b.f=f;b.sp.material=frames[f];}}
    });
  }

  /* ================= TRAFFIC: mountain-road fleet ================= */
  const PAINT=[0xb8322a,0x2b5fa8,0xeeeeee,0x2d2f33,0x3e8a4f,0xd9a521,0x8d939c,0x6a8fb0,0xc9c2b0];
  const pickP=rng=>PAINT[(rng()*PAINT.length)|0];
  function lights(kit,g,w,y,zf,zb){
    for(const sx of[-1,1]){kit.box(g,kit.redL,.36,.16,.05,[sx*w,y,zb]);kit.box(g,kit.whiteL,.36,.16,.05,[sx*w,y,zf]);}
  }
  function vehicle(kind,rng,kit){
    const g=new kit.THREE.Group(),vm=kit.vm,box=kit.box,cyl=kit.cyl,tyre=kit.tyreM,glass=kit.glassM;
    const wheel=(x,z,r,w)=>cyl(g,tyre,r,r,w||.26,[x,r,z],[0,0,PI/2]);
    let hw,hl;
    if(kind==='hatch'){
      const c=vm(pickP(rng));hw=.9;hl=1.98;
      box(g,c,1.72,.62,3.9,[0,.64,0]);box(g,glass,1.5,.54,2.05,[0,1.16,-.25]);box(g,c,1.5,.08,2.0,[0,1.46,-.25]);
      box(g,c,1.66,.1,1.0,[0,.98,1.4]);box(g,tyre,1.76,.2,.12,[0,.42,1.95]);box(g,tyre,1.76,.2,.12,[0,.42,-1.95]);
      for(const sx of[-1,1])for(const z of[-1.22,1.22])wheel(sx*.83,z,.31);
      lights(kit,g,.6,.7,1.96,-1.96);
    }else if(kind==='skicar'){
      const c=vm(pickP(rng)),a=vm(0xc22b2b),b=vm(0x2860c0);hw=.95;hl=2.3;
      box(g,c,1.86,.75,4.5,[0,.85,0]);box(g,glass,1.72,.62,2.9,[0,1.52,-.35]);box(g,c,1.76,.08,3.0,[0,1.88,-.35]);
      box(g,tyre,1.9,.22,.14,[0,.5,2.25]);box(g,tyre,1.9,.22,.14,[0,.5,-2.25]);
      for(const sx of[-1,1]){box(g,tyre,.06,.05,2.6,[sx*.65,1.95,-.3]);}
      for(const z of[-1.2,0,.8])box(g,tyre,1.4,.05,.06,[0,1.96,z]);
      if(rng()<.5){box(g,a,.09,.04,1.9,[-.25,2.03,-.3]);box(g,b,.09,.04,1.9,[0,2.03,-.3]);box(g,a,.09,.04,1.9,[.25,2.03,-.3]);}
      else box(g,tyre,1.2,.38,1.9,[0,2.14,-.3]);
      for(const sx of[-1,1])for(const z of[-1.45,1.45])wheel(sx*.9,z,.36);
      lights(kit,g,.68,.85,2.26,-2.26);
    }else if(kind==='camper'){
      const c1=vm(0xe9e4d6),c2=vm(pickP(rng));hw=1.08;hl=2.8;
      box(g,c1,2.05,2.3,4.0,[0,1.95,-.8]);box(g,c1,1.95,1.25,1.9,[0,1.4,1.85]);box(g,c1,2.05,.9,2.0,[0,2.95,1.8]);
      box(g,glass,1.8,.65,.08,[0,1.9,2.82]);for(const sx of[-1,1])box(g,glass,.05,.7,1.1,[sx*1.04,2.35,-.6]);
      box(g,c2,2.08,.28,5.5,[0,1.45,-.05]);box(g,c1,.7,.2,.7,[0,3.25,-1.2]);box(g,tyre,2.0,.2,.1,[0,.55,-2.78]);
      for(const sx of[-1,1]){wheel(sx*.92,1.9,.38);wheel(sx*.92,-1.6,.38);}
      lights(kit,g,.7,.75,2.8,-2.8);
    }else if(kind==='milk'){
      const c=vm(pickP(rng)),tk=vm(0xdfe4e8),st=vm(0x2a5fa0);hw=1.1;hl=2.95;
      box(g,c,2.05,1.8,1.9,[0,1.7,2.0]);box(g,glass,1.85,.7,.08,[0,2.2,2.97]);box(g,tyre,1.7,.3,6.0,[0,.62,0]);
      cyl(g,tk,.98,.98,4.0,[0,1.9,-.95],[PI/2,0,0]);cyl(g,st,1.0,1.0,.5,[0,1.9,-1.6],[PI/2,0,0]);cyl(g,st,1.0,1.0,.5,[0,1.9,-2.7],[PI/2,0,0]);
      for(const sx of[-1,1]){box(g,tyre,.05,.5,.7,[sx*.985,2.1,-1.0]);}
      for(const sx of[-1,1]){wheel(sx*.9,2.0,.5,.3);wheel(sx*.9,-2.1,.5,.3);}
      lights(kit,g,.8,.85,2.96,-2.96);
    }else if(kind==='tractor'){
      const c=vm([0xb5341f,0x2f7a3a,0x3c6db5,0xd9a521][(rng()*4)|0]),roof=vm(0xe0b040);hw=1.2;hl=1.85;
      box(g,c,.95,.85,1.7,[0,1.15,.95]);box(g,tyre,.7,.55,.05,[0,1.1,1.82]);box(g,tyre,.7,.4,3.0,[0,.9,.1]);
      box(g,c,1.1,.12,1.2,[0,1.3,-.7]);box(g,tyre,.5,.4,.45,[0,1.6,-.85]);
      for(const sx of[-1,1]){box(g,c,.45,.1,1.5,[sx*.95,1.75,-.85]);box(g,tyre,.06,1.3,.06,[sx*.55,2.2,-.8]);
        cyl(g,tyre,.78,.78,.42,[sx*.98,.78,-.85],[0,0,PI/2]);cyl(g,c,.3,.3,.46,[sx*.98,.78,-.85],[0,0,PI/2]);
        cyl(g,tyre,.42,.42,.28,[sx*.72,.42,1.15],[0,0,PI/2]);
        box(g,kit.redL,.2,.15,.05,[sx*.9,1.75,-1.6]);box(g,kit.whiteL,.2,.16,.05,[sx*.3,1.35,1.83]);}
      box(g,roof,1.5,.07,1.6,[0,2.85,-.8]);cyl(g,tyre,.06,.06,.9,[.3,1.9,1.2]);
    }else{ // coach
      const c1=vm(0xf1f1f1),c2=vm(pickP(rng));hw=1.28;hl=5.6;
      box(g,c1,2.5,2.6,11.2,[0,1.75,0]);box(g,glass,2.54,.95,9.0,[0,2.2,-.4]);box(g,glass,2.3,1.3,.06,[0,2.2,5.62]);
      box(g,c2,2.53,.38,11.0,[0,1.2,0]);box(g,tyre,2.0,.25,.1,[0,.55,-5.6]);
      for(const sx of[-1,1]){wheel(sx*1.05,3.8,.55,.3);wheel(sx*1.05,-3.4,.55,.3);}
      lights(kit,g,.9,.85,5.62,-5.62);
    }
    kit.mergeByMaterial(g);
    return{obj:g,hw,hl};
  }

  /* ================= OBSTACLES: never wider than hw 2.0, so one lane is always free ================= */
  function obstacle(kind,rng,kit){
    const g=new kit.THREE.Group(),vm=kit.vm,m=kit.mesh,geo=kit.geo;let hw,hl;
    const rock=(x,z,r,c)=>{const o=m(geo('IcosahedronGeometry',1,0),vm(c),[x,r*.55,z],[rng()*3,rng()*3,rng()*3],[r*1.1,r*.8,r]);g.add(o);};
    if(kind==='rockfall'){
      hw=1.1;hl=1.0;const A=0x988c7c,Bc=0x756d62;
      rock(0,0,.55+rng()*.2,A);rock(.55,-.4,.35,Bc);rock(-.5,.45,.4,A);rock(.1,.7,.22,Bc);rock(-.7,-.5,.2,A);
    }else if(kind==='branch'){
      hw=1.3;hl=.55;
      g.add(m(geo('CylinderGeometry',.12,.17,2.6,7),vm(0x5a3d25),[0,.22,0],[0,0,PI/2]));
      for(const x of[-.7,0,.7]){g.add(m(geo('CylinderGeometry',.05,.07,.9,5),vm(0x5a3d25),[x,.28,.3*(x>=0?1:-1)],[.9*(x>=0?1:-1),0,0]));
        g.add(m(geo('SphereGeometry',1,8,6),vm(0x2f5e32),[x,.4,.5*(x>=0?1:-1)],null,[.45,.3,.4]));}
      g.add(m(geo('SphereGeometry',1,8,6),vm(0x2f5e32),[-1.15,.3,0],null,[.4,.28,.38]));
    }else if(kind==='cones'){
      hw=1.0;hl=.85;const or=vm(0xff6a1a),wh=vm(0xf4f4f4);
      for(const [x,z] of[[-.55,.35],[.55,.35],[0,-.1]]){
        g.add(m(geo('ConeGeometry',.22,.72,10),or,[x,.38,z]));g.add(m(geo('CylinderGeometry',.17,.18,.12,10),wh,[x,.4,z]));g.add(m(geo('BoxGeometry',.5,.04,.5),vm(0x1a1a1a),[x,.03,z]));}
      g.add(m(geo('CylinderGeometry',.03,.03,1.1,5),vm(0x333333),[0,.55,-.6]));
      g.add(m(geo('CylinderGeometry',.5,.5,.04,3),vm(0xd42222),[0,1.3,-.6],[-PI/2,0,0]));
      g.add(m(geo('CylinderGeometry',.33,.33,.05,3),vm(0xffffff),[0,1.27,-.6],[-PI/2,0,0]));
      g.add(m(geo('BoxGeometry',.07,.26,.06),vm(0x111111),[0,1.28,-.6]));
    }else{ // landslide
      hw=2.0;hl=1.3;
      g.add(m(geo('SphereGeometry',1,12,8),vm(0x8d8578),[0,.1,0],null,[1.9,.5,1.2]));
      g.add(m(geo('SphereGeometry',1,10,6),vm(0x6e6458),[.6,.1,-.2],null,[1.0,.62,.7]));
      rock(-.9,.3,.5,0x9a9082);rock(.9,.5,.4,0x756d62);rock(0,-.5,.45,0x8a8174);rock(-1.5,-.2,.3,0x6f675c);
    }
    kit.mergeByMaterial(g);
    return{obj:g,hw,hl};
  }

  function props(ctx){
    repairRoadUV(ctx);
    const W=worldInfo(ctx.kit);
    const run=(name,fn)=>{try{fn();}catch(e){console.warn('[mountain] '+name+' failed:',e);}};
    const SB=Builder(ctx.kit);
    run('trees',()=>buildTrees(ctx,W));
    run('rocks',()=>buildRocks(ctx,W,SB));
    run('walls',()=>buildWalls(ctx,W));
    run('villages',()=>buildVillages(ctx,W,SB));
    run('viaducts',()=>buildViaducts(ctx,W,SB));
    run('water',()=>buildWater(ctx,W,SB));
    run('lake',()=>buildLake(ctx,W));
    run('skyline',()=>buildSkyline(ctx,W));
    run('birds',()=>buildBirds(ctx,W));
    run('scenery',()=>{SB.T(0,0,0,0,1).J(0);const g=SB.build();const m=new ctx.kit.THREE.Mesh(g,vcMat(ctx.kit.THREE));m.castShadow=false;m.frustumCulled=false;ctx.grp.add(m);W.sceneryTris=SB.count;});
  }

  ApexKit.register('mountain',{
    get texLen(){return TEXLEN;},
    propScale:.25,
    kinds:['hatch','camper','skicar','coach','milk','tractor','hatch','skicar'],
    nObst:6,obstKinds:['rockfall','branch','cones','landslide','rockfall','branch'],
    vehicle,obstacle,
    roadTexture:roadTexture2,terrainFeat,terrainColor,atmosphere,props
  });
})();
