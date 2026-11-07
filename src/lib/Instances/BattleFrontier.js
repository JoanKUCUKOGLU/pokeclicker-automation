/**
 * @class Battle Frontier automation + speed modifier
 *
 * Features:
 * - Automatically restart the Battle Frontier when a run ends
 * - Battle Frontier speed: x1 / x2 / x4 / x10 / x100
 *
 * No max stage, no token farming logic.
 */
class AutomationBattleFrontier {
  static Settings = {
    FeatureEnabled: "BattleFrontier-FightEnabled",
    SpeedMultiplier: "BattleFrontier-SpeedMultiplier",
  };

  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.SpeedMultiplier,
        "1",
      );

      this.__internal__buildMenu();
      return;
    }

    this.__internal__patchBattleFrontier();

    if (this.__internal__visibilityLoop === null) {
      this.__internal__visibilityLoop = setInterval(
        this.__internal__updateDivVisibilityAndContent.bind(this),
        200,
      );
    }

    this.__internal__updateDivVisibilityAndContent();
  }

  /**
   * @brief Forces the Battle Frontier automation to stop.
   */
  static ForceStop() {
    this.__internal__toggleBattleFrontierFight(false);

    if (App.game.gameState == GameConstants.GameState.battleFrontier) {
      BattleFrontierRunner.end();
      App.game.battleFrontier.leave();
    }
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__autoBattleFrontierLoop = null;
  static __internal__autoBattleFrontierPanel = null;
  static __internal__visibilityLoop = null;

  static __internal__patched = false;

  static __internal__originalGameTick = null;
  static __internal__originalPokemonAttack = null;

  static __internal__virtualTime = 0;
  static __internal__lastVirtualPokemonAttack = -Infinity;
  static __internal__frontierWasRunning = false;

  /**
   * @brief Builds the menu.
   */
  static __internal__buildMenu() {
    const title =
      '<img src="assets/images/npcs/Crush Kin.png" height="20px" style="position:relative; bottom: 3px; transform: scaleX(-1);">' +
      "&nbsp;Battle Frontier&nbsp;" +
      '<img src="assets/images/npcs/Crush Kin.png" height="20px" style="position:relative; bottom: 3px;">';

    const panelContainer = Automation.Menu.addCategory(
      "battleFrontierFightButtons",
      title,
    );

    this.__internal__autoBattleFrontierPanel = panelContainer.parentElement;

    this.__internal__autoBattleFrontierPanel.hidden = true;

    /*
     * =====================================================
     * Auto Start
     * =====================================================
     */

    const autoRunTooltip =
      "Automatically starts the Battle Frontier again when a run finishes." +
      Automation.Menu.TooltipSeparator +
      "If a checkpoint exists, it will use the current checkpoint.";

    const autoRunButton = Automation.Menu.addAutomationButton(
      "Auto start",
      this.Settings.FeatureEnabled,
      autoRunTooltip,
      panelContainer,
      true,
    );

    autoRunButton.addEventListener(
      "click",
      this.__internal__toggleBattleFrontierFight.bind(this),
      false,
    );

    /*
     * =====================================================
     * Speed selector
     * =====================================================
     */

    Automation.Menu.addSeparator(panelContainer);

    const speedContainer = document.createElement("div");

    speedContainer.style.paddingLeft = "10px";
    speedContainer.style.paddingRight = "10px";
    speedContainer.style.paddingBottom = "5px";
    speedContainer.style.display = "flex";
    speedContainer.style.alignItems = "center";
    speedContainer.style.gap = "8px";

    const speedLabel = document.createElement("span");

    speedLabel.innerText = "Speed :";

    speedLabel.classList.add("hasAutomationTooltip");

    speedLabel.setAttribute(
      "automation-tooltip-text",
      "Changes only the Battle Frontier simulation speed.\n" +
        "x1 = normal\n" +
        "x2 = double speed\n" +
        "x4 = quadruple speed\n" +
        "x10 = ten times speed\n" +
        "x100 = one hundred times speed",
    );

    speedContainer.appendChild(speedLabel);

    const speedSelect = Automation.Menu.createDropDownListElement(
      "BattleFrontier-SpeedMultiplier-Select",
    );

    speedSelect.style.width = "90px";
    speedSelect.style.marginTop = "0px";

    for (const multiplier of [1, 2, 4, 10, 100]) {
      const option = document.createElement("option");

      option.value = multiplier.toString();

      option.textContent = `x${multiplier}`;

      speedSelect.appendChild(option);
    }

    speedSelect.value = this.__internal__getSpeedMultiplier().toString();

    speedSelect.addEventListener("change", function () {
      const multiplier = parseInt(speedSelect.value, 10);

      if (![1, 2, 4, 10, 100].includes(multiplier)) {
        speedSelect.value = "1";

        AutomationBattleFrontier.__internal__setSpeedMultiplier(1);

        return;
      }

      AutomationBattleFrontier.__internal__setSpeedMultiplier(multiplier);
    });

    speedContainer.appendChild(speedSelect);

    panelContainer.appendChild(speedContainer);
  }

  /*********************************************************************\
    |***                     Auto Start                               ***|
    \*********************************************************************/

  static __internal__toggleBattleFrontierFight(enable) {
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true";
    }

    if (enable) {
      if (this.__internal__autoBattleFrontierLoop === null) {
        this.__internal__autoBattleFrontierLoop = setInterval(
          this.__internal__battleFrontierFightLoop.bind(this),
          500,
        );

        /*
         * Start immediately.
         */
        this.__internal__battleFrontierFightLoop(true);
      }
    } else {
      clearInterval(this.__internal__autoBattleFrontierLoop);

      this.__internal__autoBattleFrontierLoop = null;
    }
  }

  /**
   * @brief Automatically starts a new BF run.
   */
  static __internal__battleFrontierFightLoop(firstRun = false) {
    if (this.__internal__autoBattleFrontierPanel.hidden) {
      return;
    }

    /*
     * If the player manually quit while having
     * a checkpoint, consider it a manual action
     * and disable Auto Start.
     */
    if (
      !BattleFrontierRunner.started() &&
      BattleFrontierRunner.checkpoint() > 1 &&
      !firstRun
    ) {
      Automation.Notifications.sendWarningNotif(
        "User action detected, turning off Auto Start",
        "Battle Frontier",
      );

      Automation.Menu.forceAutomationState(this.Settings.FeatureEnabled, false);

      return;
    }

    /*
     * Already fighting.
     */
    if (BattleFrontierRunner.started()) {
      return;
    }

    /*
     * Start using the available checkpoint.
     */
    BattleFrontierRunner.start(true);
  }

  /*********************************************************************\
    |***                       Speed                                  ***|
    \*********************************************************************/

  static __internal__getSpeedMultiplier() {
    const multiplier = parseInt(
      Automation.Utils.LocalStorage.getValue(this.Settings.SpeedMultiplier),
      10,
    );

    return [1, 2, 4, 10, 100].includes(multiplier) ? multiplier : 1;
  }

  static __internal__setSpeedMultiplier(multiplier) {
    Automation.Utils.LocalStorage.setValue(
      this.Settings.SpeedMultiplier,
      multiplier.toString(),
    );

    this.__internal__resetVirtualClock();

    /*
     * Reset native cooldown so switching back
     * to x1 feels immediate.
     */
    if (typeof BattleFrontierBattle !== "undefined") {
      BattleFrontierBattle.lastPokemonAttack = 0;
    }
  }

  static __internal__resetVirtualClock() {
    this.__internal__virtualTime = 0;

    this.__internal__lastVirtualPokemonAttack = -Infinity;
  }

  /**
   * @brief Installs the Battle Frontier speed system.
   */
  static __internal__patchBattleFrontier() {
    if (this.__internal__patched) {
      return;
    }

    if (
      typeof BattleFrontierBattle === "undefined" ||
      typeof BattleFrontierRunner === "undefined" ||
      typeof App === "undefined" ||
      !App.game
    ) {
      return;
    }

    this.__internal__patched = true;

    this.__internal__originalGameTick = App.game.gameTick;

    this.__internal__originalPokemonAttack = BattleFrontierBattle.pokemonAttack;

    /*
     * =====================================================
     * Pokémon attack
     * =====================================================
     *
     * x1 uses the original Pokéclicker method.
     *
     * Accelerated modes use simulated BF time instead
     * of Date.now(), otherwise x100 would accelerate
     * the stage timer much faster than attacks.
     */

    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      if (multiplier === 1) {
        return AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Native Battle Frontier alternate attack
       * behaviour.
       */
      this.alternateAttack = !this.alternateAttack;

      if (
        this.alternateAttack &&
        BattleFrontierRunner.stage() >
          App.game.statistics.battleFrontierHighestStageCompleted()
      ) {
        return;
      }

      const now = AutomationBattleFrontier.__internal__virtualTime;

      /*
       * Native BF attack cooldown = 450 ms.
       */
      if (
        AutomationBattleFrontier.__internal__lastVirtualPokemonAttack >
        now - 450
      ) {
        return;
      }

      AutomationBattleFrontier.__internal__lastVirtualPokemonAttack = now;

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

    /*
     * =====================================================
     * Game tick
     * =====================================================
     */

    App.game.gameTick = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      const frontierRunning =
        this.gameState === GameConstants.GameState.battleFrontier &&
        BattleFrontierRunner.started();

      /*
       * Normal game behaviour outside BF
       * or when speed = x1.
       */
      if (!frontierRunning || multiplier === 1) {
        if (AutomationBattleFrontier.__internal__frontierWasRunning) {
          AutomationBattleFrontier.__internal__resetVirtualClock();

          AutomationBattleFrontier.__internal__frontierWasRunning = false;
        }

        return AutomationBattleFrontier.__internal__originalGameTick.apply(
          this,
          args,
        );
      }

      /*
       * Beginning of an accelerated BF run.
       */
      if (!AutomationBattleFrontier.__internal__frontierWasRunning) {
        AutomationBattleFrontier.__internal__resetVirtualClock();

        AutomationBattleFrontier.__internal__frontierWasRunning = true;
      }

      /*
       * Native tick.
       */
      AutomationBattleFrontier.__internal__virtualTime +=
        GameConstants.TICK_TIME;

      const result =
        AutomationBattleFrontier.__internal__originalGameTick.apply(this, args);

      /*
       * Additional simulated BF ticks.
       *
       * x2   = 1 native + 1 extra
       * x4   = 1 native + 3 extra
       * x10  = 1 native + 9 extra
       * x100 = 1 native + 99 extra
       */
      for (let i = 1; i < multiplier; i++) {
        if (
          this.gameState !== GameConstants.GameState.battleFrontier ||
          !BattleFrontierRunner.started()
        ) {
          break;
        }

        AutomationBattleFrontier.__internal__virtualTime +=
          GameConstants.TICK_TIME;

        AutomationBattleFrontier.__internal__runVirtualBattleFrontierTick();
      }

      return result;
    };
  }

  /**
   * @brief Runs one BF-only simulated game tick.
   *
   * Battle and timer stay synchronized.
   */
  static __internal__runVirtualBattleFrontierTick() {
    /*
     * Battle.
     */
    BattleFrontierBattle.counter += GameConstants.TICK_TIME;

    if (BattleFrontierBattle.counter >= GameConstants.BATTLE_FRONTIER_TICK) {
      BattleFrontierBattle.tick();
    }

    /*
     * Stage timer.
     */
    BattleFrontierRunner.tick();
  }

  /*********************************************************************\
    |***                       UI                                     ***|
    \*********************************************************************/

  /**
   * @brief Only show the category while inside Battle Frontier.
   */
  static __internal__updateDivVisibilityAndContent() {
    if (this.__internal__autoBattleFrontierPanel === null) {
      return;
    }

    this.__internal__autoBattleFrontierPanel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;

    /*
     * Leaving BF manually disables Auto Start,
     * but DOES NOT reset the chosen speed.
     */
    if (
      this.__internal__autoBattleFrontierPanel.hidden &&
      Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true"
    ) {
      Automation.Menu.forceAutomationState(this.Settings.FeatureEnabled, false);
    }
  }
}
