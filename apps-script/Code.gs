/**
 * ============================================
 * Google Apps Script — Restaurant QR Ordering System
 * ============================================
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet with these tabs: Config, Tables, Menu, Orders
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file into Code.gs
 * 4. Click Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL and paste it into js/config.js
 * 6. Every time you edit this script, create a NEW deployment version
 * 
 * SHEET HEADERS (Row 1 of each sheet):
 * 
 * Config:  Key | Value
 * Tables:  Table No | QR URL
 * Menu:    ID | Category | Item Name | Description | Price | Image URL | Available
 * Orders:  Order ID | Table | Items JSON | Total | Status | Timestamp | Notes
 */

const SHEET_CONFIG = 'Config';
const SHEET_TABLES = 'Tables';
const SHEET_MENU = 'Menu';
const SHEET_ORDERS = 'Orders';
const SHEET_AD_CAMPAIGNS = 'AdCampaigns';
const SHEET_AD_ANALYTICS = 'AdAnalytics';
const SHEET_CANCELLATIONS = 'Cancellations';
const SHEET_PAYMENTS = 'Payments';
const SHEET_CASHIER_NOTIFY = 'CashierNotify';

// ── GET handler ──
function doGet(e) {
  try {
    const action = e.parameter.action;

    switch (action) {
      case 'getConfig':
        return respond(getConfig());
      case 'getMenu':
        return respond(getMenu());
      case 'getOrders':
        return respond(getOrders(e.parameter.status || ''));
      case 'getOrderStatus':
        return respond(getOrderStatus(e.parameter.orderId));
      case 'getDashboard':
        return respond(getDashboard());
      case 'getWaiterCalls':
        return respond(getWaiterCalls());
      case 'getAds':
        return respond(getAds(e.parameter.placement, e.parameter.category));
      case 'getCancellationStats':
        return respond(getCancellationStats());
      case 'getPaymentStatus':
        return respond(getPaymentStatus(e.parameter.orderId));
      default:
        return respond(null, 'Unknown action: ' + action);
    }
  } catch (err) {
    return respond(null, err.message);
  }
}

// ── POST handler ──
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    // Use lock for write operations
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    let result;

    switch (action) {
      case 'placeOrder':
        result = placeOrder(body);
        break;
      case 'updateOrderStatus':
        result = updateOrderStatus(body.orderId, body.status);
        break;
      case 'addMenuItem':
        result = addMenuItem(body);
        break;
      case 'updateMenuItem':
        result = updateMenuItem(body);
        break;
      case 'deleteMenuItem':
        result = deleteMenuItem(body.id);
        break;
      case 'login':
        result = login(body.password);
        break;
      case 'callWaiter':
        result = callWaiter(body.table);
        break;
      case 'resolveWaiterCall':
        result = resolveWaiterCall(body.table);
        break;
      case 'trackAdEvent':
        result = trackAdEvent(body);
        break;
      case 'updateConfig':
        result = updateConfig(body.key, body.value);
        break;
      case 'cancelOrder':
        result = cancelOrder(body);
        break;
      case 'requestCancellation':
        result = requestCancellation(body);
        break;
      case 'updatePayment':
        result = updatePayment(body);
        break;
      case 'notifyCashier':
        result = notifyCashier(body);
        break;
      case 'getPaymentStatus':
        result = getPaymentStatus(body);
        break;
      default:
        lock.releaseLock();
        return respond(null, 'Unknown action: ' + action);
    }

    lock.releaseLock();
    return respond(result);
  } catch (err) {
    return respond(null, err.message);
  }
}

// ── Response helper ──
function respond(data, error) {
  const output = error
    ? { success: false, error: error }
    : { success: true, data: data };

  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helper: Format IST Time ──
function formatIST(dateObjOrStr) {
  const d = dateObjOrStr ? new Date(dateObjOrStr) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  return Utilities.formatDate(validDate, "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
}

// ── Helper: Get sheet by name ──
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// ── Helper: Get all rows as objects (using header row as keys) ──
function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return rows;
}

// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════
function getConfig() {
  const rows = getSheetData(SHEET_CONFIG);
  const config = {};
  rows.forEach(row => {
    config[row['Key']] = row['Value'];
  });
  return config;
}

function updateConfig(key, value) {
  const sheet = getSheet(SHEET_CONFIG);
  const rows = sheet.getDataRange().getValues();
  const targetKey = String(key).trim();
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === targetKey) {
      sheet.getRange(i + 1, 2).setValue(value);
      return { success: true, message: 'Config updated successfully' };
    }
  }
  
  // If key does not exist, append it
  sheet.appendRow([targetKey, value]);
  return { success: true, message: 'Config key added and updated successfully' };
}

