/* ============================================
   MENU PAGE — Logic
   ============================================ */

(() => {
  // ── State ──
  let menuData = [];
  let categories = [];
  let activeCategory = 'All';
  let searchQuery = '';
  let tableNo = '';

  // ── DOM Elements ──
  const restaurantNameEl = document.getElementById('restaurant-name');
  const tableBadgeEl = document.getElementById('table-badge');
  const categoryTabsInner = document.getElementById('category-tabs-inner');
  const menuContainer = document.getElementById('menu-container');
  const menuLoading = document.getElementById('menu-loading');
  const menuEmpty = document.getElementById('menu-empty');
  const searchInput = document.getElementById('search-input');
  const cartBtn = document.getElementById('cart-btn');
  const viewCartBtn = document.getElementById('view-cart-btn');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartClose = document.getElementById('cart-close');
  const cartItemsEl = document.getElementById('cart-items');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartTotal = document.getElementById('cart-total');
  const placeOrderBtn = document.getElementById('place-order-btn');
  const orderLoading = document.getElementById('order-loading');

  // ── Initialize ──
  async function init() {
    // Get table number from URL
    const params = new URLSearchParams(window.location.search);
    tableNo = params.get('t') || params.get('table') || 'T1';
    localStorage.setItem(CONFIG.STORAGE_KEYS.TABLE, tableNo);

    if (tableNo.toLowerCase() === 'takeaway') {
      tableBadgeEl.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Take Away';
    } else {
      tableBadgeEl.textContent = `Table ${tableNo}`;
      const callWaiterBtn = document.getElementById('call-waiter-btn');
      if (callWaiterBtn) callWaiterBtn.style.display = 'flex';
    }

    // Populate cached customer details
    const cachedName = localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME) || '';
    const cachedPhone = localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE) || '';
    const nameInput = document.getElementById('customer-name');
    const phoneInput = document.getElementById('customer-phone');
    if (nameInput) nameInput.value = cachedName;
    if (phoneInput) phoneInput.value = cachedPhone;

    // Check for active order banner
    checkActiveOrder();

    // Load config and menu in parallel
    try {
      const [config, menu] = await Promise.all([
        loadConfig(),
        loadMenu()
      ]);

      if (config && config.restaurant_name) {
        restaurantNameEl.textContent = config.restaurant_name;
        document.title = `Menu — ${config.restaurant_name}`;
        
        // Validate Table Number
        let isValidTable = false;
        const maxTables = parseInt(config['num_tables']) || 20;
        
        if (tableNo.toLowerCase() === 'takeaway') {
          isValidTable = true;
          tableNo = 'TAKEAWAY';
        } else {
          const match = String(tableNo).match(/^T?(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= 1 && num <= maxTables) {
              isValidTable = true;
              tableNo = 'T' + num;
            }
          }
        }

        if (!isValidTable) {
          window.location.href = '../404/';
          return;
        }

        // Save normalized table number back to localStorage and URL history
        localStorage.setItem(CONFIG.STORAGE_KEYS.TABLE, tableNo);
        window.history.replaceState({}, '', `?t=${tableNo}`);
      }
    } catch (err) {
      // If API fails, use demo data for preview
      console.warn('API unavailable, loading demo data:', err.message);
      loadDemoData();
    }

    // Setup event listeners
    setupEventListeners();

    // Initial cart UI sync
    Cart.updateUI();
  }

  // ── Load Config ──
  async function loadConfig() {
    try {
      return await API.getConfig();
    } catch {
      return null;
    }
  }

  // ── Load Menu ──
  async function loadMenu() {
    const data = await API.getMenu();
    menuData = data;
    processMenu();
    return data;
  }

  // ── Demo Data (for offline preview) ──
  function loadDemoData() {
    restaurantNameEl.textContent = 'WIN Restaurant';
    document.title = 'Menu — WIN Restaurant';

    menuData = [
      { id: '1', category: '<i class="fa-solid fa-pizza-slice"></i> Pizza', name: 'Margherita Pizza', description: 'Classic cheese pizza with fresh basil and mozzarella', price: 299, image: '', available: true },
      { id: '2', category: '<i class="fa-solid fa-pizza-slice"></i> Pizza', name: 'Farmhouse Pizza', description: 'Loaded with fresh vegetables and herbs', price: 349, image: '', available: true },
      { id: '3', category: '<i class="fa-solid fa-pizza-slice"></i> Pizza', name: 'Peppy Paneer Pizza', description: 'Spicy paneer cubes with capsicum and onion', price: 379, image: '', available: true },
      { id: '4', category: '<i class="fa-solid fa-burger"></i> Burgers', name: 'Classic Veg Burger', description: 'Crispy patty with lettuce, tomato and special sauce', price: 149, image: '', available: true },
      { id: '5', category: '<i class="fa-solid fa-burger"></i> Burgers', name: 'Paneer Tikka Burger', description: 'Grilled paneer with tikka masala sauce', price: 179, image: '', available: true },
      { id: '6', category: '<i class="fa-solid fa-burger"></i> Burgers', name: 'Mushroom Swiss Burger', description: 'Sautéed mushrooms with melted Swiss cheese', price: 199, image: '', available: false },
      { id: '7', category: '<i class="fa-solid fa-cup-togo"></i> Drinks', name: 'Fresh Lime Soda', description: 'Refreshing lime soda — sweet or salted', price: 79, image: '', available: true },
      { id: '8', category: '<i class="fa-solid fa-cup-togo"></i> Drinks', name: 'Cold Coffee', description: 'Creamy cold coffee blended with ice cream', price: 129, image: '', available: true },
      { id: '9', category: '<i class="fa-solid fa-cup-togo"></i> Drinks', name: 'Mango Lassi', description: 'Thick and creamy mango yogurt smoothie', price: 109, image: '', available: true },
      { id: '10', category: '<i class="fa-solid fa-cake-candles"></i> Desserts', name: 'Chocolate Brownie', description: 'Warm fudgy brownie with vanilla ice cream', price: 169, image: '', available: true },
      { id: '11', category: '<i class="fa-solid fa-cake-candles"></i> Desserts', name: 'Gulab Jamun', description: 'Soft milk dumplings soaked in rose-flavored syrup', price: 99, image: '', available: true },
      { id: '12', category: '<i class="fa-solid fa-cake-candles"></i> Desserts', name: 'Rasgulla', description: 'Soft spongy cheese balls in light sugar syrup', price: 89, image: '', available: true },
    ];

    processMenu();
  }

  // ── Process & Render Menu ──
  function processMenu() {
    // Extract unique categories
    categories = [...new Set(menuData.map(item => item.category))];

    // Render category tabs
    renderCategoryTabs();

    // Render menu items
    renderMenu();

    // Hide loading, show menu
    menuLoading.style.display = 'none';
    menuContainer.style.display = 'block';
  }

  // ── Render Category Tabs ──
  function renderCategoryTabs() {
    categoryTabsInner.innerHTML = '';

    // "All" tab
    const allTab = document.createElement('button');
    allTab.className = `category-tab ${activeCategory === 'All' ? 'active' : ''}`;
    allTab.innerHTML = '<i class="fa-solid fa-star"></i> All';
    allTab.addEventListener('click', () => {
      activeCategory = 'All';
      renderCategoryTabs();
      renderMenu();
    });
    categoryTabsInner.appendChild(allTab);

    // Category tabs
    categories.forEach(cat => {
      const tab = document.createElement('button');
      tab.className = `category-tab ${activeCategory === cat ? 'active' : ''}`;
      tab.textContent = cat;
      tab.addEventListener('click', () => {
        activeCategory = cat;
        renderCategoryTabs();
        renderMenu();
      });
      categoryTabsInner.appendChild(tab);
    });
  }

  // ── Render Menu Items ──
  function renderMenu() {
    let filtered = [...menuData];

    // Filter by category
    if (activeCategory !== 'All') {
      filtered = filtered.filter(item => item.category === activeCategory);
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }

    // Show empty state if no results
    if (filtered.length === 0) {
      menuContainer.style.display = 'none';
      menuEmpty.style.display = 'block';
      return;
    }

    menuContainer.style.display = 'block';
    menuEmpty.style.display = 'none';

    // Group by category
    const grouped = {};
    filtered.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    // Render
    menuContainer.innerHTML = '';

    // Ad Placement: Menu Landing (only on 'All' tab)
    if (activeCategory === 'All' && typeof AdEcosystem !== 'undefined') {
      AdEcosystem.injectMenuLanding(menuContainer);
    }

    Object.entries(grouped).forEach(([category, items]) => {
      // Category title
      const titleEl = document.createElement('h2');
      titleEl.className = 'menu-category-title';
      titleEl.textContent = category;
      menuContainer.appendChild(titleEl);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'menu-grid stagger';

      items.forEach(item => {
        grid.appendChild(createMenuItemCard(item));
      });

      if (typeof AdEcosystem !== 'undefined') {
        AdEcosystem.injectInlineAds(grid, category);
      }

      menuContainer.appendChild(grid);
    });

    // Sync cart quantities
    Cart.updateUI();
  }

  // ── Create Menu Item Card ──
  function createMenuItemCard(item) {
    const qty = Cart.getQuantity(item.id);
    const card = document.createElement('div');
    card.className = `menu-item ${!item.available ? 'unavailable' : ''}`;
    card.dataset.id = item.id;

    // Generate placeholder color from item name
    const hue = hashCode(item.name) % 360;

    const imgHtml = item.image && item.image.trim() !== ''
      ? `<img class="menu-item-img" src="${escapeHtml(item.image.trim())}" alt="${escapeHtml(item.name)}" onerror="this.outerHTML='<div class=&quot;menu-item-img&quot; style=&quot;display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--clr-bg-elevated); color: var(--clr-text-muted); border: 1px dashed var(--clr-border); font-size: 0.7rem; gap: 4px;&quot;><span style=&quot;font-size: 1.2rem;&quot;><i class=&quot;fa-regular fa-image&quot;></i></span><span>Not Available</span></div>'">`
      : `<div class="menu-item-img" style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--clr-bg-elevated); color: var(--clr-text-muted); border: 1px dashed var(--clr-border); font-size: 0.7rem; gap: 4px;">
          <span style="font-size: 1.2rem;"><i class="fa-regular fa-image"></i></span>
          <span>Not Available</span>
        </div>`;

    card.innerHTML = `
      ${imgHtml}
      <div class="menu-item-info">
        <div class="menu-item-name">${escapeHtml(item.name)}</div>
        <div class="menu-item-desc">${escapeHtml(item.description)}</div>
        <div class="menu-item-bottom">
          <span class="menu-item-price">${formatPrice(item.price)}</span>
          ${item.available ? `
            <button class="add-btn" data-id="${item.id}" style="${qty > 0 ? 'display:none' : ''}">
              + ADD
            </button>
            <div class="qty-control" style="${qty > 0 ? 'display:flex' : 'display:none'}">
              <button class="qty-btn minus" data-id="${item.id}">−</button>
              <span class="qty-value">${qty}</span>
              <button class="qty-btn plus" data-id="${item.id}">+</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Event listeners
    if (item.available) {
      const addBtn = card.querySelector('.add-btn');
      const minusBtn = card.querySelector('.qty-btn.minus');
      const plusBtn = card.querySelector('.qty-btn.plus');

      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Cart.addItem(item);
        });
      }
      if (minusBtn) {
        minusBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Cart.decreaseItem(item.id);
        });
      }
      if (plusBtn) {
        plusBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Cart.addItem(item);
        });
      }
    }

    return card;
  }

  // ── Cart Drawer ──
  function openCartDrawer() {
    renderCartDrawer();
    cartDrawer.classList.add('active');
    cartBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    cartDrawer.classList.remove('active');
    cartBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderCartDrawer() {
    const items = Cart.getItems();

    if (items.length === 0) {
      cartItemsEl.innerHTML = `
        <div class="empty-state" style="padding: 2rem;">
          <div class="empty-state-icon"><i class="fa-solid fa-cart-shopping"></i></div>
          <h3>Your cart is empty</h3>
          <p>Add some delicious items from the menu!</p>
        </div>
      `;
      placeOrderBtn.disabled = true;
      placeOrderBtn.innerHTML = '<i class="fa-solid fa-utensils"></i> Add items to order';

      // Ad Placement: Empty Cart
      if (typeof AdEcosystem !== 'undefined') {
        AdEcosystem.injectEmptyCart(document.getElementById('cart-summary'));
      }
    } else {
      cartItemsEl.innerHTML = items.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            <div class="cart-item-price">${formatPrice(item.price)} × ${item.qty}</div>
          </div>
          <div class="qty-control" style="display:flex;">
            <button class="qty-btn minus" data-cart-id="${item.id}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn plus" data-cart-id="${item.id}">+</button>
          </div>
          <button class="cart-item-remove" data-remove-id="${item.id}" title="Remove"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join('');
      placeOrderBtn.disabled = false;
      placeOrderBtn.innerHTML = `<i class="fa-solid fa-utensils"></i> Place Order — ${formatPrice(Cart.getTotalPrice())}`;
    }

    // Update totals
    cartSubtotal.textContent = formatPrice(Cart.getTotalPrice());
    cartTotal.textContent = formatPrice(Cart.getTotalPrice());

    // Cart drawer event listeners
    cartItemsEl.querySelectorAll('.qty-btn.minus[data-cart-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.decreaseItem(btn.dataset.cartId);
        renderCartDrawer();
      });
    });
    cartItemsEl.querySelectorAll('.qty-btn.plus[data-cart-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = menuData.find(m => String(m.id) === String(btn.dataset.cartId)) ||
          Cart.getItems().find(m => String(m.id) === String(btn.dataset.cartId));
        if (item) Cart.addItem(item);
        renderCartDrawer();
      });
    });
    cartItemsEl.querySelectorAll('.cart-item-remove[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.removeItem(btn.dataset.removeId);
        renderCartDrawer();
      });
    });
  }

  // ── Check Active Order ──
  async function checkActiveOrder() {
    const lastOrderId = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_ORDER);
    if (!lastOrderId) return;

    try {
      const order = await API.getOrderStatus(lastOrderId);
      const activeStates = ['New', 'Accepted', 'Preparing', 'Ready', 'Cancellation Requested'];

      if (order) {
        const banner = document.getElementById('active-order-banner');
        const link = document.getElementById('active-order-link');

        if (banner && link) {
          link.href = `../order-status/?id=${order.orderId}`;
          
          if (activeStates.includes(order.status)) {
            banner.querySelector('span').innerHTML = `<i class="fa-regular fa-clock"></i> Active Order <strong>${order.orderId}</strong> is in progress!`;
            link.innerHTML = `Track Status <i class="fa-solid fa-arrow-right"></i>`;
            banner.style.background = 'var(--clr-primary)';
            banner.style.color = '#fff';
            banner.style.borderBottom = 'none';
            banner.style.display = 'flex';
          } else if (['Delivered', 'Rejected', 'Cancelled', 'Paid', 'Completed'].includes(order.status)) {
            banner.querySelector('span').innerHTML = `<i class="fa-solid fa-receipt"></i> Past Receipt <strong>${order.orderId}</strong>`;
            link.innerHTML = `View Bill <i class="fa-solid fa-arrow-right"></i>`;
            banner.style.background = 'var(--clr-bg-elevated)';
            banner.style.color = 'var(--clr-text-primary)';
            banner.style.borderBottom = '1px solid var(--clr-border)';
            banner.style.display = 'flex';
          } else {
            banner.style.display = 'none';
          }
        }
      } else {
        const banner = document.getElementById('active-order-banner');
        if (banner) banner.style.display = 'none';
      }
    } catch (e) {
      console.warn('Could not verify active order status:', e);
    }
  }

  // ── Validate Cart ──
  function validateCart() {
    const items = Cart.getItems();
    for (const item of items) {
      const menuMatch = menuData.find(m => String(m.id) === String(item.id));
      if (!menuMatch) {
        return `Item "${item.name}" is no longer on the menu.`;
      }
      if (String(menuMatch.available).toLowerCase() === 'false' || menuMatch.available === false) {
        return `Item "${item.name}" is currently sold out.`;
      }
      if (Number(menuMatch.price) !== Number(item.price)) {
        return `Price updated for "${item.name}". Please clear cart and re-add.`;
      }
    }
    return null;
  }

  // ── Place Order ──
  async function placeOrder() {
    if (Cart.isEmpty()) return;

    // Active Order Restriction Check
    const lastOrderId = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_ORDER);
    if (lastOrderId) {
      setButtonLoading(placeOrderBtn, true, 'Verifying...');
      try {
        const order = await API.getOrderStatus(lastOrderId);
        const terminalStates = ['Paid', 'Rejected', 'Cancelled', 'Completed'];
        if (order && !terminalStates.includes(order.status)) {
           showToast(`You have an active order (${order.status}). Please complete it before placing a new one.`, 'warning', 6000);
           setButtonLoading(placeOrderBtn, false);
           setTimeout(() => {
             window.location.href = `../order-status/?id=${lastOrderId}`;
           }, 2000);
           return;
        }
      } catch (e) {
         // Proceed if API fails
      }
      setButtonLoading(placeOrderBtn, false);
    }

    setButtonLoading(placeOrderBtn, true, 'Validating...');

    try {
      // 1. Refresh menu silently to get latest prices/availability
      await loadMenu();

      const validationError = validateCart();
      if (validationError) {
        showToast(validationError, 'error');
        setButtonLoading(placeOrderBtn, false);
        return;
      }
    } catch (e) {
      showToast('Validation failed. Please check items.', 'error');
      setButtonLoading(placeOrderBtn, false);
      return;
    }

    // Now actually placing...
    setButtonLoading(placeOrderBtn, true, 'Placing Order...');
    const nameInput = document.getElementById('customer-name');
    const phoneInput = document.getElementById('customer-phone');
    const customerName = nameInput ? nameInput.value.trim() : '';
    const mobileNumber = phoneInput ? phoneInput.value.trim() : '';

    if (!customerName) {
      showToast('Please enter your name.', 'warning');
      if (nameInput) nameInput.focus();
      setButtonLoading(placeOrderBtn, false);
      return;
    }
    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      if (phoneInput) phoneInput.focus();
      setButtonLoading(placeOrderBtn, false);
      return;
    }

    // Save details in local storage (for future convenience)
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME, customerName);
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE, mobileNumber);

    const items = Cart.getItems();
    const total = Cart.getTotalPrice();
    const notes = document.getElementById('order-notes').value.trim();

    // Show loading overlay
    orderLoading.style.display = 'flex';

    try {
      const result = await API.placeOrder({
        table: tableNo,
        items: items,
        total: total,
        notes: notes,
        customerName: customerName,
        mobileNumber: mobileNumber,
      });

      // Success!
      const orderId = result.orderId;

      // Save order ID
      localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_ORDER, orderId);

      // Clear cart
      Cart.clear();
      closeCartDrawer();

      // Redirect to order status page
      window.location.href = `../order-status/?id=${orderId}`;
    } catch (err) {
      showToast('Failed to place order. Please try again.', 'error');
      setButtonLoading(placeOrderBtn, false);
    } finally {
      orderLoading.style.display = 'none';
      setButtonLoading(placeOrderBtn, false);
    }
  }

  // ── Event Listeners ──
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value.trim();
      renderMenu();
    }, 250));

    // Cart button
    cartBtn.addEventListener('click', openCartDrawer);
    viewCartBtn.addEventListener('click', openCartDrawer);

    // Close cart drawer
    cartClose.addEventListener('click', closeCartDrawer);
    cartBackdrop.addEventListener('click', closeCartDrawer);

    // Place order
    placeOrderBtn.addEventListener('click', placeOrder);

    // Keyboard: Escape to close cart
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCartDrawer();
    });
  }

  // ── Helpers ──
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function getCategoryEmoji(category) {
    const lower = category.toLowerCase();
    if (lower.includes('pizza')) return '<i class="fa-solid fa-pizza-slice"></i>';
    if (lower.includes('burger')) return '<i class="fa-solid fa-burger"></i>';
    if (lower.includes('drink') || lower.includes('beverage')) return '<i class="fa-solid fa-cup-togo"></i>';
    if (lower.includes('dessert') || lower.includes('sweet')) return '<i class="fa-solid fa-cake-candles"></i>';
    if (lower.includes('rice') || lower.includes('biryani')) return '<i class="fa-solid fa-bowl-rice"></i>';
    if (lower.includes('noodle') || lower.includes('pasta')) return '<i class="fa-solid fa-bowl-food"></i>';
    if (lower.includes('soup')) return '<i class="fa-solid fa-bowl-food"></i>';
    if (lower.includes('salad')) return '<i class="fa-solid fa-leaf"></i>';
    if (lower.includes('sandwich')) return '<i class="fa-solid fa-bread-slice"></i>';
    if (lower.includes('chicken') || lower.includes('meat')) return '<i class="fa-solid fa-drumstick-bite"></i>';
    if (lower.includes('fish') || lower.includes('seafood')) return '<i class="fa-solid fa-fish"></i>';
    if (lower.includes('breakfast')) return '<i class="fa-solid fa-egg"></i>';
    return '<i class="fa-solid fa-utensils"></i>';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Call Waiter ──
  const callWaiterBtn = document.getElementById('call-waiter-btn');
  if (callWaiterBtn) {
    callWaiterBtn.addEventListener('click', async () => {
      callWaiterBtn.disabled = true;
      const originalText = callWaiterBtn.innerHTML;
      callWaiterBtn.innerHTML = '<div class="spinner"></div>';
      
      try {
        await API.callWaiter(tableNo);
        showToast('Waiter is on the way!', 'success');
        callWaiterBtn.innerHTML = '<i class="fa-solid fa-check"></i> Waiter Called';
        callWaiterBtn.style.background = 'var(--clr-success)';
        
        // Reset button after 10 seconds
        setTimeout(() => {
          callWaiterBtn.disabled = false;
          callWaiterBtn.innerHTML = originalText;
          callWaiterBtn.style.background = 'var(--clr-primary)';
        }, 10000);
      } catch (e) {
        showToast('Failed to call waiter. Try again.', 'error');
        callWaiterBtn.disabled = false;
        callWaiterBtn.innerHTML = originalText;
      }
    });
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', init);
})();
