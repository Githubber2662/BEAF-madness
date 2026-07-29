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
    // Basic challenge examples including goals
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
        // Example goals: reach currency X while challenge active
        goals: [
          {
            id: 'reach_1k',
            description: 'Reach 1,000 currency in this run',
            type: 'currency',
            target: new MetaNum(1000),
            claimed: false
          }
        ]
      }
    };
    this.activeChallenge = 'none';
  }
  
  // Click handler - multiplies currency by click power
  click() {
    this.currency = this.currency.mul(this.clickMultiplier);
  }
  // Compute maximum affordable purchases for multiplicative/division payment
  // Solves: currency >= baseCost^n * rate^{n(n-1)/2}
  maxAffordableCount(currency, baseCost, rate) {
    // Quick rejects
    if (!currency.gte(baseCost)) return new MetaNum(0):
    // Handle rate == 1 separately
    const lnCurrency = currency.ln();
    const lnBase = baseCost.ln();
    const lnR = rate.ln();

    if (lnR.abs.lt(1e-12)) {
      // rate == 1 => currency >= baseCost^n  => n <= ln(currency)/ln(baseCost)
      const n = MetaNum.floor(MetaNum.div(lnCurrency, lnBase))
      return MetaNum.max(0, n);
    }

    const n = MetaNum.floor((MetaNum.pow((MetaNum.add(lnBase.mul(2), lnR)).pow(2).add(lnCurrency.mul(lnR.mul(8))), 0.5).sub(MetaNum.add(lnBase.mul(2), lnR)).div(lnR.mul(2)));
    return MetaNum.max(0, n);
  }

  // Main game tick - applies passive multipliers
  tick() {
    // Apply all building multipliers for this tick (tickRate is ms, we operate per-second multipliers)
    for (let buildingKey in this.buildings) {
      const building = this.buildings[buildingKey];
      if (building.owned.gt(new MetaNum(0))) {
        // Apply multiplier once per second per building owned (tickRate is 1000ms)
        // multiplierThisTick = multiplierPerSecond ^ owned
        try {
          const multiplierThisTick = MetaNum.pow(building.multiplierPerSecond, building.owned);
          this.currency = this.currency.mul(multiplierThisTick.pow(new MetaNum(Game.tickRate).div(1000)));
        } catch (e) {
          // Fallback: apply multiplier per owned iteratively
          for (let i = new MetaNum(0); i.lt(building.owned); i = i.add(1)) {
            this.currency = this.currency.mul(building.multiplierPerSecond.pow(new MetaNum(Game.tickRate).div(1000)));
          }
        }
      }
    }
    
    // Apply passive upgrades multiplier
    let passiveTotal = this.passiveMultiplier.clone();
    // Challenge modifier may give bonus
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.passiveMultiplierBonus) {
      passiveTotal = passiveTotal.mul(this.challenges[this.activeChallenge].modifiers.passiveMultiplierBonus);
    }
    this.currency = this.currency.mul(passiveTotal.pow(Game.tickRate.div(1000)));

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

    if (amount === 'max') {
      // Compute how many we can buy
      const baseCost = upgrade.baseCost;
      const rate = new MetaNum(2);
      const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
      if (maxCount.lte(0)) return false;
      // Apply batch purchase
      // Multiply multiplier^maxCount
      const multPow = MetaNum.pow(upgrade.multiplier, maxCount);
      if (upgrade.type === 'click') {
        this.clickMultiplier = this.clickMultiplier.mul(multPow);
      } else if (upgrade.type === 'passive') {
        this.passiveMultiplier = this.passiveMultiplier.mul(multPow);
      }
      // Update owned
      upgrade.owned = upgrade.owned.add(maxCount);
      // Compute total divisor (product of costs)
      const expPart = MetaNum.div(MetaNum.mul(maxCount, maxCount.add(1)), 2);
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(maxCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      // Divide currency
      this.currency = this.currency.div(totalDivisor).max(1);
      // Update current cost = baseCost * rate^{owned}
      upgrade.cost = MetaNum.pow(new MetaNum(rate), upgrade.owned).mul(baseCost);
      return true;
    }

    // amount is number or MetaNum
    let toBuy = (amount instanceof MetaNum) ? amount : new MetaNum(amount);
    const maxCount = this.maxAffordableCount(this.currency, upgrade.baseCost, 2);
    if(maxCount.lte(0)) return false;
    let finalAmount = MetaNum.min(toBuy, maxCount);
      const multPow = MetaNum.pow(upgrade.multiplier, finalAmount);
      if (upgrade.type === 'click') {
        this.clickMultiplier = this.clickMultiplier.mul(multPow);
      } else if (upgrade.type === 'passive') {
        this.passiveMultiplier = this.passiveMultiplier.mul(multPow);
      }
      // Update owned
      upgrade.owned = upgrade.owned.add(finalAmount);
      // Compute total divisor (product of costs)
      const expPart = MetaNum.div(MetaNum.mul(finalAmount, finalAmount.add(1)), 2);
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(finalAmount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      // Divide currency
      this.currency = this.currency.div(totalDivisor).max(1);
      // Update current cost = baseCost * rate^{owned}
      upgrade.cost = MetaNum.pow(new MetaNum(rate), upgrade.owned).mul(baseCost);
      return true;
  }
  
  // Buy a building
  // amount: number | MetaNum | 'max'
  buyBuilding(buildingKey, amount = 1) {
    const building = this.buildings[buildingKey];
    if (!building) return false;
    if (amount === 'max') {
      const baseCost = building.baseCost;
      const rate = new MetaNum(1.15);
      const maxCount = this.maxAffordableCount(this.currency, baseCost, rate);
      if (maxCount.lte(0)) return false;
      // Apply batch purchase
      building.owned = building.owned.add(maxCount);
      const expPart = MetaNum.div(MetaNum.mul(maxCount, maxCount.add(1)), 2);
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(maxCount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      this.currency = this.currency.div(totalDivisor).max(1);
      // Update current cost = baseCost * rate^{owned}
      building.cost = MetaNum.pow(new MetaNum(rate), building.owned).mul(baseCost);
      return true;
    }

    let toBuy = (amount instanceof MetaNum) ? amount : new MetaNum(amount);
    const maxCount = this.maxAffordableCount(this.currency, upgrade.baseCost, 1.15);
    if(maxCount.lte(0)) return false;
    let finalAmount = MetaNum.min(toBuy, maxCount);
      const multPow = MetaNum.pow(upgrade.multiplier, finalAmount);
      if (upgrade.type === 'click') {
        this.clickMultiplier = this.clickMultiplier.mul(multPow);
      } else if (upgrade.type === 'passive') {
        this.passiveMultiplier = this.passiveMultiplier.mul(multPow);
      }
      // Update owned
      upgrade.owned = upgrade.owned.add(finalAmount);
      // Compute total divisor (product of costs)
      const expPart = MetaNum.div(MetaNum.mul(finalAmount, finalAmount.add(1)), 2);
      const totalDivisor = MetaNum.pow(baseCost, new MetaNum(finalAmount)).mul(MetaNum.pow(new MetaNum(rate), new MetaNum(expPart)));
      // Divide currency
      this.currency = this.currency.div(totalDivisor).max(1);
      // Update current cost = baseCost * rate^{owned}
      upgrade.cost = MetaNum.pow(new MetaNum(rate), upgrade.owned).mul(baseCost);
      return true;
  }
  
  // Max-all upgrades (attempt to buy as many upgrades as affordable)
  maxAllUpgrades() {
    // For each upgrade, compute max and buy in batch
    for (let key in this.upgrades) {
      const upg = this.upgrades[key];
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
        challenges: {}
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
      // Save challenge claimed flags
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
      if (!raw || raw === null || raw === undefined) return false;
      const save = JSON.parse(raw);
      this.currency = new MetaNum(save.currency);
      this.clickMultiplier = new MetaNum(save.clickMultiplier || 1);
      this.passiveMultiplier = new MetaNum(save.passiveMultiplier || 1);
      this.tickRate = save.tickRate || this.tickRate;
      this.activeChallenge = save.activeChallenge || this.activeChallenge;
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
      // restore challenge claimed flags
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
    // Apply a simple reward: give a one-time currency bonus equal to target (could be changed)
    try {
      this.currency = this.currency.mul(new MetaNum(2));
    } catch (e) {
      this.currency = this.currency.add(goal.target || new MetaNum(0));
    }
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
      activeChallenge: this.activeChallenge
    };
  }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}
