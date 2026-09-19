// Uses metanum.js for handling huge numbers

class Game {
  constructor() {
    this.currency = new MetaNum(1);
    this.passiveMultiplier = new MetaNum(1);
    this.clickMultiplier = new MetaNum(1.1);
    this.upgrades = {};
    this.buildings = {};
    this.tickRate = 20;
    this.isRunning = false;
    this.challenges = {};
    this.activeChallenge = 'none';
    this.autobuyers = {
      upgrades: { enabled: false, intervalMs: 1000 },
      buildings: { enabled: false, intervalMs: 1000 }
    };
    this._lastAutobuyerRun = performance.now();
    this.initializeUpgrades();
    this.initializeBuildings();
    this.initializeChallenges();
  }

  initializeUpgrades() {
    this.upgrades = {
      doubleClick: {
        id: 'doubleClick', name: 'Double Click', description: '×2 click power',
        multiplier: new MetaNum(2), baseCost: new MetaNum(10), cost: new MetaNum(10),
        owned: new MetaNum(0), type: 'click', hyper: new MetaNum(0)
      },
      fastPacing: {
        id: 'fastPacing', name: 'Fast Pacing', description: '×1.5 passive multiplier',
        multiplier: new MetaNum(1.5), baseCost: new MetaNum(100), cost: new MetaNum(100),
        owned: new MetaNum(0), type: 'passive', hyper: new MetaNum(0)
      },
      exponentialGrowth: {
        id: 'exponentialGrowth', name: 'Exponential Growth', description: 'passive multiplier^1.2',
        multiplier: new MetaNum(1.2), baseCost: new MetaNum(1000), cost: new MetaNum(1000),
        owned: new MetaNum(0), type: 'passive', hyper: new MetaNum(1)
      }
    };
  }

  initializeBuildings() {
    this.buildings = {
      worker: {
        id: 'worker', name: 'Worker', description: 'Multiplies currency ×1.01 per second',
        multiplierPerSecond: new MetaNum(1.01), baseCost: new MetaNum(5), cost: new MetaNum(5), owned: new MetaNum(0)
      },
      factory: {
        id: 'factory', name: 'Factory', description: 'Multiplies currency ×1.05 per second',
        multiplierPerSecond: new MetaNum(1.05), baseCost: new MetaNum(500), cost: new MetaNum(500), owned: new MetaNum(0)
      },
      megaFactory: {
        id: 'megaFactory', name: 'Mega Factory', description: 'Multiplies currency ×1.10 per second',
        multiplierPerSecond: new MetaNum(1.10), baseCost: new MetaNum(50000), cost: new MetaNum(50000), owned: new MetaNum(0)
      }
    };
  }

  initializeChallenges() {
    this.challenges = {
      none: { id: 'none', name: 'No Challenge', description: 'Play normally', unlocked: true, modifiers: {}, goals: [] },
      noUpgrades: {
        id: 'noUpgrades', name: 'No Upgrades', description: 'Upgrades are locked', unlocked: true,
        modifiers: { disableUpgrades: true, passiveMultiplierBonus: new MetaNum(1) },
        goals: [{ id: 'reach_1k', description: 'Reach 1,000 currency', type: 'currency', target: new MetaNum(1000), claimed: false }]
      },
      noBuildings: {
        id: 'noBuildings', name: 'No Buildings', description: 'Buildings disabled', unlocked: true,
        modifiers: { disableBuildings: true, clickMultiplierBonus: new MetaNum(1) },
        goals: [{ id: 'reach_10k', description: 'Reach 10,000 currency', type: 'currency', target: new MetaNum(10000), claimed: false }]
      },
      challengeMarathon: {
        id: 'challengeMarathon', name: 'Marathon', description: 'No upgrades or buildings', unlocked: true,
        modifiers: { disableBuildings: true, disableUpgrades: true },
        goals: [{ id: 'reach_100k', description: 'Reach 100,000 currency', type: 'currency', target: new MetaNum(100000), claimed: false }]
      }
    };
  }

