// ==============================================
//  EGGONOMY — Full Game Logic (Pure JS)
//  Bugs fixed:
//   - Double totalRevenue increment in confirmDistribute
//   - NaN guard on totalRev before applying to money
//   - processArrivals called in confirmSource (0-delay eggs usable immediately)
//   - State uses DEFAULT_STATE + getInitialState pattern (no missing fields)
//   - ensureStateValid() called at nextRound entry
//   - Save/load uses DEFAULT_STATE spread (no undefined fields after load)
//   - All event listeners via addEventListener (no inline onclick)
//   - Produce sliders reset properly each time producePhase opens
//   - confirmDistribute resets delivery/route radio to defaults on new round
// ==============================================

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const TOTAL_ROUNDS = 10;
const WIN_SCORE = 2000;
const WIN_SATISFACTION = 60;
const WAREHOUSE_CAPACITY = 100;
const SAVE_KEY = 'eggonomy_save_v2';

const DIFFICULTIES = {
  easy: { capital: 500, demandVar: 0.2, spoilRounds: 4, maxDemand: 25 },
  normal: { capital: 350, demandVar: 0.4, spoilRounds: 3, maxDemand: 35 },
  hard: { capital: 200, demandVar: 0.6, spoilRounds: 2, maxDemand: 45 },
};

const SUPPLY_OPTIONS = [
  { id: 'local', name: '🏘️ Local Farm', pricePerEgg: 1.20, maxQty: 30, delay: 0, risk: 0.00, desc: 'Reliable, fast. Higher cost.' },
  { id: 'regional', name: '🗺️ Regional Co-op', pricePerEgg: 1.00, maxQty: 60, delay: 1, risk: 0.05, desc: '+1 round delay. Lower cost.' },
  { id: 'global', name: '🌐 Global Importer', pricePerEgg: 0.75, maxQty: 999, delay: 2, risk: 0.20, desc: 'Cheapest. High delay & risk.' },
];

const RANDOM_EVENTS = [
  { id: 'disease', icon: '🦠', title: 'Bird Flu Scare', desc: 'Chickens quarantined! Lose 30% of flock.', type: 'bad', effect: s => { s.chickens = Math.floor(s.chickens * 0.7); } },
  { id: 'surge', icon: '📈', title: 'Demand Surge!', desc: 'Local event boosts demand by 50% this round!', type: 'good', effect: s => { s.demandBonus = 1.5; } },
  { id: 'spoil', icon: '🤢', title: 'Storage Malfunction', desc: 'Power outage! Lose 40% of stored eggs.', type: 'bad', effect: s => { s.eggs = s.eggs.map(e => ({ ...e, qty: Math.floor(e.qty * 0.6) })); } },
  { id: 'discount', icon: '💰', title: 'Feed Sale', desc: 'Supplier discount: 20% off this round\'s order.', type: 'good', effect: s => { s.orderDiscount = 0.8; } },
  { id: 'delay', icon: '⛈️', title: 'Supply Disruption', desc: 'Storm delays all incoming orders +1 round.', type: 'bad', effect: s => { s.extraDelay = 1; } },
  { id: 'bonusegg', icon: '🐣', title: 'Bumper Hatch!', desc: 'Chickens were extra productive! +5 free eggs.', type: 'good', effect: s => { if (s.eggs.length > 0) s.eggs[s.eggs.length - 1].qty += 5; else s.eggs.push({ qty: 5, age: 0 }); } },
  { id: 'price', icon: '💹', title: 'Market Price Spike', desc: 'Egg prices up 30% this round!', type: 'good', effect: s => { s.priceBonus = 1.3; } },
  { id: 'theft', icon: '🦊', title: 'Fox in the Henhouse!', desc: 'Predator struck! Lose up to 2 chickens.', type: 'bad', effect: s => { s.chickens = Math.max(0, s.chickens - 2); } },
];

// ─────────────────────────────────────────────
//  DEFAULT STATE — single source of truth for shape
// ─────────────────────────────────────────────
const DEFAULT_STATE = {
  round: 1,
  money: 0,
  score: 0,
  satisfaction: 100,
  difficulty: 'normal',
  cfg: null,
  eggs: [],           // [{qty, age}]  age increments each distribute phase
  chickens: 0,
  meat: 0,
  packedEggs: 0,
  pendingOrders: [],  // [{qty, hatch, arrivesRound}]
  selectedSupplier: 'local',
  orderDiscount: 1,
  extraDelay: 0,
  demandBonus: 1,
  priceBonus: 1,
  demand: null,
  roundLog: [],
  totalEggsSold: 0,
  totalRevenue: 0,
  totalRoundsSatisfied: 0,
  phase: 'source',
  lastResult: null,
  preferredRoute: 'local',
};

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {};

function getInitialState(difficulty) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  return {
    ...DEFAULT_STATE,
    money: cfg.capital,
    difficulty,
    cfg,
    demand: generateDemand(cfg),
  };
}

