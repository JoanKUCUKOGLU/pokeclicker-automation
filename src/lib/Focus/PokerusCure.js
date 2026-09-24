/**
 * @class The AutomationFocusPokerusCure regroups the 'Focus on' button's
 *        'Pokérus cure' functionalities.
 *
 * Route behaviour:
 * - Route A = first accessible route with at least one currently available
 *   Contagious Pokémon.
 * - Route B = next accessible route in the same region that ALSO contains at
 *   least one currently available Contagious Pokémon.
 * - Rapidly alternates A <-> B and catches Contagious Pokémon on both routes.
 * - If B is completed, another eligible B is selected.
 * - If A is completed, the next eligible route becomes A.
 * - If only one route with Contagious Pokémon remains, a completed accessible
 *   route in the same region is used as B so the fast bounce stays active.
 * - When no route has a currently available Contagious Pokémon, the original
 *   dungeon behaviour is used.
 */
class AutomationFocusPokerusCure {
  /******************************************************************************\
    |***    Focus specific members, should only be used by focus sub-classes    ***|
    \******************************************************************************/

  static __registerFunctionalities(functionalitiesList) {
    this.__internal__buildPokerusRouteList();
    this.__internal__buildPokerusDungeonList();

    const isUnlockedCallback = function () {
      return App.game.keyItems.hasKeyItem(KeyItemType.Pokerus_virus);
    };

    functionalitiesList.push({
      id: "PokerusCure",
      name: "Pokérus cure",
      tooltip:
        "Hunts for pokémons that are infected by the pokérus" +
        Automation.Menu.TooltipSeparator +
        "Pokémons get resistant to the pokérus once they reach 50 EVs.\n" +
        "Bounce ON: rapidly switches between two routes.\n" +
        "Whenever possible, both routes contain Contagious pokémons.\n" +
        "If only one target route remains, a completed route is used to keep the bounce active.\n" +
        "Bounce OFF: classic route-by-route hunting without route switching.\n" +
        "Dungeons keep their normal Pokérus cure behaviour.",
      run: function () {
        this.__internal__start();
      }.bind(this),
      stop: function () {
        this.__internal__stop();
      }.bind(this),
      isUnlocked: isUnlockedCallback,
      refreshRateAsMs: Automation.Focus.__noFunctionalityRefresh,
    });
  }

  static __buildAdvancedSettings(parent) {
    Automation.Utils.LocalStorage.setDefaultValue(
      this.__internal__advancedSettings.EnableBounce,
      true,
    );

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

    const bounceTooltip =
      "ON: rapidly switches between two routes to reroll encounters." +
      Automation.Menu.TooltipSeparator +
      "OFF: classic Pokérus cure. Stay on one target route and fight normally until no currently available Contagious Pokémon remains, then move to the next route.";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Enable route bounce",
      this.__internal__advancedSettings.EnableBounce,
      bounceTooltip,
      parent,
    );

