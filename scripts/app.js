const { useState, useEffect, useRef, useCallback } = React;

const MarketSim = () => {
    const isMobile = window.innerWidth < 768;
    const INITIAL_ZOOM = isMobile ? 160 : 320;
    const isMobileRef = useRef(isMobile);

    const [activeTab, setActiveTab] = useState(0);
    const [assetsInfo, setAssetsInfo] = useState([
        { name: "INIT 01", price: 1000, change: 0 },
        { name: "INIT 02", price: 1000, change: 0 },
        { name: "INIT 03", price: 1000, change: 0 }
    ]);

    const cleanupInteractions = window.Interface.setupZoomAndTouch(containerRef.current, {
    isUserInteracting: isUserInteractingRef, // Corregido: pasar ref, no valor
    zoomTarget: zoomTargetRef,
    pinchStart: pinchStartRef,
    lastTouchTarget: lastTouchTargetRef,
    setZoom: (val) => setZoom(val),
    // [NUEVO] Agregar estos dos parámetros que faltaban:
    marketStatesRef: marketStatesRef,
    activeTab: activeTabRef 
  });

    const cleanupResize = window.Interface.setupResizeObserver(containerRef.current, canvasRef.current, {
        isMobile: isMobileRef
    });

    const cleanupDrag = window.Interface.setupHorizontalDrag(containerRef.current, canvasRef.current, {
        marketStatesRef,
        activeTab: activeTabRef, // [CAMBIO] Pasar activeTabRef en lugar de activeTab
        zoomCurrentRef,
        isUserInteracting: isUserInteractingRef
    });

    // ... return cleanup ...
    }, []); 

    const [balance, setBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('cx_balance');
            return saved ? parseFloat(saved) : 100000;
        } catch (e) { return 100000; }
    });
    useEffect(() => { localStorage.setItem('cx_balance', balance); }, [balance]);

    const assetHistoryRef = useRef([]);

    const marketStatesRef = useRef([window.generator.createEmptyState(), window.generator.createEmptyState(), window.generator.createEmptyState()]);
    const tickHistoriesRef = useRef([[], [], []]);
    const kinematicsRef = useRef([
        { lastEma: null, lastVelocity: 0, alpha: 0.15, delta: 0.0001 },
        { lastEma: null, lastVelocity: 0, alpha: 0.15, delta: 0.0001 },
        { lastEma: null, lastVelocity: 0, alpha: 0.15, delta: 0.0001 }
    ]);

    const lastLogicTimeRef = useRef(Date.now());
    const isTabVisibleRef = useRef(true);
    const isCatchingUpRef = useRef(false);

    // Refs for interaction handling
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const pinchStartRef = useRef(null);
    const lastTouchTargetRef = useRef(null);
    const isUserInteractingRef = useRef(false);

    const [zoom, setZoom] = useState(INITIAL_ZOOM);
    const zoomTargetRef = useRef(INITIAL_ZOOM);
    const zoomCurrentRef = useRef(INITIAL_ZOOM);
    const preTradeZoomRef = useRef(null);

    const [activeTradesUI, setActiveTradesUI] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [currentPriceUI, setCurrentPriceUI] = useState(15868.30);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentDuration, setCurrentDuration] = useState(10);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [aiConfidence, setAiConfidence] = useState(0);
    const [aiLearnedCount, setAiLearnedCount] = useState(0);
    const [autopilot, setAutopilot] = useState(false);

    const [buyButtonOpacity, setBuyButtonOpacity] = useState(1);
    const [sellButtonOpacity, setSellButtonOpacity] = useState(1);
    const touchedButtonsRef = useRef(new Set());

    // Setup interactions using interface.js module
    useEffect(() => {
        const updateMobile = () => { isMobileRef.current = window.innerWidth < 768; };
        updateMobile();
        window.addEventListener('resize', updateMobile);

        const handleVisibilityChange = () => { isTabVisibleRef.current = !document.hidden; };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const cleanupInteractions = window.Interface.setupZoomAndTouch(containerRef.current, {
            isUserInteracting: isUserInteractingRef.current,
            zoomTarget: zoomTargetRef,
            pinchStart: pinchStartRef,
            lastTouchTarget: lastTouchTargetRef,
            isUserInteracting: isUserInteractingRef,
            setZoom: (val) => setZoom(val)
        });

        const cleanupResize = window.Interface.setupResizeObserver(containerRef.current, canvasRef.current, {
            isMobile: isMobileRef
        });

        const cleanupDrag = window.Interface.setupHorizontalDrag(containerRef.current, canvasRef.current, {
            marketStatesRef,
            activeTab,
            zoomCurrentRef,
            isUserInteracting: isUserInteractingRef
        });

        return () => {
            window.removeEventListener('resize', updateMobile);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (cleanupInteractions) cleanupInteractions();
            if (cleanupResize) cleanupResize();
            if (cleanupDrag) cleanupDrag();
        };
    }, []);

    const autopilotStartBalanceRef = useRef(null);
    const consecutiveLossesRef = useRef(0);

    useEffect(() => {
        const hasActiveTrades = activeTradesUI.length > 0;
        const state = marketStatesRef.current[activeTab];
        if (hasActiveTrades && (state.zoomTarget || INITIAL_ZOOM) > 200) {
            preTradeZoomRef.current = state.zoomTarget || INITIAL_ZOOM;
            isUserInteractingRef.current = false;
            state.zoomTarget = window.CONFIG.ZOOM_DEFAULT;
            setZoom(window.CONFIG.ZOOM_DEFAULT);
        } else if (!hasActiveTrades && preTradeZoomRef.current !== null && !isUserInteractingRef.current) {
            state.zoomTarget = preTradeZoomRef.current;
            setZoom(preTradeZoomRef.current);
            preTradeZoomRef.current = null;
        }
    }, [activeTradesUI.length, activeTab]);

    const activeTradesRef = useRef([]);
    const isNotificationVisible = useRef(false);
    const lastSignalRef = useRef(null);
    const lastUIUpdateRef = useRef(0);
    const aiBrain = useRef({ weights: { velocity: 0.8, acceleration: 1.2, zScore: 0.6, duration: -0.5, bias: 0.1 }, learningRate: 0.05, history: [], shadowTrades: [] });
    const resultLabelsRef = useRef([]);

    const addNotification = useCallback((data) => {
        if (data.type === 'SIGNAL' && data.confidence <= 0) return;
        if (data.type === 'SIGNAL' && isNotificationVisible.current) return;
        if (data.type === 'WIN' || data.type === 'LOSS') return;
        const id = Date.now() + Math.random();
        setNotifications(prev => (data.type === 'SIGNAL' && prev.length === 0) ? [{ ...data, id }] : prev);
        if (data.type !== 'OFFLINE') {
            isNotificationVisible.current = true;
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== id));
                if (notifications.length <= 1) isNotificationVisible.current = false;
            }, 4000);
        } else { isNotificationVisible.current = true; }
    }, []);

    const executeTrade = (type) => {
        if (!isOnline) return;
        const maxTrades = autopilot ? 1 : 4;
        if (activeTradesRef.current.length >= maxTrades) return;

        if (autopilot && activeTradesRef.current.length === 0) {
            if (autopilotStartBalanceRef.current === null) {
                autopilotStartBalanceRef.current = balance;
            }
        }

        if (type === 'BUY') { setBuyButtonOpacity(0.5); setTimeout(() => setBuyButtonOpacity(1), 120); }
        else { setSellButtonOpacity(0.5); setTimeout(() => setSellButtonOpacity(1), 120); }

        setNotifications(prev => prev.filter(n => n.type !== 'SIGNAL'));
        isNotificationVisible.current = false;
        const state = marketStatesRef.current[activeTab];
        const ks = kinematicsRef.current[activeTab];
        const currentPreciseIndex = state.candles.length + (state.visualTicks.length / state.ticksPerCandle);
        const now = Date.now();
        const duration = state.tradeDuration || 10000;
        const newTrade = {
            id: now + Math.random(), type, entryPrice: state.visualValue,
            entryIndex: currentPreciseIndex, entryTickIndex: state.allTicks.length,
            entryCandleIndex: currentPreciseIndex,
            startTime: now, expiryTime: now + duration,
            amount: window.CONFIG.INVESTMENT_AMOUNT, aiSnapshot: { ...ks.currentFeatures }, duration: duration, tabIndex: activeTab
        };
        activeTradesRef.current.push(newTrade);
        setActiveTradesUI([...activeTradesRef.current]);
        setBalance(prev => prev - window.CONFIG.INVESTMENT_AMOUNT);
    };

    const handleTouchStart = (type) => { if (isMobileRef.current) touchedButtonsRef.current.add(type); };
    const handleTouchEnd = (type) => {
        if (isMobileRef.current) {
            const touched = touchedButtonsRef.current;
            if (touched.size === 1 && touched.has(type)) executeTrade(type);
            touched.clear();
        }
    };

    const getContext = () => ({
        marketStatesRef, tickHistoriesRef, kinematicsRef, activeTab, aiBrain, setAiConfidence,
        addNotification, autopilot, activeTradesRef, lastSignalRef, executeTrade, assetsInfo,
        setAssetsInfo, assetHistoryRef, setCurrentDuration, setIsGenerating, setCurrentPriceUI, canvasRef, resultLabelsRef,
        zoomCurrentRef, zoomTargetRef
    });

    useEffect(() => {
        if (!marketStatesRef.current[0].initialized) {
            setIsGenerating(true);
            [0, 50, 100].forEach((delay, idx) => setTimeout(() => window.generator.generateAssetForTab(idx, getContext()), delay));
        }
    }, []);

    const handleTabChange = (index) => {
        setActiveTab(index);
        const state = marketStatesRef.current[index];
        state.visualMinPrice = undefined; state.visualMaxPrice = undefined;
        setCurrentDuration(state.tradeDuration / 1000);
        setCurrentPriceUI(state.visualValue);

        // Sync zoom when changing tabs
        if (!isMobileRef.current) {
            const tabZoom = state.zoom || INITIAL_ZOOM;
            zoomTargetRef.current = state.zoomTarget || tabZoom;
            zoomCurrentRef.current = tabZoom;
            setZoom(tabZoom);
        }
    };

    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); setNotifications(prev => prev.filter(n => n.type !== 'OFFLINE')); };
        const handleOffline = () => { setIsOnline(false); addNotification({ type: 'OFFLINE' }); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, [addNotification]);

    useEffect(() => {
        let animationId;
        const runMarketLogic = (forceSnap) => {
            const ctx = getContext();
            [0, 1, 2].forEach(idx => {
                window.generator.processMarketLogic(idx, ctx);
                if (forceSnap) marketStatesRef.current[idx].visualValue = marketStatesRef.current[idx].currentValue;
                window.generator.updateVisualCandleLogic(idx, ctx);
            });

            const state = marketStatesRef.current[activeTab];
            const ks = kinematicsRef.current[activeTab];
            if (state && ks) {
                const isBuy = ks.currentFeatures?.z < -1.5 && ks.lastVelocity < 0;
                const isSell = ks.currentFeatures?.z > 1.5 && ks.lastVelocity > 0;
                if (isBuy || isSell) aiBrain.current.shadowTrades.push({ entryPrice: state.currentValue, type: isBuy ? 'BUY' : 'SELL', ticksToWait: Math.floor(state.tradeDuration / 1000 * window.CONFIG.TICK_RATE), featuresSnapshot: { ...ks.currentFeatures } });
                aiBrain.current.shadowTrades = aiBrain.current.shadowTrades.filter(t => {
                    if (--t.ticksToWait <= 0) {
                        window.aiEngine.trainAI(t.featuresSnapshot, (t.type === 'BUY' ? state.currentValue > t.entryPrice : state.currentValue < t.entryPrice) ? 1 : 0, aiBrain, setAiLearnedCount);
                        return false;
                    }
                    return true;
                });
            }
        };

        const loop = () => {
            animationId = requestAnimationFrame(loop);
            const now = Date.now();
            if (!navigator.onLine || !isTabVisibleRef.current) return;
            const deltaTime = now - lastLogicTimeRef.current;

            const zoomPct = (window.CONFIG.ZOOM_MAX - zoomCurrentRef.current) / (window.CONFIG.ZOOM_MAX - window.CONFIG.ZOOM_MIN);
            let targetTicksPerCandle = 4;
            if (zoomPct > 0.75) targetTicksPerCandle = 3; else if (zoomPct < 0.25) targetTicksPerCandle = 5;

            if (marketStatesRef.current[activeTab].ticksPerCandle !== targetTicksPerCandle) {
                const ctx = getContext();
                [0, 1, 2].forEach(idx => {
                    marketStatesRef.current[idx].ticksPerCandle = targetTicksPerCandle;
                    if (window.generator.rebuildCandles) window.generator.rebuildCandles(idx, ctx);
                });
            }

            if (deltaTime >= window.CONFIG.LOGIC_RATE_MS) {
                const safeTicks = Math.min(Math.floor(deltaTime / window.CONFIG.LOGIC_RATE_MS), 20);
                for (let i = 0; i < safeTicks; i++) runMarketLogic(safeTicks > 1);
                if (safeTicks > 1 && !isUserInteractingRef.current) [0, 1, 2].forEach(idx => { marketStatesRef.current[idx].targetScroll = marketStatesRef.current[idx].candles.length; marketStatesRef.current[idx].scrollOffset = marketStatesRef.current[idx].candles.length; });
                lastLogicTimeRef.current += safeTicks * window.CONFIG.LOGIC_RATE_MS;

                const realNow = Date.now();
                const expiredTrades = activeTradesRef.current.filter(t => realNow >= t.expiryTime);
                if (expiredTrades.length > 0) {
                    let totalPayout = 0;
                    expiredTrades.forEach(trade => {
                        const tradeState = marketStatesRef.current[trade.tabIndex];
                        const isWin = trade.type === 'BUY' ? tradeState.visualValue > trade.entryPrice : tradeState.visualValue < trade.entryPrice;

                        if (autopilot) {
                            if (isWin) {
                                consecutiveLossesRef.current = 0;
                            } else {
                                consecutiveLossesRef.current += 1;
                                // Check for 3 losses + 20% drop
                                if (consecutiveLossesRef.current >= 3 && balance <= autopilotStartBalanceRef.current * 0.8) {
                                    setAutopilot(false);
                                    addNotification({ type: 'NOTIFICACIÓN', signalType: 'SYSTEM', confidence: 1, message: 'AUTOPILOT TERMINATED BY SAFETY PROTOCOL' });
                                }
                            }
                        }

                        if (trade.aiSnapshot) window.aiEngine.trainAI(trade.aiSnapshot, isWin ? 1 : 0, aiBrain, setAiLearnedCount);
                        if (trade.tabIndex === activeTab) {
                            const currentPreciseIndex = tradeState.candles.length + (tradeState.visualTicks.length / tradeState.ticksPerCandle);
                            resultLabelsRef.current.push({ id: now + Math.random(), xIndex: currentPreciseIndex, xTickIndex: tradeState.allTicks.length, xCandleIndex: currentPreciseIndex, price: tradeState.currentValue, profit: isWin ? trade.amount * 0.85 : -trade.amount, timestamp: now, type: isWin ? 'WIN' : 'LOSS' });
                        }
                        if (isWin) totalPayout += trade.amount * 1.85;
                    });
                    activeTradesRef.current = activeTradesRef.current.filter(t => realNow < t.expiryTime);
                    setActiveTradesUI([...activeTradesRef.current]);
                    if (totalPayout > 0) setBalance(b => b + totalPayout);
                }
            }

            if (now - lastUIUpdateRef.current >= window.CONFIG.UI_UPDATE_RATE_MS) {
                const currentState = marketStatesRef.current[activeTab];
                if (!isMobileRef.current) {
                    currentState.zoom = zoom;
                    currentState.zoomTarget = zoomTargetRef.current;
                }
                setCurrentPriceUI(currentState.visualValue);
                setAssetsInfo(prev => prev.map((info, idx) => ({ ...info, price: marketStatesRef.current[idx].visualValue })));
                if (activeTradesRef.current.length > 0) setActiveTradesUI([...activeTradesRef.current]);
                lastUIUpdateRef.current = now;
            }
            window.draw.drawCanvas(getContext());
        };
        lastLogicTimeRef.current = Date.now();
        loop();
        return () => cancelAnimationFrame(animationId);
    }, [zoom, addNotification, activeTab, autopilot, balance]);

    const tradesDisabled = !isOnline || autopilot || activeTradesRef.current.length >= (autopilot ? 1 : 4);

    return (
        <div className="flex flex-col h-[100dvh] relative bg-[#050505] text-white font-sans overflow-hidden" style={{ height: '100dvh' }}>
            <div className="absolute top-0 left-0 w-full h-full z-10" ref={containerRef}><canvas ref={canvasRef} className="w-full h-full cursor-crosshair" /></div>

            <window.UI.Header balance={balance} currentPriceUI={currentPriceUI} isGenerating={isGenerating} activeAssetName={assetsInfo[activeTab].name} />

            <div className="absolute top-10 left-0 w-full flex justify-center z-20 pointer-events-none">
                <window.UI.AssetTabs assetsInfo={assetsInfo} activeTab={activeTab} onTabChange={handleTabChange} />
            </div>

            {!isOnline && (
                <div className="absolute top-[100px] md:top-[140px] w-full flex justify-center z-30 pointer-events-none px-4">
                    <div className="glass-panel px-6 h-16 flex items-center justify-center gap-3 animate-fade-in text-white/90">
                        <img src={window.ICONS.wifiOff} className="w-5 h-5 opacity-80" />
                        <div className="flex flex-col justify-center items-start gap-1">
                            <div className="opacity-80 text-white/50 text-[10px] font-normal">EN ESPERA DE RED...</div>
                            <div className="text-sm font-medium">SIN CONEXIÃ“N Wi-Fi</div>
                        </div>
                    </div>
                </div>
            )}

            <window.UI.NotificationList notifications={notifications} onNotificationClick={(note) => note.type === 'SIGNAL' && executeTrade(note.signalType)} />

            <div className="absolute top-28 left-6 md:left-10 z-10 flex flex-col gap-1 pointer-events-none opacity-40">
                <div className="text-[10px] font-bold text-[#444] tracking-widest">ADAPTIVE CRITIC</div>
                <div className="flex items-center gap-2">
                    <div className="w-10 h-1 bg-[#222] rounded-full overflow-hidden"><div className="h-full bg-white/40" style={{ width: `${aiConfidence * 100}%` }}></div></div>
                    <span className="text-[9px] text-[#555]">{aiLearnedCount} OPS</span>
                </div>
            </div>

            <window.UI.BottomControls
                isGenerating={isGenerating} isOnline={isOnline} isMobile={isMobile}
                handleGenerateAsset={() => { if (!isGenerating) window.generator.generateAssetForTab(activeTab, getContext()); }}
                autopilot={autopilot} setAutopilot={setAutopilot}
                sliderPercentage={((zoom - 80) / (500 - 80)) * 100}
                zoom={zoom} setZoom={(val) => { isUserInteractingRef.current = true; zoomTargetRef.current = val; setZoom(val); }}
                activeTradesUI={activeTradesUI} buyButtonOpacity={buyButtonOpacity} sellButtonOpacity={sellButtonOpacity}
                currentDuration={currentDuration} handleTouchStart={handleTouchStart} handleTouchEnd={handleTouchEnd}
                executeTrade={executeTrade} tradesDisabled={tradesDisabled} balance={balance}
            />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MarketSim />);