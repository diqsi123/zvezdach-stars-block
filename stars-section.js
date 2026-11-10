import {mountZvezdachCoin} from './zvezdach-coin.js';
const container=document.querySelector('#stars-coin');
const staticFrame=new URLSearchParams(location.search).has('still');
if(new URLSearchParams(location.search).has('reference'))document.documentElement.classList.add('is-reference');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let controller;
try{
 controller=await mountZvezdachCoin(container,{autoplay:!staticFrame&&!reducedMotion.matches});
 container.querySelector('.stars-card__fallback').hidden=true;
 const updateMotion=()=>{if(staticFrame||reducedMotion.matches)controller.pause();else controller.play();};
 reducedMotion.addEventListener('change',updateMotion);
 document.body.dataset.ready='true';
 window.addEventListener('pageshow',event=>{if(event.persisted)updateMotion();});
 window.addEventListener('pagehide',event=>{
  if(event.persisted){controller.pause();return;}
  reducedMotion.removeEventListener('change',updateMotion);
  controller.dispose();
 });
}catch(error){console.error('Stars section:',error);document.body.dataset.ready='fallback';}
