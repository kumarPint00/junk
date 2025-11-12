import express from "express";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import session from "express-session";
import cors from "cors";

// import { profileModule } from "./modules";
import CronManager from "./cronManager";

import NodeCache from "node-cache";

import { instrument } from "@socket.io/admin-ui";

import socialRoutes from "./routes/social.routes";
import walletRoutes from "./routes/wallet.routes";
import adminRoutes from "./routes/admin.routes";
import emailRoutes from "./routes/email.routes";

import SocialModel from "./models/social-request";
import WalletModel from "./models/wallet-request";
import EmailModel from "./models/email-request";

class Server {
    constructor({ port }) {
        this.express = express();
        this.express.set("port", port);
        this.server = require("http").createServer(this.express);
        this.io = require("socket.io")(this.server, {
            cors: {
                origin: ["http://localhost:8000", "https://mindwork-ai-3e6b47d54f8a.herokuapp.com"],
                credentials: true,
            },
        });

        this.start();
        return this.server;
    }
    async start() {
        this.connectDatabase();
        this.socketService(this.io);
        this.initSessions();
        this.initCache();
        this.initMiddleware();
        this.forceSecure();
        // this.insertHelpers();
        this.cronManager = new CronManager(this.io);
        this.publicRoot = path.join("public");
        this.express.use(express.static(this.publicRoot));
        this.initPublicRoutes();
        this.initPrivateRoutes();
        this.express.use("/home", (req, res) => {
            res.sendFile("index.html", { root: this.publicRoot });
        });
        this.initErrorRoute(); // Move error route handler here
        this.initErrorHandler(); // Move error handler here
    }

    // socket service
    async socketService(io) {
        io.on("connection", (socket) => {
            console.log("Socket Connected");

            // monitor approval or denial of email request by admin
            EmailModel.watch().on("change", async (data) => {
                const userRequest = await EmailModel.findById(
                    data.documentKey._id
                );
                socket.emit("email-request", userRequest);
            });

            // monitor approval or denial of social request by admin
            SocialModel.watch().on("change", async (data) => {
                const userRequest = await SocialModel.findById(
                    data.documentKey._id
                );
                socket.emit("social-request", userRequest);
            });

            // monitor approval or denial of wallet request by admin
            WalletModel.watch().on("change", async (data) => {
                const userRequest = await WalletModel.findById(
                    data.documentKey._id
                );
                socket.emit("wallet-request", userRequest);
            });

            socket.on("disconnect", () => {
                console.log("Socket Disconnected!");
            });
        });

        // admin ui
        instrument(io, {
            auth: false,
            mode: "development",
        });
    }

    async connectDatabase() {
        await mongoose
            .connect(process.env.MONGO_URL, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                // autoIndex: true,
            })
            .then(() => console.log("connected to DB"))
            .catch((err) => console.log("ERROR: ", err));
        const db = mongoose.connection;
        db.on("error", console.error.bind(console, "connection error:"));
        db.once("open", () => {
            console.log("DB has been connected");
        });
    }
    initSessions() {
        const opts = {};
        if (process.env.PRODUCTION == "true") {
            opts.cookie = {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 1000 * 60 * 60 * 48,
            };
        } else {
            opts.cookie = {
                maxAge: 1000 * 60 * 60 * 48,
            };
        }
        this.express.use(
            session({
                ...opts,
                saveUninitialized: false,
                resave: true,
                name: "solaritySession",
                secret: process.env.SESSION_SECRET,
                store: MongoStore.create({
                    mongoUrl: process.env.MONGO_URL,
                }),
            })
        );
    }
    initPublicRoutes() {
        // put here the public routes

        // Routes for login request using social & wallet requests
        this.express.use("/api/social-request", socialRoutes);
        this.express.use("/api/wallet-request", walletRoutes);
        this.express.use("/api/email-request", emailRoutes);

        this.express.use("/home", (req, res, next) => {
            res.send({ message: "Not Found" });
            next();
        });
    }
    initPrivateRoutes() {
        // put here the private routes
        console.log("> Starting private routes");
        this.express.use("/api/admin", adminRoutes);
        // this.express.use("/api/profile", profileModule);

        this.express.use("/api/*", (req, res, next) => {
            const err = new Error("Not Found");
            err.status = 404;
            next(err);
        });
    }
    initMiddleware() {
        // middleware initialization
        this.express.use(helmet());
        this.express.set("trust proxy", 1);
        const corsOptions = {
            origin: true,
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            credentials: true, //access-control-allow-credentials:true
            optionSuccessStatus: 200,
        };
        this.express.use(cors(corsOptions));

        this.express.use(express.json());
        this.express.use(express.urlencoded({ extended: false }));
        this.express.use(cookieParser());
    }
    forceSecure() {
        // force to https on production
        this.express.enable("trust proxy");
        this.express.use((req, res, next) => {
            if (process.env.NODE_ENV == "production" && !req.secure) {
                return res.redirect("https://" + req.headers.host + req.url);
            }
            next();
        });
    }
    initCache() {
        const registerNonceCache = new NodeCache({
            useClones: false,
            stdTTL: 3600,
        });
        this.express.set("registerNonceCache", registerNonceCache);
    }
    initErrorRoute() {
        this.express.use((req, res, next) => {
            const err = new Error("Not Found");
            err.status = 404;
            next(err);
        });
        this.express.use((err, req, res, next) => {
            res.status(err.status || 500);
            res.locals.error = err;
            res.locals.errorDescription = err.message;
            if (global.rollbar) {
                global.rollbar.error(err);
            }
            return res.send("ERROR: NOT FOUND");
        });
    }
    initErrorHandler() {
        this.express.use(async (err, req, res, next) => {
            return next(err);
        });
    }
    insertHelpers() {
        this.express.use((req, res, next) => {
            req.profile = async () => getProfileData(req);
            req.solanaConnection = new Connection(
                clusterApiUrl("mainnet-beta")
            );
            next();
        });
    }
}

export default Server;
