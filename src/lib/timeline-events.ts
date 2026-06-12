/** 2018–2026 影響股價與房價之主要事件（對齊 YYYY-MM） */
export interface TimelineEvent {
  month: string;
  shortLabel: string;
  label: string;
}

export const MACRO_TIMELINE_EVENTS: TimelineEvent[] = [
  {
    month: '2018-03',
    shortLabel: '貿易戰',
    label: '美國對中課徵關稅，美中貿易戰升溫',
  },
  {
    month: '2018-10',
    shortLabel: '全球股跌',
    label: '貿易戰與升息預期，台股大幅修正',
  },
  {
    month: '2020-03',
    shortLabel: '疫情降息',
    label: '新冠疫情爆發，央行降息至 1.25%',
  },
  {
    month: '2021-04',
    shortLabel: '晶片荒',
    label: '全球晶片短缺，台股強勢上漲',
  },
  {
    month: '2022-02',
    shortLabel: '俄烏戰爭',
    label: '俄烏戰爭爆發，通膨與能源價格飆升',
  },
  {
    month: '2022-06',
    shortLabel: '升息週期',
    label: '央行啟動升息，台股進入修正',
  },
  {
    month: '2023-03',
    shortLabel: 'AI 萌芽',
    label: 'ChatGPT 帶動 AI 投資敘事，央行再升息',
  },
  {
    month: '2023-08',
    shortLabel: '新青安',
    label:
      '新版青年安心成家房貸上路（額度 1,000 萬、年限 40 年、利率補貼加碼至 1.5 碼）',
  },
  {
    month: '2024-03',
    shortLabel: 'AI 行情',
    label: 'AI 資本支出週期，台股突破兩萬點',
  },
  {
    month: '2025-04',
    shortLabel: '關稅疑慮',
    label: '美國關稅政策不確定，台股波動加大',
  },
];
