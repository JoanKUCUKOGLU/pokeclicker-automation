/**
 * @class AutomationFocusRoamers
 *
 * Roamer Focus:
 * - Alternates rapidly between two unlocked routes.
 * - Every route change generates a fresh wild encounter.
 * - Uses the x3 boosted roaming route whenever possible.
 * - Keeps Auto Click enabled at all times.
 * - Stops bouncing immediately when a wanted Roamer appears.
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
        "A new wild encounter is generated on every route change.\n" +
        "The route with the x3 roaming bonus is used whenever possible.\n" +
        "Auto Click stays enabled at all times.\n" +
        "The hunt pauses immediately when a wanted Roamer appears,\n" +
        "then resumes after the battle until no target remains.",

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
   * Builds the Roamer advanced settings.
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
     * NEW ONLY
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
     * Restore saved mode.
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
     * Save changes.
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
   * Our own refresh loop.
   */
  static __internal__loop = null;

  /*
   * Very fast bounce.
   *
   * 5 ms means normal encounters are abandoned almost immediately
   * instead of waiting for them to die.
   */
  static __internal__loopIntervalMs = 5;

  /*
   * Route plan.
   */
  static __internal__primaryRoute = null;
  static __internal__secondaryRoute = null;

  static __internal__region = null;
  static __internal__subRegionGroup = null;

  /*
   * Encounter tracking.
   */
  static __internal__lastEnemy = null;

  static __internal__lockedEnemy = null;
  static __internal__lockedTargetName = null;

  /*
   * Capture filter.
   */
  static __internal__captureFilterEnabled = false;

  /*
   * If only one route is available, route bouncing isn't possible.
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
     * Don't start inside a Dungeon / Gym / etc.
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
     * Make sure the player has the selected Poké Ball.
     */
    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Build our route plan.
     */
    if (!this.__internal__refreshRoutePlan(true)) {
      return;
    }

    /*
     * Check whether there is anything to hunt.
     */
    const targets = this.__internal__getTargets();

    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();

      return;
    }

    /*
     * Disable the normal Auto Click setting button while Roamer Focus
     * controls it.
     */
    const disableReason = "The 'Focus on Roamers' feature is enabled";

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      true,
      disableReason,
    );

    /*
     * IMPORTANT:
     *
     * Auto Click remains ON during the entire Roamer Focus.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Disable the automation capture filter while SEARCHING.
     *
     * We only enable it when a wanted Roamer has been found.
     */
    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    /*
     * Reset encounter tracking.
     */
    this.__internal__lastEnemy = null;

    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    /*
     * Move to the best route.
     */
    Automation.Utils.Route.moveToRoute(
      this.__internal__primaryRoute.number,
      this.__internal__region,
    );

    /*
     * Start our own fast loop.
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

  /************************\
    |*        STOP        *|
    \************************/

  static __internal__stop() {
    if (this.__internal__loop !== null) {
      clearInterval(this.__internal__loop);
    }

    this.__internal__loop = null;

    /*
     * Disable our temporary Roamer capture filter.
     */
    this.__internal__disableCaptureFilter();

    /*
     * User requested Auto Click to stay ON by default.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Re-enable Auto Click's normal menu button.
     */
    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      false,
    );

    /*
     * Reset everything.
     */
    this.__internal__primaryRoute = null;
    this.__internal__secondaryRoute = null;

    this.__internal__region = null;
    this.__internal__subRegionGroup = null;

    this.__internal__lastEnemy = null;

    this.__internal__lockedEnemy = null;
    this.__internal__lockedTargetName = null;

    this.__internal__singleRouteFallback = false;
  }

  /************************\
    |*        LOOP        *|
    \************************/

  static __internal__tick() {
    /*
     * Auto Click must ALWAYS remain enabled while this Focus is active.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Don't interfere with an instance.
     */
    if (Automation.Utils.isInInstanceState()) {
      Automation.Focus.__ensureNoInstanceIsInProgress();

      return;
    }

    /*
     * Never switch route during a capture animation.
     */
    if (Battle.catching()) {
      return;
    }

    /*
     * Recalculate routes.
     *
     * Handles:
     * - region/subregion changes
     * - boosted route changes
     */
    if (!this.__internal__refreshRoutePlan(false)) {
      return;
    }

    /*
     * Refresh target list.
     */
    let targets = this.__internal__getTargets();

    /*
     * Nothing left.
     */
    if (targets.length === 0) {
      this.__internal__stopBecauseComplete();

      return;
    }

    /*
     * Current encounter.
     */
    const enemy = Battle.enemyPokemon();

    /*
     * No enemy for some reason.
     */
    if (!enemy) {
      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,
        this.__internal__region,
      );

      return;
    }

    /*******************\
      |* TARGET LOCKED *|
      \*******************/

    if (this.__internal__lockedEnemy !== null) {
      /*
       * Same Roamer is still alive / being captured.
       *
       * Stay on it.
       */
      if (enemy === this.__internal__lockedEnemy) {
        Automation.Click.toggleAutoClick(true);

        return;
      }

      /*
       * Enemy changed.
       *
       * Roamer encounter has ended.
       */
      this.__internal__lockedEnemy = null;
      this.__internal__lockedTargetName = null;

      this.__internal__disableCaptureFilter();

      /*
       * Auto Click remains enabled.
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

      /*
       * New enemy must be treated as fresh.
       */
      this.__internal__lastEnemy = null;
    }

    /*
     * Same exact BattlePokemon already handled.
     */
    if (enemy === this.__internal__lastEnemy) {
      return;
    }

    this.__internal__lastEnemy = enemy;

    /*
     * Build list of wanted names.
     */
    const targetNames = new Set(targets.map((data) => data.pokemon.name));

    /*
     * Wanted Roamer detected.
     */
    if (targetNames.has(enemy.name)) {
      this.__internal__lockTarget(enemy);

      return;
    }

    /**********************\
      |* NORMAL ENCOUNTER *|
      \**********************/

    /*
     * Never waste Poké Balls on normal encounters.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Auto Click remains ON.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * If only one route is available, we cannot bounce.
     *
     * In that case we simply kill normally until another enemy appears.
     */
    if (this.__internal__secondaryRoute === null) {
      this.__internal__singleRouteFallback = true;

      return;
    }

    /*
     * TRUE 1-1 MODE
     *
     * One encounter on the current route,
     * then immediately switch route.
     */
    const nextRoute =
      player.route === this.__internal__primaryRoute.number
        ? this.__internal__secondaryRoute
        : this.__internal__primaryRoute;

    /*
     * Moving route causes PokéClicker to generate another encounter.
     */
    Automation.Utils.Route.moveToRoute(
      nextRoute.number,
      this.__internal__region,
    );

    /*
     * Immediately inspect the encounter that was just generated.
     */
    this.__internal__lockGeneratedTargetImmediately();
  }

  /****************************************\
    |* IMMEDIATE CHECK AFTER ROUTE SWITCH *|
    \****************************************/

  static __internal__lockGeneratedTargetImmediately() {
    /*
     * Don't interfere with capture / already locked target.
     */
    if (Battle.catching() || this.__internal__lockedEnemy !== null) {
      return;
    }

    const enemy = Battle.enemyPokemon();

    /*
     * Nothing new.
     */
    if (!enemy || enemy === this.__internal__lastEnemy) {
      return;
    }

    /*
     * Check whether this encounter is wanted.
     */
    const targetNames = new Set(
      this.__internal__getTargets().map((data) => data.pokemon.name),
    );

    /*
     * NORMAL POKÉMON.
     *
     * Do NOT lock it.
     *
     * The next tick (~5 ms) will switch route again.
     */
    if (!targetNames.has(enemy.name)) {
      return;
    }

    /*
     * Wanted Roamer.
     */
    this.__internal__lastEnemy = enemy;

    this.__internal__lockTarget(enemy);
  }

  /************************\
    |*    LOCK ROAMER     *|
    \************************/

  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    /*
     * Ensure the selected ball is still available.
     */
    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Lock this exact BattlePokemon.
     */
    this.__internal__lockedEnemy = enemy;

    this.__internal__lockedTargetName = enemy.name;

    /*
     * Catch only while a wanted Roamer is being fought.
     */
    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

    /*
     * Auto Click stays ON.
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
         * Never caught = always target.
         */
        if (!App.game.party.alreadyCaughtPokemonByName(pokemonName)) {
          return true;
        }

        /*
         * Already caught.
         */
        const partyPokemon = App.game.party.getPokemonByName(pokemonName);

        /*
         * Only Contagious Pokémon need repeated captures.
         *
         * Resistant = finished.
         *
         * None/Infected are ignored because capturing another copy
         * cannot advance useful EVs yet.
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
     * Roaming sub-region group.
     */
    const group = RoamingPokemonList.findGroup(region, player.subregion);

    /*
     * Roamers existing in this group.
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
     * Current x3 boosted roaming route.
     */
    const boostedRouteObservable =
      RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(region, group);

    const boostedRoute = boostedRouteObservable
      ? boostedRouteObservable()
      : null;

    /*
     * Subregions included in this Roamer group.
     */
    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,
      group,
    );

    /*
     * Every route inside the same roaming group.
     */
    const allGroupRoutes = Routes.getRoutesByRegion(region).filter((route) =>
      groupSubRegions.includes(route.subRegion || 0),
    );

    /*
     * Only currently accessible routes.
     */
    const unlockedRoutes = allGroupRoutes.filter((route) =>
      Automation.Utils.Route.canMoveToRoute(route.number, region, route),
    );

    /*
     * No usable route.
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
     * Best normal route.
     *
     * Later routes normally have better Roamer odds.
     */
    const bestUnlockedRoute = unlockedRoutes[unlockedRoutes.length - 1];

    /*
     * Is the x3 route unlocked?
     */
    const boostedUnlocked = boostedRoute
      ? unlockedRoutes.find((route) => route.number === boostedRoute.number)
      : null;

    /*
     * Primary route:
     *
     * boosted x3 route if possible,
     * otherwise best unlocked route.
     */
    const newPrimary = boostedUnlocked ?? bestUnlockedRoute;

    /*
     * Secondary route:
     *
     * best other unlocked route in the SAME roaming group.
     */
    const secondaryCandidates = unlockedRoutes.filter(
      (route) => route.number !== newPrimary.number,
    );

    const newSecondary =
      secondaryCandidates.length > 0
        ? secondaryCandidates[secondaryCandidates.length - 1]
        : null;

    /*
     * Has our plan changed?
     */
    const routePlanChanged =
      force ||
      this.__internal__region !== region ||
      this.__internal__subRegionGroup !== group ||
      this.__internal__primaryRoute?.number !== newPrimary.number ||
      this.__internal__secondaryRoute?.number !== newSecondary?.number;

    /*
     * Nothing changed.
     */
    if (!routePlanChanged) {
      return true;
    }

    /*
     * Remember old region/group.
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

    /*
     * Only one usable route?
     */
    this.__internal__singleRouteFallback = newSecondary === null;

    /*
     * Encounter tracking must restart.
     */
    this.__internal__lastEnemy = null;

    /*
     * If player moved into another roaming group,
     * clear any old target lock.
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
     * While searching, always migrate to the best route.
     */
    if (
      this.__internal__lockedEnemy === null &&
      player.route !== newPrimary.number
    ) {
      Automation.Utils.Route.moveToRoute(newPrimary.number, region);
    }

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

    /*
     * PKRS mode.
     */
    if (mode === this.__internal__huntModes.Pokerus) {
      const roamers = this.__internal__getRoamers();

      /*
       * Check if every Roamer is actually Resistant.
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

    /*
     * New-only mode.
     */
      message =
        "All roamers in this roaming group have been caught.\nTurning the feature off";
    }

    /*
     * Turn off Roamer Focus.
     */
    this.__internal__disableFocus();

    /*
     * Auto Click remains ON.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Notification.
     */
    Automation.Notifications.sendWarningNotif(message, "Focus - Roamers");
  }
}
