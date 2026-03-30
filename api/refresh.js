// Fonction serverless Vercel — proxy vers l'API marketdata
// Contourne le CORS : c'est le serveur qui appelle l'API, pas le navigateur.

const API_URL    = 'https://marketdata-api.yrzhao1068589.workers.dev/v1/prices/latest';
const ITEM_SLUGS = ['timber', 'tender-timber', 'sturdy-timber', 'abidos-timber', 'abidos-fusion-material'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

  const region = req.body?.region || 'euc';

  try {
    const upstream = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ region_slug: region, item_slugs: ITEM_SLUGS }),
    });

    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Erreur API upstream' });

    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
