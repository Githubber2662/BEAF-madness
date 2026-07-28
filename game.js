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
    this.tickRate = 1; // milliseconds per tick
    this.isRunning = true;
    
    this.initializeUpgrades();
    this.initializeBuildings();
  }
  
  initializeUpgrades() {
    // Upgrades that increase multipliers
    this.upgrades = {
      doubleClick: {
        name: "Double Click",
        description: "×2 click power",
        multiplier: new MetaNum(2),
        cost: new MetaNum(10),
        owned: new MetaNum(0),
        type: 'click'
      },
      fastPacing: {
        name: "Fast Pacing",
        description: "×1.5 passive multiplier",
        multiplier: new MetaNum(1.5),
        cost: new MetaNum(100),
        owned: new MetaNum(0),
        type: 'passive'
      },
      exponentialGrowth: {
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
        name: "Worker",
        description: "Multiplies currency ×1.01 per second",
        multiplierPerSecond: new MetaNum(1.01),
        cost: new MetaNum(5),
        owned: new MetaNum(0)
      },
      factory: {
        name: "Factory",
        description: "Multiplies currency ×1.05 per second",
        multiplierPerSecond: new MetaNum(1.05),
        cost: new MetaNum(500),
        owned: new MetaNum(0)
      },
      megaFactory: {
        name: "Mega Factory",
        description: "Multiplies currency ×1.10 per second",
        multiplierPerSecond: new MetaNum(1.10),
        cost: new MetaNum(50000),
        owned: new MetaNum(0)
      }
    };
  }
  
  // Click handler - multiplies currency by click power
  click() {
    this.currency = this.currency.mul(this.clickMultiplier);
  }
  
  // Main game tick - applies passive multipliers
  tick() {
    // Apply all building multipliers for this tick
    // Buildings apply their multiplier over the tick duration
    for (let buildingKey in this.buildings) {
      const building = this.buildings[buildingKey];
      if (building.owned.gt(0)) {
        // Apply multiplier once per building owned
        const multiplierThisTick = MetaNum.pow(building.multiplierPerSecond, MetaNum.mul(building.owned, Metanum.div(Game.tickRate, 1000)); // Spread effect
        this.currency = this.currency.mul(multiplierThisTick);
      }
    }
    
    // Apply passive upgrades multiplier
    this.currency = this.currency.mul(this.passiveMultiplier);
  }
  
  // Buy an upgrade
  buyUpgrade(upgradeName) {
    const upgrade = this.upgrades[upgradeName];
    if (!upgrade) return false;
    
    if (this.currency.gte(upgrade.cost)) {
      this.currency = this.currency.div(upgrade.cost);
      upgrade.owned = upgrade.owned.add(1);
      
      // Update the appropriate multiplier
      if (upgrade.type === 'click') {
        this.clickMultiplier = this.clickMultiplier.mul(upgrade.multiplier);
      } else if (upgrade.type === 'passive') {
        this.passiveMultiplier = this.passiveMultiplier.mul(upgrade.multiplier);
      }
      
      // Increase cost for next purchase (×2 per upgrade)
      upgrade.cost = upgrade.cost.mul(new MetaNum(2));
      return true;
    }
    return false;
  }
  
  // Buy a building
  buyBuilding(buildingKey) {
    const building = this.buildings[buildingKey];
    if (!building) return false;
    
    if (this.currency.gte(building.cost)) {
      this.currency = this.currency.div(building.cost);
      building.owned = building.owned.add(1);
      
      // Increase cost for next building (×1.15 per building)
      building.cost = building.cost.mul(new MetaNum(1.15));
      return true;
    }
    return false;
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
        acc[key] = {
          ...upgrade,
          cost: upgrade.cost.toString(),
          multiplier: upgrade.multiplier.toString()
        };
        return acc;
      }, {}),
      buildings: Object.entries(this.buildings).reduce((acc, [key, building]) => {
        acc[key] = {
          ...building,
          cost: building.cost.toString(),
          multiplierPerSecond: building.multiplierPerSecond.toString()
        };
        return acc;
      }, {})
    };
  }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}
