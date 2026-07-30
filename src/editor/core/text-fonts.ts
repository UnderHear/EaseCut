export const TIMELINE_TEXT_FONT_PRESETS = [
  {
    family: 'ZCOOL CangEr YuYang',
    fontType: '1187223',
    label: '站酷仓耳渔阳体',
  },
  {
    family: 'ZCOOL GaoDuanHei',
    fontType: '1187221',
    label: '站酷高端黑',
  },
  {
    family: 'ZCOOL KuHei',
    fontType: '1187219',
    label: '站酷酷黑体',
  },
  {
    family: 'ZCOOL KuaiLe',
    fontType: '1187217',
    label: '站酷快乐体',
  },
  {
    family: 'ZCOOL WenYi',
    fontType: '1187213',
    label: '站酷文艺体',
  },
  {
    family: 'ZCOOL XiaoWei',
    fontType: '1187211',
    label: '站酷小薇体',
  },
  {
    family: 'Source Han Sans SC',
    fontType: 'SY_Black',
    label: '思源黑体',
  },
  {
    family: 'Alibaba PuHuiTi',
    fontType: 'ALi_PuHui',
    label: '阿里巴巴普惠体',
  },
] as const;

export type TimelineTextFontType =
  (typeof TIMELINE_TEXT_FONT_PRESETS)[number]['fontType'];

export type TimelineTextFontPreset = Readonly<{
  family: string;
  fontType: TimelineTextFontType;
  label: string;
}>;

export const DEFAULT_TIMELINE_TEXT_FONT_TYPE = 'SY_Black';
export const DEFAULT_TIMELINE_TEXT_FONT_SIZE = 120;

const presetFontTypes = new Set<string>(
  TIMELINE_TEXT_FONT_PRESETS.map((preset) => preset.fontType),
);

export const getTimelineTextFontPreset = (fontType: string) =>
  TIMELINE_TEXT_FONT_PRESETS.find(
    (preset) => preset.fontType === fontType,
  ) ?? null;

export const isTimelineTextFontType = (
  fontType: string,
): fontType is TimelineTextFontType =>
  presetFontTypes.has(fontType);
