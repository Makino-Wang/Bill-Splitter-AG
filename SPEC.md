# 旅遊分帳 Web App (GAS) 功能規格書 (SPEC)

## 1. 專案概述 (Overview)
* **專案名稱**：旅遊分帳 Web App (GAS 平台)
* **目的**：將 Google Sheets 旅遊分帳模板網頁化，支援多行程管理、多人即時共編、服務費自動計算、最佳化債務結算（最少轉帳次數對銷），並提供現代暗色外觀與手機端無縫體驗。
* **技術棧**：
  * **Backend**：Google Apps Script (GAS) Web App (`doGet`, `google.script.run`)
  * **Database**：Google Sheets (單一行程對應一個 Sheet 分頁)
  * **Frontend**：HTML5 / Tailwind CSS (Dark Mode) / Vue 3 (Composition API) / Phosphor Icons

---

## 2. 核心計算機制解析 (Calculation Logic)

根據範本表格欄位拆解計算邏輯如下：

| 欄位名稱 | 欄位代號 | 計算邏輯與說明 |
| :--- | :---: | :--- |
| **原始金額** | D | 使用者輸入的消費金額。 |
| **要加服務費** | E | 布林值（Boolean）。服務費固定為 10%。 |
| **加了服務費** | F | 若 E = True，則 F = D * 1.1（四捨五入）；否則 F = D。 |
| **誰付了錢** | G | 單選，該筆消費實際墊款人（Payer）。 |
| **誰該付錢** | H | 多選，參與該筆消費分攤的人員名單（Splitters，共 N 人）。 |
| **單人分攤金額** | C | 該筆消費每人需負擔金額：C = F / N。 |
| **總共付多少** | J | 成員 i 作為墊款人的所有消費總和。 |
| **應該付多少** | K | 成員 i 在所有消費中應分攤金額總和。 |
| **差額** | L | L = J - K。<br>• L > 0：該成員為債權人（應收回 L 元）。<br>• L < 0：該成員為債務人（應支付 │L│ 元）。 |

---

## 3. 系統功能與體驗規格 (Functional Requirements)

### F1. 行程與成員管理 (Trip & Member Management)
* **行程建立與切換**：
  * 使用者可輸入「行程名稱」進入既有行程或建立新行程（如：2026九州）。
  * 新建行程自動複製試算表 `Template` 分頁，保護公式架構。
  * 支援網址 Query 參數（`?trip=2026九州`），方便一鍵複製連結分享給旅伴。
* **狀態持久化與手機導航體驗 (Mobile Navigation & Persistence)**：
  * **雙重持久化機制**：進入行程後自動將行程名稱寫入 `localStorage`（鍵值 `BILL_SPLITTER_CURRENT_TRIP`）。
  * **重新整理復原順序**：URL Query 參數優先 > `localStorage` 復原 > 首頁。當使用者在手機滑動觸發重整時，自動留在當前行程。
  * **返回鍵支援**：整合 `history.pushState` 與 `popstate` 監聽，手機返回手勢或按鍵能正常在「行程頁」與「首頁」間退回。
  * **防誤觸防護**：全域套用 `overscroll-behavior-y: contain`，防止滑動瀏覽時誤觸下拉重新整理。
  * **主動回首頁**：點擊「回首頁」按鈕時同步清除 `localStorage` 與網址參數。
* **成員名單管理**：
  * 支援動態新增成員（儲存於 Sheet 的 O1 儲存格，並與 K 欄公式名單自動合併去重）。
  * 新增消費時支援在 Modal 內即時鍵入新成員並即時同步至 Payer 與 Splitters 選項。

### F2. 消費明細輸入與列表 (Expense Entry & List)
* **新增 / 編輯明細表單 (Modal)**：
  * **日期**：預設今天，支援原生 Datepicker（設定 `color-scheme: dark` 確保深色主題日曆與文字對比度）。
  * **店家 & 項目**：文字輸入。
  * **金額**：數字輸入。
  * **要加服務費**：Checkbox 開關，勾選後自動加計 10% 服務費並即時預覽總額。
  * **誰付了錢 (Payer)**：單選膠囊標籤（選取時高亮）。
  * **誰該付錢 (Splitters)**：多選膠囊標籤，提供「全選 / 全不選」快捷按鈕。
  * **備註 (Note)**：選填。