// ════════════════════════════════════════
// MENU
// ════════════════════════════════════════
function getMenu() {
  const rows = getSheetData(SHEET_MENU);
  return rows
    .filter(row => row['ID'] !== '') // skip empty rows
    .map(row => ({
      id: row['ID'],
      category: row['Category'],
      name: row['Item Name'],
      description: row['Description'] || '',
      price: Number(row['Price']),
      image: row['Image URL'] || '',
      available: String(row['Available']).toLowerCase() === 'yes',
    }));
}

function addMenuItem(data) {
  const sheet = getSheet(SHEET_MENU);
  const lastRow = sheet.getLastRow();
  
  // Generate next ID
  let maxId = 0;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach(row => {
      const id = Number(row[0]);
      if (id > maxId) maxId = id;
    });
  }
  const newId = maxId + 1;

  sheet.appendRow([
    newId,
    data.category || '',
    data.name || '',
    data.description || '',
    Number(data.price) || 0,
    data.image || '',
    data.available !== false ? 'Yes' : 'No'
  ]);

  return { id: newId, message: 'Item added successfully' };
}

function updateMenuItem(data) {
  const sheet = getSheet(SHEET_MENU);
  const rows = sheet.getDataRange().getValues();
  const targetId = String(data.id);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === targetId) {
      const rowNum = i + 1;
      if (data.category !== undefined)    sheet.getRange(rowNum, 2).setValue(data.category);
      if (data.name !== undefined)        sheet.getRange(rowNum, 3).setValue(data.name);
      if (data.description !== undefined) sheet.getRange(rowNum, 4).setValue(data.description);
      if (data.price !== undefined)       sheet.getRange(rowNum, 5).setValue(Number(data.price));
      if (data.image !== undefined)       sheet.getRange(rowNum, 6).setValue(data.image);
      if (data.available !== undefined)   sheet.getRange(rowNum, 7).setValue(data.available ? 'Yes' : 'No');
      return { message: 'Item updated successfully' };
    }
  }
  throw new Error('Menu item not found: ' + targetId);
}

function deleteMenuItem(id) {
  const sheet = getSheet(SHEET_MENU);
  const rows = sheet.getDataRange().getValues();
  const targetId = String(id);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === targetId) {
      sheet.deleteRow(i + 1);
      return { message: 'Item deleted successfully' };
    }
  }
  throw new Error('Menu item not found: ' + targetId);
}

// ════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════
function generateUniqueShortOrderId() {
  const rows = getSheetData(SHEET_ORDERS);
  
  // Find all currently active order IDs (not Delivered and not Rejected)
  const activeIds = new Set();
  rows.forEach(row => {
    const status = row['Status'];
    if (status !== 'Delivered' && status !== 'Rejected') {
      activeIds.add(String(row['Order ID']).toUpperCase().trim());
    }
  });

  const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let orderId = '';
  let attempts = 0;

  do {
    const randomChar = alphabets.charAt(Math.floor(Math.random() * alphabets.length));
    const randomNumber = Math.floor(Math.random() * 1000); // 0 to 999
    const numberStr = String(randomNumber).padStart(3, '0');
    orderId = randomChar + numberStr;
    attempts++;
  } while (activeIds.has(orderId) && attempts < 10000);

  return orderId;
}

function placeOrder(data) {
  const sheet = getSheet(SHEET_ORDERS);
  
  // Generate a McDonald's style short random unique ID (e.g. M657)
  const orderId = generateUniqueShortOrderId();
  const timestamp = formatIST();
  const itemsJson = JSON.stringify(data.items || []);
  const total = Number(data.total) || 0;
  const table = data.table || 'Unknown';
  const notes = data.notes || '';
  const customerName = data.customerName || '';
  const mobileNumber = data.mobileNumber || '';

  sheet.appendRow([
    orderId,
    table,
    customerName,
    mobileNumber,
    itemsJson,
    total,
    'New',
    timestamp,
    notes
  ]);

  return { orderId: orderId, message: 'Order placed successfully!' };
}

