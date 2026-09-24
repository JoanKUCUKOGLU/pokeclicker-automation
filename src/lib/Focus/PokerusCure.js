/**
 * @class AutomationFocusPokerusCure
 *
 * Route logic:
 * - A = first accessible route with a currently available Contagious Pokémon.
 * - B = next accessible route in the same region with a currently available Contagious Pokémon.
 * - A <-> B is spammed to reroll encounters quickly.
 * - Contagious Pokémon found on either A or B are caught.
 * - If only one Contagious route remains, a completed accessible route is used as B,
 *   so the fast bounce remains active until the final route is finished.
 * - When no eligible route remains, the normal dungeon logic is used.
 */
class AutomationFocusPokerusCure {
  static __registerFunctionalities(functionalitiesList) {
    this.__internal__buildPokerusRouteList();
    this.__internal__buildPokerusDungeonList();

    functionalitiesList.push({
      id: "PokerusCure",
      name: "Pokérus cure",
      tooltip:
        "Hunts for pokémons that are infected by the pokérus" +
        Automation.Menu.TooltipSeparator +
        "Pokémons get resistant to the pokérus once they reach 50 EVs.\n" +
        "On routes, switches rapidly between two routes and catches Contagious pokémons on both.\n" +
        "If only one target route remains, a completed route is used to keep the bounce active.",
      run: this.__internal__start.bind(this),
      stop: this.__internal__stop.bind(this),
      isUnlocked: () => App.game.keyItems.hasKeyItem(KeyItemType.Pokerus_virus),
      refreshRateAsMs: Automation.Focus.__noFunctionalityRefresh,
    });
  }