// ─────────────────────────────────────────────
//  EFFECTS
// ─────────────────────────────────────────────
const Effects = {
  shake() {
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 500);
  },
  confetti() {
    const colors = ['#f5c842', '#5ec97a', '#5db8e8', '#e85d5d', '#e8945d'];
    for (let i = 0; i < 120; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.cssText = `left:${Math.random() * 100}vw; top:-10px; background:${colors[Math.floor(Math.random() * colors.length)]}; animation-duration:${2 + Math.random() * 2}s; opacity:${0.5 + Math.random() * 0.5}`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }
  }
};

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { error: '⚠️', success: '✅', warn: '🔔', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span>${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut .4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ─────────────────────────────────────────────
//  SAVE / LOAD
// ─────────────────────────────────────────────
const Storage = {
  save() {
    if (!state.round) return;
    try {
      const save = {
        round: state.round, money: state.money, score: state.score,
        satisfaction: state.satisfaction, difficulty: state.difficulty,
        eggs: state.eggs, chickens: state.chickens, meat: state.meat,
        packedEggs: state.packedEggs, pendingOrders: state.pendingOrders,
        totalEggsSold: state.totalEggsSold, totalRevenue: state.totalRevenue,
        totalRoundsSatisfied: state.totalRoundsSatisfied,
        selectedSupplier: state.selectedSupplier, preferredRoute: state.preferredRoute,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) { console.warn('Save failed', e); }
  },
  load() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return false;
      const data = JSON.parse(json);
      // Validate critical fields
      if (isNaN(data.money) || isNaN(data.score) || !data.difficulty) {
        localStorage.removeItem(SAVE_KEY); return false;
      }
      const cfg = DIFFICULTIES[data.difficulty];
      if (!cfg) { localStorage.removeItem(SAVE_KEY); return false; }
      // Merge saved data onto DEFAULT_STATE to avoid missing fields
      state = { ...DEFAULT_STATE, ...data, cfg, demand: generateDemand(cfg), roundLog: [], phase: 'source' };
      ensureStateValid();
      return true;
    } catch (e) {
      localStorage.removeItem(SAVE_KEY); return false;
    }
  },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } },
  hasSave() { return !!localStorage.getItem(SAVE_KEY); }
};

