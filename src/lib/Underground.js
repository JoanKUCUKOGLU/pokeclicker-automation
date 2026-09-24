/**
 * @class The AutomationUnderground regroups the 'Mining' functionalities
 *
 * @note The underground is not accessible right away when starting a new game.
 *       This menu will be hidden until the functionality is unlocked in-game.
 */
class AutomationUnderground {
  static Settings = {
    FeatureEnabled: "Mining-Enabled",
    MiningMode: "Mining-Mode",
    SafeBombs: "Mining-SafeBombs",
    AutoSellDiamondTreasures: "Mining-AutoSellDiamondTreasures",
    AutoSellGemPlates: "Mining-AutoSellGemPlates",
  };

  static MiningModes = {
    Standard: "standard",
    XPRush: "xp-rush",
  };

  static initialize(initStep) {
    if (initStep == Automation.InitSteps.BuildMenu) {
      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.MiningMode,
        this.MiningModes.XPRush,
      );

      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.SafeBombs,
        true,
      );

      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.AutoSellDiamondTreasures,
        false,
      );

      Automation.Utils.LocalStorage.setDefaultValue(
        this.Settings.AutoSellGemPlates,
        false,
      );

      this.__internal__buildMenu();
    } else {
      this.toggleAutoMining();
      this.__internal__startAutoSellWatcher();
    }
  }

  static toggleAutoMining(enable) {
    if (!App.game.underground.canAccess()) {
      return;
    }

    if (enable !== true && enable !== false) {
      enable =
        Automation.Utils.LocalStorage.getValue(this.Settings.FeatureEnabled) ===
        "true";
    }

    if (enable) {
      if (!Settings.getSetting("autoRestartUndergroundMine").value) {
        Automation.Notifications.sendWarningNotif(
          "Please consider enabling the ingame 'mine auto restart feature'\n" +
            "If you don't, the automation will be stuck after clearing the current layout",
          "Mining",
        );
      }

      if (this.__internal__autoMiningLoop === null) {
        this.__internal__startMainMiningLoop();
      }
    } else {
      clearInterval(this.__internal__autoMiningLoop);

      this.__internal__autoMiningLoop = null;

      if (this.__internal__innerMiningLoop !== null) {
        clearInterval(this.__internal__innerMiningLoop);

        this.__internal__innerMiningLoop = null;
      }
    }
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__undergroundContainer = null;

  static __internal__autoMiningLoop = null;

  static __internal__innerMiningLoop = null;

  static __internal__autoSellLoop = null;

  static __internal__actionCount = 0;

  static __internal__canUseHammer = false;

  static __internal__canUseChisel = false;

  /************************\
    |*       MODE         *|
    \************************/

  static __internal__getMiningMode() {
    const mode = Automation.Utils.LocalStorage.getValue(
      this.Settings.MiningMode,
    );

    return Object.values(this.MiningModes).includes(mode)
      ? mode
      : this.MiningModes.XPRush;
  }

  static __internal__isXPRushEnabled() {
    return this.__internal__getMiningMode() === this.MiningModes.XPRush;
  }

  static __internal__getMainLoopIntervalMs() {
    return this.__internal__isXPRushEnabled() ? 500 : 10000;
  }

  static __internal__startMainMiningLoop() {
    this.__internal__autoMiningLoop = setInterval(
      this.__internal__miningLoop.bind(this),

      this.__internal__getMainLoopIntervalMs(),
    );

    this.__internal__miningLoop();
  }

  static __internal__restartMiningLoopsForModeChange() {
    if (this.__internal__autoMiningLoop === null) {
      return;
    }

    clearInterval(this.__internal__autoMiningLoop);

    this.__internal__autoMiningLoop = null;

    if (this.__internal__innerMiningLoop !== null) {
      clearInterval(this.__internal__innerMiningLoop);

      this.__internal__innerMiningLoop = null;
    }

    this.__internal__startMainMiningLoop();
  }

  /************************\
    |*        MENU        *|
    \************************/

  static __internal__buildMenu() {
    this.__internal__undergroundContainer = document.createElement("div");

    Automation.Menu.AutomationButtonsDiv.appendChild(
      this.__internal__undergroundContainer,
    );

    Automation.Menu.addSeparator(this.__internal__undergroundContainer);

    if (!App.game.underground.canAccess()) {
      this.__internal__undergroundContainer.hidden = true;

      this.__internal__setUndergroundUnlockWatcher();
    }

    const autoMiningTooltip =
      "Automatically mine in the Underground" +
      Automation.Menu.TooltipSeparator +
      "Standard: keeps the original automation strategy.\n" +
      "XP Rush: prioritizes completing visible treasures, reacts to tools much faster,\n" +
      "keeps bombs safe around visible treasures and aims to fully clear each mine for XP.";

    const miningButton = Automation.Menu.addAutomationButton(
      "Mining",

      this.Settings.FeatureEnabled,

      autoMiningTooltip,

      this.__internal__undergroundContainer,
    );

    miningButton.addEventListener(
      "click",

      this.toggleAutoMining.bind(this),

      false,
    );

    const miningSettingPanel = Automation.Menu.addSettingPanel(
      miningButton.parentElement.parentElement,
    );

    const titleDiv = Automation.Menu.createTitleElement(
      "Mining advanced settings",
    );

    titleDiv.style.marginBottom = "10px";

    miningSettingPanel.appendChild(titleDiv);

    /*************************************************************************
     * MINING MODE
     *************************************************************************/

    const modeLabel = document.createElement("span");

    modeLabel.innerText = "Mining strategy :";

    modeLabel.classList.add("hasAutomationTooltip");

    modeLabel.setAttribute(
      "automation-tooltip-text",

      "Standard keeps the original mining priority. XP Rush prioritizes securing treasures and uses available mining actions as quickly as possible to maximize Underground progression.",
    );

    miningSettingPanel.appendChild(modeLabel);

    const modeSelect =
      Automation.Menu.createDropDownListElement("Mining-Mode-Select");

    modeSelect.style.width = "100%";

    const standardOption = document.createElement("option");

    standardOption.value = this.MiningModes.Standard;

    standardOption.textContent = "Standard";

    modeSelect.options.add(standardOption);

    const xpRushOption = document.createElement("option");

    xpRushOption.value = this.MiningModes.XPRush;

    xpRushOption.textContent = "XP Rush - full clear";

    modeSelect.options.add(xpRushOption);

    modeSelect.value = this.__internal__getMiningMode();

    modeSelect.onchange = function () {
      Automation.Utils.LocalStorage.setValue(
        this.Settings.MiningMode,

        modeSelect.value,
      );

      this.__internal__restartMiningLoopsForModeChange();
    }.bind(this);

    miningSettingPanel.appendChild(modeSelect);

    miningSettingPanel.appendChild(document.createElement("br"));

    miningSettingPanel.appendChild(document.createElement("br"));

    /*************************************************************************
     * SAFE BOMBS
     *************************************************************************/

    const safeBombsTooltip =
      "If enabled, bombs will only be used when no item is visible" +
      Automation.Menu.TooltipSeparator +
      "The bomb has a high destruction rate when hitting a tile\n" +
      "with a visible item. Enable at your own risks.\n" +
      "XP Rush always forces safe bombs while a treasure is partially visible.";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Only use bombs when no item is visible",

      this.Settings.SafeBombs,

      safeBombsTooltip,

      miningSettingPanel,
    );

    /*************************************************************************
     * AUTO SELL DIAMOND
     *************************************************************************/

    const AutoSellDiamondTreasuresTooltip =
      "Automatically sells Underground treasures worth Diamonds after completing a layer";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Automatically sell Diamond treasures",

      this.Settings.AutoSellDiamondTreasures,

      AutoSellDiamondTreasuresTooltip,

      miningSettingPanel,
    );

    /*************************************************************************
     * AUTO SELL PLATES
     *************************************************************************/

    const AutoSellGemPlatesTooltip =
      "Automatically sells Underground Plates for Gems after completing a layer";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Automatically sell Gem Plates",

      this.Settings.AutoSellGemPlates,

      AutoSellGemPlatesTooltip,

      miningSettingPanel,
    );
  }

  /************************\
    |*  UNLOCK WATCHER    *|
    \************************/

  static __internal__setUndergroundUnlockWatcher() {
    let watcher = setInterval(
      function () {
        if (App.game.underground.canAccess()) {
          clearInterval(watcher);

          this.__internal__undergroundContainer.hidden = false;

          this.toggleAutoMining();

          this.__internal__startAutoSellWatcher();
        }
      }.bind(this),

      10000,
    );
  }

  /************************\
    |*     MAIN LOOP      *|
    \************************/

  static __internal__miningLoop() {
    if (
      this.__internal__innerMiningLoop !== null ||
      App.game.underground.mine.timeUntilDiscovery > 0
    ) {
      return;
    }

    this.__internal__actionCount = 0;

    this.__internal__innerMiningLoop = setInterval(
      function () {
        if (
          this.__internal__autoMiningLoop == null ||
          !this.__internal__tryUseOneMiningItem()
        ) {
          /*
           * Standard keeps the original notification.
           *
           * XP Rush can wake up every 500 ms, so notifications
           * are disabled there to avoid toast spam.
           */
          if (
            this.__internal__actionCount > 0 &&
            !this.__internal__isXPRushEnabled()
          ) {
            Automation.Notifications.sendNotif(
              `Performed mining actions ${this.__internal__actionCount.toString()} times!`,

              "Mining",
            );
          }

          clearInterval(this.__internal__innerMiningLoop);

          this.__internal__innerMiningLoop = null;
        }
      }.bind(this),

      this.__internal__isXPRushEnabled() ? 50 : 100,
    );
  }

  /************************\
    |*   ACTION ROUTER    *|
    \************************/

  static __internal__tryUseOneMiningItem() {
    if (this.__internal__isXPRushEnabled()) {
      return this.__internal__tryUseOneMiningItemXPRush();
    }

    return this.__internal__tryUseOneMiningItemStandard();
  }

  /************************\
    |*    STANDARD MODE   *|
    \************************/

  static __internal__tryUseOneMiningItemStandard() {
    let actionOccured = false;

    const mine = App.game.underground.mine;

    const centerMostCellCoord = {
      x: mine.width / 2,

      y: mine.height / 2,
    };

    const areAllItemFound = mine.itemsPartiallyFound == mine.itemsBuried;

    /*************************************************************************
     * SURVEY
     *************************************************************************/

    if (
      !areAllItemFound &&
      App.game.underground.tools
        .getTool(UndergroundToolType.Survey)
        .canUseTool()
    ) {
      App.game.underground.tools.useTool(
        UndergroundToolType.Survey,

        centerMostCellCoord.x,

        centerMostCellCoord.y,
      );

      actionOccured = true;
    }

    /*************************************************************************
     * CELL BATTERY
     *************************************************************************/

    if (
      !actionOccured &&
      App.game.oakItems.isActive(OakItemType.Cell_Battery) &&
      App.game.underground.battery.charges ==
        App.game.underground.battery.maxCharges
    ) {
      App.game.underground.battery.discharge();

      actionOccured = true;
    }

    /*************************************************************************
     * BOMB
     *************************************************************************/

    const bombTool = App.game.underground.tools.getTool(
      UndergroundToolType.Bomb,
    );

    if (
      !actionOccured &&
      (!areAllItemFound ||
        (bombTool.restoreRate > 0 && bombTool.durability == 1)) &&
      bombTool.canUseTool() &&
      this.__internal__isBombSafeToUse()
    ) {
      App.game.underground.tools.useTool(
        UndergroundToolType.Bomb,

        centerMostCellCoord.x,

        centerMostCellCoord.y,
      );

      actionOccured = true;
    }

    /*************************************************************************
     * HAMMER / CHISEL
     *************************************************************************/

    this.__internal__refreshUsableDiggingTools();

    if (
      !actionOccured &&
      (this.__internal__canUseHammer || this.__internal__canUseChisel)
    ) {
      actionOccured =
        this.__internal__tryUseBestToolOnPartiallyFoundItem() ||
        this.__internal__tryUseBestToolToFindNewItem();
    }

    if (actionOccured) {
      this.__internal__actionCount++;
    }

    return actionOccured;
  }

  /************************\
    |*      XP RUSH       *|
    \************************/

  static __internal__tryUseOneMiningItemXPRush() {
    let actionOccured = false;

    const mine = App.game.underground.mine;

    if (!mine || mine.timeUntilDiscovery > 0) {
      return false;
    }

    const centerMostCellCoord = {
      x: mine.width / 2,

      y: mine.height / 2,
    };

    /*
     * itemsPartiallyFound:
     * at least one cell of the reward is visible.
     *
     * itemsFound:
     * reward fully uncovered / collected.
     */
    const areAllItemsLocated = mine.itemsPartiallyFound == mine.itemsBuried;

    const hasPartiallyRevealedItem = mine.itemsPartiallyFound > mine.itemsFound;

    this.__internal__refreshUsableDiggingTools();

    /*************************************************************************
     * 1. COMPLETE AN ALREADY VISIBLE TREASURE
     *
     * The first priority in XP Rush is securing a treasure that has already
     * been discovered.
     *************************************************************************/

    if (
      hasPartiallyRevealedItem &&
      (this.__internal__canUseHammer || this.__internal__canUseChisel)
    ) {
      actionOccured = this.__internal__tryUseBestToolOnPartiallyFoundItem();
    }

    /*************************************************************************
     * 2. SURVEY
     *************************************************************************/

    if (
      !actionOccured &&
      !areAllItemsLocated &&
      App.game.underground.tools
        .getTool(UndergroundToolType.Survey)
        .canUseTool()
    ) {
      App.game.underground.tools.useTool(
        UndergroundToolType.Survey,

        centerMostCellCoord.x,

        centerMostCellCoord.y,
      );

      actionOccured = true;
    }

    /*************************************************************************
     * 3. CELL BATTERY
     *************************************************************************/

    if (
      !actionOccured &&
      App.game.oakItems.isActive(OakItemType.Cell_Battery) &&
      App.game.underground.battery.charges ==
        App.game.underground.battery.maxCharges
    ) {
      App.game.underground.battery.discharge();

      actionOccured = true;
    }

    /*************************************************************************
     * 4. SAFE BOMB
     *
     * In XP Rush, bombs will NEVER be used while there is an incomplete
     * visible treasure. This is forced even if SafeBombs is disabled.
     *************************************************************************/

    const bombTool = App.game.underground.tools.getTool(
      UndergroundToolType.Bomb,
    );

    if (
      !actionOccured &&
      !areAllItemsLocated &&
      bombTool.canUseTool() &&
      this.__internal__isBombSafeToUse(true)
    ) {
      App.game.underground.tools.useTool(
        UndergroundToolType.Bomb,

        centerMostCellCoord.x,

        centerMostCellCoord.y,
      );

      actionOccured = true;
    }

    /*************************************************************************
     * 5. HAMMER / CHISEL
     *************************************************************************/

    if (!actionOccured) {
      this.__internal__refreshUsableDiggingTools();

      if (this.__internal__canUseHammer || this.__internal__canUseChisel) {
        /*
         * Still prefer completing a known treasure,
         * then search the grid for another one.
         */
        actionOccured =
          this.__internal__tryUseBestToolOnPartiallyFoundItem() ||
          this.__internal__tryUseBestToolToFindNewItem();
      }
    }

    if (actionOccured) {
      this.__internal__actionCount++;
    }

    return actionOccured;
  }

  /************************\
    |*     TOOL STATE     *|
    \************************/

  static __internal__refreshUsableDiggingTools() {
    this.__internal__canUseHammer = App.game.underground.tools
      .getTool(UndergroundToolType.Hammer)
      .canUseTool();

    this.__internal__canUseChisel = App.game.underground.tools
      .getTool(UndergroundToolType.Chisel)
      .canUseTool();
  }

  /************************\
    |*  PARTIAL TREASURE  *|
    \************************/

  static __internal__tryUseBestToolOnPartiallyFoundItem() {
    if (
      App.game.underground.mine.itemsPartiallyFound ==
      App.game.underground.mine.itemsFound
    ) {
      return false;
    }

    let selectedBestMove = null;

    for (const itemData of this.__internal__getPartiallyRevealedItems()) {
      selectedBestMove = this.__internal__selectBestMove(
        selectedBestMove,

        this.__internal__getPartiallyRevealedItemBestMove(itemData),
      );
    }

    if (selectedBestMove == null) {
      return false;
    }

    App.game.underground.tools.useTool(
      selectedBestMove.tool,

      selectedBestMove.coord.x,

      selectedBestMove.coord.y,
    );

    return true;
  }

  /************************\
    |*   HIDDEN TREASURE  *|
    \************************/

  static __internal__tryUseBestToolToFindNewItem() {
    let selectedBestMove = null;

    for (const index of App.game.underground.mine.grid.keys()) {
      selectedBestMove = this.__internal__selectBestMove(
        selectedBestMove,

        this.__internal__getHiddenItemBestMove(index),
      );
    }

    if (selectedBestMove == null) {
      return false;
    }

    App.game.underground.tools.useTool(
      selectedBestMove.tool,

      selectedBestMove.coord.x,

      selectedBestMove.coord.y,
    );

    return true;
  }

  /************************\
    |* PARTIAL BEST MOVE  *|
    \************************/

  static __internal__getPartiallyRevealedItemBestMove(itemData) {
    let selectedBestMove = null;

    for (const itemCell of itemData.cells) {
      if (
        itemCell.isRevealed ||
        !this.__internal__cellHasVisibleNeighborWithTheSameItem(
          itemData,

          itemCell,
        )
      ) {
        continue;
      }

      if (this.__internal__canUseHammer) {
        selectedBestMove = this.__internal__selectBestMove(
          selectedBestMove,

          this.__internal__getHammerUseEfficiency(
            itemData,

            itemCell,
          ),
        );
      }

      if (
        !this.__internal__canUseChisel ||
        (selectedBestMove != null && selectedBestMove.efficiency >= 2)
      ) {
        continue;
      }

      const chiselMove = {
        tool: UndergroundToolType.Chisel,

        efficiency: Math.min(
          itemCell.cell.layerDepth,

          2,
        ),

        coord: itemCell.coord,
      };

      selectedBestMove = this.__internal__selectBestMove(
        selectedBestMove,

        chiselMove,
      );
    }

    return selectedBestMove;
  }

  /************************\
    |* HIDDEN BEST MOVE   *|
    \************************/

  static __internal__getHiddenItemBestMove(index) {
    let selectedBestMove = null;

    if (this.__internal__canUseHammer) {
      selectedBestMove = this.__internal__selectBestMove(
        selectedBestMove,

        this.__internal__getHammerRevealEfficiency(index),
      );
    }

    if (
      !this.__internal__canUseChisel ||
      (selectedBestMove != null && selectedBestMove.efficiency >= 2)
    ) {
      return selectedBestMove;
    }

    const cell = App.game.underground.mine.grid[index];

    if (cell.layerDepth == 0) {
      return selectedBestMove;
    }

    const chiselMove = {
      tool: UndergroundToolType.Chisel,

      efficiency: Math.min(
        cell.layerDepth,

        2,
      ),

      revealCount: cell.layerDepth <= 2 && cell.layerDepth != 0 ? 1 : 0,

      coord: App.game.underground.mine.getCoordinateForGridIndex(index),

      visibleNeighborCount: this.__internal__getCellVisibleNeighborCount(index),
    };

    return this.__internal__selectBestMove(
      selectedBestMove,

      chiselMove,
    );
  }

  /************************\
    |*       ITEMS        *|
    \************************/

  static __internal__getPartiallyRevealedItems() {
    let result = [];

    for (const itemData of this.__internal__getAllItems().values()) {
      if (
        !itemData.cells[0].cell.reward.rewarded &&
        itemData.cells.some((cell) => cell.isRevealed)
      ) {
        result.push(itemData);
      }
    }

    return result;
  }

  static __internal__getAllItems() {
    let items = new Map();

    for (const [index, cell] of App.game.underground.mine.grid.entries()) {
      if (cell.reward == undefined) {
        continue;
      }

      if (!items.has(cell.reward.rewardID)) {
        items.set(
          cell.reward.rewardID,

          {
            cells: [],
          },
        );
      }

      const cellData = items.get(cell.reward.rewardID);

      cellData.cells.push({
        cell,

        coord: App.game.underground.mine.getCoordinateForGridIndex(index),

        isRevealed: cell.layerDepth === 0,
      });
    }

    return items;
  }

  /************************\
    |*  SELECT BEST MOVE  *|
    \************************/

  static __internal__selectBestMove(
    currentBestMove,

    candidate,
  ) {
    if (candidate == null) {
      return currentBestMove;
    }

    if (currentBestMove == null) {
      return candidate;
    }

    if (
      candidate.revealCount != undefined &&
      candidate.revealCount > currentBestMove.revealCount
    ) {
      return candidate;
    } else if (
      candidate.revealCount != undefined &&
      candidate.revealCount < currentBestMove.revealCount
    ) {
      return currentBestMove;
    }

    if (candidate.efficiency > currentBestMove.efficiency) {
      return candidate;
    }

    if (
      candidate.efficiency == currentBestMove.efficiency &&
      candidate.tool == UndergroundToolType.Hammer
    ) {
      return candidate;
    }

    if (
      candidate.visibleNeighborCount == undefined ||
      currentBestMove.visibleNeighborCount == undefined
    ) {
      return currentBestMove;
    }

    const candidateUseNeededToReveal =
      this.__internal__getChiselUseNeededToRevealAtCoord(candidate.coord);

    const currentBestMoveUseNeededToReveal =
      this.__internal__getChiselUseNeededToRevealAtCoord(currentBestMove.coord);

    if (candidateUseNeededToReveal < currentBestMoveUseNeededToReveal) {
      return candidate;
    }

    if (candidate.visibleNeighborCount < currentBestMove.visibleNeighborCount) {
      return candidate;
    }

    return currentBestMove;
  }

  /************************\
    |*   ITEM NEIGHBOR    *|
    \************************/

  static __internal__cellHasVisibleNeighborWithTheSameItem(
    itemData,

    cell,
  ) {
    for (const cellCandidate of itemData.cells) {
      if (!cellCandidate.isRevealed) {
        continue;
      }

      const xDistance = Math.abs(cellCandidate.coord.x - cell.coord.x);

      const yDistance = Math.abs(cellCandidate.coord.y - cell.coord.y);

      if (xDistance + yDistance == 1) {
        return true;
      }
    }

    return false;
  }

  /************************\
    |* VISIBLE NEIGHBORS  *|
    \************************/

  static __internal__getCellVisibleNeighborCount(index) {
    let visibleNeighborCount = 0;

    for (const offset of [
      -App.game.underground.mine.width,

      -1,

      1,

      App.game.underground.mine.width,
    ]) {
      const neighborIndex = index + offset;

      if (
        neighborIndex < 0 ||
        neighborIndex >= App.game.underground.mine.grid.length
      ) {
        continue;
      }

      if (App.game.underground.mine.grid[neighborIndex].layerDepth == 0) {
        visibleNeighborCount++;
      }
    }

    const coord = App.game.underground.mine.getCoordinateForGridIndex(index);

    if (coord.x == 0 || coord.x == App.game.underground.mine.width - 1) {
      visibleNeighborCount++;
    }

    if (coord.y == 0 || coord.y == App.game.underground.mine.height - 1) {
      visibleNeighborCount++;
    }

    return visibleNeighborCount;
  }

  /************************\
    |* HAMMER ON TREASURE *|
    \************************/

  static __internal__getHammerUseEfficiency(
    itemData,

    cell,
  ) {
    let efficiency = 0;

    for (const cellCandidate of itemData.cells) {
      if (cellCandidate.isRevealed) {
        continue;
      }

      const xDistance = Math.abs(cellCandidate.coord.x - cell.coord.x);

      const yDistance = Math.abs(cellCandidate.coord.y - cell.coord.y);

      if (xDistance + yDistance <= 1) {
        efficiency++;
      }
    }

    return {
      tool: UndergroundToolType.Hammer,

      efficiency,

      coord: cell.coord,
    };
  }

  /************************\
    |* HAMMER FOR SEARCH  *|
    \************************/

  static __internal__getHammerRevealEfficiency(index) {
    const coord = App.game.underground.mine.getCoordinateForGridIndex(index);

    const isBorderCell =
      coord.x == 0 ||
      coord.x == App.game.underground.mine.width - 1 ||
      coord.y == 0 ||
      coord.y == App.game.underground.mine.height - 1;

    if (isBorderCell) {
      return null;
    }

    const currentCell = App.game.underground.mine.grid[index];

    let efficiency = currentCell.layerDepth >= 1 ? 1 : 0;

    let revealCount = currentCell.layerDepth == 1 ? 1 : 0;

    for (const offset of [
      -(App.game.underground.mine.width - 1),

      -App.game.underground.mine.width,

      -(App.game.underground.mine.width + 1),

      -1,

      1,

      App.game.underground.mine.width - 1,

      App.game.underground.mine.width,

      App.game.underground.mine.width + 1,
    ]) {
      const cell = App.game.underground.mine.grid[index + offset];

      if (cell.layerDepth >= 1) {
        efficiency++;
      }

      if (cell.layerDepth == 1) {
        revealCount++;
      }
    }

    return {
      tool: UndergroundToolType.Hammer,

      efficiency,

      revealCount,

      coord,
    };
  }

  /************************\
    |*  CHISEL REVEAL     *|
    \************************/

  static __internal__getChiselUseNeededToRevealAtCoord(coord) {
    const index = App.game.underground.mine.getGridIndexForCoordinate(coord);

    const cell = App.game.underground.mine.grid[index];

    return Math.floor(cell.layerDepth / 2) + (cell.layerDepth % 2);
  }

  /************************\
    |*     SAFE BOMB      *|
    \************************/

  static __internal__isBombSafeToUse(forceSafe = false) {
    const noVisibleIncompleteItem =
      App.game.underground.mine?.itemsPartiallyFound -
        App.game.underground.mine?.itemsFound ==
      0;

    if (forceSafe) {
      return noVisibleIncompleteItem;
    }

    return (
      Automation.Utils.LocalStorage.getValue(this.Settings.SafeBombs) !==
        "true" || noVisibleIncompleteItem
    );
  }

  /************************\
    |*     AUTO SELL      *|
    \************************/

  static __internal__startAutoSellWatcher() {
    if (!App.game.underground.canAccess()) {
      return;
    }

    if (this.__internal__autoSellLoop !== null) {
      return;
    }

    this.__internal__autoSellTick();

    this.__internal__autoSellLoop = setInterval(
      this.__internal__autoSellTick.bind(this),

      1000,
    );
  }

  static __internal__autoSellTick() {
    try {
      const sellDiamondTreasures =
        Automation.Utils.LocalStorage.getValue(
          this.Settings.AutoSellDiamondTreasures,
        ) === "true";

      const sellGemPlates =
        Automation.Utils.LocalStorage.getValue(
          this.Settings.AutoSellGemPlates,
        ) === "true";

      if (sellDiamondTreasures) {
        this.__internal__sellUndergroundItemsByType(
          UndergroundItemValueType.Diamond,

          "Diamond treasures",
        );
      }

      if (sellGemPlates) {
        this.__internal__sellUndergroundItemsByType(
          UndergroundItemValueType.Gem,

          "Gem Plates",
        );
      }
    } catch (error) {
      console.error(
        "[Pokeclicker Automation] Auto Sell Underground error:",

        error,
      );
    }
  }

  static __internal__sellUndergroundItemsByType(
    valueType,

    label,
  ) {
    let soldCount = 0;

    const items = UndergroundItems.list.filter(
      (item) => item.valueType === valueType,
    );

    for (const item of items) {
      try {
        if (!player.itemList[item.itemName]) {
          continue;
        }

        const amountBefore = player.itemList[item.itemName]();

        if (amountBefore <= 0) {
          continue;
        }

        if (typeof item.sellLocked === "function" && item.sellLocked()) {
          continue;
        }

        UndergroundController.sellMineItem(
          item,

          amountBefore,
        );

        const amountAfter = player.itemList[item.itemName]();

        soldCount += amountBefore - amountAfter;
      } catch (error) {
        console.error(
          `[Pokeclicker Automation] Failed to sell ${item.itemName}:`,

          error,
        );
      }
    }

    if (soldCount > 0) {
      Automation.Notifications.sendNotif(
        `Automatically sold ${soldCount} ${label}!`,

        "Mining",
      );
    }
  }
}
