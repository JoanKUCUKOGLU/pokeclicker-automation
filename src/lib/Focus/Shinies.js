/**
 * @class AutomationFocusShinies
 *
 * New shinies only:
 * - Keeps PokéClicker's native route order.
 * - With bounce ON:
 *   - A = first accessible route with at least one missing shiny.
 *   - B = next accessible route that ALSO has at least one missing shiny.
 *   - If only one incomplete route remains, a completed route is used as B.
 *   - Rapidly bounces A <-> B.
 * - With bounce OFF:
 *   - Hunts normally on route A until that route is complete.
 *   - Then moves to the next incomplete route.
 * - Optional shiny Roamers are caught when encountered.
 *
 * Any shiny:
 * - With bounce ON: bounces between two accessible routes.
 * - With bounce OFF: stays on the current accessible route and hunts normally.
 */
class AutomationFocusShinies {
  static __registerFunctionalities(functionalitiesList) {
    functionalitiesList.push({
      id: "Shinies",
      name: "Shinies",
      tooltip:
        "Hunts shiny Pokémon on routes" +
        Automation.Menu.TooltipSeparator +
        "Bounce ON: rapidly alternates between two routes.\n" +
        "Bounce OFF: hunts normally, route by route.\n" +
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

  static __buildAdvancedSettings(parent) {
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.HuntMode,
      this.__internal__huntModes.NewOnly,
    );

    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.EnableBounce,
      true,
    );

    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.IncludeShinyRoamers,
      false,
    );

    const container = document.createElement("div");
    container.style.paddingLeft = "10px";
    container.style.paddingRight = "10px";
    container.style.textAlign = "left";

    const label = document.createElement("span");
    label.innerText = "Shiny hunting mode :";
    label.classList.add("hasAutomationTooltip");
    label.setAttribute(
      "automation-tooltip-text",
      "New shinies only: completes routes in PokéClicker's native route order." +
        Automation.Menu.TooltipSeparator +
        "Any shiny: catches every shiny encounter and keeps hunting indefinitely.",
    );

    container.appendChild(label);

    const select = Automation.Menu.createDropDownListElement(
      "Focus-Shinies-HuntMode-Select",
    );

    select.style.width = "100%";

    const newOnlyOption = document.createElement("option");

    newOnlyOption.value = this.__internal__huntModes.NewOnly;

    newOnlyOption.textContent = "New shinies only - route by route";

    select.options.add(newOnlyOption);

    const anyOption = document.createElement("option");

    anyOption.value = this.__internal__huntModes.Any;

    anyOption.textContent = "Any shiny";

    select.options.add(anyOption);

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
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createElement("br"));

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Enable route bounce",

      this.__internal__advancedSettings.EnableBounce,

      "ON: rapidly switches between two routes to reroll encounters." +
        Automation.Menu.TooltipSeparator +
        "OFF: classic shiny hunting. Stay on one target route and fight normally until it is complete, then move to the next route.",

