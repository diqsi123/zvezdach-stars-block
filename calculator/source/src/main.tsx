import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import PurchaseApp from './PurchaseApp';
import purchaseStyles from './purchase.css?inline';
import './calculator.css';

const checkout = import.meta.env.VITE_VARIANT === '1' || new URLSearchParams(location.search).has('checkout');
if (checkout) {
  const stylesheet = document.createElement('style');
  stylesheet.textContent = purchaseStyles;
  document.head.append(stylesheet);
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>{checkout ? <PurchaseApp /> : <App />}</StrictMode>
);
