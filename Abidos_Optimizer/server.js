const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    page.on('response', async (res) => {
        if (res.url().includes('prices/latest')) {
            const raw = await res.json();
            const clean = raw.map(i => ({
                name: i.item_slug.replace(/-/g, ' ').toUpperCase(),
                price: i.price,
                updated: new Date(i.timestamp * 1000).toLocaleString('fr-FR')
            }));
            fs.writeFileSync('data.json', JSON.stringify(clean, null, 2));
            console.log("✅ data.json mis à jour !");
        }
    });

    await page.goto('https://loa-buddy.pages.dev/materials');
    await page.waitForTimeout(4000);
    await browser.close();
}
run();