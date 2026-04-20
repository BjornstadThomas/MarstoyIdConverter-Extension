(function () {
    const API_KEY = 'YOUR_API_KEY'; // Replace with your actual Rebrickable API key
    const debugMode = false; // Set to true to enable debug logs

    // -------------------------
    // Logging
    // -------------------------
    function logDebug(message, data = null) {
        if (debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${message}`, data || '');
        }
    }

    // -------------------------
    // Cache helpers (Firefox browser.storage)
    // -------------------------
    async function getCacheItem(productId) {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
            try {
                const result = await browser.storage.local.get(productId);
                return result[productId] || null;
            } catch (error) {
                logDebug('Error getting cache item from storage:', error);
                return null;
            }
        } else {
            logDebug('browser.storage.local is not available');
            return null;
        }
    }

    async function setCacheItem(productId, data) {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
            try {
                await browser.storage.local.set({ [productId]: data });
                logDebug(`Cache item for ${productId} successfully updated in browser.storage.local.`);
            } catch (error) {
                logDebug('Error setting cache item in storage:', error);
            }
        } else {
            logDebug('browser.storage.local is not available');
        }
    }

    async function logCacheMetrics() {
        if (!(typeof browser !== 'undefined' && browser.storage && browser.storage.local)) return;
        try {
            const items = await browser.storage.local.get(null);
            const productKeys = Object.keys(items).filter(key => key.startsWith('M'));
            const itemCount = productKeys.length;
            const cacheSizeInBytes = new Blob([JSON.stringify(items)]).size;
            logDebug(`Cache contains ${itemCount} items, size: ${cacheSizeInBytes} bytes`);

            if (browser.storage.local.getBytesInUse) {
                const bytesInUse = await browser.storage.local.getBytesInUse(null);
                logDebug(`Storage currently using ${bytesInUse} bytes`);
            }

            if (debugMode) {
                logDebug(`Cached data: ${JSON.stringify(items)}`);
            }
        } catch (error) {
            logDebug('Error logging cache metrics:', error);
        }
    }

    // -------------------------
    // Rebrickable fetch
    // -------------------------
    async function fetchRebrickableData(productId) {
        const normalizedProductId = productId.toUpperCase();
        logDebug(`Normalized product ID: ${normalizedProductId}`);

        const cachedData = await getCacheItem(normalizedProductId);
        logCacheMetrics();

        if (cachedData) {
            logDebug(`Cache hit for product ID: ${normalizedProductId}`, cachedData);
            return cachedData;
        } else {
            logDebug(`Cache miss for product ID: ${normalizedProductId}`);
        }

        // Reverse the numeric part (M12345 -> 54321)
        const reversedId = productId.slice(1).split('').reverse().join('');
        logDebug(`Reversed ID for Rebrickable lookup: ${reversedId}`);

        const url = `https://rebrickable.com/api/v3/lego/sets/${reversedId}-1/`;
        logDebug(`Rebrickable API URL: ${url}`);

        const startTime = performance.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `key ${API_KEY}`
                }
            });

            const endTime = performance.now();
            logDebug(`Network request completed in ${(endTime - startTime).toFixed(2)} ms`);

            if (!response.ok) {
                if (response.status === 429) {
                    logDebug('Rebrickable rate-limited (429). Backing off for this product ID.');
                } else {
                    logDebug(`Failed to fetch data from Rebrickable (${response.status}) for product ID: ${normalizedProductId}`, response.statusText);
                }
                return null;
            }

            const data = await response.json();
            if (data && data.name) {
                const productName = String(data.name || '').trim();
                const productImageUrl = data.set_img_url || '';
                logDebug(`Product name found on Rebrickable: ${productName}`);
                logDebug(`Product image URL: ${productImageUrl}`);

                const payload = { name: productName, imageUrl: productImageUrl };
                await setCacheItem(normalizedProductId, payload);
                return payload;
            } else {
                logDebug(`Product name not found in Rebrickable data for product ID: ${normalizedProductId}`);
            }
        } catch (error) {
            logDebug(`Error fetching data from Rebrickable for product ID: ${normalizedProductId}`, error);
        }

        return null;
    }

    // -------------------------
    // DOM helpers
    // -------------------------
    const CARD_SELECTOR = 'product-item, .product-card-wrapper, li.product-block';

    function findProductImageElementFromTitle(titleEl) {
        const card = titleEl.closest(CARD_SELECTOR);
        if (!card) return null;

        // Shopline theme (current marstoy.com)
        let img = card.querySelector('img.block-product-image__image');
        if (img) return img;

        // Shopify Dawn-style theme (legacy marstoy.net)
        img = card.querySelector('a.card__media img');
        if (img) return img;

        img = card.querySelector('img.collection-hero__image')
            || card.querySelector('.card__inner img')
            || card.querySelector('img');
        return img || null;
    }

    function markAsProcessed(node) {
        const card = node.closest(CARD_SELECTOR) || node;
        if (card) card.dataset.mstProcessed = '1';
    }
    function isProcessed(node) {
        const card = node.closest(CARD_SELECTOR) || node;
        return !!(card && card.dataset.mstProcessed === '1');
    }

    // -------------------------
    // Update title + image
    // -------------------------
    function applyImage(img, rebrickableData) {
        if (!img || !rebrickableData.imageUrl) return false;
        img.src = rebrickableData.imageUrl;
        img.srcset = [
            `${rebrickableData.imageUrl} 375w`,
            `${rebrickableData.imageUrl} 540w`,
            `${rebrickableData.imageUrl} 720w`,
            `${rebrickableData.imageUrl} 800w`
        ].join(', ');
        img.alt = rebrickableData.name;
        return true;
    }

    async function updateProductTitleAndImage(productTitleElement, productId) {
        logDebug(`Updating product with ID: ${productId}`);

        const rebrickableData = await fetchRebrickableData(productId);
        const invalidKeywords = ["Plates", "Beams", "Bricks", "Miscellaneous"];

        if (!(rebrickableData && !invalidKeywords.some(keyword => rebrickableData.name.includes(keyword)))) {
            logDebug('No matching title found on Rebrickable or title seems incorrect.');
            return;
        }

        productTitleElement.textContent = rebrickableData.name.replace(/\s+/g, ' ').trim();
        logDebug(`Updated product title to: ${rebrickableData.name}`);

        // On a product detail page the title is not inside a card; update the whole media gallery.
        const insideCard = productTitleElement.closest(CARD_SELECTOR);
        if (!insideCard) {
            const galleryImgs = document.querySelectorAll(
                'img.media-gallery__image, img.media-gallery__thumbnail-image'
            );
            let updated = 0;
            galleryImgs.forEach((img) => { if (applyImage(img, rebrickableData)) updated++; });
            if (!updated) {
                if (applyImage(document.querySelector('img.collection-hero__image'), rebrickableData)) updated++;
            }
            logDebug(`Updated ${updated} detail-page image(s) to: ${rebrickableData.imageUrl}`);
            return;
        }

        const productImageElement =
            findProductImageElementFromTitle(productTitleElement) ||
            (productTitleElement.closest('.p-cursor-pointer') && productTitleElement.closest('.p-cursor-pointer').querySelector('img')); // wishlist fallback

        if (applyImage(productImageElement, rebrickableData)) {
            logDebug(`Updated product image to: ${rebrickableData.imageUrl}`);
        } else {
            logDebug('Product image element not found or no image URL provided.');
        }
    }

    // -------------------------
    // Page processors
    // -------------------------
    function processProductPage() {
        logDebug('Processing product page...');
        const productTitleElement = document.querySelector(
            'h1.product-detail__title, h1.product__title, h1.product-title, h1.product-info__header_title.dj_skin_product_title'
        );
        if (!productTitleElement) {
            logDebug('Product title element not found on product page.');
            return;
        }
        if (isProcessed(productTitleElement)) return;

        // Prefer extracting the ID from the URL (e.g. /products/moc-m87077-parts-kit)
        const urlPath = location.pathname;
        let match = urlPath.match(/\/products\/(?:moc-)?m?(\d+)/i);
        let productId = match ? `M${match[1]}` : null;

        // Fallback: scan text on page if needed
        if (!productId) {
            const text = `${productTitleElement.textContent} ${document.body.innerText}`;
            const idMatch = text.match(/\bM\s?(\d+)\b/i);
            if (idMatch) productId = `M${idMatch[1]}`;
        }

        if (productId) {
            logDebug(`Product ID found: ${productId}`);
            Promise.resolve(updateProductTitleAndImage(productTitleElement, productId))
                .finally(() => markAsProcessed(productTitleElement));
        } else {
            logDebug('Product ID not found on product page.');
        }
    }

    function findTitleElementInCard(card) {
        // Shopline: <a class="block-product-title"><span>Title</span></a>
        return card.querySelector('a.block-product-title span')
            || card.querySelector('a.block-product-title')
            || card.querySelector('h3.product__title')
            || card.querySelector('a.full-unstyled-link .visually-hidden');
    }

    function extractProductIdFromCard(card, titleEl) {
        const handle = (card.getAttribute && card.getAttribute('data-product-handle')) || '';
        let m = handle.match(/\bm(\d+)/i);
        if (m) return `M${m[1]}`;

        const link = card.querySelector('a[href*="/products/"]');
        if (link && link.href) {
            m = link.href.match(/\/products\/(?:moc-)?m?(\d+)/i);
            if (m) return `M${m[1]}`;
        }

        if (titleEl) {
            m = titleEl.textContent.match(/\bM\s?(\d+)\b/i);
            if (m) return `M${m[1]}`;
        }
        return null;
    }

    function processProductListingPage() {
        logDebug('Processing product listing page...');

        const cards = document.querySelectorAll(CARD_SELECTOR);
        cards.forEach((card, index) => {
            if (isProcessed(card)) return;

            const titleEl = findTitleElementInCard(card);
            if (!titleEl) {
                logDebug(`No title element in card ${index}.`);
                return;
            }

            const productId = extractProductIdFromCard(card, titleEl);
            if (!productId) {
                logDebug(`No product ID found for card ${index}.`);
                return;
            }

            logDebug(`Product ID found for card ${index}: ${productId}`);
            Promise.resolve(updateProductTitleAndImage(titleEl, productId))
                .finally(() => markAsProcessed(titleEl));
        });
    }

    function processWishlistPage() {
        logDebug('Processing wishlist page...');
        const productTitleElements = document.querySelectorAll('p.p-text-wish_desc');

        productTitleElements.forEach((element, index) => {
            if (isProcessed(element)) return;

            const productIdText = element.textContent.trim();
            const productIdMatch = productIdText.match(/M\d+/);

            if (productIdMatch) {
                const productId = productIdMatch[0];
                logDebug(`Product ID found for wishlist item ${index}: ${productId}`);
                Promise.resolve(updateProductTitleAndImage(element, productId))
                    .finally(() => markAsProcessed(element));
            } else {
                logDebug(`No product ID found for wishlist item ${index}.`);
                // element.textContent += ' (No ID found)'; // optional
            }
        });
    }

    // -------------------------
    // Page detection
    // -------------------------
    function determineAndProcessPage() {
        if (document.querySelector('h1.product-detail__title, h1.product__title, h1.product-title, h1.product-info__header_title.dj_skin_product_title')) {
            processProductPage();
        } else if (document.querySelector('p.p-text-wish_desc')) {
            processWishlistPage();
        } else if (document.querySelector(CARD_SELECTOR + ', h3.product__title')) {
            processProductListingPage();
        } else {
            logDebug('Page type not recognized; defaulting to listing processing.');
            processProductListingPage();
        }
    }

    // -------------------------
    // MutationObserver for dynamic content
    // -------------------------
    let listingDebounce;
    function debounce(fn, ms) {
        return (...args) => {
            clearTimeout(listingDebounce);
            listingDebounce = setTimeout(() => fn(...args), ms);
        };
    }

    function observeDom() {
        const rerun = debounce(() => {
            if (document.querySelector(CARD_SELECTOR + ', h3.product__title')) {
                logDebug('DOM changed: re-processing listing page');
                processProductListingPage();
            }
        }, 300);

        const obs = new MutationObserver(rerun);
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // -------------------------
    // Runtime message listener (Firefox)
    // -------------------------
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
        browser.runtime.onMessage.addListener((request, sender) => {
            if (request && request.action === 'convert') {
                logDebug('Manual conversion triggered.');
                determineAndProcessPage();
                // In Firefox, returning a Promise keeps the channel alive if needed
                return Promise.resolve({ status: 'Update complete!' });
            }
        });
    }

    // -------------------------
    // Kickoff
    // -------------------------
    determineAndProcessPage(); // initial pass
    observeDom();              // keep up with lazy-loaded / dynamically injected cards
})();