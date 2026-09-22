'use strict';

/* ── Drawer ── */
const Drawer = {
  _scrollY: 0,
  open() {
    this._scrollY = window.scrollY;
    document.getElementById('nav-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    const b = document.body;
    b.style.position = 'fixed'; b.style.top = `-${this._scrollY}px`;
    b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
  },
  close() {
    const drawer = document.getElementById('nav-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    const b = document.body;
    b.style.position = b.style.top = b.style.left = b.style.right = b.style.width = '';
    window.scrollTo(0, this._scrollY);
  }
};
document.querySelectorAll('#nav-drawer nav a').forEach(a => a.addEventListener('click', () => Drawer.close()));


/* ── Search ── */
const Search = {
  _active: false,
  toggle() {
    const bar = document.getElementById('search-bar');
    if (!bar) return;
    if (this._active) {
      bar.classList.remove('open');
      this._active = false;
      document.getElementById('search-input').value = '';
      this.run('');
    } else {
      bar.classList.add('open');
      this._active = true;
      document.getElementById('search-input').focus();
    }
  },
  run(val) {
    const q = val.trim().toLowerCase();
    const grid = document.getElementById('product-grid');
    let visible = 0;
    document.querySelectorAll('.product-card').forEach(card => {
      const name = (card.querySelector('.product-name')?.textContent || '').toLowerCase();
      const show = !q || name.includes(q);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    let noResult = document.getElementById('search-no-result');
    if (q && visible === 0) {
      if (!noResult) {
        noResult = document.createElement('p');
        noResult.id = 'search-no-result';
        noResult.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px 0;color:var(--c-secondary);font-size:14px';
        grid?.appendChild(noResult);
      }
      noResult.textContent = `找不到「${val.trim()}」相關商品`;
    } else if (noResult) {
      noResult.remove();
    }
  }
};


/* ── Category Filter ── */
const CAT_MAP = {
  top:         ['top', 'tshirt', 'blouse', 'shortsleeve', 'longsleeve'],
  bottom:      ['bottom', 'pants', 'shorts', 'skirt', 'longskirt'],
  accessories: ['accessories', 'cap', 'shoes', 'necklace', 'bracelet', 'accessory'],
};

function filterCat(cat) {
  document.querySelectorAll('.sidebar-btn, .mobile-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  const showCats = CAT_MAP[cat] || [cat];
  document.querySelectorAll('.product-card').forEach(card => {
    const cardCats = (card.getAttribute('data-cat') || '').split(/\s+/);
    card.style.display = (cat === 'all' || cardCats.some(c => showCats.includes(c))) ? '' : 'none';
  });
}


/* ── Cart ── */
const Cart = {
  _items: [],
  _save() { localStorage.setItem('cart', JSON.stringify(this._items)); },
  _load() {
    try { this._items = JSON.parse(localStorage.getItem('cart') || '[]'); } catch { this._items = []; }
  },
  clear() { this._items = []; this._save(); this._render(); },
  open() {
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-overlay').classList.add('open');
  },
  close() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  },
  add(item) {
    const ex = this._items.find(i => i.id === item.id && i.color === (item.color || '') && i.size === (item.size || ''));
    if (ex) ex.qty += (item.qty || 1);
    else this._items.push({ qty: 1, ...item });
    this._save();
    this._render();
    Toast.show('已加入購物車！');
  },
  remove(idx) { this._items.splice(idx, 1); this._save(); this._render(); },
  _render() {
    const body   = document.getElementById('cart-body');
    const totalEl = document.getElementById('cart-total');
    const badge  = document.getElementById('cart-badge');
    if (!badge && !body) return;

    const count = this._items.reduce((s, i) => s + i.qty, 0);
    const total = this._items.reduce((s, i) => s + i.price * i.qty, 0);

    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('show', count > 0);
    }
    if (totalEl) totalEl.textContent = 'NT$' + total.toLocaleString();
    if (!body) return;

    if (!this._items.length) {
      body.innerHTML = `<div class="cart-empty-state">
        <span class="material-symbols-outlined">shopping_cart</span>
        <p>購物車還空著</p>
        <a href="/#shop" onclick="Cart.close()">去逛逛 →</a>
      </div>`;
      return;
    }
    const API_BASE = 'https://brand-api.crazyfunlife8.workers.dev';
    body.innerHTML = this._items.map((item, idx) => {
      const imgSrc = item.image
        ? (item.image.startsWith('http') ? item.image : `${API_BASE}/images/${item.image}`)
        : '';
      return `
      <div class="cart-item">
        <div class="cart-item-img">${imgSrc ? `<img src="${imgSrc}" alt="${item.name}">` : ''}</div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          ${item.color || item.size ? `<p class="cart-item-variant">${[item.color, item.size].filter(Boolean).join(' / ')}</p>` : ''}
          <div class="cart-item-row">
            <span class="cart-item-price">NT$${item.price.toLocaleString()}</span>
            <span class="cart-item-qty">× ${item.qty}</span>
          </div>
          <button class="cart-item-remove" onclick="Cart.remove(${idx})">
            <span class="material-symbols-outlined">delete</span>移除
          </button>
        </div>
      </div>
    `}).join('');
  }
};


/* ── Contact FAB ── */
const Contact = {
  toggle() {
    const pop = document.getElementById('contact-pop');
    if (!pop) return;
    const isOpen = pop.classList.contains('open');
    pop.classList.toggle('open', !isOpen);
    document.getElementById('fab-btn').setAttribute('aria-expanded', String(!isOpen));
  },
  close() {
    const pop = document.getElementById('contact-pop');
    const btn = document.getElementById('fab-btn');
    if (pop) pop.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
};
document.addEventListener('click', e => {
  const pop = document.getElementById('contact-pop');
  const fab = document.getElementById('fab-btn');
  if (pop && fab && pop.classList.contains('open') && !pop.contains(e.target) && !fab.contains(e.target)) Contact.close();
});


/* ── Toast ── */
const Toast = {
  show(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    if (msg) t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { t.classList.remove('show'); t.textContent = ''; }, 2200);
  }
};


/* ── Escape key ── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  Drawer.close();
  Cart.close();
  Contact.close();
  const searchBar = document.getElementById('search-bar');
  if (searchBar) { searchBar.classList.remove('open'); Search._active = false; }
});


/* ── Header scroll shadow ── */
window.addEventListener('scroll', () => {
  const header = document.getElementById('site-header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });


/* ── Scroll Reveal ── */
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));


/* ── Shared Footer ── */
(function renderFooter() {
  const footer = document.createElement('footer');
  footer.innerHTML = `
  <div class="footer-wrap">
    <div class="footer-grid">

      <div>
        <div class="footer-brand-text">EMBER</div>
        <p class="footer-blurb">溫暖日常的穿搭提案，精選每一件讓你感受溫度的衣物。</p>

        <div class="footer-social">
          <a href="#" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
            <b>LINE 社群</b><i>New in · Live</i>
          </a>
          <a href="#" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            <b>賣場 IG</b><i>Daily New</i>
          </a>
          <a href="#" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.868 1.206 8.602.016 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 013.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.298-.883-2.363-.886h-.018c-.882 0-1.952.25-2.857 1.446l-1.644-1.18C7.863 3.354 9.429 2.986 11.07 2.986h.03c3.873.04 6.027 2.274 6.27 6.324.47.117.917.262 1.338.433 1.357.555 2.387 1.438 2.985 2.556.811 1.513.776 3.662-.09 5.533-1.26 2.742-3.656 4.131-7.417 4.168h-.003z"/></svg>
            <b>Threads</b><i>Threads</i>
          </a>
        </div>

      </div>

      <div class="footer-cols">
        <div class="footer-col">
          <h5>Shop · 逛逛</h5>
          <a href="index.html#new-zone">新品專區</a>
          <a href="index.html#shop">全部商品</a>
        </div>
        <div class="footer-col">
          <h5>About · 品牌</h5>
          <a href="#">品牌理念</a>
          <a href="#">聯絡我們</a>
        </div>
        <div class="footer-col">
          <h5>Care · 服務</h5>
          <a href="/notice">購物須知</a>
          <a href="/privacy">隱私權政策</a>
        </div>
      </div>

    </div>

    <div class="footer-bar">
      <span class="ft-copy">© 2026 Ember</span>
      <span class="ft-tagline">Wear the Warmth</span>
    </div>
  </div>`;
  document.body.appendChild(footer);
})();

/* ── Cart Init ── */
Cart._load();
Cart._render();

/* ── Explicit globals (ensure cross-script access) ── */
window.Cart    = Cart;
window.Toast   = Toast;
window.Drawer  = Drawer;
window.Search  = Search;
window.Contact = Contact;
window.filterCat = filterCat;