  static __buildAdvancedSettings(parent) {
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.AllowBeastBallUsage,
      false,
    );

    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.SkipAlternateForms,
      false,
    );

    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.IncludeMimicPokemons,
      true,
    );

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Use Beastballs to catch UltraBeast pokémons",
      this.__internal__advancedSettings.AllowBeastBallUsage,
      "Allows the automation to use Beastball to catch UltraBeast pokémons." +
        Automation.Menu.TooltipSeparator +
        "If this option is disabled, or you don't have Beastballs,\nUltraBeast pokémons will be ignored.",
      parent,
    );

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Skip Alternate form pokémons",
      this.__internal__advancedSettings.SkipAlternateForms,
      "If enabled, only pokémon's base form will be considered",
      parent,
    );

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Include mimic pokémons from dungeon chests",
      this.__internal__advancedSettings.IncludeMimicPokemons,
      "If enabled, the dungeon automation will force chest pickup",
      parent,
    );
  }

  static __internal__advancedSettings = {
    AllowBeastBallUsage: "Focus-PokerusCure-AllowBeastBallUsage",

    IncludeMimicPokemons: "Focus-PokerusCure-IncludeMimicPokemons",

    SkipAlternateForms: "Focus-PokerusCure-SkipAlternateForms",
  };

  static __internal__pokerusCureLoop = null;

  static __internal__pokerusRouteData = [];

  static __internal__pokerusDungeonData = [];

  static __internal__currentRouteData = null;

  static __internal__currentDungeonData = null;

  static __internal__secondaryRoute = null;

  static __internal__lockedEnemy = null;

  static __internal__lockedRoute = null;

  static __internal__lastCompletedRoute = null;

  static __internal__captureFilterEnabled = false;

  static __internal__loopIntervalMs = 5;

  static __internal__burstSize = 10;

  static __internal__lastDungeonActionAt = 0;

  static __internal__dungeonActionIntervalMs = 500;

  /*************************\
    |*        START        *|
    \*************************/

  static __internal__start() {
    if (this.__internal__pokerusCureLoop !== null) {
      return;
    }

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      true,
      "The 'Focus on Pokérus cure' feature is enabled",
    );

    Automation.Click.toggleAutoClick(true);

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    this.__internal__lockedEnemy = null;

    this.__internal__lockedRoute = null;

    this.__internal__secondaryRoute = null;

    this.__internal__lastCompletedRoute = null;

    this.__internal__lastDungeonActionAt = 0;

    this.__internal__pokerusCureLoop = setInterval(
      this.__internal__focusOnPokerusCure.bind(this),

      this.__internal__loopIntervalMs,
    );

    this.__internal__focusOnPokerusCure();
  }

  /************************\
    |*        STOP        *|
    \************************/

  static __internal__stop() {
    this.__internal__currentRouteData = null;

    this.__internal__currentDungeonData = null;

    this.__internal__secondaryRoute = null;

    this.__internal__lockedEnemy = null;

    this.__internal__lockedRoute = null;

    this.__internal__lastCompletedRoute = null;

    this.__internal__lastDungeonActionAt = 0;

    if (this.__internal__pokerusCureLoop !== null) {
      clearInterval(this.__internal__pokerusCureLoop);
    }

    this.__internal__pokerusCureLoop = null;

    Automation.Utils.Pokeball.disableAutomationFilter();

    this.__internal__captureFilterEnabled = false;

    Automation.Click.toggleAutoClick();

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      false,
    );
  }

  /************************\
    |*      MAIN LOOP     *|
    \************************/

  static __internal__focusOnPokerusCure() {
    Automation.Click.toggleAutoClick(true);

    if (Automation.Utils.isInInstanceState()) {
      if (
        this.__internal__currentDungeonData == null ||
        !this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
          this.__internal__currentDungeonData.dungeon,

          true,
        )
      ) {
        Automation.Focus.__ensureNoInstanceIsInProgress();
      }

      return;
    }

    if (Battle.catching()) {
      return;
    }

    const currentEnemy = Battle.enemyPokemon();

    /*************************************************************************
     * LOCKED CONTAGIOUS ENCOUNTER
     *************************************************************************/

    if (this.__internal__lockedEnemy !== null) {
      if (currentEnemy === this.__internal__lockedEnemy) {
        return;
      }

      const previousLockedRoute = this.__internal__lockedRoute;

      this.__internal__lockedEnemy = null;

      this.__internal__lockedRoute = null;

      this.__internal__disableCaptureFilter();

      Automation.Click.toggleAutoClick(true);

      /*
       * Remember the most recently completed route.
       *
       * This works whether the Pokémon was caught
       * on route A or route B.
       */
      if (previousLockedRoute) {
        const route = this.__internal__findRouteObject(
          previousLockedRoute.region,

          previousLockedRoute.number,
        );

        if (
          route &&
          !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
            route,

            true,
          )
        ) {
          this.__internal__lastCompletedRoute = route;
        }
      }

      /*
       * Route A may now be complete.
       */
      if (
        this.__internal__currentRouteData &&
        !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
          this.__internal__currentRouteData.route,

          true,
        )
      ) {
        this.__internal__currentRouteData = null;

        this.__internal__secondaryRoute = null;
      }
    }

    /*************************************************************************
     * ROUTE A STILL HAS CONTAGIOUS TARGETS
     *************************************************************************/

    if (
      this.__internal__currentRouteData &&
      this.__internal__doesRouteHaveAnyPokemonNeedingCure(
        this.__internal__currentRouteData.route,

        true,
      )
    ) {
      this.__internal__captureInfectedPokemons();

      return;
    }

    /*************************************************************************
     * FIND NEXT ROUTE A
     *************************************************************************/

    this.__internal__setNextPokerusRoute();

    if (this.__internal__currentRouteData) {
      this.__internal__captureInfectedPokemons();

      return;
    }

    /*************************************************************************
     * NO ROUTE TARGET LEFT
     *************************************************************************/

    this.__internal__secondaryRoute = null;

    this.__internal__disableCaptureFilter();

    /*************************************************************************
     * DUNGEON
     *************************************************************************/

    if (
      this.__internal__currentDungeonData &&
      this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
        this.__internal__currentDungeonData.dungeon,

        true,
      )
    ) {
      this.__internal__captureInfectedPokemons();

      return;
    }

    this.__internal__setNextPokerusDungeon();

    if (this.__internal__currentDungeonData) {
      this.__internal__captureInfectedPokemons();

      return;
    }

    /*************************************************************************
     * COMPLETE
     *************************************************************************/

    Automation.Menu.forceAutomationState(
      Automation.Focus.Settings.FeatureEnabled,
      false,
    );

    Automation.Notifications.sendWarningNotif(
      "No more route, nor dungeon, available to cure pokémon from pokérus.\nTurning the feature off",

      "Focus",
    );
  }

  /************************\
    |*      CAPTURE       *|
    \************************/

  static __internal__captureInfectedPokemons() {
    Automation.Focus.__equipLoadout(
      Automation.Utils.OakItem.Setup.PokemonCatch,
    );

    const selectedPokeball = this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(selectedPokeball)) {
      this.__internal__disableCaptureFilter();

      return;
    }

    if (this.__internal__currentRouteData) {
      this.__internal__captureContagiousOnRoute();

      return;
    }

    this.__internal__captureContagiousInDungeon();
  }

  /*********************************************************************\
    |***                    ROUTE FAST BOUNCE                         ***|
    \*********************************************************************/

  static __internal__captureContagiousOnRoute() {
    const routeA = this.__internal__currentRouteData.route;

    /*
     * Prefer:
     *
     * A = Contagious
     * B = Contagious
     *
     * But if A is the final target route:
     *
     * A = Contagious
     * B = completed route
     */
    const routeB = this.__internal__getBestSecondaryRoute(routeA);

    if (
      this.__internal__secondaryRoute?.region !== routeB?.region ||
      this.__internal__secondaryRoute?.number !== routeB?.number
    ) {
      this.__internal__secondaryRoute = routeB;
    }

    /*
     * Search mode:
     * don't catch normal Pokémon.
     */
    this.__internal__disableCaptureFilter();

    const currentEnemy = Battle.enemyPokemon();

    if (this.__internal__isWantedContagiousEnemy(currentEnemy)) {
      this.__internal__lockContagiousEnemy(currentEnemy);

      return;
    }

    /*
     * This should only happen if there is
     * literally no second accessible route.
     */
    if (!this.__internal__secondaryRoute) {
      if (player.region !== routeA.region || player.route !== routeA.number) {
        Automation.Utils.Route.moveToRoute(
          routeA.number,

          routeA.region,
        );
      }

      return;
    }

    this.__internal__performRouteBounceBurst();
  }

  /******************************\
    |* SYNCHRONOUS BOUNCE BURST *|
    \******************************/

  static __internal__performRouteBounceBurst() {
    const routeA = this.__internal__currentRouteData?.route;

    const routeB = this.__internal__secondaryRoute;

    if (!routeA || !routeB) {
      return;
    }

    let enemy = Battle.enemyPokemon();

    /*************************************************************************
     * CURRENT ENCOUNTER
     *************************************************************************/

    if (this.__internal__isWantedContagiousEnemy(enemy)) {
      this.__internal__lockContagiousEnemy(enemy);

      return;
    }

    /*************************************************************************
     * PARK ON B
     *************************************************************************/

    if (player.region !== routeB.region || player.route !== routeB.number) {
      Automation.Utils.Route.moveToRoute(
        routeB.number,

        routeB.region,
      );

      enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);

        return;
      }
    }

    /*************************************************************************
     * A <-> B
     *************************************************************************/

    for (let i = 0; i < this.__internal__burstSize; i++) {
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * ROUTE A
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        routeA.number,

        routeA.region,
      );

      enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);

        return;
      }

      /**********************************************************************
       * ROUTE B
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        routeB.number,

        routeB.region,
      );

      enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);

        return;
      }
    }
  }

  /************************\
    |*   BEST ROUTE B     *|
    \************************/

  static __internal__getBestSecondaryRoute(routeA) {
    /*
     * First try to use another route
     * containing Contagious Pokémon.
     */
    const contagiousRoute = this.__internal__getNextContagiousRoute(routeA);

    if (contagiousRoute) {
      return contagiousRoute;
    }

    /*
     * Only A remains.
     *
     * Keep the fast reroll by using
     * a completed route as B.
     */
    return this.__internal__getCompletedBounceRoute(routeA);
  }

  /************************\
    |* CONTAGIOUS ROUTE B *|
    \************************/

  static __internal__getNextContagiousRoute(routeA) {
    const indexA = this.__internal__pokerusRouteData.findIndex(
      (data) =>
        data.route.region === routeA.region &&
        data.route.number === routeA.number,
    );

    if (indexA === -1) {
      return null;
    }

    for (
      let offset = 1;
      offset < this.__internal__pokerusRouteData.length;
      offset++
    ) {
      const route =
        this.__internal__pokerusRouteData[
          (indexA + offset) % this.__internal__pokerusRouteData.length
        ].route;

      if (route.region !== routeA.region || route.number === routeA.number) {
        continue;
      }

      if (
        !Automation.Utils.Route.canMoveToRoute(
          route.number,

          route.region,

          route,
        )
      ) {
        continue;
      }

      if (
        !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
          route,

          true,
        )
      ) {
        continue;
      }

      return route;
    }

    return null;
  }

  /************************\
    |* COMPLETED ROUTE B  *|
    \************************/

  static __internal__getCompletedBounceRoute(routeA) {
    /*
     * IMPORTANT:
     *
     * Use ALL routes in the region here,
     * not only __internal__pokerusRouteData.
     *
     * This means the feature still works
     * if it is started when there is already
     * only ONE Contagious route remaining.
     */
    const routes = Routes.getRoutesByRegion(routeA.region);

    const isValid = (route) =>
      route &&
      route.number !== routeA.number &&
      Automation.Utils.Route.canMoveToRoute(
        route.number,

        route.region,

        route,
      ) &&
      !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
        route,

        true,
      );

    /*************************************************************************
     * 1. MOST RECENTLY COMPLETED ROUTE
     *************************************************************************/

    if (this.__internal__lastCompletedRoute) {
      const remembered = routes.find(
        (route) =>
          route.number === this.__internal__lastCompletedRoute.number &&
          route.region === this.__internal__lastCompletedRoute.region,
      );

      if (isValid(remembered)) {
        return remembered;
      }
    }

    /*************************************************************************
     * 2. PREVIOUS COMPLETED ROUTE
     *************************************************************************/

    const indexA = routes.findIndex((route) => route.number === routeA.number);

    if (indexA !== -1) {
      for (let offset = 1; offset < routes.length; offset++) {
        const route = routes[(indexA - offset + routes.length) % routes.length];

        if (isValid(route)) {
          return route;
        }
      }
    }

    /*************************************************************************
     * 3. ANY COMPLETED ACCESSIBLE ROUTE
     *************************************************************************/

    return routes.find(isValid) ?? null;
  }

  /************************\
    |*  CONTAGIOUS CHECK  *|
    \************************/

  static __internal__isWantedContagiousEnemy(enemy) {
    if (!enemy?.name) {
      return false;
    }

    const partyPokemon = App.game.party.getPokemonByName(enemy.name);

    if (partyPokemon?.pokerus !== GameConstants.Pokerus.Contagious) {
      return false;
    }

    /*************************************************************************
     * ALTERNATE FORMS
     *************************************************************************/

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.SkipAlternateForms,
      ) === "true" &&
      !Number.isInteger(enemy.id)
    ) {
      return false;
    }

    /*************************************************************************
     * ULTRA BEAST
     *************************************************************************/

    if (GameConstants.UltraBeastType[enemy.name] != undefined) {
      const allowed =
        Automation.Utils.LocalStorage.getValue(
          this.__internal__advancedSettings.AllowBeastBallUsage,
        ) === "true";

      const hasBall =
        App.game.pokeballs.getBallQuantity(GameConstants.Pokeball.Beastball) >
        0;

      if (!allowed || !hasBall) {
        return false;
      }
    }

    return true;
  }

  /************************\
    |*     LOCK TARGET    *|
    \************************/

  static __internal__lockContagiousEnemy(enemy) {
    const pokeballToUse =
      GameConstants.UltraBeastType[enemy.name] != undefined
        ? GameConstants.Pokeball.Beastball
        : this.__internal__getSelectedPokeball();

    if (!Automation.Focus.__ensurePlayerHasEnoughBalls(pokeballToUse)) {
      this.__internal__disableCaptureFilter();

      return;
    }

    this.__internal__lockedEnemy = enemy;

    /*
     * Save which route produced the encounter.
     *
     * This allows B to become the final
     * completed bounce route if needed.
     */
    this.__internal__lockedRoute = {
      region: player.region,

      number: player.route,
    };

    Automation.Utils.Pokeball.onlyCatchContagiousWith(pokeballToUse);

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
    |*   FIND ROUTE OBJ   *|
    \************************/

  static __internal__findRouteObject(
    region,

    number,
  ) {
    return (
      this.__internal__pokerusRouteData.find(
        (data) => data.route.region === region && data.route.number === number,
      )?.route ??
      Routes.getRoutesByRegion(region).find(
        (route) => route.number === number,
      ) ??
      null
    );
  }

  /*********************************************************************\
    |***                     DUNGEON MODE                            ***|
    \*********************************************************************/

  static __internal__captureContagiousInDungeon() {
    if (!this.__internal__currentDungeonData) {
      return;
    }

    const now = Date.now();

    if (
      now - this.__internal__lastDungeonActionAt <
      this.__internal__dungeonActionIntervalMs
    ) {
      return;
    }

    this.__internal__lastDungeonActionAt = now;

    const selectedPokeball = this.__internal__getSelectedPokeball();

    const data = this.__internal__currentDungeonData;

    /*************************************************************************
     * TOKENS
     *************************************************************************/

    if (
      App.game.wallet.currencies[GameConstants.Currency.dungeonToken]() <
      data.dungeon.tokenCost
    ) {
      this.__internal__disableCaptureFilter();

      Automation.Focus.__goToBestRouteForDungeonToken();

      return;
    }

    /*************************************************************************
     * BALL
     *************************************************************************/

    const pokeballToUse = data.needsBeastBall
      ? GameConstants.Pokeball.Beastball
      : selectedPokeball;

    Automation.Utils.Pokeball.onlyCatchContagiousWith(pokeballToUse);

    this.__internal__captureFilterEnabled = true;

    /*************************************************************************
     * MOVE
     *************************************************************************/

    if (!Automation.Utils.Route.isPlayerInTown(data.dungeon.name)) {
      Automation.Utils.Route.moveToTown(data.dungeon.name);

      setTimeout(
        this.__internal__captureInfectedPokemons.bind(this),

        1000,
      );

      return;
    }

    /*************************************************************************
     * AUTO DUNGEON
     *************************************************************************/

    Automation.Menu.forceAutomationState(
      Automation.Dungeon.Settings.FeatureEnabled,

      true,
    );

    Automation.Dungeon.setBeforeNewRunCallBack(
      function () {
        if (
          !this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
            data.dungeon,

            true,
          )
        ) {
          this.__internal__focusOnPokerusCure();
        }
      }.bind(this),
    );

    Automation.Dungeon.AutomationRequestedModes =
      this.__internal__doesAnyPokemonNeedCuring(
        data.nonBossPokemons,

        true,
      )
        ? [Automation.Dungeon.InternalModes.ForcePokemonFight]
        : [Automation.Dungeon.InternalModes.ForceDungeonCompletion];

    /*************************************************************************
     * MIMICS
     *************************************************************************/

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.IncludeMimicPokemons,
      ) === "true" &&
      this.__internal__doesAnyPokemonNeedCuring(
        data.mimicPokemons,

        true,
      )
    ) {
      Automation.Dungeon.AutomationRequestedModes.push(
        Automation.Dungeon.InternalModes.ForceChestOpening,
      );
    }
  }

  /************************\
    |*     NEXT ROUTE A   *|
    \************************/

  static __internal__setNextPokerusRoute() {
    if (
      this.__internal__currentRouteData &&
      !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
        this.__internal__currentRouteData.route,
      )
    ) {
      const index = this.__internal__pokerusRouteData.indexOf(
        this.__internal__currentRouteData,
      );

      if (index !== -1) {
        this.__internal__pokerusRouteData.splice(
          index,

          1,
        );
      }
    }

    const previous = this.__internal__currentRouteData?.route;

    this.__internal__currentRouteData =
      this.__internal__pokerusRouteData.find(
        (data) =>
          this.__internal__doesRouteHaveAnyPokemonNeedingCure(
            data.route,

            true,
          ) &&
          Automation.Utils.Route.canMoveToRoute(
            data.route.number,

            data.route.region,

            data.route,
          ),
      ) ?? null;

    if (!this.__internal__currentRouteData) {
      this.__internal__secondaryRoute = null;

      return;
    }

    this.__internal__currentRouteData.needsBeastBall =
      this.__internal__doesRouteNeedBeastBalls(
        this.__internal__currentRouteData.route,
      );

    this.__internal__currentDungeonData = null;

    const current = this.__internal__currentRouteData.route;

    if (
      previous?.number !== current.number ||
      previous?.region !== current.region
    ) {
      this.__internal__secondaryRoute = null;

      this.__internal__lockedEnemy = null;

      this.__internal__lockedRoute = null;

      this.__internal__disableCaptureFilter();
    }
  }

  /************************\
    |*    NEXT DUNGEON    *|
    \************************/

  static __internal__setNextPokerusDungeon() {
    if (
      this.__internal__currentDungeonData &&
      !this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
        this.__internal__currentDungeonData.dungeon,
      )
    ) {
      const index = this.__internal__pokerusDungeonData.indexOf(
        this.__internal__currentDungeonData,
      );

      if (index !== -1) {
        this.__internal__pokerusDungeonData.splice(
          index,

          1,
        );
      }
    }

    this.__internal__currentDungeonData =
      this.__internal__pokerusDungeonData.find(
        (data) =>
          this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
            data.dungeon,

            true,
          ) &&
          Automation.Utils.Route.canMoveToTown(TownList[data.dungeon.name]),
      ) ?? null;

    if (!this.__internal__currentDungeonData) {
      return;
    }

    this.__internal__currentRouteData = null;

    this.__internal__secondaryRoute = null;

    const data = this.__internal__currentDungeonData;

    data.nonBossPokemons = this.__internal__getEveryPokemonForDungeon(
      data.dungeon,

      false,

      true,
    );

    data.mimicPokemons = this.__internal__getEveryMimicPokemonForDungeon(
      data.dungeon,
    );

    data.needsBeastBall = this.__internal__doesDungeonNeedBeastBalls(
      data.dungeon,
    );
  }

  /************************\
    |*     ROUTE LIST     *|
    \************************/

  static __internal__buildPokerusRouteList() {
    this.__internal__pokerusRouteData = [];

    for (const route of Routes.regionRoutes) {
      if (
        route.region <= GameConstants.MAX_AVAILABLE_REGION &&
        this.__internal__doesRouteHaveAnyPokemonNeedingCure(route)
      ) {
        this.__internal__pokerusRouteData.push({
          route,
        });
      }
    }

    /*
     * Preserve original behaviour:
     * Magikarp Jump routes last.
     */
    this.__internal__pokerusRouteData.sort((a, b) => {
      const aMagikarp = Automation.Utils.Route.isInMagikarpJumpIsland(
        a.route.region,

        a.route.subRegion,
      );

      const bMagikarp = Automation.Utils.Route.isInMagikarpJumpIsland(
        b.route.region,

        b.route.subRegion,
      );

      if (aMagikarp && !bMagikarp) {
        return 1;
      }

      if (bMagikarp && !aMagikarp) {
        return -1;
      }

      return 0;
    });
  }

  /************************\
    |*    DUNGEON LIST    *|
    \************************/

  static __internal__buildPokerusDungeonList() {
    this.__internal__pokerusDungeonData = [];

    for (const dungeonName of Object.keys(dungeonList)) {
      const town = TownList[dungeonName];

      if (town.region > GameConstants.MAX_AVAILABLE_REGION) {
        continue;
      }

      const dungeon = dungeonList[dungeonName];

      if (this.__internal__doesDungeonHaveAnyPokemonNeedingCure(dungeon)) {
        this.__internal__pokerusDungeonData.push({
          dungeon,
        });
      }
    }
  }

  /************************\
    |* ROUTE NEEDS CURE   *|
    \************************/

  static __internal__doesRouteHaveAnyPokemonNeedingCure(
    route,

    onlyConsiderAvailableContagiousPokemons = false,
  ) {
    return this.__internal__doesAnyPokemonNeedCuring(
      this.__internal__getEveryPokemonForRoute(
        route,

        onlyConsiderAvailableContagiousPokemons,
      ),

      onlyConsiderAvailableContagiousPokemons,
    );
  }

  /************************\
    |* DUNGEON NEEDS CURE *|
    \************************/

  static __internal__doesDungeonHaveAnyPokemonNeedingCure(
    dungeon,

    onlyConsiderAvailableContagiousPokemons = false,
  ) {
    const pokemonList = this.__internal__getEveryPokemonForDungeon(
      dungeon,

      onlyConsiderAvailableContagiousPokemons,
    );

    if (
      this.__internal__doesAnyPokemonNeedCuring(
        pokemonList,

        onlyConsiderAvailableContagiousPokemons,
      )
    ) {
      return true;
    }

    if (
      onlyConsiderAvailableContagiousPokemons &&
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.IncludeMimicPokemons,
      ) !== "true"
    ) {
      return false;
    }

    return this.__internal__doesAnyPokemonNeedCuring(
      this.__internal__getEveryMimicPokemonForDungeon(dungeon),

      onlyConsiderAvailableContagiousPokemons,
    );
  }

  /************************\
    |* POKÉMON NEEDS CURE *|
    \************************/

  static __internal__doesAnyPokemonNeedCuring(
    pokemonList,

    onlyConsiderAvailableContagiousPokemons,
  ) {
    const skipUltraBeasts =
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.AllowBeastBallUsage,
      ) === "false" ||
      App.game.pokeballs.getBallQuantity(GameConstants.Pokeball.Beastball) ===
        0;

    return pokemonList.some((pokemonName) => {
      const pokemon = App.game.party.getPokemonByName(pokemonName);

      if (
        onlyConsiderAvailableContagiousPokemons &&
        skipUltraBeasts &&
        GameConstants.UltraBeastType[pokemonName] != undefined
      ) {
        return false;
      }

      return (
        pokemon?.pokerus != GameConstants.Pokerus.Resistant &&
        (!onlyConsiderAvailableContagiousPokemons ||
          pokemon?.pokerus == GameConstants.Pokerus.Contagious)
      );
    });
  }

  /************************\
    |* ROUTE BEAST BALL   *|
    \************************/

  static __internal__doesRouteNeedBeastBalls(route) {
    return this.__internal__getEveryPokemonForRoute(
      route,

      true,
    ).every((pokemonName) => {
      const pokemon = App.game.party.getPokemonByName(pokemonName);

      return (
        pokemon?.pokerus != GameConstants.Pokerus.Contagious ||
        GameConstants.UltraBeastType[pokemonName] != undefined
      );
    });
  }

  /************************\
    |* DUNGEON BEAST BALL *|
    \************************/

  static __internal__doesDungeonNeedBeastBalls(dungeon) {
    let pokemonList = this.__internal__getEveryPokemonForDungeon(
      dungeon,

      true,
    );

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.IncludeMimicPokemons,
      ) === "true"
    ) {
      pokemonList = pokemonList.concat(
        this.__internal__getEveryMimicPokemonForDungeon(dungeon),
      );
    }

    return pokemonList.every((pokemonName) => {
      const pokemon = App.game.party.getPokemonByName(pokemonName);

      return (
        pokemon?.pokerus != GameConstants.Pokerus.Contagious ||
        GameConstants.UltraBeastType[pokemonName] != undefined
      );
    });
  }

  /************************\
    |*   ROUTE POKÉMON    *|
    \************************/

  static __internal__getEveryPokemonForRoute(
    route,

    onlyConsiderAvailablePokemons,
  ) {
    const possiblePokemons = Routes.getRoute(
      route.region,

      route.number,
    )?.pokemon;

    if (!possiblePokemons) {
      return ["Rattata"];
    }

    let pokemonList = [...possiblePokemons.land];

    /*************************************************************************
     * WATER
     *************************************************************************/

    if (
      !onlyConsiderAvailablePokemons ||
      pokemonList.length === 0 ||
      App.game.keyItems.hasKeyItem(KeyItemType.Super_rod)
    ) {
      pokemonList = pokemonList.concat(possiblePokemons.water);
    }

    /*************************************************************************
     * HEADBUTT
     *************************************************************************/

    pokemonList = pokemonList.concat(possiblePokemons.headbutt);

    /*************************************************************************
     * SPECIAL
     *************************************************************************/

    let specialPokemonList = [...possiblePokemons.special];

    if (onlyConsiderAvailablePokemons) {
      specialPokemonList = specialPokemonList.filter((p) =>
        this.__internal__isRequirementCompleted(
          p.req,

          route.region,
        ),
      );
    }

    pokemonList = pokemonList.concat(
      ...specialPokemonList.map((p) => p.pokemon),
    );

    /*************************************************************************
     * REMOVE DUPLICATES
     *************************************************************************/

    pokemonList = pokemonList.filter(
      (item, index) => pokemonList.indexOf(item) === index,
    );

    /*************************************************************************
     * ALTERNATE FORMS
     *************************************************************************/

    if (
      onlyConsiderAvailablePokemons &&
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.SkipAlternateForms,
      ) === "true"
    ) {
      pokemonList = pokemonList.filter((pokemonName) =>
        Number.isInteger(pokemonMap[pokemonName].id),
      );
    }

    return pokemonList;
  }

  /************************\
    |*  DUNGEON POKÉMON   *|
    \************************/

  static __internal__getEveryPokemonForDungeon(
    dungeon,

    onlyConsiderAvailablePokemons,

    skipBosses = false,
  ) {
    let pokemonList = this.__internal__getPokemonNames(
      dungeon.normalEncounterList,

      onlyConsiderAvailablePokemons,
    );

    if (!skipBosses) {
      const dungeonRegion = TownList[dungeon.name].region;

      for (const boss of dungeon.bossList) {
        /*********************************************************************
         * POKÉMON BOSS
         *********************************************************************/

        if (
          Automation.Utils.isInstanceOf(
            boss,

            "DungeonBossPokemon",
          )
        ) {
          if (onlyConsiderAvailablePokemons) {
            const locked = boss.options?.requirement
              ? !this.__internal__isRequirementCompleted(
                  boss.options.requirement,

                  dungeonRegion,
                )
              : false;

            if (locked) {
              continue;
            }
          }

          if (!pokemonList.includes(boss.name)) {
            pokemonList.push(boss.name);
          }
        } else if (

        /*********************************************************************
         * TRAINER
         *********************************************************************/
          Automation.Utils.isInstanceOf(
            boss,

            "DungeonTrainer",
          )
        ) {
          const shadowPokemons = boss.team.filter((p) => p.shadow == 1);

          for (const pokemon of shadowPokemons) {
            if (!pokemonList.includes(pokemon.name)) {
              pokemonList.push(pokemon.name);
            }
          }
        }
      }
    }

    /*************************************************************************
     * ALTERNATE FORMS
     *************************************************************************/

    if (
      onlyConsiderAvailablePokemons &&
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.SkipAlternateForms,
      ) === "true"
    ) {
      pokemonList = pokemonList.filter((pokemonName) =>
        Number.isInteger(pokemonMap[pokemonName].id),
      );
    }

    return pokemonList;
  }

  /************************\
    |*    MIMIC POKÉMON   *|
    \************************/

  static __internal__getEveryMimicPokemonForDungeon(dungeon) {
    let pokemonList = dungeon.normalEncounterList
      .filter((encounter) => encounter.mimic && !encounter.hide)
      .map((p) => p.pokemonName);

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.SkipAlternateForms,
      ) === "true"
    ) {
      pokemonList = pokemonList.filter((pokemonName) =>
        Number.isInteger(pokemonMap[pokemonName].id),
      );
    }

    return pokemonList;
  }

  /************************\
    |*   POKÉMON NAMES    *|
    \************************/

  static __internal__getPokemonNames(
    encounterList,

    onlyConsiderAvailablePokemons,
  ) {
    return encounterList
      .filter(
        (encounter) =>
          !encounter.shadowTrainer &&
          !encounter.mimic &&
          (!onlyConsiderAvailablePokemons || !encounter.hide),
      )
      .map((p) => p.pokemonName);
  }

  /************************\
    |*    REQUIREMENTS    *|
    \************************/

  static __internal__isRequirementCompleted(
    requirement,

    region,
  ) {
    const requirements = Automation.Utils.isInstanceOf(
      requirement,

      "MultiRequirement",
    )
      ? requirement.requirements
      : [requirement];

    for (const req of requirements) {
      if (
        Automation.Utils.isInstanceOf(
          req,

          "WeatherRequirement",
        )
      ) {
        if (!req.weather.includes(Weather.regionalWeather[region]())) {
          return false;
        }
      } else if (!req.isCompleted()) {
        return false;
      }
    }

    return true;
  }
}
