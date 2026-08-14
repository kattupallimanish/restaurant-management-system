/* ============================================
   Ad Ecosystem — AdManager (Premium Redesigned)
   ============================================ */

const AdEcosystem = (() => {
  // ── Mock Premium Local Discovery Campaigns ──
  const mockCampaigns = [
    {
      id: 'C_WIN_01',
      advertiser: 'WIN - Work Income for Novices',
      headline: 'Promote Your Business Here',
      subtext: 'Reach local food lovers dining in our restaurant. Launch a campaign starting today.',
      image: 'assets/win-ad-01.png',
      url: 'assets/win-ad-01.png',
      cpc: 0.25,
      rating: '4.9',
      offer: 'Advertise Now',
      tag: 'Grow Business with WIN',
      placements: ['menu_landing', 'inline', 'cart_empty', 'order_tracking', 'bill']
    }
  ];

  // ── Reusable Component: AdAnalyticsTracker ──
  const AdAnalyticsTracker = {
    impressions: new Set(),
    async trackImpression(campaignId, placement) {
      const key = `${campaignId}_${placement}`;
      if (this.impressions.has(key)) return;
      this.impressions.add(key);

      console.log(`[AdEcosystem] 📊 IMPRESSION logged: ${campaignId} at ${placement}`);

      if (typeof API !== 'undefined' && API.trackAdEvent) {
        try {
          await API.trackAdEvent(campaignId, placement, 'IMPRESSION');
        } catch (err) {
          console.warn('[AdEcosystem] API tracking failed, logged locally.', err);
        }
      }
    },
    async trackClick(campaignId, placement, url) {
      console.log(`[AdEcosystem] 💰 CLICK logged: ${campaignId} at ${placement}`);

      if (typeof API !== 'undefined' && API.trackAdEvent) {
        try {
          await API.trackAdEvent(campaignId, placement, 'CLICK');
        } catch (err) {
          console.warn('[AdEcosystem] API tracking failed.', err);
        }
      }

      window.open(url, '_blank');
    }
  };

  function getRelativeAssetPath(path) {
    if (!path || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const pathname = window.location.pathname;
    if (pathname.includes('/admin/orders/') || pathname.includes('/admin/menu-manage/') || pathname.includes('/admin/qr/') || pathname.includes('/admin/login/')) {
      return '../../' + path;
    } else if (pathname.includes('/menu/') || pathname.includes('/order-status/') || pathname.includes('/admin/') || pathname.includes('/offline/') || pathname.includes('/404/') || pathname.includes('/kitchen/')) {
      return '../' + path;
    }
    return path;
  }

  // ── Logic: Selection ──
  async function getAdsForPlacement(placement, count = 1, context = {}) {
    let ads = [];

    // Attempt to fetch from Sheets database
    if (typeof API !== 'undefined' && API.getAds) {
      try {
        ads = await API.getAds(placement, context.category);
      } catch (err) {
        console.warn('[AdEcosystem] API failed to fetch ads. Falling back to local premium mocks.', err);
      }
    }

    // Fallback if sheets API returned empty or failed
    if (!ads || ads.length === 0) {
      ads = mockCampaigns.filter(c => c.placements.includes(placement));
      if (context.category) {
        ads = ads.filter(c => c.id === 'C_WIN_01' || (c.placements.includes(placement) && c.id.startsWith('C_')));
      }
    }

    // Enrich missing fields for custom premium layout
    ads = ads.map((ad, idx) => {
      const isSelf = ad.id && (ad.id.startsWith('C_SELF') || ad.id.startsWith('C_WIN'));
      return {
        ...ad,
        image: getRelativeAssetPath(ad.image),
        rating: ad.rating || (isSelf ? '5.0' : (4.5 + (idx % 5) * 0.1).toFixed(1)),
        distance: ad.distance || (isSelf ? 'Instant' : `${200 + (idx % 6) * 150}m Away`),
        offer: ad.offer || (isSelf ? 'Rent Now' : 'Claim Offer'),
        tag: ad.tag || (isSelf ? 'Grow Business' : 'Trending Nearby')
      };
    });

    // Randomize rotation
    ads.sort(() => 0.5 - Math.random());
    return ads.slice(0, count);
  }

  // ── Reusable Component: AdSkeletonLoader ──
  function createSkeletonLoader() {
    const el = document.createElement('div');
    el.className = 'ad-skeleton-loader';
    el.innerHTML = `
      <div class="ad-skeleton-img"></div>
      <div class="ad-skeleton-text title"></div>
      <div class="ad-skeleton-text sub"></div>
      <div class="ad-skeleton-text sub" style="width:70%;"></div>
      <div class="ad-skeleton-text cta"></div>
    `;
    return el;
  }

  // ── Reusable Component: AdDiscoveryCard ──
  function createAdDiscoveryCard(ad, placement) {
    const card = document.createElement('div');
    card.className = 'ad-discovery-card';
    card.innerHTML = `
      <div class="ad-discovery-card-header">
        <div class="ad-discovery-card-img" style="background-image: url('${ad.image}')"></div>
        <span class="ad-badge-top-left">${ad.tag}</span>
      </div>
      <div class="ad-discovery-card-meta">
        <span class="ad-discovery-rating"><i class="fa-solid fa-star"></i> ${ad.rating}</span>
      </div>
      <h4 class="ad-discovery-card-title">${ad.headline}</h4>
      <p class="ad-discovery-card-desc">${ad.subtext}</p>
      <div class="ad-discovery-card-footer">
        <span class="ad-discovery-advertiser">${ad.advertiser}</span>
        <button class="ad-discovery-cta">${ad.id && (ad.id.startsWith('C_SELF') || ad.id.startsWith('C_WIN')) ? 'Advertise' : 'Explore'}</button>
      </div>
    `;

    setupIntersectionObserver(card, ad.id, placement);
    card.addEventListener('click', () => AdAnalyticsTracker.trackClick(ad.id, placement, ad.url));
    return card;
  }

  // ── Reusable Component: AdRewardCard (Sleek Banner) ──
  function createAdRewardCard(ad, placement) {
    const card = document.createElement('div');
    card.className = 'ad-reward-card';
    card.innerHTML = `
      <div class="ad-reward-img-wrapper" style="background-image: url('${ad.image}')">
      </div>
      <div class="ad-reward-content">
         <div class="ad-reward-badge">${ad.id && (ad.id.startsWith('C_SELF') || ad.id.startsWith('C_WIN')) ? 'Growth Hub' : 'VIP Discovery'}</div>
         <h3 class="ad-reward-headline">${ad.headline}</h3>
         <p class="ad-reward-subtext">${ad.subtext}</p>
      </div>
      <div class="ad-reward-arrow">
         <i class="fa-solid fa-chevron-right"></i>
      </div>
    `;

    setupIntersectionObserver(card, ad.id, placement);
    card.addEventListener('click', () => AdAnalyticsTracker.trackClick(ad.id, placement, ad.url));
    return card;
  }

  // ── Reusable Component: AdPremiumBanner ──
  function createAdPremiumBanner(ad, placement) {
    const banner = document.createElement('div');
    banner.className = 'ad-premium-banner';
    banner.innerHTML = `
      <div class="ad-premium-banner-img" style="background-image: url('${ad.image}')"></div>
      <div class="ad-premium-banner-info">
        <div class="ad-premium-banner-tag">${ad.tag}</div>
        <h4 class="ad-premium-banner-title">${ad.headline}</h4>
        <p class="ad-premium-banner-desc">${ad.subtext}</p>
      </div>
      <div class="ad-premium-banner-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    `;

    setupIntersectionObserver(banner, ad.id, placement);
    banner.addEventListener('click', () => AdAnalyticsTracker.trackClick(ad.id, placement, ad.url));
    return banner;
  }

  // ── Reusable Component: AdPartnerCard (Premium Inline Feed) ──
  function createAdPartnerCard(ad, placement) {
    const el = document.createElement('div');
    el.className = 'ad-partner-card-premium';
    el.innerHTML = `
      <div class="ad-partner-header">
         <div class="ad-partner-advertiser">${ad.advertiser}</div>
         <div class="ad-partner-sponsor-tag">${ad.id && (ad.id.startsWith('C_SELF') || ad.id.startsWith('C_WIN')) ? 'Promo Space' : 'Sponsored'}</div>
      </div>
      <div class="ad-partner-media" style="background-image: url('${ad.image}')">
         <div class="ad-partner-overlay">
            <h3 class="ad-partner-title-large">${ad.headline}</h3>
            <p class="ad-partner-desc-large">${ad.subtext}</p>
         </div>
      </div>
      <div class="ad-partner-footer">
         <div class="ad-partner-meta">
            <span><i class="fa-solid fa-star"></i> ${ad.rating}</span>
         </div>
         <button class="ad-partner-btn">Explore</button>
      </div>
    `;

    setupIntersectionObserver(el, ad.id, placement);
    el.addEventListener('click', () => AdAnalyticsTracker.trackClick(ad.id, placement, ad.url));
    return el;
  }

  // ── Reusable Component: AdCarousel ──
  function createAdCarousel(ads, placement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ad-carousel-wrapper';

    const container = document.createElement('div');
    container.className = 'ad-carousel-container';

    ads.forEach(ad => {
      const slide = document.createElement('div');
      slide.className = 'ad-carousel-slide';
      slide.appendChild(createAdDiscoveryCard(ad, placement));
      container.appendChild(slide);
    });

    wrapper.appendChild(container);

    // Create pagination dots if multiple items
    if (ads.length > 1) {
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'ad-carousel-dots';

      const dots = [];
      ads.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `ad-carousel-dot ${i === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => {
          scrollToSlide(i);
        });
        dotsContainer.appendChild(dot);
        dots.push(dot);
      });
      wrapper.appendChild(dotsContainer);

      // Auto-rotation
      let currentSlide = 0;
      let intervalId = setInterval(() => {
        currentSlide = (currentSlide + 1) % ads.length;
        scrollToSlide(currentSlide);
      }, 6000);

      // Touch / Swipe Gestures
      let startX = 0;
      container.addEventListener('touchstart', (e) => {
        clearInterval(intervalId);
        startX = e.touches[0].clientX;
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;

        if (Math.abs(diffX) > 50) {
          if (diffX > 0) {
            currentSlide = (currentSlide + 1) % ads.length;
          } else {
            currentSlide = (currentSlide - 1 + ads.length) % ads.length;
          }
          scrollToSlide(currentSlide);
        }
      }, { passive: true });

      function scrollToSlide(index) {
        const slideWidth = container.clientWidth;
        container.scrollTo({
          left: slideWidth * index,
          behavior: 'smooth'
        });

        dots.forEach((d, i) => {
          d.classList.toggle('active', i === index);
        });
      }
    }

    return wrapper;
  }

  // ── Intersection Observer ──
  function setupIntersectionObserver(el, campaignId, placement) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            AdAnalyticsTracker.trackImpression(campaignId, placement);
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      observer.observe(el);
    } else {
      AdAnalyticsTracker.trackImpression(campaignId, placement);
    }
  }

  // ── Public APIs ──
  return {
    async injectMenuLanding(container) {
      // Show skeleton
      const skeleton = createSkeletonLoader();
      container.prepend(skeleton);

      try {
        const ads = await getAdsForPlacement('menu_landing', 3);
        skeleton.remove();
        if (ads.length > 0) {
          const carouselEl = createAdCarousel(ads, 'menu_landing');
          container.prepend(carouselEl);
        }
      } catch (err) {
        skeleton.remove();
        console.error(err);
      }
    },
    async injectInlineAds(gridContainer, category) {
      try {
        const ads = await getAdsForPlacement('inline', 1, { category });
        if (ads.length > 0) {
          const adEl = createAdPartnerCard(ads[0], 'inline');
          const children = Array.from(gridContainer.children);
          if (children.length >= 2) {
            gridContainer.insertBefore(adEl, children[2]);
          } else {
            gridContainer.appendChild(adEl);
          }
        }
      } catch (err) {
        console.error(err);
      }
    },
    async injectEmptyCart(container) {
      try {
        const ads = await getAdsForPlacement('cart_empty', 1);
        if (ads.length > 0) {
          // Remove any existing empty cart ad in this container
          const existingAd = container.parentNode ? container.parentNode.querySelector('.ad-reward-card') : container.querySelector('.ad-reward-card');
          if (existingAd) existingAd.remove();

          const adEl = createAdRewardCard(ads[0], 'cart_empty');
          // Place the ad right above the subtotal area (outside the scrollable cart items)
          if (container && container.parentNode) {
            container.parentNode.insertBefore(adEl, container);
          } else {
            container.appendChild(adEl);
          }
        }
      } catch (err) {
        console.error(err);
      }
    },
    async injectOrderTracking(container) {
      try {
        const ads = await getAdsForPlacement('order_tracking', 2);
        container.innerHTML = '';
        if (ads.length > 0) {
          if (ads.length > 1) {
            const carouselEl = createAdCarousel(ads, 'order_tracking');
            container.appendChild(carouselEl);
          } else {
            const adEl = createAdPremiumBanner(ads[0], 'order_tracking');
            container.appendChild(adEl);
          }
        }
      } catch (err) {
        console.error(err);
      }
    },
    async injectBillAd(container) {
      try {
        const ads = await getAdsForPlacement('bill', 1);
        container.innerHTML = '';
        if (ads.length > 0) {
          // Exclusive reward / VIP benefits theme for bill
          const adEl = createAdRewardCard(ads[0], 'bill');
          container.appendChild(adEl);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };
})();
