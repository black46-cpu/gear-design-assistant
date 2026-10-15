import * as THREE from '/vendor/three.module.js';

const $ = (id) => document.getElementById(id);
const inputs = ['gearType','designMode','module','teeth','teeth2','bore2','pressure','width','bore','shift','helix','hand','material'];
let currentView = 'iso';

class GearViewer {
  constructor(container) {
    this.container=container;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,0.1,10000);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000,0);
    this.renderer.domElement.setAttribute('aria-label','可交互的三维齿轮预览');
    this.renderer.domElement.style.touchAction='none';
    container.replaceChildren(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x78879b,2.1));
    const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(-120,-180,240);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0x9fc4ff,1.1);fill.position.set(180,100,100);this.scene.add(fill);
    this.modelGroup=new THREE.Group();this.scene.add(this.modelGroup);
    this.theta=-0.72;this.phi=1.0;this.distance=180;this.target=new THREE.Vector3();
    this.drag=null;this.animating=false;this.animationSpeed=1;this.motionAngle=0;this.motion=null;this.animationFrame=0;this.lastAnimationTime=0;
    this.renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0){e.preventDefault();return;}e.preventDefault();this.drag={x:e.clientX,y:e.clientY,id:e.pointerId};this.renderer.domElement.setPointerCapture(e.pointerId);});
    this.renderer.domElement.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault();},true);
    this.renderer.domElement.addEventListener('auxclick',e=>e.preventDefault());
    this.renderer.domElement.addEventListener('pointermove',e=>{if(!this.drag)return;this.theta-=(e.clientX-this.drag.x)*0.008;this.phi=Math.max(0.08,Math.min(Math.PI-0.08,this.phi+(e.clientY-this.drag.y)*0.008));this.drag.x=e.clientX;this.drag.y=e.clientY;this.render();});
    this.renderer.domElement.addEventListener('pointerup',()=>{this.drag=null;});
    this.renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(8,Math.min(5000,this.distance*Math.exp(e.deltaY*0.001)));this.render();},{passive:false});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.render();
  }
  resize(){const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();}
  clear(){while(this.modelGroup.children.length){const obj=this.modelGroup.children[0];this.modelGroup.remove(obj);obj.traverse?.(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}}
  makeGear(p,geom,color,phase=0,hand=p.hand){
    const group=new THREE.Group(), points=geom.pts;group.rotation.z=phase;
    let signed=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signed+=a[0]*b[1]-b[0]*a[1];}
    const outline=signed>=0?points:[...points].reverse();
    const shape=new THREE.Shape();shape.moveTo(outline[0][0],outline[0][1]);for(let i=1;i<outline.length;i++)shape.lineTo(outline[i][0],outline[i][1]);shape.closePath();
    const bore=Number(p.bore||0);
    if(bore>1e-6){const hole=new THREE.Path(),r=bore/2,n=64;hole.moveTo(r,0);for(let i=1;i<n;i++){const a=2*Math.PI*i/n;hole.lineTo(r*Math.cos(a),r*Math.sin(a));}hole.closePath();shape.holes.push(hole);}
    const beta=p.type==='helical'?p.helix_angle*Math.PI/180:0;
    const mt=p.module/Math.cos(beta),twist=(p.type==='helical'?p.width*Math.tan(beta)/(mt*p.teeth/2)*(hand==='left'?-1:1):0);
    const bevel=p.type==='bevel',taperScale=bevel?Math.max(.3,1-p.width/(p.module*p.teeth/2)):1;
    const topGeo=new THREE.ShapeGeometry(shape,1),topMat=new THREE.MeshStandardMaterial({color,roughness:0.45,metalness:0.12,side:THREE.DoubleSide});
    const top=new THREE.Mesh(topGeo,topMat);top.position.z=p.width;top.rotation.z=twist;top.scale.set(taperScale,taperScale,1);group.add(top);
    const bottomGeo=topGeo.clone(),bottomIndex=Array.from(bottomGeo.index.array);for(let i=0;i<bottomIndex.length;i+=3)[bottomIndex[i+1],bottomIndex[i+2]]=[bottomIndex[i+2],bottomIndex[i+1]];bottomGeo.setIndex(bottomIndex);bottomGeo.computeVertexNormals();
    const bottom=new THREE.Mesh(bottomGeo,topMat);group.add(bottom);
    const steps=bevel?Math.max(10,Math.min(36,Math.ceil(p.width/2))):Math.max(1,Math.min(72,Math.ceil(Math.abs(twist)*180/Math.PI/2)));
    const wall=(loop,reverse=false,conical=bevel)=>{
      const pos=[],idx=[],n=loop.length;
      for(let s=0;s<=steps;s++){const t=s/steps,a=twist*t,ca=Math.cos(a),sa=Math.sin(a),scale=conical?1-(1-taperScale)*t:1;for(const [x,y] of loop)pos.push((x*ca-y*sa)*scale,(x*sa+y*ca)*scale,p.width*t);}
      for(let s=0;s<steps;s++)for(let i=0;i<n;i++){const j=(i+1)%n,a=s*n+i,b=s*n+j,c=(s+1)*n+j,d=(s+1)*n+i;if(reverse)idx.push(a,c,b,a,d,c);else idx.push(a,b,c,a,c,d);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
      return new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(0.74),roughness:0.52,metalness:0.16,side:THREE.DoubleSide}));
    };
    group.add(wall(outline));
    if(bore>1e-6){const hole=[];for(let i=0;i<64;i++){const a=2*Math.PI*i/64;hole.push([bore/2*Math.cos(a),bore/2*Math.sin(a)]);}group.add(wall(hole,true,false));}
    return group;
  }
  makeRack(p,color){
    const m=p.module,pitch=Math.PI*m,count=Math.max(8,p.teeth+4),length=pitch*count,root=1.25*m,tip=-0.5*m,tipWidth=pitch*0.5,rootWidth=pitch*0.78;
    const shape=new THREE.Shape();shape.moveTo(-length/2,root+2*m);shape.lineTo(length/2,root+2*m);shape.lineTo(length/2,root);
    for(let i=count-1;i>=0;i--){const c=-length/2+(i+0.5)*pitch;shape.lineTo(c+rootWidth/2,root);shape.lineTo(c+tipWidth/2,tip);shape.lineTo(c-tipWidth/2,tip);shape.lineTo(c-rootWidth/2,root);}
    shape.lineTo(-length/2,root);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:p.width,bevelEnabled:false,curveSegments:1});geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.14}));return mesh;
  }
  setModel(p,profileFn){
    this.clear();const g1=profileFn(p),pair=p.mode==='pair';this.motionAngle=0;this.motion=null;
    if(pair&&p.type==='rack'){
      const pitchRadius=p.module*p.teeth/2;
      const pinion=this.makeGear(p,g1,0x648bc3,Math.PI,p.hand);pinion.position.y=-pitchRadius;this.modelGroup.add(pinion);
      const rack=this.makeRack(p,0x91a9ca);this.modelGroup.add(rack);this.motion={kind:'rack',gear1:pinion,base1:pinion.rotation.z,rack,baseRackX:rack.position.x,pitchRadius,pitch:Math.PI*p.module};this.target.set(0,p.module*0.15,p.width/2);
      this.fit(Math.max(p.module*(p.teeth+6),pitchRadius*3),p.width);
    }else if(pair){const beta=p.type==='helical'?p.helix_angle*Math.PI/180:0,mt=p.module/Math.cos(beta),center=mt*(p.teeth+p.teeth2)/2;
      const a=this.makeGear({...p,bore:p.bore},g1,0x648bc3,Math.PI/2,p.hand);this.modelGroup.add(a);
      const p2={...p,teeth:p.teeth2,bore:p.bore2,profile_shift:-p.profile_shift,hand:p.hand==='right'?'left':'right'};
      const b=this.makeGear(p2,profileFn(p2),0x91a9ca,Math.PI*1.5+Math.PI/p.teeth2,p2.hand);b.position.x=center;this.modelGroup.add(b);
      this.motion={kind:'pair',gear1:a,base1:a.rotation.z,gear2:b,base2:b.rotation.z,z1:p.teeth,z2:p.teeth2};
      this.target.set(center/2,0,p.width/2);
      this.fit(center+g1.outer/2+profileFn(p2).outer/2,p.width);
    }else{const gear=this.makeGear(p,g1,0x7697c5,Math.PI/2,p.hand);this.modelGroup.add(gear);this.motion={kind:'single',gear1:gear,base1:gear.rotation.z};this.target.set(0,0,p.width/2);this.fit(g1.outer,p.width);}
    this.applyMotion();
    this.render();
  }
  applyMotion(){if(!this.motion)return;const m=this.motion,a=this.motionAngle;if(m.kind==='single')m.gear1.rotation.z=m.base1+a;else if(m.kind==='pair'){m.gear1.rotation.z=m.base1+a;m.gear2.rotation.z=m.base2-a*m.z1/m.z2;}else if(m.kind==='rack'){m.gear1.rotation.z=m.base1+a;m.rack.position.x=m.baseRackX-m.pitchRadius*a;}}
  setAnimationSpeed(speed){this.animationSpeed=speed;}
  startAnimation(){if(this.animating)return;this.animating=true;this.lastAnimationTime=performance.now();const tick=now=>{if(!this.animating)return;const dt=Math.min(.05,(now-this.lastAnimationTime)/1000);this.lastAnimationTime=now;this.motionAngle=(this.motionAngle+dt*this.animationSpeed)%(Math.PI*2);this.applyMotion();this.render();this.animationFrame=requestAnimationFrame(tick);};this.animationFrame=requestAnimationFrame(tick);}
  stopAnimation(){this.animating=false;if(this.animationFrame)cancelAnimationFrame(this.animationFrame);this.animationFrame=0;}
  fit(span,width){if(this.lastSpan){this.distance*=Math.max(0.7,Math.min(1.4,span/this.lastSpan));}else{this.distance=Math.max(span*2.1,width*4,30);}this.lastSpan=span;}
  setView(view){if(view==='top'){this.theta=0;this.phi=0.04;}else{this.theta=-0.72;this.phi=1.0;}this.render();}
  render(){if(!this.renderer)return;const s=Math.sin(this.phi);this.camera.position.set(this.target.x+this.distance*s*Math.cos(this.theta),this.target.y+this.distance*s*Math.sin(this.theta),this.target.z+this.distance*Math.cos(this.phi));this.camera.up.set(0,0,1);this.camera.lookAt(this.target);try{this.renderer.render(this.scene,this.camera);}catch(error){console.error('Gear preview render failed:',error.stack||error);}}
}
const viewer=new GearViewer($('modelWrap'));
document.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault();},true);
document.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();},true);

