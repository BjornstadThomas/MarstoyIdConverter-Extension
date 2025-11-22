(function () {
    const API_KEY = 'YOUR_API_KEY'; // Replace with your actual Rebrickable API key
    const debugMode = false; // Set to true to enable debug logs
    const MarstoyPageType = {
      ProductListingPage: 1,
      ProductPage: 2,
      WishlistPage: 3
    };

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
    function findProductImageElementFromTitle(titleEl, marstoyPageType) {
        logDebug(`Product title element type: ${titleEl.nodeName}`);
        logDebug(`PageType: ${marstoyPageType}`);

        if(marstoyPageType === MarstoyPageType.WishlistPage){
            return (titleEl.closest('.product-item') && titleEl.closest('.product-item').querySelector('img'));
        }
        else if(marstoyPageType === MarstoyPageType.ProductPage){
            return document.querySelector('.product__media-image');
        }
        else if(marstoyPageType === MarstoyPageType.ProductListingPage){
            const card = titleEl.closest('.product-card-wrapper') || titleEl.closest('li.product-block');
            if (!card) return null;

            // Primary target in new theme
            let img = card.querySelector('a.card__media img');
            if (img) return img;

            // Fallbacks across variants
            img = card.querySelector('img.collection-hero__image')
                || card.querySelector('.card__inner img')
                || card.querySelector('img');
            return img || null;
        }
        else{
            return null;
        }
    }

    function markAsProcessed(node) {
        const card = node.closest('.product-card-wrapper') || node.closest('li.product-block') || node;
        if (card) card.dataset.mstProcessed = '1';
    }
    function isProcessed(node) {
        const card = node.closest('.product-card-wrapper') || node.closest('li.product-block') || node;
        return !!(card && card.dataset.mstProcessed === '1');
    }

    // -------------------------
    // Update title + image
    // -------------------------
    async function updateProductTitleAndImage(productTitleElement, productId, marstoyPageType) {
        logDebug(`Updating product with ID: ${productId}`);
        logDebug(`Product title: ${productTitleElement.textContent}`);
        logDebug(`marstoyPageType: ${marstoyPageType}`);

        const rebrickableData = await fetchRebrickableData(productId);
        const invalidKeywords = ["Plates", "Beams", "Bricks", "Miscellaneous"];

        if (rebrickableData && !invalidKeywords.some(keyword => rebrickableData.name.includes(keyword))) {
            // Normalize whitespace in case the theme injects odd spacing
            productTitleElement.textContent = rebrickableData.name.replace(/\s+/g, ' ').trim();
            logDebug(`Updated product title to: ${rebrickableData.name}`);

            const productImageElement = findProductImageElementFromTitle(productTitleElement, marstoyPageType);

            if (productImageElement && rebrickableData.imageUrl) {
                productImageElement.src = rebrickableData.imageUrl;
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
            }
            else {
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
        const productTitleElement = document.querySelector(
            'div.product__title, h1.product-title, h1.product-info__header_title.dj_skin_product_title'
        );
        const productSkuElement = document.querySelector('#variant_sku_no_main-product-info');
        if (!productTitleElement) {
            logDebug('Product title element not found on product page.');
            return;
        }
        if (isProcessed(productTitleElement)) return;

        // Prefer extracting the ID from the URL (e.g. /products/moc-m87077-parts-kit)
        const urlPath = location.pathname;
        let match = urlPath.match(/\/products\/.*?([MN])(\d+)/i);
        let productId = match ? `${match[1].toUpperCase()}${match[2]}` : null;

        // Fallback: scan text on page if needed
        if (!productId) {
            logDebug('Could not find productId in URL, trying fallback...');
            const text = `${productSkuElement.textContent}`;
            logDebug(`productSkuElement text: ${text}`);
            const idMatch = text.match(/\bM\s?(\d+)\b/i);
            if (idMatch) productId = `M${idMatch[1]}`;

            // Could be "N...." format
            if(!productId){
                const idMatch = text.match(/\bN\s?(\d+)\b/i);
                if (idMatch) productId = `N${idMatch[1]}`;
            }
        }

        if (productId) {
            logDebug(`Product ID found: ${productId}`);
            Promise.resolve(updateProductTitleAndImage(productTitleElement, productId, MarstoyPageType.ProductPage))
                .finally(() => markAsProcessed(productTitleElement));
        } else {
            logDebug('Product ID not found on product page.');
        }
    }

    function processProductListingPage() {
        logDebug('Processing product listing page...');
        // New theme: titles are in h3.product__title; fallback to visually-hidden text inside the link
        const titles = document.querySelectorAll('h3.product__title');
        const nodes = titles.length
            ? titles
            : document.querySelectorAll('.product-card-wrapper a.full-unstyled-link .visually-hidden');

        nodes.forEach((titleEl, index) => {
            if (isProcessed(titleEl)) return;

            // Find the nearest product card and its product link
            const card = titleEl.closest('.product-card-wrapper') || titleEl.closest('li.product-block') || document;
            const link = card.querySelector('a.full-unstyled-link, a.card__media, a[href*="/products/"]');

            let productId = null;
            if (link && link.href) {
                // Handle /products/moc-m87077-... and /products/m87077-...
                const m = link.href.match(/\/products\/(?:moc-)?m?(\d+)/i);
                if (m) productId = `M${m[1]}`;
            }

            // Fallback: if title contains "M87077" or "M 87077"
            if (!productId) {
                const text = titleEl.textContent.trim();
                const idMatch = text.match(/\b[MN]\s?(\d+)\b/i);
                if (idMatch) productId = `M${idMatch[1]}`;

                // Could be "N...." format
                if(!productId){
                    const idMatch = text.match(/\bN\s?(\d+)\b/i);
                    if (idMatch) productId = `N${idMatch[1]}`;
                }
            }

            if (productId) {
                logDebug(`Product ID found for element ${index}: ${productId}`);
                Promise.resolve(updateProductTitleAndImage(titleEl, productId, MarstoyPageType.ProductListingPage))
                    .finally(() => markAsProcessed(titleEl));
            } else {
                logDebug(`No product ID found for element ${index}.`);
            }
        });
    }

    function processWishlistPage() {
        logDebug('Processing wishlist page...');
        const productItems = document.querySelectorAll(".product-item");

        if (!productItems || productItems.length === 0){
            logDebug('No elements with class .product-item found.');
            return;
        }

        const productTitleElements = Array.from(productItems)            // convert NodeList → Array
            .map(item => item.querySelector("[title]"))                  // find [title] inside each
            .filter(el => el !== null);                                  // keep only found ones

        if (!productTitleElements || productTitleElements.length === 0){
            logDebug('No title elements found in elements with class .product-item.');
            return;
        }


        productTitleElements.forEach((element, index) => {
            if (isProcessed(element)) return;

            const productIdText = element.textContent.trim();
            const productIdMatch = productIdText.match(/M\d+/);

            if (productIdMatch) {
                const productId = productIdMatch[0];
                logDebug(`Product ID found for wishlist item ${index}: ${productId}`);
                Promise.resolve(updateProductTitleAndImage(element, productId, MarstoyPageType.WishlistPage))
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
        logDebug(`determineAndProcessPage...`);
        if (window.location.href.toLowerCase().includes("products")) {
            processProductPage();
        } else if (window.location.href.toLowerCase().includes("wishlist")) {
            processWishlistPage();
        } else if (window.location.href.toLowerCase().includes("brick-kits")) {
            processProductListingPage();
        } else if (window.location.href.toLowerCase().includes("brick-packs")) {
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
            logDebug('Timed conversion triggered.');
            determineAndProcessPage();
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