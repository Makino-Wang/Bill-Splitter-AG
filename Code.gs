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
 * 初始化工作表的表頭
 */
function initializeSheetHeaders(sheet) {
  const headers = ['ID', 'Date', 'Store', 'Item', 'Amount', 'HasServiceFee', 'Payer', 'Splitters', 'Note'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  // 凍結第一列
  sheet.setFrozenRows(1);
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
  
  sheet = ss.insertSheet(tripName);
  initializeSheetHeaders(sheet);
  
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
  
  // 檢查是否需要初始化表頭
  if (sheet.getLastRow() === 0) {
    initializeSheetHeaders(sheet);
  }
  
  // 取得成員清單 (J1)
  const membersRaw = sheet.getRange('J1').getValue();
  const members = membersRaw ? String(membersRaw).split(',').map(m => m.trim()).filter(Boolean) : [];
  
  // 取得消費明細 (Row 2 開始)
  const lastRow = sheet.getLastRow();
  let expenses = [];
  
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    expenses = data.map(row => {
      return {
        id: row[0],
        date: row[1] ? new Date(row[1]).toISOString().split('T')[0] : '', // 轉成 YYYY-MM-DD
        store: row[2],
        item: row[3],
        amount: Number(row[4]) || 0,
        hasServiceFee: row[5] === true || row[5] === 'true' || row[5] === 'TRUE',
        payer: row[6],
        splitters: row[7] ? String(row[7]).split(',').map(s => s.trim()).filter(Boolean) : [],
        note: row[8]
      };
    });
  }
  
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
  
  const currentMembersRaw = sheet.getRange('J1').getValue();
  const members = currentMembersRaw ? String(currentMembersRaw).split(',').map(m => m.trim()).filter(Boolean) : [];
  
  if (members.includes(memberName)) {
    throw new Error('成員已存在');
  }
  
  members.push(memberName);
  sheet.getRange('J1').setValue(members.join(','));
  
  return { success: true, members: members };
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
  const dateStr = expensePayload.date || ''; // 前端傳 YYYY-MM-DD
  const splittersStr = (expensePayload.splitters || []).join(',');
  
  const rowData = [
    id,
    dateStr,
    expensePayload.store || '',
    expensePayload.item || '',
    expensePayload.amount || 0,
    expensePayload.hasServiceFee ? true : false,
    expensePayload.payer || '',
    splittersStr,
    expensePayload.note || ''
  ];
  
  if (isNew) {
    sheet.appendRow(rowData);
  } else {
    // 尋找要更新的行
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      const rowIndex = ids.indexOf(id);
      if (rowIndex !== -1) {
        // 更新該行 (rowIndex + 2 因為資料從 row 2 開始)
        sheet.getRange(rowIndex + 2, 1, 1, rowData.length).setValues([rowData]);
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
      sheet.deleteRow(rowIndex + 2);
      return { success: true };
    }
  }
  throw new Error('找不到要刪除的消費紀錄');
}