function getParams() {
  return {
    type: $('gearType').value,
    mode: $('designMode').value,
    module: Number($('module').value), teeth: Number($('teeth').value),
    teeth2: Number($('teeth2').value), bore2: Number($('bore2').value),
    pressure_angle: Number($('pressure').value), width: Number($('width').value),
    bore: Number($('bore').value), profile_shift: Number($('shift').value),
    helix_angle: $('gearType').value === 'helical' ? Number($('helix').value) : 0,
    hand: $('hand').value, material: $('material').value,
  };
}

function involute(a) { return Math.tan(a) - a; }
function profile(p) {
  const beta=p.type==='helical'?p.helix_angle*Math.PI/180:0;
  const m=p.module/Math.cos(beta),z=p.teeth,alpha=Math.atan(Math.tan(p.pressure_angle*Math.PI/180)/Math.cos(beta));
  const pitch=m*z, base=pitch*Math.cos(alpha), outer=pitch+2*p.module*(1+p.profile_shift), root=pitch-p.module*(2.5-2*p.profile_shift);
  const rp=pitch/2, rb=base/2, ra=outer/2, rf=root/2;
  const halfAt=(r)=>{
    const rpHalf=Math.PI/(2*z)+2*p.profile_shift*Math.tan(p.pressure_angle*Math.PI/180)/z;
    if(r<rb) return rpHalf + involute(alpha) + Math.max(0,rb-r)*0.012/m;
    const ar=Math.acos(Math.min(1,rb/r));
    return Math.max(0.001,rpHalf+involute(alpha)-involute(ar));
  };
  const flankStart=Math.max(rb,rf), halfRoot=halfAt(flankStart)+Math.max(0,flankStart-rf)*0.012/m;
  const pts=[]; const step=2*Math.PI/z;
  const polar=(r,a)=>[r*Math.cos(a),r*Math.sin(a)];
  for(let k=0;k<z;k++){
    const c=-Math.PI/2+k*step;
    if(k===0) pts.push(polar(rf,c-halfRoot));
    for(let j=0;j<=9;j++){const r=flankStart+(ra-flankStart)*j/9;pts.push(polar(r,c-halfAt(r)));}
    for(let j=1;j<=6;j++){const a=c+(-halfAt(ra)+2*halfAt(ra)*j/6);pts.push(polar(ra,a));}
    for(let j=8;j>=0;j--){const r=flankStart+(ra-flankStart)*j/9;pts.push(polar(r,c+halfAt(r)));}
    pts.push(polar(rf,c+halfRoot));
    const a0=c+halfRoot, a1=-Math.PI/2+(k+1)*step-halfRoot;
    for(let j=1;j<=5;j++) pts.push(polar(rf,a0+(a1-a0)*j/5));
  }
  if(Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<1e-9) pts.pop();
  return {pts,pitch,base,outer,root,rf,ra,bore:p.bore};
}

