/** 捷運局路網圖資路段名稱 → 營運路線代表色（臺北捷運官方色系） */
export const MRT_LINE_STYLES: Record<
  string,
  { lineId: string; lineName: string; color: string }
> = {
  木柵線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  內湖線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  南港線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  淡水線: { lineId: 'R', lineName: '淡水信義線', color: '#E3002C' },
  信義線: { lineId: 'R', lineName: '淡水信義線', color: '#E3002C' },
  松山線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  新店線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  小南門線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  碧潭支線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  中和線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  蘆洲線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  新莊線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  板橋線: { lineId: 'BL', lineName: '板南線', color: '#0070BD' },
  環狀線: { lineId: 'Y', lineName: '環狀線', color: '#FFDB00' },
};

export const MRT_MAIN_LINES = [
  { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  { lineId: 'R', lineName: '淡水信義線', color: '#E3002C' },
  { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  { lineId: 'BL', lineName: '板南線', color: '#0070BD' },
  { lineId: 'Y', lineName: '環狀線', color: '#FFDB00' },
] as const;
