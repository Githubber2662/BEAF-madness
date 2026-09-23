// Uses metanum.js for handling huge numbers

class Game {
  constructor() {
    this.currency = new MetaNum(1);
    this.passiveMultiplier = new MetaNum(1);
    this.clickMultiplier = new MetaNum(1.1);
    this.tickRate = 20;
    this.isRunning = false;
    this.upgrades = {};
    this.buildings = {};
    this.challenges = {};
    this.activeChallenge = 'none';
    this.autobuyers = { upgrades: { enabled: false, intervalMs: 1000 }, buildings: { enabled: false, intervalMs: 1000 } };
    this._lastAutobuyerRun = performance.now();
    this.initializeUpgrades(); this.initializeBuildings(); this.initializeChallenges();
  }

  initializeUpgrades() {
    this.upgrades = {
      doubleClick: { id: 'doubleClick', name: 'Double Click', description: '×2 click power', multiplier: new MetaNum(2), baseCost: new MetaNum(10), cost: new MetaNum(10), owned: new MetaNum(0), type: 'click', hyper: new MetaNum(0) },
      fastPacing: { id: 'fastPacing', name: 'Fast Pacing', description: '×1.5 passive multiplier', multiplier: new MetaNum(1.5), baseCost: new MetaNum(100), cost: new MetaNum(100), owned: new MetaNum(0), type: 'passive', hyper: new MetaNum(0) },
      exponentialGrowth: { id: 'exponentialGrowth', name: 'Exponential Growth', description: 'passive multiplier^1.2', multiplier: new MetaNum(1.2), baseCost: new MetaNum(1000), cost: new MetaNum(1000), owned: new MetaNum(0), type: 'passive', hyper: new MetaNum(1) }
    };
  }

  initializeBuildings() {
    this.buildings = {
      worker: { id: 'worker', name: 'Worker', description: 'Multiplies currency ×1.01 per second', multiplierPerSecond: new MetaNum(1.01), baseCost: new MetaNum(5), cost: new MetaNum(5), owned: new MetaNum(0) },
      factory: { id: 'factory', name: 'Factory', description: 'Multiplies currency ×1.05 per second', multiplierPerSecond: new MetaNum(1.05), baseCost: new MetaNum(500), cost: new MetaNum(500), owned: new MetaNum(0) },
      megaFactory: { id: 'megaFactory', name: 'Mega Factory', description: 'Multiplies currency ×1.10 per second', multiplierPerSecond: new MetaNum(1.10), baseCost: new MetaNum(50000), cost: new MetaNum(50000), owned: new MetaNum(0) }
    };
  }

  initializeChallenges() {
    this.challenges = {
      none: { id: 'none', name: 'No Challenge', description: 'Play normally', modifiers: {}, goals: [] },
      noUpgrades: { id: 'noUpgrades', name: 'No Upgrades', description: 'Upgrades are locked', modifiers: { disableUpgrades: true }, goals: [{ id: 'reach_1k', description: 'Reach 1,000 currency', type: 'currency', target: new MetaNum(1000), claimed: false }] },
      noBuildings: { id: 'noBuildings', name: 'No Buildings', description: 'Buildings are locked', modifiers: { disableBuildings: true }, goals: [{ id: 'reach_10k', description: 'Reach 10,000 currency', type: 'currency', target: new MetaNum(10000), claimed: false }] },
      challengeMarathon: { id: 'challengeMarathon', name: 'Marathon', description: 'No upgrades or buildings', modifiers: { disableBuildings: true, disableUpgrades: true }, goals: [{ id: 'reach_100k', description: 'Reach 100,000 currency', type: 'currency', target: new MetaNum(100000), claimed: false }] }
    };
  }

  click() { this.currency = this.currency.mul(this.clickMultiplier); }
  _modifiers() { return this.challenges[this.activeChallenge]?.modifiers || {}; }
  _purchaseCost(base, rate, count) { return MetaNum.pow(base, count).mul(MetaNum.pow(rate, count.mul(count.sub(1)).div(2))); }

  maxAffordableCount(currency, baseCost, rate) {
    if (!currency || !baseCost || !rate || !currency.isFinite() || !baseCost.isFinite()) return new MetaNum(0);
    if (!currency.gte(baseCost)) return new MetaNum(0);
    const r = rate instanceof MetaNum ? rate : new MetaNum(rate);
    const lnCurrency = currency.ln(), lnBase = baseCost.ln(), lnRate = r.ln();
    if (MetaNum.abs(lnRate).lt(new MetaNum('1e-12'))) return lnBase.gt(0) ? MetaNum.floor(lnCurrency.div(lnBase)) : new MetaNum(0);
    const a = lnRate.div(2), b = lnBase.sub(a), discriminant = b.mul(b).add(a.mul(lnCurrency).mul(4));
    if (!discriminant.isFinite() || discriminant.isNaN() || discriminant.lt(0)) return new MetaNum(0);
    let result = MetaNum.floor(b.neg().add(discriminant.sqrt()).div(a.mul(2)));
    if (result.isNaN() || !result.isFinite() || result.lt(0)) return new MetaNum(0);
    const cost = n => this._purchaseCost(baseCost, r, n);
    while (result.gt(0) && (!cost(result).isFinite() || cost(result).gt(currency))) result = result.sub(1);
    while (result.add(1).isFinite() && cost(result.add(1)).lte(currency)) result = result.add(1);
    return result;
  }

