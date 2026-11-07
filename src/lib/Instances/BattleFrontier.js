/**
 * @class Battle Frontier speed modifier.
 *
 * This component does NOT automate the Battle Frontier.
 * Starting, stopping, restarting and stage management are left to the game
 * or to another Battle Frontier automation script.
 */
class AutomationBattleFrontier {
  static Settings = {
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
        this.__internal__updateDivVisibility.bind(this),
        200,
      );
    }

    this.__internal__updateDivVisibility();
  }

  /**
   * Kept for compatibility with the other instance components.
   * This module has no automation to stop and must never end the BF itself.
   */
  static ForceStop() {}

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__panel = null;
  static __internal__visibilityLoop = null;
  static __internal__patched = false;

  static __internal__originalGameTick = null;
  static __internal__originalPokemonAttack = null;

  static __internal__virtualTime = 0;
  static __internal__lastVirtualPokemonAttack = -Infinity;
  static __internal__frontierWasRunning = false;

  /**
   * @brief Builds the Battle Frontier speed selector.
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

    this.__internal__panel = panelContainer.parentElement;
    this.__internal__panel.hidden = true;

    const settingContainer = document.createElement("div");
    settingContainer.style.paddingLeft = "10px";
    settingContainer.style.paddingRight = "10px";
    settingContainer.style.paddingBottom = "6px";
    settingContainer.style.display = "flex";
    settingContainer.style.alignItems = "center";
    settingContainer.style.gap = "8px";

    const label = document.createElement("span");
    label.innerText = "Speed :";
    label.classList.add("hasAutomationTooltip");

    label.setAttribute(
      "automation-tooltip-text",
      "Changes only the Battle Frontier simulation speed.\n" +
        "x1 = normal speed\n" +
        "x2 = double speed\n" +
        "x4 = quadruple speed\n" +
        "x10 = ten times speed\n" +
        "x100 = one hundred times speed\n" +
        "This does not start, restart or stop the Battle Frontier.",
    );

    settingContainer.appendChild(label);

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

      const allowedMultipliers = [1, 2, 4, 10, 100];

      if (!allowedMultipliers.includes(multiplier)) {
        speedSelect.value = "1";

        AutomationBattleFrontier.__internal__setSpeedMultiplier(1);

        return;
      }

      AutomationBattleFrontier.__internal__setSpeedMultiplier(multiplier);
    });

    settingContainer.appendChild(speedSelect);
    panelContainer.appendChild(settingContainer);
  }

  /**
   * @brief Returns the selected Battle Frontier speed multiplier.
   */
  static __internal__getSpeedMultiplier() {
    const multiplier = parseInt(
      Automation.Utils.LocalStorage.getValue(this.Settings.SpeedMultiplier),
      10,
    );

    return [1, 2, 4, 10, 100].includes(multiplier) ? multiplier : 1;
  }

  /**
   * @brief Stores a new speed multiplier and resets timing state.
   */
  static __internal__setSpeedMultiplier(multiplier) {
    Automation.Utils.LocalStorage.setValue(
      this.Settings.SpeedMultiplier,
      multiplier.toString(),
    );

    this.__internal__resetVirtualClock();

    /*
     * Make returning to x1 immediate as well.
     */
    if (typeof BattleFrontierBattle !== "undefined") {
      BattleFrontierBattle.lastPokemonAttack = 0;
    }
  }

  /**
   * @brief Resets the virtual clock used while BF speed > x1.
   */
  static __internal__resetVirtualClock() {
    this.__internal__virtualTime = 0;

    this.__internal__lastVirtualPokemonAttack = -Infinity;
  }

  /**
   * @brief Patches only Battle Frontier timing.
   *
   * The normal game tick still runs once, so every non-BF system remains x1.
   *
   * Extra virtual ticks reproduce only the native BF section of Game.gameTick:
   *
   * Battle tick -> Runner timer tick.
   */
  static __internal__patchBattleFrontier() {
    if (this.__internal__patched) {
      return;
    }

    if (
      typeof App === "undefined" ||
      !App.game ||
      typeof BattleFrontierBattle === "undefined" ||
      typeof BattleFrontierRunner === "undefined"
    ) {
      return;
    }

    this.__internal__patched = true;

    /*
     * Preserve existing methods.
     *
     * If another script was loaded before this one,
     * its modifications remain part of the stored
     * function.
     */
    this.__internal__originalGameTick = App.game.gameTick;

    this.__internal__originalPokemonAttack = BattleFrontierBattle.pokemonAttack;

    /*
     * =====================================================
     * Battle Frontier Pokémon attack
     * =====================================================
     *
     * Vanilla PokéClicker uses Date.now() and limits
     * Pokémon attacks to one every 450 ms.
     *
     * That does not work for a virtual x100 simulation,
     * because real time is not moving x100 faster.
     *
     * While accelerated, we therefore use our virtual
     * Battle Frontier clock.
     */
    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      /*
       * x1:
       *
       * Use the original PokéClicker function
       * completely unchanged.
       */
      if (multiplier === 1) {
        return AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Preserve PokéClicker's normal mechanic:
       *
       * If we're pushing beyond our highest completed
       * stage, Pokémon attack every second attack tick.
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
       * Native cooldown:
       *
       * 450 ms of Battle Frontier simulated time.
       */
      if (
        AutomationBattleFrontier.__internal__lastVirtualPokemonAttack >
        now - 450
      ) {
        return;
      }

      AutomationBattleFrontier.__internal__lastVirtualPokemonAttack = now;

      if (!this.enemyPokemon()?.isAlive()) {
        return;
      }

      /*
       * Same attack calculation used by the native
       * BattleFrontierBattle.pokemonAttack().
       */
      this.enemyPokemon().damage(
        App.game.party.calculatePokemonAttack(
          this.enemyPokemon().type1,
          this.enemyPokemon().type2,
          true,
          GameConstants.Region.none,
          false,
          false,
          WeatherType.Clear,
        ),
      );

      if (!this.enemyPokemon().isAlive()) {
        /*
         * Keep PokéClicker's native defeat logic:
         *
         * - Gems
         * - Egg progress
         * - Pokémon index
         * - Stage progression
         * - Stage timer reset
         * - Next Pokémon generation
         */
        this.defeatPokemon();
      }
    };

    /*
     * =====================================================
     * Battle Frontier simulation speed
     * =====================================================
     *
     * We wrap the game's main tick.
     *
     * The normal game tick is always executed once,
     * so everything outside Battle Frontier stays x1.
     *
     * Then we simulate additional BF-only ticks.
     */
    App.game.gameTick = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      const frontierRunning =
        this.gameState === GameConstants.GameState.battleFrontier &&
        BattleFrontierRunner.started();

      /*
       * No Battle Frontier running or x1:
       *
       * Completely normal game.
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
       * New accelerated BF session.
       */
      if (!AutomationBattleFrontier.__internal__frontierWasRunning) {
        AutomationBattleFrontier.__internal__resetVirtualClock();

        AutomationBattleFrontier.__internal__frontierWasRunning = true;
      }

      /*
       * The normal game tick represents the first
       * virtual BF tick.
       */
      AutomationBattleFrontier.__internal__virtualTime +=
        GameConstants.TICK_TIME;

      const result =
        AutomationBattleFrontier.__internal__originalGameTick.apply(this, args);

      /*
       * Simulate only the extra Battle Frontier ticks.
       *
       * x2:
       *   1 native + 1 virtual
       *
       * x4:
       *   1 native + 3 virtual
       *
       * x10:
       *   1 native + 9 virtual
       *
       * x100:
       *   1 native + 99 virtual
       */
      for (let i = 1; i < multiplier; i++) {
        /*
         * Another script may have stopped/restarted
         * the Battle Frontier during a tick.
         */
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
   * @brief Runs one extra Battle Frontier-only game tick.
   *
   * This mirrors PokéClicker's native Battle Frontier
   * section inside Game.gameTick().
   *
   * IMPORTANT:
   *
   * Combat and timer are executed together.
   *
   * This means if the combat completes a stage,
   * BattleFrontierRunner.nextStage() resets the timer
   * BEFORE the next virtual timer tick.
   *
   * That's what fixes the old x100 balancing issue.
   */
  static __internal__runVirtualBattleFrontierTick() {
    /*
     * ---------------------------------------------
     * Battle
     * ---------------------------------------------
     */

    BattleFrontierBattle.counter += GameConstants.TICK_TIME;

    if (BattleFrontierBattle.counter >= GameConstants.BATTLE_FRONTIER_TICK) {
      BattleFrontierBattle.tick();
    }

    /*
     * ---------------------------------------------
     * Stage timer
     * ---------------------------------------------
     *
     * Always AFTER the battle tick, exactly like
     * PokéClicker's native Game.gameTick().
     */

    BattleFrontierRunner.tick();
  }

  /**
   * @brief Shows the speed selector only while inside
   *        the Battle Frontier.
   *
   * Leaving the BF does NOT reset the multiplier.
   *
   * Your external automation script can therefore:
   *
   * - leave BF
   * - restart BF
   * - use checkpoints
   * - reset stages
   *
   * and the selected speed will remain active.
   */
  static __internal__updateDivVisibility() {
    if (this.__internal__panel === null) {
      return;
    }

    this.__internal__panel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;
  }
}
