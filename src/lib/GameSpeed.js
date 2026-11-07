/**
 * @class Centralized battle speed modifiers.
 *
 * This component only accelerates battle simulation:
 * - Route battles: x1 / x2 / x4 / x10
 * - Gym battles: x1 / x2 / x4 / x10
 * - Dungeon battles: x1 / x2 / x4 / x10
 *   (movement and dungeon timer remain at normal speed)
 * - Battle Frontier: x1 / x2 / x4 / x10 / x100
 */
class AutomationGameSpeed {
  static Settings = {
    Routes: "GameSpeed-Routes",
    Gyms: "GameSpeed-Gyms",
    DungeonBattles: "GameSpeed-DungeonBattles",
    BattleFrontier: "GameSpeed-BattleFrontier",
  };

  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      Automation.Utils.LocalStorage.setDefaultValue(this.Settings.Routes, "1");

      Automation.Utils.LocalStorage.setDefaultValue(this.Settings.Gyms, "1");

      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.DungeonBattles,
        "1",
      );

      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.BattleFrontier,
        "1",
      );

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

    /*
     * Small padding so the controls fit nicely
     * inside the narrow automation sidebar.
     */
    panelContainer.style.paddingTop = "4px";
    panelContainer.style.paddingBottom = "4px";

    this.__internal__addSpeedSelector(
      "Routes",
      this.Settings.Routes,
      [1, 2, 4, 10],
      "Accelerates route battles only.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Gyms",
      this.Settings.Gyms,
      [1, 2, 4, 10],
      "Accelerates gym battles and the gym timer together.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Dungeon",
      this.Settings.DungeonBattles,
      [1, 2, 4, 10],
      "Accelerates dungeon battles only. Dungeon movement and exploration stay at normal speed.",
      panelContainer,
    );

    this.__internal__addSpeedSelector(
      "Frontier",
      this.Settings.BattleFrontier,
      [1, 2, 4, 10, 100],
      "Accelerates Battle Frontier combat and its stage timer together.",
      panelContainer,
    );
  }

  /**
   * @brief Adds one compact speed selector row.
   */
  static __internal__addSpeedSelector(
    label,
    setting,
    multipliers,
    tooltip,
    containingDiv,
  ) {
    const container = document.createElement("div");

    /*
     * Fixed 2-column layout:
     *
     * Label       [ x10 ]
     *
     * Prevents wrapping even inside the narrow sidebar.
     */
    container.style.display = "grid";
    container.style.gridTemplateColumns = "1fr 64px";
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

    /*
     * Remove the default margins that were causing
     * the ugly alignment in the previous version.
     */
    select.style.width = "64px";
    select.style.minWidth = "64px";
    select.style.maxWidth = "64px";

    select.style.margin = "0";
    select.style.paddingTop = "2px";
    select.style.paddingBottom = "2px";

    select.style.height = "30px";
    select.style.fontSize = "12px";

    select.style.justifySelf = "end";

    for (const multiplier of multipliers) {
      const option = document.createElement("option");

      option.value = multiplier.toString();

      option.textContent = `x${multiplier}`;

      select.appendChild(option);
    }

    select.value = this.__internal__getMultiplier(
      setting,
      multipliers,
    ).toString();

    select.addEventListener("change", function () {
      let multiplier = parseInt(select.value, 10);

      if (!multipliers.includes(multiplier)) {
        multiplier = 1;
        select.value = "1";
      }

      Automation.Utils.LocalStorage.setValue(setting, multiplier.toString());

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
  static __internal__getMultiplier(setting, allowedMultipliers) {
    const multiplier = parseInt(
      Automation.Utils.LocalStorage.getValue(setting),
      10,
    );

    return allowedMultipliers.includes(multiplier) ? multiplier : 1;
  }

  static __internal__getRouteMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Routes, [1, 2, 4, 10]);
  }

  static __internal__getGymMultiplier() {
    return this.__internal__getMultiplier(this.Settings.Gyms, [1, 2, 4, 10]);
  }

  static __internal__getDungeonBattleMultiplier() {
    return this.__internal__getMultiplier(
      this.Settings.DungeonBattles,
      [1, 2, 4, 10],
    );
  }

  static __internal__getBattleFrontierMultiplier() {
    return this.__internal__getMultiplier(
      this.Settings.BattleFrontier,
      [1, 2, 4, 10, 100],
    );
  }

  /**
   * @brief Resets the virtual clock used by the accelerated Battle Frontier.
   */
  static __internal__resetBattleFrontierVirtualClock() {
    this.__internal__battleFrontierVirtualTime = 0;

    this.__internal__battleFrontierLastVirtualPokemonAttack = -Infinity;
  }

  /**
   * @brief Replaces Battle Frontier's real-time attack limiter
   *        with a virtual-time limiter while speed is above x1.
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

      if (multiplier === 1) {
        return AutomationGameSpeed.__internal__originalBattleFrontierPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Same alternate-attack rule as vanilla
       * Battle Frontier.
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
       * Vanilla BF limits Pokémon attacks
       * to one every 450 ms.
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

      const result = AutomationGameSpeed.__internal__originalGameTick.apply(
        this,
        args,
      );

      switch (stateBeforeTick) {
        /*
         * =================================================
         * Routes
         * =================================================
         */
        case GameConstants.GameState.fighting: {
          const multiplier =
            AutomationGameSpeed.__internal__getRouteMultiplier();

          for (let i = 1; i < multiplier; i++) {
            if (this.gameState !== GameConstants.GameState.fighting) {
              break;
            }

            AutomationGameSpeed.__internal__runRouteBattleTick();
          }

          break;
        }

        /*
         * =================================================
         * Gyms
         * =================================================
         */
        case GameConstants.GameState.gym: {
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

          break;
        }

        /*
         * =================================================
         * Dungeon battles
         * =================================================
         */
        case GameConstants.GameState.dungeon: {
          const multiplier =
            AutomationGameSpeed.__internal__getDungeonBattleMultiplier();

          /*
           * ONLY combat is accelerated.
           *
           * DungeonRunner.tick() is intentionally
           * not called here.
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

          break;
        }

        /*
         * =================================================
         * Battle Frontier
         * =================================================
         */
        case GameConstants.GameState.battleFrontier: {
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

          break;
        }
      }

      return result;
    };
  }

  /**
   * @brief Runs one extra route-battle-only tick.
   */
  static __internal__runRouteBattleTick() {
    Battle.counter += GameConstants.TICK_TIME;

    if (Battle.counter >= GameConstants.BATTLE_TICK) {
      Battle.tick();
    }
  }

  /**
   * @brief Runs one extra complete gym tick.
   *
   * Combat and gym timer are accelerated together.
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
   * Dungeon movement and dungeon timer
   * remain at normal speed.
   */
  static __internal__runDungeonBattleTick() {
    DungeonBattle.counter += GameConstants.TICK_TIME;

    if (DungeonBattle.counter >= GameConstants.BATTLE_TICK) {
      DungeonBattle.tick();
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
