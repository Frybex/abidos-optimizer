// ── Chargement des prix via le proxy serveur (/api/refresh) ──────────────────
// Le serveur Node (app.js) se charge de contourner le CORS côté API.

const SLUG_MAP = {
  'timber':                 'price-gris',
  'tender-timber':          'price-vert',
  'sturdy-timber':          'price-bleu',
  'abidos-timber':          'price-orange',
  'abidos-fusion-material': 'price-abidos',
};

function getRegion() {
  return document.getElementById('region-select')?.value || 'euc';
}

function applyPrices(data) {
  data.forEach(item => {
    const inputId = SLUG_MAP[item.item_slug];
    if (!inputId) return;
    const el = document.getElementById(inputId);
    if (!el) return;
    const num = Math.round(item.price);
    el.value = num === 0 ? '' : num.toLocaleString('fr-FR');
  });
}

function setPriceStatus(state, msg) {
  const btn = document.getElementById('btn-refresh');
  const lbl = document.getElementById('price-updated');
  if (!btn || !lbl) return;
  if (state === 'loading') {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">↻</span> Actualisation…';
    lbl.textContent = '';
    lbl.style.color = 'var(--text-dim)';
  } else if (state === 'ok') {
    btn.disabled = false;
    btn.innerHTML = '↻ Actualiser les prix';
    lbl.textContent = msg || '';
    lbl.style.color = 'var(--text-dim)';
  } else if (state === 'error') {
    btn.disabled = false;
    btn.innerHTML = '↻ Actualiser les prix';
    lbl.textContent = '⚠ Serveur non disponible';
    lbl.style.color = 'var(--loss)';
  }
}

async function refreshPrices() {
  setPriceStatus('loading');
  try {
    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: getRegion() })
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    applyPrices(data);
    const ts = data[0]?.timestamp
      ? new Date(data[0].timestamp * 1000).toLocaleString('fr-FR')
      : '';
    setPriceStatus('ok', ts ? `Mis à jour : ${ts}` : 'Prix mis à jour');
  } catch(e) {
    setPriceStatus('error');
  }
}

// Chargement automatique au démarrage (nécessite le serveur node app.js)
document.addEventListener('DOMContentLoaded', refreshPrices);

// ── Formatage des inputs ──────────────────────────────────────────────────────
function fmt(n){ return n===0?'':n.toLocaleString('fr-FR'); }
function raw(id){ return parseInt((document.getElementById(id).value||'0').replace(/\s/g,'').replace(/\u202f/g,''))||0; }

function initNumInputs(){
  document.querySelectorAll('.num-input').forEach(inp=>{
    inp.addEventListener('input', function(){
      const pos = this.selectionStart;
      const raw  = this.value.replace(/[^\d]/g,'');
      const num  = parseInt(raw)||0;
      const formatted = num===0&&raw==='' ? '' : num.toLocaleString('fr-FR');
      const diff = formatted.length - this.value.length;
      this.value = formatted;
      try{ this.setSelectionRange(pos+diff, pos+diff); }catch(e){}
    });
    inp.addEventListener('keydown', function(e){
      // Allow: backspace, delete, tab, arrows, home, end
      if([8,9,37,38,39,40,46,35,36].includes(e.keyCode)) return;
      // Allow digits only
      if((e.key>='0'&&e.key<='9')) return;
      e.preventDefault();
    });
  });
}
// Script is placed at end of body so DOM is already ready — call directly
initNumInputs();
// ── Règles du jeu ────────────────────────────────────────────────────────────
// Recette : 86 gris + 45 vert + 33 orange → 1 lot = 10 abidos
// Échanges :
//   A : 25 vert   → 50 gris
//   B : 50 vert   → 80 poudre
//   C : 100 gris  → 80 poudre
//   D : 100 poudre → 10 orange
//   E : 5 bleu    → 50 gris

const REC = { gris:86, vert:45, orange:33 };
const LOT = 10;

