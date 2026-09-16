/* ============================================
   CONFIG — App-wide constants
   ============================================ */

const CONFIG = {
  // Replace this with your deployed Google Apps Script URL
  API_URL: '',

  // Polling interval for kitchen/order status (ms)
  // Changed back to 5000 for faster updates
  POLL_INTERVAL: 5000,

  // Currency symbol
  CURRENCY: '₹',

  // Order ID prefix
  ORDER_PREFIX: 'ORD',

  // ── Payment / UPI Configuration ──
  // ⚠️ UPDATE THESE with your actual UPI ID and payee name
  UPI_ID: 'kattupallimanish@upi',
  UPI_NAME: 'Kattupalli Manish',
  INVOICE_PREFIX: 'WINRMS',

  // Session storage keys
  STORAGE_KEYS: {
    CART: 'rqs_cart',
    AUTH: 'rqs_admin_auth',
    TABLE: 'rqs_table',
    LAST_ORDER: 'rqs_last_order',
    CUSTOMER_NAME: 'rqs_customer_name',
    CUSTOMER_PHONE: 'rqs_customer_phone',
    ROLE: 'rqs_admin_role',
    ADMIN_NAME: 'rqs_admin_name',
    PAID_INVOICES: 'rqs_paid_invoices',
  },

  // Order statuses (extended)
  STATUS: {
    NEW: 'New',
    PENDING: 'New',          // Alias for backward compat
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY: 'Ready',
    DELIVERED: 'Delivered',
    PAID: 'Paid',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    CANCELLATION_REQUESTED: 'Cancellation Requested',
    COMPLETED: 'Completed',
  },

  // Payment statuses
  PAYMENT_STATUS: {
    AWAITING: 'Awaiting Payment',
    INITIATED: 'Payment Initiated',
    AWAITING_CASH: 'Awaiting Cash Payment',
    SUCCESS: 'Payment Successful',
    CASH_RECEIVED: 'Cash Received',
    FAILED: 'Payment Failed',
    CANCELLED: 'Cancelled',
    REFUND_PENDING: 'Refund Pending',
    REFUNDED: 'Refunded',
    NOT_REQUIRED: 'Not Required',
  },

  // Refund statuses
  REFUND_STATUS: {
    NOT_REQUIRED: 'Not Required',
    PENDING: 'Refund Pending',
    REFUNDED: 'Refunded',
  },

  // User roles
  ROLES: {
    CUSTOMER: 'Customer',
    KITCHEN: 'Kitchen',
    CASHIER: 'Cashier',
    MANAGER: 'Manager',
    OWNER: 'Owner',
    ADMIN: 'Admin',
  },

  // Cancellation reasons
  CANCEL_REASONS: [
    'Customer Requested',
    'Out of Stock',
    'Duplicate Order',
    'Kitchen Error',
    'Payment Failed',
    'Wrong Table',
    'Restaurant Closed',
    'Staff Mistake',
    'Other',
  ],

  // Roles that are considered "privileged" (can cancel at any stage)
  PRIVILEGED_ROLES: ['Manager', 'Owner', 'Admin'],

  // Roles that can cancel only before Preparing
  CASHIER_CANCEL_REASONS: [
    'Customer Requested',
    'Duplicate Order',
    'Payment Failed',
    'Wrong Table',
    'Other',
  ],

  // Status flow (next valid states)
  STATUS_FLOW: {
    'New': ['Accepted', 'Rejected'],
    'Accepted': ['Preparing'],
    'Preparing': ['Ready'],
    'Ready': ['Delivered'],
    'Delivered': ['Paid'],
    'Cancellation Requested': ['Cancelled'],
  },

  // Status display order for stepper
  STATUS_STEPS: ['New', 'Accepted', 'Preparing', 'Ready', 'Delivered'],

  // Colors for status badges (used in JS)
  STATUS_COLORS: {
    'New': '#3b82f6',
    'Accepted': '#e8a317',
    'Preparing': '#f97316',
    'Ready': '#a855f7',
    'Delivered': '#6b7280',
    'Paid': '#10b981',
    'Rejected': '#ef4444',
    'Cancelled': '#ef4444',
    'Cancellation Requested': '#f97316',
    'Completed': '#10b981',
  },

  // Status emoji indicators
  STATUS_EMOJI: {
    'New': '🟡',
    'Accepted': '🔵',
    'Preparing': '🟠',
    'Ready': '🟣',
    'Delivered': '🟢',
    'Paid': '🟢',
    'Rejected': '🔴',
    'Cancelled': '🔴',
    'Cancellation Requested': '🟠',
    'Completed': '🟢',
  },
};

