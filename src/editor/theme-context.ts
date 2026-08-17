import { createContext, useContext } from 'react';

import type { EaseCutTheme } from './types';

export const EaseCutThemeContext = createContext<EaseCutTheme>('dark');

export const useEaseCutTheme = (): EaseCutTheme =>
  useContext(EaseCutThemeContext);
