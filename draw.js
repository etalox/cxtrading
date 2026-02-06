window.draw = {
    drawCanvas: (ctx) => {
        const canvas = ctx.canvasRef.current;
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            const context = canvas.getContext('2d');
            context.setTransform(dpr, 0, 0, dpr, 0, 0);

            const state = ctx.marketStatesRef.current[ctx.activeTab];
            const activeTrades = ctx.activeTradesRef.current.filter(t => t.tabIndex === ctx.activeTab);

            const SMOOTHING = 0.05;
            state.visualValue += (state.currentValue - state.visualValue) * 0.3;
            state.scrollOffset += (state.targetScroll - state.scrollOffset) * SMOOTHING;

            context.fillStyle = '#050505';
            context.fillRect(0, 0, width, height);

            // FIX 1: Real-time candle drawing using visualTicks for accurate high/low
            const lastClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : state.visualValue;
            let allCandles = [...state.candles];

            // Build forming candle with real-time data from visualTicks
            const formingTicks = state.visualTicks.length > 0 ? state.visualTicks : [state.visualValue];
            const formingHigh = Math.max(...formingTicks, lastClose, state.visualValue);
            const formingLow = Math.min(...formingTicks, lastClose, state.visualValue);
            const formingClose = state.visualValue;
            const formingColor = formingClose >= lastClose ? '#10b981' : '#f43f5e';
            allCandles.push({
                open: lastClose,
                close: formingClose,
                high: formingHigh,
                low: formingLow,
                color: formingColor,
                isForming: true
            });

            ctx.zoomCurrentRef.current += (ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) * SMOOTHING;
            if (Math.abs(ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) < 0.05) ctx.zoomCurrentRef.current = ctx.zoomTargetRef.current;

            const candleWidth = (width / ctx.zoomCurrentRef.current) * (state.ticksPerCandle / 4);

            let targetAnchorPercent = 0.75;
            if (activeTrades.length > 0) {
                const maxDuration = Math.max(...activeTrades.map(t => t.duration));
                if (maxDuration >= 30000) targetAnchorPercent = 0.50;
                else if (maxDuration >= 15000) targetAnchorPercent = 0.60;
            }
            if (typeof state.currentAnchor === 'undefined') state.currentAnchor = 0.75;
            state.currentAnchor += (targetAnchorPercent - state.currentAnchor) * SMOOTHING;
            const anchorX = width * state.currentAnchor;

            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
            const getX = (index) => anchorX - (state.scrollOffset - index) * candleWidth + shift;
            // Instant version without smoothing for trade markers
            const getXInstant = (index) => anchorX - (state.targetScroll - index) * candleWidth + shift;

            let minPrice = Infinity, maxPrice = -Infinity;
            allCandles.forEach((c, i) => { const x = getX(i); if (x > -candleWidth && x < width + candleWidth) { if (c.low < minPrice) minPrice = c.low; if (c.high > maxPrice) maxPrice = c.high; } });
            if (minPrice === Infinity) { minPrice = state.visualValue * 0.99; maxPrice = state.visualValue * 1.01; }

            if (typeof state.visualMinPrice === 'undefined') { state.visualMinPrice = minPrice; state.visualMaxPrice = maxPrice; }
            const rawRange = maxPrice - minPrice || 10;
            const targetPadding = rawRange * 0.45;
            const targetMin = minPrice - targetPadding;
            const targetMax = maxPrice + targetPadding;
            const VERTICAL_SMOOTHING = 0.05;
            state.visualMinPrice += (targetMin - state.visualMinPrice) * VERTICAL_SMOOTHING;
            state.visualMaxPrice += (targetMax - state.visualMaxPrice) * VERTICAL_SMOOTHING;
            let yMin = state.visualMinPrice;
            let yMax = state.visualMaxPrice;

            const currentPriceY = height - ((state.visualValue - yMin) / (yMax - yMin)) * height;
            const safeZoneBottom = Math.min(height - 250, height * 0.65);
            if (currentPriceY > safeZoneBottom) {
                const pixelsOff = currentPriceY - safeZoneBottom;
                const pricePerPixel = (yMax - yMin) / height;
                const priceShift = pixelsOff * pricePerPixel;
                state.visualMinPrice -= priceShift * 0.1;
                state.visualMaxPrice -= priceShift * 0.1;
                yMin = state.visualMinPrice;
                yMax = state.visualMaxPrice;
            }

            const getY = (price) => height - ((price - yMin) / (yMax - yMin)) * height;
            const currentY = getY(state.visualValue);

            // FIX 2: Smooth the Y position for all price line elements
            if (typeof state.visualCurrentY === 'undefined') state.visualCurrentY = currentY;
            state.visualCurrentY += (currentY - state.visualCurrentY) * 0.15;
            const smoothY = state.visualCurrentY;

            // Dashed horizontal price line
            context.strokeStyle = '#222';
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(0, smoothY);
            context.lineTo(width, smoothY);
            context.stroke();
            context.setLineDash([]);

            const previewDuration = state.tradeDuration || 10000;
            const currentCandleIndex = state.candles.length + (state.visualTicks.length / state.ticksPerCandle);
            const futureTicksAhead = (previewDuration / 1000 * 2); // TICK_RATE 2

            // Gray marker: Fixed X position on screen, uses smoothY
            const grayMarkerX = anchorX + (futureTicksAhead / state.ticksPerCandle) * candleWidth;
            context.strokeStyle = activeTrades.length > 0 ? '#333' : '#666';
            context.lineWidth = 1;
            context.setLineDash([2, 4]);
            context.beginPath();
            context.moveTo(anchorX, smoothY);
            context.lineTo(grayMarkerX, smoothY);
            context.stroke();
            context.beginPath();
            context.moveTo(grayMarkerX, smoothY - 20);
            context.lineTo(grayMarkerX, smoothY + 20);
            context.stroke();
            context.setLineDash([]);

            const barWidth = Math.max(1, candleWidth * 0.8);
            allCandles.forEach((candle, i) => {
                const x = getX(i);
                if (x < -candleWidth || x > width + candleWidth) return;
                const yOpen = getY(candle.open), yClose = getY(candle.close), yHigh = getY(candle.high), yLow = getY(candle.low);
                context.strokeStyle = candle.color;
                context.lineWidth = Math.max(1, candleWidth * 0.1);
                context.beginPath();
                context.moveTo(x, yHigh);
                context.lineTo(x, yLow);
                context.stroke();
                const bodyHeight = Math.max(0.5, Math.abs(yClose - yOpen));
                context.fillStyle = candle.color;
                if (candle.isForming) { context.shadowBlur = 10; context.shadowColor = candle.color; }
                context.fillRect(x - barWidth / 2, Math.min(yOpen, yClose), barWidth, bodyHeight);
                context.shadowBlur = 0;
            });

            // FIX 3: Trade entry markers use time-based offset from current position
            // This makes positioning robust against density changes
            activeTrades.forEach(trade => {
                const yEntry = getY(trade.entryPrice);

                // Calculate entry position based on elapsed time since trade started
                // This approach survives density changes and candle rebuilds
                const elapsedSeconds = (Date.now() - trade.startTime) / 1000;
                const elapsedTicks = elapsedSeconds * 2; // TICK_RATE 2
                const entryCandleOffset = elapsedTicks / state.ticksPerCandle;
                const entryCandleIndex = currentCandleIndex - entryCandleOffset;
                const xEntry = getXInstant(entryCandleIndex);

                const remainingSeconds = (trade.expiryTime - Date.now()) / 1000;
                const remainingTicks = remainingSeconds * 2; // TICK_RATE 2
                const expireCandleIndex = currentCandleIndex + (remainingTicks / state.ticksPerCandle);
                const xExpire = getXInstant(expireCandleIndex);

                const tradeColor = trade.type === 'BUY' ? '#10b981' : '#f43f5e';
                context.strokeStyle = tradeColor;
                context.lineWidth = 1;
                context.globalAlpha = 0.5;
                context.beginPath();
                context.moveTo(xEntry, yEntry);
                context.lineTo(width, yEntry);
                context.stroke();
                context.setLineDash([4, 4]);
                context.beginPath();
                context.moveTo(xExpire, yEntry - 40);
                context.lineTo(xExpire, yEntry + 40);
                context.stroke();
                context.setLineDash([]);
                context.globalAlpha = 0.3;
                context.beginPath();
                context.moveTo(xEntry, yEntry);
                context.lineTo(xExpire, yEntry);
                context.stroke();
                context.globalAlpha = 1;
                context.fillStyle = tradeColor;
                context.beginPath();
                context.arc(xEntry, yEntry, 4, 0, Math.PI * 2);
                context.fill();
            });

            ctx.resultLabelsRef.current = ctx.resultLabelsRef.current.filter(label => (Date.now() - label.timestamp) < 2000);
            ctx.resultLabelsRef.current.forEach(label => {
                const age = Date.now() - label.timestamp;
                const progress = age / 2000;

                const direction = label.profit > 0 ? -1 : 1;
                const yPos = getY(label.price) - 30 + (progress * 50 * direction);
                const labelCandleIndex = label.xCandleIndex !== undefined
                    ? label.xCandleIndex
                    : (label.xTickIndex !== undefined
                        ? label.xTickIndex / state.ticksPerCandle
                        : label.xIndex);
                const xPos = getX(labelCandleIndex);
                const opacity = 1 - Math.pow(progress, 3);
                context.globalAlpha = opacity;
                const bg = label.type === 'WIN' ? '#10B981' : '#F43F5E';
                const shadowColor = label.type === 'WIN' ? 'rgba(16, 185, 129, 0.40)' : 'rgba(244, 63, 94, 0.40)';
                context.fillStyle = bg;
                context.shadowBlur = 20;
                context.shadowColor = shadowColor;
                const labelW = 100;
                const labelH = 40;
                context.beginPath();
                context.roundRect(xPos - labelW / 2, yPos - labelH / 2, labelW, labelH, 20);
                context.fill();
                context.shadowBlur = 0;
                context.fillStyle = '#000000';
                context.font = '500 14px "BDO Grotesk", sans-serif';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                const prefix = label.profit > 0 ? '+' : '-';
                context.fillText(`${prefix} $${Math.abs(label.profit).toFixed(0)}`, xPos, yPos);
            });
            context.globalAlpha = 1;

            // Gray price label: Fixed X at edge of screen, smooth Y
            const isSmallScreen = width < 768;
            const labelX = isSmallScreen ? 0 : width - 100;
            const textX = isSmallScreen ? 50 : width - 50;
            const labelY = smoothY;
            context.fillStyle = '#111';
            context.fillRect(labelX, labelY - 10, 100, 20);
            context.fillStyle = '#fff';
            context.font = 'bold 12px monospace';
            context.textAlign = 'center';
            context.fillText(state.visualValue.toFixed(2), textX, labelY + 5);
        }
    }
};
