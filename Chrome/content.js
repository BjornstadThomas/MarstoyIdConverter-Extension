// Hardcoded API key
const apiKey = '<YOUR-API-KEY-FROM-REBRICKABLE>'; // Replace with your actual API key

// Function to reverse the ID (excluding the 'M') and fetch product data from Rebrickable API
async function fetchRebrickableData(productId) {
    const reversedId = productId.slice(1).split('').reverse().join(''); // Remove 'M' and reverse the string
    console.log(`Reversed ID for Rebrickable lookup: ${reversedId}`); // Print the reversed ID
    
    const url = `https://rebrickable.com/api/v3/lego/sets/${reversedId}-1/`;
    console.log(`Rebrickable API URL: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `key ${apiKey}` // Use the hardcoded API key
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.name) {
                const productName = data.name.trim();
                const productImageUrl = data.set_img_url;
                console.log(`Product name found on Rebrickable: ${productName}`);
                console.log(`Product image URL: ${productImageUrl}`);
                return { name: productName, imageUrl: productImageUrl };
            } else {
                console.error(`Product name not found in Rebrickable data for product ID: ${productId}`);
            }
        } else {
            console.error(`Failed to fetch data from Rebrickable for product ID: ${productId}`);
        }
    } catch (error) {
        console.error(`Error fetching data from Rebrickable for product ID: ${productId}`, error);
    }
}

// Function to update product title and image
async function updateProductTitleAndImage(productTitleElement, productId) {
    const rebrickableData = await fetchRebrickableData(productId);

    const invalidKeywords = ["Plates", "Beams", "Bricks", "Miscellaneous"];
    
    if (rebrickableData && !invalidKeywords.some(keyword => rebrickableData.name.includes(keyword))) {
        productTitleElement.textContent = rebrickableData.name;
        console.log(`Updated product title to: ${rebrickableData.name}`);

        let productImageElement = null;

        if (productTitleElement.closest('.product-image')) {
            productImageElement = productTitleElement.closest('.product-image').querySelector('img');
        } else if (productTitleElement.closest('.product-snippet')) {
            productImageElement = productTitleElement.closest('.product-snippet').querySelector('img');
        } else if (document.querySelector('.product-image__content img')) {
            productImageElement = document.querySelector('.product-image__content img');
        }

        if (productImageElement && rebrickableData.imageUrl) {
            productImageElement.src = rebrickableData.imageUrl;
            productImageElement.srcset = `${rebrickableData.imageUrl} 360w, ${rebrickableData.imageUrl} 540w, ${rebrickableData.imageUrl} 720w, ${rebrickableData.imageUrl} 1024w`;
            productImageElement.alt = rebrickableData.name;
            console.log(`Updated product image to: ${rebrickableData.imageUrl}`);
        } else {
            console.log('Product image element not found or no image URL provided.');
        }
    } else {
        console.log('No matching title found on Rebrickable or title seems incorrect.');
    }
}

// Function to check for a product on a product page
function processProductPage() {
    const productTitleElement = document.querySelector('h1.product-info__header_title.dj_skin_product_title');
    const productIdElement = document.querySelector('p.product-info__header_brief');
    
    if (productTitleElement && productIdElement) {
        const productIdText = productTitleElement.textContent.trim();
        const productId = productIdText.match(/M\d+/)[0];
        console.log(`Product ID found: ${productId}`);
        updateProductTitleAndImage(productTitleElement, productId);
    } else {
        console.log('Product ID or title element not found.');
    }
}

// Function to check for products on the product listing page
function processProductListingPage() {
    const productTitleElements = document.querySelectorAll('a.product-snippet__title-normal');
    
    productTitleElements.forEach(async (element) => {
        const productIdMatch = element.href.match(/\/products\/m(\d+)/);
        if (productIdMatch) {
            const productId = `M${productIdMatch[1]}`;
            console.log(`Product ID found: ${productId}`);
            updateProductTitleAndImage(element, productId);
        } else {
            console.log('No product ID found in the URL.');
            element.textContent += ' (No ID found)';
        }
    });
}

// Determine which page type we're on and process accordingly
if (document.querySelector('h1.product-info__header_title.dj_skin_product_title')) { 
    processProductPage();
} else {
    processProductListingPage();
}