    const beastBallTooltip =
      "Allows the automation to use Beastball to catch UltraBeast pokémons." +
      Automation.Menu.TooltipSeparator +
      "If this option is disabled, or you don't have Beastballs,\n" +
      "UltraBeast pokémons will be ignored.";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Use Beastballs to catch UltraBeast pokémons",
      this.__internal__advancedSettings.AllowBeastBallUsage,
      beastBallTooltip,
      parent,
    );

    const alternateTooltip =
      "If enabled, only pokémon's base form will be considered";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Skip Alternate form pokémons",
      this.__internal__advancedSettings.SkipAlternateForms,
      alternateTooltip,
      parent,
    );

    const mimicTooltip =
      "If enabled, the dungeon automation will force chest pickup";

    Automation.Menu.addLabeledAdvancedSettingsToggleButton(
      "Include mimic pokémons from dungeon chests",
      this.__internal__advancedSettings.IncludeMimicPokemons,
      mimicTooltip,
      parent,
    );
  }

  /*********************************************************************\
    |***    Internal members, should never be used by other classes    ***|
    \*********************************************************************/

  static __internal__advancedSettings = {
    EnableBounce: "Focus-PokerusCure-EnableBounce",
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
  static __internal__captureFilterEnabled = false;

  /*
   * Most recently completed route during this Focus session.
   * It becomes the preferred bounce route when only one Contagious route remains.
   */
  static __internal__lastCompletedRoute = null;

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

    const disableReason = "The 'Focus on Pokérus cure' feature is enabled";

    Automation.Menu.setButtonDisabledState(
      Automation.Click.Settings.FeatureEnabled,
      true,
      disableReason,
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
       * Remember the route if the capture just removed its last currently
       * available Contagious target. This is useful as the final bounce route.
       */
      if (previousLockedRoute) {
        const completedRoute = this.__internal__findRouteObject(
          previousLockedRoute.region,
          previousLockedRoute.number,
        );

        if (
          completedRoute &&
          !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
            completedRoute,
            true,
          )
        ) {
          this.__internal__lastCompletedRoute = completedRoute;
        }
      }

      /*
       * Route A may now be finished.
       */
      if (
        this.__internal__currentRouteData != null &&
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
     * CURRENT ROUTE A STILL VALID
     *************************************************************************/

    if (
      this.__internal__currentRouteData != null &&
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

    if (this.__internal__currentRouteData != null) {
      this.__internal__captureInfectedPokemons();
      return;
    }

    /*************************************************************************
     * NO ELIGIBLE ROUTE -> DUNGEONS
     *************************************************************************/

    this.__internal__secondaryRoute = null;
    this.__internal__disableCaptureFilter();

    if (
      this.__internal__currentDungeonData != null &&
      this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
        this.__internal__currentDungeonData.dungeon,
        true,
      )
    ) {
      this.__internal__captureInfectedPokemons();
      return;
    }

    this.__internal__setNextPokerusDungeon();

    if (this.__internal__currentDungeonData != null) {
      this.__internal__captureInfectedPokemons();
      return;
    }

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

    if (this.__internal__currentRouteData != null) {
      this.__internal__captureContagiousOnRoute();
      return;
    }

    this.__internal__captureContagiousInDungeon();
  }

  /*********************************************************************\
    |***                    ROUTE FAST BOUNCE                         ***|
    \*********************************************************************/

  static __internal__captureContagiousOnRoute() {
    const targetRoute = this.__internal__currentRouteData.route;

    /*************************************************************************
     * BOUNCE DISABLED -> CLASSIC ROUTE FARM
     *************************************************************************/

    if (!this.__internal__isBounceEnabled()) {
      /*
       * Route B is not used in classic mode.
       */
      this.__internal__secondaryRoute = null;

      /*
       * Never catch normal Pokémon while searching.
       */
      this.__internal__disableCaptureFilter();

      let enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);
        return;
      }

      /*
       * Stay on route A and let normal Auto Click combat
       * generate encounters one after another.
       */
      if (
        player.region !== targetRoute.region ||
        player.route !== targetRoute.number
      ) {
        Automation.Utils.Route.moveToRoute(
          targetRoute.number,
          targetRoute.region,
        );

        /*
         * Moving generates a fresh encounter immediately,
         * so inspect it before Auto Click can move on.
         */
        enemy = Battle.enemyPokemon();

        if (this.__internal__isWantedContagiousEnemy(enemy)) {
          this.__internal__lockContagiousEnemy(enemy);
        }
      }

      return;
    }

    /*************************************************************************
     * BOUNCE ENABLED
     *************************************************************************/

    /*
     * Recompute the best B every pass:
     * 1. Prefer another Contagious route.
     * 2. If A is the last Contagious route, use a completed route.
     */
    const bestSecondaryRoute =
      this.__internal__getBestSecondaryRoute(targetRoute);

    if (
      this.__internal__secondaryRoute?.region !== bestSecondaryRoute?.region ||
      this.__internal__secondaryRoute?.number !== bestSecondaryRoute?.number
    ) {
      this.__internal__secondaryRoute = bestSecondaryRoute;
    }

    this.__internal__disableCaptureFilter();

    const currentEnemy = Battle.enemyPokemon();

    if (this.__internal__isWantedContagiousEnemy(currentEnemy)) {
      this.__internal__lockContagiousEnemy(currentEnemy);
      return;
    }

    /*************************************************************************
     * LITERALLY ONLY ONE ACCESSIBLE ROUTE EXISTS
     *************************************************************************/

    if (this.__internal__secondaryRoute == null) {
      if (
        player.region !== targetRoute.region ||
        player.route !== targetRoute.number
      ) {
        Automation.Utils.Route.moveToRoute(
          targetRoute.number,
          targetRoute.region,
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
    const targetRoute = this.__internal__currentRouteData?.route;
    const secondaryRoute = this.__internal__secondaryRoute;

    if (!targetRoute || !secondaryRoute) {
      return;
    }

    let enemy = Battle.enemyPokemon();

    if (this.__internal__isWantedContagiousEnemy(enemy)) {
      this.__internal__lockContagiousEnemy(enemy);
      return;
    }

    /*************************************************************************
     * PARK ON B
     *************************************************************************/

    if (
      player.region !== secondaryRoute.region ||
      player.route !== secondaryRoute.number
    ) {
      Automation.Utils.Route.moveToRoute(
        secondaryRoute.number,
        secondaryRoute.region,
      );

      enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);
        return;
      }
    }

    /*************************************************************************
     * A <-> B BURST
     *************************************************************************/

    for (let i = 0; i < this.__internal__burstSize; i++) {
      if (Battle.catching() || this.__internal__lockedEnemy !== null) {
        return;
      }

      /**********************************************************************
       * ROUTE A
       **********************************************************************/

      Automation.Utils.Route.moveToRoute(
        targetRoute.number,
        targetRoute.region,
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
        secondaryRoute.number,
        secondaryRoute.region,
      );

      enemy = Battle.enemyPokemon();

      if (this.__internal__isWantedContagiousEnemy(enemy)) {
        this.__internal__lockContagiousEnemy(enemy);
        return;
      }
    }
  }

  /************************\
    |*  SECONDARY ROUTE B *|
    \************************/

  static __internal__getBestSecondaryRoute(targetRoute) {
    /*
     * Preferred behaviour:
     * B also has a currently available Contagious Pokémon.
     */
    const contagiousRoute =
      this.__internal__getNextContagiousRoute(targetRoute);

    if (contagiousRoute) {
      return contagiousRoute;
    }

    /*
     * A is the last Contagious route in the region.
     * Keep the bounce alive using a completed route.
     */
    return this.__internal__getCompletedBounceRoute(targetRoute);
  }

  /************************\
    |* NEXT CONTAGIOUS B  *|
    \************************/

  static __internal__getNextContagiousRoute(targetRoute) {
    const targetIndex = this.__internal__pokerusRouteData.findIndex(
      (data) =>
        data.route.number === targetRoute.number &&
        data.route.region === targetRoute.region,
    );

    if (targetIndex === -1) {
      return null;
    }

    for (
      let offset = 1;
      offset < this.__internal__pokerusRouteData.length;
      offset++
    ) {
      const candidate =
        this.__internal__pokerusRouteData[
          (targetIndex + offset) % this.__internal__pokerusRouteData.length
        ].route;

      if (candidate.region !== targetRoute.region) {
        continue;
      }

      if (candidate.number === targetRoute.number) {
        continue;
      }

      if (
        !Automation.Utils.Route.canMoveToRoute(
          candidate.number,
          candidate.region,
          candidate,
        )
      ) {
        continue;
      }

      if (
        !this.__internal__doesRouteHaveAnyPokemonNeedingCure(candidate, true)
      ) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  /************************\
    |* COMPLETED BOUNCE B *|
    \************************/

  static __internal__getCompletedBounceRoute(targetRoute) {
    /*
     * IMPORTANT:
     *
     * Use ALL accessible routes from the region here, not only routes that
     * were initially present in __internal__pokerusRouteData.
     *
     * This means the bounce still works even if the Focus is started when
     * there is already only one route left with Contagious Pokémon.
     */
    const sameRegionRoutes = Routes.getRoutesByRegion(
      targetRoute.region,
    ).filter(
      (route) =>
        route.number !== targetRoute.number &&
        Automation.Utils.Route.canMoveToRoute(
          route.number,
          route.region,
          route,
        ),
    );

    if (sameRegionRoutes.length === 0) {
      return null;
    }

    const isCompletedBounceCandidate = (route) =>
      route &&
      route.region === targetRoute.region &&
      route.number !== targetRoute.number &&
      Automation.Utils.Route.canMoveToRoute(
        route.number,
        route.region,
        route,
      ) &&
      !this.__internal__doesRouteHaveAnyPokemonNeedingCure(route, true);

    /*************************************************************************
     * 1. MOST RECENTLY COMPLETED ROUTE DURING THIS SESSION
     *************************************************************************/

    if (this.__internal__lastCompletedRoute) {
      const rememberedRoute = sameRegionRoutes.find(
        (route) =>
          route.region === this.__internal__lastCompletedRoute.region &&
          route.number === this.__internal__lastCompletedRoute.number,
      );

      if (isCompletedBounceCandidate(rememberedRoute)) {
        return rememberedRoute;
      }
    }

    /*************************************************************************
     * 2. PREVIOUS COMPLETED ROUTE IN POKÉCLICKER'S REGION ROUTE ORDER
     *************************************************************************/

    const nativeRoutes = Routes.getRoutesByRegion(targetRoute.region);

    const targetIndex = nativeRoutes.findIndex(
      (route) => route.number === targetRoute.number,
    );

    if (targetIndex !== -1) {
      for (let offset = 1; offset < nativeRoutes.length; offset++) {
        const index =
          (targetIndex - offset + nativeRoutes.length) % nativeRoutes.length;

        const candidate = nativeRoutes[index];

        if (isCompletedBounceCandidate(candidate)) {
          return candidate;
        }
      }
    }

    /*************************************************************************
     * 3. ANY COMPLETED ACCESSIBLE ROUTE IN THE SAME REGION
     *************************************************************************/

    return sameRegionRoutes.find(isCompletedBounceCandidate) ?? null;
  }

  /************************\
    |*  CONTAGIOUS CHECK  *|
    \************************/

  static __internal__isWantedContagiousEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    const pokemonName = enemy.name;

    if (!pokemonName) {
      return false;
    }

    const partyPokemon = App.game.party.getPokemonByName(pokemonName);

    if (partyPokemon?.pokerus !== GameConstants.Pokerus.Contagious) {
      return false;
    }

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.SkipAlternateForms,
      ) === "true" &&
      !Number.isInteger(enemy.id)
    ) {
      return false;
    }

    if (GameConstants.UltraBeastType[pokemonName] != undefined) {
      const beastBallsAllowed =
        Automation.Utils.LocalStorage.getValue(
          this.__internal__advancedSettings.AllowBeastBallUsage,
        ) === "true";

      const hasBeastBall =
        App.game.pokeballs.getBallQuantity(GameConstants.Pokeball.Beastball) >
        0;

      if (!beastBallsAllowed || !hasBeastBall) {
        return false;
      }
    }

    return true;
  }

  /************************\
    |*      LOCK TARGET   *|
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
     * Remember whether the target was found on A or B.
     * If this capture finishes that route, it can become the final bounce route.
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
    |*      BOUNCE        *|
    \************************/

  static __internal__isBounceEnabled() {
    return (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.EnableBounce,
      ) === "true"
    );
  }

  /************************\
    |*    FIND ROUTE OBJ  *|
    \************************/

  static __internal__findRouteObject(region, number) {
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
    if (this.__internal__currentDungeonData == null) {
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

    if (
      App.game.wallet.currencies[GameConstants.Currency.dungeonToken]() <
      this.__internal__currentDungeonData.dungeon.tokenCost
    ) {
      this.__internal__disableCaptureFilter();
      Automation.Focus.__goToBestRouteForDungeonToken();
      return;
    }

    const pokeballToUse = this.__internal__currentDungeonData.needsBeastBall
      ? GameConstants.Pokeball.Beastball
      : selectedPokeball;

    Automation.Utils.Pokeball.onlyCatchContagiousWith(pokeballToUse);

    this.__internal__captureFilterEnabled = true;

    if (
      !Automation.Utils.Route.isPlayerInTown(
        this.__internal__currentDungeonData.dungeon.name,
      )
    ) {
      Automation.Utils.Route.moveToTown(
        this.__internal__currentDungeonData.dungeon.name,
      );

      setTimeout(this.__internal__captureInfectedPokemons.bind(this), 1000);

      return;
    }

    Automation.Menu.forceAutomationState(
      Automation.Dungeon.Settings.FeatureEnabled,
      true,
    );

    Automation.Dungeon.setBeforeNewRunCallBack(
      function () {
        if (
          !this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
            this.__internal__currentDungeonData.dungeon,
            true,
          )
        ) {
          this.__internal__focusOnPokerusCure();
        }
      }.bind(this),
    );

    if (
      this.__internal__doesAnyPokemonNeedCuring(
        this.__internal__currentDungeonData.nonBossPokemons,
        true,
      )
    ) {
      Automation.Dungeon.AutomationRequestedModes = [
        Automation.Dungeon.InternalModes.ForcePokemonFight,
      ];
    } else {
      Automation.Dungeon.AutomationRequestedModes = [
        Automation.Dungeon.InternalModes.ForceDungeonCompletion,
      ];
    }

    if (
      Automation.Utils.LocalStorage.getValue(
        this.__internal__advancedSettings.IncludeMimicPokemons,
      ) === "true" &&
      this.__internal__doesAnyPokemonNeedCuring(
        this.__internal__currentDungeonData.mimicPokemons,
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
      this.__internal__currentRouteData != null &&
      !this.__internal__doesRouteHaveAnyPokemonNeedingCure(
        this.__internal__currentRouteData.route,
      )
    ) {
      const index = this.__internal__pokerusRouteData.indexOf(
        this.__internal__currentRouteData,
      );

      if (index !== -1) {
        this.__internal__pokerusRouteData.splice(index, 1);
      }
    }

    const previousRoute = this.__internal__currentRouteData?.route;

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
        this,
      ) ?? null;

    if (this.__internal__currentRouteData) {
      this.__internal__currentRouteData.needsBeastBall =
        this.__internal__doesRouteNeedBeastBalls(
          this.__internal__currentRouteData.route,
        );

      this.__internal__currentDungeonData = null;

      const newRoute = this.__internal__currentRouteData.route;

      if (
        previousRoute?.number !== newRoute.number ||
        previousRoute?.region !== newRoute.region
      ) {
        this.__internal__secondaryRoute = null;
        this.__internal__lockedEnemy = null;
        this.__internal__lockedRoute = null;
        this.__internal__disableCaptureFilter();
      }
    } else {
      this.__internal__secondaryRoute = null;
    }
  }

  /************************\
    |*    NEXT DUNGEON    *|
    \************************/

  static __internal__setNextPokerusDungeon() {
    if (
      this.__internal__currentDungeonData != null &&
      !this.__internal__doesDungeonHaveAnyPokemonNeedingCure(
        this.__internal__currentDungeonData.dungeon,
      )
    ) {
      const index = this.__internal__pokerusDungeonData.indexOf(
        this.__internal__currentDungeonData,
      );

      if (index !== -1) {
        this.__internal__pokerusDungeonData.splice(index, 1);
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
        this,
      ) ?? null;

    if (this.__internal__currentDungeonData != null) {
      this.__internal__currentRouteData = null;
      this.__internal__secondaryRoute = null;

      this.__internal__currentDungeonData.nonBossPokemons =
        this.__internal__getEveryPokemonForDungeon(
          this.__internal__currentDungeonData.dungeon,
          false,
          true,
        );

      this.__internal__currentDungeonData.mimicPokemons =
        this.__internal__getEveryMimicPokemonForDungeon(
          this.__internal__currentDungeonData.dungeon,
        );

      this.__internal__currentDungeonData.needsBeastBall =
        this.__internal__doesDungeonNeedBeastBalls(
          this.__internal__currentDungeonData.dungeon,
        );
    }
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
        this.__internal__pokerusRouteData.push({ route });
      }
    }

    this.__internal__pokerusRouteData.sort((routeA, routeB) => {
      const isAMagikarp = Automation.Utils.Route.isInMagikarpJumpIsland(
        routeA.route.region,
        routeA.route.subRegion,
      );

      const isBMagikarp = Automation.Utils.Route.isInMagikarpJumpIsland(
        routeB.route.region,
        routeB.route.subRegion,
      );

      if (isAMagikarp && !isBMagikarp) {
        return 1;
      }

      if (isBMagikarp && !isAMagikarp) {
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
        this.__internal__pokerusDungeonData.push({ dungeon });
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
    const pokemonList = this.__internal__getEveryPokemonForRoute(
      route,
      onlyConsiderAvailableContagiousPokemons,
    );

    return this.__internal__doesAnyPokemonNeedCuring(
      pokemonList,
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

    const mimicList = this.__internal__getEveryMimicPokemonForDungeon(dungeon);

    return this.__internal__doesAnyPokemonNeedCuring(
      mimicList,
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
    return this.__internal__getEveryPokemonForRoute(route, true).every(
      (pokemonName) => {
        const pokemon = App.game.party.getPokemonByName(pokemonName);

        return (
          pokemon?.pokerus != GameConstants.Pokerus.Contagious ||
          GameConstants.UltraBeastType[pokemonName] != undefined
        );
      },
    );
  }

  /************************\
    |* DUNGEON BEAST BALL *|
    \************************/

  static __internal__doesDungeonNeedBeastBalls(dungeon) {
    let pokemonList = this.__internal__getEveryPokemonForDungeon(dungeon, true);

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

    if (
      !onlyConsiderAvailablePokemons ||
      pokemonList.length == 0 ||
      App.game.keyItems.hasKeyItem(KeyItemType.Super_rod)
    ) {
      pokemonList = pokemonList.concat(possiblePokemons.water);
    }

    pokemonList = pokemonList.concat(possiblePokemons.headbutt);

    let specialPokemonList = [...possiblePokemons.special];

    if (onlyConsiderAvailablePokemons) {
      specialPokemonList = specialPokemonList.filter(
        (p) => this.__internal__isRequirementCompleted(p.req, route.region),
        this,
      );
    }

    pokemonList = pokemonList.concat(
      ...specialPokemonList.map((p) => p.pokemon),
    );

    pokemonList = pokemonList.filter(
      (item, index) => pokemonList.indexOf(item) === index,
    );

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
        if (Automation.Utils.isInstanceOf(boss, "DungeonBossPokemon")) {
          if (onlyConsiderAvailablePokemons) {
            const isBossLocked = boss.options?.requirement
              ? !this.__internal__isRequirementCompleted(
                  boss.options.requirement,
                  dungeonRegion,
                )
              : false;

            if (isBossLocked) {
              continue;
            }
          }

          if (!pokemonList.includes(boss.name)) {
            pokemonList.push(boss.name);
          }
        } else if (Automation.Utils.isInstanceOf(boss, "DungeonTrainer")) {
          const shadowPokemons = boss.team.filter((p) => p.shadow == 1);

          for (const pokemon of shadowPokemons) {
            if (!pokemonList.includes(pokemon.name)) {
              pokemonList.push(pokemon.name);
            }
          }
        }
      }
    }

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

  static __internal__isRequirementCompleted(requirement, region) {
    const requirements = Automation.Utils.isInstanceOf(
      requirement,
      "MultiRequirement",
    )
      ? requirement.requirements
      : [requirement];

    for (const req of requirements) {
      if (Automation.Utils.isInstanceOf(req, "WeatherRequirement")) {
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
