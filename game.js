// Uses metanum.js for handling huge numbers

class Game {
  constructor() {
    // Initialize currency as MetaNum (1 = starting currency)
    this.currency = new MetaNum(1);

    // Multipliers that apply each tick
    this.passiveMultiplier = new MetaNum(1);    // Things that multiply currency passively
    this.clickMultiplier = new MetaNum(1.1);      // Click power multiplier

    // Game state
    this.upgrades = {};
    this.buildings = {};
    this.tickRate = 16; // milliseconds per tick (62.5 fps)
    this.isRunning = false; // start stopped; call start() to begin

    // Challenges
    this.challenges = {};
    this.activeChallenge = null;

    // Autobuyers
    this.autobuyers = {
      upgrades: { enabled: false, intervalMs: 1000 },
      buildings: { enabled: false, intervalMs: 1000 }
    };
    this._lastAutobuyerRun = Date.now();

    this.initializeUpgrades();
    this.initializeBuildings();
    this.initializeChallenges();
  }

  initializeUpgrades() {
    // Upgrades that increase multipliers
    this.upgrades = {
      doubleClick: {
        id: 'doubleClick',
        name: "Double Click",
        description: "×2 click power",
        multiplier: new MetaNum(2),
        baseCost: new MetaNum(10),
        cost: new MetaNum(10),
        owned: new MetaNum(0),
        type: 'click'
      },
      fastPacing: {
        id: 'fastPacing',
        name: "Fast Pacing",
        description: "×1.5 passive multiplier",
        multiplier: new MetaNum(1.5),
        baseCost: new MetaNum(100),
        cost: new MetaNum(100),
        owned: new MetaNum(0),
        type: 'passive'
      },
      exponentialGrowth: {
        id: 'exponentialGrowth',
        name: "Exponential Growth",
        description: "×1.2 passive multiplier",
        multiplier: new MetaNum(1.2),
        baseCost: new MetaNum(1000),
        cost: new MetaNum(1000),
        owned: new MetaNum(0),
        type: 'passive'
      }
    };
  }

  initializeBuildings() {
    // Buildings that generate passive multipliers
    this.buildings = {
      worker: {
        id: 'worker',
        name: "Worker",
        description: "Multiplies currency ×1.01 per second",
        multiplierPerSecond: new MetaNum(1.01),
        baseCost: new MetaNum(5),
        cost: new MetaNum(5),
        owned: new MetaNum(0)
      },
      factory: {
        id: 'factory',
        name: "Factory",
        description: "Multiplies currency ×1.05 per second",
        multiplierPerSecond: new MetaNum(1.05),
        baseCost: new MetaNum(500),
        cost: new MetaNum(500),
        owned: new MetaNum(0)
      },
      megaFactory: {
        id: 'megaFactory',
        name: "Mega Factory",
        description: "Multiplies currency ×1.10 per second",
        multiplierPerSecond: new MetaNum(1.10),
        baseCost: new MetaNum(50000),
        cost: new MetaNum(50000),
        owned: new MetaNum(0)
      }
    };
  }

  initializeChallenges() {
    // More challenge examples including goals
    this.challenges = {
      none: {
        id: 'none',
        name: 'No Challenge',
        description: 'Play normally',
        unlocked: true,
        modifiers: {},
        goals: []
      },
      noUpgrades: {
        id: 'noUpgrades',
        name: 'No Upgrades',
        description: 'Upgrades are locked but passive income is ×5',
        unlocked: true,
        modifiers: {
          disableUpgrades: true,
          passiveMultiplierBonus: new MetaNum(5)
        },
        goals: [
          { id: 'reach_1k', description: 'Reach 1,000 currency', type: 'currency', target: new MetaNum(1000), claimed: false }
        ]
      },
      noBuildings: {
        id: 'noBuildings',
        name: 'No Buildings',
        description: 'Buildings disabled; clicks ×10',
        unlocked: true,
        modifiers: { disableBuildings: true, clickMultiplierBonus: new MetaNum(10) },
        goals: [
          { id: 'reach_10k', description: 'Reach 10,000 currency', type: 'currency', target: new MetaNum(10000), claimed: false }
        ]
      },
      challengeMarathon: {
        id: 'challengeMarathon',
        name: 'Marathon',
        description: 'Slower passive (×0.5) but larger goals',
        unlocked: true,
        modifiers: { passiveMultiplierBonus: new MetaNum(0.5) },
        goals: [
          { id: 'reach_100k', description: 'Reach 100,000 currency', type: 'currency', target: new MetaNum(100000), claimed: false }
        ]
      }
    };
    this.activeChallenge = 'none';
  }

