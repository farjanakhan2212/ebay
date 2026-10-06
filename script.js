/* ==========================================================================
   eBay Marketplace — front-end behaviour
   --------------------------------------------------------------------------
   Everything is vanilla JS, data is read from the DOM (data-* attributes) so
   product information is never duplicated. State that must survive a reload
   (cart + watchlist) is kept in localStorage.
   ========================================================================== */

(function () {
    'use strict';

    /* ---------------------------------------------------------------- utils */

    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) {
        return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    };

    var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

    function store(key, value) {
        try {
            if (value === undefined) {
                var raw = window.localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            }
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            return null;
        }
        return value;
    }

    function norm(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9$]+/g, ' ')
            .trim();
    }

    function debounce(fn, wait) {
        var t;
        return function () {
            var ctx = this, args = arguments;
            window.clearTimeout(t);
            t = window.setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /* ------------------------------------------------------------- 25. toast */

    var TOAST_ICON = {
        ok: 'fa-circle-check',
        info: 'fa-circle-info',
        warn: 'fa-triangle-exclamation'
    };

    function showToast(message, type, actionLabel, onAction) {
        var host = $('#toasts');
        if (!host) { return; }

        var kind = type || 'ok';
        var el = document.createElement('div');
        el.className = 'toast toast--' + kind;

        var ico = document.createElement('span');
        ico.className = 'toast__ico';
        ico.setAttribute('aria-hidden', 'true');
        ico.innerHTML = '<i class="fa-solid ' + (TOAST_ICON[kind] || TOAST_ICON.ok) + '"></i>';
        el.appendChild(ico);

        var txt = document.createElement('span');
        txt.textContent = message;
        el.appendChild(txt);

        function dismiss() {
            el.classList.add('is-out');
            window.setTimeout(function () {
                if (el.parentNode) { el.parentNode.removeChild(el); }
            }, 260);
        }

        if (actionLabel) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'linkbtn';
            btn.style.color = '#9fc3ff';
            btn.textContent = actionLabel;
            btn.addEventListener('click', function () {
                if (typeof onAction === 'function') { onAction(); }
                dismiss();
            });
            el.appendChild(btn);
            el.style.pointerEvents = 'auto';
        }

        host.appendChild(el);
        window.setTimeout(dismiss, actionLabel ? 6500 : 3200);

        /* keep at most three toasts on screen */
        while (host.children.length > 3) { host.removeChild(host.firstChild); }
    }

    /* --------------------------------------------------- 30. boot / preloader */

    function initBoot() {
        var boot = $('#boot');
        if (!boot) { return; }

        function done() { boot.classList.add('is-done'); }

        if (document.readyState === 'complete') {
            window.setTimeout(done, 180);
        } else {
            window.addEventListener('load', function () { window.setTimeout(done, 180); });
        }
        /* safety net — never trap the user behind the loader */
        window.setTimeout(done, 2600);
    }

    /* --------------------------------------------- 7. sticky header + scroll */

    function initStickyHeader() {
        var header = $('#siteHeader');
        if (!header) { return; }
        var ticking = false;

        function update() {
            header.classList.toggle('is-stuck', window.scrollY > 24);
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(update);
            }
        }, { passive: true });

        update();
    }

    /* ------------------------------------------------------ 29. back to top */

    function initBackToTop() {
        var btn = $('#toTop');
        if (!btn) { return; }

        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: REDUCED.matches ? 'auto' : 'smooth' });
        });
    }

    /* ------------------------------------------------------------- overlays */

var openLayer = null;
var lastFocus = null;
var closeTimer = null;
var closingNode = null;
var focusTimer = null;

    function focusables(root) {
        return $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', root)
            .filter(function (el) {
                return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
            });
    }

    function lockScroll(on) {
        document.body.classList.toggle('is-open', on);
    }

