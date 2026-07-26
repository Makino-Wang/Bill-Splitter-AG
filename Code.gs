/**
 * 主入口
 */
function doGet(e) {
  const html = HtmlService.createTemplateFromFile('Index');
  html.initialTrip = e.parameter.trip || '';
  const output = html.evaluate();
  output.setTitle('旅遊分帳 Web App');
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  return output;
}

/**
 * 引入其他 HTML 檔案
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 取得共用的 Spreadsheet 實體
 */
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('請先在指令碼屬性中設定 SPREADSHEET_ID');
  return SpreadsheetApp.openById(id);
}

/**
 * 初始化工作表的表頭 (已不再使用，改為複製 Template)
 */
function initializeSheetHeaders(sheet) {
  // 保持空函式以防其他地方呼叫
}

/**
 * 尋找 A 欄的第一個空白行
 */
function findFirstEmptyRowInColumnA(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return 2; // 若連表頭都沒有，從第二行開始
  
  const data = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === '') {
      return i + 1;
    }
  }
  return lastRow + 1;
}

/**
 * API: 建立新行程
 * @param {string} tripName 
 * @returns {object} { success, message }
 */
function createTrip(tripName) {
  if (!tripName) return { success: false, message: '行程名稱不可為空' };
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(tripName);
  
  if (sheet) {
    return { success: false, message: '行程已存在' };
  }
  
  let templateSheet = ss.getSheetByName('Template');
  if (!templateSheet) {
    return { success: false, message: '找不到 Template 分頁，請在試算表中建立' };
  }
  
  sheet = templateSheet.copyTo(ss);
  sheet.setName(tripName);
  
  return { success: true, message: '行程建立成功' };
}

/**
 * API: 取得指定行程的所有資料
 * @param {string} tripName 
 * @returns {object} { members: string[], expenses: object[] }
 */
function getTripData(tripName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(tripName);
  
  if (!sheet) {
    throw new Error('找不到該行程：' + tripName);
  }
  
  // 取得手動成員清單 (O1)
  const manualMembersRaw = sheet.getRange('O1').getValue();
  const manualMembers = manualMembersRaw ? String(manualMembersRaw).split(',').map(m => m.trim()).filter(Boolean) : [];
  
  const lastRow = sheet.getLastRow();
  let formulaMembers = [];
  let expenses = [];
  
  if (lastRow > 1) {
    // 取得 K 欄 (有哪些人) 的公式產生名單
    const kData = sheet.getRange(2, 11, lastRow - 1, 1).getValues(); // 11 = K
    formulaMembers = kData.flat().map(m => String(m).trim()).filter(Boolean);
    
    // 取得消費明細 A~J (columns 1 to 10)
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    expenses = data.map(row => {
      if (!row[0]) return null; // 略過被刪除產生的空白行
      return {
        id: row[0],
        date: row[1] ? new Date(row[1]).toISOString().split('T')[0] : '', // B
        store: row[2], // C
        item: row[3], // D
        amount: Number(row[4]) || 0, // E
        hasServiceFee: row[5] === 'Y' || row[5] === true || row[5] === 'true' || row[5] === 'TRUE', // F
        payer: row[7], // H
        splitters: row[8] ? String(row[8]).split(',').map(s => s.trim()).filter(Boolean) : [], // I
        note: row[9] // J
      };
    }).filter(Boolean);
  }
  
  // 合併並去重
  const members = Array.from(new Set([...manualMembers, ...formulaMembers]));
  
  return {
    members: members,
    expenses: expenses
  };
}

/**
 * API: 新增成員
 * @param {string} tripName 
 * @param {string} memberName 
 * @returns {object} { success, members }
 */
function addMember(tripName, memberName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(tripName);
  if (!sheet) throw new Error('找不到該行程：' + tripName);
  if (!memberName) throw new Error('成員名稱不可為空');
  
  const currentMembersRaw = sheet.getRange('O1').getValue();
  const manualMembers = currentMembersRaw ? String(currentMembersRaw).split(',').map(m => m.trim()).filter(Boolean) : [];
  
  const lastRow = sheet.getLastRow();
  let formulaMembers = [];
  if (lastRow > 1) {
    const kData = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
    formulaMembers = kData.flat().map(m => String(m).trim()).filter(Boolean);
  }
  
  const allMembers = new Set([...manualMembers, ...formulaMembers]);
  
  if (allMembers.has(memberName)) {
    throw new Error('成員已存在');
  }
  
  manualMembers.push(memberName);
  sheet.getRange('O1').setValue(manualMembers.join(','));
  
  return { success: true, members: Array.from(new Set([...manualMembers, ...formulaMembers])) };
}

/**
 * API: 儲存消費 (新增或更新)
 * @param {string} tripName 
 * @param {object} expensePayload 
 * @returns {object} { success }
 */
function saveExpense(tripName, expensePayload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(tripName);
  if (!sheet) throw new Error('找不到該行程：' + tripName);
  
  const isNew = !expensePayload.id;
  const id = isNew ? Utilities.getUuid() : expensePayload.id;
  const dateStr = expensePayload.date || '';
  const splittersStr = (expensePayload.splitters || []).join(',');
  const hasServiceFeeVal = expensePayload.hasServiceFee ? 'Y' : '';
  
  const rowDataPart1 = [
    id, // A
    dateStr, // B
    expensePayload.store || '', // C
    expensePayload.item || '', // D
    expensePayload.amount || 0, // E
    hasServiceFeeVal // F
  ];
  
  const rowDataPart2 = [
    expensePayload.payer || '', // H
    splittersStr, // I
    expensePayload.note || '' // J
  ];
  
  if (isNew) {
    const rowIndex = findFirstEmptyRowInColumnA(sheet);
    sheet.getRange(rowIndex, 1, 1, 6).setValues([rowDataPart1]); // A~F
    sheet.getRange(rowIndex, 8, 1, 3).setValues([rowDataPart2]); // H~J
  } else {
    // 尋找要更新的行
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      const rowIndex = ids.indexOf(id);
      if (rowIndex !== -1) {
        // 更新該行
        sheet.getRange(rowIndex + 2, 1, 1, 6).setValues([rowDataPart1]); // A~F
        sheet.getRange(rowIndex + 2, 8, 1, 3).setValues([rowDataPart2]); // H~J
      } else {
        throw new Error('找不到該筆消費紀錄');
      }
    }
  }
  
  return { success: true };
}

/**
 * API: 刪除消費
 * @param {string} tripName 
 * @param {string} expenseId 
 * @returns {object} { success }
 */
function deleteExpense(tripName, expenseId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(tripName);
  if (!sheet) throw new Error('找不到該行程：' + tripName);
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const rowIndex = ids.indexOf(expenseId);
    if (rowIndex !== -1) {
      // 為了保護公式不被 deleteRow 破壞，我們只清除資料欄位，留下空白行 (getTripData 會自動略過空白行)
      sheet.getRange(rowIndex + 2, 1, 1, 6).clearContent(); // 刪除 A~F
      sheet.getRange(rowIndex + 2, 8, 1, 3).clearContent(); // 刪除 H~J
      return { success: true };
    }
  }
  throw new Error('找不到要刪除的消費紀錄');
}