  // Click handler - multiplies currency by click power
  click() {
    let clickPower = this.clickMultiplier.clone();
    // Apply challenge click bonus
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.clickMultiplierBonus) {
      clickPower = clickPower.mul(this.challenges[this.activeChallenge].modifiers.clickMultiplierBonus);
    }
    this.currency = this.currency.mul(clickPower);
  }

  // Helper: approximate natural log for a MetaNum by parsing its string form
  approxLn(meta) {
    try {
      let s = (meta instanceof MetaNum) ? meta.toString() : String(meta);
      s = s.trim();
      if (s.toLowerCase().includes('e')) {
        // format like 1.23e+45 or 1e45
        const parts = s.split(/e/i);
        const mant = parseFloat(parts[0]) || 1;
        const exp = parseInt(parts[1]) || 0;
        return Math.log(mant) + exp * Math.LN10;
      } else {
        const v = parseFloat(s);
        return Math.log(v);
      }
    } catch (e) {
      // fallback
      return Math.log(1);
    }
  }

  // Compute maximum affordable purchases for multiplicative/division payment
  // Solves: currency >= baseCost^n * rate^{n(n-1)/2}
  // Returns a plain integer (Number)
  maxAffordableCount(currency, baseCost, rate) {
    // Quick rejects
    if (!currency.gte(baseCost)) return 0;

    // Convert rate to float (it should be small, like 1.15 or 2)
    const rFloat = (rate instanceof MetaNum) ? parseFloat(rate.toString()) : parseFloat(String(rate));
    if (!isFinite(rFloat) || rFloat <= 0) return 0;

    const lnCurrency = this.approxLn(currency);
    const lnBase = this.approxLn(baseCost);
    const lnR = Math.log(rFloat);

    if (Math.abs(lnR) < 1e-12) {
      // rate == 1 => currency >= baseCost^n  => n <= ln(currency)/ln(baseCost)
      const n = Math.floor(lnCurrency / lnBase);
      return Math.max(0, n);
    }

    // Solve quadratic: (lnR/2) n^2 + (lnBase - lnR/2) n - lnCurrency <= 0
    const A = lnR / 2;
    const B = lnBase - (lnR / 2);
    const C = -lnCurrency;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return 0;
    const sqrtDisc = Math.sqrt(disc);
    let n = Math.floor((-B + sqrtDisc) / (2 * A));
    if (!Number.isFinite(n) || n < 0) n = 0;

    // Adjust using exact MetaNum arithmetic
    const checkAffordable = (count) => {
      if (count <= 0) return true;
      const expPart = (count * (count - 1)) / 2;
      const totalDiv = MetaNum.pow(baseCost, new MetaNum(count)).mul(MetaNum.pow(new MetaNum(rFloat), new MetaNum(expPart)));
      return currency.gte(totalDiv);
    };

    while (n > 0 && !checkAffordable(n)) n--;
    while (checkAffordable(n + 1)) n++;

    return n;
  }

  // Autobuyer runner invoked periodically from tick
  runAutobuyersIfNeeded() {
    const now = Date.now();
    // Upgrades autobuyer
    if (this.autobuyers.upgrades.enabled && now - this._lastAutobuyerRun >= this.autobuyers.upgrades.intervalMs) {
      // Try to buy max for each upgrade (skip if disabled by challenge)
      for (let key in this.upgrades) {
        if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableUpgrades) break;
        this.buyUpgrade(key, 'max');
      }
    }
    // Buildings autobuyer
    if (this.autobuyers.buildings.enabled && now - this._lastAutobuyerRun >= this.autobuyers.buildings.intervalMs) {
      for (let key in this.buildings) {
        if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableBuildings) break;
        this.buyBuilding(key, 'max');
      }
    }
    // Update last run time to now to avoid repeated runs
    if (now - this._lastAutobuyerRun >= Math.min(this.autobuyers.upgrades.intervalMs, this.autobuyers.buildings.intervalMs)) {
      this._lastAutobuyerRun = now;
    }
  }

  // Main game tick - applies passive multipliers
  tick() {
    // Apply all building multipliers for this tick (tickRate is ms, we operate per-second multipliers)
    for (let buildingKey in this.buildings) {
      const building = this.buildings[buildingKey];
      if (building.owned.gt(new MetaNum(0))) {
        try {
          const multiplierThisTick = MetaNum.pow(building.multiplierPerSecond, building.owned);
          this.currency = this.currency.mul(multiplierThisTick.pow(new MetaNum(this.tickRate).div(1000)));
        } catch (e) {
          for (let i = new MetaNum(0); i.lt(building.owned); i = i.add(1)) {
            this.currency = this.currency.mul(building.multiplierPerSecond.pow(new MetaNum(this.tickRate).div(1000)));
          }
        }
      }
    }

    // Apply passive upgrades multiplier
    let passiveTotal = this.passiveMultiplier.clone();
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.passiveMultiplierBonus) {
      passiveTotal = passiveTotal.mul(this.challenges[this.activeChallenge].modifiers.passiveMultiplierBonus);
    }
    this.currency = this.currency.mul(passiveTotal.pow(new MetaNum(this.tickRate).div(1000)));

    // Run autobuyers if needed (uses MetaNum-aware buy functions)
    this.runAutobuyersIfNeeded();

    // Check challenge goals progress each tick
    this.checkChallengeGoals();
  }

  // Buy an upgrade
  // amount: number | MetaNum | 'max'
  buyUpgrade(upgradeName, amount = 1) {
    const upgrade = this.upgrades[upgradeName];
    if (!upgrade) return false;
    // If challenge disables upgrades
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableUpgrades) return false;

    const baseCost = upgrade.baseCost;
    const rate = 2; // cost doubles each purchase

    if (amount === 'max') {
      const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
      if (maxCount <= 0) return false;
      // Apply batch purchase
      const multPow = MetaNum.pow(upgrade.multiplier, new MetaNum(maxCount));
      if (upgrade.type === 'click') {
        this.clickMultiplier = this.clickMultiplier.mul(multPow);
      } else if (upgrade.type === 'passive') {
        this.passiveMultiplier = this.passiveMultiplier.mul(multPow);
      }
      upgrade.owned = upgrade.owned.add(new MetaNum(maxCount));
      const expPart = (maxCount * (maxCount - 1)) / 2;
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(maxCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      this.currency = this.currency.div(totalDivisor);
      // Update cost
      upgrade.cost = MetaNum.pow(new MetaNum(rate), upgrade.owned).mul(baseCost);
      return true;
    }

    // numeric amount
    let toBuy = (amount instanceof MetaNum) ? parseInt(amount.toString()) : parseInt(String(amount));
    if (isNaN(toBuy) || toBuy <= 0) return false;
    const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
    if (maxCount <= 0) return false;
    const buyCount = Math.min(toBuy, maxCount);

    const multPow = MetaNum.pow(upgrade.multiplier, new MetaNum(buyCount));
    if (upgrade.type === 'click') {
      this.clickMultiplier = this.clickMultiplier.mul(multPow);
    } else if (upgrade.type === 'passive') {
      this.passiveMultiplier = this.passiveMultiplier.mul(multPow);
    }
    upgrade.owned = upgrade.owned.add(new MetaNum(buyCount));
    const expPart = (buyCount * (buyCount - 1)) / 2;
    const totalDivisor = MetaNum.pow(baseCost, new MetaNum(buyCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
    this.currency = this.currency.div(totalDivisor);
    upgrade.cost = MetaNum.pow(new MetaNum(rate), upgrade.owned).mul(baseCost);
    return true;
  }

  // Buy a building
  // amount: number | MetaNum | 'max'
  buyBuilding(buildingKey, amount = 1) {
    const building = this.buildings[buildingKey];
    if (!building) return false;
    // If challenge disables buildings
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableBuildings) return false;

    const baseCost = building.baseCost;
    const rate = 1.15;

    if (amount === 'max') {
      const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
      if (maxCount <= 0) return false;
      building.owned = building.owned.add(new MetaNum(maxCount));
      const expPart = (maxCount * (maxCount - 1)) / 2;
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(maxCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      this.currency = this.currency.div(totalDivisor);
      building.cost = MetaNum.pow(new MetaNum(rate), building.owned).mul(baseCost);
      return true;
    }

    let toBuy = (amount instanceof MetaNum) ? parseInt(amount.toString()) : parseInt(String(amount));
    if (isNaN(toBuy) || toBuy <= 0) return false;
    const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
    if (maxCount <= 0) return false;
    const buyCount = Math.min(toBuy, maxCount);

    building.owned = building.owned.add(new MetaNum(buyCount));
    const expPart = (buyCount * (buyCount - 1)) / 2;
    const totalDivisor = MetaNum.pow(baseCost, new MetaNum(buyCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
    this.currency = this.currency.div(totalDivisor);
    building.cost = MetaNum.pow(new MetaNum(rate), building.owned).mul(baseCost);
    return true;
  }

  // Toggle an autobuyer
  toggleAutobuyer(which) {
    if (!this.autobuyers[which]) return false;
    this.autobuyers[which].enabled = !this.autobuyers[which].enabled;
    this._lastAutobuyerRun = Date.now();
    return this.autobuyers[which].enabled;
  }

  // Max-all upgrades (attempt to buy as many upgrades as affordable)
  maxAllUpgrades() {
    for (let key in this.upgrades) {
      // Skip if disabled by challenge
      if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableUpgrades) continue;
      this.buyUpgrade(key, 'max');
    }
  }

  // Start the game loop
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.gameLoop = setInterval(() => {
      this.tick();
    }, this.tickRate);
  }

  // Stop the game loop
  stop() {
    this.isRunning = false;
    clearInterval(this.gameLoop);
  }

  // Save / Load / Export / Import
  save() {
    try {
      const save = {
        currency: this.currency.toString(),
        clickMultiplier: this.clickMultiplier.toString(),
        passiveMultiplier: this.passiveMultiplier.toString(),
        tickRate: this.tickRate,
        upgrades: {},
        buildings: {},
        activeChallenge: this.activeChallenge,
        challenges: {},
        autobuyers: {
          upgrades: { enabled: !!this.autobuyers.upgrades.enabled, intervalMs: this.autobuyers.upgrades.intervalMs },
          buildings: { enabled: !!this.autobuyers.buildings.enabled, intervalMs: this.autobuyers.buildings.intervalMs }
        }
      };
      for (let k in this.upgrades) {
        const u = this.upgrades[k];
        save.upgrades[k] = {
          id: u.id,
          owned: u.owned.toString(),
          cost: u.cost.toString(),
          baseCost: u.baseCost.toString(),
          multiplier: u.multiplier.toString()
        };
      }
      for (let k in this.buildings) {
        const b = this.buildings[k];
        save.buildings[k] = {
          id: b.id,
          owned: b.owned.toString(),
          cost: b.cost.toString(),
          baseCost: b.baseCost.toString(),
          multiplierPerSecond: b.multiplierPerSecond.toString()
        };
      }
      for (let k in this.challenges) {
        const ch = this.challenges[k];
        save.challenges[k] = {
          id: ch.id,
          goals: (ch.goals || []).map(g => ({ id: g.id, claimed: !!g.claimed }))
        };
      }
      localStorage.setItem('beaf_save_v1', JSON.stringify(save));
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem('beaf_save_v1');
      if (!raw) return false;
      const save = JSON.parse(raw);
      this.currency = new MetaNum(save.currency);
      this.clickMultiplier = new MetaNum(save.clickMultiplier || 1);
      this.passiveMultiplier = new MetaNum(save.passiveMultiplier || 1);
      this.tickRate = save.tickRate || this.tickRate;
      this.activeChallenge = save.activeChallenge || this.activeChallenge;

      if (save.autobuyers) {
        this.autobuyers.upgrades.enabled = !!(save.autobuyers.upgrades && save.autobuyers.upgrades.enabled);
        this.autobuyers.upgrades.intervalMs = (save.autobuyers.upgrades && save.autobuyers.upgrades.intervalMs) || this.autobuyers.upgrades.intervalMs;
        this.autobuyers.buildings.enabled = !!(save.autobuyers.buildings && save.autobuyers.buildings.enabled);
        this.autobuyers.buildings.intervalMs = (save.autobuyers.buildings && save.autobuyers.buildings.intervalMs) || this.autobuyers.buildings.intervalMs;
      }

      for (let k in save.upgrades) {
        if (this.upgrades[k]) {
          const su = save.upgrades[k];
          this.upgrades[k].owned = new MetaNum(su.owned);
          this.upgrades[k].cost = new MetaNum(su.cost);
          this.upgrades[k].multiplier = new MetaNum(su.multiplier);
          this.upgrades[k].baseCost = new MetaNum(su.baseCost || su.cost);
        }
      }
      for (let k in save.buildings) {
        if (this.buildings[k]) {
          const sb = save.buildings[k];
          this.buildings[k].owned = new MetaNum(sb.owned);
          this.buildings[k].cost = new MetaNum(sb.cost);
          this.buildings[k].multiplierPerSecond = new MetaNum(sb.multiplierPerSecond);
          this.buildings[k].baseCost = new MetaNum(sb.baseCost || sb.cost);
        }
      }
      if (save.challenges) {
        for (let k in save.challenges) {
          const sc = save.challenges[k];
          if (this.challenges[k] && this.challenges[k].goals) {
            for (let g of this.challenges[k].goals) {
              const found = (sc.goals || []).find(x => x.id === g.id);
              if (found) g.claimed = !!found.claimed;
            }
          }
        }
      }
      return true;
    } catch (e) {
      console.error('Load failed', e);
      return false;
    }
  }

  exportSave() {
    const raw = localStorage.getItem('beaf_save_v1') || JSON.stringify({});
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(raw).then(() => {
        return true;
      }, () => {
        // ignore
      });
    }
    return raw;
  }

  importSave(text) {
    try {
      const parsed = JSON.parse(text);
      localStorage.setItem('beaf_save_v1', JSON.stringify(parsed));
      this.load();
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }

  hardReset() {
    if (!confirm('Are you sure? This will delete your save and reset progress.')) return false;
    localStorage.removeItem('beaf_save_v1');
    // Reload page to reinitialize
    setTimeout(() => location.reload(), 50);
    return true;
  }

  // Challenge handling
  startChallenge(id) {
    if (!this.challenges[id]) return false;
    this.activeChallenge = id;
    // Reset run progress (simple reset)
    this.currency = new MetaNum(1);
    for (let k in this.upgrades) {
      this.upgrades[k].owned = new MetaNum(0);
      this.upgrades[k].cost = this.upgrades[k].baseCost.clone();
    }
    for (let k in this.buildings) {
      this.buildings[k].owned = new MetaNum(0);
      this.buildings[k].cost = this.buildings[k].baseCost.clone();
    }
    // Reset claimed flags for challenge goals
    if (this.challenges[id].goals) {
      for (let g of this.challenges[id].goals) g.claimed = false;
    }
    // Apply challenge passive bonus if present
    if (this.challenges[id].modifiers && this.challenges[id].modifiers.passiveMultiplierBonus) {
      this.passiveMultiplier = this.passiveMultiplier.mul(this.challenges[id].modifiers.passiveMultiplierBonus);
    }
    return true;
  }

  endChallenge() {
    this.activeChallenge = 'none';
    return true;
  }

  // Check challenge goals progress and mark completed when reached
  checkChallengeGoals() {
    if (!this.activeChallenge) return;
    const ch = this.challenges[this.activeChallenge];
    if (!ch || !ch.goals) return;
    for (let goal of ch.goals) {
      if (goal.claimed) continue;
      if (goal.type === 'currency') {
        if (this.currency.gte(goal.target)) {
          // mark as completed (but not auto-claimed)
          goal.completed = true;
        }
      }
      // other goal types could be added here
    }
  }

  claimChallengeGoal(challengeId, goalId) {
    const ch = this.challenges[challengeId];
    if (!ch || !ch.goals) return false;
    const goal = ch.goals.find(g => g.id === goalId);
    if (!goal || goal.claimed) return false;
    if (!goal.completed) return false;
    // Apply a simple reward: double currency
    this.currency = this.currency.mul(new MetaNum(2));
    goal.claimed = true;
    return true;
  }

  // Get formatted currency display
  getCurrencyDisplay() {
    return this.currency.toString();
  }

  // Get game state for UI
  getState() {
    return {
      currency: this.currency.toString(),
      clickMultiplier: this.clickMultiplier.toString(),
      passiveMultiplier: this.passiveMultiplier.toString(),
      upgrades: Object.entries(this.upgrades).reduce((acc, [key, upgrade]) => {
        acc[key] = Object.assign({}, upgrade, {
          cost: upgrade.cost.toString(),
          baseCost: upgrade.baseCost.toString(),
          multiplier: upgrade.multiplier.toString(),
          owned: upgrade.owned.toString()
        });
        return acc;
      }, {}),
      buildings: Object.entries(this.buildings).reduce((acc, [key, building]) => {
        acc[key] = Object.assign({}, building, {
          cost: building.cost.toString(),
          baseCost: building.baseCost.toString(),
          multiplierPerSecond: building.multiplierPerSecond.toString(),
          owned: building.owned.toString()
        });
        return acc;
      }, {}),
      challenges: this.challenges,
      activeChallenge: this.activeChallenge,
      autobuyers: this.autobuyers
    };
  }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}
