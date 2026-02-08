window.ICONS = {
    search: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/search.png',
    loader: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/loader.png',
    trendingUp: './svg/up.svg',
    trendingDown: './svg/up.svg',
    wifiOff: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/wifiOff.png',
    activityWin: './svg/up.svg',
    activityLoss: './svg/up.svg',
    activityNeutral: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/neutral.png',
};

window.MATERIALS = ["PLATA", "BRONZE", "IRON", "COBRE", "LITIUM", "ORE", "RODIUM", "X"];
window.ADJECTIVES = ["AIR", "01", "02", "03", "04", "05", "10", "15", "20", "25", "50", "60", "70", "80", "90", "99", "ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"];

window.sigmoid = (x) => 1 / (1 + Math.exp(-x));

window.Interface = {
    // Utilidad para detectar si el usuario toca UI interactiva y NO el canvas
    isInteractive: (node) => {
        try {
            return node && node.closest && node.closest('button, input, .glass-button, .tab-item, .toggle-switch');
        } catch (e) {
            return false;
        }
    },

    setupZoomAndTouch: (container, refs) => {
        if (!container) return;
        let zoomTimeout;

        const onWheel = (e) => {
            if (window.Interface.isInteractive(e.target)) return;
            e.preventDefault();

            // Bloquear auto-scroll temporalmente mientras se hace wheel
            refs.isUserInteracting.current = true;
            
            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                // Check al terminar el scroll: si estamos en el borde, liberar
                const state = refs.marketStatesRef.current[refs.activeTab.current];
                if (state && state.targetScroll >= state.candles.length - 0.5) {
                    refs.isUserInteracting.current = false;
                }
            }, 150);

            // DETECTAR SI ES ZOOM O SCROLL
            const isZoom = e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2;
            const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);

            if (e.ctrlKey) {
                // --- MODO ZOOM (Pellizco en Trackpad o Ctrl+Wheel) ---
                // Invertido: deltaY positivo (abajo) = Zoom OUT (ver más), deltaY negativo = Zoom IN
                const factor = e.deltaY > 0 ? 1.04 : 0.96;
                const newTarget = Math.max(80, Math.min(500, refs.zoomTarget.current * factor));
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);
            } else if (isHorizontalScroll) {
                // --- MODO SCROLL HORIZONTAL (Trackpad Swipe) ---
                const state = refs.marketStatesRef.current[refs.activeTab.current];
                const width = container.clientWidth;
                const scrollSpeed = 2;
                const candleWidth = (width / refs.zoomTarget.current) * (state.ticksPerCandle / 4);
                const candleDelta = (e.deltaX * scrollSpeed) / candleWidth;

                // Mover targetScroll
                state.targetScroll += candleDelta;

                // [FIX AUTO-SCROLL] Lógica de liberación
                const maxScroll = state.candles.length;
                
                // Límites
                if (state.targetScroll > maxScroll) {
                    state.targetScroll = maxScroll;
                    refs.isUserInteracting.current = false; // Estamos en el presente -> Auto-scroll ON
                } else if (state.targetScroll < maxScroll - 0.5) {
                    refs.isUserInteracting.current = true; // Estamos en el pasado -> Auto-scroll OFF
                }
                
                // Límite izquierdo (historia)
                const isSmall = width < 768;
                const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
                const anchorX = width * anchorDefault;
                const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
                const minScroll = (anchorX + shift) / candleWidth;
                
                if (state.targetScroll < minScroll) state.targetScroll = minScroll;

            } else {
                // --- MODO ZOOM NORMAL (Rueda Mouse Vertical) ---
                const factor = e.deltaY > 0 ? 0.94 : 1.06;
                const newTarget = Math.max(80, Math.min(500, refs.zoomTarget.current * factor));
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);
            }
        };

        let touchActive = false;

        const onTouchStart = (e) => {
            if (e.touches && e.touches.length === 2) {
                if (window.Interface.isInteractive(e.target)) return;
                touchActive = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                refs.pinchStart.current = Math.hypot(dx, dy);
                refs.lastTouchTarget.current = e.target;
            }
        };

        const onTouchMove = (e) => {
            if (!touchActive) return;
            if (e.touches && e.touches.length === 2 && refs.pinchStart.current) {
                if (window.Interface.isInteractive(refs.lastTouchTarget.current)) return;
                e.preventDefault();

                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                const ratio = refs.pinchStart.current / dist;

                refs.pinchStart.current = dist;
                refs.isUserInteracting.current = true; // Bloquear auto-scroll mientras se hace zoom

                const newTarget = Math.max(80, Math.min(500, Math.round(refs.zoomTarget.current * ratio)));
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);
            }
        };

        const onTouchEnd = () => {
            if (!window.event?.touches || window.event?.touches?.length < 2) {
                touchActive = false;
                refs.pinchStart.current = null;
                refs.lastTouchTarget.current = null;
                // Al soltar zoom, liberamos interacción tras breve delay
                setTimeout(() => {
                   refs.isUserInteracting.current = false; 
                }, 200);
            }
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);

        return () => {
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
        };
    },

    setupHorizontalDrag: (container, canvas, refs) => {
        if (!container || !canvas) return;

        let isDragging = false;
        let startX = 0;
        let startTargetScroll = 0;

        const handleStart = (clientX, target) => {
            if (window.Interface.isInteractive(target)) return;
            isDragging = true;
            startX = clientX;
            const state = refs.marketStatesRef.current[refs.activeTab.current];
            startTargetScroll = state.targetScroll;
            refs.isUserInteracting.current = true; // Usuario inicia interacción
        };

        const handleMove = (clientX) => {
            if (!isDragging) return;
            const deltaX = clientX - startX;
            const state = refs.marketStatesRef.current[refs.activeTab.current];
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const candleWidth = (width / refs.zoomCurrentRef.current) * (state.ticksPerCandle / 4);
            
            // Invertido: arrastrar a la izquierda (delta negativo) avanza al futuro
            // Arrastrar derecha (delta positivo) va al pasado
            const candleDelta = deltaX / candleWidth;
            const newTarget = startTargetScroll - candleDelta;

            const isSmall = width < 768;
            const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
            const anchorX = width * anchorDefault;
            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
            const minScroll = (anchorX + shift) / candleWidth;

            // Limitar target
            state.targetScroll = Math.max(minScroll, Math.min(state.candles.length, newTarget));

            // [FIX CRÍTICO AUTO-SCROLL]
            // Si estamos muy cerca del borde derecho (presente), marcar para liberar
            if (state.targetScroll >= state.candles.length - 0.5) {
                // Opción A: Liberar inmediatamente (puede causar rebote si el usuario sigue arrastrando)
                // Opción B: Mantener true mientras arrastra, liberar en 'handleEnd'
                // Vamos con Opción B mejorada: indicamos visualmente snap pero mantenemos lock hasta soltar
            } 
        };

        const handleEnd = () => {
            isDragging = false;
            
            // Al soltar, verificamos si debemos reactivar el auto-scroll
            const state = refs.marketStatesRef.current[refs.activeTab.current];
            
            // Si el usuario soltó cerca del final (últimas 2 velas), hacemos snap al presente y activamos auto-scroll
            if (state.candles.length - state.targetScroll < 2.0) {
                state.targetScroll = state.candles.length;
                refs.isUserInteracting.current = false; // REACTIVAR AUTO-SCROLL
            } else {
                refs.isUserInteracting.current = true; // MANTENER EN MODO HISTORIAL
            }
        };

        const onMouseDown = (e) => handleStart(e.clientX, e.target);
        const onMouseMove = (e) => handleMove(e.clientX);
        const onMouseUp = () => handleEnd();
        
        // Salir del canvas también termina el drag
        const onMouseLeave = () => { if(isDragging) handleEnd(); };

        const onTouchStart = (e) => {
            if (e.touches.length === 1) handleStart(e.touches[0].clientX, e.target);
        };
        const onTouchMove = (e) => {
            if (e.touches.length === 1 && isDragging) {
                handleMove(e.touches[0].clientX);
                // Evitar scroll nativo de la página (pull to refresh, etc) si es horizontal
                if (Math.abs(e.touches[0].clientX - startX) > 5) e.preventDefault();
            }
        };
        const onTouchEnd = () => handleEnd();

        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        container.addEventListener('mouseleave', onMouseLeave);

        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('mouseleave', onMouseLeave);

            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
        };
    },

    setupResizeObserver: (container, canvas, refs) => {
        if (!container || !canvas) return;

        const resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry || entry.contentRect.width === 0) return;

            const dpr = window.devicePixelRatio || 1;
            // Ajustar tamaño del canvas buffer para nitidez
            canvas.width = entry.contentRect.width * dpr;
            canvas.height = entry.contentRect.height * dpr;
            // Ajustar tamaño visual CSS
            canvas.style.width = `${entry.contentRect.width}px`;
            canvas.style.height = `${entry.contentRect.height}px`;

            if (refs.isMobile) {
                refs.isMobile.current = entry.contentRect.width < 768;
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }
};