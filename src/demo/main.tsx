import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DemoApp } from './App';
import '../editor/styles.css';
import './demo.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('找不到 #root 容器');
}

createRoot(root).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
