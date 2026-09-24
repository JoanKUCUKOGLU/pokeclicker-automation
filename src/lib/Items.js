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
 *
 * This menu will be hidden until at least one of the functionalities
 * is unlocked in-game.
 *
 * Each button will be hidden until the corresponding functionality
 * is unlocked in-game.
 */
class AutomationItems {
  static Settings = {
    UpgradeOakItems: "Items-UpgradeOakItems",
    UpgradeGems: "Items-UpgradeGems",

    /*
     * Automatically uses the Purify Chamber when enough Flow is available.
     */
    AutoPurify: "Items-AutoPurify",
  };

  /**
   * @brief Builds the menu, and restores previous running state if needed
   *
   * @param initStep The current automation init step
   */
  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      /*
       * Disable Oak Items auto-upgrades by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.UpgradeOakItems,
        false,
      );

      /*
       * Disable automatic purification by default.
       */
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.AutoPurify,
        false,
      );

      this.__internal__buildMenu();
    } else if (initStep == Automation.InitSteps.Finalize) {
      /*
       * Restore previous session states.
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

  /**
   * @brief Builds the menu
   */
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

    /*
     * Only display Oak Items when they are unlocked and at least
     * one Oak Item still needs an upgrade.
     */
    const hasAccessToOakItems = App.game.oakItems.canAccess();

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

    /*
     * Only display Gems when unlocked and at least one Gem upgrade
     * is still available.
     */
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
     * Use the same unlock condition as Focus -> Shadow purify.
     */
    const hasAccessToPurify = this.__internal__canUsePurifyChamber();

    this.__internal__purifyContainer.hidden = !hasAccessToPurify;

    this.__internal__purifyContainer.hiddenForAccessReason = !hasAccessToPurify;

    const purifyTooltip =
      "Automatically uses the Purify Chamber when enough Flow is available" +
      Automation.Menu.TooltipSeparator +
      "Uses the currently selected Shadow Pokémon in the Purify Chamber.\n" +
      "The option stays enabled while Flow recharges.";

    const purifyButton = Automation.Menu.addAutomationButton(
      "Purify",
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
     * MAIN MENU VISIBILITY
     *************************************************************************/

    this.__internal__updateUpgradeContainerVisibility();

    /*************************************************************************
     * UNLOCK WATCHER
     *************************************************************************/

    /*
     * Some mechanics may not yet be available when the automation starts.
     */
    if (!hasAccessToOakItems || !hasAccessToGems || !hasAccessToPurify) {
      this.__internal__setItemUpgradeUnlockWatcher();
    }
  }

  /**
   * @brief Updates the visibility of the whole Auto Upgrade section.
   */
  static __internal__updateUpgradeContainerVisibility() {
    this.__internal__upgradeContainer.hidden =
      this.__internal__oakUpgradeContainer.hidden &&
      this.__internal__gemUpgradeContainer.hidden &&
      this.__internal__purifyContainer.hidden;
  }

  /**
   * @brief Returns whether the Shadow/Purify mechanic is currently available.
   *
   * This uses the same unlock condition as Focus -> Shadow purify.
   */
  static __internal__canUsePurifyChamber() {
    try {
      return (
        typeof pokeballFilterOptions !== "undefined" &&
        pokeballFilterOptions.shadow &&
        pokeballFilterOptions.shadow.canUse()
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * @brief Watches for in-game functionalities to be unlocked.
   *
   * Once unlocked, the corresponding menu/button will be displayed.
   */
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
           * Restore saved state if Auto Purify had already been enabled
           * in a previous session.
           */
          this.__internal__toggleAutoPurify();
        }

        /*********************************************************************
         * MAIN CONTAINER
         *********************************************************************/

        this.__internal__updateUpgradeContainerVisibility();

        /*
         * Once everything is unlocked, the watcher is no longer useful.
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
   * OAK ITEM AUTO UPGRADE
   ***************************************************************************/

  /**
   * @brief Toggles the 'Oak Item Upgrade' feature
   *
   * @param enable [Optional] Force state.
   */
  static __internal__toggleAutoOakUpgrade(enable) {
    /*
     * If we got the click event, use the button status.
     */
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(
          this.Settings.UpgradeOakItems,
        ) === "true";
    }

    if (enable && !this.__internal__oakUpgradeContainer.hidden) {
      /*
       * Only create a loop if none exists.
       */
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
      /*
       * Stop loop.
       */
      clearInterval(this.__internal__autoOakUpgradeLoop);

      this.__internal__autoOakUpgradeLoop = null;
    }
  }

  /***************************************************************************
   * GEM AUTO UPGRADE
   ***************************************************************************/

  /**
   * @brief Toggles the 'Gem Upgrade' feature
   *
   * @param enable [Optional] Force state.
   */
  static __internal__toggleAutoGemUpgrade(enable) {
    if (!App.game.gems.canAccess()) {
      return;
    }

    /*
     * If we got the click event, use the button status.
     */
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.UpgradeGems) ===
        "true";
    }

    if (enable && !this.__internal__gemUpgradeContainer.hidden) {
      /*
       * Only create a loop if none exists.
       */
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
      /*
       * Stop loop.
       */
      clearInterval(this.__internal__autoGemUpgradeLoop);

      this.__internal__autoGemUpgradeLoop = null;
    }
  }

  /***************************************************************************
   * PURIFY CHAMBER AUTO USE
   ***************************************************************************/

  /**
   * @brief Toggles automatic Purify Chamber usage.
   *
   * The automation DOES NOT move the player.
   * It DOES NOT activate the Shadow Purification Focus.
   *
   * It only calls the game's normal purify() method periodically.
   *
   * @param enable [Optional] Force state.
   */
  static __internal__toggleAutoPurify(enable) {
    /*
     * Mechanic isn't unlocked yet.
     */
    if (!this.__internal__canUsePurifyChamber()) {
      return;
    }

    /*
     * If we got the click event, use the stored button state.
     */
    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.AutoPurify) ===
        "true";
    }

    if (enable && !this.__internal__purifyContainer.hidden) {
      /*
       * Only create one loop.
       */
      if (this.__internal__autoPurifyLoop === null) {
        /*
         * Check every second.
         *
         * This is intentionally faster than Oak/Gem upgrade because
         * Purify Chamber Flow can reach its maximum while playing.
         */
        this.__internal__autoPurifyLoop = setInterval(
          this.__internal__purifyLoop.bind(this),

          1000,
        );

        /*
         * Check immediately.
         */
        this.__internal__purifyLoop();
      }
    } else {
      /*
       * Stop loop.
       */
      clearInterval(this.__internal__autoPurifyLoop);

      this.__internal__autoPurifyLoop = null;
    }
  }

  /**
   * @brief Attempts to purify the currently selected Shadow Pokémon.
   *
   * This deliberately uses the exact same core action as
   * Focus -> Shadow purify:
   *
   *     App.game.purifyChamber.purify();
   *
   * PokéClicker itself checks canPurify() before performing the action.
   */
  static __internal__purifyLoop() {
    /*
     * Safety if the mechanic somehow becomes unavailable.
     */
    if (!this.__internal__canUsePurifyChamber()) {
      return;
    }

    /*
     * No extra checks are required here.
     *
     * The game's purify() method handles:
     * - selected Pokémon
     * - Shadow status
     * - required Flow
     */
    App.game.purifyChamber.purify();
  }

  /***************************************************************************
   * OAK ITEM UPGRADE LOOP
   ***************************************************************************/

  /**
   * @brief The Oak item upgrade loop
   *
   * Any Oak item will be upgraded if:
   * - It's unlocked
   * - It's not max-leveled
   * - It has enough experience
   * - The player has enough currency
   */
  static __internal__oakItemUpgradeLoop() {
    if (!App.game.oakItems.canAccess()) {
      return;
    }

    let areAllItemsMaxedOut = true;

    for (const item of App.game.oakItems.itemList) {
      /*
       * Only try to upgrade items that can be upgraded.
       */
      if (item.isUnlocked() && !item.isMaxLevel() && item.hasEnoughExp()) {
        const itemCost = item.calculateCost();

        if (itemCost.amount < App.game.wallet.currencies[itemCost.currency]()) {
          /*
           * We can't use item.isMaxLevel() immediately after buy(),
           * because the game updates asynchronously.
           */
          item.buy();
        }
      }

      areAllItemsMaxedOut &= item.isMaxLevel();
    }

    /*
     * Everything is maxed.
     */
    if (areAllItemsMaxedOut) {
      /*
       * Hide Oak Items.
       */
      this.__internal__oakUpgradeContainer.hiddenForAccessReason = false;

      this.__internal__oakUpgradeContainer.hidden = true;

      /*
       * Update Auto Upgrade visibility.
       */
      this.__internal__updateUpgradeContainerVisibility();

      /*
       * Stop loop.
       */
      this.__internal__toggleAutoOakUpgrade(false);
    }
  }

  /***************************************************************************
   * GEM UPGRADE LOOP
   ***************************************************************************/

  /**
   * @brief The Gem upgrade loop
   *
   * Any Pokémon weakness efficiency will be upgraded if:
   * - It's valid
   * - It's not max-leveled
   * - The player has enough Gems
   */
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
     * Everything is maxed.
     */
    if (areAllGemsMaxedOut) {
      /*
       * Hide Gems.
       */
      this.__internal__gemUpgradeContainer.hiddenForAccessReason = false;

      this.__internal__gemUpgradeContainer.hidden = true;

      /*
       * Update Auto Upgrade visibility.
       */
      this.__internal__updateUpgradeContainerVisibility();

      /*
       * Stop loop.
       */
      this.__internal__toggleAutoGemUpgrade(false);
    }
  }

  /***************************************************************************
   * GEM HELPERS
   ***************************************************************************/

  /**
   * @brief Determines if every type affinity has been maxed-out
   *
   * @returns True if no more upgrades are available, false otherwise
   */
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
