const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function performScraping(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        );
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        await page.waitForSelector('pre.xNWlr.hjutX.PBFx0', { timeout: 10000 });

        const scrapedData = await page.evaluate(() => {
            const title = document.querySelector('h1')?.textContent.trim() || 'Unknown Title';

            let tuning = '/', key = '/', capo = '/';
            const preinfoElement = document.querySelector('div.M71za.IfVEB.kwXei.vATAB.DyCuI.ZIQxh');
            if (preinfoElement) {
                preinfoElement.querySelectorAll('div.M71za.IfVEB.IlvQM.vATAB.yjpiY').forEach(div => {
                    const label = div.querySelector('span.Q_TBK.RIR92.cH1R2.cTzGe.anZsc.ooNE6')?.textContent.trim();
                    const value = div.querySelector('span.Q_TBK.RIR92.cH1R2.cTzGe.VLnCY.ooNE6')?.textContent.trim();
                    if (label === 'Tuning:') tuning = value || '/';
                    if (label === 'Key:') key = value || '/';
                    if (label === 'Capo:') capo = value || '/';
                });
            }

            const preElement = document.querySelector('pre.xNWlr.hjutX.PBFx0');
            if (preElement) {
                const clone = preElement.cloneNode(true);
                clone.querySelectorAll('span[data-name]').forEach(chord => {
                    chord.replaceWith(chord.getAttribute('data-name'));
                });
                clone.querySelectorAll('div[class*="vxv2A"]').forEach(div => div.remove());

                let notation = clone.textContent.trim();
                notation = notation.replace(/\n\s*\n+/g, '\n\n').replace(/\r\n/g, '\n');
                return { title, preinfo: { tuning, key, capo }, notation };
            }
            return { title, preinfo: { tuning, key, capo }, notation: '' };
        });

        return scrapedData;
    } catch (error) {
        console.error('Error fetching notation:', error.message);
        return { title: 'Error', preinfo: { tuning: 'Error', key: 'Error', capo: 'Error' }, notation: '' };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        const data = await performScraping(url);
        if (!data.notation) {
            return res.status(404).json({ error: 'No notation found', title: data.title, preinfo: data.preinfo });
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Scraping failed' });
    }
});

app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});