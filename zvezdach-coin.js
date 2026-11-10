import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// Visual reference: the metal badge displayed at https://bencho.dev/.
// The inserted mark is the supplied, unmodified Subtract.svg.
export const SPIN_SPEED = 0.45;
export const TURN_SECONDS = Math.PI * 2 / SPIN_SPEED;
export const LOOP_SECONDS = Math.PI * 2 / 0.15;
const HEX_PATH = 'M59.53 8.5L81.18 21C87.5267 24.6667 90.7 30.1667 90.7 37.5V62.5C90.7 69.8333 87.5267 75.3333 81.18 79L59.53 91.5C53.1767 95.1667 46.8233 95.1667 40.47 91.5L18.82 79C12.4733 75.3333 9.3 69.8333 9.3 62.5V37.5C9.3 30.1667 12.4733 24.6667 18.82 21L40.47 8.5C46.8233 4.83333 53.1767 4.83333 59.53 8.5Z';

function randomSequence(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15,1|seed); n ^= n + Math.imul(n ^ n >>> 7,61|n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

function makeBrushedMetalTextures(renderer) {
  const size=1024, canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const context=canvas.getContext('2d');
  context.fillStyle='rgb(90,90,90)'; context.fillRect(0,0,size,size);
  const random=randomSequence(0x5A56455A);
  for(let radius=1;radius<size*.72;radius+=.7){
    const gray=70+random()*50;
    context.strokeStyle=`rgba(${gray},${gray},${gray},0.5)`;
    context.lineWidth=.8; context.beginPath();
    context.arc(size/2,size/2,radius,0,Math.PI*2); context.stroke();
  }
  const roughness=new THREE.CanvasTexture(canvas);
  const directionCanvas=document.createElement('canvas');directionCanvas.width=directionCanvas.height=256;
  const dc=directionCanvas.getContext('2d'),image=dc.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const dx=x-128,dy=y-128,r=Math.hypot(dx,dy)||1,index=(y*256+x)*4;
    image.data[index]=(-dy/r*.5+.5)*255;image.data[index+1]=(dx/r*.5+.5)*255;
    image.data[index+2]=255;image.data[index+3]=255;
  }
  dc.putImageData(image,0,0);
  const anisotropy=new THREE.CanvasTexture(directionCanvas);anisotropy.colorSpace=THREE.NoColorSpace;
  for(const texture of [roughness,anisotropy]){texture.repeat.set(.01,.01);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}
  roughness.anisotropy=renderer.capabilities.getMaxAnisotropy();
  return {roughness,anisotropy};
}

export function createStudioEnvironment(renderer){
  const room=new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(40,40,40),new THREE.MeshBasicMaterial({color:0x050505,side:THREE.BackSide})));
  const addPanel=(w,h,x,y,z,power)=>{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(power*.65),side:THREE.DoubleSide}));
    mesh.position.set(x,y,z);mesh.lookAt(0,0,0);room.add(mesh);
  };
  addPanel(7,7,-6,7,11,4.5);
  addPanel(30,30,0,0,16,.4);
  addPanel(30,30,0,16,0,.35);
  addPanel(30,30,16,0,0,.25);
  addPanel(30,30,-16,0,0,.25);
  const generator=new THREE.PMREMGenerator(renderer);
  const renderTarget=generator.fromScene(room,.02);
  room.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
  return {texture:renderTarget.texture,dispose(){renderTarget.dispose();generator.dispose();}};
}