function valid(p) {
  const errors=[];
  if(!Number.isFinite(p.module)||p.module<=0) errors.push('模数必须大于 0。');
  if(p.module>20) errors.push('模数不能大于 20 mm。');
  if(!Number.isInteger(p.teeth)||p.teeth<6) errors.push('齿数需为不小于 6 的整数。');
  if(!Number.isFinite(p.width)||p.width<=0) errors.push('齿宽必须大于 0。');
  if(!Number.isFinite(p.pressure_angle)||p.pressure_angle<14.5||p.pressure_angle>30) errors.push('压力角需在 14.5° 到 30° 之间。');
  if(!Number.isFinite(p.profile_shift)||p.profile_shift<-.5||p.profile_shift>1) errors.push('变位系数需在 -0.5 到 1 之间。');
  if(p.bore<0||p.bore>=p.module/Math.cos((p.type==='helical'?p.helix_angle:0)*Math.PI/180)*p.teeth-p.module*(2.5-2*p.profile_shift)) errors.push('轴孔直径需小于齿根圆直径。');
  if(p.type==='helical'&&(!Number.isFinite(p.helix_angle)||p.helix_angle<5||p.helix_angle>45)) errors.push('斜齿螺旋角需在 5° 到 45° 之间。');
  if(p.type==='bevel'&&p.width>p.module*p.teeth*0.175) errors.push(`当前齿数与模数下，近似锥齿轮齿宽需不大于 ${(p.module*p.teeth*0.175).toFixed(2)} mm。`);
  if(p.mode==='pair'&&p.type==='bevel') errors.push('直齿锥齿轮当前先提供单轮课程近似模型，请选择“单个齿轮”。');
  if(p.mode==='pair'&&p.type!=='rack'&&(!Number.isInteger(p.teeth2)||p.teeth2<6||p.teeth2>200)) errors.push('齿轮 2 齿数需为 6 到 200 的整数。');
  if(p.mode==='pair'&&p.type!=='rack'&&(p.bore2<0||p.bore2>=p.module/Math.cos(p.helix_angle*Math.PI/180)*p.teeth2-p.module*(2.5+2*p.profile_shift))) errors.push('齿轮 2 轴孔直径无效。');
  return errors;
}