  click() {
    let power = this.clickMultiplier.clone();
    const modifiers = this.challenges[this.activeChallenge]?.modifiers || {};
    if (modifiers.clickMultiplierBonus) power = power.mul(modifiers.clickMultiplierBonus);
    this.currency = this.currency.mul(power);
  }

  // Return a MetaNum count.  Keeping the count as MetaNum is important because
  // upgrade/building quantities can become larger than Number.MAX_SAFE_INTEGER.
  maxAffordableCount(currency, baseCost, rate) {
    if (!currency.gte(baseCost)) return new MetaNum(0);
    const r = rate instanceof MetaNum ? rate : new MetaNum(rate);
    if (r.lte(0)) return new MetaNum(0);

    const lnCurrency = currency.ln();
    const lnBase = baseCost.ln();
    const lnRate = r.ln();
    if (MetaNum.abs(lnRate).lt(new MetaNum('1e-12'))) {
      if (lnBase.lte(0)) return new MetaNum(0);
      return MetaNum.floor(lnCurrency.div(lnBase));
    }

    // log(cost(n)) = n*log(base) + n*(n-1)/2*log(rate)
    const a = lnRate.div(2);
    const b = lnBase.sub(lnRate.div(2));
    const discriminant = b.mul(b).add(a.mul(lnCurrency).mul(4));
    if (discriminant.lt(0)) return new MetaNum(0);
    let result = MetaNum.floor(b.neg().add(discriminant.sqrt()).div(a.mul(2)));
    if (result.isNaN() || result.lt(0)) return new MetaNum(0);
    return result;
  }

  _challengeModifiers() {
    return this.challenges[this.activeChallenge]?.modifiers || {};
  }

  _isDisabled(kind) {
    return !!this._challengeModifiers()[kind === 'upgrade' ? 'disableUpgrades' : 'disableBuildings'];
  }

  _buyMultiplier(upgrade, count) {
    // Hyper is metadata for the upgrade category; the previous implementation
    // called an undefined variable (`hyper`) and crashed on every purchase.
    return MetaNum.pow(upgrade.multiplier, count);
  }

  _purchaseCost(baseCost, rate, count) {
    return MetaNum.pow(baseCost, count).mul(MetaNum.pow(rate, count.mul(count.sub(1)).div(2)));
  }

  buyUpgrade(name, amount = 1) {
    const upgrade = this.upgrades[name];
    if (!upgrade || this._isDisabled('upgrade')) return false;
    const rate = new MetaNum(2);
    const max = this.maxAffordableCount(this.currency, upgrade.baseCost, rate);
    if (max.lte(0)) return false;
    const count = amount === 'max' ? max : MetaNum.min(
      amount instanceof MetaNum ? amount : new MetaNum(String(amount)), max
    );
    if (count.isNaN() || count.lte(0)) return false;

    const multiplier = this._buyMultiplier(upgrade, count);
    if (upgrade.type === 'click') this.clickMultiplier = this.clickMultiplier.mul(multiplier);
    else {
      if(upgrade.type === 'passive') {
        if(upgrade.hyper.gt(1)) {          
          this.passiveMultiplier = this.passiveMultiplier.arrow(hyper)(multiplier);
        }
        else {
          if(upgrade.hyper.eq(1)) {
            this.passiveMultiplier = this.passiveMultiplier.pow(multiplier);
        }
        else {
          this.passiveMultiplier = this.passiveMultiplier.mul(multiplier);
        }
      }
    }
    }
    upgrade.owned = upgrade.owned.add(count);
    this.currency = this.currency.div(this._purchaseCost(upgrade.baseCost, rate, count)).max(1);
    upgrade.cost = MetaNum.pow(rate, upgrade.owned).mul(upgrade.baseCost);
    return true;
  }

  buyBuilding(name, amount = 1) {
    const building = this.buildings[name];
    if (!building || this._isDisabled('building')) return false;
    const rate = new MetaNum(1.15);
    const max = this.maxAffordableCount(this.currency, building.baseCost, rate);
    if (max.lte(0)) return false;
    const count = amount === 'max' ? max : MetaNum.min(
      amount instanceof MetaNum ? amount : new MetaNum(String(amount)), max
    );
    if (count.isNaN() || count.lte(0)) return false;
    building.owned = building.owned.add(count);
    this.currency = this.currency.div(this._purchaseCost(building.baseCost, rate, count)).max(1);
    building.cost = MetaNum.pow(rate, building.owned).mul(building.baseCost);
    return true;
  }

