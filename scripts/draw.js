window.draw = {
  drawCanvas: (ctx) => {
    const canvas = ctx.canvasRef.current;
    if (!canvas) return;

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

    // --- Price & Scroll Smoothing ---
    state.visualValue += (state.currentValue - state.visualValue) * conf.PRICE_SMOOTHING;
    const scrollSmoothing = ctx.isUserInteractingRef?.current ? 0.6 : conf.SMOOTHING; // Más responsivo si hay interacción
    state.scrollOffset += (state.targetScroll - state.scrollOffset) * scrollSmoothing;

    // Clear Screen
    context.fillStyle = '#050505';
    context.fillRect(0, 0, width, height);

    // --- Prepare Candles (Include Forming Candle) ---
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

    // --- Zoom & Layout Math ---
    ctx.zoomCurrentRef.current += (ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) * conf.SMOOTHING;
    if (Math.abs(ctx.zoomTargetRef.current - ctx.zoomCurrentRef.current) < 0.05) ctx.zoomCurrentRef.current = ctx.zoomTargetRef.current;

    const candleWidth = (width / ctx.zoomCurrentRef.current) * (state.ticksPerCandle / 4);

    // --- Anchor Logic ---
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

    // Función clave para posición X: Mapea índice de vela a píxeles
    const getX = (index) => anchorX - (state.scrollOffset - index) * candleWidth + shift;

    // --- 1. SOLUCIÓN ESCALADO VERTICAL: Min/Max solo de velas visibles ---
    let minPrice = Infinity, maxPrice = -Infinity;
    let candlesInView = 0;

    // Iteramos TODAS las velas, pero solo consideramos las que están en el viewport
    // El margen es importante para que las líneas de high/low no se corten abruptamente
    const viewMargin = candleWidth * 3;

    for (let i = 0; i < allCandles.length; i++) {
        const x = getX(i);
        if (x > -viewMargin && x < width + viewMargin) {
            const c = allCandles[i];
            if (c.low < minPrice) minPrice = c.low;
            if (c.high > maxPrice) maxPrice = c.high;
            candlesInView++;
        }
    }

    // Fallback de seguridad
    if (minPrice === Infinity || candlesInView === 0) {
      minPrice = state.visualValue * 0.999;
      maxPrice = state.visualValue * 1.001;
    } else {
      // Expandir rango para incluir siempre el precio actual
      minPrice = Math.min(minPrice, state.visualValue);
      maxPrice = Math.max(maxPrice, state.visualValue);
    }

    // Inicialización si es primera vez
    if (typeof state.visualMinPrice === 'undefined') {
        state.visualMinPrice = minPrice;
        state.visualMaxPrice = maxPrice;
    }

    const rawRange = maxPrice - minPrice || 10;
    // Padding fijo relativo al rango visible (ej. 10% arriba y abajo)
    // Esto asegura que las velas ocupen el 80% central de la pantalla
    const effectivePadding = yPadding; 

    const targetMin = minPrice - (rawRange * effectivePadding);
    const targetMax = maxPrice + (rawRange * effectivePadding);

    // Suavizado vertical más rápido si hay interacción para evitar "lag" visual al arrastrar
    const verticalSmoothing = ctx.isUserInteractingRef?.current ? 0.3 : conf.VERTICAL_SMOOTHING;
    
    state.visualMinPrice += (targetMin - state.visualMinPrice) * verticalSmoothing;
    state.visualMaxPrice += (targetMax - state.visualMaxPrice) * verticalSmoothing;

    // Función de proyección Y
    const getY = (price) => height - ((price - state.visualMinPrice) / (state.visualMaxPrice - state.visualMinPrice)) * height;
    const currentY = getY(state.visualValue);


    // --- Dibujar Línea de Precio Actual ---
    context.strokeStyle = '#222';
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(0, currentY);
    context.lineTo(width, currentY);
    context.stroke();
    context.setLineDash([]);


    // --- Dibujar Guía de Tiempo Futuro (Trade Preview) ---
    const previewDuration = state.tradeDuration || 10000;
    const currentCandleIndex = state.candles.length + (state.visualTicks.length / state.ticksPerCandle);
    const futureTicksAhead = (previewDuration / 1000 * conf.TICK_RATE);
    const futureCandleIndex = currentCandleIndex + (futureTicksAhead / state.ticksPerCandle);

    const grayMarkerX = getX(futureCandleIndex);
    const currentX = getX(currentCandleIndex);

    context.strokeStyle = activeTrades.length > 0 ? '#333' : '#666';
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    
    context.beginPath();
    context.moveTo(currentX, currentY);
    context.lineTo(grayMarkerX, currentY);
    context.stroke();
    
    // Marcador final de tiempo
    context.beginPath();
    context.moveTo(grayMarkerX, currentY - 20);
    context.lineTo(grayMarkerX, currentY + 20);
    context.stroke();
    context.setLineDash([]);


    // --- Dibujar Velas ---
    const barWidth = Math.max(1, candleWidth * 0.8);
    const wickWidth = Math.max(1, candleWidth * 0.1);

    allCandles.forEach((candle, i) => {
      const x = getX(i);
      // Cull (no dibujar) lo que está fuera de pantalla
      if (x < -candleWidth || x > width + candleWidth) return;

      const yOpen = getY(candle.open);
      const yClose = getY(candle.close);
      const yHigh = getY(candle.high);
      const yLow = getY(candle.low);

      context.strokeStyle = candle.color;
      context.lineWidth = wickWidth;
      
      // Mecha
      context.beginPath();
      context.moveTo(x, yHigh);
      context.lineTo(x, yLow);
      context.stroke();

      // Cuerpo
      const bodyHeight = Math.max(0.5, Math.abs(yClose - yOpen));
      context.fillStyle = candle.color;
      
      // Glow para vela formándose
      if (candle.isForming) { 
          context.shadowBlur = 10; 
          context.shadowColor = candle.color; 
      }
      
      context.fillRect(x - barWidth / 2, Math.min(yOpen, yClose), barWidth, bodyHeight);
      context.shadowBlur = 0;
    });


    // --- 2. SOLUCIÓN INDICADORES: Cálculo robusto de X ---
    activeTrades.forEach(trade => {
        const yEntry = getY(trade.entryPrice);

        // ERROR ANTERIOR: trade.entryTickIndex / state.ticksPerCandle
        // FIX: Usar 'entryIndex' guardado en app.js que ya es relativo a velas
        // Si trade.entryIndex no existe, calcularlo pero NO dependiendo del tick rate dinámico actual
        // El 'entryCandleIndex' se guarda al momento de abrir el trade.
        
        // Si por alguna razón no tienes 'entryCandleIndex' guardado, úsalo así:
        // const entryIdx = trade.entryCandleIndex || (trade.entryTickIndex / state.ticksPerCandle);
        // PERO, trade.entryCandleIndex es lo más seguro si lo guardaste en executeTrade.
        // Asumo que trade.entryCandleIndex existe (lo vi en app.js).

        const entryIdx = trade.entryCandleIndex; 
        const xEntry = getX(entryIdx);

        // Duración en velas (constante)
        const durationInSeconds = trade.duration / 1000;
        const durationInCandles = (durationInSeconds * conf.TICK_RATE) / state.ticksPerCandle;
        
        const expireIdx = entryIdx + durationInCandles;
        const xExpire = getX(expireIdx);

        const tradeColor = trade.type === 'BUY' ? '#10b981' : '#f43f5e';

        // Línea horizontal de entrada
        context.strokeStyle = tradeColor;
        context.lineWidth = 1;
        context.globalAlpha = 0.5;
        context.beginPath();
        context.moveTo(xEntry, yEntry);
        context.lineTo(width, yEntry); // Hasta el borde derecho
        context.stroke();

        // Línea vertical de expiración
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(xExpire, yEntry - 40);
        context.lineTo(xExpire, yEntry + 40);
        context.stroke();
        context.setLineDash([]);

        // Área de progreso (relleno suave)
        context.globalAlpha = 0.1;
        context.fillStyle = tradeColor;
        context.fillRect(xEntry, yEntry - 20, xExpire - xEntry, 40);

        // Punto de entrada
        context.globalAlpha = 1;
        context.fillStyle = tradeColor;
        context.beginPath();
        context.arc(xEntry, yEntry, 4, 0, Math.PI * 2);
        context.fill();
        
        // Anillo alrededor del punto
        context.strokeStyle = '#fff';
        context.lineWidth = 1.5;
        context.stroke();
    });


    // --- Resultados/Notificaciones ---
    ctx.resultLabelsRef.current = ctx.resultLabelsRef.current.filter(label => (Date.now() - label.timestamp) < 2000);

    ctx.resultLabelsRef.current.forEach(label => {
      const age = Date.now() - label.timestamp;
      const progress = age / 2000;
      const direction = label.profit > 0 ? -1 : 1;
      
      const yPos = getY(label.price) - 30 + (progress * 50 * direction);
      
      // Mismo fix para etiquetas: usar índice de vela correcto
      const labelIdx = label.xCandleIndex !== undefined ? label.xCandleIndex : (label.xTickIndex / state.ticksPerCandle);
      const xPos = getX(labelIdx);

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
      // roundRect puede no estar soportado en todos los navegadores, usar fallback si es necesario
      if (context.roundRect) {
          context.roundRect(xPos - labelW / 2, yPos - labelH / 2, labelW, labelH, 8);
      } else {
          context.fillRect(xPos - labelW / 2, yPos - labelH / 2, labelW, labelH);
      }
      context.fill();
      context.shadowBlur = 0;

      context.fillStyle = '#ffffff'; // Texto blanco siempre
      context.font = '700 14px "Inter", sans-serif'; // Fuente más segura
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      const prefix = label.profit > 0 ? '+' : '-';
      context.fillText(`${prefix}$${Math.abs(label.profit).toFixed(0)}`, xPos, yPos);
    });

    context.globalAlpha = 1;

    // --- Etiqueta de Precio Actual ---
    const isSmallScreen = width < 768;
    const labelX = isSmallScreen ? 0 : width - 80;
    const labelY = currentY;
    
    // Etiqueta negra con precio
    context.fillStyle = '#1a1a1a';
    context.fillRect(labelX, labelY - 12, 80, 24);
    
    context.fillStyle = '#fff';
    context.font = 'bold 12px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(state.visualValue.toFixed(2), labelX + 40, labelY);
  }
};