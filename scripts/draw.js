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

            const conf = window.CONFIG;
            const isSmall = width < 768;
            const anchorDefault = isSmall ? conf.ANCHOR_DEFAULT_MOBILE : conf.ANCHOR_DEFAULT;
            const yPadding = isSmall ? conf.Y_RANGE_PADDING_MOBILE : conf.Y_RANGE_PADDING;

            // Price and Scroll Smoothing
            state.visualValue += (state.currentValue - state.visualValue) * conf.PRICE_SMOOTHING;
            
            // [MEJORA] Si el usuario está interactuando, reducir smoothing del scroll para respuesta más rápida
            const scrollSmoothing = ctx.isUserInteractingRef?.current ? 0.5 : conf.SMOOTHING;
            state.scrollOffset += (state.targetScroll - state.scrollOffset) * scrollSmoothing;

            context.fillStyle = '#050505';
            context.fillRect(0, 0, width, height);

            const lastClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : state.visualValue;
            let allCandles = [...state.candles];

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

            // Zoom Smoothing
            ctx.zoomCurrentRef.current += (ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) * conf.SMOOTHING;
            if (Math.abs(ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) < 0.05) ctx.zoomCurrentRef.current = ctx.zoomTargetRef.current;

            const candleWidth = (width / ctx.zoomCurrentRef.current) * (state.ticksPerCandle / 4);

            let targetAnchorPercent = anchorDefault;
            if (activeTrades.length > 0) {
                const maxDuration = Math.max(...activeTrades.map(t => t.duration));
                if (maxDuration >= 30000) targetAnchorPercent = 0.50;
                else if (maxDuration >= 15000) targetAnchorPercent = 0.60;
            }
            if (typeof state.currentAnchor === 'undefined') state.currentAnchor = anchorDefault;
            state.currentAnchor += (targetAnchorPercent - state.currentAnchor) * conf.SMOOTHING;
            const anchorX = width * state.currentAnchor;

            const shift = ((state.ticksPerCandle - 1) / 2) * (candleWidth / state.ticksPerCandle);
            const getX = (index) => anchorX - (state.scrollOffset - index) * candleWidth + shift;
            const getXInstant = (index) => anchorX - (state.targetScroll - index) * candleWidth + shift;

            // [LÓGICA DE ESCALADO VERTICAL OPTIMIZADA]
            let minPrice = Infinity, maxPrice = -Infinity;
            let candlesInView = 0;

            allCandles.forEach((c, i) => { 
                const x = getX(i); 
                // Añadir un margen de seguridad (candleWidth * 2) para incluir velas parcialmente visibles
                if (x > -candleWidth * 2 && x < width + candleWidth * 2) { 
                    if (c.low < minPrice) minPrice = c.low; 
                    if (c.high > maxPrice) maxPrice = c.high;
                    candlesInView++;
                } 
            });

            // Fallback si no hay velas visibles o valores inválidos
            if (minPrice === Infinity || candlesInView === 0) { 
                minPrice = state.visualValue * 0.999; 
                maxPrice = state.visualValue * 1.001; 
            } else {
                // Asegurar que el precio actual SIEMPRE esté considerado en el rango
                // Esto evita que la línea de precio desaparezca
                minPrice = Math.min(minPrice, state.visualValue);
                maxPrice = Math.max(maxPrice, state.visualValue);
            }

            if (typeof state.visualMinPrice === 'undefined') { state.visualMinPrice = minPrice; state.visualMaxPrice = maxPrice; }
            
            const rawRange = maxPrice - minPrice || 10;
            // Padding dinámico: menos padding si el rango es enorme para no aplastar el gráfico
            const effectivePadding = yPadding; 
            const targetMin = minPrice - (rawRange * effectivePadding);
            const targetMax = maxPrice + (rawRange * effectivePadding);

            // [CAMBIO CLAVE] Si el usuario interactúa, usar un suavizado mucho más rápido (casi instantáneo)
            // para que el gráfico no se quede atrás al arrastrar rápido.
            const verticalSmoothing = ctx.isUserInteractingRef?.current ? 0.3 : conf.VERTICAL_SMOOTHING;

            state.visualMinPrice += (targetMin - state.visualMinPrice) * verticalSmoothing;
            state.visualMaxPrice += (targetMax - state.visualMaxPrice) * verticalSmoothing;
            
            let yMin = state.visualMinPrice;
            let yMax = state.visualMaxPrice;

            // Eliminada la lógica compleja de "safeZoneBottom" que desplazaba el gráfico artificialmente
            // Ahora confiamos puramente en el min/max visibles + padding.

            const getY = (price) => height - ((price - yMin) / (yMax - yMin)) * height;
            const currentY = getY(state.visualValue);

            // Horizontal price line
            context.strokeStyle = '#222';
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(0, currentY);
            context.lineTo(width, currentY);
            context.stroke();
            context.setLineDash([]);

            const previewDuration = state.tradeDuration || 10000;
            const currentCandleIndex = state.candles.length + (state.visualTicks.length / state.ticksPerCandle);
            const futureTicksAhead = (previewDuration / 1000 * conf.TICK_RATE);
            const futureCandleIndex = currentCandleIndex + (futureTicksAhead / state.ticksPerCandle);
            const grayMarkerX = getXInstant(futureCandleIndex);
            const currentX = getXInstant(currentCandleIndex);

            context.strokeStyle = activeTrades.length > 0 ? '#333' : '#666';
            context.lineWidth = 1;
            context.setLineDash([2, 4]);
            context.beginPath();
            context.moveTo(currentX, currentY); 
            context.lineTo(grayMarkerX, currentY);
            context.stroke();
            context.beginPath();
            context.moveTo(grayMarkerX, currentY - 20);
            context.lineTo(grayMarkerX, currentY + 20);
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

            activeTrades.forEach(trade => {
                const yEntry = getY(trade.entryPrice);
                const elapsedSeconds = (Date.now() - trade.startTime) / 1000;
                const elapsedTicks = elapsedSeconds * conf.TICK_RATE;
                const entryCandleOffset = elapsedTicks / state.ticksPerCandle;
                const entryCandleIndex = currentCandleIndex - entryCandleOffset;
                const xEntry = getXInstant(entryCandleIndex);
                const remainingSeconds = (trade.expiryTime - Date.now()) / 1000;
                const remainingTicks = remainingSeconds * conf.TICK_RATE;
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
                const labelCandleIndex = label.xCandleIndex !== undefined ? label.xCandleIndex : (label.xTickIndex !== undefined ? label.xTickIndex / state.ticksPerCandle : label.xIndex);
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

            const isSmallScreen = width < 768;
            const labelX = isSmallScreen ? 0 : width - 100;
            const textX = isSmallScreen ? 50 : width - 50;
            const labelY = currentY;
            context.fillStyle = '#111';
            context.fillRect(labelX, labelY - 10, 100, 20);
            context.fillStyle = '#fff';
            context.font = 'bold 12px monospace';
            context.textAlign = 'center';
            context.fillText(state.visualValue.toFixed(2), textX, labelY + 5);
        }
    }
};