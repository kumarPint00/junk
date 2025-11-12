const setOpenPositions = async (exchange, openPositions) => {
    try {
        // load markets before fetching positions
        await exchange.loadMarkets();

        // fetch all open USDT positions
        const securities = await exchange.fetchPositions(undefined, {
            settle: "USDT",
        });

        let actions = [];

        // Find new positions and add them to the openPositions array
        securities
            ?.filter((security) => security?.info?.size !== "0")
            ?.forEach((security) => {
                // to find the index of the position in the openPositions array
                const posIndex = openPositions.findIndex(
                    (obj) =>
                        obj.tradePair === security.symbol &&
                        obj.profit === security.unrealizedPnl &&
                        obj.tradeSize ===
                          security.contractSize * security.contracts
                );

                // if the position is not in the openPositions array, add it
                if (posIndex === -1) {
                    const newPosition = {
                        contracts: security.contracts, // new property
                        tradeSize: security.contractSize * security.contracts,
                        tradePair: security.symbol,
                        profit: security.unrealizedPnl || 0,
                        side: security.side,
                    };
                    openPositions.push(newPosition);

                    // Added the action to send to the frontend
                    actions.push({
                        type: "insert",
                        position: newPosition,
                    });
                }
            });

        //Find the positions which should be removed
        for (let i = 0; i < openPositions.length; i++) {
            const openPosIndex = securities.findIndex(
                (obj) => obj.timestamp === openPositions[i].timestamp
            );
            if (openPosIndex === -1) {
                actions.push({
                    type: "remove",
                    position: openPositions[i],
                });

                openPositions.splice(i, 1);
                i--;
            }
        }

        return actions;
    } catch (error) {
        console.log("Cron_SetOpenPosition", error);
    }
};

export default setOpenPositions;
