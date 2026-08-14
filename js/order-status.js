/* ============================================
   ORDER STATUS — Tracking logic
   ============================================ */

(() => {
  const STATUS_MESSAGES = {
    'New':                    { emoji: '<i class="fa-solid fa-file-signature"></i>',    text: 'Your order has been received! Waiting for the restaurant to accept.' },
    'Accepted':               { emoji: '<i class="fa-solid fa-circle-check"></i>',      text: 'Great news! The restaurant has accepted your order.' },
    'Preparing':              { emoji: '<i class="fa-solid fa-kitchen-set"></i>',        text: 'Your food is being prepared with love!' },
    'Ready':                  { emoji: '<i class="fa-solid fa-bell"></i>',               text: 'Your order is ready! It will be served shortly.' },
    'Delivered':              { emoji: '<i class="fa-solid fa-champagne-glasses"></i>', text: 'Enjoy your meal! Please pay at the counter or wait for server.' },
    'Paid':                   { emoji: '<i class="fa-solid fa-credit-card"></i>',        text: 'Thank you! Your payment has been received successfully.' },
    'Rejected':               { emoji: '<i class="fa-solid fa-face-frown"></i>',         text: 'Sorry, the restaurant could not fulfill this order.' },
    'Cancellation Requested': { emoji: '<i class="fa-solid fa-clock-rotate-left"></i>', text: 'Your cancellation request has been submitted. The admin will process it shortly.' },
    'Cancelled':              { emoji: '<i class="fa-solid fa-ban"></i>',                text: 'Your order has been cancelled.' },
  };

  let orderId       = '';
  let pollTimer     = null;
  let currentStatus = '';
  let confettiFired  = false;
  let redirectScheduled = false;

  // DOM refs
  const statusLoading    = document.getElementById('status-loading');
  const statusContent    = document.getElementById('status-content');
  const statusTitle      = document.getElementById('status-title');
  const orderIdDisplay   = document.getElementById('order-id-display');
  const orderTableInfo   = document.getElementById('order-table-info');
  const orderCustomerInfo= document.getElementById('order-customer-info');
  const statusIconArea   = document.getElementById('status-icon-area');
  const stepperFill      = document.getElementById('stepper-fill');
  const statusMessage    = document.getElementById('status-message');
  const orderItemsList   = document.getElementById('order-items-list');
  const orderTotal       = document.getElementById('order-total');
  const orderNotesDisplay= document.getElementById('order-notes-display');
  const orderAgainBtn    = document.getElementById('order-again-btn');
  const refreshIndicator = document.getElementById('refresh-indicator');

  async function init() {
    const params = new URLSearchParams(window.location.search);
    orderId = params.get('id') || localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_ORDER);
    if (!orderId) { showError('No order found. Please place an order first.'); return; }

    const tableNo = localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE) || 'T1';
    if (orderAgainBtn) orderAgainBtn.href = `../menu/?t=${tableNo}`;

    await fetchStatus();
    pollTimer = setInterval(fetchStatus, CONFIG.POLL_INTERVAL);
  }

  const fetchStatus = async function () {
    try {
      const order = await API.getOrderStatus(orderId);
      renderOrder(order);
    } catch (err) {
      console.warn('Could not fetch order status:', err.message);
      if (!currentStatus) {
        renderOrder({
          orderId: orderId || 'A492',
          table: localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE) || 'T1',
          customerName: localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME) || 'Guest',
          mobileNumber: '',
          items: [
            { name: 'Margherita Pizza', qty: 2, price: 299 },
            { name: 'Veg Burger', qty: 1, price: 149 },
            { name: 'Cold Coffee', qty: 2, price: 129 },
          ],
          total: 1005,
          status: 'Preparing',
          timestamp: new Date().toISOString(),
          notes: 'Extra cheese please',
          cancel_reason: '',
        });
      }
    }
  };

  // Expose for cancel buttons
  window.fetchStatus = fetchStatus;

  function renderOrder(order) {
    statusLoading.style.display = 'none';
    statusContent.style.display = 'block';

    currentStatus = order.status;

    const stepperEl = document.getElementById('stepper');
    const itemsCard  = document.getElementById('order-items-card');

    /* ── Icon & Title ── */
    if (order.status === 'Rejected') {
      statusTitle.textContent = 'Order Rejected';
      statusIconArea.innerHTML = '<div class="rejected-icon">✕</div>';
      if (stepperEl) stepperEl.style.display = 'none';
    } else if (order.status === 'Cancelled') {
      statusTitle.textContent = 'Order Cancelled';
      statusIconArea.innerHTML = '<div class="rejected-icon" style="background:linear-gradient(135deg,hsl(0,60%,38%),hsl(0,75%,52%));"><i class="fa-solid fa-ban"></i></div>';
      if (stepperEl) stepperEl.style.display = 'none';
    } else if (order.status === 'Cancellation Requested') {
      statusTitle.textContent = 'Cancellation Requested';
      statusIconArea.innerHTML = '<div class="success-icon" style="background:linear-gradient(135deg,hsl(25,90%,44%),hsl(45,95%,50%));"><i class="fa-solid fa-clock-rotate-left"></i></div>';
      if (stepperEl) stepperEl.style.display = '';
    } else if (order.status === 'Paid') {
      statusTitle.textContent = 'Payment Completed!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    } else if (order.status === 'Delivered') {
      statusTitle.textContent = 'Order Delivered!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    } else if (order.status === 'Ready') {
      statusTitle.textContent = 'Order Ready!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    } else if (order.status === 'Preparing') {
      statusTitle.textContent = 'Preparing Your Food!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    } else if (order.status === 'Accepted') {
      statusTitle.textContent = 'Order Accepted!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    } else {
      statusTitle.textContent = 'Order Placed!';
      statusIconArea.innerHTML = '<div class="success-icon">✓</div>';
    }

    /* ── Sub-header ── */
    orderIdDisplay.textContent = `Order #${order.orderId}`;
    if (String(order.table).toLowerCase() === 'takeaway') {
      orderTableInfo.textContent = `Take Away • ${formatTime(order.timestamp)}`;
    } else {
      orderTableInfo.textContent = `Table ${order.table} • ${formatTime(order.timestamp)}`;
    }
    if (order.customerName || order.mobileNumber) {
      orderCustomerInfo.textContent = `Customer: ${order.customerName || 'Guest'} (${order.mobileNumber || ''})`;
      orderCustomerInfo.style.display = 'block';
    } else {
      orderCustomerInfo.style.display = 'none';
    }
    document.title = `Order #${order.orderId} — ${order.status}`;

    /* ── Stepper (only for normal flow) ── */
    if (!['Rejected', 'Cancelled'].includes(order.status)) {
      if (stepperEl) stepperEl.style.display = '';
      if (order.status !== 'Cancellation Requested') {
        let stepperStatus = order.status === 'Paid' ? 'Delivered' : order.status;
        const stepperSteps = ['New', 'Accepted', 'Preparing', 'Ready', 'Delivered'];
        const stepIdx = stepperSteps.indexOf(stepperStatus);
        const fillPercent = stepIdx >= 0 ? (stepIdx / (stepperSteps.length - 1)) * 100 : 0;
        if (stepperFill) stepperFill.style.width = `${fillPercent}%`;
        document.querySelectorAll('.stepper-step').forEach((step, i) => {
          step.classList.remove('completed', 'active');
          if (i < stepIdx) step.classList.add('completed');
          if (i === stepIdx) step.classList.add('active');
        });
      }
    }

    /* ── Status Message ── */
    let msgText = STATUS_MESSAGES[order.status]?.text || '';
    if (order.status === 'Ready') {
      msgText = String(order.table).toLowerCase() === 'takeaway'
        ? 'Your order is ready! Please pick it up at the counter.'
        : `Your order is ready! Waiter is bringing it to Table ${order.table}.`;
    }
    const msgEmoji = STATUS_MESSAGES[order.status]?.emoji || '<i class="fa-solid fa-hourglass-half"></i>';
    statusMessage.innerHTML = `<div class="emoji">${msgEmoji}</div><div class="text">${msgText}</div>`;

    /* ── Pay at Counter alert ── */
    const paymentAlertEl = document.getElementById('payment-alert');
    if (paymentAlertEl) paymentAlertEl.style.display = order.status === 'Delivered' ? 'flex' : 'none';



    /* ── Order Items ── */
    if (itemsCard) itemsCard.style.display = ['Cancelled', 'Rejected'].includes(order.status) ? 'none' : '';
    if (order.items && order.items.length > 0) {
      orderItemsList.innerHTML = order.items.map(item => `
        <div class="order-item-row">
          <div class="order-item-name">
            <span class="order-item-qty">${item.qty}×</span> ${item.name}
          </div>
          <span class="order-item-price">${formatPrice(item.price * item.qty)}</span>
        </div>
      `).join('');
    }
    const billDateEl = document.getElementById('bill-date');
    if (billDateEl) billDateEl.textContent = formatDate(order.timestamp) + ' ' + formatTime(order.timestamp);
    orderTotal.textContent = formatPrice(order.total);
    if (order.notes) {
      orderNotesDisplay.style.display = 'block';
      orderNotesDisplay.innerHTML = `<i class="fa-solid fa-file-signature"></i> ${order.notes}`;
    }

    /* ── Stop polling on terminal states ── */
    if (['Paid', 'Rejected', 'Cancelled'].includes(order.status)) {
      if (pollTimer) clearInterval(pollTimer);
      if (refreshIndicator) refreshIndicator.style.display = 'none';
    }

    /* ── Cancel / Request Area (key new logic) ── */
    updateCancelArea(order);

    /* ── Auto-redirect when Cancelled ── */
    if (order.status === 'Cancelled' && !redirectScheduled) {
      redirectScheduled = true;
      scheduleMenuRedirect(order.table || localStorage.getItem(CONFIG.STORAGE_KEYS.TABLE) || 'T1');
    }

    /* ── Ad Placements ── */
    if (typeof AdEcosystem !== 'undefined') {
      const statusAdContainer = document.getElementById('status-ad-container');
      const billAdContainer   = document.getElementById('bill-ad-container');
      if (order.status === 'Paid') {
        if (statusAdContainer) statusAdContainer.style.display = 'none';
        if (billAdContainer)   { billAdContainer.style.display = 'block'; AdEcosystem.injectBillAd(billAdContainer); }
      } else if (!['Rejected', 'Cancelled'].includes(order.status)) {
        if (billAdContainer)   billAdContainer.style.display = 'none';
        if (statusAdContainer) { statusAdContainer.style.display = 'block'; AdEcosystem.injectOrderTracking(statusAdContainer); }
      } else {
        if (statusAdContainer) statusAdContainer.style.display = 'none';
        if (billAdContainer)   billAdContainer.style.display = 'none';
      }
    }

    /* ── Confetti on Payment ── */
    if (order.status === 'Paid' && !confettiFired) {
      confettiFired = true;
      launchConfetti();
    }
  }

  /* ═══════════════════════════════════════
     CANCEL AREA — Customer-side UX
  ═══════════════════════════════════════ */

  function updateCancelArea(order) {
    const cancelArea = document.getElementById('cancel-order-area');
    if (!cancelArea) return;

    if (order.status === 'New') {
      /* Before admin accepts — customer can self-cancel instantly */
      cancelArea.innerHTML = `
        <button class="btn btn--sm btn--trigger-cancel" id="self-cancel-btn" style="width:100%; justify-content:center; margin-bottom:var(--sp-2);">
          <i class="fa-solid fa-ban"></i> Cancel Order
        </button>
      `;
      document.getElementById('self-cancel-btn')?.addEventListener('click', () => {
        CancellationEngine.openDialog(
          { orderId: order.orderId, status: order.status, table: order.table, total: order.total },
          CONFIG.ROLES.CUSTOMER,
          async () => { showToast('Your order has been cancelled.', 'error'); await fetchStatus(); }
        );
      });

    } else if (['Accepted'].includes(order.status)) {
      /* After admin accepts — customer can only REQUEST; admin decides */
      if (!cancelArea.querySelector('.cancel-request-form-box')) {
        cancelArea.innerHTML = buildRequestCancelForm();
        attachRequestCancelListeners(order);
      }

    } else if (order.status === 'Cancellation Requested') {
      /* Waiting for admin to act */
      cancelArea.innerHTML = `
        <div class="cancellation-pending-state">
          <div class="cancel-pending-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <div class="cancel-pending-title">Cancellation Request Submitted</div>
          <div class="cancel-pending-text">
            The restaurant admin is reviewing your request.<br>
            You'll be notified here once it's processed.
          </div>
        </div>
      `;

    } else if (order.status === 'Delivered' || order.status === 'Ready') {
      if (order.paymentStatus === 'Payment Initiated') {
        cancelArea.innerHTML = `
          <div class="payment-prompt" style="background: hsla(36, 95%, 50%, 0.1); border: 1.5px dashed var(--clr-primary); border-radius: var(--radius-lg); padding: var(--sp-5) var(--sp-4); text-align: center; margin-bottom: var(--sp-4); animation: slideUp 400ms ease;">
            <div style="font-size: 2.5rem; color: var(--clr-primary); margin-bottom: var(--sp-2);">
              <i class="fa-solid fa-hourglass-half fa-spin-pulse"></i>
            </div>
            <h4 style="color: var(--clr-primary); margin-bottom: var(--sp-2); font-size: var(--fs-md); font-weight: var(--fw-bold);">Payment Verifying</h4>
            <p style="font-size: var(--fs-sm); color: var(--clr-text-secondary); margin-bottom: 0; line-height: 1.5;">
              Waiting for the cashier to verify your payment. Please do not close this screen.
            </p>
          </div>
        `;
      } else {
        /* Order is served/ready — Customer can Pay Now */
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const invoiceNo = `${CONFIG.INVOICE_PREFIX} | INV-${dateStr}-${order.orderId}`;
        const upiUrl = `upi://pay?pa=${CONFIG.UPI_ID}&pn=${encodeURIComponent(CONFIG.UPI_NAME)}&tr=${invoiceNo}&am=${order.total}&cu=INR&tn=${encodeURIComponent(`Order #${order.orderId}`)}`;
        
        cancelArea.innerHTML = `
          <div class="payment-prompt" style="background: hsla(152,70%,45%,0.08); border: 1.5px dashed var(--clr-success); border-radius: var(--radius-lg); padding: var(--sp-5) var(--sp-4); text-align: center; margin-bottom: var(--sp-4); animation: slideUp 400ms ease;">
            <div style="font-size: 2.5rem; color: var(--clr-success); margin-bottom: var(--sp-2);">
              <i class="fa-solid fa-money-bill-wave"></i>
            </div>
            <h4 style="color: var(--clr-success); margin-bottom: var(--sp-2); font-size: var(--fs-md); font-weight: var(--fw-bold);">Payment Due</h4>
            <p style="font-size: var(--fs-sm); color: var(--clr-text-secondary); margin-bottom: var(--sp-4); line-height: 1.5;">
              Please reach the cash counter to pay offline, or click the button below to pay using UPI.
            </p>
            <button class="btn btn--primary btn--full" onclick="initiateUpiPayment('${order.orderId}', '${invoiceNo}', '${upiUrl}')" style="background: var(--clr-success); border-color: var(--clr-success); font-size: var(--fs-base); padding: var(--sp-3); box-shadow: 0 4px 15px hsla(152,70%,45%,0.3);">
              <i class="fa-solid fa-qrcode"></i> Pay Now using UPI
            </button>
          </div>
        `;
      }

    } else {
      /* Cancelled, Rejected, Paid — no action needed */
      cancelArea.innerHTML = '';
    }
  }

  function buildRequestCancelForm() {
    return `
      <div class="cancel-request-form-box">
        <div class="cancel-request-form-title">
          <i class="fa-solid fa-hand-point-up"></i> Need to cancel your order?
        </div>
        <p style="font-size:var(--fs-xs); color:var(--clr-text-muted); margin:0 0 var(--sp-3);">
          Your order is in progress. You can submit a request — the admin will review and confirm cancellation.
        </p>
        <div id="cancel-request-idle">
          <button id="show-request-form-btn" class="btn btn--sm" style="width:100%; color:hsl(25,90%,55%); border:1.5px solid hsla(25,90%,55%,0.45); background:transparent; justify-content:center;">
            <i class="fa-solid fa-triangle-exclamation"></i> Request Cancellation
          </button>
        </div>
        <div id="cancel-request-form" style="display:none;">
          <label style="font-size:var(--fs-xs); font-weight:var(--fw-semibold); color:var(--clr-text-secondary); margin-bottom:var(--sp-2); display:block;">
            Reason for cancellation <span style="color:var(--clr-error)">*</span>
          </label>
          <select id="cancel-request-reason" style="width:100%; margin-bottom:var(--sp-3); padding:var(--sp-2) var(--sp-3); border-radius:var(--radius-md); border:1px solid var(--clr-border); background:var(--clr-bg-elevated); color:var(--clr-text-primary); font-size:var(--fs-sm); font-family:var(--font-body);">
            <option value="">— Select a reason —</option>
            <option value="Duplicate Order">Duplicate Order</option>
            <option value="Changed Mind">Changed Mind</option>
            <option value="Wrong Item Selected">Wrong Item Selected</option>
            <option value="Taking Too Long">Taking Too Long</option>
            <option value="Other">Other</option>
          </select>
          <textarea id="cancel-request-other" placeholder="Please describe your reason..." style="display:none; width:100%; min-height:70px; margin-bottom:var(--sp-3); padding:var(--sp-2) var(--sp-3); border-radius:var(--radius-md); border:1px solid var(--clr-border); background:var(--clr-bg-elevated); color:var(--clr-text-primary); font-size:var(--fs-sm); font-family:var(--font-body); resize:vertical;" maxlength="200"></textarea>
          <div style="display:flex; gap:var(--sp-2);">
            <button id="submit-cancel-request-btn" class="btn btn--sm btn--trigger-cancel" style="flex:1; justify-content:center;">
              <i class="fa-solid fa-paper-plane"></i> Submit Request
            </button>
            <button id="cancel-cancel-request-btn" class="btn btn--sm btn--ghost" style="flex:1; justify-content:center;">
              Go Back
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachRequestCancelListeners(order) {
    document.getElementById('show-request-form-btn')?.addEventListener('click', () => {
      document.getElementById('cancel-request-idle').style.display = 'none';
      document.getElementById('cancel-request-form').style.display = 'block';
    });
    document.getElementById('cancel-cancel-request-btn')?.addEventListener('click', () => {
      document.getElementById('cancel-request-idle').style.display = 'block';
      document.getElementById('cancel-request-form').style.display = 'none';
    });
    document.getElementById('cancel-request-reason')?.addEventListener('change', e => {
      const other = document.getElementById('cancel-request-other');
      if (other) other.style.display = e.target.value === 'Other' ? 'block' : 'none';
    });
    document.getElementById('submit-cancel-request-btn')?.addEventListener('click', async () => {
      const reason    = document.getElementById('cancel-request-reason')?.value;
      const otherText = document.getElementById('cancel-request-other')?.value?.trim();
      if (!reason) { showToast('Please select a reason for cancellation.', 'warning'); return; }
      const finalReason = reason === 'Other' ? (otherText || 'Other') : reason;

      const btn = document.getElementById('submit-cancel-request-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; }

      try {
        await API.requestCancellation(
          order.orderId,
          finalReason,
          localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME) || 'Customer',
          order.table
        );
        showToast('Cancellation request submitted! The admin will confirm shortly.', 'success', 5000);
        await fetchStatus();
      } catch (err) {
        showToast('Could not submit request. Please call a waiter for assistance.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Request'; }
      }
    });
  }

  function scheduleMenuRedirect(table) {
    const cancelArea = document.getElementById('cancel-order-area');
    let countdown = 5;
    if (cancelArea) {
      cancelArea.innerHTML = `
        <div class="cancel-redirect-countdown">
          <i class="fa-solid fa-arrow-rotate-right"></i>
          Redirecting to menu in <strong><span id="redirect-countdown">5</span>s</strong>&hellip;
        </div>
      `;
    }
    const timer = setInterval(() => {
      countdown--;
      const el = document.getElementById('redirect-countdown');
      if (el) el.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(timer);
        window.location.href = `../menu/?t=${table}`;
      }
    }, 1000);
  }

  /* ═══════════════════════════════════════
     ERROR STATE
  ═══════════════════════════════════════ */
  function showError(message) {
    statusLoading.style.display = 'none';
    statusContent.style.display = 'block';
    statusIconArea.innerHTML = '<div class="rejected-icon">?</div>';
    statusTitle.textContent = 'Oops!';
    orderIdDisplay.textContent = message;
    document.getElementById('stepper').style.display = 'none';
    statusMessage.style.display = 'none';
    document.getElementById('order-items-card').style.display = 'none';
    refreshIndicator.style.display = 'none';
  }

  /* ═══════════════════════════════════════
     CONFETTI
  ═══════════════════════════════════════ */
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const colors = ['#e8a317', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: canvas.width / 2, y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.7) * 15,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 3,
        rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.15 + Math.random() * 0.1, opacity: 1,
      });
    }
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
        p.rotation += p.rotSpeed; p.opacity -= 0.008;
        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });
      if (alive) requestAnimationFrame(animate);
    }
    animate();
  }

  window.initiateUpiPayment = async function(orderId, invoiceNo, upiUrl) {
    try {
      // Set the payment status to "Payment Initiated"
      await API.updatePayment(orderId, invoiceNo, 'UPI', 'Payment Initiated', '');
      
      // Attempt to open the UPI app intent
      window.location.href = upiUrl;
      
      // We don't need to do anything else here. The page's auto-refresh
      // will fetch the updated status in a few seconds and switch the UI
      // to the "Payment Verifying" spinner screen automatically!
    } catch (e) {
      console.error('Failed to initiate payment', e);
      alert('Failed to initiate payment. Please try again or pay at the counter.');
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
