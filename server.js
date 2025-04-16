const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://anime1.me';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/health', (_, res) => {
  res.status(200).send('OK');
});

app.get('/api/resolve', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith(BASE_URL)) {
    return res.status(400).json({ error: '請提供 anime1.me 單集網址' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      timeout: 15000
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'referer': BASE_URL,
      'user-agent': 'Mozilla/5.0'
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const result = await page.evaluate(() => {
      const video = document.querySelector('video[data-apireq]');
      if (video) {
        const raw = video.getAttribute('data-apireq');
        const decoded = decodeURIComponent(raw);
        return { apireq: JSON.parse(decoded), tserver: video.getAttribute('data-tserver') };
      }

      const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
      for (let script of scripts) {
        const match = script.match(/https:\/\/[^"']+\.anime1\.me[^"']+\.mp4/);
        if (match && match[0]) return { mp4: match[0] };
      }

      return {};
    });

    await browser.close();

    if (result.apireq) {
      const apiRes = await axios.post(`${BASE_URL}/api`, result.apireq, {
        headers: { 'Referer': url }
      });
      return res.json({ video: apiRes.data.url });
    }

    if (result.mp4) {
      return res.json({ video: result.mp4 });
    }

    return res.status(404).json({ error: '找不到影片連結' });
  } catch (err) {
    if (browser) await browser.close();
    return res.status(504).json({ error: 'Puppeteer timeout or launch error' });
  }
});

app.get('/', (_, res) => {
  res.send('✅ Anime1 Puppeteer API v2 Ready');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
