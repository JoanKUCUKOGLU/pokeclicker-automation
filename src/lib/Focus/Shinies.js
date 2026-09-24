/**
 * @class AutomationFocusShinies
 *
 * Route shiny hunting Focus.
 *
 * The search alternates synchronously between two accessible routes so a fresh
 * wild encounter is generated on every move without waiting for normal Pokemon
 * to be defeated.
 *
 * Modes:
 * - New shinies only
 * - Any shiny
 *
 * Optional:
 * - Include shiny roamers. When enabled, the current x3 Roamer route is
 *   prioritised whenever it is accessible.
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
        "Hunts shiny Pokemon on routes by rapidly generating new encounters" +
        Automation.Menu.TooltipSeparator +
        "New shinies only: ignores species whose shiny is already owned.\n" +
        "Any shiny: catches every shiny encountered.\n" +
        "Optional shiny Roamers can also be hunted by prioritising the x3 Roamer route.",

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
    /*
     * Default hunting mode.
     */
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.HuntMode,
      this.__internal__huntModes.NewOnly,
    );

    /*
     * Shiny Roamers disabled by default.
     */
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

      "New shinies only: only stops on a shiny species you do not already own." +
        Automation.Menu.TooltipSeparator +
        "Any shiny: stops on every shiny encounter.",
    );

    container.appendChild(label);

    const select = Automation.Menu.createDropDownListElement(
      "Focus-Shinies-HuntMode-Select",
    );

    select.style.width = "100%";

    /*
     * NEW SHINIES ONLY
     */
    const newOnlyOption = document.createElement("option");

    newOnlyOption.value = this.__internal__huntModes.NewOnly;

    newOnlyOption.textContent = "New shinies only";

    select.options.add(newOnlyOption);

    /*
     * ANY SHINY
     */
    const anyOption = document.createElement("option");

    anyOption.value = this.__internal__huntModes.Any;

    anyOption.textContent = "Any shiny";

    select.options.add(anyOption);

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
     * Save mode when changed.
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

      "Also treats shiny Roamers as valid targets" +
        Automation.Menu.TooltipSeparator +
        "When enabled, the current x3 Roamer route is prioritised whenever it is accessible.\n" +
        "Non-shiny Roamers are skipped like any other normal encounter.",

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
   * LOOP SETTINGS
   ***************************************************************************/

  static __internal__loop = null;

  /*
   * Main control loop.
   */
  static __internal__loopIntervalMs = 5;

  /*
   * Number of complete route pairs generated
   * during one synchronous burst.
   *
   * 10 loops =
   * up to 20 freshly generated encounters.
   */
  static __internal__burstSize = 10;

  /***************************************************************************
   * ROUTES
   ***************************************************************************/

  static __internal__primaryRoute = null;

  static __internal__secondaryRoute = null;

  static __internal__region = null;

  static __internal__subRegionGroup = null;

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
     * Don't start inside a Gym,
     * Dungeon, Battle Frontier, etc.
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
     * NEW SHINY COMPLETION CHECK
     *************************************************************************/

    if (
      this.__internal__getHuntMode() === this.__internal__huntModes.NewOnly &&
      !this.__internal__hasAnyMissingShinyTarget()
    ) {
      this.__internal__stopBecauseComplete();

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
     * Keep Auto Click enabled.
     *
     * The synchronous bounce prevents normal Pokemon
     * on the primary route from consuming a complete
     * combat cycle.
     */
    Automation.Click.toggleAutoClick(true);

    /*************************************************************************
     * CAPTURE FILTER
     *************************************************************************/

    /*
     * Never throw Pokeballs while searching.
     *
     * It is enabled only when a wanted shiny
     * is actually detected.
     */
    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    this.__internal__lockedEnemy = null;

    /*************************************************************************
     * STARTING ROUTE
     *************************************************************************/

    /*
     * Park on secondary whenever possible.
     *
     * The synchronous burst will visit primary,
     * inspect the encounter, then immediately
     * return to secondary if it isn't wanted.
     */
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

    /*
     * Don't wait for first interval.
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
     * Remove temporary capture filter.
     */
    this.__internal__disableCaptureFilter();

    /*
     * Keep Auto Click enabled.
     */
    Automation.Click.toggleAutoClick(true);

    /*
     * Unlock normal Auto Click button.
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

    this.__internal__subRegionGroup = null;

    this.__internal__lockedEnemy = null;

    this.__internal__singleRouteFallback = false;
  }

  /************************\
    |*        LOOP        *|
    \************************/

  static __internal__tick() {
    /*
     * Auto Click stays ON.
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
     * Never move while Pokeball capture
     * animation is running.
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

    /*************************************************************************
     * COMPLETION
     *************************************************************************/

    if (
      this.__internal__getHuntMode() === this.__internal__huntModes.NewOnly &&
      !this.__internal__hasAnyMissingShinyTarget()
    ) {
      this.__internal__stopBecauseComplete();

      return;
    }

    const enemy = Battle.enemyPokemon();

    /*************************************************************************
     * SHINY LOCKED
     *************************************************************************/

    if (this.__internal__lockedEnemy !== null) {
      /*
       * Still fighting/catching the
       * exact same shiny.
       */
      if (enemy === this.__internal__lockedEnemy) {
        return;
      }

      /*
       * Enemy changed:
       * shiny encounter ended.
       */
      this.__internal__lockedEnemy = null;

      this.__internal__disableCaptureFilter();

      Automation.Click.toggleAutoClick(true);

      /*
       * New-only mode may now be complete.
       */
      if (
        this.__internal__getHuntMode() === this.__internal__huntModes.NewOnly &&
        !this.__internal__hasAnyMissingShinyTarget()
      ) {
        this.__internal__stopBecauseComplete();

        return;
      }
    }

    /*************************************************************************
     * ONLY ONE ROUTE AVAILABLE
     *************************************************************************/

    if (this.__internal__secondaryRoute === null) {
      this.__internal__singleRouteFallback = true;

      /*
       * Can't bounce.
       *
       * Let combat progress normally
       * but lock immediately if shiny.
       */
      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);
      }

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
     * Current encounter may already be shiny.
     */
    if (enemy && this.__internal__isWantedShiny(enemy)) {
      this.__internal__lockTarget(enemy);

      return;
    }

    /*************************************************************************
     * PARK ON SECONDARY
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
      /*
       * Safety.
       */
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * PRIMARY ROUTE
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        this.__internal__primaryRoute.number,

        this.__internal__region,
      );

      /*
       * Route movement generated a new
       * BattlePokemon synchronously.
       */
      enemy = Battle.enemyPokemon();

      /*
       * WANTED SHINY.
       *
       * Stop immediately on this route.
       */
      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }

      /*
       * Not wanted:
       *
       * do NOT wait,
       * immediately switch to secondary.
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
       * Secondary can also generate
       * a wanted shiny.
       */
      if (enemy && this.__internal__isWantedShiny(enemy)) {
        this.__internal__lockTarget(enemy);

        return;
      }
    }

    /*
     * Burst always ends on secondary.
     */
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
     * ROAMER CHECK
     *************************************************************************/

    const isRoamer = enemy.encounterType === EncounterType.roamer;

    /*
     * Ignore shiny Roamer if option disabled.
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
     * alreadyCaughtPokemon(id, true)
     * checks whether that shiny has already
     * been registered.
     */
    return !App.game.party.alreadyCaughtPokemon(enemy.id, true);
  }

  /************************\
    |*     LOCK SHINY     *|
    \************************/

  static __internal__lockTarget(enemy) {
    const selectedPokeball = this.__internal__getSelectedPokeball();

    /*
     * Ensure the configured Pokeball
     * is still available.
     */
    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableFocus();

      return;
    }

    /*
     * Lock exact BattlePokemon.
     */
    this.__internal__lockedEnemy = enemy;

    /*
     * Activate Pokeball automation only
     * while this wanted shiny is on screen.
     */
    Automation.Utils.Pokeball.catchEverythingWith(selectedPokeball);

    this.__internal__captureFilterEnabled = true;

    /*
     * Kill shiny normally.
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
    |*    ROUTE SCORE     *|
    \************************/

  /**
   * Calculates the percentage of weighted
   * encounters on this route that can still
   * give a new shiny.
   */
  static __internal__getRouteNewShinyScore(route) {
    let pokemonList;
    let weights;

    try {
      pokemonList = RouteHelper.getAvailablePokemonList(
        route.number,
        route.region,
      );

      weights = RouteHelper.getAvailablePokemonWeightList(
        route.number,
        route.region,
      );
    } catch (error) {
      return 0;
    }

    /*
     * No encounters.
     */
    if (!pokemonList?.length) {
      return 0;
    }

    /*
     * Safety fallback.
     */
    if (!weights?.length || weights.length !== pokemonList.length) {
      weights = pokemonList.map(() => 1);
    }

    let totalWeight = 0;

    let missingWeight = 0;

    for (let i = 0; i < pokemonList.length; i++) {
      const weight = Number(weights[i]) || 0;

      const pokemonName = pokemonList[i];

      const pokemon = PokemonHelper.getPokemonByName(pokemonName);

      totalWeight += weight;

      /*
       * This species still needs shiny.
       */
      if (!App.game.party.alreadyCaughtPokemon(pokemon.id, true)) {
        missingWeight += weight;
      }
    }

    if (totalWeight <= 0) {
      return 0;
    }

    /*
     * 0.00 -> no useful shiny
     * 1.00 -> every normal encounter is useful
     */
    return missingWeight / totalWeight;
  }

  /**
   * Route score for currently selected mode.
   */
  static __internal__getRouteScore(route) {
    /*
     * For Any Shiny every normal encounter
     * has equal shiny value.
     */
    if (this.__internal__getHuntMode() === this.__internal__huntModes.Any) {
      return 1;
    }

    return this.__internal__getRouteNewShinyScore(route);
  }

  /************************\
    |*     ROUTE PLAN     *|
    \************************/

  static __internal__refreshRoutePlan(force) {
    const region = player.region;

    /*
     * Reuse PokéClicker's roaming route groups.
     *
     * This keeps both bounce routes inside
     * a stable compatible route group.
     */
    const group = RoamingPokemonList.findGroup(region, player.subregion);

    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      region,
      group,
    );

    /*************************************************************************
     * AVAILABLE ROUTES
     *************************************************************************/

    const unlockedRoutes = Routes.getRoutesByRegion(region).filter(
      (route) =>
        groupSubRegions.includes(route.subRegion || 0) &&
        !Automation.Utils.Route.isInMagikarpJumpIsland(
          route.region,
          route.subRegion,
        ) &&
        Automation.Utils.Route.canMoveToRoute(route.number, region, route),
    );

    if (unlockedRoutes.length === 0) {
      Automation.Notifications.sendWarningNotif(
        "No unlocked route is available in the current route group.\nTurning the feature off",

        "Focus - Shinies",
      );

      this.__internal__disableFocus();

      return false;
    }

    /*************************************************************************
     * NORMAL SHINY ROUTE RANKING
     *************************************************************************/

    const rankedRoutes = [...unlockedRoutes].sort((a, b) => {
      const scoreA = this.__internal__getRouteScore(a);

      const scoreB = this.__internal__getRouteScore(b);

      /*
       * Highest useful-shiny percentage first.
       */
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      /*
       * Tie:
       * prefer later route.
       */
      return b.number - a.number;
    });

    let newPrimary = rankedRoutes[0];

    /*************************************************************************
     * SHINY ROAMER MODE
     *************************************************************************/

    if (this.__internal__includeShinyRoamers()) {
      /*
       * Find PokéClicker's current x3 Roamer route.
       */
      const boostedRoute =
        RoamingPokemonList.getIncreasedChanceRouteBySubRegionGroup(
          region,
          group,
        )?.();

      /*
       * Use it as primary whenever unlocked.
       */
      if (boostedRoute) {
        const boostedUnlocked = unlockedRoutes.find(
          (route) => route.number === boostedRoute.number,
        );

        if (boostedUnlocked) {
          newPrimary = boostedUnlocked;
        }
      }
    }

    /*************************************************************************
     * SECONDARY ROUTE
     *************************************************************************/

    /*
     * Secondary remains the best useful shiny
     * route that differs from primary.
     */
    const newSecondary =
      rankedRoutes.find((route) => route.number !== newPrimary.number) ?? null;

    /*************************************************************************
     * DID THE PLAN CHANGE?
     *************************************************************************/

    const changed =
      force ||
      this.__internal__region !== region ||
      this.__internal__subRegionGroup !== group ||
      this.__internal__primaryRoute?.number !== newPrimary.number ||
      this.__internal__secondaryRoute?.number !== newSecondary?.number;

    if (!changed) {
      return true;
    }

    const previousRegion = this.__internal__region;

    const previousGroup = this.__internal__subRegionGroup;

    /*
     * Save plan.
     */
    this.__internal__region = region;

    this.__internal__subRegionGroup = group;

    this.__internal__primaryRoute = newPrimary;

    this.__internal__secondaryRoute = newSecondary;

    this.__internal__singleRouteFallback = newSecondary === null;

    /*************************************************************************
     * GROUP CHANGE
     *************************************************************************/

    if (
      previousRegion !== null &&
      (previousRegion !== region || previousGroup !== group)
    ) {
      this.__internal__lockedEnemy = null;

      this.__internal__disableCaptureFilter();
    }

    /*
     * IMPORTANT:
     *
     * Do NOT automatically move to primary here.
     *
     * Only the synchronous bounce function
     * manages primary/secondary transitions.
     */
    return true;
  }

  /************************\
    |*   COMPLETION TEST  *|
    \************************/

  /**
   * Returns true if at least one currently
   * available shiny target is still missing.
   *
   * Used only by "New shinies only".
   */
  static __internal__hasAnyMissingShinyTarget() {
    if (
      this.__internal__region === null ||
      this.__internal__subRegionGroup === null
    ) {
      return false;
    }

    const groupSubRegions = RoamingPokemonList.getGroupSubRegions(
      this.__internal__region,
      this.__internal__subRegionGroup,
    );

    /*************************************************************************
     * NORMAL ROUTE POKEMON
     *************************************************************************/

    const routes = Routes.getRoutesByRegion(this.__internal__region).filter(
      (route) =>
        groupSubRegions.includes(route.subRegion || 0) &&
        Automation.Utils.Route.canMoveToRoute(
          route.number,
          this.__internal__region,
          route,
        ),
    );

    for (const route of routes) {
      let pokemonList = [];

      try {
        pokemonList = RouteHelper.getAvailablePokemonList(
          route.number,
          route.region,
        );
      } catch (error) {
        pokemonList = [];
      }

      for (const pokemonName of pokemonList) {
        const pokemon = PokemonHelper.getPokemonByName(pokemonName);

        /*
         * Missing shiny found.
         */
        if (!App.game.party.alreadyCaughtPokemon(pokemon.id, true)) {
          return true;
        }
      }
    }

    /*************************************************************************
     * ROAMERS
     *************************************************************************/

    if (this.__internal__includeShinyRoamers()) {
      const roamers = RoamingPokemonList.getSubRegionalGroupRoamers(
        this.__internal__region,
        this.__internal__subRegionGroup,
      );

      for (const data of roamers ?? []) {
        const pokemon = PokemonHelper.getPokemonByName(data.pokemon.name);

        /*
         * Missing shiny Roamer.
         */
        if (!App.game.party.alreadyCaughtPokemon(pokemon.id, true)) {
          return true;
        }
      }
    }

    return false;
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

    if (this.__internal__includeShinyRoamers()) {
      Automation.Notifications.sendWarningNotif(
        "All currently available route Pokemon and Roamers in this route group already have their shiny registered.\nTurning the feature off",

        "Focus - Shinies",
      );

      return;
    }

    Automation.Notifications.sendWarningNotif(
      "All currently available route Pokemon in this route group already have their shiny registered.\nTurning the feature off",

      "Focus - Shinies",
    );
  }
}
