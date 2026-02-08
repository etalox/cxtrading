window.generator = {
    createEmptyState: () => ({
        visualTicks: [], candles: [], longTermTicks: [], currentValue: 1000, visualValue: 1000,
        lastDirection: 1, patternState: 'NORMAL', ticksSincePatternChange: 0, nextPatternSwitchTick: 240,
        structPhase: 'UP', structTimer: 0, structPeriodX: 30, currentStructLimit: 30,
        currentProb: 0.5, targetProb: 0.5, probStep: 0, cycleCounter: 0, cycleDuration: 50,
        ticksPerCandle: 4, targetScroll: 0, scrollOffset: 0, lastSignalTick: 0, verticalShift: 0,
        currentAnchor: undefined, tradeDuration: 10000,
        dna: { volatility: 1, aggression: 0.3, structure: 0.5, trendBias: 0, isStepped: false },
        stepBuffer: 0,
        initialized: false,
        visualMinPrice: undefined, visualMaxPrice: undefined,
        allTicks: []
    }),

    generateDNAFromName: (materialIdx, adjectiveIdx) => {
        const normMat = materialIdx / (window.MATERIALS.length - 1);
        const normAdj = adjectiveIdx / (window.ADJECTIVES.length - 1);
        const volatility = 0.5 + (normMat * 1.5);
        const structure = 0.2 + Math.pow(normAdj, 2) * 0.75;
        const seed = (materialIdx * 100) + adjectiveIdx;
        const pseudoRand = Math.sin(seed) * 0.5 + 0.5;
        const trendBias = (pseudoRand - 0.5) * 0.3;
        const isStepped = (adjectiveIdx % 3 === 0);
        return { volatility, aggression: 0.1 + (normMat * 0.7), structure, trendBias, isStepped };
    },

    processMarketLogic: (stateOrTab, ctx, isWarmup = false) => {
        const isTabIndex = typeof stateOrTab === 'number';
        const state = isTabIndex ? ctx.marketStatesRef.current[stateOrTab] : stateOrTab;
        const tabIndex = isTabIndex ? stateOrTab : -1;

        const dna = state.dna;
        state.ticksSincePatternChange++;
        if (state.ticksSincePatternChange >= state.nextPatternSwitchTick) {
            state.ticksSincePatternChange = 0;
            const randState = Math.random();
            const momentumThresh = 0.1 + (dna.aggression * 0.4);
            if (randState < momentumThresh) {
                state.patternState = 'MOMENTUM';
                state.structTotalDuration = Math.floor(60 + Math.random() * 120);
                state.momentumDir = Math.random() > (0.5 - dna.trendBias) ? 1 : -1;
            } else {
                if (Math.random() < dna.structure) {
                    state.patternState = 'STRUCTURED';
                    state.structTotalDuration = Math.floor(180 + Math.random() * 300);
                    state.structPeriodX = Math.floor((15 + Math.random() * 25) * window.CONFIG.TICK_RATE);
                    state.structPhase = Math.random() > 0.5 ? 'UP' : 'DOWN';
                    state.structTimer = 0;
                    state.currentStructLimit = state.structPeriodX;
                } else {
                    state.patternState = 'NORMAL';
                    state.structTotalDuration = Math.floor(120 + Math.random() * 180);
                }
            }
            state.nextPatternSwitchTick = state.structTotalDuration;
        }

        let drift = 0; let volatilityMult = 1.0;

        if (state.patternState === 'MOMENTUM') {
            drift = state.momentumDir * 0.6;
            volatilityMult = 2.5;
        }
        else if (state.patternState === 'STRUCTURED') {
            state.structTimer++;
            if (state.structTimer >= state.currentStructLimit) {
                state.structPhase = state.structPhase === 'UP' ? 'DOWN' : 'UP';
                state.structTimer = 0;
                state.currentStructLimit = Math.floor((10 + Math.random() * 40) * window.CONFIG.TICK_RATE);
            }
            drift = state.structPhase === 'UP' ? 0.18 : -0.18;
            volatilityMult = 1.0;
        } else {
            drift = 0;
            volatilityMult = 0.8;
        }

        drift += dna.trendBias;
        const r1 = Math.random(); const r2 = Math.random(); const noise = (r1 + r2) - 1.0;
        const baseVol = state.currentValue * 0.0006;
        const movement = (drift + (noise * 1.5)) * baseVol * volatilityMult * dna.volatility;

        if (dna.isStepped && state.patternState !== 'MOMENTUM') {
            state.stepBuffer = (state.stepBuffer || 0) + movement;
            if (state.ticksSincePatternChange % 8 === 0) {
                state.currentValue += state.stepBuffer;
                state.stepBuffer = 0;
            }
        } else {
            state.currentValue += movement;
        }

        if (state.currentValue < 10) state.currentValue = 10;
        if (isWarmup) state.visualValue = state.currentValue;
        state.lastDirection = movement > 0 ? 1 : -1;

        if (tabIndex === ctx.activeTab) {
            window.aiEngine.updatePredictor(state.currentValue, ctx);
        } else if (isTabIndex) {
            const tickHistory = ctx.tickHistoriesRef.current[tabIndex];
            tickHistory.push(state.currentValue);
            if (tickHistory.length > window.CONFIG.TICK_HISTORY_LIMIT) tickHistory.shift();
        }
    },

    updateVisualCandleLogic: (stateOrTab, ctx) => {
        const state = typeof stateOrTab === 'number' ? ctx.marketStatesRef.current[stateOrTab] : stateOrTab;

        state.visualTicks.push(state.visualValue);
        state.allTicks.push(state.visualValue);
        if (state.allTicks.length > 20000) state.allTicks.shift();

        if (state.visualTicks.length >= state.ticksPerCandle) {
            const lastCandleClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : state.visualTicks[0];
            const close = state.visualTicks[state.visualTicks.length - 1];
            const newCandle = {
                open: lastCandleClose,
                close,
                high: Math.max(...state.visualTicks, lastCandleClose),
                low: Math.min(...state.visualTicks, lastCandleClose),
                color: close >= lastCandleClose ? '#10b981' : '#f43f5e'
            };
            const isAtEnd = state.targetScroll >= state.candles.length - 1.1;
            state.candles.push(newCandle);
            if (isAtEnd) state.targetScroll = state.candles.length;
            state.visualTicks = [];

            if (state.candles.length > window.CONFIG.MAX_CANDLES) {
                const deleteCount = state.candles.length - window.CONFIG.MAX_CANDLES;
                state.candles.splice(0, deleteCount);
                state.scrollOffset -= deleteCount;
                state.targetScroll -= deleteCount;
            }
        }
    },

    warmUpMarket: (stateOrTab, ctx, minutes = 10) => {
        const state = typeof stateOrTab === 'number' ? ctx.marketStatesRef.current[stateOrTab] : stateOrTab;
        const ticksToSimulate = minutes * 60 * window.CONFIG.TICK_RATE;
        for (let i = 0; i < ticksToSimulate; i++) {
            window.generator.processMarketLogic(state, ctx, true);
            window.generator.updateVisualCandleLogic(state, ctx);
        }
        state.targetScroll = state.candles.length; state.scrollOffset = state.candles.length; state.initialized = true;
    },

    generateAssetForTab: (tabIndex, ctx, startTime = performance.now()) => {
        ctx.setIsGenerating(true);

        setTimeout(() => {
            const now = Date.now();
            ctx.assetHistoryRef.current = ctx.assetHistoryRef.current.filter(a => now - a.timestamp < 300000);
            let attempts = 0; let selectedName = ""; let matIdx, adjIdx;
            const findAvailableAsset = () => {
                while (attempts < 100) {
                    attempts++;
                    const matRand = (Math.random() + Math.random()) / 2;
                    const adjRand = (Math.random() + Math.random()) / 2;
                    const mIdx = Math.floor(matRand * window.MATERIALS.length);
                    const aIdx = Math.floor(adjRand * window.ADJECTIVES.length);
                    const fullName = `${window.MATERIALS[mIdx]} ${window.ADJECTIVES[aIdx]}`;
                    const isCurrentlyActive = ctx.assetsInfo.some((info, i) => i !== tabIndex && info.name === fullName);
                    const inHistory = ctx.assetHistoryRef.current.some(a => a.name === fullName);
                    if (!isCurrentlyActive && !inHistory) {
                        selectedName = fullName; matIdx = mIdx; adjIdx = aIdx;
                        ctx.assetHistoryRef.current.push({ name: fullName, timestamp: now });
                        return true;
                    }
                }
                return false;
            };

            if (!findAvailableAsset()) {
                setTimeout(() => window.generator.generateAssetForTab(tabIndex, ctx, startTime), 500);
                return;
            }

            const rand = Math.pow(Math.random(), 2.5);
            const newBasePrice = 1000 + (1 - rand) * 99000;
            const dna = window.generator.generateDNAFromName(matIdx, adjIdx);
            let preferredDurations;
            if (dna.volatility > 1.2 || dna.aggression > 0.6) preferredDurations = [5000, 5000, 10000];
            else if (dna.structure > 0.7) preferredDurations = [15000, 30000, 30000];
            else preferredDurations = window.CONFIG.DURATIONS;

            const randomDuration = preferredDurations[Math.floor(Math.random() * preferredDurations.length)];

            // Build the NEW state off-screen
            const newState = {
                ...window.generator.createEmptyState(),
                currentValue: newBasePrice,
                visualValue: newBasePrice,
                tradeDuration: randomDuration,
                dna: dna,
                initialized: false
            };

            const randomWarmupMinutes = Math.floor(Math.random() * 6) + 10;
            window.generator.warmUpMarket(newState, ctx, randomWarmupMinutes);

            // Sync reveal: Hold until minimum 1500ms since start of click
            const elapsed = performance.now() - startTime;
            const wait = Math.max(0, 1500 - elapsed);

            setTimeout(() => {
                // ATOMIC SWAP: Displace old data and end search animation simultaneously
                ctx.tickHistoriesRef.current[tabIndex] = [];
                ctx.kinematicsRef.current[tabIndex] = { lastEma: null, lastVelocity: 0, alpha: 0.15, delta: 0.0001 };
                ctx.marketStatesRef.current[tabIndex] = newState;

                ctx.setAssetsInfo(prev => {
                    const next = [...prev];
                    next[tabIndex] = { name: selectedName, price: newBasePrice, change: 0 };
                    return next;
                });

                if (tabIndex === ctx.activeTab) {
                    ctx.setCurrentDuration(randomDuration / 1000);
                    // Ensure the state update is reflected in the chart immediately
                    if (ctx.setCurrentPriceUI) ctx.setCurrentPriceUI(newBasePrice);
                }

                ctx.setIsGenerating(false);
            }, wait);
        }, 30);
    },

    rebuildCandles: (tabIndex, ctx) => {
        const state = ctx.marketStatesRef.current[tabIndex];
        const allTicks = state.allTicks;
        state.candles = [];
        state.visualTicks = [];
        let tempTicks = [];

        for (let i = 0; i < allTicks.length; i++) {
            tempTicks.push(allTicks[i]);
            if (tempTicks.length >= state.ticksPerCandle) {
                const lastCandleClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : tempTicks[0];
                const close = tempTicks[tempTicks.length - 1];
                const newCandle = {
                    open: lastCandleClose,
                    close: close,
                    high: Math.max(...tempTicks, lastCandleClose),
                    low: Math.min(...tempTicks, lastCandleClose),
                    color: close >= lastCandleClose ? '#10b981' : '#f43f5e'
                };
                state.candles.push(newCandle);
                tempTicks = [];
            }
        }
        state.visualTicks = tempTicks;
        state.targetScroll = state.candles.length;
        state.scrollOffset = state.candles.length;
    }
};
