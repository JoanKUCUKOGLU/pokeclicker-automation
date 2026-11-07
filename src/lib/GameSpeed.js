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
 * - Safari (movement + Safari battle animations/delays)
 * - Farm
 */
class AutomationGameSpeed {
  static Settings = {
    Routes: "GameSpeed-Routes",
    Gyms: "GameSpeed-Gyms",
    DungeonBattles: "GameSpeed-DungeonBattles",
    TemporaryBattles: "GameSpeed-TemporaryBattles",
    BattleFrontier: "GameSpeed-BattleFrontier",
    Safari: "GameSpeed-Safari",
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

    this.__internal__initializeSafariSpeed();
    this.__internal__patchSafariAutomationLoop();
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

  static __internal__safariBaseMoveSpeed = null;

  static __internal__safariBaseBattleSpeeds = null;

  static __internal__safariAutomationPatched = false;

  static __internal__originalSafariAutomationToggle = null;

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
      "Safari",
      this.Settings.Safari,
      "Accelerates Safari movement and Safari battle animations/delays. Safari Level speed bonuses still apply.",
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
       * Battle Frontier uses
       * a virtual attack clock.
       */
      if (setting === AutomationGameSpeed.Settings.BattleFrontier) {
        AutomationGameSpeed.__internal__resetBattleFrontierVirtualClock();

        if (typeof BattleFrontierBattle !== "undefined") {
          BattleFrontierBattle.lastPokemonAttack = 0;
        }
      }

      /*
       * Safari uses direct animation
       * and movement delay modification.
       */
      if (setting === AutomationGameSpeed.Settings.Safari) {
        AutomationGameSpeed.__internal__applySafariSpeed();
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

  static __internal__getSafariMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Safari);
  }

