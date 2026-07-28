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
    this.tickRate = 1000; // milliseconds per tick (1 second)
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
        cost: new MetaNum(10),
        owned: new MetaNum(0),
        type: 'click'
      },
      fastPacing: {
        id: 'fastPacing',
        name: "Fast Pacing",
        description: "×1.5 passive multiplier",
        multiplier: new MetaNum(1.5),
        cost: new MetaNum(100),
        owned: new MetaNum(0),
        type: 'passive'
      },
      exponentialGrowth: {
        id: 'exponentialGrowth',
        name: "Exponential Growth",
        description: "×1.2 passive multiplier",
        multiplier: new MetaNum(1.2),
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
        cost: new MetaNum(5),
        owned: new MetaNum(0)
      },
      factory: {
        id: 'factory',
        name: "Factory",
        description: "Multiplies currency ×1.05 per second",
        multiplierPerSecond: new MetaNum(1.05),
        cost: new MetaNum(500),
        owned: new MetaNum(0)
      },
      megaFactory: {
        id: 'megaFactory',
        name: "Mega Factory",
        description: "Multiplies currency ×1.10 per second",
        multiplierPerSecond: new MetaNum(1.10),
        cost: new MetaNum(50000),
        owned: new MetaNum(0)
      }
    };
  }

  initializeChallenges() {
    // Basic challenge examples
    this.challenges = {
      none: {
        id: 'none',
        name: 'No Challenge',
        description: 'Play normally',
        unlocked: true,
        modifiers: {}
      },
      noUpgrades: {
        id: 'noUpgrades',
        name: 'No Upgrades',
        description: 'Upgrades are locked but passive income is ×5',
        unlocked: true,
        modifiers: {
          disableUpgrades: true,
          passiveMultiplierBonus: new MetaNum(5)
        }
      }
    };
    this.activeChallenge = 'none';
  }
  
  // Click handler - multiplies currency by click power
  click() {
    this.currency = this.currency.mul(this.clickMultiplier);
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
          this.currency = this.currency.mul(multiplierThisTick);
        } catch (e) {
          // Fallback: apply multiplier per owned iteratively
          for (let i = 0; i < building.owned.toNumber(); i++) {
            this.currency = this.currency.mul(building.multiplierPerSecond);
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
    this.currency = this.currency.mul(passiveTotal);
  }
  
  // Buy an upgrade
  buyUpgrade(upgradeName, amount = 1) {
    const upgrade = this.upgrades[upgradeName];
    if (!upgrade) return false;
    // If challenge disables upgrades
    if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableUpgrades) return false;

    // amount is number or MetaNum
    let toBuy = (amount instanceof MetaNum) ? amount : new MetaNum(amount);
    // For simplicity we will buy one-by-one if amount is > 1 (safe but might be slower)
    while (toBuy.gt(new MetaNum(0))) {
      if (this.currency.gte(upgrade.cost)) {
        this.currency = this.currency.sub(upgrade.cost);
        upgrade.owned = upgrade.owned.add(new MetaNum(1));
        
        // Update the appropriate multiplier
        if (upgrade.type === 'click') {
          this.clickMultiplier = this.clickMultiplier.mul(upgrade.multiplier);
        } else if (upgrade.type === 'passive') {
          this.passiveMultiplier = this.passiveMultiplier.mul(upgrade.multiplier);
        }
        
        // Increase cost for next purchase (×2 per upgrade)
        upgrade.cost = upgrade.cost.mul(new MetaNum(2));
      } else {
        return false; // can't afford further
      }
      toBuy = toBuy.sub(new MetaNum(1));
    }
    return true;
  }
  
  // Buy a building
  buyBuilding(buildingKey, amount = 1) {
    const building = this.buildings[buildingKey];
    if (!building) return false;
    let toBuy = (amount instanceof MetaNum) ? amount : new MetaNum(amount);
    while (toBuy.gt(new MetaNum(0))) {
      if (this.currency.gte(building.cost)) {
        this.currency = this.currency.sub(building.cost);
        building.owned = building.owned.add(new MetaNum(1));
        
        // Increase cost for next building (×1.15 per building)
        building.cost = building.cost.mul(new MetaNum(1.15));
      } else {
        return false;
      }
      toBuy = toBuy.sub(new MetaNum(1));
    }
    return true;
  }
  
  // Max-all upgrades (attempt to buy as many upgrades as affordable)
  maxAllUpgrades() {
    // For each upgrade, repeatedly buy while affordable. This is simple and reliable.
    for (let key in this.upgrades) {
      const upg = this.upgrades[key];
      // Skip if disabled by challenge
      if (this.activeChallenge && this.challenges[this.activeChallenge] && this.challenges[this.activeChallenge].modifiers && this.challenges[this.activeChallenge].modifiers.disableUpgrades) continue;
      // Safety cap to avoid infinite loops
      let iterations = 0;
      while (this.currency.gte(upg.cost) && iterations < 1000000) {
        this.buyUpgrade(key, 1);
        iterations++;
      }
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
        activeChallenge: this.activeChallenge
      };
      for (let k in this.upgrades) {
        const u = this.upgrades[k];
        save.upgrades[k] = {
          id: u.id,
          owned: u.owned.toString(),
          cost: u.cost.toString(),
          multiplier: u.multiplier.toString()
        };
      }
      for (let k in this.buildings) {
        const b = this.buildings[k];
        save.buildings[k] = {
          id: b.id,
          owned: b.owned.toString(),
          cost: b.cost.toString(),
          multiplierPerSecond: b.multiplierPerSecond.toString()
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
      for (let k in save.upgrades) {
        if (this.upgrades[k]) {
          const su = save.upgrades[k];
          this.upgrades[k].owned = new MetaNum(su.owned);
          this.upgrades[k].cost = new MetaNum(su.cost);
          this.upgrades[k].multiplier = new MetaNum(su.multiplier);
        }
      }
      for (let k in save.buildings) {
        if (this.buildings[k]) {
          const sb = save.buildings[k];
          this.buildings[k].owned = new MetaNum(sb.owned);
          this.buildings[k].cost = new MetaNum(sb.cost);
          this.buildings[k].multiplierPerSecond = new MetaNum(sb.multiplierPerSecond);
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
      // reset cost to initial values (could be expanded to store baseCost)
      // For now re-initialize upgrades/buildings to defaults and then reapply owned overrides
    }
    for (let k in this.buildings) {
      this.buildings[k].owned = new MetaNum(0);
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
          multiplier: upgrade.multiplier.toString(),
          owned: upgrade.owned.toString()
        });
        return acc;
      }, {}),
      buildings: Object.entries(this.buildings).reduce((acc, [key, building]) => {
        acc[key] = Object.assign({}, building, {
          cost: building.cost.toString(),
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
