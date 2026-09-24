/**
 * @class The AutomationFocusRoamers regroups the 'Focus on' button's Roamer hunting functionalities.
 *
 * The fast search mode alternates between two unlocked routes from the same
 * roaming sub-region group. PokéClicker generates a fresh wild encounter when
 * moving to another route, so normal encounters can be skipped without waiting
 * for them to be defeated.
 */
class AutomationFocusRoamers {
  /******************************************************************************\
    |***    Focus specific members, should only be used by focus sub-classes    ***|
    \******************************************************************************/

  /**
   * Adds the Roamer focus to the 'Focus on' list.
   *
   * @param {Array} functionalitiesList The list to add the functionality to.
   */
  static __registerFunctionalities(functionalitiesList) {
    functionalitiesList.push({
      id: "Roamers",
      name: "Roamers",
      tooltip:
        "Hunts roaming Pokémon by rapidly alternating between two routes" +
        Automation.Menu.TooltipSeparator +
        "A new wild encounter is generated on every route change.\n" +
        "The route with the x3 roaming bonus is used whenever it is unlocked.\n" +
        "The hunt pauses immediately when a wanted roamer appears, catches it,\n" +
        "then resumes until no target remains in the current roaming group.",
      run: function () {
        this.__internal__start();
      }.bind(this),
      stop: function () {
        this.__internal__stop();
      }.bind(this),
      refreshRateAsMs: Automation.Focus.__noFunctionalityRefresh,
    });
  }

  /**
   * Builds the Roamer advanced settings tab.
   *
   * @param {Element} parent The parent div to add the settings to.
   */
  static __buildAdvancedSettings(parent) {
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.HuntMode,
      this.__internal__huntModes.NewOnly,
    );

    const container = document.createElement("div");
    container.style.paddingLeft = "10px";
    container.style.paddingRight = "10px";
    container.style.textAlign = "left";

    const label = document.createElement("span");
    label.innerText = "Roamer hunting mode :";
    label.classList.add("hasAutomationTooltip");
    label.setAttribute(
      "automation-tooltip-text",
      "New roamers only: stops targeting a roamer once it has been caught." +
        Automation.Menu.TooltipSeparator +
        "PKRS: hunts uncaught roamers and already-caught roamers that are Contagious, until they become Resistant.",
    );
    container.appendChild(label);

    const select = Automation.Menu.createDropDownListElement(
      "Focus-Roamers-HuntMode-Select",
    );
    select.style.width = "100%";

    const newOnlyOption = document.createElement("option");
    newOnlyOption.value = this.__internal__huntModes.NewOnly;
    newOnlyOption.textContent = "New roamers only";
    select.options.add(newOnlyOption);

    const pokerusOption = document.createElement("option");
    pokerusOption.value = this.__internal__huntModes.Pokerus;
    pokerusOption.textContent = "New + PKRS (Contagious → Resistant)";
    select.options.add(pokerusOption);

    const storedMode = Automation.Utils.LocalStorage.getValue(
      this.__internal__advancedSettings.HuntMode,
    );

    select.value = Object.values(this.__internal__huntModes).includes(
      storedMode,
    )
      ? storedMode
      : this.__internal__huntModes.NewOnly;

    select.onchange = function () {
      Automation.Utils.LocalStorage.setValue(
        this.__internal__advancedSettings.HuntMode,
        select.value,
      );
    }.bind(this);

    container.appendChild(select);
    parent.appendChild(container);
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__advancedSettings = {
    HuntMode: "Focus-Roamers-HuntMode",
  };

  static __internal__huntModes = {
    NewOnly: "new",
    Pokerus: "pokerus",
  };

  static __internal__loop = null;

  // Speed of the route-bounce state machine.
  static __internal__loopIntervalMs = 50;

  static __internal__primaryRoute = null;
  static __internal__secondaryRoute = null;

  static __internal__region = null;
  static __internal__subRegionGroup = null;

  static __internal__lastEnemy = null;
  static __internal__lockedEnemy = null;
  static __internal__lockedTargetName = null;

  static __internal__captureFilterEnabled = false;
  static __internal__singleRouteFallback = false;

