import Position from "../modules/Position/model";
import ACTIONS from "../services/config/actions";
import setOpenPositions from "./jobs/setOpenPositions";
import cron from "node-cron";
import ccxt from "ccxt";

class CronManager {
    constructor(io) {
        const openPositions = [];

        const exchange = new ccxt.phemex({
            enableRateLimit: true,
            apiKey: process.env.CCXT_API_KEY,
            secret: process.env.CCXT_SECRET,
            options: {
                defaultType: "swap",
            },
        });

        io.sockets.emit(ACTIONS.SEND_OPEN_POSITIONS, {
            actions: [],
            openPositions,
        });

        // un comment on dedicated server
        cron.schedule("* * * * *", async () => {
            try {
                const actions = await setOpenPositions(exchange, openPositions);
                openPositions.forEach(async (openPosition) => {
                    const newPositions = await Position.create(openPosition);
                    await newPositions.save();
                });

                // Send the open positions and actions to the frontend.
                io.sockets.emit(ACTIONS.SEND_OPEN_POSITIONS, {
                    actions,
                    openPositions,
                });
            } catch (error) {
                console.log(error);
            }
        });

        io.on("connection", (socket) => {
            socket.on(ACTIONS.GET_OPEN_POSITIONS, (obj) => {
                io.sockets.emit(ACTIONS.SEND_OPEN_POSITIONS, {
                    actions: [],
                    openPositions,
                });
            });
        });
    }
}

export default CronManager;

// const exchange = new ccxt.kucoinfutures({
//   adjustForTimeDifference: true,
//   apiKey: process.env.CCXT_API_KEY,
//   secret: process.env.CCXT_SECRET,
//   password: process.env.CCXT_PASSWORD,
// });
