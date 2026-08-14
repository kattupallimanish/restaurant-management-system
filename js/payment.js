/* ============================================
   PAYMENT ENGINE — WINRMS
   Handles: UPI, QR, Cash, Receipt, Polling
   ============================================ */

const PaymentEngine = (() => {
  /* ── State ── */
  let currentOrder = null;
  let currentInvoice = null;
  let paymentMethod = null; // 'UPI' | 'Cash'
  let paymentState = 'none'; // none | awaiting | initiated | success | cash
  let pollTimer = null;
  let notificationSent = false;

  /* ── Detect mobile device ── */
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /* ── Build UPI deep-link URL ── */
  function buildUpiUrl(invoiceNo, amount) {
    const pa = CONFIG.UPI_ID;
    const pn = encodeURIComponent(CONFIG.UPI_NAME);
    const am = Number(amount).toFixed(2);
    const cu = 'INR';
    const tn = encodeURIComponent(invoiceNo);
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`;
  }

  /* ── Check if invoice is already paid (localStorage guard) ── */
  function isAlreadyPaid(invoiceNo) {
    try {
      const paidInvoices = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PAID_INVOICES) || '{}');
      return !!paidInvoices[invoiceNo];
    } catch {
      return false;
    }
  }

  /* ── Mark invoice as paid locally ── */
  function markPaidLocally(invoiceNo, method) {
    try {
      const paidInvoices = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PAID_INVOICES) || '{}');
      paidInvoices[invoiceNo] = {
        method,
        paidAt: new Date().toISOString(),
      };
      localStorage.setItem(CONFIG.STORAGE_KEYS.PAID_INVOICES, JSON.stringify(paidInvoices));
    } catch (e) {
      console.warn('Could not persist paid invoice:', e);
    }
  }

  /* ── Generate QR code using qrcode-generator lib (CDN) ── */
  function renderQrCode(containerId, upiUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Use qrcode-generator if available, else show fallback
    if (typeof qrcode !== 'undefined') {
      const qr = qrcode(0, 'M');
      qr.addData(upiUrl);
      qr.make();

      const cellSize = 6;
      const margin = 2;
      const size = (qr.getModuleCount() + margin * 2) * cellSize;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.id = 'qr-code-canvas';
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // Draw QR modules
      ctx.fillStyle = '#000000';
      const modules = qr.getModuleCount();
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(
              (col + margin) * cellSize,
              (row + margin) * cellSize,
              cellSize,
              cellSize
            );
          }
        }
      }

      container.innerHTML = '';
      container.appendChild(canvas);
    } else {
      // Fallback: show QR API image
      container.innerHTML = `
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}&bgcolor=ffffff&color=000000&margin=2"
             alt="UPI QR Code"
             style="width:200px; height:200px; border-radius:8px;"
             loading="lazy">
      `;
    }
  }

  /* ── Render Receipt HTML ── */
  function renderReceipt(order, invoiceNo, method, paidAt) {
    const receiptCard = document.getElementById('receipt-card');
    if (!receiptCard) return;

    const items = (order.items || []);
    const timeStr = paidAt ? formatDate(paidAt) + ' ' + formatTime(paidAt) : formatDate(order.timestamp) + ' ' + formatTime(order.timestamp);
    const tableStr = String(order.table).toLowerCase() === 'takeaway' ? 'Take Away' : `Table ${order.table}`;
    const methodIcon = method === 'UPI' ? '📱' : '💵';
    const brandName = localStorage.getItem('app_restaurant_name') || 'WIN Restaurant';

    receiptCard.innerHTML = `
      <div class="receipt-printable" id="receipt-printable">
        <div class="receipt-header">
          <div class="receipt-logo">🍽️ ${brandName}</div>
          <div class="receipt-tagline">Tax Invoice / Receipt</div>
          <div class="receipt-invoice-no">${invoiceNo}</div>
        </div>

        <div class="receipt-rows">
          <div class="receipt-row">
            <span class="receipt-row-label">Order ID</span>
            <span class="receipt-row-value">#${order.orderId}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-row-label">Table / Order Type</span>
            <span class="receipt-row-value">${tableStr}</span>
          </div>
          ${order.customerName ? `
          <div class="receipt-row">
            <span class="receipt-row-label">Customer</span>
            <span class="receipt-row-value">${order.customerName}</span>
          </div>` : ''}
          <div class="receipt-row">
            <span class="receipt-row-label">Payment Method</span>
            <span class="receipt-row-value">${methodIcon} ${method}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-row-label">Payment Status</span>
            <span class="receipt-status-badge"><i class="fa-solid fa-circle-check"></i> Paid</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-row-label">Transaction Time</span>
            <span class="receipt-row-value">${timeStr}</span>
          </div>
        </div>

        <hr class="receipt-divider">

        <div style="margin: var(--sp-3) 0;">
          <div style="font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--clr-text-secondary); margin-bottom: var(--sp-3); text-transform: uppercase; letter-spacing: 0.5px;">
            Order Items
          </div>
          ${items.map(item => `
            <div class="receipt-row" style="margin-bottom: var(--sp-2);">
              <span class="receipt-row-label">${item.qty}× ${item.name}</span>
              <span class="receipt-row-value">${formatPrice(item.price * item.qty)}</span>
            </div>
          `).join('')}
        </div>

        <div class="receipt-total-row">
          <span>Grand Total</span>
          <span class="receipt-total-amount">${formatPrice(order.total)}</span>
        </div>

        <div class="receipt-footer-text">
          Thank you for dining with us! 🙏<br>
          ${brandName} — Quality Food, Happy Dining
        </div>
      </div>

      <div class="receipt-actions">
        <button class="receipt-btn download" onclick="PaymentEngine.downloadReceipt()">
          <i class="fa-solid fa-download"></i> Download
        </button>
        <button class="receipt-btn print" onclick="PaymentEngine.printReceipt()">
          <i class="fa-solid fa-print"></i> Print
        </button>
      </div>
    `;

    receiptCard.classList.add('active');
  }

  /* ── Download receipt as HTML file ── */
  function downloadReceipt() {
    const printable = document.getElementById('receipt-printable');
    if (!printable) return;

    const content = printable.innerText;
    const lines = content.split('\n').filter(l => l.trim());
    const formatted = lines.join('\n');

    const dateStr = new Date().toISOString().split('T')[0];
    const blob = new Blob([`WINRMS Payment Receipt\n${'='.repeat(40)}\n${formatted}`], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `WINRMS_Receipt_${currentOrder?.orderId || 'order'}_${dateStr}.txt`;
    link.click();
    showToast('Receipt downloaded!', 'success');
  }

  /* ── Print receipt ── */
  function printReceipt() {
    window.print();
  }

  /* ── Poll for UPI payment confirmation ── */
  async function startPaymentPolling(orderId, invoiceNo) {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
      try {
        const payStatus = await API.getPaymentStatus(orderId);

        if (payStatus.paymentStatus === CONFIG.PAYMENT_STATUS.SUCCESS ||
            payStatus.status === 'Paid') {
          clearInterval(pollTimer);
          markPaidLocally(invoiceNo, 'UPI');
          onPaymentSuccess(payStatus.paidAt || new Date().toISOString(), 'UPI');
        }
      } catch (e) {
        // Silently ignore polling errors
        console.debug('[PaymentEngine] Poll error (silent):', e.message);
      }
    }, CONFIG.POLL_INTERVAL);
  }

  /* ── Called when payment is confirmed ── */
  function onPaymentSuccess(paidAt, method) {
    paymentState = 'success';
    if (pollTimer) clearInterval(pollTimer);

    // Hide payment panels
    document.querySelectorAll('.upi-panel, .cash-panel').forEach(el => el.classList.remove('active'));

    // Update status display
    const statusEl = document.getElementById('payment-status-display');
    if (statusEl) {
      statusEl.className = 'payment-status-display success';
      statusEl.innerHTML = `
        <span class="payment-status-icon"><i class="fa-solid fa-circle-check"></i></span>
        <div>
          <div style="font-weight: var(--fw-bold);">Payment Successful!</div>
          <div style="font-size: var(--fs-xs); opacity: 0.8;">${method} • ${formatDate(paidAt)} ${formatTime(paidAt)}</div>
        </div>
      `;
    }

    // Show success toast
    showToast('Payment confirmed! 🎉 Redirecting...', 'success', 3000);

    // Fire confetti
    if (typeof launchConfetti === 'function') launchConfetti();

    // Redirect to Order Status
    setTimeout(() => {
      window.location.href = `../order-status/?id=${currentOrder.orderId}`;
    }, 1500);
  }

  /* ── Initialize payment page ── */
  async function initPaymentPage() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id') || localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_ORDER);

    if (!orderId) {
      showPageError('No order found. Please place an order first.');
      return;
    }

    // Show loading
    const loadingEl = document.getElementById('payment-loading');
    const contentEl = document.getElementById('payment-content');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
      // Fetch order data
      currentOrder = await API.getOrderStatus(orderId);
    } catch (e) {
      // Demo data fallback
      currentOrder = {
        orderId: orderId,
        table: localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE) || 'T1',
        customerName: localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME) || 'Guest',
        items: [
          { name: 'Margherita Pizza', qty: 2, price: 299 },
          { name: 'Cold Coffee', qty: 1, price: 129 },
        ],
        total: 727,
        status: 'Delivered',
        timestamp: new Date().toISOString(),
      };
    }

    // Generate or retrieve invoice number
    currentInvoice = getOrCreateInvoiceNumber(orderId);

    // Check already paid
    if (isAlreadyPaid(currentInvoice)) {
      renderAlreadyPaid();
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
      return;
    }

    // Render invoice header
    renderInvoiceHeader();

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  }

  /* ── Render invoice header ── */
  function renderInvoiceHeader() {
    if (!currentOrder || !currentInvoice) return;

    const el = document.getElementById('invoice-display');
    if (!el) return;

    const brandName = localStorage.getItem('app_restaurant_name') || 'WIN Restaurant';
    const tableStr = String(currentOrder.table).toLowerCase() === 'takeaway' ? 'Take Away' : `Table ${currentOrder.table}`;

    el.innerHTML = `
      <div class="invoice-card">
        <div class="invoice-brand">
          <div class="invoice-brand-icon">🍽️</div>
          <div class="invoice-brand-text">
            <div class="invoice-brand-name">${brandName}</div>
            <div class="invoice-brand-tag">Official Invoice</div>
          </div>
        </div>
        <div class="invoice-number">${currentInvoice}</div>
        <div class="invoice-details">
          <div class="invoice-detail-row">
            <span class="invoice-detail-label">Order ID</span>
            <span class="invoice-detail-value">#${currentOrder.orderId}</span>
          </div>
          <div class="invoice-detail-row">
            <span class="invoice-detail-label">${tableStr.toLowerCase().includes('take') ? 'Order Type' : 'Table'}</span>
            <span class="invoice-detail-value">${tableStr}</span>
          </div>
          ${currentOrder.customerName ? `
          <div class="invoice-detail-row">
            <span class="invoice-detail-label">Customer</span>
            <span class="invoice-detail-value">${currentOrder.customerName}</span>
          </div>` : ''}
          <div class="invoice-detail-row full-width">
            <span class="invoice-detail-label">Amount Due</span>
            <span class="invoice-detail-value invoice-amount">${formatPrice(currentOrder.total)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Render already paid state ── */
  function renderAlreadyPaid() {
    const container = document.getElementById('payment-content');
    if (!container) return;

    const paidData = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PAID_INVOICES) || '{}');
    const info = paidData[currentInvoice] || {};
    const methodIcon = info.method === 'UPI' ? '📱' : '💵';

    container.innerHTML = `
      <div class="already-paid-banner">
        <div class="already-paid-icon"><i class="fa-solid fa-circle-check" style="color:white;"></i></div>
        <div class="already-paid-title">Already Paid</div>
        <p style="color: var(--clr-text-secondary); font-size: var(--fs-sm); margin: var(--sp-2) 0 var(--sp-4);">
          This invoice has already been settled.<br>
          <strong style="font-family: monospace; color: var(--clr-primary-300);">${currentInvoice}</strong>
        </p>
        ${info.method ? `<p style="font-size: var(--fs-xs); color: var(--clr-text-muted);">
          ${methodIcon} Paid via ${info.method} on ${info.paidAt ? formatDate(info.paidAt) + ' ' + formatTime(info.paidAt) : 'earlier'}
        </p>` : ''}
        <div style="margin-top: var(--sp-6);">
          <a href="../order-status/?id=${currentOrder?.orderId || ''}" class="btn btn--outline btn--full">
            <i class="fa-solid fa-receipt"></i> View Order Status
          </a>
        </div>
      </div>
    `;
  }

  /* ── Handle UPI Payment selection ── */
  function selectUpi() {
    paymentMethod = 'UPI';

    // Update card UI
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected', 'selected-cash'));
    const upiCard = document.getElementById('pm-upi-card');
    if (upiCard) upiCard.classList.add('selected');

    // Hide cash panel
    const cashPanel = document.getElementById('cash-panel');
    if (cashPanel) cashPanel.classList.remove('active');

    // Show UPI panel
    const upiPanel = document.getElementById('upi-panel');
    if (!upiPanel) return;
    upiPanel.classList.add('active');

    // Build UPI URL
    const upiUrl = buildUpiUrl(currentInvoice, currentOrder.total);

    // Update payment note
    const noteEl = document.getElementById('upi-payment-note');
    if (noteEl) noteEl.textContent = currentInvoice;

    // Always show deep-link button (QR code removed per request)
    const mobileBtn = document.getElementById('upi-mobile-btn');
    if (mobileBtn) {
      mobileBtn.href = upiUrl;
      mobileBtn.style.display = 'flex';
    }

    // Update status
    updatePaymentStatusDisplay('initiated');

    // Start polling
    startPaymentPolling(currentOrder.orderId, currentInvoice);

    // Log to API (async, don't await)
    API.updatePayment(
      currentOrder.orderId,
      currentInvoice,
      'UPI',
      CONFIG.PAYMENT_STATUS.INITIATED,
      ''
    ).catch(() => {});
  }

  /* ── Handle Cash Payment selection ── */
  function selectCash() {
    paymentMethod = 'Cash';

    // Update card UI
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected', 'selected-cash'));
    const cashCard = document.getElementById('pm-cash-card');
    if (cashCard) cashCard.classList.add('selected-cash');

    // Hide UPI panel
    const upiPanel = document.getElementById('upi-panel');
    if (upiPanel) upiPanel.classList.remove('active');

    // Show cash panel
    const cashPanel = document.getElementById('cash-panel');
    if (!cashPanel) return;
    cashPanel.classList.add('active');

    // Populate cash panel
    const cashInvoice = document.getElementById('cash-invoice-no');
    const cashOrder = document.getElementById('cash-order-no');
    const cashAmount = document.getElementById('cash-amount');
    const cashMethod = document.getElementById('cash-method');
    if (cashInvoice) cashInvoice.textContent = currentInvoice;
    if (cashOrder) cashOrder.textContent = `#${currentOrder.orderId}`;
    if (cashAmount) cashAmount.textContent = formatPrice(currentOrder.total);
    if (cashMethod) cashMethod.textContent = 'Cash Payment';

    updatePaymentStatusDisplay('cash');

  }

  /* ── Notify cashier ── */
  async function notifyCashier() {
    const btn = document.getElementById('notify-cashier-btn');
    setButtonLoading(btn, true, 'Notifying...');

    try {
      // Actually update the payment status so the polling dashboard catches it!
      await API.updatePayment(
        currentOrder.orderId,
        currentInvoice,
        'Cash',
        CONFIG.PAYMENT_STATUS.AWAITING_CASH,
        ''
      );

      try {
        await API.notifyCashier(
          currentOrder.orderId,
          currentOrder.table,
          currentOrder.total,
          currentInvoice
        );
      } catch (err) {
        // notifyCashier might not be implemented in the backend yet, ignore
        console.warn('notifyCashier direct ping failed, relying on polling.');
      }
      
      showToast('Cashier has been notified! Please wait.', 'success');
      notificationSent = true;

      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Cashier Notified';
        btn.style.background = 'var(--clr-success)';
      }
    } catch (e) {
      showToast('Notification sent! (Demo mode)', 'info');
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Notified (Demo)';
        btn.disabled = false;
      }
    }
  }

  /* ── Mark cash paid (for cashier admin confirmation flow) ── */
  async function confirmCashPayment() {
    try {
      markPaidLocally(currentInvoice, 'Cash');
      await API.updatePayment(
        currentOrder.orderId,
        currentInvoice,
        'Cash',
        CONFIG.PAYMENT_STATUS.CASH_RECEIVED,
        ''
      );
      onPaymentSuccess(new Date().toISOString(), 'Cash');
    } catch (e) {
      // Demo mode
      markPaidLocally(currentInvoice, 'Cash');
      onPaymentSuccess(new Date().toISOString(), 'Cash');
    }
  }

  /* ── Update payment status display element ── */
  function updatePaymentStatusDisplay(state) {
    const el = document.getElementById('payment-status-display');
    if (!el) return;

    const states = {
      awaiting: { cls: 'awaiting', icon: 'fa-hourglass-half', text: 'Awaiting Payment', sub: '' },
      initiated: { cls: 'initiated', icon: 'fa-spinner fa-spin', text: 'Payment Initiated', sub: 'Waiting for payment confirmation…' },
      cash: { cls: 'cash', icon: 'fa-money-bill-wave', text: 'Awaiting Cash Payment', sub: 'Please proceed to the counter' },
      success: { cls: 'success', icon: 'fa-circle-check', text: 'Payment Successful!', sub: '' },
      failed: { cls: 'failed', icon: 'fa-circle-xmark', text: 'Payment Failed', sub: 'Please try again' },
    };

    const s = states[state] || states.awaiting;
    el.className = `payment-status-display ${s.cls}`;
    el.innerHTML = `
      <span class="payment-status-icon"><i class="fa-solid ${s.icon}"></i></span>
      <div>
        <div style="font-weight: var(--fw-bold);">${s.text}</div>
        ${s.sub ? `<div style="font-size: var(--fs-xs); opacity: 0.8;">${s.sub}</div>` : ''}
      </div>
    `;
  }

  function showPageError(msg) {
    const el = document.getElementById('payment-content');
    if (el) {
      el.style.display = 'block';
      el.innerHTML = `
        <div style="text-align:center; padding: var(--sp-16) var(--sp-6);">
          <div style="font-size: 3rem; margin-bottom: var(--sp-4);">😕</div>
          <h3 style="color: var(--clr-text-secondary);">${msg}</h3>
          <a href="../" class="btn btn--outline" style="margin-top: var(--sp-6);">
            <i class="fa-solid fa-arrow-left"></i> Go Back
          </a>
        </div>
      `;
    }
  }

  return {
    initPaymentPage,
    selectUpi,
    selectCash,
    notifyCashier,
    confirmCashPayment,
    downloadReceipt,
    printReceipt,
    renderReceipt,
    isAlreadyPaid,
    isMobile,
  };
})();