function normalizeLogo(svgText){
  const documentNode=new DOMParser().parseFromString(svgText,'image/svg+xml');
  if(documentNode.querySelector('parsererror'))throw new Error('Не удалось прочитать SVG знака.');
  const svg=documentNode.documentElement;
  const viewBox=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
  if(viewBox.length!==4||viewBox.some(n=>!Number.isFinite(n))||viewBox[2]<=0||viewBox[3]<=0)throw new Error('В SVG требуется корректный viewBox.');
  const paths=[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d'));
  if(!paths.length||paths.some(p=>!p||!/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/.test(p)))throw new Error('Некорректный контур знака.');
  const scale=60/Math.max(viewBox[2],viewBox[3]);
  const dx=50-(viewBox[0]+viewBox[2]/2)*scale,dy=50-(viewBox[1]+viewBox[3]/2)*scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(${dx} ${dy}) scale(${scale})">${paths.map(d=>`<path d="${d}"/>`).join('')}</g></svg>`;
}

function createModel(svgText,textures){
  const loader=new SVGLoader();
  const outer=SVGLoader.createShapes(loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${HEX_PATH}"/></svg>`).paths[0])[0];
  const marks=loader.parse(normalizeLogo(svgText)).paths.flatMap(p=>SVGLoader.createShapes(p));
  const plate=outer.clone();plate.holes.push(...marks);
  const bodyGeometry=new THREE.ExtrudeGeometry(plate,{depth:6,bevelEnabled:true,bevelThickness:1.4,bevelSize:1.3,bevelSegments:4,curveSegments:64});
  const markGeometry=new THREE.ExtrudeGeometry(marks,{depth:6,bevelEnabled:false,curveSegments:64});
  for(const geometry of [bodyGeometry,markGeometry])geometry.translate(-50,-50,-3);
  const surface=new THREE.MeshPhysicalMaterial({color:0xdcdee2,metalness:1,roughness:.45,roughnessMap:textures.roughness,anisotropy:.4,anisotropyMap:textures.anisotropy});
  const edge=new THREE.MeshPhysicalMaterial({color:0xe6e8eb,metalness:1,roughness:.35});
  const inset=surface.clone();inset.color.setHex(0xeceef1);inset.roughness=.55;
  const badge=new THREE.Group();badge.name='Zvezdach_Badge';badge.scale.set(.034,-.034,.034);
  const body=new THREE.Mesh(bodyGeometry,[surface,edge]);body.name='Beveled_metal_body';
  const logo=new THREE.Mesh(markGeometry,[inset,edge]);logo.name='Subtract_SVG_recessed_mark';
  badge.add(body,logo);
  const pivot=new THREE.Group();pivot.name='Zvezdach_Turntable';pivot.add(badge);
  return pivot;
}

function applyMotion(pivot,time){
  pivot.rotation.set(Math.sin(time*.6)*.08,time*SPIN_SPEED,0);
  pivot.position.y=Math.sin(time*.9)*.05;
}

function makeAnimationClip(){
  const times=[],rotations=[],positions=[],quaternion=new THREE.Quaternion(),euler=new THREE.Euler();
  const frames=Math.ceil(LOOP_SECONDS*60);
  for(let frame=0;frame<=frames;frame++){
    const t=frame/frames*LOOP_SECONDS;times.push(t);
    euler.set(Math.sin(t*.6)*.08,t*SPIN_SPEED,0);quaternion.setFromEuler(euler);
    rotations.push(...quaternion.toArray());positions.push(0,Math.sin(t*.9)*.05,0);
  }
  return new THREE.AnimationClip('Continuous_spin_and_float',LOOP_SECONDS,[
    new THREE.QuaternionKeyframeTrack('Zvezdach_Turntable.quaternion',times,rotations),
    new THREE.VectorKeyframeTrack('Zvezdach_Turntable.position',times,positions)
  ]);
}

/** Mount into any sized element. Native reference size: 152 × 132 CSS px. */
export async function mountZvezdachCoin(element,{markUrl=new URL('./assets/Subtract.svg',import.meta.url),autoplay=true,exposure=1.1,pixelRatio=Math.min(devicePixelRatio,2),initialTime=0}={}){
  const response=await fetch(markUrl);if(!response.ok)throw new Error('Не удалось загрузить знак.');
  const svgText=await response.text();
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(pixelRatio);renderer.setClearColor(0x000000,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;
  Object.assign(renderer.domElement.style,{display:'block',width:'100%',height:'100%'});renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','Вращающийся металлический знак Звездач');element.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),studio=createStudioEnvironment(renderer);scene.environment=studio.texture;
  const camera=new THREE.PerspectiveCamera(30,1,.1,100);camera.position.set(0,0,8.5);
  const textures=makeBrushedMetalTextures(renderer),pivot=createModel(svgText,textures);scene.add(pivot);
  let time=initialTime,playing=autoplay,visible=true,disposed=false,last=performance.now(),recording=false;
  const resize=()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();};
  const render=()=>{if(disposed)return;applyMotion(pivot,time);renderer.render(scene,camera);};
  const tick=now=>{const delta=Math.min(.1,(now-last)/1000);last=now;if(playing&&!document.hidden&&visible&&!recording)time+=Math.max(0,delta);if(visible&&!recording)render();};
  renderer.setAnimationLoop(tick);
  const observer=new ResizeObserver(resize);observer.observe(element);
  const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=performance.now();});intersection.observe(element);
  resize();element.dataset.ready='true';
  return {
    get time(){return time;}, get playing(){return playing;}, get canvas(){return renderer.domElement;},
    play(){playing=true;last=performance.now();},pause(){playing=false;},
    seek(seconds){time=Number(seconds)||0;render();},
    async exportGLB(){
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      const model=pivot.clone(true);model.position.set(0,0,0);model.rotation.set(0,0,0);model.updateMatrixWorld(true);
      const exportedScene=new THREE.Scene();exportedScene.add(model);
      return await new GLTFExporter().parseAsync(exportedScene,{binary:true,animations:[makeAnimationClip()],trs:true,onlyVisible:true});
    },
    async exportPNG(){
      const savedSize=renderer.getSize(new THREE.Vector2()),savedRatio=renderer.getPixelRatio(),savedTime=time;
      time=0;renderer.setPixelRatio(1);renderer.setSize(1216,1056,false);camera.aspect=152/132;camera.updateProjectionMatrix();render();
      const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));
      time=savedTime;renderer.setPixelRatio(savedRatio);renderer.setSize(savedSize.x,savedSize.y,false);camera.aspect=savedSize.x/savedSize.y;camera.updateProjectionMatrix();render();return blob;
    },
    async recordWebM(onProgress){
      const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)throw new Error('Браузер не поддерживает запись WebM.');
      const wasPlaying=playing,savedTime=time;recording=true;playing=false;time=0;render();
      const stream=renderer.domElement.captureStream(30),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
      const result=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=reject;recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));});
      const started=performance.now();recorder.start(1000);
      await new Promise(resolve=>{const frame=()=>{const elapsed=(performance.now()-started)/1000;time=Math.min(elapsed,LOOP_SECONDS);render();onProgress?.(Math.min(1,elapsed/LOOP_SECONDS));if(elapsed<LOOP_SECONDS)requestAnimationFrame(frame);else resolve();};frame();});
      recorder.stop();const blob=await result;stream.getTracks().forEach(t=>t.stop());time=savedTime;playing=wasPlaying;recording=false;last=performance.now();render();return blob;
    },
    dispose(){
      disposed=true;renderer.setAnimationLoop(null);observer.disconnect();intersection.disconnect();
      const geometries=new Set(),materials=new Set();scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const material of Array.isArray(n.material)?n.material:n.material?[n.material]:[])materials.add(material);});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.roughness.dispose();textures.anisotropy.dispose();studio.dispose();renderer.dispose();renderer.domElement.remove();
    }
  };
}
