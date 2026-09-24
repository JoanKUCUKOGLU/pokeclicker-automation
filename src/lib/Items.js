/**
 * @class The AutomationItems regroups the 'Item Upgrade' functionalities
 *
 * The following item types are handled:
 * - Oak items
 * - Gem upgrades
 * - Purify Chamber
 *
 * @note These functionalities are not accessible right away when starting
 * a new game.
 */
class AutomationItems {
  static Settings = {
    UpgradeOakItems: "Items-UpgradeOakItems",
    UpgradeGems: "Items-UpgradeGems",

    /*
     * Automatically uses the Purify Chamber
     * when enough Flow is available.
     */
    AutoPurify: "Items-AutoPurify",
  };

  /**
   * Builds the menu and restores previous running states.
   *
   * @param initStep The current automation init step
   */
  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      /*
       * Oak Items disabled by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.UpgradeOakItems,
        false,
      );

      /*
       * Auto Purify disabled by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.AutoPurify,
        false,
      );

      this.__internal__buildMenu();
    } else if (initStep == Automation.InitSteps.Finalize) {
      /*
       * Restore saved states.
       */
      this.__internal__toggleAutoOakUpgrade();

      this.__internal__toggleAutoGemUpgrade();

      this.__internal__toggleAutoPurify();
    }
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  /*
   * Main Auto Upgrade container.
   */
  static __internal__upgradeContainer = null;

  /*
   * Individual feature containers.
   */
  static __internal__oakUpgradeContainer = null;

  static __internal__gemUpgradeContainer = null;

  static __internal__purifyContainer = null;

  /*
   * Automation loops.
   */
  static __internal__autoOakUpgradeLoop = null;

  static __internal__autoGemUpgradeLoop = null;

  static __internal__autoPurifyLoop = null;

  /***************************************************************************
   * MENU
   ***************************************************************************/

  static __internal__buildMenu() {
    /*************************************************************************
     * MAIN CONTAINER
     *************************************************************************/

    this.__internal__upgradeContainer = document.createElement("div");

    Automation.Menu.AutomationButtonsDiv.appendChild(
      this.__internal__upgradeContainer,
    );

    Automation.Menu.addSeparator(this.__internal__upgradeContainer);

    /*************************************************************************
     * TITLE
     *************************************************************************/

    const titleDiv = Automation.Menu.createTitleElement("Auto Upgrade");

    this.__internal__upgradeContainer.appendChild(titleDiv);

    /*************************************************************************
     * OAK ITEMS
     *************************************************************************/

    this.__internal__oakUpgradeContainer = document.createElement("div");

    this.__internal__upgradeContainer.appendChild(
      this.__internal__oakUpgradeContainer,
    );

    const hasAccessToOakItems = App.game.oakItems.canAccess();

    /*
     * Hide Oak Items if:
     *
     * - not unlocked
     * - or everything is already max level
     */
    this.__internal__oakUpgradeContainer.hidden =
      !hasAccessToOakItems ||
      App.game.oakItems.itemList.every((item) => item.isMaxLevel());

    this.__internal__oakUpgradeContainer.hiddenForAccessReason =
      !hasAccessToOakItems;

    const oakItemTooltip =
      "Automatically upgrades Oak items when possible" +
      Automation.Menu.TooltipSeparator +
      "⚠️ This can be cost-heavy during early game";

    const oakUpgradeButton = Automation.Menu.addAutomationButton(
      "Oak Items",
      this.Settings.UpgradeOakItems,
      oakItemTooltip,
      this.__internal__oakUpgradeContainer,
    );

    oakUpgradeButton.addEventListener(
      "click",
      this.__internal__toggleAutoOakUpgrade.bind(this),
      false,
    );

    /*************************************************************************
     * GEMS
     *************************************************************************/

    this.__internal__gemUpgradeContainer = document.createElement("div");

    this.__internal__upgradeContainer.appendChild(
      this.__internal__gemUpgradeContainer,
    );

    const hasAccessToGems = App.game.gems.canAccess();

    this.__internal__gemUpgradeContainer.hidden =
      !hasAccessToGems || this.__internal__areEveryGemsMaxedOut();

    this.__internal__gemUpgradeContainer.hiddenForAccessReason =
      !hasAccessToGems;

    const gemsTooltip =
      "Automatically uses Gems to upgrade attack effectiveness";

    const gemUpgradeButton = Automation.Menu.addAutomationButton(
      "Gems",
      this.Settings.UpgradeGems,
      gemsTooltip,
      this.__internal__gemUpgradeContainer,
    );

    gemUpgradeButton.addEventListener(
      "click",
      this.__internal__toggleAutoGemUpgrade.bind(this),
      false,
    );

    /*************************************************************************
     * PURIFY CHAMBER
     *************************************************************************/

    this.__internal__purifyContainer = document.createElement("div");

    this.__internal__upgradeContainer.appendChild(
      this.__internal__purifyContainer,
    );

    /*
     * Same Shadow mechanic availability check
     * used by the Shadow-related systems.
     */
    const hasAccessToPurify = this.__internal__canUsePurifyChamber();

    this.__internal__purifyContainer.hidden = !hasAccessToPurify;

    this.__internal__purifyContainer.hiddenForAccessReason = !hasAccessToPurify;

    const purifyTooltip =
      "Automatically uses the Purify Chamber when enough Flow is available" +
      Automation.Menu.TooltipSeparator +
      "Purifies the selected Shadow Pokémon automatically.\n" +
      "The Maximum Flow notification is closed automatically after purification.";

    const purifyButton = Automation.Menu.addAutomationButton(
      "Purify Chamber",
      this.Settings.AutoPurify,
      purifyTooltip,
      this.__internal__purifyContainer,
    );

    purifyButton.addEventListener(
      "click",
      this.__internal__toggleAutoPurify.bind(this),
      false,
    );

    /*************************************************************************
     * CONTAINER VISIBILITY
     *************************************************************************/

    this.__internal__updateUpgradeContainerVisibility();

    /*************************************************************************
     * UNLOCK WATCHER
     *************************************************************************/

    if (!hasAccessToOakItems || !hasAccessToGems || !hasAccessToPurify) {
      this.__internal__setItemUpgradeUnlockWatcher();
    }
  }

  /***************************************************************************
   * MAIN CONTAINER VISIBILITY
   ***************************************************************************/

  static __internal__updateUpgradeContainerVisibility() {
    this.__internal__upgradeContainer.hidden =
      this.__internal__oakUpgradeContainer.hidden &&
      this.__internal__gemUpgradeContainer.hidden &&
      this.__internal__purifyContainer.hidden;
  }

  /***************************************************************************
   * PURIFY CHAMBER ACCESS
   ***************************************************************************/

  static __internal__canUsePurifyChamber() {
    try {
      /*
       * Shadow Pokémon filter availability is a reliable indicator
       * that the Shadow/Purify mechanic has been unlocked.
       */
      return (
        typeof pokeballFilterOptions !== "undefined" &&
        pokeballFilterOptions.shadow &&
        pokeballFilterOptions.shadow.canUse()
      );
    } catch (error) {
      return false;
    }
  }

  /***************************************************************************
   * UNLOCK WATCHER
   ***************************************************************************/

  static __internal__setItemUpgradeUnlockWatcher() {
    const watcher = setInterval(
      function () {
        /*********************************************************************
         * OAK ITEMS
         *********************************************************************/

        if (
          this.__internal__oakUpgradeContainer.hiddenForAccessReason &&
          App.game.oakItems.canAccess()
        ) {
          this.__internal__oakUpgradeContainer.hiddenForAccessReason = false;

          this.__internal__oakUpgradeContainer.hidden =
            App.game.oakItems.itemList.every((item) => item.isMaxLevel());

          this.__internal__toggleAutoOakUpgrade();
        }

        /*********************************************************************
         * GEMS
         *********************************************************************/

        if (
          this.__internal__gemUpgradeContainer.hiddenForAccessReason &&
          App.game.gems.canAccess()
        ) {
          this.__internal__gemUpgradeContainer.hiddenForAccessReason = false;

          this.__internal__gemUpgradeContainer.hidden =
            this.__internal__areEveryGemsMaxedOut();

          this.__internal__toggleAutoGemUpgrade();
        }

        /*********************************************************************
         * PURIFY CHAMBER
         *********************************************************************/

        if (
          this.__internal__purifyContainer.hiddenForAccessReason &&
          this.__internal__canUsePurifyChamber()
        ) {
          this.__internal__purifyContainer.hiddenForAccessReason = false;

          this.__internal__purifyContainer.hidden = false;

          /*
           * Restore previously saved state.
           */
          this.__internal__toggleAutoPurify();
        }

        /*********************************************************************
         * MAIN CONTAINER
         *********************************************************************/

        this.__internal__updateUpgradeContainerVisibility();

        /*
         * Once every system is unlocked,
         * stop watching.
         */
        if (
          !this.__internal__oakUpgradeContainer.hiddenForAccessReason &&
          !this.__internal__gemUpgradeContainer.hiddenForAccessReason &&
          !this.__internal__purifyContainer.hiddenForAccessReason
        ) {
          clearInterval(watcher);
        }
      }.bind(this),

      10000,
    );
  }

  /***************************************************************************
   * OAK ITEMS TOGGLE
   ***************************************************************************/

  static __internal__toggleAutoOakUpgrade(enable) {
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(
          this.Settings.UpgradeOakItems,
        ) === "true";
    }

    if (enable && !this.__internal__oakUpgradeContainer.hidden) {
      if (this.__internal__autoOakUpgradeLoop === null) {
        this.__internal__autoOakUpgradeLoop = setInterval(
          this.__internal__oakItemUpgradeLoop.bind(this),
          10000,
        );

        /*
         * Run immediately.
         */
        this.__internal__oakItemUpgradeLoop();
      }
    } else {
      clearInterval(this.__internal__autoOakUpgradeLoop);

      this.__internal__autoOakUpgradeLoop = null;
    }
  }

  /***************************************************************************
   * GEMS TOGGLE
   ***************************************************************************/

  static __internal__toggleAutoGemUpgrade(enable) {
    if (!App.game.gems.canAccess()) {
      return;
    }

    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.UpgradeGems) ===
        "true";
    }

    if (enable && !this.__internal__gemUpgradeContainer.hidden) {
      if (this.__internal__autoGemUpgradeLoop === null) {
        this.__internal__autoGemUpgradeLoop = setInterval(
          this.__internal__gemUpgradeLoop.bind(this),
          10000,
        );

        /*
         * Run immediately.
         */
        this.__internal__gemUpgradeLoop();
      }
    } else {
      clearInterval(this.__internal__autoGemUpgradeLoop);

      this.__internal__autoGemUpgradeLoop = null;
    }
  }

  /***************************************************************************
   * PURIFY CHAMBER TOGGLE
   ***************************************************************************/

  static __internal__toggleAutoPurify(enable) {
    /*
     * Not unlocked yet.
     */
    if (!this.__internal__canUsePurifyChamber()) {
      return;
    }

    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.AutoPurify) ===
        "true";
    }

    if (enable && !this.__internal__purifyContainer.hidden) {
      /*
       * Avoid duplicate loops.
       */
      if (this.__internal__autoPurifyLoop === null) {
        /*
         * Check every second.
         */
        this.__internal__autoPurifyLoop = setInterval(
          this.__internal__purifyLoop.bind(this),
          1000,
        );

        /*
         * Run immediately.
         */
        this.__internal__purifyLoop();
      }
    } else {
      clearInterval(this.__internal__autoPurifyLoop);

      this.__internal__autoPurifyLoop = null;
    }
  }

  /***************************************************************************
   * PURIFY CHAMBER LOOP
   ***************************************************************************/

  static __internal__purifyLoop() {
    /*
     * Safety.
     */
    if (!this.__internal__canUsePurifyChamber()) {
      return;
    }

    const chamber = App.game.purifyChamber;

    /*
     * Nothing selected / not enough Flow / invalid Pokémon.
     *
     * Prefer the game's own canPurify() logic whenever available.
     */
    if (typeof chamber.canPurify === "function" && !chamber.canPurify()) {
      return;
    }

    /*
     * Save Flow before attempting purification.
     *
     * Successful purification should reduce/reset it.
     */
    const flowBefore = chamber.currentFlow();

    /*
     * Same core action used by the game's normal
     * Purify Chamber and Shadow Purification Focus.
     */
    chamber.purify();

    /*
     * Check whether purification actually happened.
     */
    const flowAfter = chamber.currentFlow();

    if (flowAfter < flowBefore) {
      /*
       * Purification succeeded:
       * the Maximum Flow notification is now obsolete.
       */
      this.__internal__dismissPurifyNotification();
    }
  }

  /***************************************************************************
   * PURIFY NOTIFICATION
   ***************************************************************************/

  /**
   * Automatically closes the Purify Chamber Maximum Flow notification.
   *
   * Only the matching Purify Chamber toast is affected.
   * Other notifications remain untouched.
   */
  static __internal__dismissPurifyNotification() {
    /*
     * The notification may already exist, but doing a couple
     * of delayed attempts also covers Bootstrap/DOM timing.
     */
    this.__internal__dismissPurifyNotificationNow();

    setTimeout(this.__internal__dismissPurifyNotificationNow.bind(this), 100);

    setTimeout(this.__internal__dismissPurifyNotificationNow.bind(this), 300);
  }

  /**
   * Finds and closes currently visible Purify Chamber toasts.
   */
  static __internal__dismissPurifyNotificationNow() {
    const titleText = "Purify Chamber";

    const messageText = "Maximum Flow has accumulated at the Purify Chamber";

    /*
     * PokéClicker notifications are displayed as Bootstrap toasts.
     */
    const toasts = document.querySelectorAll(".toast");

    toasts.forEach((toast) => {
      const text = toast.textContent || "";

      /*
       * Only touch this exact type of notification.
       */
      if (!text.includes(titleText) || !text.includes(messageText)) {
        return;
      }

      /*********************************************************************
       * METHOD 1
       *
       * Click the normal close button.
       *************************************************************************/

      const closeButton = toast.querySelector(
        [
          '[data-dismiss="toast"]',
          '[data-bs-dismiss="toast"]',
          ".close",
          ".btn-close",
        ].join(","),
      );

      if (closeButton) {
        closeButton.click();
        return;
      }

      /*********************************************************************
       * METHOD 2
       *
       * Bootstrap / jQuery fallback.
       *************************************************************************/

      try {
        if (typeof $ !== "undefined" && typeof $(toast).toast === "function") {
          $(toast).toast("hide");
          return;
        }
      } catch (error) {
        /*
         * Continue to final fallback.
         */
      }

      /*********************************************************************
       * METHOD 3
       *
       * Last-resort DOM removal.
       *************************************************************************/

      toast.remove();
    });
  }

  /***************************************************************************
   * OAK ITEM LOOP
   ***************************************************************************/

  static __internal__oakItemUpgradeLoop() {
    if (!App.game.oakItems.canAccess()) {
      return;
    }

    let areAllItemsMaxedOut = true;

    for (const item of App.game.oakItems.itemList) {
      /*
       * Upgrade when:
       *
       * - unlocked
       * - not max level
       * - enough experience
       * - enough currency
       */
      if (item.isUnlocked() && !item.isMaxLevel() && item.hasEnoughExp()) {
        const itemCost = item.calculateCost();

        if (itemCost.amount < App.game.wallet.currencies[itemCost.currency]()) {
          item.buy();
        }
      }

      areAllItemsMaxedOut &= item.isMaxLevel();
    }

    /*
     * Everything is max level.
     */
    if (areAllItemsMaxedOut) {
      /*
       * Hide Oak Items.
       */
      this.__internal__oakUpgradeContainer.hiddenForAccessReason = false;

      this.__internal__oakUpgradeContainer.hidden = true;

      /*
       * Update main Auto Upgrade menu visibility.
       */
      this.__internal__updateUpgradeContainerVisibility();

      /*
       * Stop Oak loop.
       */
      this.__internal__toggleAutoOakUpgrade(false);
    }
  }

  /***************************************************************************
   * GEM LOOP
   ***************************************************************************/

  static __internal__gemUpgradeLoop() {
    let areAllGemsMaxedOut = true;

    /*
     * Iterate over Gem types.
     */
    for (const type of Array(Gems.nTypes).keys()) {
      /*
       * Iterate over affinities.
       */
      for (const affinity of Array(Gems.nEffects).keys()) {
        /*
         * Ignore invalid upgrades.
         */
        if (!App.game.gems.isValidUpgrade(type, affinity)) {
          continue;
        }

        /*
         * Buy when possible.
         */
        if (
          !App.game.gems.hasMaxUpgrade(type, affinity) &&
          App.game.gems.canBuyGemUpgrade(type, affinity)
        ) {
          App.game.gems.buyGemUpgrade(type, affinity);
        }

        areAllGemsMaxedOut &= App.game.gems.hasMaxUpgrade(type, affinity);
      }
    }

    /*
     * Everything maxed.
     */
    if (areAllGemsMaxedOut) {
      /*
       * Hide Gems.
       */
      this.__internal__gemUpgradeContainer.hiddenForAccessReason = false;

      this.__internal__gemUpgradeContainer.hidden = true;

      /*
       * Update main container.
       */
      this.__internal__updateUpgradeContainerVisibility();

      /*
       * Stop Gem loop.
       */
      this.__internal__toggleAutoGemUpgrade(false);
    }
  }

  /***************************************************************************
   * GEM HELPERS
   ***************************************************************************/

  static __internal__areEveryGemsMaxedOut() {
    /*
     * Iterate over Gem types.
     */
    for (const type of Array(Gems.nTypes).keys()) {
      /*
       * Iterate over affinities.
       */
      for (const affinity of Array(Gems.nEffects).keys()) {
        if (
          App.game.gems.isValidUpgrade(type, affinity) &&
          !App.game.gems.hasMaxUpgrade(type, affinity)
        ) {
          return false;
        }
      }
    }

    return true;
  }
}
