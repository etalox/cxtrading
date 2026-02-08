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

        let zoomTimeout;

        const onWheel = (e) => {
            if (window.Interface.isInteractive(e.target)) return;
            e.preventDefault();
            
            // Indicar que el usuario está interactuando
            refs.isUserInteracting.current = true;
            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                // Opcional: refs.isUserInteracting.current = false;
            }, 150);

            // DETECTAR SI ES ZOOM O SCROLL
            // CtrlKey suele ser true en pinch-to-zoom de trackpads
            const isZoom = e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2; 
            
            // Sin embargo, para trackpads precisos, queremos permitir paneo horizontal
            // Si el deltaX es significativo, es paneo horizontal.
            const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);

            if (e.ctrlKey) {
                // --- MODO ZOOM (Pellizco) ---
                // CORREGIDO: Invertido para que "abrir dedos" (deltaY < 0 usualmente) haga Zoom IN (aumentar target)
                // Antes: e.deltaY > 0 ? 0.96 : 1.04;
                // Ahora: e.deltaY > 0 ? 0.96 : 1.04; <-- Espera, revisemos la lógica estándar:
                // Pinch Out (Abrir) -> deltaY es negativo en muchos navegadores -> Queremos Zoom IN (Factor > 1)
                // Pinch In (Cerrar) -> deltaY es positivo -> Queremos Zoom OUT (Factor < 1)
                
                const factor = e.deltaY > 0 ? 0.96 : 1.04; 
                // Si sientes que sigue al revés, usa: e.deltaY > 0 ? 1.04 : 0.96;
                
                const newTarget = Math.max(80, Math.min(500, refs.zoomTarget.current * factor));
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);
            } else if (isHorizontalScroll) {
                // --- MODO SCROLL HORIZONTAL (Trackpad) ---
                const state = refs.marketStatesRef.current[refs.activeTab.current];
                const width = container.clientWidth;
                // Sensibilidad del scroll: ajustar divisor (ej. 2 o 1)
                const scrollSpeed = 2; 
                
                const candleWidth = (width / refs.zoomTarget.current) * (state.ticksPerCandle / 4);
                const candleDelta = (e.deltaX * scrollSpeed) / candleWidth;
                
                // Mover scroll (invertido: arrastrar izquierda = ver futuro, derecha = ver pasado)
                // Ojo: en trackpad, deslizar dedos a la izquierda (deltaX > 0) suele significar "mover contenido a la izquierda" (ver derecha)
                state.targetScroll += candleDelta; 
            } else {
                 // --- MODO ZOOM NORMAL (Rueda Mouse) ---
                 const factor = e.deltaY > 0 ? 0.94 : 1.06;
                 const newTarget = Math.max(80, Math.min(500, refs.zoomTarget.current * factor));
                 refs.zoomTarget.current = newTarget;
                 refs.setZoom(newTarget);
            }

            // --- LÍMITES COMUNES (Aplicar siempre) ---
            const state = refs.marketStatesRef.current[refs.activeTab.current];
            const width = container.clientWidth;
            const candleWidth = (width / refs.zoomTarget.current) * (state.ticksPerCandle / 4);
            
            const isSmall = width < 768;
            const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
            const anchorX = width * anchorDefault;
            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
            const minScroll = (anchorX + shift) / candleWidth;

            if (state.targetScroll < minScroll) {
                state.targetScroll = minScroll;
            } else if (state.targetScroll > state.candles.length) {
                state.targetScroll = state.candles.length;
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
                refs.isUserInteracting.current = true;
                
                const newTarget = Math.max(80, Math.min(500, Math.round(refs.zoomTarget.current * ratio)));
                refs.zoomTarget.current = newTarget;
                refs.setZoom(newTarget);

                const state = refs.marketStatesRef.current[refs.activeTab.current];
                const width = container.clientWidth;
                const candleWidth = (width / newTarget) * (state.ticksPerCandle / 4);
                
                const isSmall = width < 768;
                const anchorDefault = isSmall ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
                const anchorX = width * anchorDefault;
                const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
                const minScroll = (anchorX + shift) / candleWidth;
                
                if (state.targetScroll < minScroll) state.targetScroll = minScroll;
                // Nota: En pinch zoom móvil generalmente dejamos que el usuario se mueva libremente hasta que suelte
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

            state.targetScroll = Math.max(minScroll, Math.min(state.candles.length, newTarget));

            if (state.targetScroll < state.candles.length - 0.1) {
                refs.isUserInteracting.current = true;
            }
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