function canCraft(g,v,o){ return Math.floor(Math.min(g/REC.gris, v/REC.vert, o/REC.orange)); }

function applyExchanges(g0,v0,b0,o0,p0, nA,nB,nC,nD,nE){
  let g=g0,v=v0,b=b0,o=o0,p=p0;
  if(v < nA*25+nB*50) return null;
  if(b < nE*5)        return null;
  v-=nA*25; g+=nA*50;
  v-=nB*50; p+=nB*80;
  b-=nE*5;  g+=nE*50;
  if(g<nC*100) return null;
  g-=nC*100; p+=nC*80;
  if(p<nD*100) return null;
  p-=nD*100; o+=nD*10;
  const lots=canCraft(g,v,o);
  return {lots, abidos:lots*LOT,
          g:g-lots*REC.gris, v:v-lots*REC.vert, b, o:o-lots*REC.orange, p,
          nA,nB,nC,nD,nE};
}

// Résolution analytique gloutonne : détermine les échanges optimaux sans brute-force
function runOpt(g0,v0,b0,o0,p0){
  // On travaille en continu (réel) pour trouver les ratios, puis on arrondit
  let best = applyExchanges(g0,v0,b0,o0,p0,0,0,0,0,0)
          || {lots:0,abidos:0,g:g0,v:v0,b:b0,o:o0,p:p0,nA:0,nB:0,nC:0,nD:0,nE:0};

  // Stratégie : essayer toutes les combinaisons de "convertir X% de chaque ressource"
  // via une recherche sur un petit nombre de points bien choisis

  // Bornes réelles max de chaque échange
  const maxE = Math.floor(b0/5);          // bleu → gris
  const maxA = Math.floor(v0/25);         // vert → gris
  const maxB = Math.floor(v0/50);         // vert → poudre
  // (A et B partagent le vert : nA*25 + nB*50 <= v0)

  // On normalise : on itère sur un échantillon réduit de chaque variable
  // en utilisant des fractions (0, 1/4, 1/2, 3/4, 1) × max
  const fracs = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

  for(const fE of fracs){
    const nE = Math.floor(maxE * fE);
    const gAfterE = g0 + nE*50;
    const maxC = Math.floor(gAfterE/100);

    for(const fA of fracs){
      const nA = Math.floor(maxA * fA);
      const vertUsedA = nA*25;
      if(vertUsedA > v0) continue;
      const vertLeft = v0 - vertUsedA;
      const maxBlocal = Math.floor(vertLeft/50);

      for(const fB of fracs){
        const nB = Math.floor(maxBlocal * fB);
        if(nA*25 + nB*50 > v0) continue;
        const gAfterAE = gAfterE + nA*50;
        const maxClocal = Math.floor(gAfterAE/100);

        for(const fC of fracs){
          const nC = Math.floor(maxClocal * fC);
          const pAfter = p0 + nB*80 + nC*80;
          const maxD = Math.floor(pAfter/100);

          for(const fD of fracs){
            const nD = Math.floor(maxD * fD);
            const r = applyExchanges(g0,v0,b0,o0,p0,nA,nB,nC,nD,nE);
            if(r && r.lots > best.lots) best = r;
          }
        }
      }
    }
  }

  // Raffinement local autour du meilleur trouvé : ±2 sur chaque variable
  const {nA:bA,nB:bB,nC:bC,nD:bD,nE:bE} = best;
  for(let dE=-2;dE<=2;dE++) for(let dA=-2;dA<=2;dA++) for(let dB=-2;dB<=2;dB++)
  for(let dC=-2;dC<=2;dC++) for(let dD=-2;dD<=2;dD++){
    const nE=Math.max(0,bE+dE), nA=Math.max(0,bA+dA), nB=Math.max(0,bB+dB);
    const nC=Math.max(0,bC+dC), nD=Math.max(0,bD+dD);
    const r=applyExchanges(g0,v0,b0,o0,p0,nA,nB,nC,nD,nE);
    if(r && r.lots > best.lots) best=r;
  }

  return best;
}

