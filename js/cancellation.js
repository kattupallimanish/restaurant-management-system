/* ============================================
   CANCELLATION ENGINE — WINRMS
   Role-based permissions, audit logging,
   confirmation dialog, notifications
   ============================================ */

const CancellationEngine = (() => {
  /* ── State ── */
  let currentOrder = null;
  let currentRole = null;
  let onSuccessCallback = null;

  /* ── DOM References ── */
  const getEl = id => document.getElementById(id);

  /* ── Cancellation reasons per role ── */
  function getReasonsForRole(role) {
    if (CONFIG.PRIVILEGED_ROLES.includes(role)) {
      return CONFIG.CANCEL_REASONS;
    }
    if (role === CONFIG.ROLES.CASHIER) {
      return CONFIG.CASHIER_CANCEL_REASONS;
    }
    // Customer
    return ['Customer Requested', 'Changed Mind', 'Duplicate Order', 'Other'];
  }

  /* ── Open cancellation dialog ── */
  function openDialog(order, role, onSuccess) {
    currentOrder = order;
    currentRole = role || getCurrentRole();
    onSuccessCallback = onSuccess || null;

    // Build dialog if not present
    if (!getEl('cancel-modal-backdrop')) {
      buildDialog();
    }

    // Populate order info in dialog
    const orderRef = getEl('cancel-order-ref');
    if (orderRef) {
      orderRef.textContent = `Order #${order.orderId}`;
      if (order.table) {
        orderRef.textContent += ` • ${String(order.table).toLowerCase() === 'takeaway' ? 'Take Away' : 'Table ' + order.table}`;
      }
    }

    // Populate reason dropdown
    const select = getEl('cancel-reason-select');
    if (select) {
      const reasons = getReasonsForRole(currentRole);
      select.innerHTML = `<option value="">— Select a reason —</option>` +
        reasons.map(r => `<option value="${r}">${r}</option>`).join('');
    }

    // Show/hide refund option (privileged only)
    const refundGroup = getEl('refund-status-group');
    if (refundGroup) {
      refundGroup.style.display = CONFIG.PRIVILEGED_ROLES.includes(currentRole) ? 'block' : 'none';
    }

    // Show dialog
    const backdrop = getEl('cancel-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  /* ── Close dialog ── */
  function closeDialog() {
    const backdrop = getEl('cancel-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
    }
    document.body.style.overflow = '';

    // Reset form
    const select = getEl('cancel-reason-select');
    const textarea = getEl('cancel-remarks-textarea');
    if (select) select.value = '';
    if (textarea) {
      textarea.value = '';
      textarea.classList.remove('show');
    }
  }

  /* ── Build dialog HTML dynamically ── */
  function buildDialog() {
    const backdrop = document.createElement('div');
    backdrop.id = 'cancel-modal-backdrop';
    backdrop.className = 'cancel-modal-backdrop';
    backdrop.innerHTML = `
      <div class="cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
        <div class="cancel-modal-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="cancel-modal-title" id="cancel-modal-title">Cancel Order</h3>
        <div id="cancel-order-ref" style="text-align:center; font-size: var(--fs-sm); color: var(--clr-text-muted); margin-bottom: var(--sp-2); font-weight: var(--fw-semibold);"></div>
        <p class="cancel-modal-warning">
          Are you sure you want to cancel this order?<br>
          <strong>This action cannot be undone.</strong>
        </p>

        <!-- Reason and Refund Dropdowns Removed for Simplicity -->

        <!-- Actions -->
        <div class="cancel-modal-actions">
          <button class="btn--go-back" id="cancel-go-back-btn">
            <i class="fa-solid fa-arrow-left"></i> Go Back
          </button>
          <button class="btn--cancel-order" id="confirm-cancel-btn">
            <i class="fa-solid fa-ban"></i> Cancel Order
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Event listeners
    getEl('cancel-go-back-btn').addEventListener('click', closeDialog);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDialog(); });

    const reasonSelectEl = getEl('cancel-reason-select');
    if (reasonSelectEl) {
      reasonSelectEl.addEventListener('change', e => {
        const textarea = getEl('cancel-remarks-textarea');
        if (textarea) {
          textarea.classList.toggle('show', e.target.value === 'Other');
          if (e.target.value !== 'Other') textarea.value = '';
        }
      });
    }

    getEl('confirm-cancel-btn').addEventListener('click', submitCancellation);
  }

  /* ── Submit cancellation ── */
  async function submitCancellation() {
    const reason = (currentRole === CONFIG.ROLES.CUSTOMER) ? 'Cancelled by Customer' : 'Cancelled by Admin';
    const remarks = '';
    const refundStatus = 'Not Required';

    const btn = getEl('confirm-cancel-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...';
    }

    // Get canceller info
    const cancelledBy = sessionStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_NAME) || currentRole || 'System';
    const cancelledRole = currentRole || getCurrentRole();

    try {
      await API.cancelOrder(
        currentOrder.orderId,
        reason,
        remarks,
        cancelledBy,
        cancelledRole,
        refundStatus
      );

      closeDialog();
      showToast(`Order #${currentOrder.orderId} has been cancelled.`, 'error', 5000);

      // Fire success callback
      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback({
          orderId: currentOrder.orderId,
          reason,
          remarks,
          cancelledBy,
          cancelledRole,
          refundStatus,
          cancelledAt: new Date().toISOString(),
        });
      }

      // Log activity
      logActivity(currentOrder.orderId, reason, cancelledBy, cancelledRole);

    } catch (e) {
      // Graceful degradation: still update UI locally if API unavailable
      console.warn('[CancellationEngine] API unavailable, running in demo mode:', e.message);

      closeDialog();
      showToast(`Order #${currentOrder.orderId} cancelled (Demo mode).`, 'warning', 5000);

      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback({
          orderId: currentOrder.orderId,
          reason,
          remarks,
          cancelledBy,
          cancelledRole,
          refundStatus,
          cancelledAt: new Date().toISOString(),
          demo: true,
        });
      }

      logActivity(currentOrder.orderId, reason, cancelledBy, cancelledRole, true);
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel Order';
    }
  }

  /* ── Log activity to localStorage (audit trail) ── */
  function logActivity(orderId, reason, cancelledBy, cancelledRole, isDemo = false) {
    try {
      const LOG_KEY = 'WIN_CANCEL_LOG';
      const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      log.unshift({
        orderId,
        reason,
        cancelledBy,
        cancelledRole,
        cancelledAt: new Date().toISOString(),
        demo: isDemo,
      });
      // Keep last 100 entries
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 100)));
    } catch (e) {
      console.warn('Could not write activity log:', e);
    }
  }

  /* ── Get activity log ── */
  function getActivityLog() {
    try {
      return JSON.parse(localStorage.getItem('WIN_CANCEL_LOG') || '[]');
    } catch {
      return [];
    }
  }

  /* ── Render cancel button (context-aware) ── */
  function renderCancelButton(order, role, container) {
    if (!container) return;

    const canCancel = canCancelOrder(role, order.status);

    if (order.status === 'Cancelled') {
      // Show cancellation info
      container.innerHTML = `
        <div class="cancel-not-allowed-msg">
          <i class="fa-solid fa-ban"></i>
          This order was cancelled.
        </div>
      `;
      return;
    }

    if (role === CONFIG.ROLES.KITCHEN) {
      // Kitchen never sees cancel
      return;
    }

    if (!canCancel && role === CONFIG.ROLES.CUSTOMER) {
      if (['Preparing', 'Ready', 'Delivered'].includes(order.status)) {
        container.innerHTML = `
          <div class="cancel-not-allowed-msg">
            <i class="fa-solid fa-kitchen-set"></i>
            Your order is already being prepared and can no longer be cancelled.
          </div>
        `;
      }
      return;
    }

    if (canCancel) {
      const btn = document.createElement('button');
      btn.className = 'btn--trigger-cancel';
      btn.id = `cancel-btn-${order.orderId}`;
      btn.innerHTML = `<i class="fa-solid fa-ban"></i> Cancel Order`;
      btn.addEventListener('click', () => {
        openDialog(order, role, (result) => {
          // Reload or update UI after cancellation
          if (typeof window.loadOrders === 'function') window.loadOrders();
          if (typeof window.fetchStatus === 'function') window.fetchStatus();
        });
      });
      container.appendChild(btn);
    }
  }

  /* ── Get cancellation stats from local log (for offline analytics) ── */
  function getLocalStats() {
    const log = getActivityLog();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);

    const today = log.filter(e => e.cancelledAt?.startsWith(todayStr)).length;
    const week = log.filter(e => new Date(e.cancelledAt) >= weekAgo).length;
    const month = log.filter(e => new Date(e.cancelledAt) >= monthAgo).length;

    // Count by reason
    const reasonCounts = {};
    log.forEach(e => {
      reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
    });

    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Count by hour
    const hourCounts = {};
    log.forEach(e => {
      const h = new Date(e.cancelledAt).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const peakHourStr = peakHour ? `${peakHour[0]}:00–${parseInt(peakHour[0]) + 1}:00` : '—';

    return {
      total: log.length,
      today,
      week,
      month,
      reasonCounts,
      topReason,
      peakHour: peakHourStr,
      log,
    };
  }

  return {
    openDialog,
    closeDialog,
    renderCancelButton,
    getActivityLog,
    getLocalStats,
    logActivity,
  };
})();
