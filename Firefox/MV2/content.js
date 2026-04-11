(function () {
    const API_KEY = 'YOUR_API_KEY'; // Replace with your actual Rebrickable API key
    const debugMode = false; // Set to true to enable debug logs

    const hasBrowserStorage = typeof browser !== 'undefined' && !!(browser.storage && browser.storage.local);

    const MarstoyPageType = {
        ProductListingPage: 1,
        ProductPage: 2,
        WishlistPage: 3
    };

    const INVALID_KEYWORDS = ['Plates', 'Beams', 'Bricks', 'Miscellaneous'];

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
        if (hasBrowserStorage) {
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
        if (hasBrowserStorage) {
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
        if (!hasBrowserStorage) return;
        try {
            const items = await browser.storage.local.get(null);
            const productKeys = Object.keys(items).filter(key => key.startsWith('M') || key.startsWith('N'));
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
        if (debugMode) await logCacheMetrics();

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
                const productName = data.name.trim();
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
    function findProductImageElementFromTitle(titleEl, marstoyPageType) {
        logDebug(`findProductImageElementFromTitle — pageType: ${marstoyPageType}`);

        if (marstoyPageType === MarstoyPageType.ProductPage) {
            // Shopline product detail page: first image in the media gallery
            return document.querySelector('img.media-gallery__image');
        }

        if (marstoyPageType === MarstoyPageType.ProductListingPage) {
            // titleEl is the <a.block-product-title> link — walk up to the card root
            const card = titleEl.closest('li, article, .product-card-wrapper, li.product-block');
            if (!card) return null;
            return card.querySelector('img.block-product-image__image') || card.querySelector('img');
        }

        if (marstoyPageType === MarstoyPageType.WishlistPage) {
            // titleEl is div[title] inside a.product-item
            const item = titleEl.closest('a.product-item');
            return item ? item.querySelector('img.lozad, img') : null;
        }

        return null;
    }

    function markAsProcessed(node) {
        const card = node.closest('a.product-item, li, article, .product-card-wrapper, li.product-block') || node;
        if (card) card.dataset.mstProcessed = '1';
    }
    function isProcessed(node) {
        const card = node.closest('a.product-item, li, article, .product-card-wrapper, li.product-block') || node;
        return !!(card && card.dataset.mstProcessed === '1');
    }

    // -------------------------
    // Update title + image
    // -------------------------
    async function updateProductTitleAndImage(productTitleElement, productId, marstoyPageType) {
        logDebug(`Updating product with ID: ${productId}`);

        const rebrickableData = await fetchRebrickableData(productId);
        if (rebrickableData && !INVALID_KEYWORDS.some(keyword => rebrickableData.name.includes(keyword))) {
            productTitleElement.textContent = rebrickableData.name.replace(/\s+/g, ' ').trim();
            logDebug(`Updated product title to: ${rebrickableData.name}`);

            const productImageElement = findProductImageElementFromTitle(productTitleElement, marstoyPageType);

            if (productImageElement && rebrickableData.imageUrl) {
                productImageElement.src = rebrickableData.imageUrl;
                // data-src is used by the lozad lazy loader (wishlist page)
                if (productImageElement.dataset.src !== undefined) {
                    productImageElement.dataset.src = rebrickableData.imageUrl;
                }
                productImageElement.srcset = [
                    `${rebrickableData.imageUrl} 375w`,
                    `${rebrickableData.imageUrl} 540w`,
                    `${rebrickableData.imageUrl} 720w`,
                    `${rebrickableData.imageUrl} 800w`
                ].join(', ');
                productImageElement.alt = rebrickableData.name;
                logDebug(`Updated product image to: ${rebrickableData.imageUrl}`);
            } else if (rebrickableData.imageUrl) {
                logDebug('Product image element not found.');
            } else {
                logDebug('No image URL provided.');
            }
        } else {
            logDebug('No matching title found on Rebrickable or title seems incorrect.');
        }
    }

    // -------------------------
    // Page processors
    // -------------------------
    function processProductPage() {
        logDebug('Processing product page...');

        // Shopline theme: product title is in h1.product-detail__title
        const productTitleElement = document.querySelector(
            'h1.product-detail__title, h1.product-title, h1.product-info__header_title'
        );
        if (!productTitleElement) {
            logDebug('Product title element not found on product page.');
            return;
        }
        if (isProcessed(productTitleElement)) return;

        // Extract ID from URL: /products/m44312 or /products/moc-m87077-parts-kit
        const urlPath = location.pathname;
        const match = urlPath.match(/\/products\/(?:moc-)?([mn])(\d+)/i);
        let productId = match ? `${match[1].toUpperCase()}${match[2]}` : null;

        // Fallback: check the SKU element (Shopline: theme-product-variant-sku)
        if (!productId) {
            logDebug('Could not find productId in URL, trying SKU element fallback...');
            const skuEl = document.querySelector('theme-product-variant-sku, .product-variant-sku');
            const skuText = skuEl ? skuEl.textContent : '';
            logDebug(`SKU element text: ${skuText}`);
            const idMatch = skuText.match(/\b([MN])(\d+)\b/i);
            if (idMatch) productId = `${idMatch[1].toUpperCase()}${idMatch[2]}`;
        }

        if (productId) {
            logDebug(`Product ID found: ${productId}`);
            updateProductTitleAndImage(productTitleElement, productId, MarstoyPageType.ProductPage)
                .catch(err => logDebug('Update failed:', err))
                .finally(() => markAsProcessed(productTitleElement));
        } else {
            logDebug('Product ID not found on product page.');
        }
    }

    function processProductListingPage() {
        logDebug('Processing product listing page...');

        // Shopline theme: title links are <a class="block-product-title">
        const titles = document.querySelectorAll('a.block-product-title');
        const nodes = titles.length
            ? titles
            : document.querySelectorAll('a[href*="/products/"][class*="title"]');

        nodes.forEach((titleEl, index) => {
            if (isProcessed(titleEl)) return;

            let productId = null;

            // Extract from href: /products/m44312  or  /products/moc-m87077-parts-kit
            if (titleEl.href) {
                const m = titleEl.href.match(/\/products\/(?:moc-)?([mn])(\d+)/i);
                if (m) productId = `${m[1].toUpperCase()}${m[2]}`;
            }

            // Fallback: ID in the visible title text ("MOC M44312 Parts Kit")
            if (!productId) {
                const text = titleEl.textContent.trim();
                const idMatch = text.match(/\b([MN])\s?(\d+)\b/i);
                if (idMatch) productId = `${idMatch[1].toUpperCase()}${idMatch[2]}`;
            }

            if (productId) {
                logDebug(`Product ID found for element ${index}: ${productId}`);
                // Pass the inner span as the text target so only the label is replaced
                const spanEl = titleEl.querySelector('span') || titleEl;
                updateProductTitleAndImage(spanEl, productId, MarstoyPageType.ProductListingPage)
                    .catch(err => logDebug('Update failed:', err))
                    .finally(() => markAsProcessed(titleEl));
            } else {
                logDebug(`No product ID found for element ${index}.`);
            }
        });
    }

    function processWishlistPage() {
        logDebug('Processing wishlist page...');

        // Shopline wishlist: each card is <a class="product-item">
        // The title is <div title="MOC M28167 Parts Kit"> inside the card
        const cards = document.querySelectorAll('a.product-item');

        if (!cards.length) {
            logDebug('No elements with a.product-item found on wishlist page.');
            return;
        }

        cards.forEach((card, index) => {
            if (isProcessed(card)) return;

            const titleEl = card.querySelector('div[title]');
            if (!titleEl) {
                logDebug(`No div[title] found in wishlist card ${index}.`);
                return;
            }

            // ID is in the title attribute: "MOC M28167 Parts Kit"
            const titleText = titleEl.getAttribute('title') || titleEl.textContent;
            const idMatch = titleText.match(/\b([MN])\s?(\d+)\b/i);

            if (idMatch) {
                const productId = `${idMatch[1].toUpperCase()}${idMatch[2]}`;
                logDebug(`Product ID found for wishlist item ${index}: ${productId}`);
                updateProductTitleAndImage(titleEl, productId, MarstoyPageType.WishlistPage)
                    .then(() => {
                        // Keep the title attribute in sync with the updated text content
                        if (titleEl.textContent) titleEl.setAttribute('title', titleEl.textContent);
                    })
                    .catch(err => logDebug('Update failed:', err))
                    .finally(() => markAsProcessed(card));
            } else {
                logDebug(`No product ID found for wishlist item ${index}: "${titleText}"`);
            }
        });
    }

    // -------------------------
    // Page detection
    // -------------------------
    function determineAndProcessPage() {
        logDebug('determineAndProcessPage...');
        const href = window.location.href.toLowerCase();

        if (href.includes('/products/')) {
            processProductPage();
        } else if (href.includes('wishlist')) {
            processWishlistPage();
        } else {
            // Collections / listing pages
            processProductListingPage();
        }
    }

    // -------------------------
    // MutationObserver for dynamic content
    // -------------------------
    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function observeDom() {
        const href = window.location.href.toLowerCase();
        // Product detail pages are static once loaded — no observer needed
        if (href.includes('/products/')) return;

        const isWishlist = href.includes('wishlist');
        const rerun = debounce(() => {
            if (isWishlist) {
                logDebug('DOM changed: re-running wishlist processor');
                processWishlistPage();
            } else {
                logDebug('DOM changed: re-running listing processor');
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
        browser.runtime.onMessage.addListener((request) => {
            if (request && request.action === 'convert') {
                logDebug('Manual conversion triggered.');
                determineAndProcessPage();
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