function getOrders(statusFilter) {
  const rows = getSheetData(SHEET_ORDERS);
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  let orders = rows
    .filter(row => row['Order ID'] !== '')
    .map(row => {
      let items = [];
      try {
        items = JSON.parse(row['Items JSON'] || '[]');
      } catch (e) {
        items = [];
      }
      return {
        orderId: row['Order ID'],
        table: row['Table'],
        customerName: row['Customer Name'] || '',
        mobileNumber: row['Mobile Number'] || '',
        items: items,
        total: Number(row['Total']),
        status: row['Status'],
        timestamp: row['Timestamp'],
        notes: row['Notes'] || '',
        cancel_reason: row['Cancel Reason'] || '',
        cancel_requested_at: row['Cancel Requested At'] || '',
        paymentStatus: row['Payment Status'] || '',
        invoiceNo: row['Invoice No'] || '',
        paymentMethod: row['Payment Method'] || '',
        paidAt: row['Paid At'] || '',
      };
    })
    .filter(o => {
      try {
        const orderDate = Utilities.formatDate(new Date(o.timestamp), tz, "yyyy-MM-dd");
        return orderDate === todayStr;
      } catch (e) {
        return false;
      }
    });

  if (statusFilter) {
    orders = orders.filter(o => o.status === statusFilter);
  }

  // Return newest first
  orders.reverse();
  return orders;
}

function getOrderStatus(orderId) {
  const rows = getSheetData(SHEET_ORDERS);
  const order = rows.find(row => row['Order ID'] === orderId);
  
  if (!order) {
    throw new Error('Order not found: ' + orderId);
  }

  let items = [];
  try {
    items = JSON.parse(order['Items JSON'] || '[]');
  } catch (e) {
    items = [];
  }

  return {
    orderId: order['Order ID'],
    table: order['Table'],
    customerName: order['Customer Name'] || '',
    mobileNumber: order['Mobile Number'] || '',
    items: items,
    total: Number(order['Total']),
    status: order['Status'],
    timestamp: order['Timestamp'],
    notes: order['Notes'] || '',
    cancel_reason: order['Cancel Reason'] || '',
    cancel_requested_at: order['Cancel Requested At'] || '',
    paymentStatus: order['Payment Status'] || '',
    invoiceNo: order['Invoice No'] || '',
    paymentMethod: order['Payment Method'] || '',
    paidAt: order['Paid At'] || '',
  };
}

function updateOrderStatus(orderId, newStatus) {
  const sheet = getSheet(SHEET_ORDERS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      sheet.getRange(i + 1, 7).setValue(newStatus); // Status is column 7 after adding Name/Phone
      return { message: 'Status updated to ' + newStatus };
    }
  }
  throw new Error('Order not found: ' + orderId);
}

// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════
function login(password) {
  const config = getConfig();
  if (password === config['admin_password']) {
    return { authenticated: true, restaurant: config['restaurant_name'] || 'WIN Restaurant' };
  }
  throw new Error('Invalid password');
}

// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
function getDashboard() {
  const allOrders = getOrders('');
  
  // Get today's date string in YYYY-MM-DD format (India timezone)
  const todayDateStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  
  const todayOrders = allOrders.filter(o => {
    if (!o.timestamp) return false;
    try {
      const orderDateStr = Utilities.formatDate(new Date(o.timestamp), "Asia/Kolkata", "yyyy-MM-dd");
      return orderDateStr === todayDateStr;
    } catch(e) {
      return false; // Fallback for invalid dates
    }
  });

  const totalRevenue = todayOrders.filter(o => o.status === 'Paid').reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = todayOrders.filter(o => 
    o.status === 'New' || o.status === 'Accepted' || o.status === 'Preparing' || o.status === 'Ready' || o.status === 'Delivered'
  ).length;
  const completedOrders = todayOrders.filter(o => o.status === 'Paid').length;
  const cancelledOrders = todayOrders.filter(o => o.status === 'Cancelled' || o.status === 'Rejected').length;

  return {
    todayOrders: todayOrders.length,
    totalRevenue: totalRevenue,
    pendingOrders: pendingOrders,
    completedOrders: completedOrders,
    cancelledToday: cancelledOrders,
    recentOrders: todayOrders.slice(0, 10),
  };
}

// ════════════════════════════════════════
// WAITER CALLS
// ════════════════════════════════════════
function getOrCreateWaiterCallsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('WaiterCalls');
  if (!sheet) {
    sheet = ss.insertSheet('WaiterCalls');
    sheet.appendRow(['Id', 'Table', 'Status', 'Timestamp']);
  }
  return sheet;
}

function callWaiter(tableNo) {
  const sheet = getOrCreateWaiterCallsSheet();
  const timestamp = formatIST();
  sheet.appendRow(['', tableNo, 'Pending', timestamp]);
  return { table: tableNo, status: 'Pending', timestamp: timestamp };
}

