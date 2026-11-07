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

    setInterval(this.__internal__updateDivVisibility.bind(this), 200);

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
  static __internal__patched = false;

  static __internal__originalPokemonAttack = null;
  static __internal__originalRunnerTick = null;

  /**
   * @brief Builds the speed selector.
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
        "This does not start, restart or stop the Battle Frontier.",
    );
    settingContainer.appendChild(label);

    const speedSelect = Automation.Menu.createDropDownListElement(
      "BattleFrontier-SpeedMultiplier-Select",
    );

    speedSelect.style.width = "80px";
    speedSelect.style.marginTop = "0px";

    for (const multiplier of [1, 2, 4]) {
      const option = document.createElement("option");

      option.value = multiplier.toString();
      option.textContent = `x${multiplier}`;

      speedSelect.appendChild(option);
    }

    speedSelect.value = this.__internal__getSpeedMultiplier().toString();

    speedSelect.addEventListener("change", function () {
      const multiplier = parseInt(speedSelect.value, 10);

      if (![1, 2, 4].includes(multiplier)) {
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

      // Reset native limiter so the speed change feels immediate.
      if (typeof BattleFrontierBattle !== "undefined") {
        BattleFrontierBattle.lastPokemonAttack = 0;
      }
    });

    settingContainer.appendChild(speedSelect);
    panelContainer.appendChild(settingContainer);
  }

  /**
   * @brief Gets the selected BF speed.
   */
  static __internal__getSpeedMultiplier() {
    const multiplier = parseInt(
      Automation.Utils.LocalStorage.getValue(this.Settings.SpeedMultiplier),
      10,
    );

    return [1, 2, 4].includes(multiplier) ? multiplier : 1;
  }

  /**
   * @brief Hooks into native BF attack/timer calls
   *        without controlling runs.
   */
  static __internal__patchBattleFrontier() {
    if (this.__internal__patched) {
      return;
    }

    this.__internal__patched = true;

    /*
     * Preserve the method that already exists.
     *
     * This means that if another BF script was loaded
     * before this one and wrapped pokemonAttack(),
     * its implementation is preserved.
     */
    this.__internal__originalPokemonAttack = BattleFrontierBattle.pokemonAttack;

    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      /*
       * x1
       *
       * Completely normal PokéClicker behaviour.
       */
      if (multiplier === 1) {
        return AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * First let PokéClicker's normal attack happen.
       *
       * This preserves:
       * - the native 450ms limiter
       * - the alternate attack mechanic
       * - record-stage behaviour
       */
      const previousLastAttack = this.lastPokemonAttack;

      const result =
        AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );

      /*
       * If the native attack did not actually occur,
       * don't generate additional attacks.
       */
      if (this.lastPokemonAttack === previousLastAttack) {
        return result;
      }

      /*
       * Native attack = first hit.
       *
       * x2 -> +1 extra hit
       * x4 -> +3 extra hits
       */
      for (let i = 1; i < multiplier; i++) {
        if (!BattleFrontierRunner.started()) {
          break;
        }

        const enemy = this.enemyPokemon();

        if (!enemy || !enemy.isAlive()) {
          break;
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
          /*
           * Keep PokéClicker's native defeat logic.
           *
           * This handles:
           * - gems
           * - egg progress
           * - Pokémon switching
           * - stage progression
           */
          this.defeatPokemon();
        }
      }

      return result;
    };

    /*
     * Battle Frontier timer.
     */
    this.__internal__originalRunnerTick = BattleFrontierRunner.tick;

    BattleFrontierRunner.tick = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      /*
       * Always execute the normal timer tick.
       */
      const result =
        AutomationBattleFrontier.__internal__originalRunnerTick.apply(
          this,
          args,
        );

      /*
       * x1 = normal timer.
       */
      if (multiplier === 1) {
        return result;
      }

      /*
       * x2 -> 1 extra tick
       * x4 -> 3 extra ticks
       */
      for (let i = 1; i < multiplier; i++) {
        if (!this.started()) {
          break;
        }

        AutomationBattleFrontier.__internal__originalRunnerTick.apply(
          this,
          args,
        );
      }

      return result;
    };
  }

  /**
   * @brief Shows the speed selector while inside the BF.
   *
   * Leaving the BF does NOT reset the selected speed.
   *
   * If x4 is selected, another script can restart the
   * Battle Frontier later and x4 will still be active.
   */
  static __internal__updateDivVisibility() {
    if (this.__internal__panel === null) {
      return;
    }

    this.__internal__panel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;
  }
}
