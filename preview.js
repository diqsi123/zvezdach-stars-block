import {mountZvezdachCoin,SPIN_SPEED} from './zvezdach-coin.js';
const $=id=>document.getElementById(id),status=$('status');
async function saveBlob(format,body){
  const response=await fetch(`/api/export/${format}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body});
  if(!response.ok)throw new Error('Не удалось сохранить файл.');
  const data=await response.json();
  status.replaceChildren();const link=document.createElement('a');link.href=data.url;link.download=`zvezdach-metal-badge.${format}`;link.textContent=`Скачать ${format.toUpperCase()}`;status.append(link);
  return data;
}
try{
  const coin=await mountZvezdachCoin($('coin'));
  status.textContent='';
  $('pause').onclick=()=>{if(coin.playing){coin.pause();$('pause').textContent='Продолжить';}else{coin.play();$('pause').textContent='Пауза';}};
  $('angle').oninput=()=>{coin.pause();coin.seek(Number($('angle').value)*Math.PI/180/SPIN_SPEED);$('pause').textContent='Продолжить';};
  $('size').onclick=()=>{$('coin').classList.toggle('native');$('size').textContent=$('coin').classList.contains('native')?'Увеличить':'Оригинальный размер';};
  $('background').onclick=()=>{document.body.classList.toggle('light');$('background').textContent=document.body.classList.contains('light')?'Тёмный фон':'Светлый фон';};
  async function runExport(button,action){button.disabled=true;try{await action();}catch(error){console.error(error);status.textContent=error.message;}finally{button.disabled=false;}}
  $('glb').onclick=()=>runExport($('glb'),async()=>{status.textContent='Сохраняю модель с анимацией…';await saveBlob('glb',await coin.exportGLB());});
  $('png').onclick=()=>runExport($('png'),async()=>{await saveBlob('png',await coin.exportPNG());});
  $('video').onclick=()=>runExport($('video'),async()=>{const buttons=[...document.querySelectorAll('button,input')];buttons.forEach(n=>n.disabled=true);try{const blob=await coin.recordWebM(progress=>{status.textContent=`Записываю полный бесшовный цикл… ${Math.round(progress*100)}%`;});await saveBlob('webm',blob);}finally{buttons.forEach(n=>n.disabled=false);}});
  const angleSync=setInterval(()=>{if(coin.playing)$('angle').value=Math.round((coin.time*SPIN_SPEED*180/Math.PI)%360);},100);
  window.addEventListener('pagehide',()=>clearInterval(angleSync),{once:true});
  document.body.dataset.ready='true';
  console.info('Zvezdach 3D ready — supplied Subtract.svg, Three.js r169, reference motion 0.45 rad/s');
}catch(error){console.error(error);status.textContent='Не удалось отобразить знак: '+error.message;}
