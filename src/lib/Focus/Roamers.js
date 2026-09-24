/**
 * @class AutomationFocusRoamers
 *
 * Roamer Focus
 *
 * Features:
 * - Searches roaming Pokémon automatically.
 * - Uses the x3 boosted roaming route whenever possible.
 * - Performs synchronous route bouncing to avoid wasting time fighting
 *   normal Pokémon on the boosted route.
 * - Auto Click stays enabled at all times.
 * - Immediately stops bouncing when a wanted Roamer appears.
 * - Supports:
 *      - New roamers only
 *      - New + PKRS (Contagious -> Resistant)
 */
class AutomationFocusRoamers {
  /******************************************************************************\
    |***    Focus specific members, should only be used by focus sub-classes    ***|
    \******************************************************************************/

  /**
   * Adds Roamers to the Focus list.
   *
   * @param {Array} functionalitiesList
   */
  static __registerFunctionalities(functionalitiesList) {
    functionalitiesList.push({
      id: "Roamers",
      name: "Roamers",

      tooltip:
        "Hunts roaming Pokémon by rapidly alternating between two routes" +
        Automation.Menu.TooltipSeparator +
        "Uses the x3 roaming route whenever possible.\n" +
        "Normal encounters on the boosted route are skipped immediately.\n" +
        "Auto Click stays enabled at all times.\n" +
        "The hunt stops bouncing as soon as a wanted Roamer appears.",

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
   * Builds Roamer advanced settings.
   *
   * @param {Element} parent
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
      "New roamers only: stops targeting a Roamer once it has been caught." +
        Automation.Menu.TooltipSeparator +
        "PKRS: hunts uncaught Roamers and already-caught Roamers that are Contagious, until they become Resistant.",
    );

    container.appendChild(label);

    const select = Automation.Menu.createDropDownListElement(
      "Focus-Roamers-HuntMode-Select",
    );

    select.style.width = "100%";

    /*
     * NEW ROAMERS ONLY
     */
    const newOnlyOption = document.createElement("option");

    newOnlyOption.value = this.__internal__huntModes.NewOnly;

    newOnlyOption.textContent = "New roamers only";

    select.options.add(newOnlyOption);

    /*
     * PKRS
     */
    const pokerusOption = document.createElement("option");

    pokerusOption.value = this.__internal__huntModes.Pokerus;

    pokerusOption.textContent = "New + PKRS (Contagious → Resistant)";

    select.options.add(pokerusOption);

    /*
     * Restore stored setting.
     */
    const storedMode = Automation.Utils.LocalStorage.getValue(
      this.__internal__advancedSettings.HuntMode,
    );

    select.value = Object.values(this.__internal__huntModes).includes(
      storedMode,
    )
      ? storedMode
      : this.__internal__huntModes.NewOnly;

    /*
     * Save mode.
     */
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

  /*
   * Main automation loop.
   */
  static __internal__loop = null;

  /*
   * Main loop frequency.
   *
   * The actual route bouncing is synchronous, so this doesn't need to
   * represent every individual encounter.
   */
  static __internal__loopIntervalMs = 5;

  /*
   * Number of complete boosted <-> secondary cycles performed
   * synchronously during a single script tick.
   *
   * 10 cycles = up to 20 freshly generated encounters.
   */
  static __internal__burstSize = 10;

  /*
   * Route plan.
   */
  static __internal__primaryRoute = null;
  static __internal__secondaryRoute = null;

  static __internal__region = null;
  static __internal__subRegionGroup = null;

  /*
   * Locked Roamer.
   */
  static __internal__lockedEnemy = null;
  static __internal__lockedTargetName = null;

  /*
   * Poké Ball automation.
   */
  static __internal__captureFilterEnabled = false;

  /*
   * True if only one usable route is available.
   */
  static __internal__singleRouteFallback = false;

  /*************************\
    |*        START        *|
    \*************************/

  static __internal__start() {
    /*
     * Prevent duplicate loops.
     */
    if (this.__internal__loop !== null) {
      return;
    }

    /*
     * Don't start in Gym / Dungeon / Battle Frontier / etc.
     */
    if (!Automation.Focus.__ensureNoInstanceIsInProgress()) {
      return;
    }

    const mode = this.__internal__getHuntMode();

    /*
     * PKRS mode requires Pokérus.
     */
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

    /*
     * Check selected Poké Ball.
     */
    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Build route plan.
     */
    if (!this.__internal__refreshRoutePlan(true)) {
      return;
    }

    /*
     * Is there anything to hunt?
     */
    const targets = this.__internal__getTargets();

    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();

      return;
    }

    /*
     * Roamer Focus controls Auto Click while enabled.
     */
    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      true,
      "The 'Focus on Roamers' feature is enabled",
    );

    /*
     * User requested Auto Click to remain ON at all times.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Disable automatic capture while searching.
     *
     * It is re-enabled only when a wanted Roamer is found.
     */
    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    /*
     * Reset lock.
     */
    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    /*
     * If we have two routes, park on secondary first.
     *
     * This means whenever JavaScript gives control back to the browser,
     * we are preferably NOT sitting on a normal Pokémon from the x3 route.
     */
    if (this.__internal__secondaryRoute !== null) {
      Automation.Utils.Route.moveToRoute(
        this.__internal__secondaryRoute.number,
        this.__internal__region,
      );
    } else {
      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,
        this.__internal__region,
      );
    }

