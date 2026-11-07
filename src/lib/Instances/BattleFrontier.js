/**
 * @class The AutomationBattleFrontier regroups the Battle Frontier Auto Start
 *        and notification filtering functionalities.
 *
 * Battle speed is handled separately by AutomationGameSpeed.
 */
class AutomationBattleFrontier {
  static Settings = {
    FeatureEnabled: "BattleFrontier-FightEnabled",
  };

  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
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

      const autoRunTooltip =
        "Automatically starts the Battle Frontier every time a run finishes.\n" +
        "If a checkpoint was set, it starts from the last checkpoint.";

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
       * Keep original behavior:
       * Auto Start is disabled on fresh load.
       */
      Automation.Menu.forceAutomationState(this.Settings.FeatureEnabled, false);

      return;
    }

    this.__internal__patchBattleFrontierNotifications();

    if (this.__internal__visibilityLoop === null) {
      this.__internal__visibilityLoop = setInterval(
        this.__internal__updateDivVisibilityAndContent.bind(this),
        200,
      );
    }

    this.__internal__updateDivVisibilityAndContent();
  }

  /**
   * @brief Forces the automation to stop
   *        and exits the Battle Frontier.
   */
  static ForceStop() {
    if (App.game.gameState !== GameConstants.GameState.battleFrontier) {
      return;
    }

    this.__internal__toggleBattleFrontierFight(false);

    if (BattleFrontierRunner.started()) {
      BattleFrontierRunner.end();
    }

    App.game.battleFrontier.leave();
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__autoBattleFrontierLoop = null;

  static __internal__autoBattleFrontierPanel = null;

  static __internal__visibilityLoop = null;

  static __internal__notificationsPatched = false;

  static __internal__originalNotify = null;

  /**
   * @brief Toggles Battle Frontier Auto Start.
   */
  static __internal__toggleBattleFrontierFight(enable) {
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true";
    }

    if (enable) {
      if (this.__internal__autoBattleFrontierLoop === null) {
        /*
         * Short interval so x100 BF can
         * restart quickly.
         */
        this.__internal__autoBattleFrontierLoop = setInterval(
          this.__internal__battleFrontierFightLoop.bind(this),
          250,
        );

        this.__internal__battleFrontierFightLoop(true);
      }
    } else {
      clearInterval(this.__internal__autoBattleFrontierLoop);

      this.__internal__autoBattleFrontierLoop = null;
    }
  }

  /**
   * @brief Automatically starts the Battle Frontier
   *        every time it finishes.
   *
   * @param firstRun True on the first loop execution.
   */
  static __internal__battleFrontierFightLoop(firstRun = false) {
    /*
     * User left the BF panel,
     * or manually quit with a checkpoint.
     */
    if (
      this.__internal__autoBattleFrontierPanel.hidden ||
      (!BattleFrontierRunner.started() &&
        BattleFrontierRunner.checkpoint() > 1 &&
        !firstRun)
    ) {
      Automation.Notifications.sendWarningNotif(
        "User action detected, turning off the automation",
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
     * Start using current checkpoint.
     */
    BattleFrontierRunner.start(true);
  }

  /**
   * @brief Completely hides Battle Frontier
   *        reward notifications.
   *
   * Rewards and logbook entries are still granted.
   * Only the toast notification is blocked.
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

        if (
          battleFrontierSetting !== undefined &&
          options?.setting === battleFrontierSetting
        ) {
          /*
           * Don't create the notification.
           */
          return;
        }
      } catch (error) {
        console.debug(
          "[Pokeclicker Automation] Unable to inspect Battle Frontier notification:",
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

  /**
   * @brief Shows the category only while
   *        the player is in Battle Frontier.
   */
  static __internal__updateDivVisibilityAndContent() {
    if (this.__internal__autoBattleFrontierPanel === null) {
      return;
    }

    this.__internal__autoBattleFrontierPanel.hidden =
      App.game.gameState !== GameConstants.GameState.battleFrontier;

    /*
     * Leaving BF disables Auto Start.
     */
    if (this.__internal__autoBattleFrontierPanel.hidden) {
      Automation.Menu.forceAutomationState(this.Settings.FeatureEnabled, false);
    }
  }
}