// Freeze config to prevent accidental mutation
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.STATUS);
Object.freeze(CONFIG.PAYMENT_STATUS);
Object.freeze(CONFIG.REFUND_STATUS);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.STATUS_FLOW);
Object.freeze(CONFIG.STATUS_COLORS);
Object.freeze(CONFIG.STATUS_EMOJI);
Object.freeze(CONFIG.CANCEL_REASONS);
Object.freeze(CONFIG.CASHIER_CANCEL_REASONS);
Object.freeze(CONFIG.PRIVILEGED_ROLES);

/* ── Utility: Generate Invoice Number ──
   Format: WINRMS | INV-YYYYMMDD-XXXX
   Stores sequence counter per day in localStorage
*/
function generateInvoiceNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // Per-day counter stored in localStorage
  const counterKey = `WIN_INV_CTR_${dateStr}`;
  let counter = parseInt(localStorage.getItem(counterKey) || '1000', 10);
  counter += 1;
  localStorage.setItem(counterKey, String(counter));

  const seq = String(counter).slice(-4).padStart(4, '0');
  return `${CONFIG.INVOICE_PREFIX} | INV-${dateStr}-${seq}`;
}

/* ── Utility: Get or create invoice number for an order
   Ensures same order always gets same invoice number
*/
function getOrCreateInvoiceNumber(orderId) {
  const key = `WIN_INV_${orderId}`;
  let inv = localStorage.getItem(key);
  if (!inv) {
    inv = generateInvoiceNumber();
    localStorage.setItem(key, inv);
  }
  return inv;
}

/* ── Utility: Get current admin role ── */
function getCurrentRole() {
  return sessionStorage.getItem(CONFIG.STORAGE_KEYS.ROLE) || CONFIG.ROLES.ADMIN;
}

/* ── Utility: Can role cancel an order in this status? ── */
function canCancelOrder(role, orderStatus) {
  if (orderStatus === 'Paid' || orderStatus === 'Completed' || orderStatus === 'Rejected' || orderStatus === 'Cancelled') {
    return false;
  }
  if (role === CONFIG.ROLES.KITCHEN) return false;
  if (role === CONFIG.ROLES.CUSTOMER) {
    return orderStatus === 'New' || orderStatus === 'Accepted';
  }
  if (role === CONFIG.ROLES.CASHIER) {
    return orderStatus === 'New' || orderStatus === 'Accepted';
  }
  // Manager, Owner, Admin — can cancel anything except Completed/Paid
  if (CONFIG.PRIVILEGED_ROLES.includes(role)) {
    return orderStatus !== 'Paid' && orderStatus !== 'Completed';
  }
  return false;
}

/* ── Utility: Dynamic Brand Sync ── */
window.applyBrandSettings = function() {
  // Attempt to get the latest synced brand name
  const storedName = localStorage.getItem('app_restaurant_name');
  if (!storedName) return; // Wait until API fetches it

  // 1. Update Document Title
  if (document.title.includes('WIN Restaurant')) {
    document.title = document.title.replace('WIN Restaurant', storedName);
  }

  // 2. Update Apple Mobile Web App Title Meta Tag
  const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (metaTitle && metaTitle.content === 'WIN Restaurant') {
    metaTitle.content = storedName;
  }

  // 3. Update DOM elements (sidebars, receipts, headers)
  const brandElements = document.querySelectorAll('.sidebar-brand, .invoice-brand-name, .receipt-logo, h1, span');
  brandElements.forEach(el => {
    // Avoid destroying child elements if it contains icons, by doing a gentle text replacement 
    // or innerHTML replacement if it exactly matches the pattern
    if (el.innerHTML.includes('WIN Restaurant')) {
      el.innerHTML = el.innerHTML.replace('WIN Restaurant', storedName);
    }
  });
};

document.addEventListener('DOMContentLoaded', window.applyBrandSettings);