    /*
     * Start loop.
     */
    this.__internal__loop = setInterval(
      this.__internal__tick.bind(this),
      this.__internal__loopIntervalMs,
    );

    /*
     * Run once immediately.
     */
    this.__internal__tick();
  }

  /************************\
    |*        STOP        *|
    \************************/

  static __internal__stop() {
    if (this.__internal__loop !== null) {
      clearInterval(this.__internal__loop);
    }

    this.__internal__loop = null;

    /*
     * Remove temporary Roamer capture filter.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Keep Auto Click ON.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Re-enable normal Auto Click menu setting.
     */
    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      false,
    );

    /*
     * Reset route plan.
     */
    this.__internal__primaryRoute = null;
    this.__internal__secondaryRoute = null;

    this.__internal__region = null;
    this.__internal__subRegionGroup = null;

    /*
     * Reset target.
     */
    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    this.__internal__singleRouteFallback = false;
  }

  /************************\
    |*        LOOP        *|
    \************************/

  static __internal__tick() {
    /*
     * Auto Click must ALWAYS stay enabled while Roamer Focus is active.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Don't interfere with instances.
     */
    if (Automation.Utils.isInInstanceState()) {
      Automation.Focus.__ensureNoInstanceIsInProgress();

      return;
    }

    /*
     * Never switch routes during capture animation.
     */
    if (Battle.catching()) {
      return;
    }

    /*
     * Refresh roaming group / boosted route.
     */
    if (!this.__internal__refreshRoutePlan(false)) {
      return;
    }

    let targets = this.__internal__getTargets();

    /*
     * Nothing left.
     */
    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();

      return;
    }

    const enemy = Battle.enemyPokemon();

    /**************************************************************************
     * LOCKED ROAMER
     **************************************************************************/

    if (this.__internal__lockedEnemy !== null) {
      /*
       * Same Roamer is still on screen.
       *
       * Stay here and let Auto Click attack it.
       */
      if (enemy === this.__internal__lockedEnemy) {
        return;
      }

      /*
       * Enemy changed.
       *
       * The Roamer encounter finished.
       */
      this.__internal__lockedEnemy = null;
      this.__internal__lockedTargetName = null;

      this.__internal__disableCaptureFilter();

      /*
       * Auto Click remains ON.
       */
      Automation.Click.toggleAutoClick(true);

      /*
       * Refresh targets after capture.
       */
      targets = this.__internal__getTargets();

      if (targets.length === 0) {
        this.__internal__stopBecauseComplete();

        return;
      }
    }

    /**************************************************************************
     * ONLY ONE ROUTE AVAILABLE
     **************************************************************************/

    if (this.__internal__secondaryRoute === null) {
      this.__internal__singleRouteFallback = true;

      /*
       * Can't bounce.
       *
       * Check if current encounter is wanted.
       */
      if (enemy) {
        const targetNames = new Set(targets.map((data) => data.pokemon.name));

        if (targetNames.has(enemy.name)) {
          this.__internal__lockTarget(enemy);
        }
      }

      /*
       * Otherwise Auto Click kills normally and another encounter
       * eventually appears.
       */
      return;
    }

    /**************************************************************************
     * SEARCH MODE
     **************************************************************************/

    /*
     * Don't waste Poké Balls on normal Pokémon.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Perform a synchronous route-bounce burst.
     */
    this.__internal__performBounceBurst(targets);
  }

  /******************************\
    |* SYNCHRONOUS BOUNCE BURST *|
    \******************************/

  static __internal__performBounceBurst(targets) {
    /*
     * Wanted Pokémon names.
     */
    const targetNames = new Set(targets.map((data) => data.pokemon.name));

    /*
     * Check current enemy before moving.
     */
    let enemy = Battle.enemyPokemon();

    if (enemy && targetNames.has(enemy.name)) {
      this.__internal__lockTarget(enemy);

      return;
    }

    /*
     * Start from secondary route.
     *
     * The goal is:
     *
     * secondary
     *   ↓
     * boosted
     *   ↓
     * immediate check
     *   ↓
     * normal Pokémon?
     *   ↓
     * immediately secondary again
     *
     * We never yield browser execution while standing on a normal
     * encounter from the boosted route.
     */
    if (player.route !== this.__internal__secondaryRoute.number) {
      Automation.Utils.Route.moveToRoute(
        this.__internal__secondaryRoute.number,
        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      /*
       * Roamers can spawn on secondary too.
       */
      if (enemy && targetNames.has(enemy.name)) {
        this.__internal__lockTarget(enemy);

        return;
      }
    }

    /**************************************************************************
     * BURST
     **************************************************************************/

    for (let i = 0; i < this.__internal__burstSize; i++) {
      /*
       * Safety.
       */
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * BOOSTED / PRIMARY ROUTE
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,
        this.__internal__region,
      );

      /*
       * Route movement generates the new encounter immediately.
       */
      enemy = Battle.enemyPokemon();

      /*
       * TARGET FOUND ON BOOSTED ROUTE.
       *
       * Stay here.
       * Stop bouncing.
       * Let Auto Click fight it.
       */
      if (enemy && targetNames.has(enemy.name)) {
        this.__internal__lockTarget(enemy);

        return;
      }

      /*
       * Normal Pokémon.
       *
       * DO NOT return.
       * DO NOT wait.
       * DO NOT setTimeout.
       *
       * Immediately switch back to secondary in this exact JavaScript
       * execution.
       */

      /**********************************************************************
       * SECONDARY ROUTE
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        this.__internal__secondaryRoute.number,
        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      /*
       * TARGET FOUND ON SECONDARY ROUTE.
       */
      if (enemy && targetNames.has(enemy.name)) {
        this.__internal__lockTarget(enemy);

        return;
      }

      /*
       * Otherwise immediately start another
       * secondary -> boosted -> secondary cycle.
       */
    }

    /*
     * IMPORTANT:
     *
     * The burst always ends on secondary.
     *
     * So when execution returns to PokéClicker, Auto Click can at worst
     * attack the secondary-route Pokémon, not a normal encounter on the
     * boosted x3 route.
     */
  }

  /************************\
    |*    LOCK ROAMER     *|
    \************************/

  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    /*
     * Ensure we still have the selected ball.
     */
    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Lock exact BattlePokemon.
     */
    this.__internal__lockedEnemy = enemy;

    this.__internal__lockedTargetName = enemy.name;

    /*
     * Catch the wanted Roamer.
     */
    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

    /*
     * Auto Click remains ON and now may freely attack because this is
     * a wanted Roamer.
     */
    Automation.Click.toggleAutoClick(true);
  }

  /************************\
    |*   CAPTURE FILTER   *|
    \************************/

  static __internal__disableCaptureFilter() {
    if (!this.__internal__captureFilterEnabled) {
      return;
    }

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;
  }

  /************************\
    |*      POKÉBALL      *|
    \************************/

  static __internal__getSelectedPokeball() {
    return parseInt(
      Automation.Utils.LocalStorage.getValue(
        Automation.Focus.Settings.BallToUseToCatch,
      ),
    );
  }

  /************************\
    |*     HUNT MODE      *|
    \************************/

  static __internal__getHuntMode() {
    const mode = Automation.Utils.LocalStorage.getValue(
      this.__internal__advancedSettings.HuntMode,
    );

    return Object.values(this.__internal__huntModes).includes(mode)
      ? mode
      : this.__internal__huntModes.NewOnly;
  }

  /************************\
    |*      ROAMERS       *|
    \************************/

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

  /************************\
    |*      TARGETS       *|
    \************************/

  static __internal__getTargets() {
    const roamers = this.__internal__getRoamers();

    const mode = this.__internal__getHuntMode();

    /****************\
      |* PKRS MODE *|
      \****************/

    if (mode === this.__internal__huntModes.Pokerus) {
      return roamers.filter((data) => {
        const pokemonName = data.pokemon.name;

        /*
         * Never caught:
         * target it.
         */
        if (!App.game.party.alreadyCaughtPokemonByName(pokemonName)) {
          return true;
        }

        /*
         * Already caught.
         */
        const partyPokemon = App.game.party.getPokemonByName(pokemonName);

        /*
         * Only Contagious Pokémon are repeatedly hunted.
         *
         * Resistant = complete.
         *
         * None/Infected = ignored until they become Contagious.
         */
        return partyPokemon?.pokerus === GameConstants.Pokerus.Contagious;
      });
    }

    /********************\
      |* NEW ONLY MODE *|
      \********************/

    return roamers.filter(
      (data) => !App.game.party.alreadyCaughtPokemonByName(data.pokemon.name),
    );
  }

  /************************\
    |*     ROUTE PLAN     *|
    \************************/

  static __internal__refreshRoutePlan(force) {
    /*
     * Current region.
     */
    const region = player.region;

    /*
     * Roaming group.
     */
    const group = RoamingPokemonList.findGroup(region, player.subregion);

    /*
     * Available roamers.
     */
    const roamers = RoamingPokemonList.getSubRegionalGroupRoamers(
      region,
      group,
    );

    /*
     * No roamers here.
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
     * Current boosted x3 route.
     */
    const boostedRouteObservable =
      RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(region, group);

    const boostedRoute = boostedRouteObservable
      ? boostedRouteObservable()
      : null;

    /*
     * Subregions belonging to this roaming group.
     */
    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,
      group,
    );

    /*
     * Routes belonging to roaming group.
     */
    const allGroupRoutes = Routes.getRoutesByRegion(region).filter((route) =>
      groupSubRegions.includes(route.subRegion || 0),
    );

    /*
     * Keep accessible routes only.
     */
    const unlockedRoutes = allGroupRoutes.filter((route) =>
      Automation.Utils.Route.canMoveToRoute(route.number, region, route),
    );

    /*
     * Nothing usable.
     */
    if (unlockedRoutes.length === 0) {
      Automation.Notifications.sendWarningNotif(
        "No unlocked route is available for the current roaming group.\nTurning the feature off",
        "Focus - Roamers",
      );

      this.__internal__disableFocus();

      return false;
    }

    /*
     * Best normal unlocked route.
     */
    const bestUnlockedRoute = unlockedRoutes[unlockedRoutes.length - 1];

    /*
     * Is x3 route unlocked?
     */
    const boostedUnlocked = boostedRoute
      ? unlockedRoutes.find((route) => route.number === boostedRoute.number)
      : null;

    /*
     * Primary = boosted x3 route if available.
     */
    const newPrimary = boostedUnlocked ?? bestUnlockedRoute;

    /*
     * Secondary = best different route.
     */
    const secondaryCandidates = unlockedRoutes.filter(
      (route) => route.number !== newPrimary.number,
    );

    const newSecondary =
      secondaryCandidates.length > 0
        ? secondaryCandidates[secondaryCandidates.length - 1]
        : null;

    /*
     * Did route plan change?
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

    /*
     * Save old group information.
     */
    const previousRegion = this.__internal__region;

    const previousGroup = this.__internal__subRegionGroup;

    /*
     * Save new route plan.
     */
    this.__internal__region = region;

    this.__internal__subRegionGroup = group;

    this.__internal__primaryRoute = newPrimary;

    this.__internal__secondaryRoute = newSecondary;

    this.__internal__singleRouteFallback = newSecondary === null;

    /*
     * If player manually changed roaming group,
     * discard old target lock.
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
     * IMPORTANT:
     *
     * DO NOT automatically move to primary here.
     *
     * The synchronous bounce function is the ONLY code allowed
     * to move between primary and secondary while searching.
     *
     * Otherwise we could yield execution while sitting on a
     * normal Pokémon from the boosted route.
     */

    return true;
  }

  /************************\
    |*   DISABLE FOCUS    *|
    \************************/

  static __internal__disableFocus() {
    Automation.Menu.forceAutomationState(
      Automation.Focus.Settings.FeatureEnabled,
      false,
    );
  }

  /************************\
    |*      COMPLETE      *|
    \************************/

  static __internal__stopBecauseComplete() {
    const mode = this.__internal__getHuntMode();

    let message;

    /****************\
      |* PKRS MODE *|
      \****************/

    if (mode === this.__internal__huntModes.Pokerus) {
      const roamers = this.__internal__getRoamers();

      /*
       * Check whether every Roamer is actually Resistant.
       */
      const allResistant = roamers.every((data) => {
        const pokemon = App.game.party.getPokemonByName(data.pokemon.name);

        return pokemon?.pokerus === GameConstants.Pokerus.Resistant;
      });

      if (allResistant) {
        message =
          "All roamers in this roaming group are Pokérus Resistant.\nTurning the feature off";
      } else {
        message =
          "No uncaught or Contagious roamer remains in this roaming group.\n" +
          "Infect/hatch the remaining roamers before continuing PKRS hunting.\n" +
          "Turning the feature off";
      }
    } else {

    /********************\
      |* NEW ONLY MODE *|
      \********************/
      message =
        "All roamers in this roaming group have been caught.\nTurning the feature off";
    }

    /*
     * Disable Roamer Focus.
     */
    this.__internal__disableFocus();

    /*
     * User wants Auto Click to remain ON.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Notify.
     */
    Automation.Notifications.sendWarningNotif(message, "Focus - Roamers");
  }
}
