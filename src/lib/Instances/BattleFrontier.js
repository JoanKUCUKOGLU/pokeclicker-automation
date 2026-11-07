/**
 * @class Battle Frontier automation + speed modifier
 *
 * Features:
 * - Automatically restarts the Battle Frontier when a run ends
 * - Battle Frontier speed: x1 / x2 / x4 / x10 / x100
 * - Battle Frontier reward notifications are hidden
 *
 * No max stage or token farming logic.
 */
class AutomationBattleFrontier {
  static Settings = {
    FeatureEnabled: "BattleFrontier-FightEnabled",
    SpeedMultiplier: "BattleFrontier-SpeedMultiplier",
  };

  /**
   * @brief Initializes the Battle Frontier component.
   *
   * @param initStep The current automation initialization step
   */
  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.SpeedMultiplier,
        "1",
      );

      this.__internal__buildMenu();
      return;
    }

    this.__internal__patchBattleFrontierNotifications();
    this.__internal__patchBattleFrontier();

    this.__internal__toggleBattleFrontierFight();

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
      if (BattleFrontierRunner.started()) {
        BattleFrontierRunner.end();
      }
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

  static __internal__notificationsPatched = false;
  static __internal__originalNotify = null;

  /**
   * @brief Builds the Battle Frontier menu.
   */
  static __internal__buildMenu() {
    const title =
      '<img src="assets/images/npcs/Crush Kin.png" height="20px" style="position:relative; bottom:3px; transform:scaleX(-1);">' +
      "&nbsp;Battle Frontier&nbsp;" +
      '<img src="assets/images/npcs/Crush Kin.png" height="20px" style="position:relative; bottom:3px;">';

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
      "The current Battle Frontier checkpoint will be used when available.";

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
        "x1 = normal speed\n" +
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
    |***                       Auto Start                              ***|
    \*********************************************************************/

  /**
   * @brief Enables or disables automatic Battle Frontier restarting.
   *
   * @param enable Optional explicit state
   */
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

        this.__internal__battleFrontierFightLoop(true);
      }
    } else {
      clearInterval(this.__internal__autoBattleFrontierLoop);

      this.__internal__autoBattleFrontierLoop = null;
    }
  }

  /**
   * @brief Automatically starts a Battle Frontier run if none is active.
   */
  static __internal__battleFrontierFightLoop(firstRun = false) {
    if (App.game.gameState !== GameConstants.GameState.battleFrontier) {
      return;
    }

    if (BattleFrontierRunner.started()) {
      return;
    }

    try {
      BattleFrontierRunner.start(true);
    } catch (error) {
      if (!firstRun) {
        console.debug(
          "[Pokeclicker Automation] Battle Frontier restart pending:",
          error,
        );
      }
    }
  }

  /*********************************************************************\
    |***                  Notification blocker                        ***|
    \*********************************************************************/

  /**
   * @brief Completely blocks Battle Frontier notifications.
   *
   * Other Pokéclicker notifications are left untouched.
   */
  static __internal__patchBattleFrontierNotifications() {
    if (this.__internal__notificationsPatched) {
      return;
    }

    if (
      typeof Notifier === "undefined" ||
      typeof Notifier.notify !== "function"
    ) {
      return;
    }

    this.__internal__notificationsPatched = true;

    this.__internal__originalNotify = Notifier.notify;

    Notifier.notify = function (options, ...args) {
      try {
        const battleFrontierSetting =
          NotificationConstants?.NotificationSetting?.General?.battle_frontier;

        const isBattleFrontierSetting =
          battleFrontierSetting !== undefined &&
          options?.setting === battleFrontierSetting;

        const isBattleFrontierTitle =
          typeof options?.title === "string" &&
          options.title.toLowerCase().includes("battle frontier");

        const strippedMessage =
          typeof options?.strippedMessage === "string"
            ? options.strippedMessage
            : "";

        const normalMessage =
          typeof options?.message === "string" ? options.message : "";

        const messageText = `${strippedMessage} ${normalMessage}`.toLowerCase();

        /*
         * Extra fallback detection in case the game's
         * notification setting changes in a future update.
         */
        const looksLikeBattleFrontierReward =
          messageText.includes("battle points") &&
          (messageText.includes("stage") ||
            messageText.includes("pokédollars") ||
            messageText.includes("money"));

        if (
          isBattleFrontierSetting ||
          isBattleFrontierTitle ||
          looksLikeBattleFrontierReward
        ) {
          /*
           * Do not call the original notifier.
           *
           * The notification is therefore never created.
           */
          return;
        }
      } catch (error) {
        console.debug(
          "[Pokeclicker Automation] Could not identify Battle Frontier notification:",
          error,
        );
      }

      return AutomationBattleFrontier.__internal__originalNotify.call(
        this,
        options,
        ...args,
      );
    };
  }

  /*********************************************************************\
    |***                       Speed                                   ***|
    \*********************************************************************/

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
   * @brief Changes the Battle Frontier speed multiplier.
   */
  static __internal__setSpeedMultiplier(multiplier) {
    Automation.Utils.LocalStorage.setValue(
      this.Settings.SpeedMultiplier,
      multiplier.toString(),
    );

    this.__internal__resetVirtualClock();

    if (typeof BattleFrontierBattle !== "undefined") {
      BattleFrontierBattle.lastPokemonAttack = 0;
    }
  }

  /**
   * @brief Resets accelerated Battle Frontier time.
   */
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
     */

    BattleFrontierBattle.pokemonAttack = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      /*
       * x1 = original Pokéclicker behavior.
       */
      if (multiplier === 1) {
        return AutomationBattleFrontier.__internal__originalPokemonAttack.apply(
          this,
          args,
        );
      }

      /*
       * Preserve native alternate attack behavior
       * above the highest completed BF stage.
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
       * Native BF attack cooldown:
       * approximately 450 ms.
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
     * Main Game Tick
     * =====================================================
     */

    App.game.gameTick = function (...args) {
      const multiplier =
        AutomationBattleFrontier.__internal__getSpeedMultiplier();

      const frontierRunning =
        this.gameState === GameConstants.GameState.battleFrontier &&
        BattleFrontierRunner.started();

      /*
       * Outside BF or x1:
       * normal game behavior.
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
       * Beginning of accelerated BF session.
       */
      if (!AutomationBattleFrontier.__internal__frontierWasRunning) {
        AutomationBattleFrontier.__internal__resetVirtualClock();

        AutomationBattleFrontier.__internal__frontierWasRunning = true;
      }

      /*
       * Native game tick.
       */
      AutomationBattleFrontier.__internal__virtualTime +=
        GameConstants.TICK_TIME;

      const result =
        AutomationBattleFrontier.__internal__originalGameTick.apply(this, args);

      /*
       * Extra BF-only ticks.
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
   * @brief Runs one extra Battle Frontier-only game tick.
   *
   * Combat and timer remain synchronized.
   */
  static __internal__runVirtualBattleFrontierTick() {
    /*
     * Battle
     */
    BattleFrontierBattle.counter += GameConstants.TICK_TIME;

    if (BattleFrontierBattle.counter >= GameConstants.BATTLE_FRONTIER_TICK) {
      BattleFrontierBattle.tick();
    }

    /*
     * Stage timer
     */
    BattleFrontierRunner.tick();
  }

  /*********************************************************************\
    |***                          UI                                   ***|
    \*********************************************************************/

  /**
   * @brief Shows the category while the player is on
   *        the Battle Frontier screen.
   */
  static __internal__updateDivVisibilityAndContent() {
    if (this.__internal__autoBattleFrontierPanel === null) {
      return;
    }

    this.__internal__autoBattleFrontierPanel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;
  }
}
