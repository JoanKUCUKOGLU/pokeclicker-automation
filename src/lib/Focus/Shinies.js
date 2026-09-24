/**
 * @class AutomationFocusShinies
 *
 * Route shiny hunting Focus.
 *
 * New shinies only mode:
 * - uses PokéClicker's native Routes.getRoutesByRegion(region) order;
 * - this is the same base route order used by route achievements;
 * - targets the first accessible route that still contains a missing shiny;
 * - bounces between that target route and the next accessible route;
 * - once every shiny from the target route is owned, automatically advances
 *   to the next incomplete route;
 * - optionally catches shiny Roamers encountered during the search;
 * - if normal route shinies are complete and shiny Roamers are still missing,
 *   it switches to a Roamer cleanup phase.
 *
 * Any shiny mode:
 * - bounces between an accessible route and the next accessible route;
 * - catches every shiny encountered;
 * - optionally includes shiny Roamers.
 */
class AutomationFocusShinies {
  /******************************************************************************\
    |***    Focus specific members, should only be used by focus sub-classes    ***|
    \******************************************************************************/

  static __registerFunctionalities(functionalitiesList) {
    functionalitiesList.push({
      id: "Shinies",

      name: "Shinies",

      tooltip:
        "Hunts shiny Pokémon on routes by rapidly alternating between two routes" +
        Automation.Menu.TooltipSeparator +
        "New shinies only: completes routes one by one using PokéClicker's route order.\n" +
        "Any shiny: catches every shiny encountered.\n" +
        "Optional shiny Roamers can also be caught.",

      run: function () {
        this.__internal__start();
      }.bind(this),

      stop: function () {
        this.__internal__stop();
      }.bind(this),

      refreshRateAsMs: Automation.Focus.__noFunctionalityRefresh,
    });
  }

  /***************************************************************************
   * ADVANCED SETTINGS
   ***************************************************************************/

