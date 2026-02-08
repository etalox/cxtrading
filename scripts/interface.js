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
    isInteractive: (node) => {
        try {
            return node && node.closest && node.closest('button, input, .glass-button, .tab-item, .toggle-switch');
        } catch (e) {
            return false;
        }
    },

    setupZoomAndTouch: (container, refs) => {
        if (!container) return;

        const onWheel = (e) => {
            if (window.Interface.isInteractive(e.target)) return;
            e.preventDefault();
            refs.isUserInteracting.current = true;
            
            // 1. Datos iniciales antes del zoom
            const state = refs.marketStatesRef.current[refs.activeTab.current];
            const currentZoom = refs.zoomCurrentRef.current; // Usar el zoom REAL actual
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            
            // Calcular ancho de vela actual
            const width = container.clientWidth;
            const currentCandleWidth = (width / currentZoom) * (state.ticksPerCandle / 4);
            
            // Calcular qué vela está bajo el mouse (Pivot Point)
            // Lógica inversa a draw.js: X -> Index
            // x = (candleIndex - scrollOffset) * candleWidth + anchorX + shift
            // index = ((x - anchorX - shift) / candleWidth) + scrollOffset
            
            const isSmall = width < 768;
            const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
            const anchorX = width * anchorDefault;
            const shift = ((state.ticksPerCandle - 1) / 2) * (currentCandleWidth / state.ticksPerCandle);
            
            // El índice de la vela bajo el mouse
            const mouseCandleIndex = ((mouseX - anchorX - shift) / currentCandleWidth) + state.targetScroll;

            // 2. Aplicar Zoom
            const factor = e.deltaY > 0 ? 1.06 : 0.94;
            const newZoom = Math.max(80, Math.min(500, currentZoom * factor));
            
            refs.zoomTarget.current = newZoom;
            refs.setZoom(newZoom);

            // 3. Recalcular Scroll para mantener el Pivot (mouseCandleIndex) en el mismo mouseX
            // Nuevo ancho de vela
            const newCandleWidth = (width / newZoom) * (state.ticksPerCandle / 4);
            const newShift = ((state.ticksPerCandle - 1) / 2) * (newCandleWidth / state.ticksPerCandle);
            
            // Despejamos targetScroll de la fórmula original usando los nuevos valores:
            // mouseCandleIndex = ((mouseX - anchorX - newShift) / newCandleWidth) + newTargetScroll
            // newTargetScroll = mouseCandleIndex - ((mouseX - anchorX - newShift) / newCandleWidth)
            
            const newTargetScroll = mouseCandleIndex - ((mouseX - anchorX - newShift) / newCandleWidth);
            
            // 4. Aplicar límites
            const minScroll = (anchorX + newShift) / newCandleWidth; // Scroll mínimo (izquierda)
            
            if (newTargetScroll < minScroll) {
                state.targetScroll = minScroll;
            } else if (newTargetScroll > state.candles.length) {
                state.targetScroll = state.candles.length;
            } else {
                state.targetScroll = newTargetScroll;
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
                refs.isUserInteracting.current = true; // Importante
                
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                const ratio = refs.pinchStart.current / dist;
                
                // Lógica simplificada para touch (zoom al centro o pivot medio)
                // Por ahora mantenemos la lógica simple de zoom + clamp
                const newTarget = Math.max(80, Math.min(500, Math.round(refs.zoomTarget.current * ratio)));
                
                refs.pinchStart.current = dist;
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);

                // Limitar scroll
                const state = refs.marketStatesRef.current[refs.activeTab.current];
                const width = container.clientWidth;
                const candleWidth = (width / newTarget) * (state.ticksPerCandle / 4);
                
                const isSmall = width < 768;
                const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
                const anchorX = width * anchorDefault;
                const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
                const minScroll = (anchorX + shift) / candleWidth;
                
                if (state.targetScroll < minScroll) state.targetScroll = minScroll;
                 else if (state.targetScroll > state.candles.length) state.targetScroll = state.candles.length;
            }
        };

        const onTouchEnd = () => {
            if (!window.event?.touches || window.event?.touches?.length < 2) {
                touchActive = false;
                refs.pinchStart.current = null;
                refs.lastTouchTarget.current = null;
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
            refs.isUserInteracting.current = true;
        };

        const handleMove = (clientX) => {
            if (!isDragging) return;
            const deltaX = clientX - startX;
            const state = refs.marketStatesRef.current[refs.activeTab.current];

            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const candleWidth = (width / refs.zoomCurrentRef.current) * (state.ticksPerCandle / 4);

            const candleDelta = deltaX / candleWidth;
            const newTarget = startTargetScroll - candleDelta;

            const isSmall = width < 768;
            const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
            const anchorX = width * anchorDefault;
            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
            const minScroll = (anchorX + shift) / candleWidth;

            // Clamp estricto
            state.targetScroll = Math.max(minScroll, Math.min(state.candles.length, newTarget));

            // Mantener interacción activa mientras se arrastra
            refs.isUserInteracting.current = true;
        };

        const handleEnd = () => {
            isDragging = false;
        };

        const onMouseDown = (e) => handleStart(e.clientX, e.target);
        const onMouseMove = (e) => handleMove(e.clientX);
        const onMouseUp = () => handleEnd();

        const onTouchStart = (e) => {
            if (e.touches.length === 1) handleStart(e.touches[0].clientX, e.target);
        };
        const onTouchMove = (e) => {
            if (e.touches.length === 1 && isDragging) {
                handleMove(e.touches[0].clientX);
                if (Math.abs(e.touches[0].clientX - startX) > 5) e.preventDefault();
            }
        };
        const onTouchEnd = () => handleEnd();

        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

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
            canvas.width = entry.contentRect.width * dpr;
            canvas.height = entry.contentRect.height * dpr;
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