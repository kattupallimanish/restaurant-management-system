/* ============================================
   CART — State management with localStorage
   ============================================ */

const Cart = (() => {
  let items = [];

  // Load cart from localStorage
  function load() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
      items = saved ? JSON.parse(saved) : [];
    } catch {
      items = [];
    }
  }

  // Save cart to localStorage
  function save() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(items));
    updateUI();
  }

  // Add item to cart
  function addItem(menuItem) {
    const existing = items.find(i => String(i.id) === String(menuItem.id));
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty: 1,
      });
    }
    save();
    animateCartBadge();
  }

  // Remove one quantity
  function decreaseItem(itemId) {
    const idx = items.findIndex(i => String(i.id) === String(itemId));
    if (idx === -1) return;

    items[idx].qty -= 1;
    if (items[idx].qty <= 0) {
      items.splice(idx, 1);
    }
    save();
  }

  // Set exact quantity
  function setQuantity(itemId, qty) {
    if (qty <= 0) {
      removeItem(itemId);
      return;
    }
    const item = items.find(i => String(i.id) === String(itemId));
    if (item) {
      item.qty = qty;
      save();
    }
  }

  // Remove item entirely
  function removeItem(itemId) {
    items = items.filter(i => String(i.id) !== String(itemId));
    save();
  }

  // Get quantity of specific item
  function getQuantity(itemId) {
    const item = items.find(i => String(i.id) === String(itemId));
    return item ? item.qty : 0;
  }

  // Get all items
  function getItems() {
    return [...items];
  }

  // Get total items count
  function getTotalCount() {
    return items.reduce((sum, i) => sum + i.qty, 0);
  }

  // Get total price
  function getTotalPrice() {
    return items.reduce((sum, i) => sum + (i.price * i.qty), 0);
  }

  // Clear cart
  function clear() {
    items = [];
    save();
  }

  // Is cart empty?
  function isEmpty() {
    return items.length === 0;
  }

  // ── UI Updates ──
  function updateUI() {
    // Update cart count badge
    const countEl = document.getElementById('cart-count');
    const count = getTotalCount();
    if (countEl) {
      countEl.textContent = count;
      countEl.classList.toggle('show', count > 0);
    }

    // Update cart bar
    const cartBar = document.getElementById('cart-bar');
    const barItems = document.getElementById('cart-bar-items');
    const barTotal = document.getElementById('cart-bar-total');
    if (cartBar) {
      cartBar.classList.toggle('show', count > 0);
    }
    if (barItems) {
      barItems.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    }
    if (barTotal) {
      barTotal.textContent = formatPrice(getTotalPrice());
    }

    // Update all quantity controls on menu page
    document.querySelectorAll('.menu-item[data-id]').forEach(card => {
      const id = card.dataset.id;
      const qty = getQuantity(id);
      const addBtn = card.querySelector('.add-btn');
      const qtyControl = card.querySelector('.qty-control');
      const qtyValue = card.querySelector('.qty-value');

      if (qty > 0) {
        if (addBtn) addBtn.style.display = 'none';
        if (qtyControl) qtyControl.style.display = 'flex';
        if (qtyValue) qtyValue.textContent = qty;
      } else {
        if (addBtn) addBtn.style.display = 'flex';
        if (qtyControl) qtyControl.style.display = 'none';
      }
    });
  }

  function animateCartBadge() {
    const countEl = document.getElementById('cart-count');
    if (countEl) {
      countEl.classList.remove('bump');
      // Force reflow
      void countEl.offsetWidth;
      countEl.classList.add('bump');
    }
  }

  // Initialize
  load();

  return {
    addItem,
    decreaseItem,
    setQuantity,
    removeItem,
    getQuantity,
    getItems,
    getTotalCount,
    getTotalPrice,
    clear,
    isEmpty,
    updateUI,
  };
})();
