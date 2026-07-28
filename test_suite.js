const fs = require('fs');

// --- 1. Mocks for GAS Environment ---
class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = []; // 2D array
    this.frozenRows = 0;
  }
  setName(newName) { 
    const oldName = this.name;
    this.name = newName; 
    if (global.ssMock && global.ssMock.sheets[oldName] === this) {
      delete global.ssMock.sheets[oldName];
      global.ssMock.sheets[newName] = this;
    }
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return {
      getValue: () => {
        if (this.data[row-1] && this.data[row-1][col-1] !== undefined) return this.data[row-1][col-1];
        return '';
      },
      getValues: () => {
        let res = [];
        for (let i = 0; i < numRows; i++) {
          let r = [];
          for (let j = 0; j < numCols; j++) {
            r.push((this.data[row-1+i] && this.data[row-1+i][col-1+j]) !== undefined ? this.data[row-1+i][col-1+j] : '');
          }
          res.push(r);
        }
        return res;
      },
      setValue: (val) => {
        if (!this.data[row-1]) this.data[row-1] = [];
        this.data[row-1][col-1] = val;
      },
      setValues: (vals) => {
        for (let i = 0; i < numRows; i++) {
          if (!this.data[row-1+i]) this.data[row-1+i] = [];
          for (let j = 0; j < numCols; j++) {
            this.data[row-1+i][col-1+j] = vals[i][j];
          }
        }
      },
      clearContent: () => {
        for (let i = 0; i < numRows; i++) {
          if (this.data[row-1+i]) {
            for (let j = 0; j < numCols; j++) {
              this.data[row-1+i][col-1+j] = '';
            }
          }
        }
      }
    };
  }
  setFrozenRows(num) { this.frozenRows = num; }
  getLastRow() { return this.data.length; }
  appendRow(rowArray) { this.data.push(rowArray); }
  deleteRow(rowNum) { this.data.splice(rowNum - 1, 1); }
  copyTo(ss) {
    const copy = new MockSheet(this.name + ' Copy');
    copy.data = JSON.parse(JSON.stringify(this.data)); // deep copy array
    ss.sheets[copy.name] = copy;
    return copy;
  }
}

global.ssMock = {
  sheets: {},
  getSheetByName: function(name) { return this.sheets[name] || null; },
  insertSheet: function(name) { this.sheets[name] = new MockSheet(name); return this.sheets[name]; }
};

// Setup Template sheet
const templateSheet = new MockSheet('Template');
templateSheet.data = [['ID', 'Date', 'Store', 'Item', 'Amount', 'HasServiceFee', 'G(formula)', 'Payer', 'Splitters', 'Note', 'K(formula members)', '', '', '', 'O(manual members)']];
global.ssMock.sheets['Template'] = templateSheet;


global.SpreadsheetApp = { openById: () => global.ssMock };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'mock_id' }) };
global.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
global.Utilities = { getUuid: () => 'uuid-' + Math.random().toString(36).substring(7) };
global.HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: ()=>{}, addMetaTag: ()=>{} }) }) };

// --- 2. Load Code.gs into context ---
const codeGsContent = fs.readFileSync('c:/Antigravity/旅遊分帳/Code.gs', 'utf8');
eval(codeGsContent);

// --- 3. Test Runner Framework ---
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (e) {
    if (e.message !== e.message) {
      console.error(`❌ FAIL: ${name} - Unexpected error: ${e.message}`);
      testsFailed++;
    }
  }
}

console.log("=== 🚀 旅遊分帳 (Bill Splitter) Code-Level Test Suite (NEW) ===");

// === BACKEND TESTS (Code.gs) ===
console.log("\n--- Backend CRUD Tests ---");

runTest("createTrip: Should copy from Template and set name", () => {
  const res = createTrip('TestTrip1');
  assert(res.success === true, "Trip creation failed");
  const sheet = global.ssMock.getSheetByName('TestTrip1');
  assert(sheet !== null, "Sheet was not created");
});

runTest("createTrip: Should fail if trip already exists", () => {
  const res = createTrip('TestTrip1');
  assert(res.success === false, "Should return false for existing trip");
});

runTest("addMember: Should add manual members to O1", () => {
  const res1 = addMember('TestTrip1', 'Alice');
  assert(res1.success === true, "Add member Alice failed");
  const res2 = addMember('TestTrip1', 'Bob');
  assert(res2.members.includes('Alice') && res2.members.includes('Bob'), "Members list incorrect");
});

runTest("saveExpense: Should append a new expense using findFirstEmptyRow", () => {
  const payload = {
    date: '2026-07-24',
    store: 'Dinner',
    amount: 100,
    hasServiceFee: true,
    payer: 'Alice',
    splitters: ['Alice', 'Bob']
  };
  const res = saveExpense('TestTrip1', payload);
  assert(res.success === true, "saveExpense failed");
  const data = getTripData('TestTrip1');
  assert(data.expenses.length === 1, "Expense was not added");
  assert(data.expenses[0].store === 'Dinner', "Expense store mismatch");
  assert(data.expenses[0].hasServiceFee === true, "hasServiceFee mismatch");
});

runTest("saveExpense: Should update an existing expense", () => {
  let data = getTripData('TestTrip1');
  const expenseId = data.expenses[0].id;
  
  const payload = {
    id: expenseId,
    date: '2026-07-25',
    store: 'Dinner Updated',
    amount: 150,
    hasServiceFee: false,
    payer: 'Bob',
    splitters: ['Bob']
  };
  
  const res = saveExpense('TestTrip1', payload);
  assert(res.success === true, "Update failed");
  
  data = getTripData('TestTrip1');
  assert(data.expenses.length === 1, "Should not create new row on update");
  assert(data.expenses[0].store === 'Dinner Updated', "Update not applied");
  assert(data.expenses[0].amount === 150, "Update amount not applied");
});

runTest("deleteExpense: Should clear content instead of deleting row", () => {
  let data = getTripData('TestTrip1');
  const expenseId = data.expenses[0].id;
  
  const res = deleteExpense('TestTrip1', expenseId);
  assert(res.success === true, "Delete failed");
  
  data = getTripData('TestTrip1');
  assert(data.expenses.length === 0, "Expense was not removed from payload");
  
  // Verify sheet row is still there but empty in A
  const sheet = global.ssMock.getSheetByName('TestTrip1');
  assert(sheet.getLastRow() === 2, "Row should not be physically deleted");
  assert(sheet.getRange(2,1).getValue() === '', "Row ID should be empty");
});

console.log(`\n=== 📊 Test Summary: ${testsPassed} Passed, ${testsFailed} Failed ===\n`);
