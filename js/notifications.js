/* ============================================
   GLOBAL ADMIN NOTIFICATIONS
   ============================================ */

(function() {
  if (typeof API === 'undefined' || typeof CONFIG === 'undefined') {
    console.warn('Notifications require API and CONFIG');
    return;
  }

  // Calculate Base URL to reliably link to admin pages regardless of current directory
  const pathParts = window.location.pathname.split('/');
  let adminIndex = pathParts.indexOf('admin');
  let kitchenIndex = pathParts.indexOf('kitchen');
  
  let baseUrl = '/';
  if (adminIndex !== -1) {
    baseUrl = pathParts.slice(0, adminIndex).join('/') + '/';
  } else if (kitchenIndex !== -1) {
    baseUrl = pathParts.slice(0, kitchenIndex).join('/') + '/';
  } else {
    // Fallback if we are somehow outside both but still loaded the script
    const currentUrl = window.location.href;
    baseUrl = currentUrl.substring(0, currentUrl.indexOf('Restaurents Project with Advertising - Copy') + 'Restaurents Project with Advertising - Copy/'.length);
  }

  // State
  let knownOrders = new Map(); // orderId -> status
  let isFirstLoad = true;

  // Audio Context Setup (lazy loaded on first click to comply with browser autoplay policies)
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Play a "New Order" Chime
  function playNewOrderSound() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch(e) {}
  }

  // Play an urgent "Cancellation Request" Alert
  function playCancelAlertSound() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.setValueAtTime(0, audioCtx.currentTime + 0.1); // Silence
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.2); // A4
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch(e) {}
  }

  function showToastNotification(title, msg, link, type = 'info') {
    const containerId = 'global-notifications-container';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'urgent' ? 'var(--clr-error, #ef4444)' : 'hsl(250, 70%, 55%)';
    toast.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif;
      pointer-events: auto;
      cursor: pointer;
      transform: translateX(120%);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      min-width: 280px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.2);
    `;

    toast.innerHTML = `
      <div style="font-weight:bold; margin-bottom:5px; font-size:16px;">${title}</div>
      <div style="font-size:14px; opacity:0.9;">${msg}</div>
      <div style="position:absolute; bottom:0; left:0; height:3px; background:rgba(255,255,255,0.5); width:100%; animation:toastProgress 5s linear forwards;"></div>
      <style>@keyframes toastProgress { from { width:100%; } to { width:0%; } }</style>
    `;

    toast.onclick = () => {
      window.location.href = link;
    };

    container.appendChild(toast);

    // Animate in
    setTimeout(() => { toast.style.transform = 'translateX(0)'; }, 50);

    // Remove after 5s
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  async function checkNotifications() {
    try {
      const orders = await API.getOrders();
      
      orders.forEach(order => {
        const id = order.orderId;
        const status = order.status;
        const payStatus = order.paymentStatus;
        const prev = knownOrders.get(id) || {};
        const prevStatus = prev.status;
        const prevPayStatus = prev.payStatus;

        if (!isFirstLoad) {
          // New Order Arrived
          if (!prevStatus && status === 'New') {
            playNewOrderSound();
            showToastNotification(
              '🔔 New Order!',
              `Order #${id} for Table ${order.table}`,
              baseUrl + 'admin/orders/'
            );
          }
          // Cancellation Requested
          else if (prevStatus && prevStatus !== 'Cancellation Requested' && status === 'Cancellation Requested') {
            playCancelAlertSound();
            showToastNotification(
              '⚠️ Cancellation Request',
              `Order #${id} wants to cancel. Review now.`,
              baseUrl + 'admin/cancellations/',
              'urgent'
            );
          }
          // Cashier Notified
          else if (payStatus === 'Awaiting Cash Payment' && prevPayStatus !== 'Awaiting Cash Payment') {
            playNewOrderSound();
            showToastNotification(
              '💵 Cash Payment Waiting',
              `Table ${order.table} wants to pay ${formatPrice(order.total)} cash!`,
              baseUrl + 'admin/payments/'
            );
          }
        }
        
        knownOrders.set(id, { status: status, payStatus: payStatus });
      });

      isFirstLoad = false;
    } catch (e) {
      console.warn('Notifications check failed', e);
    }
  }

  // Unlock audio on first interaction
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });

  // Start polling
  setInterval(checkNotifications, CONFIG.POLL_INTERVAL);
  checkNotifications(); // Initial load

})();