// ── Onglets ──────────────────────────────────────────────────────────────────
function switchTab(id,btn){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  document.getElementById('results-stock').style.display='none';
  document.getElementById('results-eco').style.display='none';
}

// ── Mode Stock ───────────────────────────────────────────────────────────────
function optimize(){
  const g0=raw('in-gris');
  const v0=raw('in-vert');
  const b0=raw('in-bleu');
  const o0=raw('in-orange');
  const p0=raw('in-poudre');
  const best=runOpt(g0,v0,b0,o0,p0);
  showStockResults(best);
}

function showStockResults(r){
  const f = n => n.toLocaleString('fr-FR');
  document.getElementById('s-abidos').textContent=f(r.abidos);
  document.getElementById('s-sublabel').textContent=`abidos craftables (${r.lots} lot${r.lots>1?'s':''})`;
  document.getElementById('s-rem-gris').textContent=f(r.g);
  document.getElementById('s-rem-vert').textContent=f(r.v);
  document.getElementById('s-rem-bleu').textContent=f(r.b);
  document.getElementById('s-rem-orange').textContent=f(r.o);
  document.getElementById('s-rem-poudre').textContent=f(r.p);
  renderSteps('s-steps', r, false);
  const el=document.getElementById('results-stock');
  el.style.display='block';
  el.scrollIntoView({behavior:'smooth',block:'start'});
}

// ── Mode Économie ────────────────────────────────────────────────────────────
const TAX = 0.05;

