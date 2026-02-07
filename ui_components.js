const { useState, useEffect, useRef } = React;

window.UI = {
    Header: ({ balance, currentPriceUI, isGenerating, activeAssetName }) => (
        <div className="absolute top-10 left-0 w-full px-6 md:px-10 flex justify-between items-center z-20 pointer-events-none">
            <div className="flex flex-col justify-center items-start gap-2">
                <div className="opacity-50 text-[10px] font-normal leading-tight">BALANCE GLOBAL</div>
                <div className="text-sm font-normal leading-tight">${balance.toLocaleString()}</div>
            </div>

            <div className="flex md:hidden items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-white animate-pulse' : 'bg-[#D9D9D9]'}`} />
                <div className="text-sm font-normal uppercase whitespace-nowrap">{isGenerating ? 'BUSCANDO...' : activeAssetName}</div>
            </div>

            <div className="flex flex-col justify-center items-end gap-2">
                <div className="opacity-50 text-[10px] font-normal leading-tight">MERCADO EN VIVO</div>
                <div className="text-sm font-normal leading-tight">${currentPriceUI.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
        </div>
    ),

    AssetTabs: ({ assetsInfo, activeTab, onTabChange }) => (
        <div className="hidden md:flex items-center gap-[10px] pointer-events-auto">
            {assetsInfo.map((info, idx) => {
                const isActive = activeTab === idx;
                return (
                    <div
                        key={idx}
                        onClick={() => onTabChange(idx)}
                        className={`
                            tab-item h-[60px] px-10 flex items-center justify-center gap-[10px]
                            ${isActive ? 'border border-white' : 'border border-white/40'}
                            overflow-hidden cursor-pointer
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
    ),

    NotificationList: ({ notifications, onNotificationClick }) => (
        <div className="absolute top-[100px] md:top-[140px] w-full flex flex-col items-center gap-4 z-30 pointer-events-none px-4">
            {notifications.map(note => {
                let iconSrc = window.ICONS.activityNeutral;
                let iconStyle = {};
                if (note.type === 'SIGNAL') {
                    iconSrc = note.signalType === 'BUY' ? window.ICONS.activityWin : window.ICONS.activityLoss;
                    iconStyle = { filter: note.signalType === 'BUY' ? 'brightness(0) saturate(100%) invert(63%) sepia(83%) saturate(417%) hue-rotate(95deg) brightness(96%) contrast(86%)' : 'brightness(0) saturate(100%) invert(34%) sepia(93%) saturate(2636%) hue-rotate(331deg) brightness(96%) contrast(96%)', transform: note.signalType === 'SELL' ? 'scaleY(-1)' : 'none' };
                }
                return (
                    <div
                        key={note.id}
                        onClick={() => onNotificationClick(note)}
                        className={`glass-panel !bg-white/0 !rounded-[20px] px-6 h-16 flex items-center justify-center gap-4 animate-fade-in text-white/100 ${note.type === 'SIGNAL' ? 'pointer-events-auto cursor-pointer hover:bg-white/15 transition-all' : ''}`}
                    >
                        <div className="w-12 h-12 animate-blink border border-white/40 rounded-[15px] flex items-center justify-center shrink-0">
                            <img src={iconSrc} className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                        </div>
                        <div className="flex flex-col animate-blink justify-center items-start gap-1">
                            <div className="opacity-80 text-white/50 text-[10px] font-normal capitalize">
                                {note.type === 'SIGNAL' ? `${note.signalType} SIGNAL` : 'NOTIFICACIÓN'}
                            </div>
                            <div className="text-sm font-medium">
                                {note.type === 'SIGNAL' ? `CONF: ${(note.confidence * 100).toFixed(0)}%` : 'SISTEMA'}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    ),

    BottomControls: ({
        isGenerating, isOnline, isMobile, handleGenerateAsset,
        autopilot, setAutopilot, sliderPercentage, zoom, setZoom,
        activeTradesUI, buyButtonOpacity, sellButtonOpacity, currentDuration,
        handleTouchStart, handleTouchEnd, executeTrade, tradesDisabled
    }) => {
        const buyTrades = activeTradesUI.filter(t => t.type === 'BUY');
        const sellTrades = activeTradesUI.filter(t => t.type === 'SELL');
        const mostRecentBuy = buyTrades.length > 0 ? buyTrades.reduce((a, b) => a.expiryTime > b.expiryTime ? a : b) : null;
        const mostRecentSell = sellTrades.length > 0 ? sellTrades.reduce((a, b) => a.expiryTime > b.expiryTime ? a : b) : null;
        const buyRemaining = mostRecentBuy ? Math.max(0, (mostRecentBuy.expiryTime - Date.now()) / 1000) : 0;
        const sellRemaining = mostRecentSell ? Math.max(0, (mostRecentSell.expiryTime - Date.now()) / 1000) : 0;

        return (
            <div className="absolute bottom-8 md:bottom-10 left-1/2 transform -translate-x-1/2 z-30 w-[95%] md:w-auto">
                <div className="glass-panel p-2 flex flex-col md:flex-row items-center gap-4 md:gap-8">
                    <button
                        onClick={handleGenerateAsset}
                        disabled={isGenerating || !isOnline}
                        className={`glass-button w-full md:w-[206px] h-16 flex items-center justify-start gap-3 pl-[34px] hover:bg-white/20 order-1 transition-opacity duration-200 ${isGenerating || !isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <div className="w-5 h-5 flex items-center justify-center">
                            <img src={isGenerating ? window.ICONS.loader : window.ICONS.search} className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="flex flex-col items-start gap-0">
                            <div className="opacity-60 text-white text-[10px] font-normal uppercase">{isMobile ? 'EXPLORACIÓN' : 'EXPLORAR'}</div>
                            <div className="text-white text-sm font-normal uppercase whitespace-nowrap">{!isOnline ? 'SIN RED' : (isGenerating ? 'BUSCANDO...' : 'NUEVO ACTIVO')}</div>
                        </div>
                    </button>

                    {!isMobile && (
                        <div className="h-16 px-6 flex items-center gap-4 order-2 md:order-4 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setAutopilot(!autopilot)}>
                            <div className={`toggle-switch ${autopilot ? 'active' : ''}`}><div className="toggle-knob"></div></div>
                            <div className="flex flex-col items-start gap-1">
                                <div className="opacity-60 text-white text-[10px] font-normal uppercase">AUTOPILOT</div>
                                <div className="text-white text-sm font-normal uppercase">{autopilot ? 'ACTIVO' : 'INACTIVO'}</div>
                            </div>
                        </div>
                    )}

                    <div className="w-full md:w-[160px] h-4 relative mt-2 md:mt-0 mb-2 md:mb-0 px-0 order-3 md:order-3">
                        <div className="w-full h-[2px] bg-[#333] rounded-full absolute top-1/2 transform -translate-y-1/2"></div>
                        <div className="absolute top-1/2 transform -translate-y-1/2 h-3 w-0.5 bg-white pointer-events-none transition-all duration-75 shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ left: `${100 - sliderPercentage}%` }}></div>
                        <input type="range" min={window.CONFIG.ZOOM_MIN} max={window.CONFIG.ZOOM_MAX} value={(window.CONFIG.ZOOM_MAX + window.CONFIG.ZOOM_MIN) - zoom} onChange={(e) => setZoom((window.CONFIG.ZOOM_MAX + window.CONFIG.ZOOM_MIN) - Number(e.target.value))} className="zoom-slider" />
                    </div>

                    <div className="flex gap-2 w-full md:w-auto order-2 md:order-5">
                        <button
                            onClick={() => !isMobile && executeTrade('BUY')}
                            onTouchStart={() => handleTouchStart('BUY')}
                            onTouchEnd={() => handleTouchEnd('BUY')}
                            disabled={tradesDisabled}
                            style={{ opacity: tradesDisabled ? 0.5 : buyButtonOpacity, transition: buyButtonOpacity === 0.5 ? 'opacity 120ms ease, transform 0.1s ease' : 'opacity 400ms ease, transform 0.1s ease' }}
                            className={`flex-1 md:w-[192px] h-16 bg-[#10B981] rounded-[20px] shadow-[0_0_20px_rgba(16,185,129,0.2)] flex items-center justify-start pl-[28px] gap-3 active:scale-95 hover:bg-[#15c58b] select-none ${tradesDisabled ? 'cursor-not-allowed' : ''}`}
                        >
                            <img src={window.ICONS.trendingUp} className="w-5 h-5" style={{ filter: 'brightness(0)' }} />
                            <div className="flex flex-col items-start gap-0 text-black">
                                <div className="opacity-60 text-[10px] font-normal">{buyRemaining > 0 ? 'ABIERTO' : 'OPERAR COMPRA'}</div>
                                <div className="text-sm font-medium">{buyRemaining > 0 ? `BUYING... ${buyRemaining.toFixed(1)}s` : `BUY / ${currentDuration}s.`}</div>
                            </div>
                        </button>

                        <button
                            onClick={() => !isMobile && executeTrade('SELL')}
                            onTouchStart={() => handleTouchStart('SELL')}
                            onTouchEnd={() => handleTouchEnd('SELL')}
                            disabled={tradesDisabled}
                            style={{ opacity: tradesDisabled ? 0.5 : sellButtonOpacity, transition: sellButtonOpacity === 0.5 ? 'opacity 120ms ease, transform 0.1s ease' : 'opacity 400ms ease, transform 0.1s ease' }}
                            className={`flex-1 md:w-[192px] h-16 bg-[#F43F5E] rounded-[20px] shadow-[0_0_20px_rgba(244,63,94,0.2)] flex items-center justify-start pl-[28px] gap-3 active:scale-95 hover:bg-[#ff5573] select-none ${tradesDisabled ? 'cursor-not-allowed' : ''}`}
                        >
                            <img src={window.ICONS.trendingDown} className="w-5 h-5" style={{ filter: 'brightness(0)', transform: 'scaleY(-1)' }} />
                            <div className="flex flex-col items-start gap-0 text-black">
                                <div className="opacity-60 text-[10px] font-normal">{sellRemaining > 0 ? 'ABIERTO' : 'OPERAR VENTA'}</div>
                                <div className="text-sm font-medium">{sellRemaining > 0 ? `SELLING... ${sellRemaining.toFixed(1)}s` : `SELL / ${currentDuration}s.`}</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
};