function getWaiterCalls() {
  const sheet = getOrCreateWaiterCallsSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  const calls = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === 'Pending') {
      calls.push({
        table: rows[i][1],
        status: rows[i][2],
        timestamp: rows[i][3]
      });
    }
  }
  return calls;
}

function resolveWaiterCall(tableNo) {
  const sheet = getOrCreateWaiterCallsSheet();
  const rows = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(tableNo) && rows[i][2] === 'Pending') {
      sheet.getRange(i + 1, 3).setValue('Resolved');
      found = true;
    }
  }
  
  if (found) {
    return { success: true };
  }
  throw new Error('No pending calls found for table: ' + tableNo);
}

// ════════════════════════════════════════
// AD ECOSYSTEM BACKEND
// ════════════════════════════════════════
function getOrCreateAdSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let campaignsSheet = ss.getSheetByName(SHEET_AD_CAMPAIGNS);
  if (!campaignsSheet) {
    campaignsSheet = ss.insertSheet(SHEET_AD_CAMPAIGNS);
    campaignsSheet.appendRow([
      'Campaign ID', 'Advertiser', 'Headline', 'Subtext', 'Image URL', 'Target URL', 
      'Bid CPC', 'Placements', 'Category Target', 'Status'
    ]);
    // Append some default campaigns
    campaignsSheet.appendRow([
      'C_101', 'City Cabs', 'Need a ride home?', 'Get 10% off your ride tonight with code RESTO10',
      'https://images.unsplash.com/photo-1549317661-bd32c8ce0be2?w=300&h=200&fit=crop', 'https://example.com/taxi',
      '0.50', 'cart_empty,checkout,bill', '', 'ACTIVE'
    ]);
    campaignsSheet.appendRow([
      'C_102', 'Gelato Spot', 'Trending Nearby: Authentic Gelato', 'Craving dessert? We are just 2 blocks away!',
      'https://images.unsplash.com/photo-1563805042-7684c8a9e9cb?w=300&h=200&fit=crop', 'https://example.com/gelato',
      '0.75', 'menu_landing,inline', 'Desserts,All', 'ACTIVE'
    ]);
  }
  
  let analyticsSheet = ss.getSheetByName(SHEET_AD_ANALYTICS);
  if (!analyticsSheet) {
    analyticsSheet = ss.insertSheet(SHEET_AD_ANALYTICS);
    analyticsSheet.appendRow(['Timestamp', 'Event Type', 'Campaign ID', 'Placement', 'Restaurant Name']);
  }
}

function getAds(placement, category) {
  getOrCreateAdSheets();
  const rows = getSheetData(SHEET_AD_CAMPAIGNS);
  
  return rows
    .filter(row => row['Campaign ID'] !== '' && String(row['Status']).toUpperCase() === 'ACTIVE')
    .map(row => {
      const placementsArr = String(row['Placements']).split(',').map(s => s.trim());
      const categoriesArr = String(row['Category Target']).split(',').map(s => s.trim());
      
      return {
        id: row['Campaign ID'],
        advertiser: row['Advertiser'],
        headline: row['Headline'],
        subtext: row['Subtext'] || '',
        image: row['Image URL'] || '',
        url: row['Target URL'] || '',
        cpc: Number(row['Bid CPC']) || 0,
        placements: placementsArr,
        categoryTarget: categoriesArr
      };
    })
    .filter(ad => {
      // Filter by placement if provided
      if (placement && !ad.placements.includes(placement)) return false;
      // Filter by category if provided
      if (category && ad.categoryTarget.length > 0 && !ad.categoryTarget.includes('All') && !ad.categoryTarget.includes(category)) return false;
      return true;
    });
}

function trackAdEvent(data) {
  getOrCreateAdSheets();
  const sheet = getSheet(SHEET_AD_ANALYTICS);
  const timestamp = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
  
  sheet.appendRow([
    timestamp,
    data.eventType || 'IMPRESSION',
    data.campaignId || 'Unknown',
    data.placement || 'Unknown',
    data.restaurantName || 'WIN Restaurant'
  ]);
  
  return { success: true };
}


// ════════════════════════════════════════
// CANCELLATIONS

// ════════════════════════════════════════

/**
 * Customer requests cancellation for an in-progress order.
 * Sets status to 'Cancellation Requested' and stores reason in new columns.
 */