function makeSvg(p, geom, drawing=false) {
  const maxR=geom.outer/2, unit=82/maxR, map=([x,y])=>[100+x*unit,100-y*unit];
  const path=geom.pts.map((pt,i)=>{const [x,y]=map(pt);return `${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`;}).join(' ')+' Z';
  const boreR=Math.max(0,p.bore/2*unit);
  const hole=boreR?`M100,${(100-boreR).toFixed(3)} A${boreR},${boreR} 0 1 0 100,${(100+boreR).toFixed(3)} A${boreR},${boreR} 0 1 0 100,${(100-boreR).toFixed(3)} Z`:'';
  if(!drawing) return `<svg viewBox="0 0 200 200" role="img" aria-label="齿轮轴测预览"><path class="gear-side" fill-rule="evenodd" transform="translate(0 8)" d="${path} ${hole}"/><path class="gear-top" fill-rule="evenodd" d="${path} ${hole}"/>${boreR?`<circle class="bore" cx="100" cy="100" r="${boreR.toFixed(3)}"/>`:''}</svg>`;
  const ext=geom.outer.toFixed(2), root=geom.root.toFixed(2), pitch=geom.pitch.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="150mm" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><path d="${path} ${hole}" fill="#f6f8fa" stroke="#24364a" stroke-width=".65" fill-rule="evenodd"/><circle cx="100" cy="100" r="${(geom.pitch/2*unit).toFixed(3)}" fill="none" stroke="#8294a7" stroke-width=".35" stroke-dasharray="2 1.3"/><text x="100" y="13" text-anchor="middle" font-family="sans-serif" font-size="4" fill="#283747">齿轮正视轮廓  ·  单位 mm</text><text x="100" y="190" text-anchor="middle" font-family="sans-serif" font-size="3.3" fill="#334455">m=${p.module}  z=${p.teeth}  α=${p.pressure_angle}°  b=${p.width}  d₀=${p.bore}  材料：${p.material}</text><text x="100" y="196" text-anchor="middle" font-family="sans-serif" font-size="2.8" fill="#738191">d=${pitch}  da=${ext}  df=${root}  ·  示意齿根，生产前需校核</text><path d="M15 35H185" stroke="#9aa8b5" stroke-width=".35"/><text x="100" y="30" text-anchor="middle" font-family="sans-serif" font-size="3.2" fill="#47596a">分度圆 ${pitch} mm　 齿顶圆 ${ext} mm</text></svg>`;
}

function makePairSvg(p,g1,g2) {
  const beta=p.type==='helical'?p.helix_angle*Math.PI/180:0, center=p.module/Math.cos(beta)*(p.teeth+p.teeth2)/2;
  const r1=g1.outer/2,r2=g2.outer/2,scale=350/(r1+center+r2),cx1=25+r1*scale,cx2=25+(r1+center)*scale,cy=100;
  const shape=(g,cx,bore,rotation)=>{
    const a=rotation*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
    const d=g.pts.map((pt,i)=>`${i?'L':'M'}${(cx+(pt[0]*ca-pt[1]*sa)*scale).toFixed(2)},${(cy-(pt[0]*sa+pt[1]*ca)*scale).toFixed(2)}`).join(' ')+' Z';
    const br=bore/2*scale;
    return `<path fill="#dce7f5" stroke="#6b85a9" stroke-width=".8" d="${d}"/>${br?`<circle cx="${cx}" cy="${cy}" r="${br}" fill="#f7f9fb" stroke="#8b9db4" stroke-width=".8"/>`:''}`;
  };
  return `<svg viewBox="0 0 400 200" role="img" aria-label="圆柱齿轮副轮廓预览">${shape(g1,cx1,p.bore,90)}${shape(g2,cx2,p.bore2,270+180/p.teeth2)}<text x="${cx1}" y="186" text-anchor="middle" font-size="10" fill="#68798c">z₁=${p.teeth}</text><text x="${cx2}" y="186" text-anchor="middle" font-size="10" fill="#68798c">z₂=${p.teeth2}</text></svg>`;
}

function update() {
  const p=getParams();
  if(p.type==='rack'){$('designMode').value='pair';p.mode='pair';}
  if(p.type==='bevel'&&p.mode==='pair'){$('designMode').value='single';p.mode='single';}
  const paired=p.mode==='pair';
  $('designMode').options[1].textContent=p.type==='rack'?'齿轮与齿条副':'一对外啮合齿轮';
  $('gearType').disabled=false;
  $('pairFields').classList.toggle('hidden',!paired||p.type==='rack');
  $('helixFields').classList.toggle('hidden',p.type!=='helical');
  $('previewSubtitle').textContent=p.type==='rack'?'直齿齿条与渐开线小齿轮 · 单位 mm':p.type==='bevel'?'直齿锥齿轮锥形近似 · 单位 mm':paired?`外啮合${p.type==='helical'?'斜齿':'直齿'}圆柱齿轮副 · ${p.type==='helical'?'β '+p.helix_angle+'° · ':''}单位 mm`:(p.type==='helical'?'渐开线 · 螺旋角 '+p.helix_angle+'° · 单位 mm':'标准渐开线 · 单位 mm');
  $('designNotice').textContent=p.type==='rack'?'齿条按梯形齿近似生成，并与小齿轮按分度半径定位。材料仅作记录；未包含公差、侧隙及强度校核。':p.type==='bevel'?'直齿锥齿轮用渐开线截面缩放形成锥形近似，仅支持单轮，不提供锥齿轮副的精确啮合校核。':paired?'齿轮副按相同模数和理论中心距定位；斜齿轮采用相反旋向与配对变位。材料仅作记录；未包含制造公差、侧隙及完整干涉/强度校核。':'材料仅作记录；未包含制造公差、齿侧隙及完整干涉/强度校核。';
  const errors=valid(p); const messages=$('messages'); messages.className='messages'+(errors.length?' error':'');
  if(errors.length){messages.textContent=errors[0];$('stepButton').disabled=true;viewer.stopAnimation();$('animationToggle').textContent='▶ 播放运动';$('animationState').textContent='暂停';return;}
  $('stepButton').disabled=false;
  const g=profile(p);
  $('pitchValue').innerHTML=`${g.pitch.toFixed(2)} <small>mm</small>`;
  $('outerValue').innerHTML=`${g.outer.toFixed(2)} <small>mm</small>`;
  $('rootValue').innerHTML=`${g.root.toFixed(2)} <small>mm</small>`;
  $('pitchLabel').textContent=paired?'齿轮 1 分度圆':'分度圆直径';
  $('centerValue').innerHTML=paired?`${(p.type==='rack'?p.module*p.teeth/2:p.module/Math.cos((p.type==='helical'?p.helix_angle:0)*Math.PI/180)*(p.teeth+p.teeth2)/2).toFixed(2)} <small>mm</small>`:`${g.base.toFixed(2)} <small>mm</small>`;
  $('centerLabel').textContent=paired?(p.type==='rack'?'小齿轮分度半径':'理论中心距'):'基圆直径';
  viewer.setModel(p,profile);
  if(currentView!==viewer.view){viewer.setView(currentView);viewer.view=currentView;}
  const warnings=[];
  if(p.teeth<17 && p.profile_shift<=0) warnings.push('齿数较少，标准齿形可能发生根切；请考虑正变位并进行校核。');
  if(p.bore>g.root*.65) warnings.push('轴孔较大，请检查轮毂结构和强度。');
  messages.textContent=warnings.join(' ');messages.className='messages';
  $('modelStatus').textContent=(p.type==='rack'?'齿轮与齿条几何已更新':paired?'齿轮副几何已更新 · 理论传动比 '+(p.teeth2/p.teeth).toFixed(3):'几何已更新')+' · '+p.material;
}

function slug(p){return p.type==='rack'?`rack_pinion_m${p.module}_z${p.teeth}`:p.mode==='pair'?`${p.type}_pair_m${p.module}_z${p.teeth}_z${p.teeth2}`:`${p.type}_m${p.module}_z${p.teeth}`;}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

inputs.forEach(id=>$(id).addEventListener('input',update));
document.querySelectorAll('.view-switch button').forEach(button=>button.addEventListener('click',()=>{currentView=button.dataset.view;document.querySelectorAll('.view-switch button').forEach(b=>b.classList.toggle('selected',b===button));viewer.setView(currentView);viewer.view=currentView;}));
$('animationToggle').addEventListener('click',()=>{if(viewer.animating){viewer.stopAnimation();$('animationToggle').textContent='▶ 播放运动';$('animationState').textContent='暂停';}else{viewer.startAnimation();$('animationToggle').textContent='❚❚ 暂停';$('animationState').textContent='播放中';}});
$('animationSpeed').addEventListener('input',e=>{const speed=Number(e.target.value);viewer.setAnimationSpeed(speed);$('animationSpeedValue').textContent=`${speed}×`;});
$('svgButton').addEventListener('click',()=>{
  const p=getParams(),g=profile(p);let drawing=makeSvg(p,g,true);
  if(p.type==='rack'){
    const length=Math.PI*p.module*Math.max(8,p.teeth+4),root=1.25*p.module,tip=-.5*p.module,scale=220/length,pitch=Math.PI*p.module,count=Math.max(8,p.teeth+4),pts=[[-length/2,root+2*p.module],[length/2,root+2*p.module],[length/2,root]];
    for(let i=count-1;i>=0;i--){const c=-length/2+(i+.5)*pitch;pts.push([c+.39*pitch,root],[c+.25*pitch,tip],[c-.25*pitch,tip],[c-.39*pitch,root]);}
    pts.push([-length/2,root]);const path=pts.map((q,i)=>`${i?'L':'M'}${(200+q[0]*scale).toFixed(2)},${(120-q[1]*scale).toFixed(2)}`).join(' ')+' Z';
    const gear=makeSvg(p,g,true).replace('<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="150mm" viewBox="0 0 200 200">','').replace('</svg>','');
    drawing=`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="120mm" viewBox="0 0 400 240"><rect width="400" height="240" fill="white"/><g transform="translate(200 72) scale(.62)">${gear}</g><path d="${path}" fill="#dce7f5" stroke="#6b85a9" stroke-width="1"/><text x="200" y="228" text-anchor="middle" font-size="8" fill="#738191">直齿齿条与小齿轮示意 · m=${p.module} · z=${p.teeth} · b=${p.width} mm</text></svg>`;
  } else if(p.mode==='pair'){
    const g2=profile({...p,teeth:p.teeth2,bore:p.bore2,profile_shift:-p.profile_shift});
    const beta=p.type==='helical'?p.helix_angle*Math.PI/180:0;
    drawing=makePairSvg(p,g,g2).replace('<svg viewBox','<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox').replace('</svg>',`<text x="200" y="18" text-anchor="middle" font-size="5" fill="#334455">${p.type==='helical'?'斜齿':'直齿'}轮副轮廓示意 · m=${p.module} mm · ${p.type==='helical'?'β='+p.helix_angle+'° · ':''}a=${(p.module/Math.cos(beta)*(p.teeth+p.teeth2)/2).toFixed(2)} mm · 材料：${p.material}</text><text x="200" y="195" text-anchor="middle" font-size="3.5" fill="#738191">课程设计示意图，不含公差、齿根刀具包络和强度校核</text></svg>`);
  }
  download(new Blob([drawing],{type:'image/svg+xml;charset=utf-8'}),`${slug(p)}.svg`);
});
$('stepButton').addEventListener('click',async()=>{
  const p=getParams();if(p.type==='rack')p.mode='pair';const button=$('stepButton');button.disabled=true;button.textContent='正在生成…';
  try{const response=await fetch('/api/export-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});if(!response.ok){const body=await response.json().catch(()=>({error:'STEP 导出失败'}));throw new Error(body.error||'STEP 导出失败');}const blob=await response.blob();download(blob,`${slug(p)}.step`);$('modelStatus').textContent='STEP 已生成';}
  catch(err){alert('无法生成 STEP：'+err.message+'\n\n请检查输入参数后重试。');}
  finally{button.disabled=false;button.innerHTML='生成 STEP 模型 <span>→</span>';}
});
$('resetButton').addEventListener('click',()=>{const defaults={gearType:'spur',designMode:'single',module:'2.5',teeth:'24',teeth2:'36',bore2:'10',pressure:'20',width:'25',bore:'10',shift:'0',helix:'15',hand:'right',material:'45钢（调质）'};for(const [id,value] of Object.entries(defaults))$(id).value=value;update();});
$('designMode').addEventListener('change',update);
$('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
update();
