export const getRgbHexColor = (rgbaHexColor: string) =>
  rgbaHexColor.slice(0, 7);

export const replaceRgbHexColor = (
  rgbaHexColor: string,
  rgbHexColor: string,
) => `${rgbHexColor}${rgbaHexColor.slice(7)}`.toUpperCase();

export const formatHexRgbaColor = (rgbaHexColor: string) => {
  const red = Number.parseInt(rgbaHexColor.slice(1, 3), 16);
  const green = Number.parseInt(rgbaHexColor.slice(3, 5), 16);
  const blue = Number.parseInt(rgbaHexColor.slice(5, 7), 16);
  const alpha = Number.parseInt(rgbaHexColor.slice(7, 9), 16) / 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};