  tick() {
    for (const building of Object.values(this.buildings)) {
      if (building.owned.gt(0)) {
        const perSecond = MetaNum.pow(building.multiplierPerSecond, building.owned);
        this.currency = this.currency.mul(perSecond.pow(new MetaNum(this.tickRate).div(1000)));
      }
    }
    let passive = this.passiveMultiplier.clone();
    const bonus = this._challengeModifiers().passiveMultiplierBonus;
    if (bonus) passive = passive.mul(bonus);
    this.currency = this.currency.mul(passive.pow(new MetaNum(this.tickRate).div(1000)));
    this.runAutobuyersIfNeeded();
    this.checkChallengeGoals();
  }

  runAutobuyersIfNeeded() {
    const now = performance.now();
    if (now - this._lastAutobuyerRun < Math.min(this.autobuyers.upgrades.intervalMs, this.autobuyers.buildings.intervalMs)) return;
    if (this.autobuyers.upgrades.enabled) for (const key in this.upgrades) this.buyUpgrade(key, 'max');
    if (this.autobuyers.buildings.enabled) for (const key in this.buildings) this.buyBuilding(key, 'max');
    this._lastAutobuyerRun = now;
  }

  toggleAutobuyer(which) {
    if (!this.autobuyers[which]) return false;
    this.autobuyers[which].enabled = !this.autobuyers[which].enabled;
    this._lastAutobuyerRun = performance.now();
    return this.autobuyers[which].enabled;
  }

