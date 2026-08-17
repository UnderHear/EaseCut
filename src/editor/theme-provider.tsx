import type { ReactNode } from 'react';

import { EaseCutThemeContext } from './theme-context';
import type { EaseCutTheme } from './types';

type EaseCutThemeProviderProps = {
  children: ReactNode;
  theme: EaseCutTheme;
};

export function EaseCutThemeProvider({
  children,
  theme,
}: EaseCutThemeProviderProps) {
  return (
    <EaseCutThemeContext.Provider value={theme}>
      {children}
    </EaseCutThemeContext.Provider>
  );
}
