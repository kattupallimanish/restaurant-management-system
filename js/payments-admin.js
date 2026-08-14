/* ============================================
   ADMIN PAYMENTS MANAGEMENT LOGIC
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const adminRole = sessionStorage.getItem(CONFIG.STORAGE_KEYS.ROLE);
  const adminName = sessionStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_NAME);

  if (!adminRole || !CONFIG.PRIVILEGED_ROLES.includes(adminRole)) {
    // If cashier or above is allowed, we might need to check CASHIER role too.
    if (adminRole !== CONFIG.ROLES.CASHIER) {
      window.location.href = '../login/';
      return;
    }
  }

  // DOM Elements
  const urgentContainer = document.getElementById('urgent-request-cards-container');
  const urgentCountBadge = document.getElementById('urgent-count');
  const pendingContainer = document.getElementById('pending-request-cards-container');

  let allOrders = [];

  async function loadData() {
    try {
      allOrders = await API.getOrders();
      renderData();
    } catch (e) {
      console.warn('Failed to load orders', e);
      renderData(); // Will show empty state
    }
  }

  function renderData() {
    // Awaiting Cash Payment (Cashier Notified)
    const urgentPayments = allOrders.filter(o => o.paymentStatus === 'Awaiting Cash Payment' && o.status !== 'Paid' && o.status !== 'Cancelled');
    
    renderUrgent(urgentPayments);
  }

  function renderUrgent(orders) {
    if (orders.length === 0) {
      urgentCountBadge.style.display = 'none';
      urgentContainer.innerHTML = `
        <div class="no-requests">
          <div class="no-requests-icon"><i class="fa-solid fa-circle-check"></i></div>
          <h3>No Pending Payments</h3>
          <p>No customers are waiting to pay cash at the moment.</p>
        </div>
      `;
      return;
    }

    urgentCountBadge.textContent = orders.length;
    urgentCountBadge.style.display = 'inline-block';

    urgentContainer.innerHTML = '<div class="payment-request-cards">' + orders.map(o => `
      <div class="payment-request-card urgent">
        <div class="payment-request-card-header">
          <span class="payment-request-order-id">#${o.orderId}</span>
          <span class="payment-request-table"><i class="fa-solid fa-bell fa-shake"></i> ${o.table}</span>
        </div>
        <div class="payment-request-invoice">INV-${o.orderId}</div>
        <div class="payment-request-method"><i class="fa-solid fa-money-bill-wave"></i> Cash Payment</div>
        <div class="payment-request-total">${formatPrice(o.total)}</div>
        <div class="payment-request-actions">
          <button class="btn--payment-confirm" onclick="markOrderPaid('${o.orderId}', 'INV-${o.orderId}', 'Cash')">
            <i class="fa-solid fa-check-double"></i> Verify & Mark Paid
          </button>
        </div>
        <div class="payment-request-time">${formatTime(o.timestamp)}</div>
      </div>
    `).join('') + '</div>';
  }



  window.markOrderPaid = async function(orderId, invoiceNo, method) {
    if (!confirm('Mark Order #' + orderId + ' as Paid?')) return;
    try {
      await API.updatePayment(orderId, invoiceNo, method, CONFIG.PAYMENT_STATUS.SUCCESS, '');
      await API.updateOrderStatus(orderId, 'Paid');
      showToast('Payment verified for Order #' + orderId, 'success');
      loadData();
    } catch (e) {
      showToast('Failed to verify payment', 'error');
    }
  };

  // UI Setup
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('active');
    document.getElementById('sidebar-backdrop')?.classList.toggle('active');
  });
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebar-backdrop')?.classList.remove('active');
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.ROLE);
    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_NAME);
    window.location.href = '../login/';
  });

  // Auto-refresh
  setInterval(loadData, CONFIG.POLL_INTERVAL);
  loadData();
});
