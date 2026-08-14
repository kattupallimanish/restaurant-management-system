/* ============================================
   API — Google Sheets fetch wrapper
   ============================================ */

const API = (() => {
  // Invalidate old caches if code is updated
  const CACHE_VERSION = 'v2';
  if (localStorage.getItem('WIN_CACHE_VERSION') !== CACHE_VERSION) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('WIN_CACHE_')) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem('WIN_CACHE_VERSION', CACHE_VERSION);
  }

  /**
   * Core request handler.
   * GET requests use URL params, POST uses text/plain body to bypass CORS preflight.
   */
  async function request(method, action, data = {}, silentError = false) {
    try {
      let url = CONFIG.API_URL;
      let options = {};

      if (method === 'GET') {
        const params = new URLSearchParams({ action, ...data });
        url += '?' + params.toString();
        options = { method: 'GET', redirect: 'follow' };
      } else {
        options = {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...data }),
        };
      }

      const response = await fetch(url, options);
      const text = await response.text();

      // Apps Script sometimes returns HTML on error
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error('Google Apps Script returned an HTML error page. Check your deployment.');
      }

      const result = JSON.parse(text);

      if (!result.success) {
        throw new Error(result.error || 'Unknown API error');
      }

      return result;
    } catch (err) {
      console.error(`API ${action} failed:`, err);
      if (!silentError) {
        showToast(err.message || 'Something went wrong. Please try again.', 'error');
      }
      throw err;
    }
  }

  // ── Menu ──
  async function getMenu() {
    const CACHE_KEY = 'WIN_CACHE_MENU';
    const TIME_KEY = 'WIN_CACHE_MENU_TIME';
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(TIME_KEY);
    
    // STRICT CACHING: Use cache immediately if less than 15 minutes old (900000 ms)
    // Does NOT trigger background fetch, saving 1 API call
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 900000) {
      console.log('Serving Menu strictly from Cache (Saved 1 API call)');
      return JSON.parse(cached);
    }

    // Only fetch if cache is missing or expired
    const fetchPromise = request('GET', 'getMenu')
      .then(result => {
        if (result.data && result.data.length > 0) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
          localStorage.setItem(TIME_KEY, Date.now().toString());
        }
        return result.data || [];
      })
      .catch(err => {
        console.warn('[API] Menu fetch failed', err);
        return [];
      });

    return fetchPromise;
  }

  // ── Config ──
  async function getConfig() {
    const CACHE_KEY = 'WIN_CACHE_CONFIG';
    const TIME_KEY = 'WIN_CACHE_CONFIG_TIME';
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(TIME_KEY);
    
    // STRICT CACHING: Use cache immediately if less than 1 hour old (3600000 ms)
    // Does NOT trigger background fetch, saving 1 API call
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 3600000) {
      console.log('Serving Config strictly from Cache (Saved 1 API call)');
      return JSON.parse(cached);
    }

    // Only fetch if cache is missing or expired
    const fetchPromise = request('GET', 'getConfig').then(result => {
      if (result.data) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
        localStorage.setItem(TIME_KEY, Date.now().toString());
        if (result.data.restaurant_name) {
          localStorage.setItem('app_restaurant_name', result.data.restaurant_name);
          if (typeof window.applyBrandSettings === 'function') {
            window.applyBrandSettings();
          }
        }
      }
      return result.data || {};
    }).catch(err => {
      console.warn('[API] Config fetch failed', err);
      return {};
    });

    return await fetchPromise;
  }

  // ── Orders ──
  async function placeOrder(orderData) {
    const result = await request('POST', 'placeOrder', orderData);
    return result.data || {};
  }

  async function getOrders(status = '') {
    const params = {};
    if (status) params.status = status;
    const result = await request('GET', 'getOrders', params);
    return result.data || [];
  }

  async function getOrderStatus(orderId) {
    const result = await request('GET', 'getOrderStatus', { orderId });
    return result.data || {};
  }

  async function updateOrderStatus(orderId, status) {
    const result = await request('POST', 'updateOrderStatus', { orderId, status });
    return result.data || {};
  }

  // ── Menu Management ──
  async function addMenuItem(item) {
    const result = await request('POST', 'addMenuItem', item);
    return result.data || {};
  }

  async function updateMenuItem(item) {
    const result = await request('POST', 'updateMenuItem', item);
    return result.data || {};
  }

  async function deleteMenuItem(id) {
    const result = await request('POST', 'deleteMenuItem', { id });
    return result.data || {};
  }

  // ── Auth ──
  async function login(password) {
    const result = await request('POST', 'login', { password });
    return result.data || {};
  }

  // ── Dashboard ──
  async function getDashboard() {
    const result = await request('GET', 'getDashboard');
    return result.data || {};
  }

  // ── Waiter Calls ──
  async function callWaiter(table) {
    const result = await request('POST', 'callWaiter', { table });
    return result.data || {};
  }

  async function getWaiterCalls() {
    const result = await request('GET', 'getWaiterCalls');
    return result.data || [];
  }

  async function resolveWaiterCall(table) {
    const result = await request('POST', 'resolveWaiterCall', { table });
    return result.data || {};
  }

  // ── Order Cancellation ──
  /**
   * Cancel an order with full audit trail.
   * @param {string} orderId
   * @param {string} reason     — one of CONFIG.CANCEL_REASONS
   * @param {string} remarks    — required when reason === 'Other'
   * @param {string} cancelledBy  — display name of the person cancelling
   * @param {string} cancelledRole — one of CONFIG.ROLES
   * @param {string} refundStatus — one of CONFIG.REFUND_STATUS values
   */
  async function cancelOrder(orderId, reason, remarks, cancelledBy, cancelledRole, refundStatus = 'Not Required') {
    const result = await request('POST', 'cancelOrder', {
      orderId,
      reason,
      remarks,
      cancelledBy,
      cancelledRole,
      refundStatus,
      cancelledAt: new Date().toISOString(),
    });
    return result.data || {};
  }

  /**
   * Customer requests cancellation after order has been accepted.
   * Sets order status to 'Cancellation Requested' and logs the customer reason.
   * Admin must confirm the actual cancellation.
   * @param {string} orderId
   * @param {string} reason  — customer's reason (Duplicate Order / Changed Mind / etc.)
   * @param {string} customerName
   * @param {string} table
   */
  async function requestCancellation(orderId, reason, customerName, table) {
    const result = await request('POST', 'requestCancellation', {
      orderId,
      reason,
      customerName: customerName || 'Customer',
      table: table || '',
      requestedAt: new Date().toISOString(),
    });
    return result.data || {};
  }

  // ── Payment Management ──
  /**
   * Record / update payment for an order.
   * @param {string} orderId
   * @param {string} invoiceNo   — full invoice string e.g. "WINRMS | INV-20260625-4827"
   * @param {string} paymentMethod — 'UPI' | 'Cash'
   * @param {string} paymentStatus — one of CONFIG.PAYMENT_STATUS values
   * @param {string} transactionId — UPI transaction ref or empty string
   */
  async function updatePayment(orderId, invoiceNo, paymentMethod, paymentStatus, transactionId = '') {
    const result = await request('POST', 'updatePayment', {
      orderId,
      invoiceNo,
      paymentMethod,
      paymentStatus,
      transactionId,
      paidAt: new Date().toISOString(),
    });
    return result.data || {};
  }

  /**
   * Get payment status for an invoice or order.
   */
  async function getPaymentStatus(orderId) {
    const result = await request('GET', 'getPaymentStatus', { orderId }, true);
    return result.data || {};
  }

  /**
   * Get cancellation statistics for admin dashboard.
   */
  async function getCancellationStats() {
    const result = await request('GET', 'getCancellationStats', {}, true);
    return result.data || {};
  }

  /**
   * Notify cashier that a customer is waiting to pay cash.
   * @param {string} orderId
   * @param {string} table
   * @param {number} amount
   * @param {string} invoiceNo
   */
  async function notifyCashier(orderId, table, amount, invoiceNo) {
    const result = await request('POST', 'notifyCashier', {
      orderId,
      table,
      amount,
      invoiceNo,
    }, true);
    return result.data || {};
  }

  // ── Ad Ecosystem ──
  async function getAds(placement = '', category = '') {
    const CACHE_KEY = `WIN_CACHE_ADS_${placement}_${category}`;
    const TIME_KEY = `WIN_CACHE_ADS_TIME_${placement}_${category}`;
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(TIME_KEY);
    
    // STRICT CACHING: Use cache immediately if less than 1 hour old (3600000 ms)
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 3600000) {
      console.log(`Serving Ads strictly from Cache [${placement}] (Saved 1 API call)`);
      return JSON.parse(cached);
    }

    const params = {};
    if (placement) params.placement = placement;
    if (category) params.category = category;

    // Only fetch if cache is missing or expired
    const fetchPromise = request('GET', 'getAds', params, true)
      .then(result => {
        if (result.data) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
          localStorage.setItem(TIME_KEY, Date.now().toString());
        }
        return result.data || [];
      })
      .catch(err => {
        console.warn('[API] Ad fetch failed', err);
        return [];
      });

    return fetchPromise;
  }

  async function trackAdEvent(campaignId, placement, eventType = 'IMPRESSION') {
    const result = await request('POST', 'trackAdEvent', { campaignId, placement, eventType }, true);
    return result.data || {};
  }

  async function updateConfig(key, value) {
    const result = await request('POST', 'updateConfig', { key, value });
    return result.data || {};
  }

  return {
    getMenu,
    getConfig,
    updateConfig,
    placeOrder,
    getOrders,
    getOrderStatus,
    updateOrderStatus,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    login,
    getDashboard,
    callWaiter,
    getWaiterCalls,
    resolveWaiterCall,
    getAds,
    trackAdEvent,
    // ── New: Payment & Cancellation ──
    cancelOrder,
    requestCancellation,
    updatePayment,
    getPaymentStatus,
    getCancellationStats,
    notifyCashier,
  };
})();


/* ── Toast notification utility ── */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── Utility: Format currency ── */
function formatPrice(amount) {
  return `${CONFIG.CURRENCY}${Number(amount).toLocaleString('en-IN')}`;
}

/* ── Utility: Format date/time ── */
function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Utility: Generate unique ID ── */
function generateOrderId() {
  const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomChar = alphabets.charAt(Math.floor(Math.random() * alphabets.length));
  const randomNumber = Math.floor(Math.random() * 1000);
  const numberStr = String(randomNumber).padStart(3, '0');
  return `${randomChar}${numberStr}`;
}

/* ── Utility: Debounce ── */
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ── Utility: Ripple effect on buttons ── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

/* ── Utility: Button Loading State ── */
function setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalText) {
      btn.dataset.originalText = btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${loadingText}`;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    btn.style.pointerEvents = 'none';
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
    btn.style.opacity = '1';
    btn.style.cursor = '';
    btn.style.pointerEvents = '';
  }
}
