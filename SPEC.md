# 旅遊分帳 Web App (GAS) 功能規格書 (SPEC)

## 1. 專案概述 (Overview)
* **專案名稱**：旅遊分帳 Web App (GAS 平台)
* **目的**：將現有的 Google Sheets 旅遊分帳模板網頁化，支援多行程管理、多人即時共編、服務費自動計算以及最佳化債務結算（誰給誰多少錢）。
* **技術棧**：
  * **Backend**：Google Apps Script (GAS) Web App (`doGet`, `google.script.run`)
  * **Database**：Google Sheets (作為資料儲存庫)
  * **Frontend**：HTML5 / CSS (Tailwind CSS) / JavaScript (Vue.js 或 Vanilla JS)

## 2. 核心計算機制解析 (Calculation Logic)

根據範本表格欄位拆解計算邏輯如下：

| 欄位名稱 | 欄位代號 | 計算邏輯與說明 |
| :--- | :---: | :--- |
| **原始金額** | D | 使用者輸入的消費金額。 |
| **要加服務費** | E | 布林值（Boolean）。服務費固定為 10%。 |
| **加了服務費** | F | 若 E = True，則 F = D * 1.1；否則 F = D。 |
| **誰付了錢** | G | 單選，該筆消費實際墊款人。 |
| **誰該付錢** | H | 多選，參與該筆消費分攤的人員名單（N 人）。 |
| **單人分攤金額** | C | 該筆消費每人需負擔金額：C = F / N。 |
| **總共付多少** | J | 成員 i 作為墊款人的所有消費總和。 |
| **應該付多少** | K | 成員 i 在所有消費中應分攤金額總和。 |
| **差額** | L | L = J - K。<br>• L > 0：該成員為債權人（應收回 L 元）。<br>• L < 0：該成員為債務人（應支付 │L│ 元）。 |

## 3. 系統功能需求 (Functional Requirements)

### F1. 行程與成員管理 (Trip & Member Management)
* **行程建立與切換**：
  * 使用者可輸入「行程名稱」（如：2026九州之旅）。
  * 系統自動以行程名稱創建對應 Sheet 頁籤或在資料庫中標註行程 ID。
  * 網頁 URL 支援 Query Parameter（例如 `?trip=2026九州之旅`），方便複製連結傳給同行好友共用。
* **成員名單管理**：
  * 支援動態新增與刪除成員（如：A, B, C, D）。
  * 欄位下拉選單（誰付了錢、誰該付錢）自動同步現有成員名單。

### F2. 消費明細輸入與列表 (Expense Entry & List)
* **新增 / 編輯明細表單**：
  * **日期**：預設今天，可自行選擇。
  * **店家 & 項目**：文字輸入。
  * **金額**：數字輸入。
  * **要加服務費**：Checkbox 或 Toggle 開關，勾選後系統自動加計 10% 服務費。
  * **誰付了錢**：單選選單（從成員名單載入）。
  * **誰該付錢**：多選 Checkbox，並提供「全選 / 全不選」快捷按鈕。
  * **Note**：備註說明。
* **明細列表展示**：
  * 清晰展示所有歷史消費，並提供「編輯」與「刪除」功能。

### F3. 即時同步與協作 (Real-time Collaboration)
* 前端設定**定期輪詢 (Polling Mechanism)**（預設每 5~10 秒刷新一次資料），或在使用者執行任何增修動作後自動觸發更新，確保多人同時在網頁上時能看到最新帳目。

### F4. 智慧結算與轉帳指引 (Smart Settlement)
* **個人帳目總覽**：卡片式展示每位成員的「總共付多少」、「應該付多少」與「目前差額」。
* **最佳化轉帳演算法（貪婪對銷演算法）**：
  * 自動計算出最少轉帳次數的交易指引。
  * **範例輸出**：
    * A 應轉帳給 B 500 元
    * C 應轉帳給 B 300 元

## 4. Google Sheets 資料庫結構設計 (Data Schema)

單一行程的 Sheet 表格欄位規劃如下：

| Col A | Col B | Col C | Col D | Col E | Col F | Col G | Col H | Col I |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ID` | `Date` | `Store` | `Item` | `Amount` | `HasServiceFee` | `Payer` | `Splitters` (逗號分隔) | `Note` |

> *註：個人統計與差額無須儲存在 Sheet 儲存格中，直接交由 Web App 前后端 JavaScript 進行即時動態計算即可，效能更佳且不易產生公式破壞的問題。*

## 5. API 介面規格 (GAS Server Functions)

* `getTripData(tripName)`: 取得指定行程的成員名單、消費明細及結算統計。
* `addExpense(tripName, expensePayload)`: 新增一筆消費明細。
* `updateExpense(tripName, expenseId, expensePayload)`: 更新消費明細。
* `deleteExpense(tripName, expenseId)`: 刪除消費明細。
* `updateMembers(tripName, memberList)`: 更新行程成員名單。