  _count(amount, max) {
    if (amount === 'max') return max;
    const n = amount instanceof MetaNum ? amount : new MetaNum(String(amount));
    if (n.isNaN() || !n.isFinite() || n.lt(0)) return new MetaNum(0);
    return MetaNum.min(n, max);
  }

  buyUpgrade(name, amount = 1) {
    const upgrade = this.upgrades[name];
    if (!upgrade || this._modifiers().disableUpgrades) return false;
    const rate = new MetaNum(2), max = this.maxAffordableCount(this.currency, upgrade.baseCost, rate), count = this._count(amount, max);
    if (count.isNaN() || !count.isFinite() || count.lte(0)) return false;
    const purchaseCost = this._purchaseCost(upgrade.baseCost, rate, count);
    if (!purchaseCost.isFinite() || purchaseCost.isNaN()) return false;
    const multiplier = MetaNum.pow(upgrade.multiplier, count);
    if (!multiplier.isFinite() || multiplier.isNaN()) return false;
    if (upgrade.type === 'click') this.clickMultiplier = this.clickMultiplier.mul(multiplier);
    else if (upgrade.hyper.gt(1)) this.passiveMultiplier = this.passiveMultiplier.arrow(upgrade.hyper)(multiplier);
    else if (upgrade.hyper.eq(1)) this.passiveMultiplier = this.passiveMultiplier.pow(multiplier);
    else this.passiveMultiplier = this.passiveMultiplier.mul(multiplier);
    upgrade.owned = upgrade.owned.add(count);
    this.currency = this.currency.div(purchaseCost).max(1);
    upgrade.cost = MetaNum.pow(rate, upgrade.owned).mul(upgrade.baseCost);
    return true;
  }

  buyBuilding(name, amount = 1) {
    const building = this.buildings[name];
    if (!building || this._modifiers().disableBuildings) return false;
    const rate = new MetaNum(1.15), max = this.maxAffordableCount(this.currency, building.baseCost, rate), count = this._count(amount, max);
    if (count.isNaN() || !count.isFinite() || count.lte(0)) return false;
    const purchaseCost = this._purchaseCost(building.baseCost, rate, count);
    if (!purchaseCost.isFinite() || purchaseCost.isNaN()) return false;
    building.owned = building.owned.add(count);
    this.currency = this.currency.div(purchaseCost).max(1);
    building.cost = MetaNum.pow(rate, building.owned).mul(building.baseCost);
    return true;
  }

  runAutobuyersIfNeeded() {
    const now = performance.now();
    if (this.autobuyers.upgrades.enabled && now - this._lastAutobuyerRun >= this.autobuyers.upgrades.intervalMs) for (const key in this.upgrades) this.buyUpgrade(key, 'max');
    if (this.autobuyers.buildings.enabled && now - this._lastAutobuyerRun >= this.autobuyers.buildings.intervalMs) for (const key in this.buildings) this.buyBuilding(key, 'max');
    if (now - this._lastAutobuyerRun >= Math.min(this.autobuyers.upgrades.intervalMs, this.autobuyers.buildings.intervalMs)) this._lastAutobuyerRun = now;
  }

  toggleAutobuyer(type) { if (!this.autobuyers[type]) return false; this.autobuyers[type].enabled = !this.autobuyers[type].enabled; this._lastAutobuyerRun = performance.now(); return this.autobuyers[type].enabled; }
  setAutobuyerInterval(type, value) {
    const n = Number(value);
    if (!this.autobuyers[type] || !Number.isFinite(n)) return false;
    this.autobuyers[type].intervalMs = Math.max(100, Math.round(n));
    return true;
  }

  tick() {
    for (const building of Object.values(this.buildings)) if (building.owned.gt(0)) this.currency = this.currency.mul(MetaNum.pow(building.multiplierPerSecond, building.owned).pow(new MetaNum(this.tickRate).div(1000)));
    let passive = this.passiveMultiplier.clone();
    if (this._modifiers().passiveMultiplierBonus) passive = passive.mul(this._modifiers().passiveMultiplierBonus);
    this.currency = this.currency.mul(passive.pow(new MetaNum(this.tickRate).div(1000)));
    this.runAutobuyersIfNeeded(); this.checkChallengeGoals();
  }

