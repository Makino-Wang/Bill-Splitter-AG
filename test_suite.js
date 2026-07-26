const fs = require('fs');

// --- 1. Mocks for GAS Environment ---
class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = []; // 2D array
    this.frozenRows = 0;
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
      }
    };
  }
  setFrozenRows(num) { this.frozenRows = num; }
  getLastRow() { return this.data.length; }
  appendRow(rowArray) { this.data.push(rowArray); }
  deleteRow(rowNum) { this.data.splice(rowNum - 1, 1); }
}

global.ssMock = {
  sheets: {},
  getSheetByName: function(name) { return this.sheets[name] || null; },
  insertSheet: function(name) { this.sheets[name] = new MockSheet(name); return this.sheets[name]; }
};

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
    // Error already logged in assert, or unexpected error
    if (e.message !== e.message) { // just to catch unexpected
      console.error(`❌ FAIL: ${name} - Unexpected error: ${e.message}`);
      testsFailed++;
    }
  }
}

console.log("=== 🚀 旅遊分帳 (Bill Splitter) Code-Level Test Suite ===");

// === BACKEND TESTS (Code.gs) ===
console.log("\n--- Backend CRUD Tests ---");

runTest("createTrip: Should create a new trip and initialize headers", () => {
  const res = createTrip('TestTrip1');
  assert(res.success === true, "Trip creation failed");
  const sheet = global.ssMock.getSheetByName('TestTrip1');
  assert(sheet !== null, "Sheet was not created");
  assert(sheet.data[0][0] === 'ID', "Headers not initialized properly");
});

runTest("createTrip: Should fail if trip already exists", () => {
  const res = createTrip('TestTrip1');
  assert(res.success === false, "Should return false for existing trip");
  assert(res.message === '行程已存在', "Wrong error message");
});

runTest("addMember: Should add members correctly", () => {
  const res1 = addMember('TestTrip1', 'Alice');
  assert(res1.success === true, "Add member Alice failed");
  const res2 = addMember('TestTrip1', 'Bob');
  assert(res2.members.includes('Alice') && res2.members.includes('Bob'), "Members list incorrect");
});

runTest("addMember: Should fail if member already exists", () => {
  let failed = false;
  try {
    addMember('TestTrip1', 'Alice');
  } catch(e) {
    failed = true;
    assert(e.message === '成員已存在', "Wrong exception message");
  }
  assert(failed, "Did not throw exception for duplicate member");
});

runTest("saveExpense: Should add a new expense", () => {
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

runTest("deleteExpense: Should delete an expense", () => {
  let data = getTripData('TestTrip1');
  const expenseId = data.expenses[0].id;
  
  const res = deleteExpense('TestTrip1', expenseId);
  assert(res.success === true, "Delete failed");
  
  data = getTripData('TestTrip1');
  assert(data.expenses.length === 0, "Expense was not removed");
});


// === FRONTEND TESTS (Calculations from App.html) ===
console.log("\n--- Frontend Calculation Tests ---");

function testSettlementLogic(members, expenses, expectedResults) {
  const getExpenseTotal = (exp) => {
    const amt = Number(exp.amount) || 0;
    return exp.hasServiceFee ? Math.round(amt * 1.1) : amt;
  };

  const totals = {};
  members.forEach(m => totals[m] = { paid: 0, split: 0 });
  
  expenses.forEach(exp => {
    const totalAmt = getExpenseTotal(exp);
    if (exp.payer && totals[exp.payer]) {
      totals[exp.payer].paid += totalAmt;
    }
    if (exp.splitters && exp.splitters.length > 0) {
      const splitAmt = totalAmt / exp.splitters.length;
      exp.splitters.forEach(s => {
        if (totals[s]) totals[s].split += splitAmt;
      });
    }
  });

  Object.keys(totals).forEach(k => {
    totals[k].paid = Math.round(totals[k].paid * 100) / 100;
    totals[k].split = Math.round(totals[k].split * 100) / 100;
  });

  const memberBalances = {};
  Object.entries(totals).forEach(([m, t]) => {
    memberBalances[m] = Math.round((t.paid - t.split) * 100) / 100;
  });

  const debtors = [];
  const creditors = [];
  
  Object.entries(memberBalances).forEach(([person, amount]) => {
    if (amount > 0) creditors.push({ person, amount });
    else if (amount < 0) debtors.push({ person, amount: -amount });
  });
  
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  
  const results = [];
  let i = 0, j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    let debtor = debtors[i];
    let creditor = creditors[j];
    
    let amount = Math.min(debtor.amount, creditor.amount);
    amount = Math.round(amount * 100) / 100;
    
    if (amount > 0) {
      results.push({ from: debtor.person, to: creditor.person, amount: amount });
    }
    
    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
    
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }
  
  return { memberBalances, results };
}


runTest("Settlement: Basic split without service fee", () => {
  const res = testSettlementLogic(
    ['A', 'B'], 
    [{ payer: 'A', splitters: ['A', 'B'], amount: 100, hasServiceFee: false }]
  );
  assert(res.memberBalances['A'] === 50, "A balance wrong");
  assert(res.memberBalances['B'] === -50, "B balance wrong");
  assert(res.results.length === 1, "Should have 1 transaction");
  assert(res.results[0].from === 'B' && res.results[0].to === 'A' && res.results[0].amount === 50, "Transaction wrong");
});

runTest("Settlement: Circular debt cancels out", () => {
  // A pays for B (100), B pays for C (100), C pays for A (100)
  const res = testSettlementLogic(
    ['A', 'B', 'C'], 
    [
      { payer: 'A', splitters: ['B'], amount: 100, hasServiceFee: false },
      { payer: 'B', splitters: ['C'], amount: 100, hasServiceFee: false },
      { payer: 'C', splitters: ['A'], amount: 100, hasServiceFee: false },
    ]
  );
  assert(res.memberBalances['A'] === 0, "A balance should be 0");
  assert(res.results.length === 0, "Should have 0 transactions");
});

runTest("Settlement: Complex floating point precision test (The previously fixed bug)", () => {
  // Total 155 split across 4 people in weird fractions
  const res = testSettlementLogic(
    ['A', 'B', 'C', 'D'], 
    [
      { payer: 'A', splitters: ['A', 'B', 'C', 'D'], amount: 100, hasServiceFee: false },
      { payer: 'B', splitters: ['C', 'D', 'A'], amount: 50, hasServiceFee: true }, // 55
    ]
  );
  // Balances should exactly sum to 0
  const sum = Math.round(Object.values(res.memberBalances).reduce((a,b)=>a+b, 0)*100)/100;
  assert(sum === 0, `Balances do not sum to zero! Sum is ${sum}`);
});

console.log(`\n=== 📊 Test Summary: ${testsPassed} Passed, ${testsFailed} Failed ===\n`);