function openOverlay(node, opts) {
if (!node) { return; }
closeOverlay(true);

/* If this exact layer is still finishing its close animation, cancel that hide —
   otherwise it would fire after this open and leave the layer invisible while
   still registered as open. A pending hide for a *different* layer must run. */
if (closeTimer && closingNode === node) {
window.clearTimeout(closeTimer);
closeTimer = null;
closingNode = null;
}

/* Safari does not focus <button> on click, so document.activeElement can still
be <body>. Prefer the element that explicitly asked to open the layer. */
lastFocus = (opts && opts.returnTo) || document.activeElement;
if (!lastFocus || lastFocus === document.body) { lastFocus = node; }
openLayer = node;

node.hidden = false;
node.classList.remove('is-closing');

var overlay = $('#overlay');
if (overlay && !(opts && opts.noOverlay)) { overlay.hidden = false; }
if (overlay && opts && opts.ownBackdrop) { overlay.hidden = true; }

lockScroll(true);

if (focusTimer) { window.clearTimeout(focusTimer); }
focusTimer = window.setTimeout(function () {
focusTimer = null;
var list = focusables(node);
(list[0] || node).focus();
}, 40);
}

    function closeOverlay(silent) {
if (!openLayer) { return; }

var node = openLayer;
openLayer = null;

node.classList.add('is-closing');
lockScroll(false);

var overlay = $('#overlay');
if (overlay) { overlay.hidden = true; }

if (closeTimer) { window.clearTimeout(closeTimer); }
closingNode = node;
closeTimer = window.setTimeout(function () {
closeTimer = null;
closingNode = null;
node.hidden = true;
node.classList.remove('is-closing');
}, silent ? 0 : 220);

if (lastFocus && lastFocus !== node && typeof lastFocus.focus === 'function') {
lastFocus.focus();
}
lastFocus = null;
}

    /* --------------------------------------------------- 34. card data reader */

    function readCard(el) {
        if (!el) { return null; }
        var img = $('img', el);
        return {
            id: el.getAttribute('data-id') || el.getAttribute('data-name'),
            name: el.getAttribute('data-name') || (img ? img.alt : 'Item'),
            cat: el.getAttribute('data-cat') || '',
            img: el.getAttribute('data-img') || (img ? img.getAttribute('src') : '')
        };
    }

    /* ------------------------------------------------------------- 14 / 15 */

    var CART_KEY = 'ebay.cart.v1';
    var WATCH_KEY = 'ebay.watchlist.v1';

    var cart = store(CART_KEY) || [];
    var watchlist = store(WATCH_KEY) || [];

    function saveCart() { store(CART_KEY, cart); }
    function saveWatch() { store(WATCH_KEY, watchlist); }

    function cartCount() {
        return cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    }

    function updateCounts(bump) {
        $$('[data-count]').forEach(function (pill) {
            var n = pill.getAttribute('data-count') === 'cart' ? cartCount() : watchlist.length;
            pill.textContent = String(n);
            pill.hidden = n === 0;

            if (bump && n > 0) {
                var host = pill.closest('.icon-btn') || pill;
                host.classList.remove('pulse');
                /* force reflow so the animation can replay */
                void host.offsetWidth;
                host.classList.add('pulse');
                window.setTimeout(function () { host.classList.remove('pulse'); }, 500);
            }
        });

        var cartTotal = $('[data-cart-total]');
        if (cartTotal) { cartTotal.textContent = String(cartCount()); }

        var cartBadge = $('[data-cart-count]');
        if (cartBadge) { cartBadge.textContent = String(cart.length); }

        var watchBadge = $('[data-watch-count]');
        if (watchBadge) { watchBadge.textContent = String(watchlist.length); }

        $$('[data-watchlist]').forEach(function (btn) {
            var card = readCard(btn.closest('[data-id]'));
            var on = !!card && watchlist.some(function (w) { return w.id === card.id; });
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            var icon = $('.fa-heart', btn);
            if (icon) {
                icon.className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
        });
    }

    /* ---- cart ---- */

    function addToCart(item, qty) {
        if (!item) { return; }
        var amount = Math.max(1, qty || 1);
        var found = null;

        cart.forEach(function (line) { if (line.id === item.id) { found = line; } });

        if (found) {
            found.qty = clamp(found.qty + amount, 1, 99);
        } else {
            cart.push({
                id: item.id,
                name: item.name,
                cat: item.cat,
                img: item.img,
                qty: amount
            });
        }

        saveCart();
        renderCart();
        updateCounts(true);
        showToast('“' + item.name + '” added to cart', 'ok');
    }

    function setQty(id, delta) {
        cart.forEach(function (line) {
            if (line.id !== id) { return; }
            line.qty = clamp(line.qty + delta, 0, 99);
        });
        cart = cart.filter(function (line) { return line.qty > 0; });
        saveCart();
        renderCart();
        updateCounts(false);
    }

    function removeLine(id) {
        var name = '';
        cart.forEach(function (line) { if (line.id === id) { name = line.name; } });
        cart = cart.filter(function (line) { return line.id !== id; });
        saveCart();
        renderCart();
        updateCounts(false);
        showToast('Removed “' + name + '” from cart', 'info');
    }

    function renderCart() {
        var host = $('[data-cart-items]');
        if (!host) { return; }

        if (!cart.length) {
            host.innerHTML = '<p class="drawer__empty">Your cart is empty. Add something you love from the marketplace.</p>';
            return;
        }

        host.innerHTML = cart.map(function (line) {
            return '<div class="lineitem" data-line="' + line.id + '">' +
                '<span class="lineitem__media"><img src="' + line.img + '" alt="" loading="lazy"></span>' +
                '<div>' +
                '<p class="lineitem__name">' + line.name + '</p>' +
                '<p class="lineitem__meta">' + (line.cat || 'Marketplace') + '</p>' +
                '<div class="lineitem__row">' +
                '<span class="stepper">' +
                '<button type="button" data-line-step="-1" aria-label="Decrease quantity of ' + line.name + '">' +
                '<i class="fa-solid fa-minus" aria-hidden="true"></i></button>' +
                '<output>' + line.qty + '</output>' +
                '<button type="button" data-line-step="1" aria-label="Increase quantity of ' + line.name + '">' +
                '<i class="fa-solid fa-plus" aria-hidden="true"></i></button>' +
                '</span>' +
                '<button class="lineitem__remove" type="button" data-line-remove>Remove</button>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    /* ---- watchlist ---- */

    function toggleWatch(item) {
        if (!item) { return; }
        var i = -1;
        watchlist.forEach(function (w, idx) { if (w.id === item.id) { i = idx; } });

        if (i > -1) {
            watchlist.splice(i, 1);
            showToast('Removed from your watchlist', 'info');
        } else {
            watchlist.push({ id: item.id, name: item.name, cat: item.cat, img: item.img });
            showToast('Added to your watchlist', 'ok');
        }

        saveWatch();
        renderWatch();
        updateCounts(false);
        syncQuickViewButton();
    }

    function inWatchlist(id) {
        return watchlist.some(function (w) { return w.id === id; });
    }

    function renderWatch() {
        var host = $('[data-watch-items]');
        if (!host) { return; }

        if (!watchlist.length) {
            host.innerHTML = '<p class="drawer__empty">Nothing saved yet. Tap the heart on any item to keep it here.</p>';
            return;
        }

        host.innerHTML = watchlist.map(function (line) {
            return '<div class="lineitem" data-line="' + line.id + '">' +
                '<span class="lineitem__media"><img src="' + line.img + '" alt="" loading="lazy"></span>' +
                '<div>' +
                '<p class="lineitem__name">' + line.name + '</p>' +
                '<p class="lineitem__meta">' + (line.cat || 'Marketplace') + '</p>' +
                '<div class="lineitem__row">' +
                '<button class="btn btn--primary btn--sm" type="button" data-line-add>Add to cart</button>' +
                '<button class="lineitem__remove" type="button" data-line-unwatch>Remove</button>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    /* ------------------------------------------------------- 15/18. drawers */

    function initDrawers() {
        var overlay = $('#overlay');

        if (overlay) {
            overlay.addEventListener('click', function () { closeOverlay(); });
        }

        document.addEventListener('click', function (evt) {
            var opener = evt.target.closest('[data-open]');
            if (opener) {
                var which = opener.getAttribute('data-open');
                var target = which === 'cart' ? $('#cartDrawer') : $('#watchDrawer');
if (target) {
evt.preventDefault();
openOverlay(target, { returnTo: opener });
}
                return;
            }

            var closer = evt.target.closest('[data-close]');
            if (closer) {
                evt.preventDefault();
                closeOverlay();
            }
        });

        /* cart line controls (event delegation) */
        document.addEventListener('click', function (evt) {
            var step = evt.target.closest('[data-line-step]');
            if (step) {
                var line = step.closest('[data-line]');
                if (line) { setQty(line.getAttribute('data-line'), Number(step.getAttribute('data-line-step'))); }
                return;
            }

            var rm = evt.target.closest('[data-line-remove]');
            if (rm) {
                var line = rm.closest('[data-line]');
                if (line) { removeLine(line.getAttribute('data-line')); }
                return;
            }

            var unwatch = evt.target.closest('[data-line-unwatch]');
            if (unwatch) {
                var wline = unwatch.closest('[data-line]');
                if (wline) {
                    var wid = wline.getAttribute('data-line');
                    var name = '';
                    watchlist.forEach(function (w) { if (w.id === wid) { name = w.name; } });
                    watchlist = watchlist.filter(function (w) { return w.id !== wid; });
                    saveWatch();
                    renderWatch();
                    updateCounts(false);
                    showToast('Removed “' + name + '” from your watchlist', 'info');
                }
                return;
            }

            var wadd = evt.target.closest('[data-line-add]');
            if (wadd) {
                var aline = wadd.closest('[data-line]');
                if (aline) {
                    var id = aline.getAttribute('data-line');
                    var item = null;
                    watchlist.forEach(function (w) { if (w.id === id) { item = w; } });
                    addToCart({ id: item.id, name: item.name, cat: item.cat, img: item.img }, 1);
                }
            }
        });

        var clearCart = $('[data-clear-cart]');
        if (clearCart) {
            clearCart.addEventListener('click', function () {
                if (!cart.length) { showToast('Your cart is already empty', 'info'); return; }
                var n = cart.length;
                cart = [];
                saveCart();
                renderCart();
                updateCounts(false);
                showToast('Cleared ' + n + ' item' + (n > 1 ? 's' : '') + ' from your cart', 'info');
            });
        }

        var clearWatch = $('[data-clear-watch]');
        if (clearWatch) {
            clearWatch.addEventListener('click', function () {
                if (!watchlist.length) { showToast('Your watchlist is already empty', 'info'); return; }
                watchlist = [];
                saveWatch();
                renderWatch();
                updateCounts(false);
                syncQuickViewButton();
                showToast('Watchlist cleared', 'info');
            });
        }

        var checkout = $('[data-checkout]');
        if (checkout) {
            checkout.addEventListener('click', function () {
                if (!cart.length) {
                    showToast('Add something to your cart first', 'warn');
                    return;
                }
                showToast('Demo storefront — no payment is processed', 'info');
            });
        }

        renderCart();
        renderWatch();
        updateCounts(false);
    }

    /* ------------------------------------------------------- 13. quick view */

    var qvCard = null;
    var qvQty = 1;

    function syncQuickViewButton() {
        var btn = $('[data-qv-watch]');
        if (!btn || !qvCard) { return; }
        var on = inWatchlist(qvCard.id);
        btn.innerHTML = '<i class="' + (on ? 'fa-solid' : 'fa-regular') +
            ' fa-heart" aria-hidden="true"></i> ' + (on ? 'In your watchlist' : 'Add to watchlist');
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function setQtyOutput() {
        var out = $('#qvQty');
        if (out) { out.textContent = String(qvQty); }
    }

    function initQuickView() {
        var modal = $('#quickModal');

        document.addEventListener('click', function (evt) {
            var trigger = evt.target.closest('[data-quickview]');
            if (!trigger) { return; }

            var card = trigger.closest('[data-id]');
            var data = readCard(card);
            if (!data || !modal) { return; }

            qvCard = data;
            qvQty = 1;

            $('#qvImage').setAttribute('src', data.img);
            $('#qvImage').setAttribute('alt', data.name);
            $('#qvCategory').textContent = data.cat || 'Marketplace';
            $('#qvTitle').textContent = data.name;
            $('#qvText').textContent = 'Part of the ' + (data.cat || 'marketplace') +
                ' collection on this storefront.';
            $('#qvCollection').textContent = data.cat || 'Marketplace';
            setQtyOutput();
            syncQuickViewButton();

            openOverlay(modal);
        });

        document.addEventListener('click', function (evt) {
            var step = evt.target.closest('[data-qty]');
            if (!step) { return; }
            qvQty = clamp(qvQty + Number(step.getAttribute('data-qty')), 1, 99);
            setQtyOutput();
        });

        var add = $('[data-qv-add]');
        if (add) {
            add.addEventListener('click', function () {
                addToCart(qvCard, qvQty);
            });
        }

        var watch = $('[data-qv-watch]');
        if (watch) {
            watch.addEventListener('click', function () { toggleWatch(qvCard); });
        }

        if (modal) {
            modal.addEventListener('click', function (evt) {
                if (evt.target === modal) { closeOverlay(); }
            });
        }
    }

    /* -------------------------------------------------- 11 / 14. card actions */

    function initCardActions() {
        document.addEventListener('click', function (evt) {
            var add = evt.target.closest('[data-addcart]');
            if (add) {
                addToCart(readCard(add.closest('[data-id]')), 1);
                return;
            }

            var fav = evt.target.closest('[data-watchlist]');
            if (fav) {
                fav.classList.add('is-beat');
                window.setTimeout(function () { fav.classList.remove('is-beat'); }, 450);
                toggleWatch(readCard(fav.closest('[data-id]')));
            }
        });
    }

    /* ---------------------------------------------------- 9 / 40. navigation */

    function closeAllDropdowns(except) {
        $$('[data-dropdown]').forEach(function (dd) {
            if (dd === except) { return; }
            dd.classList.remove('is-open');
            var trigger = $('[data-dropdown-trigger]', dd);
            if (trigger) { trigger.setAttribute('aria-expanded', 'false'); }
        });
    }

    function initNavigation() {
        /* dropdowns */
        $$('[data-dropdown]').forEach(function (dd) {
            var trigger = $('[data-dropdown-trigger]', dd);
            if (!trigger) { return; }

            trigger.addEventListener('click', function (evt) {
                evt.stopPropagation();
                var open = dd.classList.toggle('is-open');
                trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open) { closeAllDropdowns(dd); }
            });

            dd.addEventListener('mouseenter', function () {
                if (window.matchMedia('(min-width: 861px)').matches) {
                    closeAllDropdowns(dd);
                    dd.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
            });

            dd.addEventListener('mouseleave', function () {
                if (window.matchMedia('(min-width: 861px)').matches) {
                    dd.classList.remove('is-open');
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });

            trigger.addEventListener('keydown', function (evt) {
                if (evt.key === 'ArrowDown') {
                    evt.preventDefault();
                    dd.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                    var first = $('.dropdown__menu a, .dropdown__menu button', dd);
                    if (first) { first.focus(); }
                }
            });

            dd.addEventListener('keydown', function (evt) {
                if (evt.key === 'Escape') {
                    dd.classList.remove('is-open');
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.focus();
                }
            });
        });

        document.addEventListener('click', function () { closeAllDropdowns(null); });

        /* in-page smooth scrolling */
        document.addEventListener('click', function (evt) {
            var link = evt.target.closest('[data-scroll]');
            if (!link) { return; }
            var id = link.getAttribute('href') || '';
            if (id.charAt(0) !== '#' || id.length < 2) { return; }

            var target = document.getElementById(id.slice(1));
            if (!target) { return; }

            evt.preventDefault();
            closeOverlay();
            target.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });

            var list = $('#catnavList');
            if (list) {
                $$('a, button', list).forEach(function (item) { item.classList.remove('is-active'); });
                if (link.closest('#catnavList')) { link.classList.add('is-active'); }
            }
        });

        /* honest feedback for links with no page in this demo */
        document.addEventListener('click', function (evt) {
            var demo = evt.target.closest('[data-demo]');
            if (!demo) { return; }
            showToast(demo.getAttribute('data-demo') + ' — not part of this front-end demo', 'info');
        });

        var notify = $('[data-notify]');
        if (notify) {
            notify.addEventListener('click', function () {
                showToast('No new notifications', 'info');
            });
        }

        /* back to top visibility */
        var toTop = $('#toTop');
        if (toTop) {
            var onScroll = function () {
                toTop.hidden = window.scrollY < 520;
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            onScroll();
        }
    }

    /* ------------------------------------------------------ 26. mobile menu */

    function initMobileMenu() {
        var panel = $('#mobileNav');
        var toggle = $('[data-menu-toggle]');
        if (!panel || !toggle) { return; }

        function setOpen(open) {
            if (open) {
                panel.hidden = false;
                lockScroll(true);
                window.setTimeout(function () {
                    var first = focusables(panel)[0];
                    if (first) { first.focus(); }
                }, 40);
            } else {
                panel.hidden = true;
                lockScroll(false);
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        toggle.addEventListener('click', function () { setOpen(panel.hidden); });

        document.addEventListener('click', function (evt) {
            if (evt.target.closest('[data-menu-close]')) { setOpen(false); return; }
            if (evt.target === panel) { setOpen(false); return; }
            if (evt.target.closest('#mobileNav a, #mobileNav button:not([data-menu-close])')) {
                window.setTimeout(function () { setOpen(false); }, 60);
            }
        });

        /* mobile search panel */
        var searchBtn = $('[data-mobile-search]');
        var searchPanel = $('#mobileSearch');
        if (searchBtn && searchPanel) {
            searchBtn.addEventListener('click', function () {
                var open = searchPanel.hidden;
                searchPanel.hidden = !open;
                searchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open) {
                    window.setTimeout(function () {
                        var field = $('#mobileSearchInput');
                        if (field) { field.focus(); }
                    }, 60);
                }
            });
        }
    }

    /* ------------------------------------------------- 8. search + suggestions */

/* Maps a typed phrase onto content that already exists on the page.
       Every target below must match a real .catcard / .pcard / .iconchip —
       audit: the searchable corpus is Luxury, Sneakers, P&A, Trading cards,
       Refurbished, Pre-loved Luxury, Toys, Kitchen, Smart, Gift Hunt,
       eBay Live, Holiday (Lights, Ornaments, Outdoor decor, Trees,
       Stockings, Tree skirts, Wreaths) and the eBay Live titles. */
var ALIASES = {
phone: ['smart'],
smartphone: ['smart'],
mobile: ['smart'],
cellphone: ['smart'],
electronics: ['smart'],
tech: ['smart'],
gadget: ['smart'],

shoe: ['sneakers'],
shoes: ['sneakers'],
sneaker: ['sneakers'],
footwear: ['sneakers'],
trainers: ['sneakers'],

card: ['trading cards'],
cards: ['trading cards'],
pokemon: ['trading cards'],
pokémon: ['trading cards'],
graded: ['trading cards'],
slabs: ['trading cards'],
collectible: ['trading cards'],
collectibles: ['trading cards', 'toys'],
gaming: ['trading cards', 'toys'],
game: ['trading cards', 'toys'],

gift: ['gift hunt'],
gifts: ['gift hunt'],
present: ['gift hunt'],
birthday: ['gift hunt'],

christmas: ['holiday', 'trees', 'ornaments', 'wreaths'],
xmas: ['holiday', 'trees', 'ornaments', 'wreaths'],
holiday: ['holiday', 'trees', 'ornaments', 'wreaths'],
holidays: ['holiday', 'trees', 'ornaments', 'wreaths'],
decor: ['ornaments', 'wreaths', 'outdoor decor', 'lights'],
decoration: ['ornaments', 'wreaths', 'outdoor decor', 'lights'],
winter: ['holiday'],
festive: ['holiday'],
stocking: ['stockings'],
stockings: ['stockings'],
tinsel: ['lights'],
light: ['lights'],
lights: ['lights'],

bag: ['luxury'],
bags: ['luxury'],
handbag: ['luxury'],
purse: ['luxury'],
fashion: ['luxury', 'sneakers'],
watch: ['luxury', 'pre loved luxury'],
watches: ['luxury', 'pre loved luxury'],
jewel: ['luxury', 'pre loved luxury'],
jewelry: ['luxury', 'pre loved luxury'],
jewellery: ['luxury', 'pre loved luxury'],
accessories: ['luxury'],

car: ['p and a'],
cars: ['p and a'],
auto: ['p and a'],
automotive: ['p and a'],
motor: ['p and a'],
motors: ['p and a'],
vehicle: ['p and a'],
tool: ['p and a'],
tools: ['p and a'],
hardware: ['p and a'],
parts: ['p and a'],

home: ['kitchen'],
kitchen: ['kitchen'],
cook: ['kitchen'],
cooking: ['kitchen'],

toy: ['toys'],
toys: ['toys'],
kids: ['toys'],
kid: ['toys'],

refurbished: ['refurbished'],
renewed: ['refurbished'],
used: ['refurbished', 'pre loved luxury'],
preowned: ['pre loved luxury'],
'pre owned': ['pre loved luxury'],
preloved: ['pre loved luxury'],

live: ['ebay live'],
livestream: ['ebay live'],
'live stream': ['ebay live'],
crystal: ['crystal'],
crystals: ['crystal'],
bagdrop: ['luxury']
};

    var SEARCHABLE = '.catcard, .pcard, .iconchip';

    var searchIndex = null;

    function buildIndex() {
        if (searchIndex) { return searchIndex; }
        var seen = {};
        searchIndex = [];

        $$(SEARCHABLE).forEach(function (el) {
            var data = readCard(el);
            if (!data || !data.name) { return; }
            var key = norm(data.name);
            if (!key || seen[key]) { return; }
            seen[key] = true;
            searchIndex.push({ name: data.name, cat: data.cat, img: data.img, key: key, el: el });
        });

        /* navigation labels make good suggestions too */
        $$('#catnavList a').forEach(function (a) {
            var name = a.textContent.replace(/New$/, '').trim();
            var key = norm(name);
            if (!key || seen[key]) { return; }
            seen[key] = true;
            searchIndex.push({ name: name, cat: 'Department', img: '', key: key, el: a });
        });

        return searchIndex;
    }

    function findSuggestions(query) {
        var q = norm(query);
        if (!q) { return []; }

        var extra = ALIASES[norm(query).replace(/\s+/g, '')] ||
            ALIASES[norm(query)] || [];

        var out = [];
        buildIndex().forEach(function (entry) {
            var score = 0;
            if (entry.key === q) { score = 100; }
            else if (entry.key.indexOf(q) === 0) { score = 80; }
            else if (entry.key.indexOf(q) > -1) { score = 60; }

            if (!score && extra.length) {
                for (var i = 0; i < extra.length; i++) {
                    if (entry.key.indexOf(norm(extra[i])) > -1) { score = 40; break; }
                }
            }

            if (score) {
                out.push({ entry: entry, score: score });
            }
        });

        out.sort(function (a, b) { return b.score - a.score; });
        return out.slice(0, 8).map(function (o) { return o.entry; });
    }

    function renderSuggest(box, list, input) {
        if (!list.length) {
            box.innerHTML = '<p class="suggest__empty">No suggestions yet — try “sneakers”, “cards” or “holiday”.</p>';
            box.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            return;
        }

        var html = '<p class="suggest__head">Suggestions</p>';
        list.forEach(function (entry, i) {
            html += '<button class="suggest__item" type="button" role="option" data-suggest="' +
                i + '" aria-selected="false">' +
                '<span class="suggest__ico">' +
                (entry.img ? '<img src="' + entry.img + '" alt="" loading="lazy">' : '<i class="fa-solid fa-tag"></i>') +
                '</span>' +
                '<span class="suggest__text"><strong>' + entry.name + '</strong>' +
                '<span>' + (entry.cat || 'Marketplace') + '</span></span>' +
                '<span class="suggest__tag">' + (entry.el ? 'Jump' : '') + '</span>' +
                '</button>';
        });
        html += '<p class="suggest__foot">Press Enter to search the marketplace.</p>';

        box.innerHTML = html;
        box.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function hideSuggest(box, input) {
        if (!box) { return; }
        box.hidden = true;
        box.innerHTML = '';
        if (input) { input.setAttribute('aria-expanded', 'false'); }
    }

function applySearch(query) {
var term = norm(query);
var cards = $$(SEARCHABLE);
var hits = 0;

var aliasKeys = (ALIASES[term.replace(/\s+/g, '')] || ALIASES[term] || []).map(norm);

function matches(key) {
if (!key) { return false; }
if (term && key.indexOf(term) > -1) { return true; }
return aliasKeys.some(function (a) { return a && key.indexOf(a) > -1; });
}

cards.forEach(function (el) {
var data = readCard(el);
var keys = [norm(data.name), norm(data.cat)];
var match = !!term && keys.some(matches);

el.classList.toggle('is-search-hidden', !match);

if (match) {
hits++;
if (el.classList.contains('pcard--more') || el.classList.contains('catcard--more')) {
var section = el.closest('section');
expandSection(section ? $('[data-seeall]', section) : null, true);
}
}
});

refreshEmptyStates();

if (!term) {
cards.forEach(function (el) { el.classList.remove('is-search-hidden'); });
refreshEmptyStates();
syncClearButtons(false);
return 0;
}

syncClearButtons(true);

if (hits) {
            var first = cards.filter(function (el) { return !el.classList.contains('is-search-hidden'); })[0];
            if (first) {
                first.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
            }
            showToast(hits + ' result' + (hits > 1 ? 's' : '') + ' for “' + query + '”', 'ok', 'Clear', function () {
                clearSearch();
            });
        } else {
            showToast('No results for “' + query + '”', 'warn');
        }

        return hits;
    }

function searchActive() {
return $$(SEARCHABLE).some(function (el) {
return el.classList.contains('is-search-hidden');
});
}

function syncClearButtons(hasTerm) {
$$('[data-clear-search]').forEach(function (btn) { btn.hidden = !hasTerm; });
}

function clearSearch() {
$$(SEARCHABLE).forEach(function (el) { el.classList.remove('is-search-hidden'); });
refreshEmptyStates();
$$('.search__input').forEach(function (f) { f.value = ''; });
syncClearButtons(false);
showToast('Search cleared', 'info');
}

    function refreshEmptyStates() {
        ['#catGrid', '#giftGrid', '#liveRail'].forEach(function (sel) {
            var grid = $(sel);
            if (!grid) { return; }
            var host = grid.closest('.shell') || grid.parentNode;
            var empty = $('[data-grid-empty]', host);
            var items = $$(SEARCHABLE, grid);
            var shown = items.filter(function (el) { return !isHidden(el); }).length;

            if (!empty) {
                if (!items.length) { return; }
                empty = document.createElement('p');
                empty.className = 'gridempty';
                empty.setAttribute('data-grid-empty', '');
                empty.hidden = true;
                grid.parentNode.appendChild(empty);
            }
            empty.hidden = shown !== 0;
        });
    }

    function isHidden(el) {
        return el.classList.contains('is-filtered-out') ||
            el.classList.contains('is-search-hidden') ||
            el.hasAttribute('hidden');
    }

    function initSearch() {
        var forms = [$('#searchForm'), $('[data-mobile-form]')];

        forms.forEach(function (form) {
            if (!form) { return; }

            var input = $('.search__input', form);
            var box = $('.suggest', form);
            if (!input || !box) { return; }

            var list = [];
            var cursor = -1;

            var update = debounce(function () {
                var value = input.value.trim();
                if (!value) {
                    hideSuggest(box, input);
                    return;
                }
                list = findSuggestions(value);
                cursor = -1;
                renderSuggest(box, list, input);
            }, 110);

            input.addEventListener('input', update);
            input.addEventListener('focus', function () {
                if (input.value.trim()) { update(); }
            });

            input.addEventListener('keydown', function (evt) {
                if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
                    if (!list.length) { return; }
                    evt.preventDefault();
                    cursor = clamp(cursor + (evt.key === 'ArrowDown' ? 1 : -1), 0, list.length - 1);
                    $$('.suggest__item', box).forEach(function (btn, i) {
                        var on = i === cursor;
                        btn.classList.toggle('is-active', on);
                        btn.setAttribute('aria-selected', on ? 'true' : 'false');
                        if (on) { btn.scrollIntoView({ block: 'nearest' }); }
                    });
                    return;
                }

                if (evt.key === 'Enter' && cursor > -1 && list[cursor]) {
                    evt.preventDefault();
                    input.value = list[cursor].name;
                    hideSuggest(box, input);
                    applySearch(input.value);
                    return;
                }

                if (evt.key === 'Escape') {
                    hideSuggest(box, input);
                }
            });

            box.addEventListener('click', function (evt) {
                var btn = evt.target.closest('[data-suggest]');
                if (!btn) { return; }
                var entry = list[Number(btn.getAttribute('data-suggest'))];
                if (!entry) { return; }
                input.value = entry.name;
                hideSuggest(box, input);
                applySearch(entry.name);
            });

form.addEventListener('submit', function (evt) {
evt.preventDefault();
var value = input.value.trim();
hideSuggest(box, input);

if (!value) {
/* an empty box must never leave the page filtered */
if (searchActive()) {
clearSearch();
} else {
showToast('Type something to search the marketplace', 'warn');
input.focus();
}
return;
}

applySearch(value);
});

var clearBtn = $('[data-clear-search]', form);
if (clearBtn) {
clearBtn.addEventListener('click', function () {
clearSearch();
input.focus();
});
}

syncClearBtn();
input.addEventListener('input', syncClearBtn);

function syncClearBtn() {
if (clearBtn) { clearBtn.hidden = !input.value.trim(); }
}

            form.addEventListener('focusout', function () {
                window.setTimeout(function () {
                    if (!form.contains(document.activeElement)) { hideSuggest(box, input); }
                }, 120);
            });
        });

        document.addEventListener('click', function (evt) {
            if (!evt.target.closest('.search')) {
                $$('.suggest').forEach(function (box) {
                    hideSuggest(box, $('.search__input', box.parentNode));
                });
            }
        });

        document.addEventListener('keydown', function (evt) {
            if (evt.key !== 'Escape') { return; }
            $$('.suggest').forEach(function (box) {
                if (!box.hidden) {
                    hideSuggest(box, $('.search__input', box.parentNode));
                }
            });
        });
    }

    /* ------------------------------------------------- 10. hero carousel */

    function initHeroCarousel() {
        var hero = $('#hero');
        if (!hero) { return; }

        var slides = $$('.slide', hero);
        var dotsHost = $('#heroDots');
        var prev = $('[data-hero-prev]', hero);
        var next = $('[data-hero-next]', hero);
        if (!slides.length) { return; }

        var index = 0;
        var timer = null;
        var DELAY = 6500;

        slides.forEach(function (s, i) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'hero__dot' + (i === 0 ? ' is-active' : '');
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-label', 'Go to slide ' + (i + 1) + ': ' +
                ($('.slide__title', slides[i]) || {}).textContent);
            dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
            dotsHost.appendChild(dot);
        });

        var dots = $$('.hero__dot', dotsHost);

        function show(nextIndex, userDriven) {
            index = (nextIndex + slides.length) % slides.length;
            slides.forEach(function (s, i) {
                var on = i === index;
                s.classList.toggle('is-active', on);
                s.hidden = !on;
            });
            dots.forEach(function (d, i) {
                d.classList.toggle('is-active', i === index);
                d.setAttribute('aria-selected', i === index ? 'true' : 'false');
            });
            if (userDriven) { restart(); }
        }

        function stop() {
            if (timer) { window.clearInterval(timer); timer = null; }
        }

        function restart() {
            stop();
            if (REDUCED.matches || slides.length < 2) { return; }
            timer = window.setInterval(function () { show(index + 1); }, DELAY);
        }

        if (prev) { prev.addEventListener('click', function () { show(index - 1, true); }); }
        if (next) { next.addEventListener('click', function () { show(index + 1, true); }); }

        dotsHost.addEventListener('click', function (evt) {
            var dot = evt.target.closest('.hero__dot');
            if (dot) { show(Number(dots.indexOf(dot)), true); }
        });

        hero.addEventListener('mouseenter', stop);
        hero.addEventListener('mouseleave', restart);
        hero.addEventListener('focusin', stop);
        hero.addEventListener('focusout', restart);

        hero.addEventListener('keydown', function (evt) {
            if (evt.key === 'ArrowLeft') { evt.preventDefault(); show(index - 1, true); }
            if (evt.key === 'ArrowRight') { evt.preventDefault(); show(index + 1, true); }
        });

        /* touch / pointer swipe */
        var startX = 0, startY = 0, tracking = false;

        hero.addEventListener('pointerdown', function (evt) {
            if (evt.pointerType === 'mouse') { return; }
            startX = evt.clientX;
            startY = evt.clientY;
            tracking = true;
            stop();
        });

        hero.addEventListener('pointerup', function (evt) {
            if (!tracking) { return; }
            tracking = false;
            var dx = evt.clientX - startX;
            var dy = evt.clientY - startY;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
                show(index + (dx < 0 ? 1 : -1), true);
            } else {
                restart();
            }
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stop(); } else { restart(); }
        });

        show(0);
        restart();
    }

    /* ------------------------------------------------- 19. product rail controls */

    function initRails() {
        var buttons = $$('[data-rail-prev], [data-rail-next]');

        function step(id, dir) {
            var rail = document.getElementById(id);
            if (!rail) { return; }
            var card = rail.firstElementChild;
            var amount = card ? card.getBoundingClientRect().width + 14 : 240;
            rail.scrollBy({ left: dir * amount * 2, behavior: REDUCED.matches ? 'auto' : 'smooth' });
        }

        function sync(rail) {
            var max = rail.scrollWidth - rail.clientWidth - 2;
            buttons.forEach(function (btn) {
                var id = btn.getAttribute('data-rail-prev') || btn.getAttribute('data-rail-next');
                if (id !== rail.id) { return; }
                btn.disabled = btn.hasAttribute('data-rail-prev')
                    ? rail.scrollLeft <= 2
                    : rail.scrollLeft >= max;
            });
        }

        buttons.forEach(function (btn) {
            var dir = btn.hasAttribute('data-rail-prev') ? -1 : 1;
            btn.addEventListener('click', function () {
                step(btn.getAttribute('data-rail-prev') || btn.getAttribute('data-rail-next'), dir);
            });
        });

        $$('.rail').forEach(function (rail) {
            var raf;
            rail.addEventListener('scroll', function () {
                if (raf) { return; }
                raf = window.requestAnimationFrame(function () { sync(rail); raf = null; });
            }, { passive: true });
            window.addEventListener('resize', debounce(function () { sync(rail); }, 150));
            sync(rail);
        });

        /* make "See all" also refresh rail bounds */
        document.addEventListener('click', function (evt) {
            if (evt.target.closest('[data-seeall]')) {
                window.setTimeout(function () {
                    $$('.rail').forEach(sync);
                }, 260);
            }
        });
    }

    /* ------------------------------------------------ 17/18. filter + sort */

    function initFilters() {
        $$('[data-filter-group]').forEach(function (group) {
            var section = group.closest('section');
            var grid = $('[data-grid]', section);
            var sort = $('[data-sort]', section);
            if (!grid) { return; }

            var items = $$(SEARCHABLE, grid);

            items.forEach(function (el, i) { el.dataset.ord = String(i); });

            function apply() {
                var active = $('.chip.is-active', group);
                var want = active ? active.getAttribute('data-filter') : 'all';
                var mode = sort ? sort.value : 'featured';

                items.forEach(function (el) {
                    var cat = norm(readCard(el).cat);
                    var ok = want === 'all' || cat === norm(want);
                    el.classList.toggle('is-filtered-out', !ok);
                });

                if (mode === 'name') {
                    items.slice().sort(function (a, b) {
                        var an = norm(readCard(a).name);
                        var bn = norm(readCard(b).name);
                        if (an < bn) { return -1; }
                        if (an > bn) { return 1; }
                        return 0;
                    }).forEach(function (el) { grid.appendChild(el); });
                } else {
                    items.slice().sort(function (a, b) {
                        return Number(a.dataset.ord) - Number(b.dataset.ord);
                    }).forEach(function (el) { grid.appendChild(el); });
                }

                refreshEmptyStates();
            }

            group.addEventListener('click', function (evt) {
                var chip = evt.target.closest('.chip');
                if (!chip) { return; }
                $$('.chip', group).forEach(function (c) {
                    var on = c === chip;
                    c.classList.toggle('is-active', on);
                    c.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                apply();
            });

            if (sort) {
                sort.addEventListener('change', apply);
            }

            apply();
        });
    }

    /* --------------------------------------------------- 23. "see all" */

function expandSection(btn, force) {
if (!btn) { return false; }

var gridId = btn.getAttribute('data-seeall');
var grid = document.getElementById(gridId);
if (!grid) { return false; }

var more = $$('.pcard--more, .catcard--more', grid);
if (!more.length) { return false; }

var expanded = btn.getAttribute('aria-expanded') === 'true';
var next = force === true ? true : !expanded;

more.forEach(function (m) { m.hidden = !next; });
btn.setAttribute('aria-expanded', next ? 'true' : 'false');

var label = $('.seeall__text', btn);
if (label) { label.textContent = next ? 'Show less' : 'See all'; }

if (!next) {
grid.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'nearest' });
}
return next;
}

function initSeeAll() {
document.addEventListener('click', function (evt) {
var btn = evt.target.closest('[data-seeall]');
if (!btn) { return; }
evt.preventDefault();
expandSection(btn);
});
}

    /* ------------------------------------------------- 24. scroll reveal */

    function initScrollReveal() {
        var nodes = $$('[data-reveal]');
        if (!nodes.length) { return; }

        if (REDUCED.matches || !('IntersectionObserver' in window)) {
            nodes.forEach(function (n) { n.classList.add('is-in'); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

        nodes.forEach(function (n) { io.observe(n); });
    }

    /* ------------------------------------------------- staggered product cards */

    function initCardStagger() {
        ['#catGrid', '#giftGrid', '#liveRail'].forEach(function (sel) {
            var host = $(sel);
            if (!host) { return; }

            var cards = $$('.pcard', host);
            if (!cards.length) { return; }

            if (REDUCED.matches || !('IntersectionObserver' in window)) { return; }

            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) { return; }
                    entry.target.classList.add('stagger');
                    entry.target.style.setProperty('--i', String(Number(entry.target.dataset.ord || 0) % 8));
                    io.unobserve(entry.target);
                });
            }, { threshold: 0.12 });

            cards.forEach(function (card, i) {
                card.dataset.ord = String(i);
                io.observe(card);
            });
        });
    }

    /* --------------------------------------------------- 31. accessibility */

    function initA11y() {
        document.addEventListener('keydown', function (evt) {
            if (evt.key === 'Escape') {
                if (openLayer) {
                    evt.preventDefault();
                    closeOverlay();
                    return;
                }
                var panel = $('#mobileNav');
                if (panel && !panel.hidden) {
                    var toggle = $('[data-menu-toggle]');
                    panel.hidden = true;
                    lockScroll(false);
                    if (toggle) {
                        toggle.setAttribute('aria-expanded', 'false');
                        toggle.focus();
                    }
                }
            }

            /* keep focus inside an open dialog */
            if (evt.key === 'Tab' && openLayer) {
                var list = focusables(openLayer);
                if (!list.length) { return; }
                var first = list[0];
                var last = list[list.length - 1];
                if (evt.shiftKey && document.activeElement === first) {
                    evt.preventDefault();
                    last.focus();
                } else if (!evt.shiftKey && document.activeElement === last) {
                    evt.preventDefault();
                    first.focus();
                }
            }
        });
    }

    /* ------------------------------------------------------------ bootstrap */

function boot() {
initBoot();
initStickyHeader();
initBackToTop();
initNavigation();
initMobileMenu();
initSearch();
initHeroCarousel();
initRails();
initFilters();
initSeeAll();
initCardActions();
initDrawers();
initQuickView();
initScrollReveal();
initCardStagger();
initA11y();
refreshEmptyStates();
}

if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();