  static __buildAdvancedSettings(parent) {
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.HuntMode,
      this.__internal__huntModes.NewOnly,
    );

    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.IncludeShinyRoamers,
      false,
    );

    const container = document.createElement("div");

    container.style.paddingLeft = "10px";

    container.style.paddingRight = "10px";

    container.style.textAlign = "left";

    /*************************************************************************
     * HUNT MODE
     *************************************************************************/

    const label = document.createElement("span");

    label.innerText = "Shiny hunting mode :";

    label.classList.add("hasAutomationTooltip");

    label.setAttribute(
      "automation-tooltip-text",

      "New shinies only: completes accessible routes one by one using PokéClicker's native route order." +
        Automation.Menu.TooltipSeparator +
        "Any shiny: catches every shiny encounter and keeps hunting indefinitely.",
    );

    container.appendChild(label);

    const select = Automation.Menu.createDropDownListElement(
      "Focus-Shinies-HuntMode-Select",
    );

    select.style.width = "100%";

    /*************************************************************************
     * NEW SHINIES ONLY
     *************************************************************************/

    const newOnlyOption = document.createElement("option");

    newOnlyOption.value = this.__internal__huntModes.NewOnly;

    newOnlyOption.textContent = "New shinies only - route by route";

    select.options.add(newOnlyOption);

    /*************************************************************************
     * ANY SHINY
     *************************************************************************/

    const anyOption = document.createElement("option");

    anyOption.value = this.__internal__huntModes.Any;

    anyOption.textContent = "Any shiny";

    select.options.add(anyOption);

    /*
     * Restore stored mode.
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

    container.appendChild(document.createElement("br"));

    container.appendChild(document.createElement("br"));

    /*************************************************************************
     * SHINY ROAMERS
     *************************************************************************/

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Include shiny roamers",

      this.__internal__advancedSettings.IncludeShinyRoamers,

      "Also catches shiny Roamers encountered while completing routes" +
        Automation.Menu.TooltipSeparator +
        "Route-by-route progression remains the priority.\n" +
        "After all normal route shinies are complete, remaining shiny Roamers are hunted on their boosted x3 route.",

      container,
    );

    parent.appendChild(container);
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__advancedSettings = {
    HuntMode: "Focus-Shinies-HuntMode",

    IncludeShinyRoamers: "Focus-Shinies-IncludeShinyRoamers",
  };

  static __internal__huntModes = {
    NewOnly: "new",
    Any: "any",
  };

  /***************************************************************************
   * LOOP
   ***************************************************************************/

  static __internal__loop = null;

  static __internal__loopIntervalMs = 5;

  /*
   * 10 cycles =
   * up to 20 freshly generated encounters.
   */
  static __internal__burstSize = 10;

  /***************************************************************************
   * ROUTE PLAN
   ***************************************************************************/

  static __internal__primaryRoute = null;

  static __internal__secondaryRoute = null;

  static __internal__region = null;

  /*
   * "routes":
   * Sequential normal route completion.
   *
   * "roamers":
   * Normal route shinies are complete and
   * only shiny Roamers remain.
   *
   * "any":
   * Any shiny mode.
   */
  static __internal__phase = null;

  /***************************************************************************
   * ENCOUNTER STATE
   ***************************************************************************/

  static __internal__lockedEnemy = null;

  static __internal__captureFilterEnabled = false;

  static __internal__singleRouteFallback = false;

  /*************************\
    |*        START        *|
    \*************************/

  static __internal__start() {
    /*
     * Already running.
     */
    if (this.__internal__loop !== null) {
      return;
    }

    /*
     * Don't start inside an instance.
     */
    if (!Automation.Focus.__ensureNoInstanceIsInProgress()) {
      return;
    }

    /*************************************************************************
     * POKEBALL
     *************************************************************************/

    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*************************************************************************
     * ROUTE PLAN
     *************************************************************************/

    if (!this.__internal__refreshRoutePlan(true)) {
      return;
    }

    /*************************************************************************
     * AUTO CLICK
     *************************************************************************/

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,

      true,

      "The 'Focus on Shinies' feature is enabled",
    );

    /*
     * Auto Click always stays ON.
     */
    Automation.Click.toggleAutoClick(true);

    /*************************************************************************
     * CAPTURE FILTER
     *************************************************************************/

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    this.__internal__lockedEnemy = null;

    /*************************************************************************
     * INITIAL ROUTE
     *************************************************************************/

    const initialRoute =
      this.__internal__secondaryRoute ?? this.__internal__primaryRoute;

    Automation.Utils.Route.moveToRoute(
      initialRoute.number,
      this.__internal__region,
    );

    /*************************************************************************
     * START LOOP
     *************************************************************************/

    this.__internal__loop = setInterval(
      this.__internal__tick.bind(this),

      this.__internal__loopIntervalMs,
    );

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
     * Remove temporary capture filter.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Auto Click stays enabled.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Restore Auto Click menu button.
     */
    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,

      false,
    );

    /*
     * Reset state.
     */
    this.__internal__primaryRoute = null;

    this.__internal__secondaryRoute = null;

    this.__internal__region = null;

    this.__internal__phase = null;

    this.__internal__lockedEnemy = null;

    this.__internal__singleRouteFallback = false;
  }

  /************************\
    |*        LOOP        *|
    \************************/

  static __internal__tick() {
    /*
     * Keep Auto Click enabled.
     */
    Automation.Click.toggleAutoClick(true);

    /*************************************************************************
     * INSTANCE SAFETY
     *************************************************************************/

    if (Automation.Utils.isInInstanceState()) {
      Automation.Focus.__ensureNoInstanceIsInProgress();

      return;
    }

    /*
     * Don't move during capture animation.
     */
    if (Battle.catching()) {
      return;
    }

    /*************************************************************************
     * ROUTE PLAN
     *************************************************************************/

    if (!this.__internal__refreshRoutePlan(false)) {
      return;
    }

    const enemy = Battle.enemyPokemon();

    /*************************************************************************
     * LOCKED SHINY
     *************************************************************************/

    if (this.__internal__lockedEnemy !== null) {
      /*
       * Same shiny is still on screen.
       */
      if (enemy === this.__internal__lockedEnemy) {
        return;
      }

      /*
       * Encounter finished.
       */
      this.__internal__lockedEnemy = null;

      this.__internal__disableCaptureFilter();

      Automation.Click.toggleAutoClick(true);

      /*
       * Capturing the shiny may have completed
       * the current route.
       *
       * Immediately rebuild the route plan.
       */
      if (!this.__internal__refreshRoutePlan(true)) {
        return;
      }
    }

    /*************************************************************************
     * ONLY ONE ROUTE AVAILABLE
     *************************************************************************/

    if (this.__internal__secondaryRoute === null) {
      this.__internal__singleRouteFallback = true;

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);
      }

      /*
       * No bounce possible.
       *
       * Auto Click fights normally.
       */
      return;
    }

    /*************************************************************************
     * FAST SEARCH
     *************************************************************************/

    this.__internal__disableCaptureFilter();

    this.__internal__performBounceBurst();
  }

  /******************************\
    |* SYNCHRONOUS BOUNCE BURST *|
    \******************************/

  static __internal__performBounceBurst() {
    let enemy = Battle.enemyPokemon();

    /*
     * Current enemy may already be a wanted shiny.
     */
    if (enemy && this.__internal__isWantedShiny(enemy)) {
      this.__internal__lockTarget(enemy);

      return;
    }

    /*************************************************************************
     * PARK ON SECONDARY ROUTE
     *************************************************************************/

    if (player.route !== this.__internal__secondaryRoute.number) {
      Automation.Utils.Route.moveToRoute(
        this.__internal__secondaryRoute.number,

        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }
    }

    /*************************************************************************
     * BURST
     *************************************************************************/

    for (let i = 0; i < this.__internal__burstSize; i++) {
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * PRIMARY / TARGET ROUTE
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,

        this.__internal__region,
      );

      /*
       * New encounter generated immediately.
       */
      enemy = Battle.enemyPokemon();

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }

      /**********************************************************************
       * SECONDARY / NEXT ROUTE
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        this.__internal__secondaryRoute.number,

        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }
    }
  }

  /************************\
    |*    TARGET CHECK    *|
    \************************/

  static __internal__isWantedShiny(enemy) {
    /*
     * Not shiny.
     */
    if (!enemy?.shiny) {
      return false;
    }

    /*************************************************************************
     * ROAMER
     *************************************************************************/

    const isRoamer = enemy.encounterType === EncounterType.roamer;

    /*
     * Shiny Roamers disabled.
     */
    if (isRoamer && !this.__internal__includeShinyRoamers()) {
      return false;
    }

    /*************************************************************************
     * ANY SHINY
     *************************************************************************/

    const mode = this.__internal__getHuntMode();

    if (mode === this.__internal__huntModes.Any) {
      return true;
    }

    /*************************************************************************
     * NEW SHINY ONLY
     *************************************************************************/

    /*
     * If we already own the shiny,
     * ignore it.
     */
    return !App.game.party.alreadyCaughtPokemon(enemy.id, true);
  }

  /************************\
    |*     LOCK SHINY     *|
    \************************/

  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Lock exact encounter.
     */
    this.__internal__lockedEnemy = enemy;

    /*
     * Catch only while shiny is present.
     */
    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

    /*
     * Auto Click kills it.
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
    |*      POKEBALL      *|
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
    |*   SHINY ROAMERS    *|
    \************************/

  static __internal__includeShinyRoamers() {
    return (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.IncludeShinyRoamers,
      ) === "true"
    );
  }

  /************************\
    |* ACCESSIBLE ROUTES  *|
    \************************/

  static __internal__getAccessibleRoutes(region) {
    /*
     * IMPORTANT:
     *
     * Do NOT sort these routes ourselves.
     *
     * Routes.getRoutesByRegion(region) already returns PokéClicker's
     * native route order.
     *
     * Route achievements are also registered by iterating directly over
     * Routes.getRoutesByRegion(region), so using this array as-is gives
     * Shiny Focus the same base route ordering.
     */
    return Routes.getRoutesByRegion(region).filter(
      (route) =>
        !Automation.Utils.Route.isInMagikarpJumpIsland(
          route.region,
          route.subRegion,
        ) && Automation.Utils.Route.canMoveToRoute(route.number, region, route),
    );
  }

  /************************\
    |* ROUTE POKÉMON LIST *|
    \************************/

  static __internal__getRoutePokemon(route) {
    try {
      return RouteHelper.getAvailablePokemonList(route.number, route.region);
    } catch (error) {
      return [];
    }
  }

  /************************\
    |* MISSING ON A ROUTE *|
    \************************/

  static __internal__getMissingShiniesForRoute(route) {
    const result = [];

    const seen = new Set();

    for (const pokemonName of this.__internal__getRoutePokemon(route)) {
      /*
       * Avoid duplicate species.
       */
      if (seen.has(pokemonName)) {
        continue;
      }

      seen.add(pokemonName);

      const pokemon = PokemonHelper.getPokemonByName(pokemonName);

      /*
       * Shiny not registered.
       */
      if (!App.game.party.alreadyCaughtPokemon(pokemon.id, true)) {
        result.push(pokemonName);
      }
    }

    return result;
  }

  static __internal__routeHasMissingShiny(route) {
    return this.__internal__getMissingShiniesForRoute(route).length > 0;
  }

  /************************\
    |* FIRST TARGET ROUTE *|
    \************************/

  static __internal__getFirstIncompleteRoute(routes) {
    /*
     * routes is already in PokéClicker's
     * native / Achievement route order.
     */
    return (
      routes.find((route) => this.__internal__routeHasMissingShiny(route)) ??
      null
    );
  }

  /************************\
    |* MISSING ROAMERS    *|
    \************************/

  static __internal__getMissingShinyRoamerGroups(region, routes) {
    if (!this.__internal__includeShinyRoamers()) {
      return [];
    }

    const groups = new Map();

    /*
     * Keep the same route order passed to us.
     *
     * This means roaming groups are also discovered
     * according to PokéClicker's native route order.
     */
    for (const route of routes) {
      const group = RoamingPokemonList.findGroup(region, route.subRegion || 0);

      if (groups.has(group)) {
        continue;
      }

      const roamers =
        RoamingPokemonList.getSubRegionalGroupRoamers(region, group) ?? [];

      const missingRoamers = roamers.filter((data) => {
        const pokemon = PokemonHelper.getPokemonByName(data.pokemon.name);

        return !App.game.party.alreadyCaughtPokemon(pokemon.id, true);
      });

      if (missingRoamers.length > 0) {
        groups.set(group, missingRoamers);
      }
    }

    return Array.from(groups.entries()).map(([group, roamers]) => ({
      group,
      roamers,
    }));
  }

  /************************\
    |* GROUP ROUTE LIST   *|
    \************************/

  static __internal__getRoutesForRoamingGroup(region, group, accessibleRoutes) {
    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,
      group,
    );

    /*
     * filter() preserves accessibleRoutes order.
     */
    return accessibleRoutes.filter((route) =>
      groupSubRegions.includes(route.subRegion || 0),
    );
  }

  /************************\
    |*    NEXT ROUTE      *|
    \************************/

  static __internal__getNextRoute(routes, targetRoute) {
    /*
     * No second route available.
     */
    if (routes.length <= 1) {
      return null;
    }

    const index = routes.findIndex(
      (route) => route.number === targetRoute.number,
    );

    if (index === -1) {
      return routes[0];
    }

    /*
     * Use the NEXT route in PokéClicker's
     * native route list.
     *
     * Last route wraps back to first.
     */
    return routes[(index + 1) % routes.length];
  }

  /************************\
    |*     ROUTE PLAN     *|
    \************************/

  static __internal__refreshRoutePlan(force) {
    const region = player.region;

    const mode = this.__internal__getHuntMode();

    /*
     * All unlocked / accessible routes
     * using PokéClicker's native ordering.
     */
    const accessibleRoutes = this.__internal__getAccessibleRoutes(region);

    if (accessibleRoutes.length === 0) {
      Automation.Notifications.sendWarningNotif(
        "No unlocked route is available in the current region.\nTurning the feature off",

        "Focus - Shinies",
      );

      this.__internal__disableFocus();

      return false;
    }

    let newPrimary = null;

    let newSecondary = null;

    let newPhase = null;

    /*************************************************************************
     * ANY SHINY MODE
     *************************************************************************/

    if (mode === this.__internal__huntModes.Any) {
      newPhase = "any";

      /*
       * Prefer current route if accessible.
       */
      newPrimary =
        accessibleRoutes.find((route) => route.number === player.route) ??
        accessibleRoutes[0];

      /*
       * Bounce to the next route
       * in the native route list.
       */
      newSecondary = this.__internal__getNextRoute(
        accessibleRoutes,
        newPrimary,
      );
    } else {
      /***********************************************************************
       * NEW SHINIES ONLY
       *
       * COMPLETE ROUTES IN POKÉCLICKER / ACHIEVEMENT ORDER.
       ***********************************************************************/

      const firstIncompleteRoute =
        this.__internal__getFirstIncompleteRoute(accessibleRoutes);

      /***********************************************************************
       * NORMAL ROUTES STILL INCOMPLETE
       ***********************************************************************/

      if (firstIncompleteRoute !== null) {
        newPhase = "routes";

        /*
         * TARGET:
         *
         * First accessible route in PokéClicker's
         * native list that still contains
         * at least one missing shiny.
         */
        newPrimary = firstIncompleteRoute;

        /*
         * BOUNCE:
         *
         * Next accessible route in that same list.
         */
        newSecondary = this.__internal__getNextRoute(
          accessibleRoutes,
          newPrimary,
        );
      } else {

      /***********************************************************************
       * NORMAL ROUTES COMPLETE
       ***********************************************************************/
        /*
         * If shiny Roamers are enabled,
         * check whether some remain.
         */
        const missingRoamerGroups =
          this.__internal__getMissingShinyRoamerGroups(
            region,
            accessibleRoutes,
          );

        /*
         * Absolutely everything complete.
         */
        if (missingRoamerGroups.length === 0) {
          this.__internal__stopBecauseComplete();

          return false;
        }

        /*********************************************************************
         * ROAMER CLEANUP PHASE
         *********************************************************************/

        newPhase = "roamers";

        /*
         * First roaming group encountered in
         * PokéClicker's route ordering that still
         * contains a missing shiny Roamer.
         */
        const groupData = missingRoamerGroups[0];

        const groupRoutes = this.__internal__getRoutesForRoamingGroup(
          region,
          groupData.group,
          accessibleRoutes,
        );

        /*
         * Get x3 Roamer route.
         */
        const boostedRouteObservable =
          RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(
            region,
            groupData.group,
          );

        const boostedRoute = boostedRouteObservable
          ? boostedRouteObservable()
          : null;

        /*
         * Primary = x3 route if accessible.
         */
        newPrimary = boostedRoute
          ? (groupRoutes.find(
              (route) => route.number === boostedRoute.number,
            ) ?? groupRoutes[0])
          : groupRoutes[0];

        /*
         * Safety.
         */
        if (!newPrimary) {
          this.__internal__stopBecauseComplete();

          return false;
        }

        /*
         * Secondary =
         * next accessible route in the
         * same roaming group.
         */
        newSecondary = this.__internal__getNextRoute(groupRoutes, newPrimary);
      }
    }

    /*************************************************************************
     * DID ROUTE PLAN CHANGE?
     *************************************************************************/

    const routePlanChanged =
      force ||
      this.__internal__region !== region ||
      this.__internal__phase !== newPhase ||
      this.__internal__primaryRoute?.number !== newPrimary.number ||
      this.__internal__secondaryRoute?.number !== newSecondary?.number;

    if (!routePlanChanged) {
      return true;
    }

    /*************************************************************************
     * SAVE PLAN
     *************************************************************************/

    this.__internal__region = region;

    this.__internal__phase = newPhase;

    this.__internal__primaryRoute = newPrimary;

    this.__internal__secondaryRoute = newSecondary;

    this.__internal__singleRouteFallback = newSecondary === null;

    /*
     * IMPORTANT:
     *
     * Don't move here.
     *
     * The bounce function controls movement
     * synchronously.
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
    this.__internal__disableFocus();

    const message = this.__internal__includeShinyRoamers()
      ? "All accessible route Pokémon and Roamers in the current region already have their shiny registered.\nTurning the feature off"
      : "All accessible route Pokémon in the current region already have their shiny registered.\nTurning the feature off";

    Automation.Notifications.sendWarningNotif(
      message,

      "Focus - Shinies",
    );
  }
}