* **明細列表展示**：
  * 卡片式條列所有消費，清楚展示日期、店家、項目、墊款人、分攤人數、服務費標籤與單人分攤金額。
  * 提供「編輯」與「刪除」動作（刪除時僅清除儲存格資料而不破壞試算表結構與公式行）。

### F3. 外觀設計規範 (Dark Theme Specification)
* **強制深色主題 (Force Dark UI)**：
  * 背景基底：`bg-slate-900`
  * 卡片容器：`bg-slate-800`，搭配細緻邊框 `border-slate-700/60` 與深色投影。
  * 主題色彩：Sky 藍色 (`primary-500`) 作為重點按鈕與圖示色彩。
  * 財務色彩：應收（債權）為高對比亮綠 `text-emerald-400`，應付（債務）為高對比亮紅 `text-rose-400`。
  * 彈出對話框：`bg-slate-800` 搭配毛玻璃背景遮罩 `bg-black/75 backdrop-blur-sm`。

### F4. 時間與多管道即時同步機制 (Sync & Timestamp Mechanism)
* **最後更新日期時間 (Last Synced Timestamp)**：
  * 位於行程頁面頂部（行程名稱下方）。
  * 格式：`YYYY/MM/DD HH:mm`（補零格式，如 `2026/08/28 01:24`）。
  * **時區計算**：以使用者手機/設備的當前所在時區（Client Local Timezone）自動換算。
* **資料更新管道**：
  1. **頂部「重新整理」按鈕**：位於「複製連結」右側，點擊觸發原位非同步更新（In-place Spin），不跳動白屏，更新完顯示 Toast「已更新最新帳目」並更新時間戳。
  2. **記帳操作後自動同步**：新增、編輯、刪除消費或新增成員後自動重新獲取最新試算表資料。
  3. **分頁焦點切換自動同步 (Visibility Sync)**：監聽 `visibilitychange` 事件，當使用者從其他 App 切換回瀏覽器時自動背景更新。
  4. **Modal 防護機制**：當使用者正開啟 Modal 填寫表單或正在儲存時，自動略過背景更新以防止輸入內容被覆蓋。

### F5. 智慧結算與轉帳指引 (Smart Settlement)
* **個人帳目總覽**：卡片式展示各成員之「已付總額」、「應付總額」與「目前差額 (+/-)」。
* **最佳化轉帳演算法（貪婪對銷演算法）**：
  * 自動配對最大債權人與最大債務人，計算出最少轉帳次數的交易清單。
  * **範例輸出**：
    * Alice $\rightarrow$ Bob : $500
    * Charlie $\rightarrow$ Bob : $300

---

## 4. Google Sheets 資料庫結構設計 (Data Schema)

單一行程的 Sheet 表格欄位規劃如下：

| 欄位 | 欄位名稱 | 型態 / 說明 |
| :---: | :--- | :--- |
| **A** | `ID` | 唯一識別碼 (UUID) |
| **B** | `Date` | 消費日期 (`YYYY-MM-DD`) |
| **C** | `Store` | 店家名稱 |
| **D** | `Item` | 消費項目 |
| **E** | `Amount` | 原始消費金額 |
| **F** | `HasServiceFee` | 是否加計服務費 (`Y` / 空白) |
| **H** | `Payer` | 墊款人姓名 |
| **I** | `Splitters` | 分攤人名單（逗號分隔字串，例如 `Alice,Bob`） |
| **J** | `Note` | 備註說明 |
| **O1** | `ManualMembers` | 手動新增的成員清單（逗號分隔字串） |

---

## 5. API 介面規格 (GAS Server Functions)

* `doGet(e)`: 伺服端入口，讀取 `e.parameter.trip` 並回傳 Web App HTML 頁面。
* `createTrip(tripName)`: 以 `Template` 頁籤為範本複製建立新行程。
* `getTripData(tripName)`: 取得指定行程之成員清單與消費明細。
* `addMember(tripName, memberName)`: 新增成員至 Sheet O1 儲存格。
* `saveExpense(tripName, expensePayload)`: 新增或更新消費紀錄（以 ID 判斷）。
* `deleteExpense(tripName, expenseId)`: 刪除消費紀錄（清除 A~F 與 H~J 欄位，保留試算表行數）。

