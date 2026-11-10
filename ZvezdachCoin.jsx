import {useEffect,useRef} from 'react';
import {mountZvezdachCoin} from './zvezdach-coin.js';

export default function ZvezdachCoin({className,style}){
  const container=useRef(null);
  useEffect(()=>{
    let disposed=false,controller;
    mountZvezdachCoin(container.current).then(api=>{
      if(disposed)api.dispose();else controller=api;
    }).catch(error=>console.error('ZvezdachCoin:',error));
    return ()=>{disposed=true;controller?.dispose();};
  },[]);
  return <div ref={container} className={className} style={{width:152,height:132,...style}} />;
}