  static __internal__getFarmMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Farm);
  }

  /*********************************************************************\
    |***                         Safari                                ***|
    \*********************************************************************/

  /**
   * @brief Caches the vanilla Safari timings
   *        and applies the selected speed.
   */
  static __internal__initializeSafariSpeed() {
    if (
      typeof Safari === "undefined" ||
      typeof SafariBattle === "undefined" ||
      !SafariBattle.Speed
    ) {
      return;
    }

    if (this.__internal__safariBaseMoveSpeed === null) {
      this.__internal__safariBaseMoveSpeed = Safari.moveSpeed;
    }

    if (this.__internal__safariBaseBattleSpeeds === null) {
      this.__internal__safariBaseBattleSpeeds = {
        ...SafariBattle.Speed,
      };
    }

    this.__internal__applySafariSpeed();
  }

  /**
   * @brief Returns a Safari delay divided
   *        by the selected multiplier.
   *
   * 5 ms minimum keeps x100 stable and
   * prevents 0 ms animation/state races.
   */
  static __internal__getSafariDelay(baseDelay) {
    const multiplier = this.__internal__getSafariMultiplier();

    if (multiplier === 1) {
      return baseDelay;
    }

    return Math.max(5, baseDelay / multiplier);
  }

  /**
   * @brief Applies Safari movement
   *        and battle speed.
   */
  static __internal__applySafariSpeed() {
    if (
      typeof Safari === "undefined" ||
      typeof SafariBattle === "undefined" ||
      !SafariBattle.Speed
    ) {
      return;
    }

    if (this.__internal__safariBaseMoveSpeed === null) {
      this.__internal__safariBaseMoveSpeed = Safari.moveSpeed;
    }

    if (this.__internal__safariBaseBattleSpeeds === null) {
      this.__internal__safariBaseBattleSpeeds = {
        ...SafariBattle.Speed,
      };
    }

    /*
     * Player movement.
     */
    Safari.moveSpeed = this.__internal__getSafariDelay(
      this.__internal__safariBaseMoveSpeed,
    );

    /*
     * Ball throw, bait, rocks,
     * capture animation, flee,
     * turn delays, etc.
     */
    for (const [name, baseDelay] of Object.entries(
      this.__internal__safariBaseBattleSpeeds,
    )) {
      SafariBattle.Speed[name] = this.__internal__getSafariDelay(baseDelay);
    }

    /*
     * Our Auto Safari normally checks
     * what to do every 50 ms.
     *
     * Retiming it prevents the automation
     * itself from becoming the bottleneck.
     */
    this.__internal__restartSafariAutomationLoop();
  }

  /**
   * @brief Patches our Auto Safari toggle
   *        so newly-started Safari loops
   *        automatically use the chosen speed.
   */
  static __internal__patchSafariAutomationLoop() {
    if (this.__internal__safariAutomationPatched) {
      return;
    }

    let safariAutomation = null;

    if (typeof Automation !== "undefined" && Automation.Safari) {
      safariAutomation = Automation.Safari;
    } else if (typeof AutomationSafari !== "undefined") {
      safariAutomation = AutomationSafari;
    }

    if (
      !safariAutomation ||
      typeof safariAutomation.__internal__toggleSafariAutomation !== "function"
    ) {
      return;
    }

    this.__internal__safariAutomationPatched = true;

    this.__internal__originalSafariAutomationToggle =
      safariAutomation.__internal__toggleSafariAutomation;

    safariAutomation.__internal__toggleSafariAutomation = function (...args) {
      const result =
        AutomationGameSpeed.__internal__originalSafariAutomationToggle.apply(
          this,
          args,
        );

      AutomationGameSpeed.__internal__restartSafariAutomationLoop();

      return result;
    };
  }

  /**
   * @brief Returns the interval used
   *        by our Auto Safari automation.
   *
   * Normal:
   * x1   = 50 ms
   * x2   = 25 ms
   * x4   = 12.5 ms
   * x10  = 5 ms
   * x100 = 5 ms minimum
   */
  static __internal__getSafariAutomationInterval() {
    const multiplier = this.__internal__getSafariMultiplier();

    return Math.max(5, 50 / multiplier);
  }

  /**
   * @brief Restarts the existing Auto Safari
   *        loop at the selected speed.
   *
   * Does nothing when Auto Safari is disabled.
   */
  static __internal__restartSafariAutomationLoop() {
    let safariAutomation = null;

    if (typeof Automation !== "undefined" && Automation.Safari) {
      safariAutomation = Automation.Safari;
    } else if (typeof AutomationSafari !== "undefined") {
      safariAutomation = AutomationSafari;
    }

    if (
      !safariAutomation ||
      safariAutomation.__internal__autoSafariLoop === null ||
      typeof safariAutomation.__internal__safariAutomationLoop !== "function"
    ) {
      return;
    }

    clearInterval(safariAutomation.__internal__autoSafariLoop);

    safariAutomation.__internal__autoSafariLoop = setInterval(
      safariAutomation.__internal__safariAutomationLoop.bind(safariAutomation),
      this.__internal__getSafariAutomationInterval(),
    );
  }

  /*********************************************************************\
    |***                    Battle Frontier                            ***|
    \*********************************************************************/

  /**
   * @brief Resets the virtual clock used
   *        by the accelerated Battle Frontier.
   */
  static __internal__resetBattleFrontierVirtualClock() {
    this.__internal__battleFrontierVirtualTime = 0;

    this.__internal__battleFrontierLastVirtualPokemonAttack = -Infinity;
  }

  /**
   * @brief Replaces Battle Frontier's
   *        real-time attack limiter with
   *        a virtual-time limiter while
   *        speed is above x1.
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
       * x1 = vanilla.
       */
      if (multiplier === 1) {
        return AutomationGameSpeed.__internal__originalBattleFrontierPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Preserve native alternate attack
       * behavior above highest stage.
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
       * Vanilla BF Pokémon attack
       * cooldown ≈ 450 ms.
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

  /*********************************************************************\
    |***                       Game Tick                               ***|
    \*********************************************************************/

  /**
   * @brief Patches the game's main tick once.
   *
   * The original game tick still runs once.
   * Extra updates only affect selected systems.
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
       * Always execute the normal
       * Pokéclicker game tick once.
       */
      const result = AutomationGameSpeed.__internal__originalGameTick.apply(
        this,
        args,
      );

      /*
       * =====================================================
       * Routes
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
         * Combat only:
         * no DungeonRunner extra tick.
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
       * Farm
       * =====================================================
       *
       * Native gameTick already runs
       * farming.update() once.
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
   * Dungeon movement and timer stay x1.
   */
  static __internal__runDungeonBattleTick() {
    DungeonBattle.counter += GameConstants.TICK_TIME;

    if (DungeonBattle.counter >= GameConstants.BATTLE_TICK) {
      DungeonBattle.tick();
    }
  }

  /**
   * @brief Runs one extra complete
   *        Temporary Battle tick.
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
   * @brief Runs one extra complete
   *        Battle Frontier tick.
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
