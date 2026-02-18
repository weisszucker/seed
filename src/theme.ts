export interface Theme {
  colors: {
    appBackground: string;
    panelBackground: string;
    surface: string;
    surfaceMuted: string;
    textPrimary: string;
    textMuted: string;
    accent: string;
    warning: string;
    success: string;
    danger: string;
    info: string;
    white: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
  };
  modal: {
    top: string;
    left: string;
    width: string;
    saveHeight: number;
    quitHeight: number;
    actionWidth: number;
  };
}

export const defaultTheme: Theme = {
  colors: {
    appBackground: "#0d0d14",
    panelBackground: "#1a1a2e",
    surface: "#2a2a3e",
    surfaceMuted: "#383850",
    textPrimary: "#c5c8c6",
    textMuted: "#666",
    accent: "#f0c674",
    warning: "#f0c674",
    success: "#b5bd68",
    danger: "#cc6666",
    info: "#81a2be",
    white: "#ffffff",
  },
  spacing: {
    xs: 0,
    sm: 1,
    md: 2,
    lg: 3,
  },
  modal: {
    top: "35%",
    left: "25%",
    width: "50%",
    saveHeight: 10,
    quitHeight: 11,
    actionWidth: 10,
  },
};

export function createTheme(): Theme {
  return {
    colors: { ...defaultTheme.colors },
    spacing: { ...defaultTheme.spacing },
    modal: { ...defaultTheme.modal },
  };
}
