window.generator = {
    createEmptyState: () => ({
        visualTicks: [], candles: [], longTermTicks: [], currentValue: 1000, visualValue: 1000,
        lastDirection: 1, patternState: 'NORMAL', ticksSincePatternChange: 0, nextPatternSwitchTick: 240,
        structPhase: 'UP', structTimer: 0, structPeriodX: 30, currentStructLimit: 30,
        currentProb: 0.5, targetProb: 0.5, probStep: 0, cycleCounter: 0, cycleDuration: 50,
        ticksPerCandle: 4, targetScroll: 0, scrollOffset: 0, lastSignalTick: 0, verticalShift: 0,
        currentAnchor: 0.75, tradeDuration: 10000,
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

    processMarketLogic: (tabIndex, ctx, isWarmup = false) => {
        const state = ctx.marketStatesRef.current[tabIndex];
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
                    state.structPeriodX = Math.floor((15 + Math.random() * 25) * 2); // TICK_RATE hardcoded to 2
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
                state.currentStructLimit = Math.floor((10 + Math.random() * 40) * 2); // TICK_RATE 2
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
        } else {
            const tickHistory = ctx.tickHistoriesRef.current[tabIndex];
            tickHistory.push(state.currentValue);
            if (tickHistory.length > 100) tickHistory.shift();
        }
    },

    updateVisualCandleLogic: (tabIndex, ctx) => {
        const state = ctx.marketStatesRef.current[tabIndex];
        state.visualTicks.push(state.visualValue);
        state.allTicks.push(state.visualValue);
        if (state.allTicks.length > 2400) state.allTicks.shift();

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
            state.candles.push(newCandle);
            state.targetScroll = state.candles.length;
            state.visualTicks = [];

            const MAX_CANDLES = 600;
            if (state.candles.length > MAX_CANDLES) {
                const deleteCount = state.candles.length - MAX_CANDLES;
                state.candles.splice(0, deleteCount);
                state.scrollOffset -= deleteCount;
                state.targetScroll -= deleteCount;
            }
        }
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
