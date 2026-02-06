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

    const [balance, setBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('cx_balance');
            return saved ? parseFloat(saved) : 100000;
        } catch (e) { return 100000; }
    });
    useEffect(() => { localStorage.setItem('cx_balance', balance); }, [balance]);

    const assetHistoryRef = useRef([]);

    // Logic moved to generator.js
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
    const pendingTicksRef = useRef(0);

    // Zoom and interaction handling
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const pinchStartRef = useRef(null);
    const lastTouchTargetRef = useRef(null);
    const isUserInteractingRef = useRef(false);

    // UI Constants
    const TICK_RATE = 2; const INVESTMENT_AMOUNT = 50; const UI_UPDATE_RATE_MS = 125; const TICK_HISTORY_LIMIT = 100;
    const DURATIONS = [5000, 10000, 15000, 30000];

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

    useEffect(() => {
        const updateMobile = () => { isMobileRef.current = window.innerWidth < 768; };
        updateMobile();
        window.addEventListener('resize', updateMobile);

        const handleVisibilityChange = () => {
            if (document.hidden) {
                isTabVisibleRef.current = false;
            } else {
                isTabVisibleRef.current = true;
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const container = containerRef.current;
        if (!container) return;

        const isInteractive = (node) => { try { return node && node.closest && node.closest('button, input, .glass-button, .tab-item, .toggle-switch'); } catch (e) { return false; } };
        const onWheel = (e) => {
            if (isInteractive(e.target)) return;
            e.preventDefault();
            isUserInteractingRef.current = true;
            const delta = -e.deltaY;
            const factor = delta > 0 ? 0.94 : 1.06;
            const newTarget = Math.max(80, Math.min(500, zoomTargetRef.current * factor));
            zoomTargetRef.current = newTarget;
            setZoom(newTarget);
        };
        let touchActive = false;
        const onTouchStart = (e) => {
            if (e.touches && e.touches.length === 2) { if (isInteractive(e.target)) return; touchActive = true; const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; pinchStartRef.current = Math.hypot(dx, dy); lastTouchTargetRef.current = e.target; }
        };
        const onTouchMove = (e) => {
            if (!touchActive) return;
            if (e.touches && e.touches.length === 2 && pinchStartRef.current) {
                if (isInteractive(lastTouchTargetRef.current)) return;
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const ratio = (pinchStartRef.current || dist) / dist;
                pinchStartRef.current = dist;
                isUserInteractingRef.current = true;
                const newTarget = Math.max(80, Math.min(500, Math.round(zoomTargetRef.current * ratio)));
                zoomTargetRef.current = newTarget;
                setZoom(newTarget);
            }
        };
        const onTouchEnd = () => { if (!window.event?.touches || window.event?.touches?.length < 2) { touchActive = false; pinchStartRef.current = null; lastTouchTargetRef.current = null; } };
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);
        return () => {
            window.removeEventListener('resize', updateMobile);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
        };
    }, []);

    useEffect(() => {
        const hasActiveTrades = activeTradesUI.length > 0;
        if (hasActiveTrades) {
            if (zoomTargetRef.current > 200) {
                preTradeZoomRef.current = zoomTargetRef.current;
                isUserInteractingRef.current = false;
                zoomTargetRef.current = 160;
                setZoom(160);
            }
        } else {
            if (preTradeZoomRef.current !== null && !isUserInteractingRef.current) {
                zoomTargetRef.current = preTradeZoomRef.current;
                setZoom(preTradeZoomRef.current);
                preTradeZoomRef.current = null;
            }
        }
    }, [activeTradesUI.length]);

    const activeTradesRef = useRef([]);
    const isNotificationVisible = useRef(false);
    const lastSignalRef = useRef(null);
    const lastUIUpdateRef = useRef(0);

    const aiBrain = useRef({ weights: { velocity: 0.8, acceleration: 1.2, zScore: 0.6, duration: -0.5, bias: 0.1 }, learningRate: 0.05, history: [], shadowTrades: [] });
    const resultLabelsRef = useRef([]);

    const addNotification = useCallback((data) => {
        if (data.type === 'SIGNAL' && isNotificationVisible.current) return;
        if (data.type === 'WIN' || data.type === 'LOSS') return;
        const id = Date.now() + Math.random();
        const duration = data.type === 'OFFLINE' ? 0 : 4000;
        setNotifications(prev => { if (data.type === 'SIGNAL' && prev.length === 0) return [{ ...data, id }]; return prev; });
        if (data.type !== 'OFFLINE') { isNotificationVisible.current = true; setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); if (notifications.length <= 1) isNotificationVisible.current = false; }, duration); } else { isNotificationVisible.current = true; }
    }, []);

    const executeTrade = (type) => {
        if (!isOnline) return;
        const maxTrades = autopilot ? 1 : 4;
        if (activeTradesRef.current.length >= maxTrades) return;
        setNotifications(prev => prev.filter(n => n.type !== 'SIGNAL'));
        isNotificationVisible.current = false;
        const state = marketStatesRef.current[activeTab];
        const ks = kinematicsRef.current[activeTab];
        const currentPreciseIndex = state.candles.length + (state.visualTicks.length / state.ticksPerCandle);
        const now = Date.now();
        const duration = state.tradeDuration || 10000;
        const newTrade = {
            id: Date.now() + Math.random(), type, entryPrice: state.visualValue,
            entryIndex: currentPreciseIndex, startTime: now, expiryTime: now + duration,
            amount: INVESTMENT_AMOUNT, aiSnapshot: { ...ks.currentFeatures }, duration: duration, tabIndex: activeTab
        };
        activeTradesRef.current.push(newTrade);
        setActiveTradesUI([...activeTradesRef.current]);
        setBalance(prev => prev - INVESTMENT_AMOUNT);
    };

    // Helper to gather context for modules
    const getContext = () => ({
        marketStatesRef,
        tickHistoriesRef,
        kinematicsRef,
        activeTab,
        aiBrain,
        setAiConfidence,
        addNotification,
        autopilot,
        activeTradesRef,
        lastSignalRef,
        executeTrade,
        assetsInfo,
        setAssetsInfo,
        assetHistoryRef,
        setCurrentDuration,
        setIsGenerating,
        canvasRef,
        resultLabelsRef,
        zoomCurrentRef,
        zoomTargetRef,
    });

    const generateAssetForTab = useCallback((tabIndex) => {
        window.generator.generateAssetForTab(tabIndex, getContext());
    }, [activeTab, assetsInfo]);

    useEffect(() => {
        if (!marketStatesRef.current[0].initialized) {
            setIsGenerating(true);
            setTimeout(() => generateAssetForTab(0), 10);
            setTimeout(() => generateAssetForTab(1), 50);
            setTimeout(() => generateAssetForTab(2), 100);
        }
    }, []);

    const handleTabChange = (index) => {
        setActiveTab(index);
        const state = marketStatesRef.current[index];
        state.visualMinPrice = undefined;
        state.visualMaxPrice = undefined;
        setCurrentDuration(state.tradeDuration / 1000);
        setCurrentPriceUI(state.visualValue);
    };

    const handleGenerateAsset = () => {
        if (isGenerating) return;
        setIsGenerating(true);
        setTimeout(() => { generateAssetForTab(activeTab); }, 600);
    };

    const handleNotificationClick = (notification) => {
        if (notification.type === 'SIGNAL') { executeTrade(notification.signalType); }
    };

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setNotifications(prev => prev.filter(n => n.type !== 'OFFLINE'));
        };

        const handleOffline = () => {
            setIsOnline(false);
            addNotification({ type: 'OFFLINE' });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [addNotification]);

    useEffect(() => {
        let animationId;
        const LOGIC_RATE_MS = 1000 / TICK_RATE;

        const runMarketLogic = (forceSnap) => {
            const ctx = getContext();
            window.generator.processMarketLogic(0, ctx);
            if (forceSnap) { ctx.marketStatesRef.current[0].visualValue = ctx.marketStatesRef.current[0].currentValue; }
            window.generator.updateVisualCandleLogic(0, ctx);

            window.generator.processMarketLogic(1, ctx);
            if (forceSnap) { ctx.marketStatesRef.current[1].visualValue = ctx.marketStatesRef.current[1].currentValue; }
            window.generator.updateVisualCandleLogic(1, ctx);

            window.generator.processMarketLogic(2, ctx);
            if (forceSnap) { ctx.marketStatesRef.current[2].visualValue = ctx.marketStatesRef.current[2].currentValue; }
            window.generator.updateVisualCandleLogic(2, ctx);

            const state = marketStatesRef.current[activeTab];
            const ks = kinematicsRef.current[activeTab];
            if (state && ks) {
                const currentTicksToWait = Math.floor((state.tradeDuration || 10000) / 1000 * TICK_RATE);
                const isBuy = ks.currentFeatures?.z < -1.5 && ks.lastVelocity < 0;
                const isSell = ks.currentFeatures?.z > 1.5 && ks.lastVelocity > 0;
                if (isBuy || isSell) {
                    aiBrain.current.shadowTrades.push({ entryPrice: state.currentValue, type: isBuy ? 'BUY' : 'SELL', ticksToWait: currentTicksToWait, featuresSnapshot: { ...ks.currentFeatures } });
                }
                aiBrain.current.shadowTrades = aiBrain.current.shadowTrades.filter(t => {
                    t.ticksToWait--;
                    if (t.ticksToWait <= 0) {
                        const isWin = t.type === 'BUY' ? state.currentValue > t.entryPrice : state.currentValue < t.entryPrice;
                        window.aiEngine.trainAI(t.featuresSnapshot, isWin ? 1 : 0, aiBrain, setAiLearnedCount);
                        return false;
                    }
                    return true;
                });
            }
        };

        const handleVisibilityChange = () => {
            isTabVisibleRef.current = !document.hidden;
        };

        const handleOnline = () => {
            setIsOnline(true);
            setNotifications(prev => prev.filter(n => n.type !== 'OFFLINE'));
        };

        const handleOffline = () => {
            setIsOnline(false);
            addNotification({ type: 'OFFLINE' });
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const loop = () => {
            animationId = requestAnimationFrame(loop);
            const now = Date.now();
            if (!navigator.onLine || !isTabVisibleRef.current) return;
            const deltaTime = now - lastLogicTimeRef.current;

            // --- Dynamic Candle Density Logic ---
            const zoomPct = (500 - zoomCurrentRef.current) / 420;
            let targetTicksPerCandle = 4;
            if (zoomPct > 0.75) targetTicksPerCandle = 1;
            else if (zoomPct > 0.50) targetTicksPerCandle = 2;
            else if (zoomPct > 0.25) targetTicksPerCandle = 3;

            const currentState = marketStatesRef.current[activeTab];
            if (currentState.ticksPerCandle !== targetTicksPerCandle) {
                const ctx = getContext();
                [0, 1, 2].forEach(idx => {
                    const s = marketStatesRef.current[idx];
                    s.ticksPerCandle = targetTicksPerCandle;
                    if (window.generator.rebuildCandles) {
                        window.generator.rebuildCandles(idx, ctx);
                    }
                });
            }
            // -------------------------------------

            if (deltaTime >= LOGIC_RATE_MS) {
                const ticksToProcess = Math.floor(deltaTime / LOGIC_RATE_MS);
                const MAX_TICKS_PER_FRAME = 20;
                const safeTicks = Math.min(ticksToProcess, MAX_TICKS_PER_FRAME);
                const isCatchingUp = safeTicks > 1;

                for (let i = 0; i < safeTicks; i++) {
                    runMarketLogic(isCatchingUp);
                }

                if (isCatchingUp) {
                    [0, 1, 2].forEach(idx => {
                        const s = marketStatesRef.current[idx];
                        s.targetScroll = s.candles.length;
                        s.scrollOffset = s.candles.length;
                    });
                }

                lastLogicTimeRef.current += safeTicks * LOGIC_RATE_MS;
                const realNow = Date.now();
                const expiredTrades = activeTradesRef.current.filter(t => realNow >= t.expiryTime);
                if (expiredTrades.length > 0) {
                    let totalPayout = 0;
                    expiredTrades.forEach(trade => {
                        const tradeState = marketStatesRef.current[trade.tabIndex];
                        const isWin = trade.type === 'BUY' ? tradeState.visualValue > trade.entryPrice : tradeState.visualValue < trade.entryPrice;
                        if (trade.aiSnapshot) window.aiEngine.trainAI(trade.aiSnapshot, isWin ? 1 : 0, aiBrain, setAiLearnedCount);
                        if (trade.tabIndex === activeTab) {
                            const currentPreciseIndex = tradeState.candles.length + (tradeState.visualTicks.length / tradeState.ticksPerCandle);
                            resultLabelsRef.current.push({
                                id: Date.now() + Math.random(), xIndex: currentPreciseIndex,
                                price: tradeState.currentValue, profit: isWin ? trade.amount * 0.85 : -trade.amount,
                                timestamp: Date.now(), type: isWin ? 'WIN' : 'LOSS'
                            });
                        }
                        if (isWin) { totalPayout += trade.amount * 1.85; }
                    });
                    activeTradesRef.current = activeTradesRef.current.filter(t => realNow < t.expiryTime);
                    setActiveTradesUI([...activeTradesRef.current]);
                    if (totalPayout > 0) setBalance(b => b + totalPayout);
                }
            }

            const state = marketStatesRef.current[activeTab];
            if (now - lastUIUpdateRef.current >= UI_UPDATE_RATE_MS) {
                setCurrentPriceUI(state.visualValue);
                setAssetsInfo(prev => prev.map((info, idx) => ({ ...info, price: marketStatesRef.current[idx].visualValue })));
                lastUIUpdateRef.current = now;
            }

            // Call draw.js
            window.draw.drawCanvas(getContext());
        };

        lastLogicTimeRef.current = Date.now();
        loop();

        return () => {
            cancelAnimationFrame(animationId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [zoom, addNotification, activeTab, autopilot]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            if (width === 0 || height === 0) return;
            const canvas = canvasRef.current;
            if (canvas) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;
                isMobileRef.current = width < 768;
            }
        });
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const sliderPercentage = ((zoom - 80) / (500 - 80)) * 100;

    const maxTrades = autopilot ? 1 : 4;
    const tradesDisabled = !isOnline || autopilot || activeTradesRef.current.length >= maxTrades;

    return (
        <div className="flex flex-col h-[100dvh] relative bg-[#050505] text-white font-sans overflow-hidden" style={{ height: '100dvh' }}>
            <div className="absolute top-0 left-0 w-full h-full z-10" ref={containerRef}>
                <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
            </div>
            <div className="absolute top-10 left-0 w-full px-6 md:px-10 flex justify-between items-center z-20 pointer-events-none">
                <div className="flex flex-col justify-center items-start gap-2">
                    <div className="opacity-50 text-[10px] font-normal leading-tight">BALANCE GLOBAL</div>
                    <div className="text-sm font-normal leading-tight">${balance.toLocaleString()}</div>
                </div>

                { }
                <div className="hidden md:flex items-center gap-[10px] pointer-events-auto">
                    {assetsInfo.map((info, idx) => {
                        const isActive = activeTab === idx;
                        return (
                            <div
                                key={idx}
                                onClick={() => handleTabChange(idx)}
                                className={`
                                    tab-item h-[60px] px-10 flex items-center justify-center gap-[10px]
                                    ${isActive ? 'border border-white' : 'border border-white/40'}
                                    overflow-hidden
                                `}
                            >
                                <div className="flex items-center gap-2">
                                    {isActive && (
                                        <div className="w-2 h-2 bg-white rounded-full"></div>
                                    )}
                                    <div className={`
                                        text-sm font-normal font-sans leading-none uppercase
                                        ${isActive ? 'text-white' : 'text-white/40'}
                                    `}>
                                        {info.name}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex md:hidden items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-white animate-pulse' : 'bg-[#D9D9D9]'}`} />
                    <div className="text-sm font-normal uppercase whitespace-nowrap">{isGenerating ? 'BUSCANDO...' : assetsInfo[activeTab].name}</div>
                </div>

                <div className="flex flex-col justify-center items-end gap-2">
                    <div className="opacity-50 text-[10px] font-normal leading-tight">MERCADO EN VIVO</div>
                    <div className="text-sm font-normal leading-tight">${currentPriceUI.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
            </div>

            <div className="absolute top-[100px] md:top-[140px] w-full flex flex-col items-center gap-4 z-30 pointer-events-none px-4">
                {!isOnline && (
                    <div className="glass-panel px-6 h-16 flex items-center justify-center gap-3 animate-fade-in text-white/90">
                        <img src={window.ICONS.wifiOff} className="w-5 h-5 opacity-80" />
                        <div className="flex flex-col justify-center items-start gap-1">
                            <div className="opacity-80 text-white/50 text-[10px] font-normal">EN ESPERA DE RED...</div>
                            <div className="text-sm font-medium">SIN CONEXIÃ“N Wi-Fi</div>
                        </div>
                    </div>
                )}

                {notifications.map(note => {
                    let iconSrc = window.ICONS.activityNeutral;
                    let iconClass = "w-5 h-5";
                    let iconStyle = {};

                    if (note.type === 'SIGNAL') {
                        iconSrc = note.signalType === 'BUY' ? window.ICONS.activityWin : window.ICONS.activityLoss;
                        iconStyle = { filter: note.signalType === 'BUY' ? 'brightness(0) saturate(100%) invert(63%) sepia(83%) saturate(417%) hue-rotate(95deg) brightness(96%) contrast(86%)' : 'brightness(0) saturate(100%) invert(34%) sepia(93%) saturate(2636%) hue-rotate(331deg) brightness(96%) contrast(96%)', transform: note.signalType === 'SELL' ? 'scaleY(-1)' : 'none' };
                    }

                    return (
                        <div
                            key={note.id}
                            onClick={() => handleNotificationClick(note)}
                            className={`glass-panel !bg-white/0 !rounded-[20px] px-6 h-16 flex items-center justify-center gap-4 animate-fade-in text-white/100 ${note.type === 'SIGNAL' ? 'pointer-events-auto cursor-pointer hover:bg-white/15 transition-all' : ''}`}
                        >

                            <div className="w-12 h-12 animate-blink border border-white/40 rounded-[15px] flex items-center justify-center shrink-0">
                                <img src={iconSrc} className={`${iconClass}`} style={{ filter: 'brightness(0) invert(1)' }} />
                            </div>

                            <div className="flex flex-col animate-blink justify-center items-start gap-1">
                                <div className="opacity-80 text-white/50 text-[10px] font-normal capitalize">
                                    {note.type === 'SIGNAL' ? `${note.signalType} SIGNAL` : 'NOTIFICACIÃ“N'}
                                </div>
                                <div className="text-sm font-medium">
                                    {note.type === 'SIGNAL' ? `CONF: ${(note.confidence * 100).toFixed(0)}%` : 'SISTEMA'}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {activeTradesUI.map(trade => {
                    const tradeAsset = assetsInfo[trade.tabIndex].name;
                    const isBuy = trade.type === 'BUY';
                    const bgColor = isBuy ? 'bg-[#10B981]' : 'bg-[#F43F5E]';
                    const shadowClass = isBuy ? 'shadow-[0_0_20px_rgba(16,185,129,0.20)]' : 'shadow-[0_0_20px_rgba(244,63,94,0.20)]';
                    const icon = isBuy ? window.ICONS.trendingUp : window.ICONS.trendingDown;
                    const iconStyle = isBuy ? {} : { transform: 'scaleY(-1)' };

                    return (
                        <div key={trade.id} className="h-[62px] py-2 pl-2 pr-[22px] bg-white/10 rounded-[20px] backdrop-blur-[10px] flex items-center justify-center gap-[10px] animate-fade-in">
                            {/* Icono */}
                            <div className={`w-12 h-12 ${bgColor} ${shadowClass} rounded-[15px] flex items-center justify-center shrink-0`}>
                                <img src={icon} className="w-5 h-5 brightness-0" style={iconStyle} />
                            </div>

                            { }
                            <div className="flex flex-col justify-center items-start gap-1.5 flex-1">
                                {/* Etiqueta superior */}
                                <div className="opacity-80 text-white/50 text-[10px] font-normal font-sans leading-none">
                                    {isMobile ? 'OPERACIÃ“N ABIERTA' : tradeAsset}
                                </div>

                                { }
                                <div className="flex items-baseline justify-start w-full gap-4">
                                    <div className="text-white text-sm font-medium font-sans leading-none uppercase">
                                        {isBuy ? 'COMPRANDO...' : 'VENDIENDO...'}
                                    </div>
                                    { }
                                    <div className="text-white text-sm font-medium font-sans leading-none tabular-nums">
                                        {(Math.max(0, (trade.expiryTime - Date.now()) / 1000)).toFixed(1)}s
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="absolute top-28 left-6 md:left-10 z-10 flex flex-col gap-1 pointer-events-none opacity-40">
                <div className="text-[10px] font-bold text-[#444] tracking-widest">ADAPTIVE CRITIC</div>
                <div className="flex items-center gap-2">
                    <div className="w-10 h-1 bg-[#222] rounded-full overflow-hidden">
                        <div className="h-full bg-white/40" style={{ width: `${aiConfidence * 100}%` }}></div>
                    </div>
                    <span className="text-[9px] text-[#555]">{aiLearnedCount} OPS</span>
                </div>
            </div>

            <div className="absolute bottom-8 md:bottom-10 left-1/2 transform -translate-x-1/2 z-30 w-[95%] md:w-auto">
                <div className="glass-panel p-2 flex flex-col md:flex-row items-center gap-4 md:gap-8">

                    <button
                        onClick={handleGenerateAsset}
                        disabled={isGenerating || !isOnline}
                        className={`glass-button w-full md:w-[240px] h-16 flex items-center justify-center gap-3 hover:bg-white/20 order-1 transition-opacity duration-200 ${isGenerating || !isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <div className="w-5 h-5 flex items-center justify-center">
                            <img
                                src={isGenerating ? window.ICONS.loader : window.ICONS.search}
                                className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`}
                            />
                        </div>
                        <div className="flex flex-col items-start gap-0">
                            <div className="opacity-60 text-white text-[10px] font-normal uppercase">
                                {isMobile ? 'EXPLORACIÃ“N' : 'EXPLORAR'}
                            </div>
                            <div className="text-white text-sm font-normal uppercase whitespace-nowrap">
                                {!isOnline ? 'SIN RED' : (isGenerating ? 'BUSCANDO...' : 'NUEVO ACTIVO')}
                            </div>
                        </div>
                    </button>

                    {!isMobile && (
                        <div
                            className="h-16 px-6 flex items-center gap-4 order-2 md:order-4 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setAutopilot(!autopilot)}
                        >
                            <div className={`toggle-switch ${autopilot ? 'active' : ''}`}>
                                <div className="toggle-knob"></div>
                            </div>
                            <div className="flex flex-col items-start gap-1">
                                <div className="opacity-60 text-white text-[10px] font-normal uppercase">AUTOPILOT</div>
                                <div className="text-white text-sm font-normal uppercase">{autopilot ? 'ACTIVO' : 'INACTIVO'}</div>
                            </div>
                        </div>
                    )}

                    <div className="w-full md:w-[160px] h-4 relative mt-2 md:mt-0 mb-2 md:mb-0 px-0 order-3 md:order-3">
                        {/* LÃ­nea de fondo (Track) */}
                        <div className="w-full h-[2px] bg-[#333] rounded-full absolute top-1/2 transform -translate-y-1/2"></div>

                        {/* Indicador Visual (Knob/Barrita) */}
                        <div
                            className="absolute top-1/2 transform -translate-y-1/2 h-3 w-0.5 bg-white pointer-events-none transition-all duration-75 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                            style={{ left: `${100 - sliderPercentage}%` }}
                        ></div>

                        { }
                        <input
                            type="range"
                            min="80"
                            max="500"
                            value={580 - zoom}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                const invertedVal = 580 - val;
                                isUserInteractingRef.current = true;
                                zoomTargetRef.current = invertedVal;
                                setZoom(invertedVal);
                            }}
                            className="zoom-slider"
                        />
                    </div>

                    <div className="flex gap-2 w-full md:w-auto order-2 md:order-5">
                        <button
                            onClick={() => executeTrade('BUY')}
                            disabled={tradesDisabled}
                            className={`flex-1 md:w-48 h-16 bg-[#10B981] rounded-[20px] shadow-[0_0_20px_rgba(16,185,129,0.2)] flex items-center justify-center gap-3 active:scale-95 hover:bg-[#15c58b] transition-all ${tradesDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <img src={window.ICONS.trendingUp} className="w-5 h-5" style={{ filter: 'brightness(0)' }} />
                            <div className="flex flex-col items-start gap-0 text-black">
                                <div className="opacity-60 text-[10px] font-normal">OPERAR COMPRA</div>
                                <div className="text-sm font-medium">BUY / {currentDuration}s.</div>
                            </div>
                        </button>

                        <button
                            onClick={() => executeTrade('SELL')}
                            disabled={tradesDisabled}
                            className={`flex-1 md:w-48 h-16 bg-[#F43F5E] rounded-[20px] shadow-[0_0_20px_rgba(244,63,94,0.2)] flex items-center justify-center gap-3 active:scale-95 hover:bg-[#ff5573] transition-all ${tradesDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <img src={window.ICONS.trendingDown} className="w-5 h-5" style={{ filter: 'brightness(0)', transform: 'scaleY(-1)' }} />
                            <div className="flex flex-col items-start gap-0 text-black">
                                <div className="opacity-60 text-[10px] font-normal">OPERAR VENTA</div>
                                <div className="text-sm font-medium">SELL / {currentDuration}s.</div>
                            </div>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MarketSim />);