// ─────────────────────────────────────────────
//  STATE VALIDATOR (defensive repair)
// ─────────────────────────────────────────────
function ensureStateValid() {
  if (!state || typeof state !== 'object') state = { ...DEFAULT_STATE };
  if (!state.cfg || !state.cfg.maxDemand) state.cfg = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
  if (!Array.isArray(state.eggs)) state.eggs = [];
  if (!Array.isArray(state.pendingOrders)) state.pendingOrders = [];
  if (typeof state.round !== 'number' || isNaN(state.round)) state.round = 1;
  if (typeof state.money !== 'number' || isNaN(state.money)) state.money = state.cfg.capital;
  if (typeof state.score !== 'number' || isNaN(state.score)) state.score = 0;
  if (typeof state.satisfaction !== 'number' || isNaN(state.satisfaction)) state.satisfaction = 100;
  if (typeof state.chickens !== 'number' || isNaN(state.chickens)) state.chickens = 0;
  if (typeof state.meat !== 'number' || isNaN(state.meat)) state.meat = 0;
  if (typeof state.packedEggs !== 'number' || isNaN(state.packedEggs)) state.packedEggs = 0;
  if (typeof state.totalRevenue !== 'number' || isNaN(state.totalRevenue)) state.totalRevenue = 0;
  if (typeof state.totalEggsSold !== 'number') state.totalEggsSold = 0;
  if (!state.demand) state.demand = generateDemand(state.cfg);
  if (!state.selectedSupplier) state.selectedSupplier = 'local';
  if (typeof state.orderDiscount !== 'number') state.orderDiscount = 1;
  if (typeof state.extraDelay !== 'number') state.extraDelay = 0;
  if (typeof state.demandBonus !== 'number') state.demandBonus = 1;
  if (typeof state.priceBonus !== 'number') state.priceBonus = 1;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function generateDemand(cfg) {
  const base = Math.floor(8 + Math.random() * cfg.maxDemand);
  return {
    eggs: Math.max(3, Math.floor(base * (0.8 + Math.random() * cfg.demandVar))),
    cartons: Math.max(0, Math.floor((base * 0.4) * (0.8 + Math.random() * cfg.demandVar))),
    meat: Math.max(0, Math.floor((base * 0.3) * (0.8 + Math.random() * cfg.demandVar))),
  };
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  else console.error('Screen not found:', id);
}

function addLog(msg, type = '') {
  const log = document.getElementById('event-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = msg;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 40) log.removeChild(log.lastChild);
}

// Deduct eggs FIFO (oldest first)
function deductEggs(amount) {
  let remaining = amount;
  state.eggs = state.eggs.map(batch => {
    if (remaining <= 0) return batch;
    const take = Math.min(batch.qty, remaining);
    remaining -= take;
    return { ...batch, qty: batch.qty - take };
  }).filter(b => b.qty > 0);
}

// Process orders that have arrived by current round
function processArrivals() {
  if (!Array.isArray(state.pendingOrders)) state.pendingOrders = [];
  const arrived = state.pendingOrders.filter(o => o.arrivesRound <= state.round);
  state.pendingOrders = state.pendingOrders.filter(o => o.arrivesRound > state.round);

  arrived.forEach(o => {
    if (o.qty > 0) {
      state.eggs.push({ qty: o.qty, age: 0 });
      addLog(`📦 Order of ${o.qty} eggs arrived!`, 'good');
      showToast(`Order of ${o.qty} eggs arrived!`, 'success');
    }
    if (o.hatch > 0) {
      state.chickens += o.hatch;
      addLog(`🐔 ${o.hatch} egg(s) hatched into chickens!`, 'good');
    }
  });
}

function showEventBanner(event) {
  document.querySelector('.event-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'event-banner';
  el.innerHTML = `<div class="ev-icon">${event.icon}</div><h4>${event.title}</h4><p>${event.desc}</p>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3300);
}

// ─────────────────────────────────────────────
//  PHASE SWITCHER
// ─────────────────────────────────────────────
function showPhase(phase) {
  state.phase = phase;
  const phases = ['source', 'produce', 'distribute', 'result'];
  const idx = phases.indexOf(phase);

  document.querySelectorAll('.phase-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.phase-step').forEach(s => {
    const pIdx = phases.indexOf(s.dataset.phase);
    s.classList.remove('active', 'done');
    if (pIdx === idx) s.classList.add('active');
    else if (pIdx < idx) s.classList.add('done');
  });

  const panel = document.getElementById(`phase-${phase}`);
  if (panel) panel.classList.add('active');

  if (phase === 'source') setupSourcePhase();
  else if (phase === 'produce') setupProducePhase();
  else if (phase === 'distribute') setupDistributePhase();
}

// ─────────────────────────────────────────────
//  GAME INIT
// ─────────────────────────────────────────────
function startGame(difficulty, isLoad = false) {
  if (isLoad) {
    if (Storage.load()) {
      showScreen('screen-game');
      renderAll();
      addLog(`📂 Game loaded — Round ${state.round}`, 'round');
      showPhase('source');
      showToast('Game loaded successfully!', 'success');
    } else {
      showToast('No valid save found.', 'error');
      showScreen('screen-menu');
    }
    return;
  }

  Storage.clear();
  state = getInitialState(difficulty);
  showScreen('screen-game');
  renderAll();
  addLog(`━━━ ROUND 1 ━━━`, 'round');
  addLog(`🎮 Started on ${difficulty.toUpperCase()}`, 'info');
  addLog(`Starting capital: $${state.money}`, 'info');
  showPhase('source');
}

// ─────────────────────────────────────────────
//  PHASE 1: SOURCE
// ─────────────────────────────────────────────
function setupSourcePhase() {
  const d = state.demand;
  document.getElementById('demand-hint').innerHTML =
    `📊 Forecast: ~${d.eggs} eggs, ~${d.cartons} cartons, ~${d.meat} meat units expected this round`;

  const container = document.getElementById('source-options');
  container.innerHTML = '';
  SUPPLY_OPTIONS.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'source-card' + (state.selectedSupplier === opt.id ? ' selected' : '');
    div.innerHTML = `
      <h4>${opt.name}</h4>
      <p>${opt.desc}<br>Max: ${opt.maxQty >= 999 ? '∞' : opt.maxQty}<br>Delay: ${opt.delay} round(s)</p>
      <div class="sc-price">$${opt.pricePerEgg.toFixed(2)}/egg</div>
    `;
    div.addEventListener('click', () => {
      state.selectedSupplier = opt.id;
      setupSourcePhase();
    });
    container.appendChild(div);
  });

  refreshOrderSlider();
}

function refreshOrderSlider() {
  const supplier = SUPPLY_OPTIONS.find(o => o.id === state.selectedSupplier) || SUPPLY_OPTIONS[0];
  const disc = state.orderDiscount || 1;
  const afford = Math.floor(state.money / (supplier.pricePerEgg * disc));
  const maxOrder = Math.min(supplier.maxQty, afford);

  const slider = document.getElementById('order-qty');
  slider.max = Math.max(0, maxOrder);
  if (parseInt(slider.value) > maxOrder) slider.value = 0;
  updateOrderDisplay();
}

function updateOrderDisplay() {
  const supplier = SUPPLY_OPTIONS.find(o => o.id === state.selectedSupplier) || SUPPLY_OPTIONS[0];
  const qty = parseInt(document.getElementById('order-qty').value) || 0;
  const disc = state.orderDiscount || 1;
  const cost = qty * supplier.pricePerEgg * disc;

  document.getElementById('order-qty-display').textContent = qty;
  document.getElementById('order-cost-preview').textContent =
    qty > 0
      ? `Total cost: $${cost.toFixed(2)}${disc < 1 ? ' (discount applied!)' : ''}`
      : 'No order placed';
}

function confirmSource() {
  const supplier = SUPPLY_OPTIONS.find(o => o.id === state.selectedSupplier) || SUPPLY_OPTIONS[0];
  const qty = parseInt(document.getElementById('order-qty').value) || 0;
  const disc = state.orderDiscount || 1;
  const cost = qty * supplier.pricePerEgg * disc;

  if (qty > 0 && cost > state.money) {
    Effects.shake();
    showToast('Not enough money for this order!', 'error');
    return;
  }

  // Disruption roll
  let extraDelay = state.extraDelay || 0;
  if (qty > 0 && Math.random() < supplier.risk) {
    extraDelay++;
    addLog('⚠️ Supply disruption! Order delayed +1 round', 'warn');
    showToast('Supply disruption! Order delayed.', 'warn');
  }

  if (qty > 0) {
    state.money -= cost;
    const arrivesRound = state.round + supplier.delay + extraDelay;
    if (!Array.isArray(state.pendingOrders)) state.pendingOrders = [];
    state.pendingOrders.push({ qty, hatch: 0, arrivesRound });
    addLog(`📦 Ordered ${qty} eggs from ${supplier.name} — arrives round ${arrivesRound} — $${cost.toFixed(2)}`, 'info');
  } else {
    addLog('📦 No sourcing order placed this round', 'info');
  }

  // Reset one-time modifiers
  state.orderDiscount = 1;
  state.extraDelay = 0;

  // Process any arrivals immediately (catches 0-delay local orders)
  processArrivals();

  showPhase('produce');
  renderAll();
}

// ─────────────────────────────────────────────
//  PHASE 2: PRODUCE
// ─────────────────────────────────────────────
function setupProducePhase() {
  if (!Array.isArray(state.eggs)) state.eggs = [];
  if (typeof state.chickens !== 'number') state.chickens = 0;

  const totalEggs = state.eggs.reduce((a, e) => a + e.qty, 0);
  const chickens = state.chickens;

  // Reset all sliders
  const setSlider = (id, max) => {
    const el = document.getElementById(id);
    el.max = max;
    el.value = 0;
  };
  setSlider('sell-eggs-qty', totalEggs);
  setSlider('hatch-eggs-qty', totalEggs);
  setSlider('pack-eggs-qty', Math.floor(totalEggs / 6) * 6);
  setSlider('slaughter-qty', chickens);

  updateProduceDisplays();
}

function updateProduceDisplays() {
  const sell = parseInt(document.getElementById('sell-eggs-qty').value) || 0;
  const hatch = parseInt(document.getElementById('hatch-eggs-qty').value) || 0;
  const pack = parseInt(document.getElementById('pack-eggs-qty').value) || 0;
  const slaughter = parseInt(document.getElementById('slaughter-qty').value) || 0;

  document.getElementById('sell-eggs-display').textContent = sell;
  document.getElementById('hatch-eggs-display').textContent = hatch;
  document.getElementById('pack-eggs-display').textContent = pack;
  document.getElementById('slaughter-display').textContent = slaughter;

  const totalEggs = state.eggs.reduce((a, e) => a + e.qty, 0);
  const eggsUsed = sell + hatch + pack;
  const remaining = totalEggs - eggsUsed;
  const pb = state.priceBonus || 1;
  const cartons = Math.floor(pack / 6);

  if (eggsUsed > totalEggs) {
    document.getElementById('produce-summary').innerHTML =
      `<span style="color:var(--red)">⚠️ Over-allocated! Using ${eggsUsed} of ${totalEggs} eggs. Reduce quantities.</span>`;
    return;
  }

  const parts = [];
  if (sell > 0) parts.push(`Sell ${sell} eggs → <strong>$${(sell * 2.5 * pb).toFixed(2)}</strong>`);
  if (hatch > 0) parts.push(`Hatch ${hatch} → arrives next round`);
  if (cartons > 0) parts.push(`Pack → ${cartons} cartons → <strong>$${(cartons * 18 * pb).toFixed(2)}</strong>`);
  if (slaughter > 0) parts.push(`Process ${slaughter} chickens → <strong>$${(slaughter * 8).toFixed(2)}</strong>`);

  document.getElementById('produce-summary').innerHTML =
    `Eggs: ${totalEggs} available | ${eggsUsed} assigned | <strong>${remaining} remaining</strong>` +
    (parts.length ? '<br>' + parts.join(' | ') : '');
}

function confirmProduce() {
  if (!Array.isArray(state.eggs)) state.eggs = [];
  if (typeof state.chickens !== 'number') state.chickens = 0;

  const sell = parseInt(document.getElementById('sell-eggs-qty').value) || 0;
  const hatch = parseInt(document.getElementById('hatch-eggs-qty').value) || 0;
  const pack = parseInt(document.getElementById('pack-eggs-qty').value) || 0;
  const slaughter = parseInt(document.getElementById('slaughter-qty').value) || 0;

  const totalEggs = state.eggs.reduce((a, e) => a + e.qty, 0);

  if (sell + hatch + pack > totalEggs) {
    showToast(`Over-allocated! You only have ${totalEggs} eggs.`, 'error');
    return;
  }
  if (slaughter > state.chickens) {
    showToast(`You only have ${state.chickens} chickens!`, 'error');
    return;
  }

  const pb = state.priceBonus || 1;

  if (sell > 0) {
    const rev = sell * 2.5 * pb;
    state.money += rev;
    state.totalRevenue += rev;
    state.totalEggsSold += sell;
    deductEggs(sell);
    addLog(`🥚 Sold ${sell} eggs for $${rev.toFixed(2)}`, 'good');
  }

  if (hatch > 0) {
    deductEggs(hatch);
    state.pendingOrders.push({ qty: 0, hatch, arrivesRound: state.round + 1 });
    addLog(`🐣 Hatching ${hatch} egg(s) — chickens arrive next round`, 'info');
  }

  if (pack > 0) {
    const cartons = Math.floor(pack / 6);
    deductEggs(pack);
    state.packedEggs += cartons;
    addLog(`📦 Packed ${cartons} carton(s) from ${pack} eggs`, 'info');
  }

  if (slaughter > 0) {
    const rev = slaughter * 8 * pb;
    state.money += rev;
    state.totalRevenue += rev;
    state.chickens -= slaughter;
    state.meat += slaughter;
    addLog(`🥩 Processed ${slaughter} chicken(s) for $${rev.toFixed(2)}`, 'info');
  }

  // Chickens lay eggs (after slaughter)
  if (state.chickens > 0) {
    const laid = state.chickens * 3;
    state.eggs.push({ qty: laid, age: 0 });
    addLog(`🐔 ${state.chickens} chicken(s) laid ${laid} egg(s)`, 'good');
  }

  // priceBonus consumed after production
  state.priceBonus = 1;

  showPhase('distribute');
  renderAll();
}

// ─────────────────────────────────────────────
//  PHASE 3: DISTRIBUTE
// ─────────────────────────────────────────────
function setupDistributePhase() {
  const totalEggs = (state.eggs || []).reduce((a, e) => a + e.qty, 0);
  const d = state.demand || { eggs: 0, cartons: 0, meat: 0 };

  // Reset radio defaults
  const deliveryRadio = document.querySelector('input[name="delivery"][value="standard"]');
  const routeRadio = document.querySelector(`input[name="route"][value="${state.preferredRoute || 'local'}"]`);
  if (deliveryRadio) deliveryRadio.checked = true;
  if (routeRadio) routeRadio.checked = true;

  document.getElementById('dist-summary').innerHTML =
    `Ready to sell: ${totalEggs} eggs | ${state.packedEggs} cartons | ${state.meat} meat<br>` +
    `Customer wants: ~${d.eggs} eggs | ~${d.cartons} cartons | ~${d.meat} meat`;
}

function confirmDistribute() {
  const deliverySpeed = document.querySelector('input[name="delivery"]:checked')?.value || 'standard';
  const sourceRoute = document.querySelector('input[name="route"]:checked')?.value || 'local';

  const d = state.demand || { eggs: 0, cartons: 0, meat: 0 };
  const pb = state.priceBonus || 1;
  const totalEggs = (state.eggs || []).reduce((a, e) => a + e.qty, 0);

  const DELIVERY_MODS = {
    fast: { costPerUnit: 0.50, satBonus: 10, fulfillRate: 1.00 },
    standard: { costPerUnit: 0.20, satBonus: 0, fulfillRate: 0.90 },
    slow: { costPerUnit: 0.05, satBonus: -15, fulfillRate: 0.70 },
  };
  const mod = DELIVERY_MODS[deliverySpeed] || DELIVERY_MODS.standard;

  const demandScale = state.demandBonus || 1;
  const actualDemand = {
    eggs: Math.round(d.eggs * demandScale),
    cartons: Math.round(d.cartons * demandScale),
    meat: Math.round(d.meat * demandScale),
  };
  state.demandBonus = 1; // consume

  const eggsSold = Math.min(totalEggs, Math.round(actualDemand.eggs * mod.fulfillRate));
  const cartonsSold = Math.min(state.packedEggs, Math.round(actualDemand.cartons * mod.fulfillRate));
  const meatSold = Math.min(state.meat, Math.round(actualDemand.meat * mod.fulfillRate));

  const totalUnits = eggsSold + cartonsSold + meatSold;
  const deliveryCost = totalUnits * mod.costPerUnit;

  const eggRev = eggsSold * 2.5 * pb;
  const cartonRev = cartonsSold * 18 * pb;
  const meatRev = meatSold * 8 * pb;
  const totalRev = eggRev + cartonRev + meatRev - deliveryCost;

  // FIX: Guard against NaN before touching state.money
  if (!isNaN(totalRev)) {
    state.money += totalRev;
    state.totalRevenue += totalRev;   // only ONE increment here
  } else {
    console.error('totalRev was NaN — skipping money update');
  }

  // Fulfillment & satisfaction
  const totalDemanded = actualDemand.eggs + actualDemand.cartons + actualDemand.meat;
  const totalFulfilled = eggsSold + cartonsSold + meatSold;
  const fulfillPct = totalDemanded > 0 ? (totalFulfilled / totalDemanded) * 100 : 100;
  const satDelta = mod.satBonus + (fulfillPct >= 80 ? 10 : fulfillPct >= 50 ? 0 : -15);
  state.satisfaction = Math.max(0, Math.min(100, state.satisfaction + satDelta));

  // Deduct sold inventory
  deductEggs(eggsSold);
  state.packedEggs -= cartonsSold;
  state.meat -= meatSold;

  // Scoring
  const roundScore = Math.max(0, Math.round(totalRev * 2 + fulfillPct * 5 + state.satisfaction * 2));
  state.score += roundScore;
  if (fulfillPct >= 70) state.totalRoundsSatisfied++;

  // Spoilage — age all egg batches by 1
  state.eggs = state.eggs.map(b => ({ ...b, age: b.age + 1 }));
  const spoilRounds = state.cfg?.spoilRounds || 3;
  const spoiledCount = state.eggs.filter(b => b.age >= spoilRounds).reduce((a, b) => a + b.qty, 0);
  state.eggs = state.eggs.filter(b => b.age < spoilRounds);

  // Save preferred route
  state.preferredRoute = sourceRoute;

  // Store result for rendering
  state.lastResult = {
    eggsSold, cartonsSold, meatSold, eggRev, cartonRev, meatRev,
    deliveryCost, totalRev, fulfillPct, satDelta, roundScore,
    spoiledCount, deliverySpeed, totalDemanded, totalFulfilled,
  };

  // Logs
  addLog(`💰 Round ${state.round} revenue: $${totalRev.toFixed(2)} (+${roundScore} pts)`, totalRev >= 0 ? 'good' : 'bad');
  if (spoiledCount > 0) addLog(`🗑️ ${spoiledCount} egg(s) spoiled`, 'warn');
  if (state.satisfaction < 30) addLog(`😡 Satisfaction critical: ${state.satisfaction.toFixed(0)}%`, 'bad');

  showPhase('result');
  renderResult();
  renderAll();
}

// ─────────────────────────────────────────────
//  PHASE 4: RESULT
// ─────────────────────────────────────────────
function renderResult() {
  const r = state.lastResult;
  if (!r) return;

  document.getElementById('result-content').innerHTML = `
    <div class="result-grid">
      <div class="result-card">
        <h4>Revenue</h4>
        <div class="result-val ${r.totalRev >= 0 ? 'positive' : 'negative'}">$${r.totalRev.toFixed(2)}</div>
      </div>
      <div class="result-card">
        <h4>Round Score</h4>
        <div class="result-val neutral">+${r.roundScore}</div>
      </div>
      <div class="result-card">
        <h4>Fulfillment</h4>
        <div class="result-val ${r.fulfillPct >= 70 ? 'positive' : 'negative'}">${r.fulfillPct.toFixed(0)}%</div>
      </div>
      <div class="result-card">
        <h4>Satisfaction Δ</h4>
        <div class="result-val ${r.satDelta >= 0 ? 'positive' : 'negative'}">${r.satDelta >= 0 ? '+' : ''}${r.satDelta}%</div>
      </div>
    </div>
    <div class="result-events">
      <h4>THIS ROUND</h4>
      <div class="result-event-item ${r.eggsSold > 0 ? 'good' : ''}">🥚 Sold ${r.eggsSold} eggs → $${r.eggRev.toFixed(2)}</div>
      <div class="result-event-item ${r.cartonsSold > 0 ? 'good' : ''}">📦 Sold ${r.cartonsSold} cartons → $${r.cartonRev.toFixed(2)}</div>
      <div class="result-event-item ${r.meatSold > 0 ? 'good' : ''}">🥩 Sold ${r.meatSold} meat → $${r.meatRev.toFixed(2)}</div>
      <div class="result-event-item warn">🚚 Delivery cost: −$${r.deliveryCost.toFixed(2)}</div>
      ${r.spoiledCount > 0 ? `<div class="result-event-item bad">🗑️ ${r.spoiledCount} egg(s) spoiled this round</div>` : ''}
      <div class="result-event-item">📊 Demand fulfilled: ${r.totalFulfilled}/${r.totalDemanded} (${r.fulfillPct.toFixed(0)}%)</div>
    </div>
  `;

  document.getElementById('btn-next-round').textContent =
    state.round >= TOTAL_ROUNDS ? 'FINISH GAME →' : 'NEXT ROUND →';
}

// ─────────────────────────────────────────────
//  NEXT ROUND
// ─────────────────────────────────────────────
function nextRound() {
  ensureStateValid(); // defensive repair before proceeding

  if (state.round >= TOTAL_ROUNDS) {
    endGame(false);
    return;
  }

  if (state.money < 0) {
    addLog('💸 Bankrupt! Game over.', 'bad');
    endGame(true, 'bankrupt');
    return;
  }

  state.round++;
  state.demand = generateDemand(state.cfg);
  addLog(`━━━ ROUND ${state.round} ━━━`, 'round');

  // Random event (25% chance)
  if (Math.random() < 0.25) {
    const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    event.effect(state);
    addLog(`${event.icon} EVENT: ${event.title} — ${event.desc}`, event.type === 'bad' ? 'bad' : 'good');
    showEventBanner(event);
    showToast(`${event.icon} ${event.title}`, event.type === 'bad' ? 'warn' : 'success');
  }

  Storage.save();
  renderAll();
  showPhase('source');
}

// ─────────────────────────────────────────────
//  END GAME
// ─────────────────────────────────────────────
function endGame(forced = false, reason = '') {
  Storage.clear();

  const won = !forced
    && state.score >= WIN_SCORE
    && state.satisfaction >= WIN_SATISFACTION;

  const statsHTML = buildEndStats();

  if (won) {
    document.getElementById('win-stats').innerHTML = statsHTML;
    showScreen('screen-win');
    setTimeout(() => Effects.confetti(), 200);
  } else {
    document.getElementById('lose-stats').innerHTML = statsHTML;
    const reasonEl = document.getElementById('lose-reason');
    if (reason === 'bankrupt') {
      reasonEl.textContent = 'You ran out of money.';
      Effects.shake();
    } else if (state.satisfaction < WIN_SATISFACTION) {
      reasonEl.textContent = `Customer satisfaction too low (${state.satisfaction.toFixed(0)}% — need ${WIN_SATISFACTION}%).`;
    } else {
      reasonEl.textContent = `Final score too low (${state.score} pts — need ${WIN_SCORE}).`;
    }
    showScreen('screen-lose');
  }
}

function buildEndStats() {
  return `
    <div class="end-stat-row"><span>Final Score</span><span>${state.score}</span></div>
    <div class="end-stat-row"><span>Satisfaction</span><span>${(state.satisfaction || 0).toFixed(0)}%</span></div>
    <div class="end-stat-row"><span>Total Revenue</span><span>$${(state.totalRevenue || 0).toFixed(2)}</span></div>
    <div class="end-stat-row"><span>Cash on Hand</span><span>$${(state.money || 0).toFixed(2)}</span></div>
    <div class="end-stat-row"><span>Total Eggs Sold</span><span>${state.totalEggsSold || 0}</span></div>
    <div class="end-stat-row"><span>Chickens Remaining</span><span>${state.chickens || 0}</span></div>
    <div class="end-stat-row"><span>Rounds Completed</span><span>${state.round || 0} / ${TOTAL_ROUNDS}</span></div>
    <div class="end-stat-row"><span>Difficulty</span><span>${(state.difficulty || 'normal').toUpperCase()}</span></div>
  `;
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function renderAll() {
  if (!state.round) return;

  // HUD
  document.getElementById('hud-round').textContent = `Round ${state.round}/${TOTAL_ROUNDS}`;
  document.getElementById('hud-money').textContent = `$${(isNaN(state.money) ? 0 : state.money).toFixed(2)}`;
  document.getElementById('hud-score').textContent = `Score: ${state.score || 0}`;

  const sat = isNaN(state.satisfaction) ? 100 : state.satisfaction;
  document.getElementById('hud-sat').textContent = `${sat >= 70 ? '😊' : sat >= 40 ? '😐' : '😡'} ${sat.toFixed(0)}%`;

  // Inventory
  const totalEggs = (state.eggs || []).reduce((a, e) => a + e.qty, 0);
  document.getElementById('inv-eggs').textContent = totalEggs;
  document.getElementById('inv-chickens').textContent = state.chickens || 0;
  document.getElementById('inv-meat').textContent = state.meat || 0;
  document.getElementById('inv-packed').textContent = state.packedEggs || 0;

  // WIN CONDITIONS PANEL
  let winCondPanel = document.getElementById('dynamic-win-cond');
  if (!winCondPanel) {
    const invPanel = document.getElementById('inventory-panel');
    if (invPanel) {
      winCondPanel = document.createElement('div');
      winCondPanel.id = 'dynamic-win-cond';
      winCondPanel.className = 'panel'; 
      winCondPanel.style.marginTop = '15px';
      winCondPanel.innerHTML = `
        <h3 style="border-bottom: 1px solid var(--border); padding-bottom: 5px; margin-bottom: 10px; color: var(--yolk);">🏆 Win Conditions</h3>
        <ul style="list-style-type: none; padding-left: 0; font-size: 0.85rem; line-height: 1.6; text-align: left;">
          <li>• Total Rounds: <strong>10 Rounds</strong></li>
          <li>• Target Score: <strong style="color: var(--green);">≥ 2,000 pts</strong></li>
          <li>• Min. Satisfaction: <strong style="color: var(--blue);">≥ 60%</strong></li>
        </ul>
      `;
      invPanel.parentNode.insertBefore(winCondPanel, invPanel.nextSibling);
    }
  }

  // Freshness warning
  const freshEl = document.getElementById('inv-eggs-fresh');
  if (totalEggs > 0 && state.eggs.length > 0) {
    const oldestAge = Math.max(...state.eggs.map(e => e.age));
    const spoilIn = (state.cfg?.spoilRounds || 3) - oldestAge;
    freshEl.textContent = spoilIn <= 1 ? '⚠️ Spoiling soon!' : `Oldest: ${spoilIn}r left`;
  } else {
    freshEl.textContent = '';
  }

  // Warehouse capacity
  const used = totalEggs + (state.packedEggs || 0) * 6 + (state.chickens || 0) * 2 + (state.meat || 0);
  const pct = Math.min(100, (used / WAREHOUSE_CAPACITY) * 100);
  const fill = document.getElementById('cap-fill');
  fill.style.width = `${pct}%`;
  fill.style.background = pct > 80 ? '#e85d5d' : pct > 60 ? '#e8945d' : '#5ec97a';
  document.getElementById('cap-val').textContent = `${Math.round(used)} / ${WAREHOUSE_CAPACITY}`;

  // Pending orders
  const pendingPanel = document.getElementById('pending-orders-panel');
  if (pendingPanel) {
    const eggOrders = (state.pendingOrders || []).filter(o => o.qty > 0);
    if (eggOrders.length > 0) {
      pendingPanel.innerHTML = `<div class="panel-title" style="margin-top:.8rem">⏳ INCOMING</div>` +
        eggOrders.map(o => `<div class="pending-order-item">📦 ${o.qty} eggs → round ${o.arrivesRound}</div>`).join('');
    } else {
      pendingPanel.innerHTML = '';
    }
  }

  // Market demand
  const d = state.demand || { eggs: 0, cartons: 0, meat: 0 };
  document.getElementById('market-demand').innerHTML = `
    <div class="demand-row"><span>🥚 Egg demand</span><span>~${d.eggs}</span></div>
    <div class="demand-row"><span>📦 Carton demand</span><span>~${d.cartons}</span></div>
    <div class="demand-row"><span>🥩 Meat demand</span><span>~${d.meat}</span></div>
    <div class="demand-row" style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">
      <span>Pending orders</span><span>${(state.pendingOrders || []).filter(o => o.qty > 0).length}</span>
    </div>
  `;

  // Prices (reflect active bonus)
  const pb = state.priceBonus || 1;
  document.getElementById('price-eggs').textContent = `$${(2.5 * pb).toFixed(2)}`;
  document.getElementById('price-cartons').textContent = `$${(18 * pb).toFixed(2)}`;
  document.getElementById('price-meat').textContent = `$${(8 * pb).toFixed(2)}`;
}

// ─────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────
window.Game = {
  startGame, showScreen,
  updateOrderDisplay, confirmSource,
  updateProduceDisplays, confirmProduce,
  confirmDistribute, nextRound,
};

function updateHTPButtons() {
  const backBtn = document.getElementById('btn-back-htp');
  const restartBtn = document.getElementById('btn-restart-htp');
  if (!backBtn) return;

  if (window._htpCalledFromGame) {
    backBtn.textContent = '← BACK TO GAME';
    if (restartBtn) restartBtn.style.display = 'inline-block';
  } else {
    backBtn.textContent = '← BACK';
    if (restartBtn) restartBtn.style.display = 'none';
  }
}

function initButtons() {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
    else console.warn(`Button not found: #${id}`);
  };

  // Splash
  bind('btn-start-splash', () => showScreen('screen-menu'));
  bind('btn-htp', () => showScreen('screen-howtoplay'));
  bind('btn-continue', () => startGame(null, true));

  // How To Play / Menu
  bind('btn-back-htp', () => {
    if (window._htpCalledFromGame) {
      window._htpCalledFromGame = false;
      updateHTPButtons();
      showScreen('screen-game');
    } else {
      showScreen('screen-splash');
    }
  });
  bind('btn-restart-htp', () => {
    window._htpCalledFromGame = false;
    updateHTPButtons();
    showScreen('screen-menu');
  });
  bind('btn-back-menu', () => showScreen('screen-splash'));

  // Difficulty
  bind('btn-diff-easy', () => startGame('easy'));
  bind('btn-diff-normal', () => startGame('normal'));
  bind('btn-diff-hard', () => startGame('hard'));

  // Game phases
  bind('btn-confirm-source', confirmSource);
  bind('btn-confirm-produce', confirmProduce);
  bind('btn-confirm-distribute', confirmDistribute);
  bind('btn-next-round', nextRound);
  bind('btn-help-game', () => {
    window._htpCalledFromGame = true;
    updateHTPButtons();
    showScreen('screen-howtoplay');
  });

  // How to play back to game
  const btnBackHowTo = document.getElementById('btn-back-howtoplay') || document.querySelector('#screen-howtoplay .btn');
  if (btnBackHowTo) {
    btnBackHowTo.onclick = (e) => {
      e.preventDefault();
      if (state && state.round >= 1 && document.getElementById('screen-game').classList.contains('active')) {
        showScreen('screen-game');
      } else {
        showScreen('screen-menu');
      }
    };
  }

  // End screens
  bind('btn-win-again', () => showScreen('screen-menu'));
  bind('btn-lose-again', () => showScreen('screen-menu'));

  // Range sliders (using addEventListener, not oninput)
  document.getElementById('order-qty')?.addEventListener('input', updateOrderDisplay);
  document.getElementById('sell-eggs-qty')?.addEventListener('input', updateProduceDisplays);
  document.getElementById('hatch-eggs-qty')?.addEventListener('input', updateProduceDisplays);
  document.getElementById('pack-eggs-qty')?.addEventListener('input', updateProduceDisplays);
  document.getElementById('slaughter-qty')?.addEventListener('input', updateProduceDisplays);

  // Show continue button if save exists
  if (Storage.hasSave()) {
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = 'inline-block';
  }

  window._htpCalledFromGame = false;
updateHTPButtons();

const invPanel = document.querySelector('.panel-inventory') || document.getElementById('inventory-panel');
  if (invPanel && !document.getElementById('win-conditions-panel')) {
    const wcSection = document.createElement('div');
    wcSection.className = 'win-conditions-section';
    wcSection.style.marginTop = '20px'; // Biar ada jarak aman dari box inventory atasnya
    
    wcSection.innerHTML = `
      <div class="panel-title" style="font-family: var(--font-display); font-weight: 700; margin-bottom: 12px; color: var(--yolk);">🏆 WIN CONDITIONS</div>
      <div id="win-conditions-panel" class="panel" style="background: var(--surface2); border: 1px solid var(--border); padding: 15px; border-radius: var(--radius); margin-bottom: 20px; text-align: left; font-size: 0.85rem;">
        <div style="text-align: center; color: var(--text-muted);">
          🏆<br>
          <span style="font-family: var(--font-display); font-weight: 700; color: var(--text);">WIN CONDITION</span><br>
          Complete <strong>10 rounds</strong> with a final score of ≥ <strong>2,000 points</strong> and customer satisfaction ≥ <strong>60%</strong>.
        </div>
      </div>
    `;
    invPanel.appendChild(wcSection);
  }

  console.log('✅ Eggonomy: All buttons initialized.');
}

// Run as soon as DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initButtons);
} else {
  initButtons();
}
