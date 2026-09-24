/**
 * @class AutomationFreeQuests
 *
 * Passive Daily Quest automation.
 *
 * Free Quests only handles quests that can progress in the background:
 *
 * - HatchEggsQuest
 * - MineLayersQuest
 * - MineItemsQuest
 *
 * It DOES NOT:
 * - move the player
 * - change routes
 * - start gyms/dungeons
 * - modify Oak Items
 * - modify Poké Balls
 * - take control of Focus
 *
 * It can:
 * - claim completed quests
 * - start passive quests
 * - refresh unwanted quests
 * - temporarily run Hatchery / Underground automation when needed
 */
class AutomationFreeQuests {
  /***************************************************************************
   * SETTINGS
   ***************************************************************************/

  static Settings = {
    FeatureEnabled: "FreeQuests-Enabled",

    /*
     * Disabled by default.
     *
     * If false:
     * only the game's free refresh will ever be used.
     *
     * If true:
     * paid refreshes may also be used.
     */
    AllowPaidRefresh: "FreeQuests-AllowPaidRefresh",
  };

  /***************************************************************************
   * INTERNAL STATE
   ***************************************************************************/

  static __internal__loop = null;

  /*
   * Once per second is more than enough for Daily Quests.
   */
  static __internal__loopIntervalMs = 1000;

  /*
   * Avoid spamming paid refreshes.
   */
  static __internal__paidRefreshCooldownMs = 5000;

  static __internal__lastPaidRefresh = 0;

  /*
   * Keep track of background systems that WE temporarily enabled.
   *
   * This allows us to restore the user's actual saved setting afterward.
   */
  static __internal__forcedHatchery = false;
  static __internal__forcedUnderground = false;

  /*
   * Main menu container.
   */
  static __internal__container = null;

  /*
   * These are the ONLY quests Free Quests is allowed to touch.
   */
  static __internal__supportedQuestTypes = [
    "HatchEggsQuest",
    "MineLayersQuest",
    "MineItemsQuest",
  ];

  /***************************************************************************
   * INITIALIZATION
   ***************************************************************************/

  static initialize(initStep) {
    /*************************************************************************
     * BUILD MENU
     *************************************************************************/

    if (initStep === Automation.InitSteps.BuildMenu) {
      /*
       * OFF by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.FeatureEnabled,
        false,
      );

      /*
       * Never spend money by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.AllowPaidRefresh,
        false,
      );

      this.__internal__buildMenu();

      return;
    }

    /*************************************************************************
     * FINALIZE
     *************************************************************************/

    if (initStep === Automation.InitSteps.Finalize) {
      /*
       * Restore saved ON/OFF state after reload.
       */
      this.toggle();

      return;
    }
  }

  /***************************************************************************
   * MENU
   ***************************************************************************/

  static __internal__buildMenu() {
    /*
     * Main Free Quests container.
     */
    this.__internal__container = document.createElement("div");

    Automation.Menu.AutomationButtonsDiv.appendChild(
      this.__internal__container,
    );

    Automation.Menu.addSeparator(this.__internal__container);

    /*
     * Main tooltip.
     */
    const tooltip =
      "Automatically manages passive Daily Quests" +
      Automation.Menu.TooltipSeparator +
      "Supported quests:\n" +
      "• Hatch Eggs\n" +
      "• Mine Underground Layers\n" +
      "• Mine Underground Items" +
      Automation.Menu.TooltipSeparator +
      "Works in the background without changing your route,\n" +
      "Focus target, Gym, Dungeon or Battle activity.";

    /*
     * Main ON / OFF button.
     */
    const button = Automation.Menu.addAutomationButton(
      "Free Quests",
      this.Settings.FeatureEnabled,
      tooltip,
      this.__internal__container,
    );

    /*
     * Start / stop Free Quests when clicking the button.
     */
    button.addEventListener("click", this.toggle.bind(this), false);

    /***************************************************************************
     * ADVANCED SETTINGS PANEL
     ***************************************************************************/

    /*
     * Create the same collapsible settings menu used by modules
     * such as Hatchery.
     */
    const settingsPanel = Automation.Menu.addSettingPanel(
      button.parentElement.parentElement,
    );

    /*
     * Panel title.
     */
    const titleDiv = Automation.Menu.createTitleElement(
      "Free Quests advanced settings",
    );

    titleDiv.style.marginBottom = "10px";

    settingsPanel.appendChild(titleDiv);

    /*
     * Paid refresh option.
     *
     * This is now hidden inside the expandable settings panel instead
     * of permanently taking space in the main Automation menu.
     */
    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Allow paid quest refresh",
      this.Settings.AllowPaidRefresh,

      "Allow Free Quests to spend Pokédollars refreshing Daily Quests" +
        Automation.Menu.TooltipSeparator +
        "OFF: only the free Daily Quest refresh will be used.\n" +
        "ON: paid refreshes may also be used.",

      settingsPanel,
    );

    /***************************************************************************
     * DAILY QUEST UNLOCK
     ***************************************************************************/

    /*
     * Hide the entire feature until Daily Quests are unlocked.
     */
    if (!App.game.quests.isDailyQuestsUnlocked()) {
      this.__internal__container.hidden = true;

      this.__internal__setUnlockWatcher();
    }
  }

