export type CanvasFontStyle = Readonly<{
  bold: boolean;
  fontSize: number;
  italic: boolean;
}>;

export const createTextCanvasFont = (
  style: CanvasFontStyle,
  fontFamily: string,
) =>
  `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : ''}${style.fontSize}px "${fontFamily}", sans-serif`;