function requestCancellation(data) {
  const sheet   = getSheet(SHEET_ORDERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];

  // Ensure Cancel Reason and Cancel Requested At columns exist
  let cancelReasonIdx       = headers.indexOf('Cancel Reason');
  let cancelRequestedAtIdx  = headers.indexOf('Cancel Requested At');

  if (cancelReasonIdx === -1) {
    cancelReasonIdx = headers.length;
    sheet.getRange(1, cancelReasonIdx + 1).setValue('Cancel Reason');
    headers.push('Cancel Reason');
  }
  if (cancelRequestedAtIdx === -1) {
    cancelRequestedAtIdx = headers.length;
    sheet.getRange(1, cancelRequestedAtIdx + 1).setValue('Cancel Requested At');
  }

  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.orderId)) {
      var rowNum = i + 1;
      sheet.getRange(rowNum, 7).setValue('Cancellation Requested');
      sheet.getRange(rowNum, cancelReasonIdx + 1).setValue(data.reason || '');
      sheet.getRange(rowNum, cancelRequestedAtIdx + 1).setValue(formatIST(data.requestedAt));
      return { success: true, message: 'Cancellation request recorded for order ' + data.orderId };
    }
  }
  throw new Error('Order not found: ' + data.orderId);
}


/**
 * Ensures the Cancellations sheet exists with correct headers.
 * Headers: Order ID | Table | Total | Reason | Remarks | Cancelled By | Cancelled Role | Cancelled At | Refund Status
 */
function getOrCreateCancellationsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_CANCELLATIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CANCELLATIONS);
    sheet.appendRow([
      'Order ID', 'Table', 'Total', 'Reason', 'Remarks',
      'Cancelled By', 'Cancelled Role', 'Cancelled At', 'Refund Status'
    ]);
    // Style the header row
    sheet.getRange(1, 1, 1, 9).setBackground('#c0392b').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

/**
 * Cancels an order:
 *  1. Updates Orders sheet Status → 'Cancelled'
 *  2. Writes a row to Cancellations sheet for full audit trail
 */
function cancelOrder(data) {
  // 1. Mark the order as Cancelled in Orders sheet
  const ordersSheet = getSheet(SHEET_ORDERS);
  const ordersRows = ordersSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < ordersRows.length; i++) {
    if (String(ordersRows[i][0]) === String(data.orderId)) {
      ordersSheet.getRange(i + 1, 7).setValue('Cancelled'); // Status column
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error('Order not found: ' + data.orderId);
  }

  // 2. Get order details for the cancellation record
  let orderTotal = 0;
  let orderTable = '';
  for (let i = 1; i < ordersRows.length; i++) {
    if (String(ordersRows[i][0]) === String(data.orderId)) {
      orderTable = String(ordersRows[i][1] || '');
      orderTotal = Number(ordersRows[i][5] || 0);
      break;
    }
  }

  // 3. Append to Cancellations sheet
  const cancelSheet = getOrCreateCancellationsSheet();
  cancelSheet.appendRow([
    data.orderId,
    orderTable || data.table || '',
    orderTotal,
    data.reason || '',
    data.remarks || '',
    data.cancelledBy || 'Admin',
    data.cancelledRole || 'Admin',
    formatIST(data.cancelledAt),
    data.refundStatus || 'Not Required'
  ]);

  return { success: true, message: 'Order ' + data.orderId + ' cancelled successfully.' };
}

/**
 * Returns all cancellation records + computed stats.
 * Used by the Cancellations admin page.
 */
function getCancellationStats() {
  const cancelSheet = getOrCreateCancellationsSheet();
  const rows = cancelSheet.getDataRange().getValues();

  if (rows.length < 2) {
    return { cancellations: [], totalOrders: 0 };
  }

  const headers = rows[0];
  const cancellations = [];

  for (let i = 1; i < rows.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = rows[i][j]; });
    cancellations.push({
      orderId:       row['Order ID'],
      table:         row['Table'],
      total:         Number(row['Total']) || 0,
      reason:        row['Reason'],
      remarks:       row['Remarks'] || '',
      cancelledBy:   row['Cancelled By'],
      cancelledRole: row['Cancelled Role'],
      cancelledAt:   row['Cancelled At'],
      refundStatus:  row['Refund Status'],
    });
  }

  // Sort newest first
  cancellations.sort((a, b) => new Date(b.cancelledAt) - new Date(a.cancelledAt));

  // Total orders (for rate calculation)
  const ordersSheet = getSheet(SHEET_ORDERS);
  const totalOrders = Math.max(ordersSheet.getLastRow() - 1, 0);

  return { cancellations: cancellations, totalOrders: totalOrders };
}