  maxAllUpgrades() { for (const key in this.upgrades) this.buyUpgrade(key, 'max'); }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.gameLoop = setInterval(() => this.tick(), this.tickRate);
  }

  stop() {
    this.isRunning = false;
    if (this.gameLoop) clearInterval(this.gameLoop);
    this.gameLoop = null;
  }

  save() {
    try {
      const save = {
        currency: this.currency.toString(), clickMultiplier: this.clickMultiplier.toString(),
        passiveMultiplier: this.passiveMultiplier.toString(), tickRate: this.tickRate,
        activeChallenge: this.activeChallenge, upgrades: {}, buildings: {}, challenges: {}, autobuyers: this.autobuyers
      };
      for (const [key, u] of Object.entries(this.upgrades)) save.upgrades[key] = {
        owned: u.owned.toString(), cost: u.cost.toString(), baseCost: u.baseCost.toString(), multiplier: u.multiplier.toString()
      };
      for (const [key, b] of Object.entries(this.buildings)) save.buildings[key] = {
        owned: b.owned.toString(), cost: b.cost.toString(), baseCost: b.baseCost.toString(), multiplierPerSecond: b.multiplierPerSecond.toString()
      };
      for (const [key, c] of Object.entries(this.challenges)) save.challenges[key] = {
        goals: (c.goals || []).map(g => ({ id: g.id, claimed: !!g.claimed, completed: !!g.completed }))
      };
      localStorage.setItem('beaf_save_v1', JSON.stringify(save));
      return true;
    } catch (e) { console.error('Save failed', e); return false; }
  }

  load() {
    try {
      const raw = localStorage.getItem('beaf_save_v1');
      if (!raw) return false;
      const save = JSON.parse(raw);
      if (save.currency) this.currency = new MetaNum(save.currency);
      if (save.clickMultiplier) this.clickMultiplier = new MetaNum(save.clickMultiplier);
      if (save.passiveMultiplier) this.passiveMultiplier = new MetaNum(save.passiveMultiplier);
      if (save.tickRate) this.tickRate = save.tickRate;
      if (save.activeChallenge && this.challenges[save.activeChallenge]) this.activeChallenge = save.activeChallenge;
      for (const [key, value] of Object.entries(save.upgrades || {})) if (this.upgrades[key]) {
        this.upgrades[key].owned = new MetaNum(value.owned || 0);
        this.upgrades[key].cost = new MetaNum(value.cost || this.upgrades[key].baseCost);
        if (value.multiplier) this.upgrades[key].multiplier = new MetaNum(value.multiplier);
      }
      for (const [key, value] of Object.entries(save.buildings || {})) if (this.buildings[key]) {
        this.buildings[key].owned = new MetaNum(value.owned || 0);
        this.buildings[key].cost = new MetaNum(value.cost || this.buildings[key].baseCost);
        if (value.multiplierPerSecond) this.buildings[key].multiplierPerSecond = new MetaNum(value.multiplierPerSecond);
      }
      if (save.autobuyers) for (const key of ['upgrades', 'buildings']) if (save.autobuyers[key]) {
        this.autobuyers[key].enabled = !!save.autobuyers[key].enabled;
        if (save.autobuyers[key].intervalMs) this.autobuyers[key].intervalMs = save.autobuyers[key].intervalMs;
      }
      for (const [key, value] of Object.entries(save.challenges || {})) if (this.challenges[key]) {
        for (const goal of this.challenges[key].goals || []) {
          const saved = (value.goals || []).find(g => g.id === goal.id);
          if (saved) { goal.claimed = !!saved.claimed; goal.completed = !!saved.completed; }
        }
      }
      return true;
    } catch (e) { console.error('Load failed', e); return false; }
  }

  exportSave() { return localStorage.getItem('beaf_save_v1') || JSON.stringify({}); }

  importSave(text) {
    try { JSON.parse(text); localStorage.setItem('beaf_save_v1', text); return this.load(); }
    catch (e) { console.error('Import failed', e); return false; }
  }

  hardReset() {
    if (!confirm('Are you sure? This will delete your save and reset progress.')) return false;
    localStorage.removeItem('beaf_save_v1');
    setTimeout(() => location.reload(), 50);
    return true;
  }

  startChallenge(id) {
    if (!this.challenges[id]) return false;
    this.activeChallenge = id;
    this.currency = new MetaNum(1);
    this.clickMultiplier = new MetaNum(1.1);
    this.passiveMultiplier = new MetaNum(1);
    for (const u of Object.values(this.upgrades)) { u.owned = new MetaNum(0); u.cost = u.baseCost.clone(); }
    for (const b of Object.values(this.buildings)) { b.owned = new MetaNum(0); b.cost = b.baseCost.clone(); }
    for (const goal of this.challenges[id].goals || []) { goal.claimed = false; goal.completed = false; }
    return true;
  }

  endChallenge() { this.activeChallenge = 'none'; return true; }

  checkChallengeGoals() {
    const challenge = this.challenges[this.activeChallenge];
    for (const goal of challenge?.goals || []) if (!goal.claimed && goal.type === 'currency' && this.currency.gte(goal.target)) goal.completed = true;
  }

  claimChallengeGoal(challengeId, goalId) {
    const goal = this.challenges[challengeId]?.goals?.find(g => g.id === goalId);
    if (!goal || goal.claimed || !goal.completed) return false;
    this.currency = this.currency.mul(2);
    goal.claimed = true;
    return true;
  }

  getCurrencyDisplay() { return this.currency.toString(); }

  getState() {
    const upgrades = Object.fromEntries(Object.entries(this.upgrades).map(([key, u]) => [key, {
      ...u, cost: u.cost.toString(), baseCost: u.baseCost.toString(), multiplier: u.multiplier.toString(), owned: u.owned.toString()
    }]));
    const buildings = Object.fromEntries(Object.entries(this.buildings).map(([key, b]) => [key, {
      ...b, cost: b.cost.toString(), baseCost: b.baseCost.toString(), multiplierPerSecond: b.multiplierPerSecond.toString(), owned: b.owned.toString()
    }]));
    return {
      currency: this.currency.toString(), clickMultiplier: this.clickMultiplier.toString(), passiveMultiplier: this.passiveMultiplier.toString(),
      upgrades, buildings, challenges: this.challenges, activeChallenge: this.activeChallenge, autobuyers: this.autobuyers
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Game;
