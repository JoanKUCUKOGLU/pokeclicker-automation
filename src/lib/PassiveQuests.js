/**
 * @class AutomationPassiveQuests
 *
 * Passive automation for quests that do not require game control.
 * Uses the same quest lifecycle logic as Focus Quests, without gameplay takeover.
 */
class AutomationPassiveQuests {
  static Settings = {
    FeatureEnabled: "Passive-Quests-Enabled",
  };

  static __internal__loop = null;

  /**
   * Menu integration
   */
  static initialize(initStep) {
    if (initStep !== Automation.InitSteps.BuildMenu) return;

    Automation.Utils.LocalStorage.setDefaultValue(
      this.Settings.FeatureEnabled,
      false
    );

    const tooltip =
      "Passively automates non-intrusive quests" +
      Automation.Menu.TooltipSeparator +
      "• Hatch Eggs quests\n" +
      "• Underground mining quests\n\n" +
      "This mode uses the Focus Quest logic\n" +
      "without taking control of the game.";

    const button = Automation.Menu.addAutomationButton(
      "Free Quests",
      this.Settings.FeatureEnabled,
      tooltip
    );

    button.addEventListener("click", this.toggle.bind(this), false);
  }

  /**
   * Toggle ON / OFF
   */
  static toggle(enable) {
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true";
    }

    enable ? this.start() : this.stop();
  }

  /**
   * Start passive quest loop
   */
  static start() {
    if (this.__internal__loop !== null) return;
    if (!App.game.quests.isDailyQuestsUnlocked()) return;

    // Ensure background systems are running
    Automation.Hatchery.toggleAutoHatchery(true);
    Automation.Underground.toggleAutoMining(true);

    this.__internal__loop = setInterval(
      this.__internal__loopBody.bind(this),
      500
    );

    this.__internal__loopBody();
  }

  /**
   * Stop passive quest loop
   */
  static stop() {
    clearInterval(this.__internal__loop);
    this.__internal__loop = null;
  }

  /**
   * Core logic — inspired by Focus Quest lifecycle
   */
  static __internal__loopBody() {
    const quests = App.game.quests;

    /* ================================
     * 1) Claim completed quests
     * ================================ */
    this.__internal__claimCompletedQuests();

    /* ================================
     * 2) Fill quest slots if possible
     * ================================ */
    this.__internal__selectNewQuests();

    /* ================================
     * 3) Skip if no quests remaining
     * ================================ */
    if (this.__internal__getFilteredCurrentQuests() == 0)
      this.__internal__skipRemainingQuests();
  }

  /**
   * @brief Claims any completed quest reward
   */
  static __internal__claimCompletedQuests() {
    for (const [index, quest] of App.game.quests.questList().entries()) {
      if (quest.isCompleted() && !quest.claimed()) {
        App.game.quests.claimQuest(index);
      }
    }
  }

  /**
   * @brief Chooses new quests to perform
   *
   * @see __internal__sortQuestByPriority for the quest selection strategy
   */
  static __internal__selectNewQuests() {
    if (!App.game.quests.canStartNewQuest()) {
      return;
    }

    // Only consider quests that:
    //   - Are not already completed
    //   - Are not already in progress
    //   - Are not disabled by the user
    let availableQuests = App.game.quests.questList().filter((quest) => {
      return (
        !quest.isCompleted() &&
        !quest.inProgress() &&
        this.__internal__isPassiveQuest(quest.constructor.name) == true
      );
    }, this);

    // Sort quest to group the same type together
    availableQuests.sort(this.__internal__sortQuestByPriority, this);

    for (const quest of availableQuests) {
      if (App.game.quests.canStartNewQuest()) {
        quest.begin();
      }
    }
  }

  /**
   * @brief Skips the remaining quest, if they were skipped by the user
   */
  static __internal__skipRemainingQuests() {
    // Make sure some quests were not completed (ie. excluded ones)
    let availableQuests = App.game.quests.questList().filter((_, index) => {
      let quest = App.game.quests.questList()[index];
      return !quest.isCompleted() && !quest.inProgress();
    });
    if (availableQuests.length == 0) {
      return;
    }

    // Make sure the player can afford the refresh
    if (!App.game.quests.freeRefresh() && !App.game.quests.canAffordRefresh()) {
      // Go farm some money
      this.__internal__farmSomeMoney();
      return;
    }

    let pokedollarsImage =
      '<img src="assets/images/currency/money.svg" height="25px">';
    let refreshCost = App.game.quests.freeRefresh()
      ? "free"
      : `${App.game.quests.getRefreshCost().amount} ${pokedollarsImage}`;

    App.game.quests.refreshQuests();

    Automation.Notifications.sendNotif(
      `Skipped disabled quests for ${refreshCost}`,
      "Focus",
      "Quests"
    );
  }

  /**
   * @returns The current quests list, without the user disabled ones
   */
  static __internal__getFilteredCurrentQuests() {
    return App.game.quests
      .currentQuests()
      .filter(
        (quest) =>
          Automation.Utils.LocalStorage.getValue(
            this.__internal__advancedSettings.QuestEnabled(
              quest.constructor.name
            )
          ) == "true",
        this
      );
  }

  /**
   * Identify passive quests
   */
  static __internal__isPassiveQuest(quest) {
    return (
      quest == "HatchEggsQuest" ||
      quest == "MineItemsQuest" ||
      quest == "MineLayersQuest"
    );
  }

  /**
   * Enable background systems based on quest types
   */
  static __internal__ensureAutomationForQuests(quests) {
    if (
      quests.some((q) => Automation.Utils.isInstanceOf(q, "HatchEggsQuest"))
    ) {
      Automation.Hatchery.toggleAutoHatchery(true);
    }

    if (
      quests.some(
        (q) =>
          Automation.Utils.isInstanceOf(q, "MineItemsQuest") ||
          Automation.Utils.isInstanceOf(q, "MineLayersQuest")
      )
    ) {
      Automation.Underground.toggleAutoMining(true);
    }
  }
}