// ════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════

/**
 * Ensures the Payments sheet exists with correct headers.
 */
function getOrCreatePaymentsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PAYMENTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PAYMENTS);
    sheet.appendRow([
      'Order ID', 'Invoice No', 'Payment Method', 'Payment Status',
      'Transaction ID', 'Amount', 'Paid At'
    ]);
    sheet.getRange(1, 1, 1, 7).setBackground('#1a6b3a').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

/**
 * Records / updates a payment for an order.
 * Also updates the paymentStatus column in Orders sheet.
 */
function updatePayment(data) {
  const paymentsSheet = getOrCreatePaymentsSheet();

  // Check if payment row already exists for this order (update instead of append)
  const existing = paymentsSheet.getDataRange().getValues();
  let updated = false;
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]) === String(data.orderId)) {
      paymentsSheet.getRange(i + 1, 3).setValue(data.paymentMethod || '');
      paymentsSheet.getRange(i + 1, 4).setValue(data.paymentStatus || '');
      paymentsSheet.getRange(i + 1, 5).setValue(data.transactionId || '');
      paymentsSheet.getRange(i + 1, 7).setValue(formatIST(data.paidAt));
      updated = true;
      break;
    }
  }

  if (!updated) {
    // Get order amount from Orders sheet
    const ordersRows = getSheet(SHEET_ORDERS).getDataRange().getValues();
    let amount = 0;
    for (let i = 1; i < ordersRows.length; i++) {
      if (String(ordersRows[i][0]) === String(data.orderId)) {
        amount = Number(ordersRows[i][5] || 0);
        break;
      }
    }
    paymentsSheet.appendRow([
      data.orderId,
      data.invoiceNo || '',
      data.paymentMethod || '',
      data.paymentStatus || '',
      data.transactionId || '',
      amount,
      formatIST(data.paidAt)
    ]);
  }

  // Update paymentStatus in Orders sheet if column exists (column 10 = index 9)
  try {
    const ordersSheet = getSheet(SHEET_ORDERS);
    const ordersData = ordersSheet.getDataRange().getValues();
    const headers = ordersData[0];
    const payStatusCol = headers.indexOf('Payment Status');
    
    if (payStatusCol >= 0) {
      for (let i = 1; i < ordersData.length; i++) {
        if (String(ordersData[i][0]) === String(data.orderId)) {
          ordersSheet.getRange(i + 1, payStatusCol + 1).setValue(data.paymentStatus || '');
          break;
        }
      }
    }
  } catch(e) {
    // Column may not exist — safe to skip
  }

  return { success: true, message: 'Payment recorded for order ' + data.orderId };
}

/**
 * Gets payment status for a specific order.
 */
function getPaymentStatus(orderId) {
  const paymentsSheet = getOrCreatePaymentsSheet();
  const rows = paymentsSheet.getDataRange().getValues();
  if (rows.length < 2) return {};

  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(orderId)) {
      const record = {};
      headers.forEach((h, j) => { record[h] = rows[i][j]; });
      return {
        orderId:         record['Order ID'],
        invoiceNo:       record['Invoice No'],
        paymentMethod:   record['Payment Method'],
        paymentStatus:   record['Payment Status'],
        transactionId:   record['Transaction ID'],
        amount:          Number(record['Amount']) || 0,
        paidAt:          record['Paid At'],
      };
    }
  }
  return {}; // Not found — not yet paid
}

// ════════════════════════════════════════
// CASHIER NOTIFY
// ════════════════════════════════════════

/**
 * Logs a cash-payment notification (customer is waiting to pay).
 * The cashier can check this queue from the admin panel.
 */
function notifyCashier(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_CASHIER_NOTIFY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CASHIER_NOTIFY);
    sheet.appendRow(['Order ID', 'Table', 'Amount', 'Invoice No', 'Status', 'Notified At']);
    sheet.getRange(1, 1, 1, 6).setBackground('#e67e22').setFontColor('#ffffff').setFontWeight('bold');
  }

  // Avoid duplicate notifications for same order
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]) === String(data.orderId) && existing[i][4] === 'Pending') {
      return { success: true, message: 'Notification already exists' };
    }
  }

  sheet.appendRow([
    data.orderId,
    data.table || '',
    Number(data.amount) || 0,
    data.invoiceNo || '',
    'Pending',
    formatIST()
  ]);

  return { success: true, message: 'Cashier notified for order ' + data.orderId };
}
