const express = require('express');
const path    = require('path');

const app  = express();
const SITE = path.join(__dirname, 'Abidos_Optimizer');

const API_URL   = 'https://marketdata-api.yrzhao1068589.workers.dev/v1/prices/latest';
const ITEM_SLUGS = ['timber','tender-timber','sturdy-timber','abidos-timber','abidos-fusion-material'];

app.use(express.json());
app.use(express.static(SITE));

// ── POST /api/refresh : proxy vers l'API marketdata (contourne le CORS) ───────
app.post('/api/refresh', async (req, res) => {
  const region_slug = req.body?.region || 'euc';
  try {
    const upstream = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ region_slug, item_slugs: ITEM_SLUGS }),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'API error' });
    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
