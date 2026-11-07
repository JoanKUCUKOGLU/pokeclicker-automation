/**
 * @class Centralized game speed modifiers.
 *
 * Available speeds for every category:
 * x1 / x2 / x4 / x10 / x100
 *
 * - Route battles
 * - Gym battles
 * - Dungeon battles (combat only; movement/timer stay x1)
 * - Temporary Battles
 * - Battle Frontier
 * - Underground
 * - Farm
 */
class AutomationGameSpeed {
  static Settings = {
    Routes: "GameSpeed-Routes",
    Gyms: "GameSpeed-Gyms",
    DungeonBattles: "GameSpeed-DungeonBattles",
    TemporaryBattles: "GameSpeed-TemporaryBattles",
    BattleFrontier: "GameSpeed-BattleFrontier",
    Underground: "GameSpeed-Underground",
    Farm: "GameSpeed-Farm",
  };

  static Multipliers = [1, 2, 4, 10, 100];

  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      for (const setting of Object.values(this.Settings)) {
        Automation.Utils.LocalStorage.setDefaultValue(setting, "1");
      }

      this.__internal__buildMenu();
      return;
    }

    this.__internal__patchBattleFrontierAttack();
    this.__internal__patchGameTick();
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__patchedGameTick = false;

  static __internal__patchedBattleFrontierAttack = false;

  static __internal__originalGameTick = null;

  static __internal__originalBattleFrontierPokemonAttack = null;

  static __internal__battleFrontierVirtualTime = 0;

  static __internal__battleFrontierLastVirtualPokemonAttack = -Infinity;

  static __internal__battleFrontierWasAccelerated = false;

  /**
   * @brief Builds the centralized Game Speed panel.
   */
  static __internal__buildMenu() {
    const title = '<span style="font-weight:600;">⚡ Game Speed ⚡</span>';

    const panelContainer = Automation.Menu.addCategory(
      "gameSpeedButtons",
      title,
    );

    panelContainer.style.paddingTop = "4px";

    panelContainer.style.paddingBottom = "4px";

    this.__internal__addSpeedSelector(
      "Routes",
      this.Settings.Routes,
      "Accelerates route battles.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Gyms",
      this.Settings.Gyms,
      "Accelerates gym combat and the gym timer together.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Dungeon",
      this.Settings.DungeonBattles,
      "Accelerates dungeon battles only. Dungeon movement and exploration timer remain at normal speed.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Temporary",
      this.Settings.TemporaryBattles,
      "Accelerates all Temporary Battles. Combat and battle timer are accelerated together.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Frontier",
      this.Settings.BattleFrontier,
      "Accelerates Battle Frontier combat and its stage timer together.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Underground",
      this.Settings.Underground,
      "Accelerates native Underground time: mine discovery, helpers, tool recovery and battery.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Farm",
      this.Settings.Farm,
      "Accelerates native Farm time: berry growth, mutations, wanderers, farm hands and mulch timers.",
      panelContainer,
    );
  }

  /**
   * @brief Adds one compact speed selector row.
   */
  static __internal__addSpeedSelector(label, setting, tooltip, containingDiv) {
    const container = document.createElement("div");

    container.style.display = "grid";

    container.style.gridTemplateColumns = "1fr 68px";

    container.style.alignItems = "center";

    container.style.columnGap = "6px";

    container.style.paddingLeft = "8px";

    container.style.paddingRight = "8px";

    container.style.paddingTop = "3px";

    container.style.paddingBottom = "3px";

    container.style.width = "100%";

    container.style.boxSizing = "border-box";

    const labelElem = document.createElement("span");

    labelElem.innerText = label;

    labelElem.style.fontSize = "12px";

    labelElem.style.whiteSpace = "nowrap";

    labelElem.style.overflow = "hidden";

    labelElem.style.textOverflow = "ellipsis";

    labelElem.style.textAlign = "left";

    labelElem.classList.add("hasAutomationTooltip");

    labelElem.setAttribute("automation-tooltip-text", tooltip);

    container.appendChild(labelElem);

    const select = Automation.Menu.createDropDownListElement(
      `${setting}-Select`,
    );

    select.style.width = "68px";

    select.style.minWidth = "68px";

    select.style.maxWidth = "68px";

    select.style.margin = "0";

    select.style.paddingTop = "2px";

    select.style.paddingBottom = "2px";

    select.style.height = "30px";

    select.style.fontSize = "12px";

    select.style.justifySelf = "end";

    for (const multiplier of this.Multipliers) {
      const option = document.createElement("option");

      option.value = multiplier.toString();

      option.textContent = `x${multiplier}`;

      select.appendChild(option);
    }

    select.value = this.__internal__getMultiplier(setting).toString();

    select.addEventListener("change", function () {
      let multiplier = parseInt(select.value, 10);

      if (!AutomationGameSpeed.Multipliers.includes(multiplier)) {
        multiplier = 1;
        select.value = "1";
      }

      Automation.Utils.LocalStorage.setValue(setting, multiplier.toString());

      /*
       * Battle Frontier uses its own
       * virtual attack clock.
       */
      if (setting === AutomationGameSpeed.Settings.BattleFrontier) {
        AutomationGameSpeed.__internal__resetBattleFrontierVirtualClock();

        if (typeof BattleFrontierBattle !== "undefined") {
          BattleFrontierBattle.lastPokemonAttack = 0;
        }
      }
    });

    container.appendChild(select);

    containingDiv.appendChild(container);
  }

  /**
   * @brief Reads and validates a multiplier.
   */
  static __internal__getMultiplier(setting) {
    const multiplier = parseInt(
      Automation.Utils.LocalStorage.getValue(setting),
      10,
    );

    return this.Multipliers.includes(multiplier) ? multiplier : 1;
  }

  static __internal__getRouteMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Routes);
  }

  static __internal__getGymMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Gyms);
  }

  static __internal__getDungeonBattleMultiplier() {
    return this.__internal__getMultiplier(this.Settings.DungeonBattles);
  }

  static __internal__getTemporaryBattleMultiplier() {
    return this.__internal__getMultiplier(this.Settings.TemporaryBattles);
  }

  static __internal__getBattleFrontierMultiplier() {
    return this.__internal__getMultiplier(this.Settings.BattleFrontier);
  }

  static __internal__getUndergroundMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Underground);
  }

  static __internal__getFarmMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Farm);
  }

  /**
   * @brief Resets the virtual clock used by
   *        the accelerated Battle Frontier.
   */
  static __internal__resetBattleFrontierVirtualClock() {
    this.__internal__battleFrontierVirtualTime = 0;

    this.__internal__battleFrontierLastVirtualPokemonAttack = -Infinity;
  }

  /**
   * @brief Replaces Battle Frontier's real-time
   *        attack limiter with a virtual-time limiter
   *        while speed is above x1.
   */
  static __internal__patchBattleFrontierAttack() {
    if (this.__internal__patchedBattleFrontierAttack) {
      return;
    }

    if (
      typeof BattleFrontierBattle === "undefined" ||
      typeof BattleFrontierRunner === "undefined"
    ) {
      return;
    }

    this.__internal__patchedBattleFrontierAttack = true;

    this.__internal__originalBattleFrontierPokemonAttack =
      BattleFrontierBattle.pokemonAttack;

    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationGameSpeed.__internal__getBattleFrontierMultiplier();

      /*
       * x1 = completely normal Pokéclicker.
       */
      if (multiplier === 1) {
        return AutomationGameSpeed.__internal__originalBattleFrontierPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Preserve vanilla alternate-attack behavior
       * above the player's highest completed stage.
       */
      this.alternateAttack = !this.alternateAttack;

      if (
        this.alternateAttack &&
        BattleFrontierRunner.stage() >
          App.game.statistics.battleFrontierHighestStageCompleted()
      ) {
        return;
      }

      const now = AutomationGameSpeed.__internal__battleFrontierVirtualTime;

      /*
       * Vanilla BF attack cooldown:
       * approximately 450 ms.
       */
      if (
        AutomationGameSpeed.__internal__battleFrontierLastVirtualPokemonAttack >
        now - 450
      ) {
        return;
      }

      AutomationGameSpeed.__internal__battleFrontierLastVirtualPokemonAttack =
        now;

      const enemy = this.enemyPokemon();

      if (!enemy || !enemy.isAlive()) {
        return;
      }

      enemy.damage(
        App.game.party.calculatePokemonAttack(
          enemy.type1,
          enemy.type2,
          true,
          GameConstants.Region.none,
          false,
          false,
          WeatherType.Clear,
        ),
      );

      if (!enemy.isAlive()) {
        this.defeatPokemon();
      }
    };
  }

  /**
   * @brief Patches the game's main tick once.
   *
   * The original game tick still runs exactly once.
   * Additional updates are executed only for
   * the selected systems.
   */
  static __internal__patchGameTick() {
    if (this.__internal__patchedGameTick) {
      return;
    }

    if (typeof App === "undefined" || !App.game) {
      return;
    }

    this.__internal__patchedGameTick = true;

    this.__internal__originalGameTick = App.game.gameTick;

    App.game.gameTick = function (...args) {
      const stateBeforeTick = this.gameState;

      const battleFrontierMultiplier =
        AutomationGameSpeed.__internal__getBattleFrontierMultiplier();

      const acceleratingBattleFrontier =
        stateBeforeTick === GameConstants.GameState.battleFrontier &&
        BattleFrontierRunner.started() &&
        battleFrontierMultiplier > 1;

      /*
       * Battle Frontier virtual clock.
       */
      if (acceleratingBattleFrontier) {
        if (!AutomationGameSpeed.__internal__battleFrontierWasAccelerated) {
          AutomationGameSpeed.__internal__resetBattleFrontierVirtualClock();

          AutomationGameSpeed.__internal__battleFrontierWasAccelerated = true;
        }

        AutomationGameSpeed.__internal__battleFrontierVirtualTime +=
          GameConstants.TICK_TIME;
      } else if (AutomationGameSpeed.__internal__battleFrontierWasAccelerated) {
        AutomationGameSpeed.__internal__resetBattleFrontierVirtualClock();

        AutomationGameSpeed.__internal__battleFrontierWasAccelerated = false;
      }

      /*
       * Always execute Pokéclicker's
       * normal game tick once.
       */
      const result = AutomationGameSpeed.__internal__originalGameTick.apply(
        this,
        args,
      );

      /*
       * =====================================================
       * Route Battles
       * =====================================================
       */
      if (stateBeforeTick === GameConstants.GameState.fighting) {
        const multiplier = AutomationGameSpeed.__internal__getRouteMultiplier();

        for (let i = 1; i < multiplier; i++) {
          if (this.gameState !== GameConstants.GameState.fighting) {
            break;
          }

          AutomationGameSpeed.__internal__runRouteBattleTick();
        }
      }

      /*
       * =====================================================
       * Gyms
       * =====================================================
       */
      if (stateBeforeTick === GameConstants.GameState.gym) {
        const multiplier = AutomationGameSpeed.__internal__getGymMultiplier();

        for (let i = 1; i < multiplier; i++) {
          if (
            this.gameState !== GameConstants.GameState.gym ||
            !GymRunner.running()
          ) {
            break;
          }

          AutomationGameSpeed.__internal__runGymTick();
        }
      }

      /*
       * =====================================================
       * Dungeon Battles
       * =====================================================
       */
      if (stateBeforeTick === GameConstants.GameState.dungeon) {
        const multiplier =
          AutomationGameSpeed.__internal__getDungeonBattleMultiplier();

        /*
         * Dungeon combat only.
         *
         * Movement and dungeon exploration
         * timer stay at x1.
         */
        for (let i = 1; i < multiplier; i++) {
          if (
            this.gameState !== GameConstants.GameState.dungeon ||
            !DungeonRunner.fighting()
          ) {
            break;
          }

          AutomationGameSpeed.__internal__runDungeonBattleTick();
        }
      }

      /*
       * =====================================================
       * Temporary Battles
       * =====================================================
       */
      if (stateBeforeTick === GameConstants.GameState.temporaryBattle) {
        const multiplier =
          AutomationGameSpeed.__internal__getTemporaryBattleMultiplier();

        for (let i = 1; i < multiplier; i++) {
          if (this.gameState !== GameConstants.GameState.temporaryBattle) {
            break;
          }

          AutomationGameSpeed.__internal__runTemporaryBattleTick();
        }
      }

      /*
       * =====================================================
       * Battle Frontier
       * =====================================================
       */
      if (stateBeforeTick === GameConstants.GameState.battleFrontier) {
        for (let i = 1; i < battleFrontierMultiplier; i++) {
          if (
            this.gameState !== GameConstants.GameState.battleFrontier ||
            !BattleFrontierRunner.started()
          ) {
            break;
          }

          AutomationGameSpeed.__internal__battleFrontierVirtualTime +=
            GameConstants.TICK_TIME;

          AutomationGameSpeed.__internal__runBattleFrontierTick();
        }
      }

      /*
       * =====================================================
       * Underground
       * =====================================================
       *
       * The original game tick already executes
       * underground.update() once.
       *
       * Extra calls accelerate:
       *
       * - Mine discovery
       * - Helpers
       * - Tool recovery
       * - Battery
       */
      const undergroundMultiplier =
        AutomationGameSpeed.__internal__getUndergroundMultiplier();

      if (undergroundMultiplier > 1 && this.underground.canAccess()) {
        const delta = GameConstants.TICK_TIME / GameConstants.SECOND;

        for (let i = 1; i < undergroundMultiplier; i++) {
          this.underground.update(delta);
        }
      }

      /*
       * =====================================================
       * Farm
       * =====================================================
       *
       * The original game tick already executes
       * farming.update() once.
       *
       * Extra updates accelerate:
       *
       * - Berry growth
       * - Withering
       * - Mutations
       * - Wanderers
       * - Farm Hands
       * - Mulch timers
       */
      const farmMultiplier =
        AutomationGameSpeed.__internal__getFarmMultiplier();

      if (farmMultiplier > 1) {
        const delta = GameConstants.TICK_TIME / GameConstants.SECOND;

        for (let i = 1; i < farmMultiplier; i++) {
          this.farming.update(delta);
        }
      }

      return result;
    };
  }

  /**
   * @brief Runs one extra route battle tick.
   */
  static __internal__runRouteBattleTick() {
    Battle.counter += GameConstants.TICK_TIME;

    if (Battle.counter >= GameConstants.BATTLE_TICK) {
      Battle.tick();
    }
  }

  /**
   * @brief Runs one extra complete gym tick.
   */
  static __internal__runGymTick() {
    GymBattle.counter += GameConstants.TICK_TIME;

    if (GymBattle.counter >= GameConstants.BATTLE_TICK) {
      GymBattle.tick();
    }

    if (
      App.game.gameState === GameConstants.GameState.gym &&
      GymRunner.running()
    ) {
      GymRunner.tick();
    }
  }

  /**
   * @brief Runs one extra dungeon combat tick.
   *
   * Movement and dungeon timer stay at x1.
   */
  static __internal__runDungeonBattleTick() {
    DungeonBattle.counter += GameConstants.TICK_TIME;

    if (DungeonBattle.counter >= GameConstants.BATTLE_TICK) {
      DungeonBattle.tick();
    }
  }

  /**
   * @brief Runs one extra complete Temporary Battle tick.
   */
  static __internal__runTemporaryBattleTick() {
    TemporaryBattleBattle.counter += GameConstants.TICK_TIME;

    if (TemporaryBattleBattle.counter >= GameConstants.BATTLE_TICK) {
      TemporaryBattleBattle.tick();
    }

    if (App.game.gameState === GameConstants.GameState.temporaryBattle) {
      TemporaryBattleRunner.tick();
    }
  }

  /**
   * @brief Runs one extra complete Battle Frontier tick.
   */
  static __internal__runBattleFrontierTick() {
    BattleFrontierBattle.counter += GameConstants.TICK_TIME;

    if (BattleFrontierBattle.counter >= GameConstants.BATTLE_FRONTIER_TICK) {
      BattleFrontierBattle.tick();
    }

    if (
      App.game.gameState === GameConstants.GameState.battleFrontier &&
      BattleFrontierRunner.started()
    ) {
      BattleFrontierRunner.tick();
    }
  }
}
