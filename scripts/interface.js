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
            const factor = e.deltaY > 0 ? 1.06 : 0.94;
            const newTarget = Math.max(80, Math.min(500, refs.zoomTarget.current * factor));
            refs.zoomTarget.current = newTarget;
            refs.setZoom(newTarget);
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
            const state = refs.marketStatesRef.current[refs.activeTab];
            startTargetScroll = state.targetScroll;
            refs.isUserInteracting.current = true;
        };

        const handleMove = (clientX) => {
            if (!isDragging) return;
            const deltaX = clientX - startX;
            const state = refs.marketStatesRef.current[refs.activeTab];

            // Calculate candle width (consistent with draw.js)
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const candleWidth = (width / refs.zoomCurrentRef.current) * (state.ticksPerCandle / 4);

            // Convert pixel delta to candle index delta
            const candleDelta = deltaX / candleWidth;

            // Update targetScroll (dragging left moves chart right, so index decreases)
            const newTarget = startTargetScroll - candleDelta;

            // Dynamic clamping: allow current price (index candles.length) to reach x = 0
            // getX(i) = anchorX - (scroll - i) * candleWidth + shift
            // To reach x = 0 for i = state.candles.length: 
            // scroll = state.candles.length + (anchorX + shift) / candleWidth

            const isSmall = width < 768;
            const anchorPercent = refs.isMobile.current ? window.CONFIG.ANCHOR_DEFAULT_MOBILE : window.CONFIG.ANCHOR_DEFAULT;
            const anchorX = width * (state.currentAnchor || anchorPercent);
            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);

            const maxScroll = state.candles.length + (anchorX + shift) / candleWidth;
            const minScroll = 0 - (width - (anchorX + shift)) / candleWidth;

            state.targetScroll = Math.max(minScroll, Math.min(maxScroll, newTarget));

            // If the user drags away from the end, we consider them interacting
            if (state.targetScroll < maxScroll - 0.5) {
                refs.isUserInteracting.current = true;
            } else {
                // If they drag back to the very end, we can resume auto-scroll later
                // refs.isUserInteracting.current = false; // Optional: snap back to auto-follow
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
                // Prevent browser back/forward gestures while dragging the chart
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