  /**
   * Starts Roamer focus.
   */
  static __internal__start() {
    if (this.__internal__loop !== null) {
      return;
    }

    if (!Automation.Focus.__ensureNoInstanceIsInProgress()) {
      return;
    }

    const mode = this.__internal__getHuntMode();

    if (
      mode === this.__internal__huntModes.Pokerus &&
      !App.game.keyItems.hasKeyItem(KeyItemType.Pokerus_virus)
    ) {
      Automation.Notifications.sendWarningNotif(
        "PKRS Roamer hunting requires the Pokérus Virus key item.\nTurning the feature off",
        "Focus - Roamers",
      );

      this.__internal__disableFocus();
      return;
    }

    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();
      return;
    }

    if (!this.__internal__refreshRoutePlan(true)) {
      return;
    }

    const targets = this.__internal__getTargets();

    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();
      return;
    }

    /*
     * We disable normal auto-click while searching.
     *
     * The entire point of this system is to switch route before spending time
     * killing normal Pokémon.
     */
    const disableReason = "The 'Focus on Roamers' feature is enabled";

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      true,
      disableReason,
    );

    /*
     * If only one route is available, route bouncing isn't possible, so we
     * automatically fall back to regular kills.
     */
    Automation.Click.toggleAutoClick(this.__internal__singleRouteFallback);

    /*
     * Disable Poké Ball automation while searching.
     *
     * Otherwise normal Pokémon encountered during the 1-1 bounce could consume
     * Poké Balls.
     */
    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    this.__internal__lastEnemy = null;
    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    /*
     * Start on the best route.
     *
     * Moving to it immediately generates a fresh enemy if we weren't already
     * standing on it.
     */
    Automation.Utils.Route.moveToRoute(
      this.__internal__primaryRoute.number,
      this.__internal__region,
    );

    /*
     * Own loop instead of the normal Focus refresh because we need to react very
     * quickly after an encounter is generated.
     */
    this.__internal__loop = setInterval(
      this.__internal__tick.bind(this),
      this.__internal__loopIntervalMs,
    );

    /*
     * Process immediately too.
     */
    this.__internal__tick();
  }

  /**
   * Stops Roamer focus and restores the shared automation state.
   */
  static __internal__stop() {
    clearInterval(this.__internal__loop);
    this.__internal__loop = null;

    this.__internal__disableCaptureFilter();

    /*
     * Restore the user's persisted Auto Attack setting.
     *
     * Calling this without an argument reads the actual automation setting.
     */
    Automation.Click.toggleAutoClick();

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      false,
    );

    this.__internal__primaryRoute = null;
    this.__internal__secondaryRoute = null;

    this.__internal__region = null;
    this.__internal__subRegionGroup = null;

    this.__internal__lastEnemy = null;
    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    this.__internal__singleRouteFallback = false;
  }

  /**
   * Main state machine.
   *
   * Runs every 50 ms.
   */
  static __internal__tick() {
    /*
     * Don't interfere with Gyms / Dungeons / Battle Frontier / etc.
     */
    if (Automation.Utils.isInInstanceState()) {
      Automation.Focus.__ensureNoInstanceIsInProgress();
      return;
    }

    /*
     * Never change route during the catch animation.
     *
     * PokéClicker's route movement already refuses to generate another enemy
     * while Battle.catching() is true, but checking it here makes the state
     * machine safer.
     */
    if (Battle.catching()) {
      return;
    }

    /*
     * Recalculate the route plan.
     *
     * This handles:
     * - manually entering another roaming sub-region group
     * - the ×3 Roamer route changing
     */
    if (!this.__internal__refreshRoutePlan(false)) {
      return;
    }

    let targets = this.__internal__getTargets();

    /*
     * Nothing left to hunt.
     */
    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();
      return;
    }

    const enemy = Battle.enemyPokemon();

    /*
     * Rare fallback where no BattlePokemon currently exists.
     */
    if (!enemy) {
      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,
        this.__internal__region,
      );

      return;
    }

    /*******************\
      |* Target locked *|
      \*******************/

    if (this.__internal__lockedEnemy !== null) {
      /*
       * We're still fighting/catching the same Roamer.
       *
       * Absolutely do not route-switch.
       */
      if (enemy === this.__internal__lockedEnemy) {
        Automation.Click.toggleAutoClick(true);
        return;
      }

      /*
       * The enemy changed.
       *
       * Therefore the Roamer battle/capture finished.
       */
      this.__internal__lockedEnemy = null;
      this.__internal__lockedTargetName = null;

      this.__internal__disableCaptureFilter();

      /*
       * If we only have one usable route, keep attacking.
       * Otherwise return to route-bounce mode.
       */
      Automation.Click.toggleAutoClick(this.__internal__singleRouteFallback);

      /*
       * Re-evaluate targets.
       *
       * Important for PKRS:
       * the caught Roamer may have become Resistant and therefore no longer
       * needs to be targeted.
       */
      targets = this.__internal__getTargets();

      if (targets.length === 0) {
        this.__internal__stopBecauseComplete();
        return;
      }

      /*
       * The newly generated enemy must be considered fresh.
       */
      this.__internal__lastEnemy = null;
    }

    /*
     * Never process the exact same BattlePokemon twice.
     */
    if (enemy === this.__internal__lastEnemy) {
      return;
    }

    this.__internal__lastEnemy = enemy;

    const targetNames = new Set(targets.map((data) => data.pokemon.name));

    /*
     * Wanted Roamer detected.
     *
     * Roamer species are not part of the normal route encounter table, so using
     * the currently available target list is enough to identify the wanted
     * encounter.
     */
    if (targetNames.has(enemy.name)) {
      this.__internal__lockTarget(enemy);
      return;
    }

    /**********************\
      |* Normal encounter *|
      \**********************/

    /*
     * Don't use Poké Balls on regular Pokémon while searching.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Only one usable route in the roaming group.
     *
     * We cannot do route bouncing, so kill normally until another encounter is
     * generated.
     */
    if (this.__internal__secondaryRoute === null) {
      this.__internal__singleRouteFallback = true;

      Automation.Click.toggleAutoClick(true);

      return;
    }

    /*
     * TRUE 1-1 MODE
     *
     * Exactly one generated encounter on the current route, then immediately
     * switch to the other route.
     *
     * The two routes stay inside the same roaming group.
     */
    Automation.Click.toggleAutoClick(false);

    const nextRoute =
      player.route === this.__internal__primaryRoute.number
        ? this.__internal__secondaryRoute
        : this.__internal__primaryRoute;

    /*
     * Changing route asks PokéClicker to generate a brand-new wild encounter.
     */
    Automation.Utils.Route.moveToRoute(
      nextRoute.number,
      this.__internal__region,
    );

    /*
     * The new BattlePokemon is generated synchronously.
     *
     * Check it immediately instead of waiting 50 ms for the next tick. This
     * prevents a very strong party or another system from potentially skipping
     * the target before we lock onto it.
     */
    this.__internal__lockGeneratedTargetImmediately();
  }

  /**
   * Checks the newly generated encounter immediately after a route switch.
   */
  static __internal__lockGeneratedTargetImmediately() {
    if (Battle.catching() || this.__internal__lockedEnemy !== null) {
      return;
    }

    const enemy = Battle.enemyPokemon();

    if (!enemy || enemy === this.__internal__lastEnemy) {
      return;
    }

    const targetNames = new Set(
      this.__internal__getTargets().map((data) => data.pokemon.name),
    );

    /*
     * Regular encounter.
     *
     * Leave it there until next tick, where another route switch will happen.
     */
    if (!targetNames.has(enemy.name)) {
      return;
    }

    /*
     * Target found.
     */
    this.__internal__lastEnemy = enemy;

    this.__internal__lockTarget(enemy);
  }

  /**
   * Locks a wanted Roamer encounter.
   *
   * Route bouncing is suspended until this BattlePokemon disappears.
   *
   * @param {BattlePokemon} enemy
   */
  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    /*
     * Ensure we still have the ball chosen in Focus settings.
     */
    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();
      return;
    }

    this.__internal__lockedEnemy = enemy;
    this.__internal__lockedTargetName = enemy.name;

    /*
     * Enable a temporary Poké Ball filter ONLY while fighting the wanted
     * Roamer.
     */
    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

    /*
     * Stop route bouncing and kill the Roamer as quickly as possible.
     */
    Automation.Click.toggleAutoClick(true);
  }

  /**
   * Removes the temporary capture filter.
   */
  static __internal__disableCaptureFilter() {
    if (!this.__internal__captureFilterEnabled) {
      return;
    }

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;
  }

  /**
   * Gets the Poké Ball selected in the global Focus settings.
   */
  static __internal__getSelectedPokeball() {
    return parseInt(
      Automation.Utils.LocalStorage.getValue(
        Automation.Focus.Settings.BallToUseToCatch,
      ),
    );
  }

  /**
   * Returns the configured Roamer hunt mode.
   */
  static __internal__getHuntMode() {
    const mode = Automation.Utils.LocalStorage.getValue(
      this.__internal__advancedSettings.HuntMode,
    );

    return Object.values(this.__internal__huntModes).includes(mode)
      ? mode
      : this.__internal__huntModes.NewOnly;
  }

  /**
   * Gets all roamers from the currently tracked roaming group.
   */
  static __internal__getRoamers() {
    if (
      this.__internal__region === null ||
      this.__internal__subRegionGroup === null
    ) {
      return [];
    }

    return RoamingPokemonList.getSubRegionalGroupRoamers(
      this.__internal__region,
      this.__internal__subRegionGroup,
    );
  }

  /**
   * Returns all Roamers that are still valid targets.
   *
   * NEW ONLY:
   *   Target until captured once.
   *
   * PKRS:
   *   - Uncaught Pokémon = target
   *   - Contagious Pokémon = target
   *   - Resistant Pokémon = complete
   *   - None / Infected = ignored
   *
   * None / Infected are ignored because catching another copy cannot award
   * useful EV progress until the Pokémon is Contagious.
   */
  static __internal__getTargets() {
    const roamers = this.__internal__getRoamers();

    const mode = this.__internal__getHuntMode();

    /*
     * PKRS hunting mode.
     */
    if (mode === this.__internal__huntModes.Pokerus) {
      return roamers.filter((data) => {
        /*
         * Still never caught.
         */
        if (!App.game.party.alreadyCaughtPokemonByName(data.pokemon.name)) {
          return true;
        }

        const partyPokemon = App.game.party.getPokemonByName(data.pokemon.name);

        /*
         * Only Contagious Pokémon need repeated captures.
         */
        return partyPokemon?.pokerus === GameConstants.Pokerus.Contagious;
      });
    }

    /*
     * New-only hunting mode.
     */
    return roamers.filter(
      (data) => !App.game.party.alreadyCaughtPokemonByName(data.pokemon.name),
    );
  }

  /**
   * Rebuilds the primary and secondary route plan.
   *
   * PRIMARY ROUTE:
   *
   *   ×3 Roamer route if unlocked
   *
   * otherwise:
   *
   *   highest-rate unlocked route from the current roaming group
   *
   *
   * SECONDARY ROUTE:
   *
   *   best other unlocked route from the exact same roaming group
   *
   *
   * @param {boolean} force
   * @returns {boolean}
   */
  static __internal__refreshRoutePlan(force) {
    const region = player.region;

    const group = RoamingPokemonList.findGroup(region, player.subregion);

    const roamers = RoamingPokemonList.getSubRegionalGroupRoamers(
      region,
      group,
    );

    /*
     * There aren't any roamers here.
     */
    if (!roamers?.length) {
      Automation.Notifications.sendWarningNotif(
        "There are no roaming Pokémon in the current sub-region group.\nTurning the feature off",
        "Focus - Roamers",
      );

      this.__internal__disableFocus();

      return false;
    }

    /*
     * Obtain the current ×3 roaming route.
     */
    const boostedRoute =
      RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(
        region,
        group,
      )?.();

    /*
     * Determine which subregions belong to the same Roamer group.
     */
    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,
      group,
    );

    /*
     * Get every route belonging to that roaming group.
     */
    const allGroupRoutes = Routes.getRoutesByRegion(region).filter((route) =>
      groupSubRegions.includes(route.subRegion || 0),
    );

    /*
     * Keep only routes we can currently enter.
     */
    const unlockedRoutes = allGroupRoutes.filter((route) =>
      Automation.Utils.Route.canMoveToRoute(route.number, region, route),
    );

    if (unlockedRoutes.length === 0) {
      Automation.Notifications.sendWarningNotif(
        "No unlocked route is available for the current roaming group.\nTurning the feature off",
        "Focus - Roamers",
      );

      this.__internal__disableFocus();

      return false;
    }

    /*
     * PokéClicker's Roamer chance improves on later routes in the ordered route
     * list, so the final unlocked route is our best normal candidate.
     */
    const bestUnlockedRoute = unlockedRoutes[unlockedRoutes.length - 1];

    /*
     * Check whether the boosted ×3 route is itself unlocked.
     */
    const boostedUnlocked = boostedRoute
      ? unlockedRoutes.find((route) => route.number === boostedRoute.number)
      : null;

    /*
     * ×3 route always wins when available.
     */
    const newPrimary = boostedUnlocked ?? bestUnlockedRoute;

    /*
     * Best different route for the second half of our 1-1 bounce.
     */
    const secondaryCandidates = unlockedRoutes.filter(
      (route) => route.number !== newPrimary.number,
    );

    const newSecondary =
      secondaryCandidates.length > 0
        ? secondaryCandidates[secondaryCandidates.length - 1]
        : null;

    /*
     * Check whether anything actually changed.
     */
    const routePlanChanged =
      force ||
      this.__internal__region !== region ||
      this.__internal__subRegionGroup !== group ||
      this.__internal__primaryRoute?.number !== newPrimary.number ||
      this.__internal__secondaryRoute?.number !== newSecondary?.number;

    if (!routePlanChanged) {
      return true;
    }

    const previousRegion = this.__internal__region;

    const previousGroup = this.__internal__subRegionGroup;

    this.__internal__region = region;
    this.__internal__subRegionGroup = group;

    this.__internal__primaryRoute = newPrimary;

    this.__internal__secondaryRoute = newSecondary;

    /*
     * If there is no second unlocked route we can't perform the 1-1 method.
     */
    this.__internal__singleRouteFallback = newSecondary === null;

    this.__internal__lastEnemy = null;

    /*
     * If the player manually moved to an entirely different roaming group,
     * cancel any lock inherited from the old group.
     *
     * A simple rotation of the boosted route must NOT cancel a Roamer currently
     * being captured.
     */
    if (
      previousRegion !== null &&
      (previousRegion !== region || previousGroup !== group)
    ) {
      this.__internal__lockedEnemy = null;
      this.__internal__lockedTargetName = null;

      this.__internal__disableCaptureFilter();
    }

    /*
     * While searching, automatically migrate to the newly detected ×3 route.
     */
    if (
      this.__internal__lockedEnemy === null &&
      player.route !== newPrimary.number
    ) {
      Automation.Utils.Route.moveToRoute(newPrimary.number, region);
    }

    return true;
  }

  /**
   * Turns off Focus using the normal Focus lifecycle.
   */
  static __internal__disableFocus() {
    Automation.Menu.forceAutomationState(
      Automation.Focus.Settings.FeatureEnabled,
      false,
    );
  }

  /**
   * Called when nothing remains to hunt.
   */
  static __internal__stopBecauseComplete() {
    const mode = this.__internal__getHuntMode();

    let message;

    /*
     * PKRS mode has two possible endings:
     *
     * 1. Everything really is Resistant
     * 2. Remaining roamers exist but are None/Infected, meaning they can't yet
     *    gain EV through this hunting method.
     */
    if (mode === this.__internal__huntModes.Pokerus) {
      const roamers = this.__internal__getRoamers();

      const allResistant = roamers.every((data) => {
        const pokemon = App.game.party.getPokemonByName(data.pokemon.name);

        return pokemon?.pokerus === GameConstants.Pokerus.Resistant;
      });

      message = allResistant
        ? "All roamers in this roaming group are Pokérus Resistant.\nTurning the feature off"
        : "No uncaught or Contagious roamer remains in this roaming group.\nInfect/hatch the remaining roamers before continuing PKRS hunting.\nTurning the feature off";
    } else {
      message =
        "All roamers in this roaming group have been caught.\nTurning the feature off";
    }

    this.__internal__disableFocus();

    Automation.Notifications.sendWarningNotif(message, "Focus - Roamers");
  }
}
