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
    document.getElementById('nav-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    const b = document.body;
    b.style.position = b.style.top = b.style.left = b.style.right = b.style.width = '';
    window.scrollTo(0, this._scrollY);
  }
};
document.querySelectorAll('#nav-drawer nav a').forEach(a => a.addEventListener('click', () => Drawer.close()));


/* ── Search ── */
const Search = {
  toggle() {
    const bar = document.getElementById('search-bar');
    if (bar.classList.contains('open')) {
      bar.classList.remove('open');
    } else {
      bar.classList.add('open');
      document.getElementById('search-input').focus();
    }
  },
  run(val) {
    const q = val.trim().toLowerCase();
    document.querySelectorAll('.product-card').forEach(card => {
      const name = (card.querySelector('.product-name')?.textContent || '').toLowerCase();
      card.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
  }
};


/* ── Category Filter ── */
// 父分類 → 子分類對應（點父項時也顯示所有子項商品）
const CAT_MAP = {
  top:    ['top', 'tshirt', 'longsleeve'],
  bottom: ['bottom', 'pants', 'shorts', 'skirt'],
  warm:   ['warm', 'thermal', 'knit', 'jacket', 'fleece'],
};

function filterCat(cat) {
  // 同步更新所有篩選按鈕的 active 狀態
  document.querySelectorAll('.sidebar-btn, .mobile-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  // 父分類點擊時，展示其所有子分類商品
  const showCats = CAT_MAP[cat] || [cat];
  // 顯示 / 隱藏商品卡
  document.querySelectorAll('.product-card').forEach(card => {
    const cardCats = (card.getAttribute('data-cat') || '').split(/\s+/);
    card.style.display = (cat === 'all' || cardCats.some(c => showCats.includes(c))) ? '' : 'none';
  });
}


/* ── Cart ── */
const Cart = {
  _items: [],
  open() {
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-overlay').classList.add('open');
  },
  close() {
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('open');
  },
  add(item) {
    const ex = this._items.find(i => i.id === item.id && i.variant === (item.variant || ''));
    if (ex) ex.qty += (item.qty || 1);
    else this._items.push({ qty: 1, ...item });
    this._render();
    Toast.show();
  },
  remove(idx) { this._items.splice(idx, 1); this._render(); },
  _render() {
    const body = document.getElementById('cart-body');
    const totalEl = document.getElementById('cart-total');
    const badge = document.getElementById('cart-badge');
    const count = this._items.reduce((s, i) => s + i.qty, 0);
    const total = this._items.reduce((s, i) => s + i.price * i.qty, 0);

    badge.textContent = count;
    badge.classList.toggle('show', count > 0);
    if (totalEl) totalEl.textContent = 'NT$' + total.toLocaleString();

    if (!this._items.length) {
      body.innerHTML = `<div class="cart-empty-state">
        <span class="material-symbols-outlined">shopping_cart</span>
        <p>購物車還空著</p>
        <a href="#shop" onclick="Cart.close()">去逛逛 →</a>
      </div>`;
      return;
    }
    body.innerHTML = this._items.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-img">${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}</div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          ${item.variant ? `<p class="cart-item-variant">${item.variant}</p>` : ''}
          <div class="cart-item-row">
            <span class="cart-item-price">NT$${item.price.toLocaleString()}</span>
            <span class="cart-item-qty">× ${item.qty}</span>
          </div>
          <button class="cart-item-remove" onclick="Cart.remove(${idx})">
            <span class="material-symbols-outlined">delete</span>移除
          </button>
        </div>
      </div>
    `).join('');
  }
};


/* ── Contact FAB ── */
const Contact = {
  toggle() {
    const pop = document.getElementById('contact-pop');
    const isOpen = pop.classList.contains('open');
    pop.classList.toggle('open', !isOpen);
    document.getElementById('fab-btn').setAttribute('aria-expanded', String(!isOpen));
  },
  close() {
    document.getElementById('contact-pop').classList.remove('open');
    document.getElementById('fab-btn').setAttribute('aria-expanded', 'false');
  }
};
document.addEventListener('click', e => {
  const pop = document.getElementById('contact-pop');
  const fab = document.getElementById('fab-btn');
  if (pop.classList.contains('open') && !pop.contains(e.target) && !fab.contains(e.target)) Contact.close();
});


/* ── Toast ── */
const Toast = {
  show() {
    const t = document.getElementById('toast');
    t.classList.add('show');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }
};


/* ── Escape key ── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  Drawer.close(); Cart.close(); Contact.close();
  document.getElementById('search-bar').classList.remove('open');
});


/* ── Header scroll shadow ── */
window.addEventListener('scroll', () => {
  document.getElementById('site-header').classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });


/* ── Scroll Reveal ── */
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));