function showError(msg){
  const existing = document.getElementById('eco-error');
  if(existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'eco-error';
  div.style.cssText = 'color:var(--loss);font-size:13px;font-style:italic;padding:10px 0;text-align:center;';
  div.textContent = msg;
  document.querySelector('#tab-economy .btn').insertAdjacentElement('afterend', div);
  setTimeout(()=>{ if(div.parentNode) div.remove(); }, 4000);
}
        
function analyzeEco(){
  const existing = document.getElementById('eco-error');
  if(existing) existing.remove();

  const pG  = raw('price-gris');
  const pV  = raw('price-vert');
  const pB  = raw('price-bleu');
  const pO  = raw('price-orange');
  const pBuy= raw('price-abidos');
  const pSel= pBuy;
  const targetAbidos = raw('target-abidos');

  if(targetAbidos === 0){ showError("Veuillez entrer un objectif de production (nombre d'abidos)."); return; }
  if(pBuy === 0 && pG===0 && pV===0 && pO===0 && pB===0){ showError("Veuillez entrer au moins le prix des bois ou le prix d'achat des abidos."); return; }

  const CRAFT_FEE = raw('craft-fee') || 300;
  const lotsNeeded = Math.ceil(targetAbidos / LOT);
  const abidosNeeded = lotsNeeded * LOT;

  // ── Sourcing optimal du gris : mix bleu converti + gris direct ──
  // On cherche le nombre de lots de 100 bleu (nBL) et de lots de 100 gris (nGL)
  // tel que nBL*1000 + nGL*100 >= grisNeeded, au coût minimum
  const grisNeeded = lotsNeeded * REC.gris;
  const grisPerBleuLot = 1000; // 100 bleu × (50 gris / 5 bleu)

  let bestGrisCost = Infinity, bestBLots = 0, bestGLots = 0;
  const maxBleuLots = pB > 0 ? Math.ceil(grisNeeded / grisPerBleuLot) : 0;

  for(let nb = 0; nb <= maxBleuLots; nb++){
    const grisFromBleu = nb * grisPerBleuLot;
    const grisStillNeeded = Math.max(0, grisNeeded - grisFromBleu);
    const ng = pG > 0 ? Math.ceil(grisStillNeeded / 100) : (grisStillNeeded > 0 ? Infinity : 0);
    if(ng === Infinity) continue; // pas de gris dispo, impossible
    const cost = nb * (pB > 0 ? pB : Infinity) + ng * (pG > 0 ? pG : 0);
    if(cost < bestGrisCost){ bestGrisCost = cost; bestBLots = nb; bestGLots = ng; }
  }
  // Si on n'a que du gris direct (pas de bleu)
  if(pB === 0){ bestBLots = 0; bestGLots = pG > 0 ? Math.ceil(grisNeeded/100) : 0; bestGrisCost = bestGLots*pG; }
  // Si on n'a que du bleu (pas de gris)
  if(pG === 0 && pB > 0){ bestGLots = 0; bestBLots = Math.ceil(grisNeeded/grisPerBleuLot); bestGrisCost = bestBLots*pB; }

  const buyG = bestGLots * 100;
  const buyB_for_gris = bestBLots * 100;
  const buyV = pV > 0 ? Math.ceil(lotsNeeded * REC.vert   / 100) * 100 : 0;
  const buyO = pO > 0 ? Math.ceil(lotsNeeded * REC.orange / 100) * 100 : 0;

  const woodCost = bestGrisCost + (pV>0?buyV/100*pV:0) + (pO>0?buyO/100*pO:0);
  const craftFeesTotal = lotsNeeded * CRAFT_FEE;
  const craftCost = woodCost + craftFeesTotal;

  // Simuler avec les ressources achetées
  const simRes = runOpt(buyG, buyV, buyB_for_gris, buyO, 0);
  const craftedAbidos = simRes.abidos;
  const craftUnitCost = craftCost > 0 && craftedAbidos > 0 ? craftCost / craftedAbidos : 0;

  // Label source gris pour affichage
  const _buyG = buyG, _buyB = buyB_for_gris, _buyV = buyV, _buyO = buyO;
  const _grisSource = buyB_for_gris > 0 && buyG > 0 ? 'mix'
                    : buyB_for_gris > 0 ? 'bleu' : 'gris';

  // ── Option B : Acheter directement ──
  const buyCost = pBuy > 0 ? abidosNeeded * pBuy : 0;
  const buyUnitCost = pBuy;

  // ── Affichage Option A ──
  const fN = n => n.toLocaleString('fr-FR');
  const G = '<img src="img/Gold.webp" class="ico">';
  const A = '<img src="img/Abidos.webp" class="ico">';
  document.getElementById('e-craft-cost').innerHTML   = woodCost > 0 ? fN(Math.round(woodCost))+' '+G : 'N/A';
  document.getElementById('e-craft-fees').innerHTML   = fN(craftFeesTotal)+' '+G;
  document.getElementById('e-craft-abidos').innerHTML = craftedAbidos > 0 ? fN(craftedAbidos)+' '+A : 'N/A';
  document.getElementById('e-craft-unit').innerHTML   = craftUnitCost > 0 ? fN(Math.round(craftUnitCost))+' '+G+'/u' : 'N/A';

  // ── Affichage Option B ──
  document.getElementById('e-buy-cost').innerHTML   = buyCost > 0 ? fN(Math.round(buyCost))+' '+G : 'N/A';
  document.getElementById('e-buy-abidos').innerHTML = buyCost > 0 ? fN(abidosNeeded)+' '+A : 'N/A';
  document.getElementById('e-buy-unit').innerHTML   = buyUnitCost > 0 ? fN(buyUnitCost)+' '+G+'/u' : 'N/A';

  // ── Verdict ──
  const verdictIcon = document.getElementById('eco-verdict-icon');
  const verdictText = document.getElementById('eco-verdict-text');
  const verdictSub  = document.getElementById('eco-verdict-sub');
  const savings = document.getElementById('eco-savings');

  if(craftCost > 0 && buyCost > 0){
    const diff = buyCost - craftCost;
    const diffPct = Math.abs(Math.round(diff/buyCost*100));
    if(diff > 0){
      verdictIcon.textContent = '⚒️';
      verdictText.innerHTML = '<span style="color:var(--vert)">Crafter est moins cher</span>';
      verdictSub.innerHTML = `Vous économisez ${Math.round(diff).toLocaleString('fr-FR')} <img src="img/Gold.webp" class="ico"> (${diffPct}%) vs l'achat direct`;
      savings.style.display='block';
      savings.innerHTML = `Économie : <span class="c-profit" style="font-family:'Cinzel',serif;font-size:16px">+${Math.round(diff).toLocaleString('fr-FR')} <img src="img/Gold.webp" class="ico"></span> en craftant plutôt qu'en achetant`;
    } else if(diff < 0){
      verdictIcon.textContent = '🛒';
      verdictText.innerHTML = '<span style="color:var(--bleu)">Acheter est moins cher</span>';
      verdictSub.innerHTML = `L'achat direct vous économise ${Math.round(-diff).toLocaleString('fr-FR')} <img src="img/Gold.webp" class="ico"> (${diffPct}%) vs le craft`;
      savings.style.display='block';
      savings.innerHTML = `Économie : <span style="color:var(--bleu);font-family:'Cinzel',serif;font-size:16px">+${Math.round(-diff).toLocaleString('fr-FR')} <img src="img/Gold.webp" class="ico"></span> en achetant plutôt qu'en craftant`;
    } else {
      verdictIcon.textContent = '⚖️';
      verdictText.innerHTML = '<span style="color:var(--gold)">Cout identique</span>';
      verdictSub.textContent = 'Les deux options reviennent au meme prix.';
      savings.style.display='none';
    }
  } else if(craftCost > 0){
    verdictIcon.textContent = '⚒️';
    verdictText.innerHTML = '<span style="color:var(--vert)">Cout du craft</span>';
    verdictSub.textContent = 'Prix d\'achat des abidos non renseigne — comparaison impossible.';
    savings.style.display='none';
  } else if(buyCost > 0){
    verdictIcon.textContent = '🛒';
    verdictText.innerHTML = '<span style="color:var(--bleu)">Cout de l\'achat direct</span>';
    verdictSub.textContent = 'Prix des bois non renseignes — comparaison impossible.';
    savings.style.display='none';
  } else {
    verdictIcon.textContent = '❓';
    verdictText.textContent = 'Donnees insuffisantes';
    verdictSub.textContent  = 'Renseignez les prix des bois et/ou le prix d\'achat des abidos.';
    savings.style.display='none';
  }

  // ── Section revente (optionnelle) ──
  const sellWrap = document.getElementById('eco-sell-wrap');
  if(pSel > 0 && craftedAbidos > 0){
    sellWrap.style.display='block';
    const sellRevenue = Math.round(craftedAbidos * pSel * (1 - TAX));
    const sellProfit  = sellRevenue - Math.round(craftCost);
    const marginPerU  = craftUnitCost > 0 ? Math.round(pSel*(1-TAX) - craftUnitCost) : 0;
    const G2 = '<img src="img/Gold.webp" class="ico">';
    document.getElementById('e-sell-rev').innerHTML    = fN(sellRevenue)+' '+G2;
    const spEl = document.getElementById('e-sell-profit');
    spEl.innerHTML = (sellProfit>=0?'+':'')+fN(sellProfit)+' '+G2;
    spEl.className   = 'eco-val '+(sellProfit>=0?'c-profit':'c-loss');
    const smEl = document.getElementById('e-sell-margin');
    smEl.innerHTML = (marginPerU>=0?'+':'')+fN(marginPerU)+' '+G2+'/u';
    smEl.className   = 'eco-val '+(marginPerU>=0?'c-profit':'c-loss');
  } else {
    sellWrap.style.display='none';
  }

  // ── Plan d'achat bois ──
  const opw = document.getElementById('obj-plan-wrap');
  if(craftCost > 0){
    opw.style.display='block';
    const fL = n => n.toLocaleString('fr-FR');

    const ICO2 = {
      gris:   '<img src="img/Bois_gris.webp" class="ico">',
      vert:   '<img src="img/Bois_vert.webp" class="ico">',
      bleu:   '<img src="img/Bois_bleu.webp" class="ico">',
      orange: '<img src="img/Bois_orange.webp" class="ico">',
      abidos: '<img src="img/Abidos.webp" class="ico">',
      gold:   '<img src="img/Gold.webp" class="ico">',
    };
    const buySteps = [];
    if(_buyB > 0) buySteps.push(`Achetez <span class="qty c-bleu">${ICO2.bleu} ${fL(_buyB)} Bois Bleu</span> &nbsp; ${fL(Math.round(_buyB/100*pB))} ${ICO2.gold} &nbsp;·&nbsp; se convertit en ${fL(_buyB*10)} ${ICO2.gris} gris`);
    if(_buyG > 0) buySteps.push(`Achetez <span class="qty c-gris">${ICO2.gris} ${fL(_buyG)} Bois Gris</span> &nbsp; ${fL(Math.round(_buyG/100*pG))} ${ICO2.gold}`);
    if(_buyV > 0) buySteps.push(`Achetez <span class="qty c-vert">${ICO2.vert} ${fL(_buyV)} Bois Vert</span> &nbsp; ${fL(Math.round(_buyV/100*pV))} ${ICO2.gold}`);
    if(_buyO > 0) buySteps.push(`Achetez <span class="qty c-orange">${ICO2.orange} ${fL(_buyO)} Bois Orange</span> &nbsp; ${fL(Math.round(_buyO/100*pO))} ${ICO2.gold}`);
    buySteps.push(`Frais de craft : <span class="qty c-poudre">${fL(lotsNeeded * CRAFT_FEE)} ${ICO2.gold}</span> &nbsp; (${lotsNeeded} lot${lotsNeeded>1?'s':''} × ${CRAFT_FEE} ${ICO2.gold})`);
    buySteps.push(`Total : <span class="qty c-gold">${fL(Math.round(craftCost))} ${ICO2.gold}</span> pour ${fL(abidosNeeded)} ${ICO2.abidos} (${lotsNeeded} lot${lotsNeeded>1?'s':''})`);

    document.getElementById('obj-plan').innerHTML =
      '<ol class="steps-list">' +
      buySteps.map((s, i) => {
        const isTotal = i === buySteps.length - 1;
        return `<li class="step" style="border-left-color:${isTotal?'var(--gold)':'var(--gold-dim)'};${isTotal?'background:rgba(201,168,76,0.06)':''};animation-delay:${i*0.07}s">
          <span class="step-num">${isTotal?'':''+( i+1)}</span>
          <span class="step-text">${s}</span>
        </li>`;
      }).join('') +
      '</ol>';

    // Remplir les panels échanges + restants de l'onglet éco
    const f = n => n.toLocaleString('fr-FR');
    document.getElementById('e-rem-gris').textContent=f(simRes.g);
    document.getElementById('e-rem-vert').textContent=f(simRes.v);
    document.getElementById('e-rem-bleu').textContent=f(simRes.b);
    document.getElementById('e-rem-orange').textContent=f(simRes.o);
    document.getElementById('e-rem-poudre').textContent=f(simRes.p);
    renderSteps('e-steps', simRes, true);
  } else {
    opw.style.display='none';
    document.getElementById('e-rem-gris').textContent=0;
    document.getElementById('e-rem-vert').textContent=0;
    document.getElementById('e-rem-bleu').textContent=0;
    document.getElementById('e-rem-orange').textContent=0;
    document.getElementById('e-rem-poudre').textContent=0;
    renderSteps('e-steps', {nA:0,nB:0,nC:0,nD:0,nE:0,lots:0,abidos:0}, true);
  }

  document.getElementById('results-eco').style.display='block';
  document.getElementById('results-eco').scrollIntoView({behavior:'smooth',block:'start'});
}

// ── Rendu des étapes d'échange ────────────────────────────────────────────────
function renderSteps(containerId, r, ecoMode){
  const f = n => n.toLocaleString('fr-FR');
  const ICO = {
    gris:   '<img src="img/Bois_gris.webp" class="ico">',
    vert:   '<img src="img/Bois_vert.webp" class="ico">',
    bleu:   '<img src="img/Bois_bleu.webp" class="ico">',
    orange: '<img src="img/Bois_orange.webp" class="ico">',
    poudre: '<img src="img/Poudre.webp" class="ico">',
    abidos: '<img src="img/Abidos.webp" class="ico">',
    gold:   '<img src="img/Gold.webp" class="ico">',
  };
  const steps=[];
  if(ecoMode && (r.nA||r.nB||r.nC||r.nD||r.nE||r.lots)){
    steps.push(`<span style="font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;color:var(--gold-light)">AVEC LES BOIS QUE VOUS VENEZ D'ACHETER :</span>`);
  }
  if(r.nE>0) steps.push(`Échangez <span class="qty c-bleu">${ICO.bleu} ${f(r.nE*5)} bleu</span> → <span class="qty c-gris">${ICO.gris} ${f(r.nE*50)} gris</span> <small style="color:var(--text-dim)">(×${r.nE} fois : 5→50)</small>`);
  if(r.nA>0) steps.push(`Échangez <span class="qty c-vert">${ICO.vert} ${f(r.nA*25)} vert</span> → <span class="qty c-gris">${ICO.gris} ${f(r.nA*50)} gris</span> <small style="color:var(--text-dim)">(×${r.nA} fois : 25→50)</small>`);
  if(r.nB>0) steps.push(`Échangez <span class="qty c-vert">${ICO.vert} ${f(r.nB*50)} vert</span> → <span class="qty c-poudre">${ICO.poudre} ${f(r.nB*80)} poudre</span> <small style="color:var(--text-dim)">(×${r.nB} fois : 50→80)</small>`);
  if(r.nC>0) steps.push(`Échangez <span class="qty c-gris">${ICO.gris} ${f(r.nC*100)} gris</span> → <span class="qty c-poudre">${ICO.poudre} ${f(r.nC*80)} poudre</span> <small style="color:var(--text-dim)">(×${r.nC} fois : 100→80)</small>`);
  if(r.nD>0) steps.push(`Échangez <span class="qty c-poudre">${ICO.poudre} ${f(r.nD*100)} poudre</span> → <span class="qty c-orange">${ICO.orange} ${f(r.nD*10)} orange</span> <small style="color:var(--text-dim)">(×${r.nD} fois : 100→10)</small>`);
  if(r.lots>0) steps.push(`Craftez <span class="qty c-gold">${r.lots} lot${r.lots>1?'s':''} = ${f(r.abidos)} ${ICO.abidos}</span> <small style="color:var(--text-dim)">(${f(r.lots*REC.gris)} ${ICO.gris} + ${f(r.lots*REC.vert)} ${ICO.vert} + ${f(r.lots*REC.orange)} ${ICO.orange})</small>`);

  const c=document.getElementById(containerId);
  if(steps.length===0){
    c.innerHTML='<p class="no-steps">Aucun echange utile - craftez directement.</p>';
  } else {
    const isLabel = s => s.startsWith('<span style=');
    c.innerHTML='<ol class="steps-list">'+steps.map((s,i)=>{
      if(isLabel(s)) return `<li class="step" style="border-left-color:var(--gold-dim);background:rgba(201,168,76,0.04);animation-delay:0s"><span class="step-text">${s}</span></li>`;
      const num = steps.slice(0,i).filter(x=>!isLabel(x)).length+1;
      return `<li class="step" style="animation-delay:${i*0.07}s"><span class="step-num">${num}</span><span class="step-text">${s}</span></li>`;
    }).join('')+'</ol>';
  }
}