  maxAllUpgrades() { for (const key in this.upgrades) this.buyUpgrade(key, 'max'); }
  start() { if (!this.isRunning) { this.isRunning = true; this.gameLoop = setInterval(() => this.tick(), this.tickRate); } }
  stop() { this.isRunning = false; clearInterval(this.gameLoop); this.gameLoop = null; }

  save() {
    try {
      const save = { currency: this.currency.toString(), clickMultiplier: this.clickMultiplier.toString(), passiveMultiplier: this.passiveMultiplier.toString(), activeChallenge: this.activeChallenge, autobuyers: this.autobuyers, upgrades: {}, buildings: {}, challenges: {} };
      for (const [key, u] of Object.entries(this.upgrades)) save.upgrades[key] = { owned: u.owned.toString(), cost: u.cost.toString(), multiplier: u.multiplier.toString(), hyper: u.hyper.toString() };
      for (const [key, b] of Object.entries(this.buildings)) save.buildings[key] = { owned: b.owned.toString(), cost: b.cost.toString() };
      for (const [key, c] of Object.entries(this.challenges)) save.challenges[key] = { goals: (c.goals || []).map(g => ({ id: g.id, claimed: !!g.claimed, completed: !!g.completed })) };
      localStorage.setItem('beaf_save_v1', JSON.stringify(save)); return true;
    } catch (e) { console.error('Save failed', e); return false; }
  }

  load() {
    try {
      const save = JSON.parse(localStorage.getItem('beaf_save_v1') || 'null'); if (!save) return false;
      if (save.currency) this.currency = new MetaNum(save.currency); if (save.clickMultiplier) this.clickMultiplier = new MetaNum(save.clickMultiplier); if (save.passiveMultiplier) this.passiveMultiplier = new MetaNum(save.passiveMultiplier); if (save.activeChallenge && this.challenges[save.activeChallenge]) this.activeChallenge = save.activeChallenge;
      for (const [key, value] of Object.entries(save.upgrades || {})) if (this.upgrades[key]) { this.upgrades[key].owned = new MetaNum(value.owned || 0); this.upgrades[key].cost = new MetaNum(value.cost || this.upgrades[key].baseCost); if (value.multiplier) this.upgrades[key].multiplier = new MetaNum(value.multiplier); if (value.hyper) this.upgrades[key].hyper = new MetaNum(value.hyper); }
      for (const [key, value] of Object.entries(save.buildings || {})) if (this.buildings[key]) { this.buildings[key].owned = new MetaNum(value.owned || 0); this.buildings[key].cost = new MetaNum(value.cost || this.buildings[key].baseCost); }
      for (const key of ['upgrades', 'buildings']) if (save.autobuyers?.[key]) { this.autobuyers[key].enabled = !!save.autobuyers[key].enabled; this.setAutobuyerInterval(key, save.autobuyers[key].intervalMs); }
      return true;
    } catch (e) { console.error('Load failed', e); return false; }
  }

  exportSave() { return localStorage.getItem('beaf_save_v1') || '{}'; }
  importSave(text) { try { JSON.parse(text); localStorage.setItem('beaf_save_v1', text); return this.load(); } catch (e) { return false; } }
  hardReset() { if (!confirm('Are you sure? This will delete your save and reset progress.')) return false; localStorage.removeItem('beaf_save_v1'); location.reload(); return true; }
  startChallenge(id) { if (!this.challenges[id]) return false; this.activeChallenge = id; this.currency = new MetaNum(1); this.clickMultiplier = new MetaNum(1.1); this.passiveMultiplier = new MetaNum(1); return true; }
  endChallenge() { this.activeChallenge = 'none'; return true; }
  checkChallengeGoals() { for (const goal of this.challenges[this.activeChallenge]?.goals || []) if (!goal.claimed && goal.type === 'currency' && this.currency.gte(goal.target)) goal.completed = true; }
  claimChallengeGoal(challengeId, goalId) { const goal = this.challenges[challengeId]?.goals?.find(g => g.id === goalId); if (!goal || goal.claimed || !goal.completed) return false; this.currency = this.currency.sub(this.currency.max(1)); return true; }
  getState() {
    const upgrades = Object.fromEntries(Object.entries(this.upgrades).map(([key, u]) => [key, { ...u, cost: u.cost.toString(), baseCost: u.baseCost.toString(), multiplier: u.multiplier.toString(), hyper: u.hyper.toString() }]));
    const buildings = Object.fromEntries(Object.entries(this.buildings).map(([key, b]) => [key, { ...b, cost: b.cost.toString(), baseCost: b.baseCost.toString(), multiplierPerSecond: b.multiplierPerSecond.toString() }]));
    return { currency: this.currency.toString(), clickMultiplier: this.clickMultiplier.toString(), passiveMultiplier: this.passiveMultiplier.toString(), upgrades, buildings, challenges: this.challenges, autobuyers: this.autobuyers, activeChallenge: this.activeChallenge, isRunning: this.isRunning };
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = Game;

