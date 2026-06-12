# 台灣房價等高線圖

以政府公開資料視覺化臺北市不動產實價登錄資訊，在地圖上呈現每坪單價的等高線（contour）分布。

## 資料來源

| 資料集 | 提供機關 | 說明 |
|--------|----------|------|
| [臺北市實價周報](https://data.taipei/dataset/detail?id=a9a97996-3a55-46c8-9076-e5ebdefad6dc) | 臺北市政府地政局 | 買賣／租賃交易明細 |
| [臺北市住宅價格季指數](https://data.taipei/dataset/detail?id=954911b5-896d-4ae1-9ebe-87c4ba8a191e) | 臺北市政府地政局 | 12 行政區標準住宅單價 |
| [臺北捷運車站](https://data.taipei/dataset/detail?id=1eefa68d-7c8d-491b-8e75-66a161947426) | 臺北捷運公司 | 車站座標（同步 TDX） |

資料授權：政府資料開放授權條款

## 功能

- **房價等高線**：以 IDW 空間插值從交易點生成每坪單價等高線
- **交易點位**：顯示各筆實價登錄成交位置與單價
- **行政區指數**：疊加各區標準住宅單價（季指數）
- **捷運路網**：依營運路線代表色繪製路網（臺北市政府捷運局開放圖資）
- **篩選**：依行政區、單價區間篩選

## 快速開始

```bash
npm install
npm run fetch-data   # 從臺北市資料大平臺下載並處理資料
npm run dev          # 啟動開發伺服器
```

可選：設定 `TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET` 環境變數，`fetch-data` 會優先從 [TDX](https://tdx.transportdata.tw/) 取得捷運站資料。

開啟 http://localhost:5173

## 技術說明

- **前端**：React + TypeScript + Vite + Leaflet
- **等高線**：d3-contour + 反距離加權（IDW）插值
- **座標**：地址以行政區範圍內近似定位（政府門牌定位 API 需額外申請）

> 實價登錄資訊僅代表該筆交易之成交價格，不代表區域行情。等高線為統計視覺化，非正式估價。

## 擴充方向

- 串接內政部全國實價登錄開放資料（plvr.land.moi.gov.tw）
- 整合 TGOS 門牌定位服務取得精確座標
- 加入時間軸、建物型態、屋齡等維度分析
