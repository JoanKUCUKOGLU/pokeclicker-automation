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

  static __internal__originalPokemonAttack = null;
  static __internal__originalRunnerTick = null;

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

        Automation.Utils.LocalStorage.setValue(
          AutomationBattleFrontier.Settings.SpeedMultiplier,
          "1",
        );

        return;
      }

      Automation.Utils.LocalStorage.setValue(
        AutomationBattleFrontier.Settings.SpeedMultiplier,
        multiplier.toString(),
      );

      /*
       * Reset the native attack limiter so the new
       * multiplier takes effect immediately.
       */
      if (typeof BattleFrontierBattle !== "undefined") {
        BattleFrontierBattle.lastPokemonAttack = 0;
      }
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
   * @brief Hooks into the native Battle Frontier attack and timer methods.
   *
   * This does not control runs. It only executes the existing Battle Frontier
   * logic multiple times per native update when a multiplier above x1 is used.
   */
  static __internal__patchBattleFrontier() {
    if (this.__internal__patched) {
      return;
    }

    if (
      typeof BattleFrontierBattle === "undefined" ||
      typeof BattleFrontierRunner === "undefined"
    ) {
      return;
    }

    this.__internal__patched = true;

    /*
     * Preserve the implementation that exists at the time
     * this component initializes.
     */
    this.__internal__originalPokemonAttack = BattleFrontierBattle.pokemonAttack;

    this.__internal__originalRunnerTick = BattleFrontierRunner.tick;

    /*
     * -----------------------------------------------------
     * Battle Frontier attacks
     * -----------------------------------------------------
     */
    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      /*
       * x1:
       * completely normal Pokéclicker behaviour.
       */
      if (multiplier === 1) {
        return AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );
      }

      let result;

      /*
       * Simulate several normal Battle Frontier
       * attack opportunities.
       *
       * We only bypass the native 450 ms limiter.
       *
       * Pokéclicker's normal function still handles:
       *
       * - alternate attacks above your record
       * - damage calculation
       * - Pokémon defeat
       * - egg progress
       * - gems
       * - stage progression
       * - generation of the next enemy
       */
      for (let i = 0; i < multiplier; i++) {
        if (!BattleFrontierRunner.started()) {
          break;
        }

        if (!this.enemyPokemon()?.isAlive()) {
          break;
        }

        /*
         * Pokéclicker normally prevents another
         * attack for 450 ms.
         *
         * Setting this to 0 lets the virtual
         * accelerated attack go through.
         */
        this.lastPokemonAttack = 0;

        result =
          AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
            this,
            args,
          );
      }

      return result;
    };

    /*
     * -----------------------------------------------------
     * Battle Frontier timer
     * -----------------------------------------------------
     */
    BattleFrontierRunner.tick = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      let result;

      /*
       * Run the original BF timer several times.
       *
       * x1   -> 1 tick
       * x2   -> 2 ticks
       * x4   -> 4 ticks
       * x10  -> 10 ticks
       * x100 -> 100 ticks
       *
       * This keeps the timer synchronized with
       * the accelerated combat instead of simply
       * multiplying the player's damage.
       */
      for (let i = 0; i < multiplier; i++) {
        if (!this.started()) {
          break;
        }

        result = AutomationBattleFrontier.__internal__originalRunnerTick.apply(
          this,
          args,
        );
      }

      return result;
    };
  }

  /**
   * @brief Shows the speed selector only while inside
   *        the Battle Frontier.
   *
   * Leaving the BF does NOT reset the selected multiplier.
   *
   * If another script starts a Battle Frontier run later,
   * the selected speed will automatically apply again.
   */
  static __internal__updateDivVisibility() {
    if (this.__internal__panel === null) {
      return;
    }

    this.__internal__panel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;
  }
}
