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
      "Passive Quests",
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
      1500
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

    // 1) Claim completed quests (same as focus)
    quests.claimCompletedQuests();

    // 2) Refresh quest list if needed
    if (quests.canStartNewQuest()) {
      quests.beginQuest();
    }

    const currentQuests = quests.currentQuests();

    // 3) Filter only passive-compatible quests
    const passiveQuests = currentQuests.filter((quest) =>
      this.__internal__isPassiveQuest(quest)
    );

    // 4) If no relevant quest is active, try to refresh
    if (passiveQuests.length === 0) {
      if (quests.canStartNewQuest()) {
        quests.beginQuest();
      }
      return;
    }

    // 5) Ensure required automations are enabled
    this.__internal__ensureAutomationForQuests(passiveQuests);
  }

  /**
   * Identify passive quests
   */
  static __internal__isPassiveQuest(quest) {
    return (
      Automation.Utils.isInstanceOf(quest, "HatchEggsQuest") ||
      Automation.Utils.isInstanceOf(quest, "MineItemsQuest") ||
      Automation.Utils.isInstanceOf(quest, "MineLayersQuest")
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