      container,
    );

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Include shiny roamers",

      this.__internal__advancedSettings.IncludeShinyRoamers,

      "Also catches shiny Roamers encountered while hunting routes" +
        Automation.Menu.TooltipSeparator +
        "After normal route shinies are complete, remaining shiny Roamers are hunted on their boosted route.",

      container,
    );

    parent.appendChild(container);
  }

  static __internal__advancedSettings = {
    HuntMode: "Focus-Shinies-HuntMode",

    EnableBounce: "Focus-Shinies-EnableBounce",

    IncludeShinyRoamers: "Focus-Shinies-IncludeShinyRoamers",
  };

  static __internal__huntModes = {
    NewOnly: "new",

    Any: "any",
  };

  static __internal__loop = null;

  static __internal__loopIntervalMs = 5;

  static __internal__burstSize = 10;

  static __internal__primaryRoute = null;

  static __internal__secondaryRoute = null;

  static __internal__region = null;

  static __internal__phase = null;

  static __internal__lockedEnemy = null;

  static __internal__lockedRoute = null;

  static __internal__captureFilterEnabled = false;

  static __internal__lastCompletedRoute = null;

  /*************************\
    |*        START        *|
    \*************************/

  static __internal__start() {
    if (this.__internal__loop !== null) {
      return;
    }

    if (!Automation.Focus.__ensureNoInstanceIsInProgress()) {
      return;
    }

    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    this.__internal__lastCompletedRoute = null;

    this.__internal__lockedRoute = null;

    if (!this.__internal__refreshRoutePlan(true)) {
      return;
    }

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,

      true,

      "The 'Focus on Shinies' feature is enabled",
    );

    Automation.Click.toggleAutoClick(true);

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    this.__internal__lockedEnemy = null;

    const initialRoute =
      this.__internal__secondaryRoute ?? this.__internal__primaryRoute;

    Automation.Utils.Route.moveToRoute(
      initialRoute.number,

      this.__internal__region,
    );

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

    this.__internal__disableCaptureFilter();

    Automation.Click.toggleAutoClick(true);

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,

      false,
    );

    this.__internal__primaryRoute = null;

    this.__internal__secondaryRoute = null;

    this.__internal__region = null;

    this.__internal__phase = null;

    this.__internal__lockedEnemy = null;

    this.__internal__lockedRoute = null;

    this.__internal__lastCompletedRoute = null;
  }

  /************************\
    |*        LOOP        *|
    \************************/

  static __internal__tick() {
    Automation.Click.toggleAutoClick(true);

    if (Automation.Utils.isInInstanceState()) {
      Automation.Focus.__ensureNoInstanceIsInProgress();

      return;
    }

    if (Battle.catching()) {
      return;
    }

    if (!this.__internal__refreshRoutePlan(false)) {
      return;
    }

    const enemy = Battle.enemyPokemon();

    /*************************************************************************
     * LOCKED SHINY
     *************************************************************************/

    if (this.__internal__lockedEnemy !== null) {
      if (enemy === this.__internal__lockedEnemy) {
        return;
      }

      const previousLockedRoute = this.__internal__lockedRoute;

      this.__internal__lockedEnemy = null;

      this.__internal__lockedRoute = null;

      this.__internal__disableCaptureFilter();

      Automation.Click.toggleAutoClick(true);

      if (
        previousLockedRoute &&
        this.__internal__getHuntMode() === this.__internal__huntModes.NewOnly
      ) {
        const routes = this.__internal__getAccessibleRoutes(
          previousLockedRoute.region,
        );

        const completedRoute = routes.find(
          (route) =>
            route.region === previousLockedRoute.region &&
            route.number === previousLockedRoute.number,
        );

        if (
          completedRoute &&
          !this.__internal__routeHasMissingShiny(completedRoute)
        ) {
          this.__internal__lastCompletedRoute = completedRoute;
        }
      }

      if (!this.__internal__refreshRoutePlan(true)) {
        return;
      }
    }

    /*************************************************************************
     * BOUNCE DISABLED
     *************************************************************************/

    if (!this.__internal__isBounceEnabled()) {
      this.__internal__huntNormallyOnPrimaryRoute();

      return;
    }

    /*************************************************************************
     * NO SECONDARY ROUTE
     *************************************************************************/

    if (this.__internal__secondaryRoute === null) {
      this.__internal__huntNormallyOnPrimaryRoute();

      return;
    }

    /*************************************************************************
     * FAST BOUNCE
     *************************************************************************/

    this.__internal__disableCaptureFilter();

    this.__internal__performBounceBurst();
  }

  /************************\
    |*   CLASSIC HUNT     *|
    \************************/

  static __internal__huntNormallyOnPrimaryRoute() {
    const targetRoute = this.__internal__primaryRoute;

    if (!targetRoute) {
      return;
    }

    /*
     * Search normally:
     * don't catch non-shiny Pokémon.
     */
    this.__internal__disableCaptureFilter();

    if (
      player.region !== this.__internal__region ||
      player.route !== targetRoute.number
    ) {
      Automation.Utils.Route.moveToRoute(
        targetRoute.number,

        this.__internal__region,
      );
    }

    const enemy = Battle.enemyPokemon();

    if (enemy && this.__internal__isWantedShiny(enemy)) {
      this.__internal__lockTarget(enemy);
    }
  }

  /******************************\
    |* SYNCHRONOUS BOUNCE BURST *|
    \******************************/

  static __internal__performBounceBurst() {
    const primaryRoute = this.__internal__primaryRoute;

    const secondaryRoute = this.__internal__secondaryRoute;

    if (!primaryRoute || !secondaryRoute) {
      return;
    }

    let enemy = Battle.enemyPokemon();

    if (enemy && this.__internal__isWantedShiny(enemy)) {
      this.__internal__lockTarget(enemy);

      return;
    }

    if (
      player.region !== this.__internal__region ||
      player.route !== secondaryRoute.number
    ) {
      Automation.Utils.Route.moveToRoute(
        secondaryRoute.number,

        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }
    }

    for (let i = 0; i < this.__internal__burstSize; i++) {
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * ROUTE A
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        primaryRoute.number,

        this.__internal__region,
      );

      enemy = Battle.enemyPokemon();

      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }

      /**********************************************************************
       * ROUTE B
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        secondaryRoute.number,

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
    if (!enemy?.shiny) {
      return false;
    }

    const isRoamer = enemy.encounterType === EncounterType.roamer;

    if (isRoamer && !this.__internal__includeShinyRoamers()) {
      return false;
    }

    if (this.__internal__getHuntMode() === this.__internal__huntModes.Any) {
      return true;
    }

    return !App.game.party.alreadyCaughtPokemon(
      enemy.id,

      true,
    );
  }

  /************************\
    |*     LOCK TARGET    *|
    \************************/

  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    this.__internal__lockedEnemy = enemy;

    this.__internal__lockedRoute = {
      region: player.region,

      number: player.route,
    };

    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

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
    |*      SETTINGS      *|
    \************************/

  static __internal__getSelectedPokeball() {
    return parseInt(
      Automation.Utils.LocalStorage.getValue(
        Automation.Focus.Settings.BallToUseToCatch,
      ),
    );
  }

  static __internal__getHuntMode() {
    const mode = Automation.Utils.LocalStorage.getValue(
      this.__internal__advancedSettings.HuntMode,
    );

    return Object.values(this.__internal__huntModes).includes(mode)
      ? mode
      : this.__internal__huntModes.NewOnly;
  }

  static __internal__isBounceEnabled() {
    return (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.EnableBounce,
      ) === "true"
    );
  }

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
     * Keep PokéClicker's native route order.
     */
    return Routes.getRoutesByRegion(region).filter(
      (route) =>
        !Automation.Utils.Route.isInMagikarpJumpIsland(
          route.region,

          route.subRegion,
        ) &&
        Automation.Utils.Route.canMoveToRoute(
          route.number,

          region,

          route,
        ),
    );
  }

  /************************\
    |* ROUTE POKÉMON LIST *|
    \************************/

  static __internal__getRoutePokemon(route) {
    try {
      return RouteHelper.getAvailablePokemonList(
        route.number,

        route.region,
      );
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
      if (seen.has(pokemonName)) {
        continue;
      }

      seen.add(pokemonName);

      const pokemon = PokemonHelper.getPokemonByName(pokemonName);

      if (!pokemon) {
        continue;
      }

      if (
        !App.game.party.alreadyCaughtPokemon(
          pokemon.id,

          true,
        )
      ) {
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
    return (
      routes.find((route) => this.__internal__routeHasMissingShiny(route)) ??
      null
    );
  }

  /************************\
    |* SECOND TARGET ROUTE*|
    \************************/

  static __internal__getNextIncompleteRoute(
    routes,

    targetRoute,
  ) {
    if (routes.length <= 1) {
      return null;
    }

    const targetIndex = routes.findIndex(
      (route) => route.number === targetRoute.number,
    );

    if (targetIndex === -1) {
      return (
        routes.find(
          (route) =>
            route.number !== targetRoute.number &&
            this.__internal__routeHasMissingShiny(route),
        ) ?? null
      );
    }

    for (let offset = 1; offset < routes.length; offset++) {
      const candidate = routes[(targetIndex + offset) % routes.length];

      if (candidate.number === targetRoute.number) {
        continue;
      }

      if (this.__internal__routeHasMissingShiny(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /************************\
    |* COMPLETED BOUNCE B *|
    \************************/

  static __internal__getCompletedBounceRoute(
    routes,

    targetRoute,
  ) {
    if (routes.length <= 1) {
      return null;
    }

    const isValidCompletedRoute = (route) =>
      route &&
      route.region === targetRoute.region &&
      route.number !== targetRoute.number &&
      !this.__internal__routeHasMissingShiny(route);

    /*************************************************************************
     * LAST COMPLETED
     *************************************************************************/

    if (this.__internal__lastCompletedRoute) {
      const rememberedRoute = routes.find(
        (route) =>
          route.region === this.__internal__lastCompletedRoute.region &&
          route.number === this.__internal__lastCompletedRoute.number,
      );

      if (isValidCompletedRoute(rememberedRoute)) {
        return rememberedRoute;
      }
    }

    /*************************************************************************
     * PREVIOUS ROUTE
     *************************************************************************/

    const targetIndex = routes.findIndex(
      (route) => route.number === targetRoute.number,
    );

    if (targetIndex !== -1) {
      for (let offset = 1; offset < routes.length; offset++) {
        const index = (targetIndex - offset + routes.length) % routes.length;

        const candidate = routes[index];

        if (isValidCompletedRoute(candidate)) {
          return candidate;
        }
      }
    }

    return routes.find(isValidCompletedRoute) ?? null;
  }

  /************************\
    |* GENERIC NEXT ROUTE *|
    \************************/

  static __internal__getNextRoute(
    routes,

    targetRoute,
  ) {
    if (routes.length <= 1) {
      return null;
    }

    const index = routes.findIndex(
      (route) => route.number === targetRoute.number,
    );

    if (index === -1) {
      return routes[0];
    }

    return routes[(index + 1) % routes.length];
  }

  /************************\
    |* MISSING ROAMERS    *|
    \************************/

  static __internal__getMissingShinyRoamerGroups(
    region,

    routes,
  ) {
    if (!this.__internal__includeShinyRoamers()) {
      return [];
    }

    const groups = new Map();

    for (const route of routes) {
      const group = RoamingPokemonList.findGroup(
        region,

        route.subRegion || 0,
      );

      if (groups.has(group)) {
        continue;
      }

      const roamers =
        RoamingPokemonList.getSubRegionalGroupRoamers(
          region,

          group,
        ) ?? [];

      const missingRoamers = roamers.filter((data) => {
        const pokemon = PokemonHelper.getPokemonByName(data.pokemon.name);

        return (
          pokemon &&
          !App.game.party.alreadyCaughtPokemon(
            pokemon.id,

            true,
          )
        );
      });

      if (missingRoamers.length > 0) {
        groups.set(
          group,

          missingRoamers,
        );
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

  static __internal__getRoutesForRoamingGroup(
    region,

    group,

    accessibleRoutes,
  ) {
    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,

      group,
    );

    return accessibleRoutes.filter((route) =>
      groupSubRegions.includes(route.subRegion || 0),
    );
  }

  /************************\
    |*     ROUTE PLAN     *|
    \************************/

  static __internal__refreshRoutePlan(force) {
    const region = player.region;

    const mode = this.__internal__getHuntMode();

    const bounceEnabled = this.__internal__isBounceEnabled();

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

      newPrimary =
        accessibleRoutes.find((route) => route.number === player.route) ??
        accessibleRoutes[0];

      newSecondary = bounceEnabled
        ? this.__internal__getNextRoute(
            accessibleRoutes,

            newPrimary,
          )
        : null;
    } else {

    /*************************************************************************
     * NEW SHINIES ONLY
     *************************************************************************/
      const firstIncompleteRoute =
        this.__internal__getFirstIncompleteRoute(accessibleRoutes);

      /***********************************************************************
       * NORMAL ROUTES REMAIN
       ***********************************************************************/

      if (firstIncompleteRoute !== null) {
        newPhase = "routes";

        newPrimary = firstIncompleteRoute;

        /*********************************************************************
         * CLASSIC HUNT
         *********************************************************************/

        if (!bounceEnabled) {
          newSecondary = null;
        } else {

        /*********************************************************************
         * BOUNCE
         *********************************************************************/
          newSecondary = this.__internal__getNextIncompleteRoute(
            accessibleRoutes,

            newPrimary,
          );

          /*
           * One incomplete route remains:
           * keep bouncing with a completed route.
           */
          if (newSecondary === null) {
            newSecondary = this.__internal__getCompletedBounceRoute(
              accessibleRoutes,

              newPrimary,
            );
          }
        }
      } else {

      /***********************************************************************
       * NORMAL ROUTES COMPLETE
       ***********************************************************************/
        const missingRoamerGroups =
          this.__internal__getMissingShinyRoamerGroups(
            region,

            accessibleRoutes,
          );

        if (missingRoamerGroups.length === 0) {
          this.__internal__stopBecauseComplete();

          return false;
        }

        newPhase = "roamers";

        const groupData = missingRoamerGroups[0];

        const groupRoutes = this.__internal__getRoutesForRoamingGroup(
          region,

          groupData.group,

          accessibleRoutes,
        );

        const boostedRouteObservable =
          RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(
            region,

            groupData.group,
          );

        const boostedRoute = boostedRouteObservable
          ? boostedRouteObservable()
          : null;

        newPrimary = boostedRoute
          ? (groupRoutes.find(
              (route) => route.number === boostedRoute.number,
            ) ?? groupRoutes[0])
          : groupRoutes[0];

        if (!newPrimary) {
          this.__internal__stopBecauseComplete();

          return false;
        }

        /*
         * Bounce OFF:
         * normal hunting on boosted route.
         *
         * Bounce ON:
         * boosted route <-> another route.
         */
        newSecondary = bounceEnabled
          ? this.__internal__getNextRoute(
              groupRoutes,

              newPrimary,
            )
          : null;
      }
    }

    const routePlanChanged =
      force ||
      this.__internal__region !== region ||
      this.__internal__phase !== newPhase ||
      this.__internal__primaryRoute?.number !== newPrimary.number ||
      this.__internal__secondaryRoute?.number !== newSecondary?.number;

    if (!routePlanChanged) {
      return true;
    }

    this.__internal__region = region;

    this.__internal__phase = newPhase;

    this.__internal__primaryRoute = newPrimary;

    this.__internal__secondaryRoute = newSecondary;

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