  /***************************************************************************
   * UNLOCK WATCHER
   ***************************************************************************/

  static __internal__setUnlockWatcher() {
    const watcher = setInterval(
      function () {
        if (!App.game.quests.isDailyQuestsUnlocked()) {
          return;
        }

        clearInterval(watcher);

        this.__internal__container.hidden = false;

        /*
         * The user may have enabled Free Quests on a previous save/session.
         */
        this.toggle();
      }.bind(this),
      5000,
    );
  }

  /***************************************************************************
   * TOGGLE
   ***************************************************************************/

  static toggle(enable) {
    /*
     * No explicit state supplied:
     * read LocalStorage.
     */
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true";
    }

    if (enable) {
      this.__internal__start();
    } else {
      this.__internal__stop();
    }
  }

  /***************************************************************************
   * START
   ***************************************************************************/

  static __internal__start() {
    /*
     * Already running.
     */
    if (this.__internal__loop !== null) {
      return;
    }

    /*
     * Daily Quests aren't unlocked.
     */
    if (!App.game.quests.isDailyQuestsUnlocked()) {
      return;
    }

    this.__internal__loop = setInterval(
      this.__internal__loopBody.bind(this),
      this.__internal__loopIntervalMs,
    );

    /*
     * Run immediately instead of waiting one second.
     */
    this.__internal__loopBody();
  }

  /***************************************************************************
   * STOP
   ***************************************************************************/

  static __internal__stop() {
    if (this.__internal__loop !== null) {
      clearInterval(this.__internal__loop);
    }

    this.__internal__loop = null;

    /*
     * Restore user's actual Hatchery / Underground settings if we had
     * temporarily enabled them.
     */
    this.__internal__restoreBackgroundAutomations();
  }

  /***************************************************************************
   * MAIN LOOP
   ***************************************************************************/

  static __internal__loopBody() {
    /*
     * Don't compete with the real Focus -> Quests automation.
     *
     * Other Focus modes such as:
     *
     * - XP
     * - Roamers
     * - Pokérus
     * - Achievements
     *
     * can coexist with Free Quests.
     */
    if (this.__internal__isFullQuestFocusActive()) {
      return;
    }

    /*************************************************************************
     * 1 - CLAIM COMPLETED QUESTS
     *************************************************************************/

    this.__internal__claimCompletedQuests();

    /*************************************************************************
     * 2 - START AVAILABLE PASSIVE QUESTS
     *************************************************************************/

    this.__internal__startAvailablePassiveQuests();

    /*************************************************************************
     * 3 - ENABLE ONLY THE BACKGROUND SYSTEMS WE CURRENTLY NEED
     *************************************************************************/

    const activePassiveQuests = this.__internal__getActivePassiveQuests();

    this.__internal__ensureBackgroundAutomations(activePassiveQuests);

    /*************************************************************************
     * 4 - TRY TO FIND MORE PASSIVE QUESTS
     *************************************************************************/

    this.__internal__tryRefreshQuests();
  }

  /***************************************************************************
   * CHECK FOCUS CONFLICT
   ***************************************************************************/

  static __internal__isFullQuestFocusActive() {
    const focusEnabled =
      Automation.Utils.LocalStorage.getValue(
        Automation.Focus.Settings.FeatureEnabled,
      ) === "true";

    if (!focusEnabled) {
      return false;
    }

    const focusedTopic = Automation.Utils.LocalStorage.getValue(
      Automation.Focus.Settings.FocusedTopic,
    );

    return focusedTopic === "Quests";
  }

  /***************************************************************************
   * QUEST IDENTIFICATION
   ***************************************************************************/

  static __internal__isPassiveQuest(quest) {
    if (!quest) {
      return false;
    }

    return this.__internal__supportedQuestTypes.includes(
      quest.constructor.name,
    );
  }

  /***************************************************************************
   * CLAIM COMPLETED
   ***************************************************************************/

  static __internal__claimCompletedQuests() {
    const quests = App.game.quests.questList();

    for (const [index, quest] of quests.entries()) {
      if (quest.isCompleted() && !quest.claimed()) {
        App.game.quests.claimQuest(index);
      }
    }
  }

  /***************************************************************************
   * START PASSIVE QUESTS
   ***************************************************************************/

  static __internal__startAvailablePassiveQuests() {
    /*
     * No free active quest slot.
     */
    if (!App.game.quests.canStartNewQuest()) {
      return;
    }

    /*
     * Only consider:
     *
     * - passive quest
     * - not complete
     * - not already active
     */
    const available = App.game.quests
      .questList()
      .filter(
        (quest) =>
          this.__internal__isPassiveQuest(quest) &&
          !quest.isCompleted() &&
          !quest.inProgress(),
      );

    /*
     * Prioritize Hatch Eggs first.
     *
     * This isn't strictly required, but Hatchery progression tends to run
     * continuously and therefore makes a good passive quest.
     */
    available.sort(
      (a, b) =>
        this.__internal__getQuestPriority(a) -
        this.__internal__getQuestPriority(b),
    );

    /*
     * Fill every available quest slot with supported passive quests.
     */
    for (const quest of available) {
      if (!App.game.quests.canStartNewQuest()) {
        break;
      }

      quest.begin();
    }
  }

  /***************************************************************************
   * QUEST PRIORITY
   ***************************************************************************/

  static __internal__getQuestPriority(quest) {
    switch (quest.constructor.name) {
      case "HatchEggsQuest":
        return 0;

      case "MineLayersQuest":
        return 1;

      case "MineItemsQuest":
        return 2;

      default:
        return 999;
    }
  }

  /***************************************************************************
   * ACTIVE PASSIVE QUESTS
   ***************************************************************************/

  static __internal__getActivePassiveQuests() {
    return App.game.quests
      .currentQuests()
      .filter((quest) => this.__internal__isPassiveQuest(quest));
  }

  /***************************************************************************
   * PASSIVE QUESTS WAITING TO START
   ***************************************************************************/

  static __internal__getAvailablePassiveQuests() {
    return App.game.quests
      .questList()
      .filter(
        (quest) =>
          this.__internal__isPassiveQuest(quest) &&
          !quest.isCompleted() &&
          !quest.inProgress(),
      );
  }

  /***************************************************************************
   * REFRESH QUESTS
   ***************************************************************************/

  static __internal__tryRefreshQuests() {
    /*
     * Don't refresh unless we actually have room to start another quest.
     *
     * This prevents Free Quests from interfering when the player's active
     * quest slots are already full.
     */
    if (!App.game.quests.canStartNewQuest()) {
      return;
    }

    /*
     * We already have another supported quest waiting.
     *
     * Let the normal start logic pick it next tick.
     */
    if (this.__internal__getAvailablePassiveQuests().length > 0) {
      return;
    }

    /*
     * Make sure there are actually inactive quests that can be refreshed.
     */
    const refreshableQuests = App.game.quests
      .questList()
      .filter((quest) => !quest.isCompleted() && !quest.inProgress());

    if (refreshableQuests.length === 0) {
      return;
    }

    /*************************************************************************
     * FREE REFRESH
     *************************************************************************/

    if (App.game.quests.freeRefresh()) {
      App.game.quests.refreshQuests();

      Automation.Notifications.sendNotif(
        "Used the free Daily Quest refresh while searching for a passive quest.",
        "Free Quests",
      );

      return;
    }

    /*************************************************************************
     * PAID REFRESH
     *************************************************************************/

    const allowPaidRefresh =
      Automation.Utils.LocalStorage.getValue(this.Settings.AllowPaidRefresh) ===
      "true";

    /*
     * Safe default:
     * never spend money.
     */
    if (!allowPaidRefresh) {
      return;
    }

    /*
     * Can't afford refresh.
     *
     * IMPORTANT:
     *
     * Free Quests DOES NOT go farm money.
     * That would stop being a passive background feature.
     */
    if (!App.game.quests.canAffordRefresh()) {
      return;
    }

    /*
     * Paid refresh cooldown.
     */
    const now = Date.now();

    if (
      now - this.__internal__lastPaidRefresh <
      this.__internal__paidRefreshCooldownMs
    ) {
      return;
    }

    this.__internal__lastPaidRefresh = now;

    const refreshCost = App.game.quests.getRefreshCost();

    App.game.quests.refreshQuests();

    Automation.Notifications.sendNotif(
      `Refreshed Daily Quests while searching for a passive quest (${refreshCost.amount} Pokédollars).`,
      "Free Quests",
    );
  }

  /***************************************************************************
   * BACKGROUND AUTOMATIONS
   ***************************************************************************/

  static __internal__ensureBackgroundAutomations(quests) {
    /*
     * Do we need Hatchery?
     */
    const needHatchery = quests.some(
      (quest) => quest.constructor.name === "HatchEggsQuest",
    );

    /*
     * Do we need Underground?
     */
    const needUnderground = quests.some(
      (quest) =>
        quest.constructor.name === "MineLayersQuest" ||
        quest.constructor.name === "MineItemsQuest",
    );

    /*************************************************************************
     * HATCHERY
     *************************************************************************/

    if (needHatchery && App.game.breeding.canAccess()) {
      /*
       * Calling toggleAutoHatchery(true) directly starts its loop without
       * changing the user's saved ON/OFF preference.
       */
      Automation.Hatchery.toggleAutoHatchery(true);

      this.__internal__forcedHatchery = true;
    } else if (this.__internal__forcedHatchery) {
      /*
       * No Free Quest needs Hatchery anymore.
       *
       * Calling without a parameter restores the user's stored setting.
       */
      Automation.Hatchery.toggleAutoHatchery();

      this.__internal__forcedHatchery = false;
    }

    /*************************************************************************
     * UNDERGROUND
     *************************************************************************/

    if (needUnderground && App.game.underground.canAccess()) {
      Automation.Underground.toggleAutoMining(true);

      this.__internal__forcedUnderground = true;
    } else if (this.__internal__forcedUnderground) {
      /*
       * Restore user's normal Underground setting.
       */
      Automation.Underground.toggleAutoMining();

      this.__internal__forcedUnderground = false;
    }
  }

  /***************************************************************************
   * RESTORE BACKGROUND AUTOMATIONS
   ***************************************************************************/

  static __internal__restoreBackgroundAutomations() {
    if (this.__internal__forcedHatchery) {
      Automation.Hatchery.toggleAutoHatchery();

      this.__internal__forcedHatchery = false;
    }

    if (this.__internal__forcedUnderground) {
      Automation.Underground.toggleAutoMining();

      this.__internal__forcedUnderground = false;
    }
  }
}
