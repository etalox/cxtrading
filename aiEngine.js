window.aiEngine = {
    trainAI: (features, actualOutcome, aiBrainRef, setAiLearnedCount) => {
        const brain = aiBrainRef.current;
        const rawSum = (features.vel * brain.weights.velocity) + (features.acc * brain.weights.acceleration) + (features.z * brain.weights.zScore) + (features.dur * brain.weights.duration) + brain.weights.bias;
        const predictedConfidence = window.sigmoid(rawSum);
        const error = actualOutcome - predictedConfidence;

        brain.weights.velocity += brain.learningRate * error * features.vel;
        brain.weights.acceleration += brain.learningRate * error * features.acc;
        brain.weights.zScore += brain.learningRate * error * features.z;
        brain.weights.duration += brain.learningRate * error * features.dur;
        brain.weights.bias += brain.learningRate * error;

        // Optional: only update state if setter provided
        if (setAiLearnedCount) {
            setAiLearnedCount(c => c + 1);
        }
    },

    updatePredictor: (newPrice, ctx) => {
        const state = ctx.marketStatesRef.current[ctx.activeTab];
        const tickHistory = ctx.tickHistoriesRef.current[ctx.activeTab];
        const ks = ctx.kinematicsRef.current[ctx.activeTab];

        tickHistory.push(newPrice);
        if (tickHistory.length > 100) tickHistory.shift(); // Hardcoded TICK_HISTORY_LIMIT = 100
        state.longTermTicks.push(newPrice);
        if (state.longTermTicks.length > 1000) state.longTermTicks.shift();

        if (tickHistory.length < 20) return;

        const currentEma = ks.lastEma === null ? newPrice : (ks.alpha * newPrice) + (1 - ks.alpha) * ks.lastEma;
        const velocity = ks.lastEma !== null ? (currentEma - ks.lastEma) : 0;
        const acceleration = velocity - ks.lastVelocity;
        const n = tickHistory.length;
        const mean = tickHistory.reduce((a, b) => a + b, 0) / n;
        const stdDev = Math.sqrt(tickHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
        const zScore = stdDev === 0 ? 0 : (newPrice - mean) / stdDev;

        const longTermMean = state.longTermTicks.length > 0 ? state.longTermTicks.reduce((a, b) => a + b, 0) / state.longTermTicks.length : mean;
        const trendDirection = newPrice > longTermMean ? 1 : -1;
        const aggression = state.dna ? state.dna.aggression : 0.5;
        const zThreshold = 1.6 + (aggression * 0.5);

        const isOversold = zScore < -zThreshold;
        const isPullbackBuy = trendDirection === 1 && zScore < -1.0 && velocity < 0 && acceleration > 0;
        const isBuySignalRaw = (isOversold && acceleration > ks.delta) || isPullbackBuy;

        const isOverbought = zScore > zThreshold;
        const isPullbackSell = trendDirection === -1 && zScore > 1.0 && velocity > 0 && acceleration < 0;
        const isSellSignalRaw = (isOverbought && acceleration < -ks.delta) || isPullbackSell;

        let finalBuy = isBuySignalRaw;
        let finalSell = isSellSignalRaw;

        const brain = ctx.aiBrain.current;
        const normalizedDuration = (state.tradeDuration || 10000) / 30000;
        const inputFeatures = { vel: Math.abs(velocity) * 10, acc: Math.abs(acceleration) * 100, z: Math.abs(zScore), dur: normalizedDuration, trend: trendDirection };

        const rawSum = (inputFeatures.vel * brain.weights.velocity) + (inputFeatures.acc * brain.weights.acceleration) + (inputFeatures.z * brain.weights.zScore) + (inputFeatures.dur * brain.weights.duration) + brain.weights.bias;
        const confidence = window.sigmoid(rawSum);

        ks.lastEma = currentEma; ks.lastVelocity = velocity; ks.currentFeatures = inputFeatures;
        ctx.setAiConfidence(confidence);

        if ((finalBuy || finalSell) && (state.currentValue !== state.lastSignalTick)) {
            if (Math.random() < 0.15 || confidence > 0.7) {
                const signalType = finalBuy ? 'BUY' : 'SELL';
                const timeSinceLast = Date.now() - (state.lastSignalTime || 0);
                if (timeSinceLast > 2000) {
                    ctx.addNotification({ type: 'SIGNAL', signalType: signalType, confidence: confidence, price: newPrice });
                    state.lastSignalTick = state.currentValue;
                    state.lastSignalTime = Date.now();
                    if (ctx.autopilot && confidence > 0.4 && ctx.activeTradesRef.current.length === 0) {
                        const currentSignal = `${signalType}_${newPrice.toFixed(2)}`;
                        if (ctx.lastSignalRef.current !== currentSignal) {
                            ctx.lastSignalRef.current = currentSignal;
                            setTimeout(() => ctx.executeTrade(signalType), 100);
                        }
                    }
                }
            }
        }
    }
};
